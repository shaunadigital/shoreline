import * as THREE from 'three';
import RAPIER from './rapier.js';
import { LAYOUT_FLAT, HUT, FRUIT_CART, FIREWORK_BARREL, BOWLING, RAMPS, CRATES, DYNAMITE, ZONE_SIGNS, WELCOME_SIGN, SHELL_SIGN, GOLF } from './layout.js';
import { GROUND, TRACK_W, CURB_W, PATH_W, PLAN, GRID, coastSD, poolSD, landSD, trackDist, pathDist, zone } from './plan.js';

// The island from src/island-plan.json: flat ground, sandy beaches and pool banks,
// a few gentle bumps away from the circuit, paths and zones, and a small crater rim.

export { GROUND };
export const SIZE = 200; // terrain square, centered on the origin
const SEG = 200;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Distance to shore, positive on land, negative in the sea or a pool (kept for older callers)
export const coastDistance = landSD;

// Extra circles the ground is kept level for (props add theirs in layout.js): [x, z, radius]
export const FLAT_ZONES = [...PLAN.zones.filter((z) => z.id !== 'crater').map((z) => [z.at[0], z.at[1], z.r]), ...LAYOUT_FLAT];

const CRATER = zone('crater').at;
const HW = TRACK_W / 2 + CURB_W;

// Height of the island at any point. Shared by visuals, physics and prop placement.
export function heightAt(x, z) {
  const cs = coastSD(x, z), ps = poolSD(x, z);
  const sd = Math.min(cs, ps);
  let h;
  if (sd >= 0) h = -0.1 + (GROUND + 0.1) * smooth(0, ps < cs ? 5 : 8, sd); // pool banks are a little steeper than the beach
  else if (cs < 0) { // sea floor: a shallow shelf about 0.6 under the water for 10 units out, so you can drive into the sea
    const d = -cs; // (2026-10-30, like the reference), then it drops away and the car is towed back
    h = Math.max(-4, -0.1 - 0.55 * smooth(0, 3, d) - Math.max(0, d - 10) * 0.6);
  }
  else h = Math.max(-0.75, -0.1 + ps * 0.6); // pool floor: shallow (about 0.6 under the water), so every pool can be driven through
  // Gentle bumps on open grass only
  const open = smooth(6, 12, sd) * smooth(HW + 3, HW + 9, trackDist(x, z)) * smooth(PATH_W / 2 + 1, PATH_W / 2 + 5, pathDist(x, z));
  let level = 0;
  for (const [cx, cz, r] of FLAT_ZONES) level = Math.max(level, 1 - smooth(r * 0.6, r + 3, Math.hypot(x - cx, z - cz)));
  h += (Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.22 + Math.sin(x * 0.23 + z * 0.17) * 0.08) * open * (1 - level);
  // Treasure crater: a ring-shaped rim with a dip inside
  const dc = Math.hypot(x - CRATER[0], z - CRATER[1]);
  h += (1.7 * Math.exp(-(((dc - 4.6) / 1.5) ** 2)) - 0.35 * Math.exp(-((dc / 2.4) ** 2))) * smooth(1, 4, sd);
  // The circuit sits on level ground
  const ft = (1 - smooth(HW + 0.5, HW + 4, trackDist(x, z))) * smooth(-1, 1.5, sd);
  return THREE.MathUtils.lerp(h, GROUND, ft);
}

const SAND = new THREE.Color('#f2d29b');
const WET = new THREE.Color('#d9b27a');
// Olive grass with golden tips (the tips are added in grass.js), toward the reference (Shauna's call, 2026-10-30)
const GRASS = new THREE.Color('#8f9a3c');
const GRASS2 = new THREE.Color('#7d8c38');
const RIM = new THREE.Color('#c9a36b');
const EARTH = new THREE.Color('#d6a66c'); // packed earth, mixed with sand on the open ground between grass patches
const DARK_EARTH = new THREE.Color('#a8774b'); // trodden earth under props and play areas, so the sand paths read as paths (2026-10-30)

