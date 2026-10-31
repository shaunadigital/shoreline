import * as THREE from 'three';
import { heightAt, groundColor, grassColor, GROUND, TERRAIN_GRASS } from './terrain.js';
import { landSD, trackDist, pathDist, onBridge, TRACK_W, CURB_W, PATH_W } from './plan.js';
import { HUT, GOLF, LIGHTHOUSE, CHEST, RAMPS, CRATES, FRUIT_CART, BOWLING, SOCCER, BEACH_BALLS, START_WORD } from './layout.js';
import { WIND, WIND_GLSL, setWindTime } from './wind.js';
import { Tracks, TRACKS_GLSL } from './tracks.js';
import { shade, setGroundTexture } from './shading.js';

// Grass that follows the camera: one patch of single-triangle blades around the view. Blades that drop off
// the back of the patch wrap round to the front, so it is always dense wherever you drive.
// The grass grows in patches with bare sand and earth between them (Shauna's call, after the reference's
// layout): soft blobs from smooth noise, plus patches gathered round the trees and bushes. Each patch rises
// from nothing at its edge to about the car's roof in the middle, so it has a soft rounded outline, and its
// blades lean outward from its middle. Play surfaces, paths, the road, the sand and prop footprints stay clear.
// Where grass grows, how tall it is and the ground height come from small maps of the island baked at load.
// Blades turn to face the camera, sway in the island's wind, are dark at the root and bright at the tip,
// vary a little in color and are flattened by the tires (tracks.js).

const EXT = 92; // the maps cover [-EXT, EXT] on both axes
const RES = 0.5; // map texel size in game units
const N = Math.round((EXT * 2) / RES) + 1;
const HW = TRACK_W / 2 + CURB_W;
const BLADE_W = 0.12; // half width at the root: thin blades packed close, like the reference (2026-10-30)
const BLADE_H = 0.9; // the shader draws a patch's middle at 1.4 times this (about 1.25, just under the car's windows)
const SPACING = 0.22; // a blade every 0.22 units: many thin blades rather than a few wide ones
// Patches from noise: how much of the open ground they cover (higher = fewer, smaller patches)
export const PATCH = { low: 0.42, high: 0.5, fade: 0.7 }; // about 40% of the open ground, plus the patches round plants; a short ramp gives patches a fairly clean edge

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Smooth value noise, about 0 to 1
function hash(i, j) {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}
const patchNoise = (x, z) => vnoise(x / 9 + 3.1, z / 9 - 7.4) * 0.7 + vnoise(x / 3.6 - 11.2, z / 3.6 + 5.3) * 0.3;

// Spots with no grass at all (prop footprints): [x, z, radius]
const BARE = [
  [HUT[0], HUT[1], 4.7], [GOLF.green[0], GOLF.green[1], 3.7], [GOLF.tee[0], GOLF.tee[1], 1.1],
  [LIGHTHOUSE[0], LIGHTHOUSE[1], 2.8], [CHEST[0], CHEST[1], 1.7], [CRATES[0], CRATES[1], 1.5], [FRUIT_CART[0], FRUIT_CART[1], 1.7],
  ...RAMPS.map(([x, z]) => [x, z, 2.2]),
  [START_WORD[0], START_WORD[1], 3.4], // the opening's "Start" in the sand
];

function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// Plants bucketed into 8-unit cells, so each map texel only checks the plants close to it (the bake was
// checking every plant on the island for every texel)
const PCELL = 8, buckets = new WeakMap();
function plantsNear(plants, x, z) {
  let grid = buckets.get(plants);
  if (!grid) {
    grid = new Map();
    for (const p of plants) {
      const reach = p[2] * 2.2;
      for (let i = Math.floor((p[0] - reach) / PCELL); i <= Math.floor((p[0] + reach) / PCELL); i++)
        for (let j = Math.floor((p[1] - reach) / PCELL); j <= Math.floor((p[1] + reach) / PCELL); j++) {
          const k = i * 1000 + j;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(p);
        }
    }
    buckets.set(plants, grid);
  }
  return grid.get(Math.floor(x / PCELL) * 1000 + Math.floor(z / PCELL)) || [];
}

