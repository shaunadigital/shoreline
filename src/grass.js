import * as THREE from 'three';
import { heightAt, groundColor, GROUND } from './terrain.js';
import { landSD, trackDist, pathDist, onBridge, TRACK_W, CURB_W, PATH_W } from './plan.js';
import { HUT, GOLF, LIGHTHOUSE, CHEST, RAMPS, CRATES, FRUIT_CART, BOWLING } from './layout.js';
import { shade, setGroundTexture } from './shading.js';

// Grass that follows the camera: one patch of single-triangle blades around the view. Blades that drop off
// the back of the patch wrap round to the front, so it is always dense wherever you drive.
// Where grass grows, how tall it is and its color come from small maps of the island baked at load.
// Blades turn to face the camera, sway in rolling gusts, darken toward the root and get flattened by the tires.

const EXT = 92; // the maps cover [-EXT, EXT] on both axes
const RES = 0.5; // map texel size in game units
const N = Math.round((EXT * 2) / RES) + 1;
const HW = TRACK_W / 2 + CURB_W;
// Blade size and spacing as they end up on the reference's screen, scaled to our car. Its code starts at
// 0.1 half width and 0.6 tall, then grows them for the area its camera covers (about 1.1 tall, 0.19 half
// width, a blade every 0.29 units), so those effective numbers are what we match.
const CAR = 2.85 / 3.25;
const BLADE_W = 0.19 * CAR;
const BLADE_H = 1.55 * CAR; // taller than first measured: side by side, the blades reach about two thirds up the car
const SPACING = 0.29 * CAR;


// Spots with no grass at all: [x, z, radius]
const BARE = [
  [HUT[0], HUT[1], 3.8], [GOLF.green[0], GOLF.green[1], 4.3], [GOLF.tee[0], GOLF.tee[1], 1.4],
  [LIGHTHOUSE[0], LIGHTHOUSE[1], 3.4], [CHEST[0], CHEST[1], 2.2], [CRATES[0], CRATES[1], 2], [FRUIT_CART[0], FRUIT_CART[1], 2.2],
  ...RAMPS.map(([x, z]) => [x, z, 2.6]),
];

function grassAmount(x, z, y) {
  // Grass covers the whole green ground right up to its edges: the sand (landSD 4.2, where the ground turns sandy), the road and the paths
  let m = landSD(x, z) >= 4.2 && trackDist(x, z) > HW + 0.1 && pathDist(x, z) > PATH_W / 2 ? 1 : 0;
  if (m <= 0 || onBridge(x, z, 0.5)) return 0;
  for (const [bx, bz, r] of BARE) if (Math.hypot(x - bx, z - bz) < r) return 0;
  if (Math.abs(x - BOWLING.x) < 9 && Math.abs(z - BOWLING.z) < 2.2) return 0;
  if (y > GROUND + 0.3 && Math.hypot(x - CHEST[0], z - CHEST[1]) < 6.5) return 0; // bare crater rim
  return m;
}