// Trodden ground under props: [x, z, radius]. The edge wobbles so each patch looks worn in, not stamped.
export const PROP_EARTH = [
  [HUT[0], HUT[1], 6.5], [FRUIT_CART[0], FRUIT_CART[1], 4], [FIREWORK_BARREL[0], FIREWORK_BARREL[1], 3],
  [BOWLING.x - 7, BOWLING.z, 4.5], [BOWLING.x, BOWLING.z, 4.5], [BOWLING.x + 7, BOWLING.z, 4.5],
  ...RAMPS.map(([x, z]) => [x, z, 4.5]), [CRATES[0], CRATES[1], 4.5], ...DYNAMITE.map(([x, z]) => [x, z, 3]),
  ...ZONE_SIGNS.map(([, x, z]) => [x, z, 2.2]), [WELCOME_SIGN[0], WELCOME_SIGN[1], 2.2], [SHELL_SIGN[0], SHELL_SIGN[1], 2.2],
  [GOLF.tee[0], GOLF.tee[1], 2.5],
];
export function propEarth(x, z) {
  let k = 0;
  for (const [px, pz, r] of PROP_EARTH) {
    const d = Math.hypot(x - px, z - pz);
    if (d > r * 1.4) continue;
    const wobble = 1 + 0.18 * Math.sin(Math.atan2(z - pz, x - px) * 5 + px) + 0.1 * Math.sin(x * 1.3 + z * 0.7);
    k = Math.max(k, 1 - smooth(r * 0.7 * wobble, r * wobble, d));
  }
  return k;
}

// The grass color of the ground at a point
export function grassColor(x, z, c = new THREE.Color()) {
  const n = (Math.sin(x * 1.7 + z * 2.3) + 1) * 0.5;
  return c.copy(GRASS).lerp(GRASS2, n * 0.6).offsetHSL(0, 0, (n - 0.5) * 0.04);
}

// Where grass grows (set by grass.js): the terrain is green under the grass patches and bare (sand and
// packed earth) everywhere else
export const TERRAIN_GRASS = { uGrassMap: { value: null }, uGrassExt: { value: 1 } };

// Ground color at a point, without grass (shared by the terrain mesh, the grass and the light bounced off the ground)
export function groundColor(x, z, y, c = new THREE.Color()) {
  const n = (Math.sin(x * 1.7 + z * 2.3) + 1) * 0.5;
  const sd = landSD(x, z);
  const dc = Math.hypot(x - CRATER[0], z - CRATER[1]);
  if (y < -0.2) c.copy(WET);
  else if (sd < 4.2 && trackDist(x, z) > HW + 1.5) c.copy(SAND);
  else if (dc < 6.5 && y > GROUND + 0.25) c.copy(RIM).lerp(GRASS2, 0.25 * n);
  else return grassColor(x, z, c);
  return c.offsetHSL(0, 0, (n - 0.5) * 0.04);
}

