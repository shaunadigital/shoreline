import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const ISLAND_R = 46;
export const SIZE = 150;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x, z, cx, cz, r, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// Height of the island at any point. Shared by visuals, physics and prop placement.
export function heightAt(x, z) {
  const ang = Math.atan2(z, x);
  // Wobbly coastline so the island isn't a perfect circle
  const coast = ISLAND_R + Math.sin(ang * 3) * 3 + Math.sin(ang * 5 + 1.3) * 2;
  const d = Math.hypot(x, z);
  const land = 1 - smooth(coast - 13, coast + 3, d);
  let h = THREE.MathUtils.lerp(-4, 0.8, land);
  // Gentle rolling ground on the plateau
  const inner = 1 - smooth(coast - 18, coast - 10, d);
  h += (Math.sin(x * 0.09) * Math.cos(z * 0.08) * 0.35 + Math.sin(x * 0.21 + z * 0.13) * 0.12) * inner;
  // Lookout hill to the north-west, and a smaller one to the south-east
  h += gauss(x, z, -20, -22, 11, 5.5) * inner;
  h += gauss(x, z, 22, 20, 7, 1.8) * inner;
  // Flatten the zones used by mini games and the spawn
  const flat = (cx, cz, r) => 1 - smooth(r, r + 5, Math.hypot(x - cx, z - cz));
  const f = Math.max(flat(0, 0, 9), flat(18, -6, 9));
  h = THREE.MathUtils.lerp(h, 0.8, f);
  return h;
}

const SAND = new THREE.Color('#f2d29b');
const WET = new THREE.Color('#d9b27a');
const GRASS = new THREE.Color('#7cc46a');
const GRASS2 = new THREE.Color('#4fa35c');
const ROCK = new THREE.Color('#b98f6a');

export function buildTerrain(scene, world) {
  const seg = 110;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }

  // Physics: trimesh built from the exact same vertices
  const verts = new Float32Array(pos.array);
  const idx = new Uint32Array(geo.index.array);
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(1.0));

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
    if (y < -0.2) c.copy(WET);
    else if (y < 0.4) c.copy(SAND);
    else if (y > 3.6) c.copy(ROCK).lerp(GRASS2, 0.35);
    else c.copy(GRASS).lerp(GRASS2, n * 0.6);
    c.offsetHSL(0, 0, (n - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flatGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flatGeo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    flatGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(SIZE * 3, SIZE * 3, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#47e0d2') },
      uDeep: { value: new THREE.Color('#1b7fb8') },
      uFoam: { value: new THREE.Color('#fff7e6') },
      uR: { value: ISLAND_R },
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
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform float uR;
      varying vec3 vW;
      void main() {
        float d = length(vW.xz);
        float a = atan(vW.z, vW.x);
        float coast = uR + sin(a * 3.0) * 3.0 + sin(a * 5.0 + 1.3) * 2.0;
        float t = smoothstep(coast - 10.0, coast + 25.0, d);
        vec3 col = mix(uShallow, uDeep, t);
        // Animated foam band near the shore
        float band = coast - 7.0 + sin(uTime * 1.2 + a * 8.0) * 0.6;
        float foam = smoothstep(1.4, 0.0, abs(d - band)) * (0.55 + 0.45 * sin(a * 40.0 + uTime * 2.0));
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
