import * as THREE from 'three';
import DIRT_GLSL from './shaders/dirt.glsl?raw';

// Dirt on the car (2026-11-11). The shader is src/shaders/dirt.glsl; this file patches the car's materials
// with it and runs the amount each frame: driving fast on sand or earth (more in drifts, a burst on
// landings) builds it up in the color of that ground, the road adds none, driving through a pool washes
// it off in a few seconds and leaves the car wet, and rain rinses it slowly.
// `?dirt=0.8` in the address starts the car that dirty (0 to 1).

export const DIRT = {
  uDirt: { value: 0 },
  uDirtColor: { value: new THREE.Color('#b8956a') },
  uDirtWet: { value: 0 },
  uDirtRange: { value: new THREE.Vector2(-1, 1.6) },
  uCarInv: { value: new THREE.Matrix4() },
};

const GROUND_COLOR = { sand: new THREE.Color('#c4a273'), dirt: new THREE.Color('#7e5e3e') };
const GAIN = { sand: 0.016, dirt: 0.026, road: 0 }; // per second at cruising speed

// Add the dirt to one material. Call before shade() (shading.js), which chains onto it.
export function addDirt(material) {
  if (material.userData.dirt) return material;
  material.userData.dirt = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, DIRT);
    sh.defines = { ...(sh.defines || {}), SHADE_DIRT: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uCarInv; varying vec3 vDirtCar; varying vec3 vDirtObj; varying vec3 vDirtUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDirtObj = position;
        vDirtCar = ( uCarInv * modelMatrix * vec4( position, 1.0 ) ).xyz;
        vDirtUp = normalize( mat3( uCarInv ) * mat3( modelMatrix ) * normal );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DIRT_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\napplyDirt( diffuseColor.rgb );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - shadeDirt * 0.85; // dirt covers the paint\'s night glow');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|dirt';
  material.needsUpdate = true;
  return material;
}

export class Dirt {
  constructor() {
    const start = Number(new URLSearchParams(location.search).get('dirt'));
    this.amount = Number.isFinite(start) ? THREE.MathUtils.clamp(start, 0, 1) : 0;
    this.wet = 0;
  }

  // The height range the dirt climbs, in the car's own space: bottom of the tires to the top of the car
  setRange(low, high) { DIRT.uDirtRange.value.set(low, high); }

  // state: { carMatrix, surface: 'road' | 'sand' | 'dirt', speed, grounded, drifting, inWater, landed, rain }
  update(dt, s) {
    DIRT.uCarInv.value.copy(s.carMatrix).invert();
    const fast = THREE.MathUtils.clamp((Math.abs(s.speed) - 2) / 10, 0, 1.6);
    let gain = 0;
    if (s.grounded && !s.inWater) gain = GAIN[s.surface] * fast * (s.drifting ? 2.5 : 1);
    if (s.landed && s.surface !== 'road' && !s.inWater) gain += 0.06 / dt; // a burst of dirt on a landing
    if (gain > 0) {
      this.amount += gain * dt * (1 - this.amount * 0.55); // slower as it cakes on
      DIRT.uDirtColor.value.lerp(GROUND_COLOR[s.surface], Math.min(1, gain * dt * 6)); // takes on the ground's color
    }
    if (s.inWater) { this.amount -= dt * 0.33; this.wet = 1; } // a pool rinses it off in about 3 s
    this.amount -= dt * 0.03 * s.rain; // rain, slowly
    this.wet = Math.max(this.wet - dt * 0.12, s.rain * 0.8);
    this.amount = THREE.MathUtils.clamp(this.amount, 0, 1);
    DIRT.uDirt.value = this.amount;
    DIRT.uDirtWet.value = this.wet;
  }
}
