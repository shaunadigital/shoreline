import * as THREE from 'three';
import { SHADE } from './shading.js';
import { WIND } from './wind.js';
import { gustAt } from './drift.js';
import { heightAt } from './terrain.js';
import { coastSD, landSD } from './plan.js';

// The air over the island (2026-11-12, Shauna picked these from a list of look upgrades):
// - cloud shadows drifting over land and sea (the shader is shaders/sky-over.glsl; this sets its uniforms)
// - sun rays slanting down through the trees near the car at sunrise and sunset
// - sand blowing low across the beaches in strong gusts
// - heat shimmer: wavering light over the asphalt at midday (addHeatShimmer, used by the road in track.js)
// The sea mist and stars in the water live in the water shader (water-light.glsl).
// `?clouds=0` turns the cloud shadows off; `?golden` holds the sun rays on (for checks).

const params = new URLSearchParams(location.search);
const CLOUDS_ON = params.get('clouds') !== '0';
const FORCE_RAYS = params.has('golden');

export const HEAT = { uHeat: { value: 0 }, uHeatTime: { value: 0 } };

// Heat shimmer on a material (the road): thin wavering bands of brighter light that drift and break up,
// as hot air bends the light over the asphalt
export function addHeatShimmer(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, HEAT);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHeatW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeatW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHeat; uniform float uHeatTime; varying vec3 vHeatW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if ( uHeat > 0.0 ) {
          vec2 p = vHeatW.xz;
          float wave = sin( p.x * 1.7 + p.y * 0.6 + uHeatTime * 2.1 + sin( p.y * 2.3 - uHeatTime * 1.3 ) * 1.4 )
                     * sin( p.y * 1.3 - p.x * 0.4 - uHeatTime * 1.7 + sin( p.x * 2.9 + uHeatTime ) * 1.2 );
          diffuseColor.rgb += vec3( 0.06, 0.055, 0.05 ) * smoothstep( 0.35, 0.9, wave ) * uHeat;
        }`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|heat';
  return material;
}

// ---------- Sun rays ----------
const RAYS = 14;
function makeRays(scene) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const start = new THREE.InstancedBufferAttribute(new Float32Array(RAYS * 3), 3);
  const shape = new THREE.InstancedBufferAttribute(new Float32Array(RAYS * 4), 4); // length, width, seed, fade
  geo.setAttribute('aStart', start);
  geo.setAttribute('aShape', shape);
  geo.instanceCount = RAYS;
  const uniforms = { uDir: { value: new THREE.Vector3(0, -1, 0) }, uColor: { value: new THREE.Color() }, uAmount: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform vec3 uDir; attribute vec3 aStart; attribute vec4 aShape; varying vec2 vUv; varying float vSeed; varying float vFade;
      void main() {
        // A long flat beam along the sun's direction, turned round its own length to face the camera
        vec3 along = uDir * aShape.x;
        vec3 p0 = aStart + along * position.y;
        vec3 side = normalize( cross( uDir, cameraPosition - p0 ) );
        vec3 p = p0 + side * position.x * aShape.y * ( 0.7 + 0.6 * position.y ); // wider toward the ground
        vUv = vec2( position.x + 0.5, position.y ); vSeed = aShape.z; vFade = aShape.w;
        gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vFade;
      void main() {
        float across = sin( vUv.x * 3.14159 );                                  // soft sides
        float along = smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.55, vUv.y ); // fades in under the canopy, out near the ground
        float flicker = 0.75 + 0.25 * sin( uTime * ( 0.6 + vSeed ) + vSeed * 20.0 ); // leaves moving in the wind
        float a = across * across * along * flicker * uAmount * vFade * 0.32;
        gl_FragColor = vec4( uColor * a, 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  scene.add(mesh);
  return { mesh, start, shape, uniforms, fades: new Float32Array(RAYS), targets: new Float32Array(RAYS), slots: new Array(RAYS).fill(null) };
}

// ---------- Blowing sand ----------
const GRAINS = 420;
const SAND_BOX = 34;
function makeSand(scene) {
  const geo = new THREE.PlaneGeometry(1, 0.05);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#f3dcb0', transparent: true, opacity: 0, depthWrite: false, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, GRAINS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  const g = Array.from({ length: GRAINS }, () => ({ x: 0, y: -50, z: 0, len: 0.5, speed: 1, life: 0 }));
  return { mesh, mat, g };
}

export class Atmosphere {
  constructor(scene, trees) {
    this.trees = trees;
    this.rays = makeRays(scene);
    this.sand = makeSand(scene);
    this.rayTimer = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.gust = 0;
  }

  update(dt, t, { carPos, sunOffset, night, golden, rain, wet }) {
    // Clouds: a few by day, thick in rain, faint by moonlight
    SHADE.uCloudTime.value = t;
    SHADE.uCloudDir.value.copy(WIND.uWindDir.value);
    SHADE.uCloudCover.value = 0.42 + 0.5 * rain;
    SHADE.uCloudStrength.value = CLOUDS_ON ? (0.5 * (1 - night) + 0.18 * night) * (1 - 0.3 * rain) : 0;
    // Heat over the road: midday, dry, clear
    HEAT.uHeatTime.value = t;
    HEAT.uHeat.value = (1 - night) * (1 - golden) * (1 - Math.min(1, wet * 2)) * (1 - rain);
    this.updateRays(dt, t, carPos, sunOffset, FORCE_RAYS ? 1 : golden * (1 - rain));
    this.updateSand(dt, t, carPos, night, rain);
  }

  updateRays(dt, t, carPos, sunOffset, amount) {
    const R = this.rays;
    R.uniforms.uAmount.value = amount;
    R.uniforms.uTime.value = t;
    R.uniforms.uColor.value.copy(SHADE.uLightColor.value);
    R.uniforms.uDir.value.copy(sunOffset).normalize().negate();
    R.mesh.visible = amount > 0.01;
    if (!R.mesh.visible) return;
    // Every couple of seconds, hand beams to the trees nearest the car (each tree gets one or two)
    this.rayTimer -= dt;
    if (this.rayTimer <= 0) {
      this.rayTimer = 2;
      const near = this.trees.filter(([x, z]) => Math.abs(x - carPos.x) < 26 && Math.abs(z - carPos.z) < 26)
        .sort((a, b) => Math.hypot(a[0] - carPos.x, a[1] - carPos.z) - Math.hypot(b[0] - carPos.x, b[1] - carPos.z));
      for (let i = 0; i < RAYS; i++) {
        const tree = near[i % Math.max(1, Math.min(near.length, 9))];
        if (!tree || (R.slots[i] === tree && R.targets[i] > 0)) continue;
        R.slots[i] = tree;
        R.targets[i] = 0; // fade out, then move when hidden (below)
      }
    }
    const dir = R.uniforms.uDir.value;
    for (let i = 0; i < RAYS; i++) {
      const tree = R.slots[i];
      if (!tree) continue;
      if (R.targets[i] === 0 && R.fades[i] < 0.02) {
        // Hidden: place it at a new spot in this tree's crown and fade it back in
        const [x, z] = tree;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
        const top = heightAt(x, z) + 4.8 + Math.random() * 1.8;
        const len = (top - heightAt(x, z) + 0.3) / Math.max(0.3, -dir.y); // reaches the ground
        R.start.setXYZ(i, x + Math.cos(a) * r, top, z + Math.sin(a) * r);
        R.shape.setXYZW(i, len, 0.5 + Math.random() * 0.9, Math.random(), 0);
        R.start.needsUpdate = true;
        R.targets[i] = 0.6 + Math.random() * 0.4;
      }
      R.fades[i] += (R.targets[i] - R.fades[i]) * Math.min(1, dt * 0.8);
      R.shape.setW(i, R.fades[i]);
    }
    R.shape.needsUpdate = true;
  }

  updateSand(dt, t, carPos, night, rain) {
    const S = this.sand;
    // How gusty it is round the car right now (the same wind the grass and leaves follow)
    const g = gustAt(carPos.x, carPos.z, t);
    this.gust += (g - this.gust) * Math.min(1, dt * 2);
    const strength = THREE.MathUtils.smoothstep(this.gust, 0.08, 0.3) * (1 - rain);
    S.mat.opacity = strength * (0.45 - 0.2 * night);
    S.mesh.visible = S.mat.opacity > 0.01;
    if (!S.mesh.visible) return;
    const w = WIND.uWindDir.value; // the wind blows along this (x, z)
    const yaw = Math.atan2(-w.y, w.x);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let i = 0; i < GRAINS; i++) {
      const p = S.g[i];
      p.life -= dt;
      const off = Math.abs(p.x - carPos.x) > SAND_BOX || Math.abs(p.z - carPos.z) > SAND_BOX;
      if (p.life <= 0 || off) {
        // A new streak somewhere on the sand round the car (beaches, pool banks and paths near the water)
        let tries = 0;
        do {
          p.x = carPos.x + (Math.random() * 2 - 1) * SAND_BOX;
          p.z = carPos.z + (Math.random() * 2 - 1) * SAND_BOX;
        } while (++tries < 6 && !(landSD(p.x, p.z) > 0.3 && landSD(p.x, p.z) < 7 && coastSD(p.x, p.z) > 0));
        if (tries >= 6) { p.y = -50; p.life = 0.3; continue; }
        p.y = heightAt(p.x, p.z) + 0.04 + Math.random() * 0.3;
        p.len = 0.6 + Math.random() * 1.4;
        p.speed = 5 + Math.random() * 5;
        p.life = 0.6 + Math.random() * 1.2;
      }
      p.x += w.x * p.speed * dt * (0.5 + strength);
      p.z += w.y * p.speed * dt * (0.5 + strength);
      this._s.set(p.len * Math.min(1, p.life * 2), 1, 1);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s);
      S.mesh.setMatrixAt(i, this._m);
    }
    S.mesh.instanceMatrix.needsUpdate = true;
  }
}
