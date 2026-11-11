import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { landSD, trackDist, TRACK_W, CURB_W } from './plan.js';
import { WIND } from './wind.js';
import { petalTexture, LEAF_COLORS, PETAL_COLORS } from './litter.js';

// Loose leaves and petals that move (2026-11-04, Shauna: like the reference's, "floating in the wind and on
// the surface"). The reference keeps a few thousand small cards in a square that follows the player and
// moves them on the graphics card; here the same idea runs in plain code: the cards lie on the ground in a
// square round the car, the car kicks them up as it drives through and they flutter back down, gusts of the
// shared island wind push some along, explosions blow them outward, and on the pools they float and drift.
// A card that leaves the square comes back in on the far side, so the ground round the car is never bare.
// Resting cards are asleep and cost nothing until something wakes them.

const HW = TRACK_W / 2 + CURB_W;
const WATER = -0.15; // the pools' surface (terrain.js)
const GRAV = 9.8;

// The island wind's noise, read on the CPU the same way the grass shader reads it (wind.js windGust)
function gustAt(x, z, t) {
  const tex = WIND.uWindNoise.value, { data, width } = tex.image, dir = WIND.uWindDir.value;
  const sample = (u, v) => {
    u = ((u % 1) + 1) % 1; v = ((v % 1) + 1) % 1;
    const fx = u * width, fy = v * width, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    const at = (ii, jj) => data[(((jj % width) * width) + (ii % width)) * 4] / 255;
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  };
  return sample(x * 0.05 + dir.x * t * 0.05, z * 0.05 + dir.y * t * 0.05) - 0.5 + sample(x * 0.02 + dir.x * t * 0.012, z * 0.02 + dir.y * t * 0.012) - 0.5;
}

export class Drift {
  constructor(scene, { small = false } = {}) {
    this.size = 70; // the square round the car, wider than the camera sees
    this.count = small ? 1300 : 2400;
    const geo = new THREE.PlaneGeometry(1, 0.7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ alphaMap: petalTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    mat.userData.noAO = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // it follows the car, so its bounds are always round the camera
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < this.count; i++) {
      const petal = Math.random() < 0.22, pal = petal ? PETAL_COLORS : LEAF_COLORS;
      this.mesh.setColorAt(i, pal[Math.floor(Math.random() * pal.length)].clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
      this.p.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        ry: Math.random() * Math.PI * 2, tilt: (Math.random() - 0.5) * 0.3, roll: (Math.random() - 0.5) * 0.3,
        spin: (Math.random() - 0.5) * 9, phase: Math.random() * 10,
        s: petal ? 0.2 + Math.random() * 0.1 : 0.26 + Math.random() * 0.16,
        w: 0.55 + Math.random() * 0.45, // weight: lighter ones fly further and fall slower
        awake: true, hidden: false, i,
      });
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.o = new THREE.Object3D();
    this.started = false;
  }

  // Put a card on the ground at (x, z): none on the open sea, fewer on the road
  place(p, x, z) {
    p.x = x; p.z = z; p.vx = p.vy = p.vz = 0;
    const sd = landSD(x, z);
    p.hidden = sd < -3 || (trackDist(x, z) < HW && Math.random() < 0.6);
    p.y = Math.max(heightAt(x, z), WATER) + 0.04;
    p.awake = false;
    this.write(p, p.i);
  }

  write(p, i) {
    const o = this.o;
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(p.tilt, p.ry, p.roll);
    o.scale.setScalar(p.hidden ? 0 : p.s);
    o.updateMatrix();
    this.mesh.setMatrixAt(i, o.matrix);
  }

