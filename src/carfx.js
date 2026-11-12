import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Car extras (2026-11-12, Shauna picked these from a list of car upgrades):
// - headlight beams that light the ground in front of the car at night (a soft warm pool drawn on the ground,
//   since the island's own shading recipe uses only the sun)
// - a horn (H, or the horn button on touch screens)
// - water dripping off the car for a few seconds after it leaves the water
// - sand thrown up behind the rear tires when accelerating hard or sliding on sand
// - a flame from the exhaust while boosting, and a pop of flame and sound on each gear change under power

// One pool of small bits for the drips and the sand spray: a single draw call, reused oldest first
const BITS = 360;
class Bits {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ fog: true }), BITS);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: BITS }, () => ({ pos: new THREE.Vector3(0, -99, 0), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, gravity: 9 }));
    this.next = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    for (let i = 0; i < BITS; i++) { this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0)); this.mesh.setColorAt(i, this._c.set('#ffffff')); }
    scene.add(this.mesh);
  }
  emit(pos, vel, color, { life = 0.6, size = 0.1, gravity = 12 } = {}) {
    const i = this.next; this.next = (this.next + 1) % BITS;
    Object.assign(this.p[i], { life, max: life, size, gravity });
    this.p[i].pos.copy(pos); this.p[i].vel.copy(vel);
    this.mesh.setColorAt(i, this._c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < BITS; i++) {
      const b = this.p[i];
      if (b.life <= 0) continue;
      any = true;
      b.life -= dt;
      b.vel.y -= b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      const k = Math.max(0, b.life / b.max);
      this.mesh.setMatrixAt(i, this._m.compose(b.pos, this._q, this._s.setScalar(b.life > 0 ? b.size * (0.4 + 0.6 * k) : 0)));
    }
    if (any || this.was) this.mesh.instanceMatrix.needsUpdate = true;
    this.was = any;
  }
}

export class CarFx {
  constructor(scene, car, fx, sound) {
    Object.assign(this, { car, fx, sound });
    this.bits = new Bits(scene);
    const halfLen = 1.42;
    // Headlight pool: two overlapping soft ovals ahead of the car, brightest near, fading out
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { uAmount: { value: 0 }, uColor: { value: new THREE.Color('#ffe2a8') } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: /* glsl */ `
          uniform float uAmount; uniform vec3 uColor; varying vec2 vUv;
          float oval( vec2 p, vec2 c ) { vec2 d = ( p - c ) / vec2( 0.42, 0.62 ); return smoothstep( 1.0, 0.0, length( d ) ); }
          void main() {
            // vUv.y: 0 at the bumper, 1 far ahead; two beams side by side that merge further out
            vec2 p = vUv;
            float b = max( oval( p, vec2( 0.3, 0.45 ) ), oval( p, vec2( 0.7, 0.45 ) ) );
            b *= smoothstep( 0.0, 0.12, p.y ) * ( 1.0 - p.y * 0.55 );
            gl_FragColor = vec4( uColor * b * uAmount * 0.55, 1.0 );
          }`,
      }),
    );
    pool.scale.set(4.2, 1, 7.5);
    pool.frustumCulled = false;
    pool.renderOrder = 3;
    scene.add(pool);
    this.pool = pool;
    this.halfLen = halfLen;

    // Exhaust flame: a short cone of fire out of the back, flickering, longer with the boost
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe8ff').multiplyScalar(2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const cone = new THREE.ConeGeometry(0.16, 1, 8, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0); // points backward (-X)
    this.flame = new THREE.Group();
    this.flameOuter = new THREE.Mesh(cone, flameMat);
    this.flameCore = new THREE.Mesh(cone, coreMat);
    this.flameCore.scale.set(0.6, 0.55, 0.55);
    this.flame.add(this.flameOuter, this.flameCore);
    this.flame.position.set(-halfLen - 0.05, 0.05, 0.42);
    (car.pose || car.group).add(this.flame);
    this.flameAmt = 0;
    this.popT = 0;

    this.wetT = 0;
    this.wasInWater = false;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    // Pops of flame on each gear change under power
    sound.onShift = () => { if (this.throttle > 0.5 && Math.abs(car.speed) > 6) { this.popT = 0.14; sound.pop(0.22, 160 + Math.random() * 120); } };

    // Horn
    addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat) this.honk(); });
    document.querySelector('[data-touch="horn"]')?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.honk(); });
  }

  honk() {
    this.sound.horn?.();
    this.honkedAt = performance.now();
  }

  // Car-local point to world
  toWorld(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.car.group.matrixWorld); }

  update(dt, { night, input, surface, inWater, boosting, sliding }) {
    const car = this.car;
    this.throttle = input.throttle;
    const q = car.group.quaternion;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
    const speed = Math.abs(car.speed);

    // Headlight pool on the ground ahead
    const head = car.position.clone().addScaledVector(fwd, this.halfLen + 3.6);
    this.pool.position.set(head.x, Math.max(heightAt(head.x, head.z), -0.1) + 0.06, head.z);
    this.pool.rotation.y = Math.atan2(-fwd.z, fwd.x) - Math.PI / 2;
    this.pool.material.uniforms.uAmount.value = THREE.MathUtils.smoothstep(night, 0.3, 0.85) * (car.grounded ? 1 : 0.4);
    this.pool.visible = this.pool.material.uniforms.uAmount.value > 0.01;

    // Exhaust flame
    const target = boosting ? 0.75 + 0.25 * Math.random() : 0;
    this.flameAmt += (target - this.flameAmt) * Math.min(1, dt * (target > this.flameAmt ? 18 : 10));
    this.popT = Math.max(0, this.popT - dt);
    const amt = Math.max(this.flameAmt, this.popT > 0 ? 0.9 : 0);
    const len = (boosting ? 0.9 : 0.55) * (0.8 + 0.4 * Math.random());
    this.flame.scale.set(len * amt + 0.001, 0.8 + 0.4 * amt, 0.8 + 0.4 * amt);
    this.flameOuter.material.opacity = amt * 0.85;
    this.flameCore.material.opacity = amt * 0.9;
    this.flame.visible = amt > 0.02;

    // Drips: for a few seconds after leaving the water, drops fall from the body
    if (inWater) this.wetT = 3.5;
    else if (this.wetT > 0) {
      this.wetT -= dt;
      if (Math.random() < dt * 28 * Math.min(1, this.wetT / 1.5)) {
        const p = this.toWorld((Math.random() * 2 - 1) * this.halfLen, -0.1 + Math.random() * 0.5, (Math.random() * 2 - 1) * 1.2);
        this.bits.emit(p, this._v.set((Math.random() - 0.5) * 0.3, -0.5, (Math.random() - 0.5) * 0.3), Math.random() < 0.5 ? '#cdeeff' : '#9fdcf2', { life: 0.5, size: 0.05, gravity: 14 });
      }
    }

    this.bits.update(dt);
    // Sand spray behind the rear tires: hard acceleration or a slide on sand
    if (surface === 'sand' && car.grounded && !inWater && speed > 3 && (input.throttle > 0.6 || sliding)) {
      const rate = sliding ? 70 : 40 * Math.min(1, speed / 10);
      for (const side of [-1, 1]) {
        if (Math.random() < dt * rate) {
          const p = this.toWorld(-this.halfLen * 0.75, -0.35, side * 1.15);
          const back = fwd.clone().multiplyScalar(-1);
          const v = back.multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5));
          this.bits.emit(p, v, ['#e9cf9c', '#d9b884', '#c9a670'][Math.floor(Math.random() * 3)], { life: 0.7, size: 0.07, gravity: 12 });
        }
      }
    }
  }
}