// How tall the grass is here, 0 (none) to 1 (the middle of a patch)
export function grassHeight(x, z, y, plants) {
  if (y < -0.2 || onBridge(x, z, 0.5)) return 0;
  if (y > GROUND + 0.25 && Math.hypot(x - CHEST[0], z - CHEST[1]) < 6.5) return 0; // bare crater rim
  const sd = landSD(x, z), td = trackDist(x, z);
  // Room: how far inside the ground grass may use, away from sand, road, paths, props and play surfaces
  let e = Math.min(sd - 4.2, td - HW - 0.3, pathDist(x, z) - PATH_W / 2 - 0.2);
  for (const [bx, bz, r] of BARE) e = Math.min(e, Math.hypot(x - bx, z - bz) - r);
  e = Math.min(e, Math.max(Math.abs(x - BOWLING.x) - 10.5, Math.abs(z - BOWLING.z) - 3.5)); // bowling lane and apron
  const { x: sx, z: sz, angle, length, width } = SOCCER;
  const along = Math.abs((x - sx) * Math.cos(angle) + (z - sz) * Math.sin(angle)) - (length / 2 + 1.5);
  const across = Math.abs(-(x - sx) * Math.sin(angle) + (z - sz) * Math.cos(angle)) - (width / 2 + 1.5);
  e = Math.min(e, Math.max(along, across), segDist(x, z, GOLF.green, GOLF.tee) - 4);
  for (const [bx, bz] of BEACH_BALLS) e = Math.min(e, Math.hypot(x - bx, z - bz) - 2.5);
  if (e <= 0) return 0;
  // Patches: noise blobs, and a patch round each tree and bush
  let p = smooth(PATCH.low, PATCH.high, patchNoise(x, z));
  for (const [px, pz, r] of plantsNear(plants, x, z)) {
    const d = Math.hypot(x - px, z - pz);
    if (d < r * 2.2) p = Math.max(p, 1 - smooth(r * 1.5, r * 2.1, d));
  }
  // Fade out toward the edges of the room, so patches never end in a wall
  p *= smooth(0, PATCH.fade, e);
  return p < 0.04 ? 0 : p;
}

