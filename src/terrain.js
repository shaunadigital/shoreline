import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { COAST, WAIANAE, KOOLAU, CRATER } from './oahu-data.js';
import { LAYOUT_FLAT, SOCCER } from './layout.js';

export const SIZE = 200; // terrain square, centered on the origin
const SEG = 170;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- Signed distance to the coastline (positive on land) ----------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}
function insideCoast(px, pz) {
  let inside = false;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const [xi, zi] = COAST[i], [xj, zj] = COAST[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function exactSD(px, pz) {
  let best = Infinity;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    best = Math.min(best, segDist(px, pz, COAST[j][0], COAST[j][1], COAST[i][0], COAST[i][1]).d);
  }
  return insideCoast(px, pz) ? best : -best;
}

// Precomputed on a 1-unit grid and sampled bilinearly, so lookups are cheap.
export const SD_EXTENT = SIZE / 2 + 10;
const SD_RES = 1;
const SD_N = Math.round((SD_EXTENT * 2) / SD_RES) + 1;
const sdGrid = new Float32Array(SD_N * SD_N);
for (let j = 0; j < SD_N; j++) {
  for (let i = 0; i < SD_N; i++) sdGrid[j * SD_N + i] = exactSD(-SD_EXTENT + i * SD_RES, -SD_EXTENT + j * SD_RES);
}
export function coastDistance(x, z) {
  const fx = Math.min(SD_N - 1.001, Math.max(0, (x + SD_EXTENT) / SD_RES));
  const fz = Math.min(SD_N - 1.001, Math.max(0, (z + SD_EXTENT) / SD_RES));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = sdGrid[j * SD_N + i], b = sdGrid[j * SD_N + i + 1];
  const c = sdGrid[(j + 1) * SD_N + i], d = sdGrid[(j + 1) * SD_N + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// ---------- Mountains ----------
function ridge(line, x, z, height, width, seed) {
  let best = { d: Infinity, t: 0, k: 0 };
  for (let k = 0; k < line.length - 1; k++) {
    const r = segDist(x, z, line[k][0], line[k][1], line[k + 1][0], line[k + 1][1]);
    if (r.d < best.d) best = { d: r.d, t: (k + r.t) / (line.length - 1), k };
  }
  const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, best.t * 0.9 + 0.05))) ** 0.6;
  const fluting = 1 + 0.22 * Math.sin(best.t * 40 + seed) + 0.12 * Math.sin(best.t * 97 + seed * 2);
  return height * taper * fluting * Math.exp(-((best.d / width) ** 2));
}

// Flat zones for the spawn and mini games. [x, z, radius]
export const FLAT_ZONES = [
  [0, 0, 10],   // spawn
  [0, -9, 12],  // name letters
  [2, 13, 10],  // tiki bowling
  [-6, -22, 8], // north shore hut
  ...LAYOUT_FLAT, // golf, fruit cart, race gates (see layout.js)
];

const GROUND = 0.8;

// Height of the island at any point. Shared by visuals, physics and prop placement.
export function heightAt(x, z) {
  const sd = coastDistance(x, z);
  // Beach: rises from just under the water line to the plateau over ~8 units. Seabed drops off offshore.
  let h = sd >= 0 ? -0.1 + (GROUND + 0.1) * smooth(0, 8, sd) : Math.max(-4, -0.1 + sd * 0.45);
  const inner = smooth(5, 12, sd);
  h += (Math.sin(x * 0.09) * Math.cos(z * 0.08) * 0.35 + Math.sin(x * 0.21 + z * 0.13) * 0.12) * inner;
  h += ridge(WAIANAE, x, z, 6.5, 5.5, 1.3) * smooth(2, 9, sd);
  h += ridge(KOOLAU, x, z, 7.5, 4.5, 4.1) * smooth(2, 9, sd);
  // A small crater on the south-east point: a ring-shaped rim with a dip inside
  const dc = Math.hypot(x - CRATER[0], z - CRATER[1]);
  h += (2.6 * Math.exp(-(((dc - 4.2) / 1.6) ** 2)) - 0.6 * Math.exp(-((dc / 2.5) ** 2))) * smooth(-1, 3, sd);
  // Flatten the zones used by mini games and the spawn
  let f = 0;
  for (const [cx, cz, r] of FLAT_ZONES) f = Math.max(f, 1 - smooth(r, r + 6, Math.hypot(x - cx, z - cz)));
  // Soccer field: a rotated rectangle with room for the goals at each end
  {
    const dx = x - SOCCER.x, dz = z - SOCCER.z, ca = Math.cos(SOCCER.angle), sa = Math.sin(SOCCER.angle);
    const u = Math.abs(dx * ca + dz * sa) - (SOCCER.length / 2 + 4), v = Math.abs(-dx * sa + dz * ca) - (SOCCER.width / 2 + 2);
    f = Math.max(f, 1 - smooth(0, 6, Math.max(u, v, 0)));
  }
  f *= smooth(1, 4, sd); // never level the beach or the sea, only dry ground
  return THREE.MathUtils.lerp(h, GROUND, f);
}