  // car: { x, z, vx, vz, speed }, blast: fx.blastAt (x, z, radius, strength), t: seconds
  update(dt, car, blast, t) {
    dt = Math.min(dt, 1 / 30);
    const S = this.size, H = S / 2;
    if (!this.started) {
      this.started = true;
      this.p.forEach((p) => this.place(p, car.x + (Math.random() - 0.5) * S, car.z + (Math.random() - 0.5) * S));
      this.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const dir = WIND.uWindDir.value, blasting = blast.w > 0.35;
    let changed = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.p[i];
      // Keep the square round the car: a card that falls behind comes back in ahead
      let wx = p.x, wz = p.z;
      if (wx < car.x - H) wx += S; else if (wx > car.x + H) wx -= S;
      if (wz < car.z - H) wz += S; else if (wz > car.z + H) wz -= S;
      if (wx !== p.x || wz !== p.z) { this.place(p, wx, wz); changed = true; continue; }
      if (p.hidden) continue;

      // Wake: the car close by, a blast, or now and then a gust
      const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz);
      const nearCar = d < 2.6 && car.speed > 2;
      const bd = blasting ? Math.hypot(p.x - blast.x, p.z - blast.y) : 99;
      if (!p.awake) {
        if (nearCar || bd < blast.z) p.awake = true;
        else if (Math.random() < dt * 0.5) { // a gust check, a few times a minute per card
          const g = gustAt(p.x, p.z, t);
          if (g > 0.32) { p.awake = true; p.vx += dir.x * (g - 0.2) * 3; p.vz += dir.y * (g - 0.2) * 3; p.vy += (g - 0.2) * 2.5 * (1.2 - p.w); }
        }
        if (!p.awake) continue;
      }

      // The car pushes cards along with it and out to the sides, and lifts them
      if (nearCar) {
        const k = (1 - d / 2.6) * Math.min(1, car.speed / 10), inv = d > 0.01 ? 1 / d : 0;
        p.vx += (car.vx * 0.7 + dx * inv * 3) * k * dt * 9;
        p.vz += (car.vz * 0.7 + dz * inv * 3) * k * dt * 9;
        const h = Math.min(Math.hypot(p.vx, p.vz), 4);
        p.vy = Math.max(p.vy, h * 0.9 * (1.2 - p.w) * Math.max(0, 1 - (p.y - heightAt(p.x, p.z)) / 3));
      }
      // Explosions blow everything near outward and up
      if (bd < blast.z) {
        const k = (1 - bd / blast.z) * blast.w, inv = bd > 0.01 ? 1 / bd : 0;
        p.vx += (p.x - blast.x) * inv * 30 * k * dt;
        p.vz += (p.z - blast.y) * inv * 30 * k * dt;
        p.vy += 22 * k * dt * (1.2 - p.w);
      }

      const ground = heightAt(p.x, p.z), onWater = ground < WATER, floor = (onWater ? WATER + 0.01 : ground) + 0.04;
      const air = p.y > floor + 0.02;
      if (air) {
        // Flutter down: gravity, a slow top speed for falling, and a side-to-side sway
        p.vy = Math.max(p.vy - GRAV * p.w * dt, -0.8 - p.w * 1.2);
        const damp = Math.exp(-1.6 * dt);
        p.vx *= damp; p.vz *= damp;
        p.vx += Math.sin(t * 5 + p.phase) * 0.6 * dt; p.vz += Math.cos(t * 4 + p.phase) * 0.6 * dt;
        p.ry += p.spin * dt;
        p.tilt = Math.sin(t * 6 + p.phase) * 0.7; p.roll = Math.cos(t * 5 + p.phase) * 0.6;
      } else {
        p.vy = Math.max(0, p.vy);
        const damp = Math.exp(-(onWater ? 0.7 : 7) * dt); // the pools let them drift; the ground stops them
        p.vx *= damp; p.vz *= damp;
        if (onWater) { p.vx += dir.x * 0.08 * dt; p.vz += dir.y * 0.08 * dt; p.ry += p.spin * 0.05 * dt; }
        p.tilt *= Math.exp(-8 * dt); p.roll *= Math.exp(-8 * dt);
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f2 = Math.max(heightAt(p.x, p.z), WATER + 0.01) + 0.04;
      if (p.y < f2) { p.y = f2; if (p.vy < 0) p.vy = 0; }
      // Back to sleep once it has settled on the ground (cards on a pool keep drifting slowly)
      if (!air && !onWater && Math.abs(p.vx) + Math.abs(p.vz) < 0.04 && !nearCar) {
        p.awake = false; p.vx = p.vz = p.vy = 0; p.tilt = (Math.random() - 0.5) * 0.3; p.roll = (Math.random() - 0.5) * 0.3;
      }
      this.write(p, i);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Leaves shaken out of a tree (2026-11-11): n cards start high in the crown round (x, z) and flutter down
  shower(x, z, top, n = 26) {
    for (let k = 0; k < n; k++) {
      const p = this.p[Math.floor(Math.random() * this.count)];
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.4;
      p.x = x + Math.cos(a) * r; p.z = z + Math.sin(a) * r;
      p.y = top - Math.random() * 2.2;
      p.vx = Math.cos(a) * (0.5 + Math.random()); p.vz = Math.sin(a) * (0.5 + Math.random()); p.vy = Math.random() * 0.8;
      p.hidden = false; p.awake = true;
      this.write(p, p.i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get awakeCount() { return this.p.filter((p) => p.awake && !p.hidden).length; }
}

// Confetti on the ground (2026-11-04, Shauna: in the reference it "kind of blows in the wind along the top of
// the surface"). Bits that land from a burst are handed over here: lighter than leaves, they skitter along
// the ground with every gust, hop now and then, get kicked up by the car and blown by blasts, and after
// about half a minute shrink away. A ring of up to 900 bits; the oldest go first.
export class GroundConfetti {
  constructor(scene) {
    this.max = 900;
    const geo = new THREE.PlaneGeometry(0.13, 0.22);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.b = [];
    this.next = 0;
    this.o = new THREE.Object3D();
    this.white = new THREE.Color('#fff');
  }

  add(pos, color) {
    const i = this.next, b = { x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0, ry: Math.random() * 6.28, tilt: 0, roll: 0, spin: (Math.random() - 0.5) * 8,
      life: 22 + Math.random() * 12, w: 0.3 + Math.random() * 0.4, phase: Math.random() * 10 };
    this.b[i] = b;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
    this.next = (i + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
  }

  update(dt, car, blast, t) {
    if (!this.b.length) return;
    dt = Math.min(dt, 1 / 30);
    const dir = WIND.uWindDir.value, o = this.o;
    for (let i = 0; i < this.b.length; i++) {
      const b = this.b[i];
      if (!b) continue;
      b.life -= dt;
      if (b.life <= 0) { o.scale.setScalar(0); o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix); this.b[i] = null; continue; }
      // Wind: the same rolling gusts as the grass, strong enough to slide paper but not leaves
      const g = gustAt(b.x, b.z, t);
      if (g > -0.05) { const k = (g + 0.05) * 5 * (1.1 - b.w); b.vx += dir.x * k * dt; b.vz += dir.y * k * dt; }
      // The car and blasts, as for the leaves but stronger on light paper
      const dx = b.x - car.x, dz = b.z - car.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && car.speed > 1.5) {
        const k = (1 - d / 2.6) * Math.min(1, car.speed / 10), inv = d > 0.01 ? 1 / d : 0;
        b.vx += (car.vx * 0.8 + dx * inv * 3) * k * dt * 10; b.vz += (car.vz * 0.8 + dz * inv * 3) * k * dt * 10;
        b.vy = Math.max(b.vy, Math.min(Math.hypot(b.vx, b.vz), 4) * 0.9);
      }
      if (blast.w > 0.35) {
        const bd = Math.hypot(b.x - blast.x, b.z - blast.y);
        if (bd < blast.z) { const k = (1 - bd / blast.z) * blast.w, inv = bd > 0.01 ? 1 / bd : 0; b.vx += (b.x - blast.x) * inv * 34 * k * dt; b.vz += (b.z - blast.y) * inv * 34 * k * dt; b.vy += 24 * k * dt; }
      }
      const floor = Math.max(heightAt(b.x, b.z), WATER + 0.01) + 0.03;
      const sp = Math.hypot(b.vx, b.vz);
      if (b.y > floor + 0.02) {
        b.vy = Math.max(b.vy - GRAV * 0.5 * dt, -1.2);
        const damp = Math.exp(-2 * dt); b.vx *= damp; b.vz *= damp;
        b.ry += b.spin * dt; b.tilt = Math.sin(t * 7 + b.phase) * 0.9; b.roll = Math.cos(t * 6 + b.phase) * 0.8;
      } else {
        // Skitter: sliding paper slows gently, flips over now and then, and hops when it is going fast
        const damp = Math.exp(-2.4 * dt); b.vx *= damp; b.vz *= damp;
        if (sp > 0.9 && Math.random() < dt * 2) b.vy = 0.8 + Math.random() * 0.8;
        b.ry += b.spin * Math.min(1, sp) * dt;
        b.tilt *= Math.exp(-6 * dt); b.roll *= Math.exp(-6 * dt);
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < floor) { b.y = floor; if (b.vy < 0) b.vy = 0; }
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(b.tilt, b.ry, b.roll);
      o.scale.setScalar(Math.min(1, b.life / 1.2));
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
