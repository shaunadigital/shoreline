import * as THREE from 'three';
import { heightAt, groundColor, grassColor, GROUND, TERRAIN_GRASS } from './terrain.js';
import { landSD, trackDist, pathDist, onBridge, TRACK_W, CURB_W, PATH_W } from './plan.js';
import { HUT, GOLF, LIGHTHOUSE, CHEST, RAMPS, CRATES, FRUIT_CART, BOWLING, SOCCER, BEACH_BALLS } from './layout.js';
import { WIND, WIND_GLSL, setWindTime } from './wind.js';
import { Tracks, TRACKS_GLSL } from './tracks.js';
import { shade, setGroundTexture } from './shading.js';

// Grass that follows the camera: one patch of single-triangle blades around the view. Blades that drop off
// the back of the patch wrap round to the front, so it is always dense wherever you drive.
// Where grass grows, how tall it is and the ground height come from small maps of the island baked at load.
// Height varies by area: tufts in open fields, shorter toward paths, curbs and sand so it never ends in a
// wall, and short on play surfaces (soccer pitch, golf, bowling apron, beach balls) so they stay readable.
// Blades turn to face the camera, sway in the island's wind, darken toward the root, vary a little in color
// and are flattened by the tires (tracks.js).

const EXT = 92; // the maps cover [-EXT, EXT] on both axes
const RES = 0.5; // map texel size in game units
const N = Math.round((EXT * 2) / RES) + 1;
const HW = TRACK_W / 2 + CURB_W;
const BLADE_W = 0.12; // half width
const BLADE_H = 0.72; // the shader draws open-field blades at 1.4 times this (about 1, half the car), tufts up to about 1.4
const SPACING = 0.29 * (2.85 / 3.25);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Spots with no grass at all (prop footprints): [x, z, radius]
const BARE = [
  [HUT[0], HUT[1], 3.2], [GOLF.green[0], GOLF.green[1], 3.7], [GOLF.tee[0], GOLF.tee[1], 1.1],
  [LIGHTHOUSE[0], LIGHTHOUSE[1], 2.8], [CHEST[0], CHEST[1], 1.7], [CRATES[0], CRATES[1], 1.5], [FRUIT_CART[0], FRUIT_CART[1], 1.7],
  ...RAMPS.map(([x, z]) => [x, z, 2.2]),
];
const SHORT = 0.25; // height factor on play surfaces

function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// Whether grass grows here: everywhere the ground is green (the same test as groundColor in terrain.js,
// reaching a little onto the sand so it covers the whole green triangles), off the road, paths and props
function grassAmount(x, z, y) {
  if (y < -0.2) return 0;
  const sd = landSD(x, z), td = trackDist(x, z);
  if (!(sd >= 3.7 || td <= HW + 1.5) || td <= HW + 0.05 || pathDist(x, z) <= PATH_W / 2 || onBridge(x, z, 0.5)) return 0;
  for (const [bx, bz, r] of BARE) if (Math.hypot(x - bx, z - bz) < r) return 0;
  if (Math.abs(x - BOWLING.x) < 9 && Math.abs(z - BOWLING.z) < 2.2) return 0;
  if (y > GROUND + 0.25 && Math.hypot(x - CHEST[0], z - CHEST[1]) < 6.5) return 0; // bare crater rim
  return 1;
}

// How tall the grass is here, 0 to 1 (1 = open field, before tufts)
function grassHeight(x, z) {
  const sd = landSD(x, z), td = trackDist(x, z);
  let e = Math.min(td - HW, pathDist(x, z) - PATH_W / 2);
  if (td > HW + 1.5) e = Math.min(e, sd - 3.9);
  for (const [bx, bz, r] of BARE) e = Math.min(e, Math.hypot(x - bx, z - bz) - r);
  e = Math.min(e, Math.max(Math.abs(x - BOWLING.x) - 9, Math.abs(z - BOWLING.z) - 2.2));
  let f = 0.4 + 0.6 * smooth(0, 2.5, e); // shrinks into every edge
  // Play surfaces stay short
  const { x: sx, z: sz, angle, length, width } = SOCCER;
  const along = Math.abs((x - sx) * Math.cos(angle) + (z - sz) * Math.sin(angle)) - (length / 2 + 1.2);
  const across = Math.abs(-(x - sx) * Math.sin(angle) + (z - sz) * Math.cos(angle)) - (width / 2 + 1.2);
  const play = [
    Math.max(along, across), // soccer pitch
    segDist(x, z, GOLF.green, GOLF.tee) - 3.5, // golf
    Math.max(Math.abs(x - BOWLING.x) - 11, Math.abs(z - BOWLING.z) - 4), // bowling apron
    ...BEACH_BALLS.map(([bx, bz]) => Math.hypot(x - bx, z - bz) - 2), // beach balls
  ];
  for (const d of play) f = Math.min(f, SHORT + (1 - SHORT) * smooth(0, 2, d));
  return f;
}