// Tileable smooth noise, for blade heights and the wind
function noiseTexture(size = 128) {
  const grid = 16, g = Array.from({ length: grid * grid }, () => Math.random());
  const at = (i, j) => g[((j + grid) % grid) * grid + ((i + grid) % grid)];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * grid, fy = (y / size) * grid, i = Math.floor(fx), j = Math.floor(fy);
      const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const n = (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(n * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function dataTexture(data, format = THREE.RGBAFormat) {
  const tex = new THREE.DataTexture(data, N, N, format);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class Grass {
  constructor(scene, { small = false } = {}) {
    this.scene = scene;
    this.size = 40;
    this.subdivisions = small ? 240 : 280; // as in the reference: 280 x 280 blades
    this.bakeMaps();
    this.buildMesh();
    this.stampTimer = 0;
    this.decayTimer = 0;
  }

  // Ground color (also used for the light bounced off the ground), grass amount and height, and tire tracks
  bakeMaps() {
    const ground = new Uint8Array(N * N * 4), grass = new Uint8Array(N * N * 4);
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) {
      const z = -EXT + j * RES;
      for (let i = 0; i < N; i++) {
        const x = -EXT + i * RES, k = (j * N + i) * 4;
        const y = heightAt(x, z);
        groundColor(x, z, y, c);
        if (trackDist(x, z) < HW && landSD(x, z) > -2) c.set('#3a4149');
        else if (pathDist(x, z) < PATH_W / 2 && landSD(x, z) > 0.3) c.set('#e2c48c');
        ground[k] = c.r * 255; ground[k + 1] = c.g * 255; ground[k + 2] = c.b * 255; ground[k + 3] = 255;
        grass[k] = Math.round(grassAmount(x, z, y) * 255);
        grass[k + 1] = Math.round(Math.min(1, Math.max(0, (y + 0.5) / 3.5)) * 255);
        grass[k + 3] = 255;
      }
    }
    this.groundTex = dataTexture(ground);
    this.grassTex = dataTexture(grass);
    this.tracks = new Uint8Array(N * N);
    this.tracksTex = dataTexture(this.tracks, THREE.RedFormat);
    setGroundTexture(this.groundTex, EXT);
  }

  // Size the patch to what the camera sees (radius of the ground in view). On big or tall screens the patch
  // grows, and the blades grow a little with it so it still reads as dense (as the reference does).
  fit(radius) {
    const base = this.subdivisions * SPACING;
    this.size = Math.max(base, radius * 2);
    const grow = this.size / base; // bigger views spread the same blades wider, so each one grows a little
    this.uniforms.uSize.value = this.size;
    this.uniforms.uBladeW.value = BLADE_W * (1 + (grow - 1) * 0.6);
    this.uniforms.uBladeH.value = BLADE_H * (1 + (grow - 1) * 0.6);
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
      uTracks: { value: this.tracksTex },
      uNoise: { value: noiseTexture() },
      uExt: { value: EXT },
      uBladeW: { value: BLADE_W },
      uBladeH: { value: BLADE_H },
      uWindDir: { value: new THREE.Vector2(Math.sin(2), Math.cos(2)) },
      uWindStrength: { value: 0.55 },
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uCenter; uniform float uSize; uniform float uTime; uniform float uExt;
          uniform sampler2D uGrassData; uniform sampler2D uTracks; uniform sampler2D uNoise;
          uniform float uBladeW; uniform float uBladeH; uniform vec2 uWindDir; uniform float uWindStrength;
          varying float vShadeExtra;
          varying vec3 vGroundColor;
          uniform sampler2D uGround;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );') // lit as the ground is
        .replace('#include <begin_vertex>', `
          vec2 rel = position.xz - uCenter;
          rel = mod( rel + uSize * 0.5, uSize ) - uSize * 0.5;
          vec2 wp = uCenter + rel;
          vec2 duv = ( wp + uExt ) / ( 2.0 * uExt );
          vec4 gd = texture2D( uGrassData, duv );
          float m = step( 0.5, gd.r ) * ( 1.0 - texture2D( uTracks, duv ).r ); // full height right to the edge
          m *= 1.0 - smoothstep( uSize * 0.46, uSize * 0.5, max( abs( rel.x ), abs( rel.y ) ) ); // fade at the very edge
          float groundY = gd.g * 3.5 - 0.5;
          float h = uBladeH * 1.4 * ( 0.88 + 0.12 * position.y ) * m; // all as long as the tallest blades, a touch of variety
          int vi = gl_VertexID % 3;
          float tip = vi == 0 ? 1.0 : 0.0;
          float side = vi == 1 ? 1.0 : ( vi == 2 ? -1.0 : 0.0 );
          vec2 toCam = normalize( wp - cameraPosition.xz + vec2( 1e-4 ) );
          vec3 transformed = vec3( wp.x, groundY - 0.02, wp.y );
          transformed.xz += vec2( -toCam.y, toCam.x ) * side * uBladeW * m;
          transformed.y += tip * h;
          float n1 = texture2D( uNoise, wp * 0.05 + uWindDir * uTime * 0.05 ).r - 0.5;
          float n2 = texture2D( uNoise, wp * 0.02 + uWindDir * uTime * 0.012 ).r - 0.5;
          transformed.xz += uWindDir * ( n1 + n2 ) * uWindStrength * tip * h * 2.0;
          vShadeExtra = 1.0 - tip; // fully in shade at the root, sunlit at the tip
          vGroundColor = texture2D( uGround, duv ).rgb;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundColor;')
        // Both faces of a blade keep the upward normal (no flip for the back face, which would put it in shadow)
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vGroundColor, opacity );');
    };
    shade(mat, { extra: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  // center: the point the patch is centred on (a little ahead of the car, toward where the camera looks)
  update(dt, time, center, wheels, grounded) {
    this.uniforms.uCenter.value.set(center.x, center.z);
    this.uniforms.uTime.value = time;
    // Tire tracks flatten the grass, which grows back over about a minute
    let dirty = false;
    if (grounded && wheels) {
      for (const w of wheels) {
        const ci = Math.round((w.position.x + EXT) / RES), cj = Math.round((w.position.z + EXT) / RES);
        for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const k = j * N + i, v = i === ci && j === cj ? 230 : 150;
          if (this.tracks[k] < v) { this.tracks[k] = v; dirty = true; }
        }
      }
    }
    this.decayTimer += dt;
    if (this.decayTimer > 0.5) {
      this.decayTimer = 0;
      const t = this.tracks;
      for (let k = 0; k < t.length; k++) if (t[k]) { t[k] = t[k] > 2 ? t[k] - 2 : 0; dirty = true; }
    }
    if (dirty) this.tracksTex.needsUpdate = true;
  }
}