function dataTexture(data, format = THREE.RGBAFormat) {
  const tex = new THREE.DataTexture(data, N, N, format);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class Grass {
  // plants: [x, z, radius] of trees and bushes (each gathers a grass patch round it)
  constructor(scene, renderer, { small = false, plants = [] } = {}) {
    this.scene = scene;
    this.plants = plants;
    this.tracks = new Tracks(renderer);
    this.size = 40;
    this.subdivisions = small ? 240 : 330; // 330 x 330 blades, three triangles each (about 327,000 triangles; 173,000 on small screens)
    this.bakeMaps();
    this.buildMesh();
  }

  // Ground color (also used for the light bounced off the ground), and grass presence, ground height and grass height
  bakeMaps() {
    const ground = new Uint8Array(N * N * 4), grass = new Uint8Array(N * N * 4);
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) {
      const z = -EXT + j * RES;
      for (let i = 0; i < N; i++) {
        const x = -EXT + i * RES, k = (j * N + i) * 4;
        const y = heightAt(x, z);
        const h = grassHeight(x, z, y, this.plants);
        if (h > 0) grassColor(x, z, c); // blades take the grass color
        else groundColor(x, z, y, c);
        if (trackDist(x, z) < HW && landSD(x, z) > -2) c.set('#3a4149');
        else if (pathDist(x, z) < PATH_W / 2 && landSD(x, z) > 0.3) c.set('#e2c48c');
        ground[k] = c.r * 255; ground[k + 1] = c.g * 255; ground[k + 2] = c.b * 255; ground[k + 3] = 255;
        grass[k] = h > 0 ? 255 : 0;
        grass[k + 1] = Math.round(Math.min(1, Math.max(0, (y + 0.5) / 3.5)) * 255);
        grass[k + 2] = Math.round(h * 255);
        grass[k + 3] = 255;
      }
    }
    this.groundTex = dataTexture(ground);
    this.grassTex = dataTexture(grass);
    TERRAIN_GRASS.uGrassMap.value = this.grassTex;
    TERRAIN_GRASS.uGrassExt.value = EXT;
    setGroundTexture(this.groundTex, EXT, this.grassTex);
  }

  // Size the patch to what the camera sees (radius of the ground in view). On big or tall screens the patch
  // grows, and the blades get a little wider with it so it still reads as dense (never taller).
  fit(radius) {
    const base = this.subdivisions * SPACING;
    this.size = Math.max(base, radius * 2);
    const grow = this.size / base; // bigger views spread the same blades wider, so each one grows a little
    this.uniforms.uSize.value = this.size;
    this.uniforms.uBladeW.value = BLADE_W * (1 + (grow - 1) * 0.6);
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.bladeGeometry();
  }

  // Each blade is three triangles: a wide root, a narrower middle and a pointed tip, so the shader can bend
  // it into a soft curve. Every vertex stores the blade's root (x, random, z) and its place on the blade
  // (how far up, 0 to 1, and which side, -1 to 1); the shader shapes the rest.
  bladeGeometry() {
    const n = this.subdivisions, cell = this.size / n;
    const MID = 0.55;
    const corners = [[0, -1], [0, 1], [MID, -1], [0, 1], [MID, 1], [MID, -1], [MID, -1], [MID, 1], [1, 0]];
    const pos = new Float32Array(n * n * 27), bp = new Float32Array(n * n * 18);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const x = (a / n - 0.5) * this.size + (Math.random() + 0.5) * cell * 0.5 + cell * 0.25;
        const z = (b / n - 0.5) * this.size + (Math.random() + 0.5) * cell * 0.5 + cell * 0.25;
        const r = Math.random(), k = a * n + b;
        corners.forEach(([t, side], v) => { pos.set([x, r, z], (k * 9 + v) * 3); bp.set([t, side], (k * 9 + v) * 2); });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('bladePos', new THREE.BufferAttribute(bp, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return geo;
  }

  buildMesh() {
    const geo = this.bladeGeometry();

    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uSize: { value: this.size },
      uTime: { value: 0 },
      uGrassData: { value: this.grassTex },
      uExt: { value: EXT },
      uBladeW: { value: BLADE_W },
      uBladeH: { value: BLADE_H },
      uWindStrength: { value: 0.22 },
      uBlast: { value: new THREE.Vector4() }, // x, z, radius, strength: explosions blow the grass flat outward (fx.js)
      ...WIND,
      ...this.tracks.uniforms,
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.userData.noAO = true; // ground level: no contact shading, and never a raycast target
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uCenter; uniform float uSize; uniform float uTime; uniform float uExt;
          uniform sampler2D uGrassData;
          uniform float uBladeW; uniform float uBladeH; uniform float uWindStrength; uniform vec4 uBlast;
          ${WIND_GLSL}
          ${TRACKS_GLSL}
          attribute vec2 bladePos;
          varying float vShadeExtra;
          varying float vTip; varying float vRand;
          varying vec3 vGroundColor;
          uniform sampler2D uGround;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );') // lit as the ground is
        .replace('#include <begin_vertex>', `
          vec2 rel = position.xz - uCenter;
          rel = mod( rel + uSize * 0.5, uSize ) - uSize * 0.5;
          vec2 wp = uCenter + rel;
          vec2 duv = ( wp + uExt ) / ( 2.0 * uExt );
          vec4 gd = texture2D( uGrassData, duv );
          float m = 1.0 - smoothstep( uSize * 0.46, uSize * 0.5, max( abs( rel.x ), abs( rel.y ) ) ); // fade at the very edge of the patch
          float groundY = gd.g * 3.5 - 0.5;
          float area = gd.b; // 0 outside patches, 1 in their middles
          // Which way is out of the patch (downhill on the height map): edge blades lean that way
          float e = 1.0 / ( 2.0 * uExt );
          vec2 grad = vec2( texture2D( uGrassData, duv + vec2( e, 0.0 ) ).b - texture2D( uGrassData, duv - vec2( e, 0.0 ) ).b,
                            texture2D( uGrassData, duv + vec2( 0.0, e ) ).b - texture2D( uGrassData, duv - vec2( 0.0, e ) ).b );
          float tuft = 0.8 + 0.4 * texture2D( uWindNoise, wp * 0.11 ).r;
          float h = uBladeH * 1.4 * ( 0.45 + 0.55 * smoothstep( 0.0, 0.6, area ) ) * step( 0.02, area ) * tuft * ( 0.75 + 0.25 * position.y ) * m;
          h *= 1.0 - 0.85 * trackAt( wp ); // flattened by the tires
          float t = bladePos.x, side = bladePos.y; // how far up the blade, which side
          vec2 toCam = normalize( wp - cameraPosition.xz + vec2( 1e-4 ) );
          vec3 transformed = vec3( wp.x, groundY - 0.02, wp.y );
          // Width tapers from the root to a soft point
          float w = uBladeW * step( 0.001, h ) * ( 0.7 + 0.3 * smoothstep( 0.0, 0.5, area ) ) * pow( 1.0 - t, 0.85 ); // tapers steadily to a point
          transformed.xz += vec2( -toCam.y, toCam.x ) * side * w;
          // Curve: each blade bends over, outward from the patch's middle plus its own random direction,
          // more toward the tip (t squared), and droops a little as it bends
          float ra = fract( position.y * 13.7 ) * 6.2832;
          vec2 lean = -grad * 4.0 + vec2( cos( ra ), sin( ra ) ) * ( 0.35 + 0.35 * fract( position.y * 29.3 ) );
          float bend = min( length( lean ), 0.8 );
          transformed.y += h * t * ( 1.0 - 0.42 * t * bend );
          transformed.xz += lean * h * 0.35 * t * t; // mostly upright, a gentle lean
          transformed.xz += uWindDir * windGust( wp ) * uWindStrength * h * 2.0 * t * t;
          {
            vec2 bd = wp - uBlast.xy; float bl = length( bd ) + 1e-3;
            float push = uBlast.w * ( 1.0 - smoothstep( 0.0, uBlast.z, bl ) );
            transformed.xz += bd / bl * push * h * 1.6 * t * t;
            transformed.y -= push * h * 0.5 * t * t;
          }
          vTip = t; vRand = fract( position.y * 7.31 );
          vShadeExtra = pow( 1.0 - t, 1.6 ); // shaded at the root, easing softly into the sunlit tip
          vGroundColor = texture2D( uGround, duv ).rgb;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundColor;\nvarying float vTip; varying float vRand;')
        // Both faces of a blade keep the upward normal (no flip for the back face, which would put it in shadow)
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
        // Each blade a little lighter or darker, tips brighter and a touch more golden
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          vec3 bladeColor = vGroundColor * ( 0.88 + 0.24 * vRand );
          // Olive green most of the way up, golden only toward the tip (like the reference)
          vec3 root = bladeColor * vec3( 0.55, 0.62, 0.5 );
          vec3 body = bladeColor;
          vec3 tip = mix( bladeColor * 1.2, vec3( 0.93, 0.8, 0.4 ), 0.55 );
          bladeColor = mix( root, body, smoothstep( 0.0, 0.45, vTip ) );
          bladeColor = mix( bladeColor, tip, smoothstep( 0.55, 1.0, vTip ) );
          vec4 diffuseColor = vec4( bladeColor, opacity );`);
    };
    shade(mat, { extra: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  // center: the point the patch is centred on (a little ahead of the car, toward where the camera looks)
  update(dt, time, center, carPos, wheels, grounded) {
    this.uniforms.uCenter.value.set(center.x, center.z);
    this.uniforms.uTime.value = time;
    setWindTime(time);
    this.tracks.update(dt, carPos, wheels || [], grounded);
  }
}