// Whether groundColor gives grass here (not wet, sand or the crater rim)
function isGreen(x, z, y) {
  if (y < -0.2) return false;
  if (landSD(x, z) < 4.2 && trackDist(x, z) > HW + 1.5) return false;
  const dc = Math.hypot(x - CRATER[0], z - CRATER[1]);
  return !(dc < 6.5 && y > GROUND + 0.25);
}

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
  // Two colors per triangle: bare ground, and grass. The shader picks grass wherever the grass map says
  // grass grows, so green ground never shows outside the grass.
  const colors = new Float32Array(fp.count * 3), greens = new Float32Array(fp.count * 3);
  const c = new THREE.Color(), g = new THREE.Color();
  for (let i = 0; i < fp.count; i += 3) {
    const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3;
    const cx = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3;
    const cz = (fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)) / 3;
    groundColor(cx, cz, y, c);
    grassColor(cx, cz, g);
    if (isGreen(cx, cz, y)) { // open ground between the grass patches: sand and packed earth
      const n = (Math.sin(cx * 0.21 + cz * 0.13) * Math.sin(cz * 0.17 - cx * 0.09) + 1) * 0.5;
      c.copy(SAND).lerp(EARTH, smooth(0.35, 0.75, n) * 0.85).offsetHSL(0, 0, (((cx * 7.3 + cz * 3.1) % 1 + 1) % 1 - 0.5) * 0.03);
      const n2 = (Math.sin(cx * 0.53 + cz * 0.37) * Math.sin(cz * 0.61 - cx * 0.29) + 1) * 0.5; // smaller worn spots of darker earth
      c.lerp(DARK_EARTH, Math.max(smooth(0.78, 0.95, n2) * 0.6, propEarth(cx, cz) * 0.9));
    }
    for (let k = 0; k < 3; k++) { colors.set([c.r, c.g, c.b], (i + k) * 3); greens.set([g.r, g.g, g.b], (i + k) * 3); }
  }
  flatGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flatGeo.setAttribute('grassColor', new THREE.BufferAttribute(greens, 3));
  flatGeo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TERRAIN_GRASS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 grassColor; varying vec3 vGrassColor; varying vec2 vGrassXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrassColor = grassColor; vGrassXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGrassMap; uniform float uGrassExt; varying vec3 vGrassColor; varying vec2 vGrassXZ;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float grass = texture2D( uGrassMap, ( vGrassXZ + uGrassExt ) / ( 2.0 * uGrassExt ) ).b; // patch height
          diffuseColor.rgb = mix( diffuseColor.rgb, vGrassColor * 0.8, smoothstep( 0.12, 0.4, grass ) ); // darker green under the patches
        }`);
  };
  mat.userData.noAO = true;
  mat.customProgramCacheKey = () => 'terrain-grass'; // its own shader program, not shared with other standard materials
  const mesh = new THREE.Mesh(flatGeo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Shore distance (coast and pools) packed into a texture so the water shader can draw depth and surf.
const SD_EXTENT = GRID.EXTENT;
function coastTexture() {
  const { N, coastGrid, poolGrid } = GRID;
  const data = new Uint8Array(N * N);
  for (let k = 0; k < data.length; k++) {
    const sd = Math.min(coastGrid[k], poolGrid[k]);
    data[k] = Math.round(((Math.max(-20, Math.min(20, sd)) + 20) / 40) * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
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
      uShallow: { value: new THREE.Color('#3cc9c0') }, // teal near the shore, deepening fast to blue (toward the reference, 2026-10-30)
      uDeep: { value: new THREE.Color('#1f4fae') },
      uLeaf: { value: new THREE.Color('#d0603a') },
      uTint: { value: new THREE.Color(1, 1, 1) }, // time of day (daycycle.js)
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
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uLeaf; uniform vec3 uTint;
      uniform sampler2D uCoast; uniform float uExtent;
      varying vec3 vW;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 uv = (vW.xz + uExtent) / (2.0 * uExtent);
        float sd = texture2D(uCoast, uv).r * 40.0 - 20.0; // distance to shore, negative offshore
        float off = -sd;
        // Teal at the shore, deepening quickly to blue, darker again far out
        float t = smoothstep(-1.0, 9.0, off);
        vec3 col = mix(uShallow, uDeep, t);
        col *= 1.0 - 0.25 * smoothstep(10.0, 30.0, off);
        // Thin white foam lines that roll in toward the shore and break up along their length
        float a = vW.x * 0.35 + vW.z * 0.21;
        float wave = fract((off + uTime * 0.55) / 2.6);
        float line = smoothstep(0.08, 0.0, abs(wave - 0.5)) * smoothstep(7.0, 1.0, off) * smoothstep(-0.2, 0.6, off);
        line *= smoothstep(-0.2, 0.5, sin(a * 3.0 + uTime * 0.8) * sin(a * 1.3 - uTime * 0.5 + 1.7));
        float edge = smoothstep(0.6, 0.0, abs(off - 0.25)); // a steady line where water meets sand
        col = mix(col, uFoam, clamp(line * 0.9 + edge * 0.85, 0.0, 1.0));
        // Fallen leaves floating on the surface, drifting slowly
        vec2 fp = vW.xz + vec2(uTime * 0.12, uTime * 0.05);
        vec2 cell = floor(fp / 1.7), f = fract(fp / 1.7) - 0.5;
        float h = hash2(cell);
        if (h < 0.09 && off < 14.0) {
          vec2 o = (vec2(hash2(cell + 3.1), hash2(cell + 7.7)) - 0.5) * 0.5;
          float ang = h * 70.0, ca = cos(ang), sa = sin(ang);
          vec2 q = f - o; q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
          float leaf = smoothstep(0.075, 0.06, length(q * vec2(1.0, 1.8)));
          col = mix(col, uLeaf * (0.75 + 0.5 * hash2(cell + 1.3)), leaf * 0.9);
        }
        // Sparkles
        float s = sin(vW.x * 1.7 + vW.z * 0.6 + uTime * 1.4) * sin(vW.z * 2.3 - vW.x * 0.9 - uTime * 1.1) * sin((vW.x - vW.z) * 0.8 + uTime * 0.7);
        col += smoothstep(0.8, 1.0, s) * 0.12 * t;
        gl_FragColor = vec4(col * uTint, mix(0.7, 0.95, t));
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = -0.15;
  scene.add(water);
  return water;
}