function dataTexture(data, format = THREE.RGBAFormat) {
  const tex = new THREE.DataTexture(data, N, N, format);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class Grass {
  constructor(scene, renderer, { small = false } = {}) {
    this.scene = scene;
    this.tracks = new Tracks(renderer);
    this.size = 40;
    this.subdivisions = small ? 240 : 280; // as in the reference: 280 x 280 blades
    this.bakeMaps();
    this.buildMesh();
  }

  // Ground color (also used for the light bounced off the ground), and grass amount, ground height and grass height
  bakeMaps() {
    const ground = new Uint8Array(N * N * 4), grass = new Uint8Array(N * N * 4);
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) {
      const z = -EXT + j * RES;
      for (let i = 0; i < N; i++) {
        const x = -EXT + i * RES, k = (j * N + i) * 4;
        const y = heightAt(x, z);
        const g = grassAmount(x, z, y);
        if (g) grassColor(x, z, c); // blades take the grass color, even where they reach onto the sand
        else groundColor(x, z, y, c);
        if (trackDist(x, z) < HW && landSD(x, z) > -2) c.set('#3a4149');
        else if (pathDist(x, z) < PATH_W / 2 && landSD(x, z) > 0.3) c.set('#e2c48c');
        ground[k] = c.r * 255; ground[k + 1] = c.g * 255; ground[k + 2] = c.b * 255; ground[k + 3] = 255;
        grass[k] = g * 255;
        grass[k + 1] = Math.round(Math.min(1, Math.max(0, (y + 0.5) / 3.5)) * 255);
        grass[k + 2] = g ? Math.round(grassHeight(x, z) * 255) : 0;
        grass[k + 3] = 255;
      }
    }
    this.groundTex = dataTexture(ground);
    this.grassTex = dataTexture(grass);
    TERRAIN_GRASS.uGrassMap.value = this.grassTex;
    TERRAIN_GRASS.uGrassExt.value = EXT;
    setGroundTexture(this.groundTex, EXT);
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

  bladeGeometry() {
    const n = this.subdivisions, cell = this.size / n;
    const pos = new Float32Array(n * n * 9);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const x = (a / n - 0.5) * this.size + (Math.random() + 0.5) * cell * 0.5 + cell * 0.25;
        const z = (b / n - 0.5) * this.size + (Math.random() + 0.5) * cell * 0.5 + cell * 0.25;
        const r = Math.random(), k = (a * n + b) * 9;
        // Three corners at the blade's root; the shader shapes them. y carries a random height factor.
        for (let v = 0; v < 3; v++) pos.set([x, r, z], k + v * 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
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
      ...WIND,
      ...this.tracks.uniforms,
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uCenter; uniform float uSize; uniform float uTime; uniform float uExt;
          uniform sampler2D uGrassData;
          uniform float uBladeW; uniform float uBladeH; uniform float uWindStrength;
          ${WIND_GLSL}
          ${TRACKS_GLSL}
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
          float m = smoothstep( 0.25, 0.75, gd.r ); // grass amount, soft at the edges
          m *= 1.0 - smoothstep( uSize * 0.46, uSize * 0.5, max( abs( rel.x ), abs( rel.y ) ) ); // fade at the very edge of the patch
          float groundY = gd.g * 3.5 - 0.5;
          float area = gd.b; // 1 in open fields, lower toward edges and on play surfaces
          float tuft = mix( 1.0, 0.72 + 0.65 * texture2D( uWindNoise, wp * 0.09 ).r, smoothstep( 0.55, 0.95, area ) ); // tufts in open fields
          float h = uBladeH * 1.4 * area * tuft * ( 0.82 + 0.18 * position.y ) * m;
          h *= 1.0 - 0.85 * trackAt( wp ); // flattened by the tires
          int vi = gl_VertexID % 3;
          float tip = vi == 0 ? 1.0 : 0.0;
          float side = vi == 1 ? 1.0 : ( vi == 2 ? -1.0 : 0.0 );
          vec2 toCam = normalize( wp - cameraPosition.xz + vec2( 1e-4 ) );
          vec3 transformed = vec3( wp.x, groundY - 0.02, wp.y );
          transformed.xz += vec2( -toCam.y, toCam.x ) * side * uBladeW * step( 0.001, h );
          transformed.y += tip * h;
          transformed.xz += uWindDir * windGust( wp ) * uWindStrength * tip * h * 2.0;
          vTip = tip; vRand = fract( position.y * 7.31 );
          vShadeExtra = 1.0 - tip; // fully in shade at the root, sunlit at the tip
          vGroundColor = texture2D( uGround, duv ).rgb;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundColor;\nvarying float vTip; varying float vRand;')
        // Both faces of a blade keep the upward normal (no flip for the back face, which would put it in shadow)
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
        // Each blade a little lighter or darker, tips brighter and a touch more golden
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          vec3 bladeColor = vGroundColor * ( 0.9 + 0.2 * vRand );
          bladeColor = mix( bladeColor, bladeColor * vec3( 1.2, 1.16, 0.92 ), vTip );
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