const SAND = new THREE.Color('#f2d29b');
const WET = new THREE.Color('#d9b27a');
const GRASS = new THREE.Color('#7cc46a');
const GRASS2 = new THREE.Color('#4fa35c');
const FOREST = new THREE.Color('#3f8f4f');
const ROCK = new THREE.Color('#b98f6a');

export function buildTerrain(scene, world) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));

  // Physics: trimesh built from the exact same vertices
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos.array), new Uint32Array(geo.index.array)).setFriction(1.0));

  // Visuals: flat shaded, one color per triangle for the low poly look
  const flatGeo = geo.toNonIndexed();
  const fp = flatGeo.attributes.position;
  const colors = new Float32Array(fp.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < fp.count; i += 3) {
    const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3;
    const cx = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3;
    const cz = (fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)) / 3;
    const n = (Math.sin(cx * 1.7 + cz * 2.3) + 1) * 0.5;
    const sd = coastDistance(cx, cz);
    if (y < -0.2) c.copy(WET);
    else if (sd < 4.5 && y < 0.6) c.copy(SAND);
    else if (y > 5.2) c.copy(ROCK).lerp(FOREST, 0.45);
    else if (y > 2.2) c.copy(FOREST).lerp(GRASS2, n * 0.5);
    else c.copy(GRASS).lerp(GRASS2, n * 0.6);
    c.offsetHSL(0, 0, (n - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flatGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flatGeo.computeVertexNormals();
  const mesh = new THREE.Mesh(flatGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Coast distance packed into a texture so the water shader can draw depth and surf along the real coastline.
function coastTexture() {
  const data = new Uint8Array(SD_N * SD_N);
  for (let k = 0; k < data.length; k++) data[k] = Math.round(((Math.max(-20, Math.min(20, sdGrid[k])) + 20) / 40) * 255);
  const tex = new THREE.DataTexture(data, SD_N, SD_N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(SIZE * 3, SIZE * 3, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#47e0d2') },
      uDeep: { value: new THREE.Color('#1b7fb8') },
      uFoam: { value: new THREE.Color('#fff7e6') },
      uCoast: { value: coastTexture() },
      uExtent: { value: SD_EXTENT },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 0.25 + uTime * 1.1) * 0.12 + cos(p.z * 0.22 + uTime * 0.9) * 0.12;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam;
      uniform sampler2D uCoast; uniform float uExtent;
      varying vec3 vW;
      void main() {
        vec2 uv = (vW.xz + uExtent) / (2.0 * uExtent);
        float sd = texture2D(uCoast, uv).r * 40.0 - 20.0; // distance to shore, negative offshore
        float off = -sd;
        float t = smoothstep(-2.0, 22.0, off);
        vec3 col = mix(uShallow, uDeep, t);
        // Surf that rolls in toward the beach
        float a = vW.x * 0.35 + vW.z * 0.21;
        float band = 2.2 + sin(uTime * 1.2 + a) * 0.7;
        float foam = smoothstep(1.3, 0.0, abs(off - band)) * (0.55 + 0.45 * sin(a * 6.0 + uTime * 2.0));
        foam += smoothstep(0.9, 0.0, abs(off - 0.4)) * 0.6;
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.8);
        // Sparkles
        float s = sin(vW.x * 1.7 + vW.z * 0.6 + uTime * 1.4) * sin(vW.z * 2.3 - vW.x * 0.9 - uTime * 1.1) * sin((vW.x - vW.z) * 0.8 + uTime * 0.7);
        col += smoothstep(0.75, 1.0, s) * 0.18 * t;
        gl_FragColor = vec4(col, mix(0.62, 0.92, t));
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = -0.15;
  scene.add(water);
  return water;
}
