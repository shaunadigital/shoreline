import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Fireflies (2026-11-11): small glowing dots that drift and blink round the trees and bushes near the car,
// at night only and not in the rain. Each one belongs to a plant; when the car moves on, fireflies left
// far behind move to plants near it, so there are always some in view. Their motion and blinking run in
// the shader (one draw call), and they glow past white so the glow pass gives them a soft halo.
// `?fireflies` in the address shows them by day too (for checks).

const COUNT = 220;
const RANGE = 38; // plants this close to the car get fireflies

export class Fireflies {
  constructor(scene, plants) {
    this.plants = plants; // [x, z] of trees and bushes
    this.force = new URLSearchParams(location.search).has('fireflies');
    const geo = new THREE.BufferGeometry();
    this.base = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) seed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(this.base, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color('#e4ff7a') },
      uScale: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uScale;
        attribute float aSeed;
        varying float vBlink;
        void main() {
          float t = uTime * ( 0.35 + aSeed * 0.3 ) + aSeed * 40.0;
          // A slow looping wander round its home spot, rising and dipping
          vec3 p = position + vec3( sin( t * 1.3 ) * 1.4 + sin( t * 0.7 + 2.0 ) * 0.8, sin( t * 0.9 + aSeed * 6.0 ) * 0.6, cos( t * 1.1 ) * 1.4 + cos( t * 0.5 ) * 0.8 );
          // Blink: mostly dim, a soft pulse every few seconds, each at its own time
          float cycle = fract( uTime * ( 0.18 + aSeed * 0.12 ) + aSeed );
          vBlink = smoothstep( 0.0, 0.12, cycle ) * smoothstep( 0.45, 0.2, cycle ) + 0.22;
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * ( 9.0 + 14.0 * vBlink ) * ( 30.0 / -mv.z );
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAmount;
        varying float vBlink;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          float core = smoothstep( 0.5, 0.0, d );
          float a = core * core * min( 1.0, vBlink * 1.4 ) * uAmount;
          if ( a < 0.004 ) discard;
          gl_FragColor = vec4( uColor * 3.4, a ); // additive: the color is scaled by a when blended
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.home = new Int32Array(COUNT).fill(-1);
    this.timer = 0;
  }

  // Give firefly i a home among the plants near (x, z)
  placeOne(i, x, z) {
    const near = this.near;
    if (!near.length) return;
    const [px, pz] = near[Math.floor(Math.random() * near.length)];
    const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 2.2;
    const hx = px + Math.cos(a) * r, hz = pz + Math.sin(a) * r;
    this.base.set([hx, Math.max(heightAt(hx, hz), 0) + 0.6 + Math.random() * 2.4, hz], i * 3);
    this.home[i] = 1;
  }

  update(dt, t, carPos, night, rain) {
    const amount = this.force ? 1 : THREE.MathUtils.smoothstep(night, 0.5, 0.95) * (1 - Math.min(1, rain * 1.5));
    this.uniforms.uAmount.value = amount;
    this.uniforms.uTime.value = t;
    this.uniforms.uScale.value = Math.min(2, innerHeight / 800);
    this.points.visible = amount > 0.01;
    if (!this.points.visible) return;
    // Every half second, move fireflies that are far from the car to plants near it
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.near = this.plants.filter(([x, z]) => Math.abs(x - carPos.x) < RANGE && Math.abs(z - carPos.z) < RANGE);
    let moved = false;
    for (let i = 0; i < COUNT; i++) {
      const bx = this.base[i * 3], bz = this.base[i * 3 + 2];
      if (this.home[i] < 0 || Math.abs(bx - carPos.x) > RANGE + 6 || Math.abs(bz - carPos.z) > RANGE + 6) { this.placeOne(i, carPos.x, carPos.z); moved = true; }
    }
    if (moved) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
