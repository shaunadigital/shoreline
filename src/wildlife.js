import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { landSD, coastSD, inPool } from './plan.js';
import { shade } from './shading.js';
import { HUT, LANDING_GRASS } from './layout.js';

// Wildlife (2026-11-12): Shauna's six animal models (Blender, low-poly set, one pivot per moving part, named
// as planned in session 4), each run by a small controller here.
// - Crabs on the beaches wave their claws and scuttle sideways away from the car.
// - Wild roosters peck around the tiki village and the landing grass and scatter, flapping and squawking.
// - Seabirds circle over the beach front and the lighthouse, gliding and flapping.
// - Honu rest on the sand and paddle slowly through the shallows.
// - Dolphins leap out of the sea in arcs near wherever the car is along the coast, with a splash in and out.
// - Butterflies drift round the trees and bushes near the car by day.
// The horn (H) scares the crabs and roosters from further away. Models face +Z; parts swing on their pivots.

const SCALE = { crab: 1.5, rooster: 1.35, seabird: 1.7, turtle: 1.7, dolphin: 2.1, butterfly: 2.6 };
const nm = (o) => o.name.replace(/_/g, ' ');
const rand = (a, b) => a + Math.random() * (b - a);
const shaded = new Set();

function instance(model, scale) {
  const root = new THREE.Group();
  const m = model.clone(true);
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) if (!shaded.has(mat)) { shaded.add(mat); shade(mat); mat.needsUpdate = true; }
    }
  });
  m.scale.setScalar(scale);
  root.add(m);
  const parts = {};
  m.traverse((o) => { if (!o.isMesh && o !== m) parts[nm(o)] = o; });
  return { root, parts };
}

// A spot of open sand: on a beach or a pool bank, not under water, not in a pool
function sandSpot(cx, cz, r, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const x = cx + rand(-r, r), z = cz + rand(-r, r);
    const sd = landSD(x, z);
    if (sd > 1.2 && sd < 6 && !inPool(x, z)) return [x, z];
  }
  return null;
}
const onSand = (x, z) => { const sd = landSD(x, z); return sd > 0.8 && sd < 7.5; };

export class Wildlife {
  constructor(scene, models, { fx, sound, plants }) {
    Object.assign(this, { scene, fx, sound, plants });
    this.crabs = []; this.roosters = []; this.birds = []; this.turtles = []; this.dolphins = []; this.flies = [];
    const add = (kind, n, make) => { if (!models[kind]) return; for (let i = 0; i < n; i++) { const a = instance(models[kind], SCALE[kind]); scene.add(a.root); make(a, i); } };

    // Crabs: along the beaches all round the island
    add('crab', 14, (a, i) => {
      const ang = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      const spot = sandSpot(Math.cos(ang) * 76, Math.sin(ang) * 76, 10) || sandSpot(0, 72, 20) || [0, 75];
      Object.assign(a, { home: spot, x: spot[0], z: spot[1], yaw: rand(0, 6.28), vx: 0, vz: 0, scared: 0, phase: rand(0, 10) });
      this.crabs.push(a);
    });
    // Roosters: the tiki village and the landing grass
    const rHomes = [[HUT[0] + 4, HUT[1] + 5], [HUT[0] - 3, HUT[1] + 6], [HUT[0] + 7, HUT[1] - 1], ...LANDING_GRASS.slice(0, 3).map(([x, z]) => [x, z])];
    add('rooster', rHomes.length, (a, i) => {
      const [hx, hz] = rHomes[i];
      Object.assign(a, { home: [hx, hz], x: hx, z: hz, yaw: rand(0, 6.28), tx: hx, tz: hz, speed: 0, scared: 0, phase: rand(0, 10), peck: 0, hop: 0 });
      this.roosters.push(a);
    });
    // Seabirds: two flocks circling
    const flocks = [[-12, 74, 16], [-70, 18, 13]];
    add('seabird', 9, (a, i) => {
      const [cx, cz, r] = flocks[i % 2];
      Object.assign(a, { cx, cz, r: r + rand(-4, 4), h: rand(9, 13), ang: rand(0, 6.28), speed: rand(0.25, 0.4) * (Math.random() < 0.5 ? 1 : -1), phase: rand(0, 10) });
      this.birds.push(a);
    });
    // Honu: resting on the beach front, then paddling a slow loop through the shallows
    add('turtle', 4, (a, i) => {
      const spot = sandSpot(-20 + i * 9, 76, 6) || [-20 + i * 9, 77];
      Object.assign(a, { x: spot[0], z: spot[1], yaw: rand(0, 6.28), swim: i % 2 === 1, ang: rand(0, 6.28), cx: -20 + i * 9, cz: 84, phase: rand(0, 10) });
      this.turtles.push(a);
    });
    // Dolphins: hidden under the sea until they leap
    add('dolphin', 3, (a) => { a.root.visible = false; Object.assign(a, { wait: rand(2, 8), t: 0, leap: null }); this.dolphins.push(a); });
    // Butterflies
    add('butterfly', 12, (a) => { Object.assign(a, { x: 0, y: -50, z: 0, home: null, phase: rand(0, 10), t: rand(0, 10) }); this.flies.push(a); });
  }

  update(dt, t, { car, night, rain, honkedAt }) {
    const cp = car.position, honk = honkedAt && performance.now() - honkedAt < 400;
    const fear = (x, z, near) => { const d = Math.hypot(x - cp.x, z - cp.z); return d < near || (honk && d < 18) ? d : -1; };

    // ---------- Crabs ----------
    for (const c of this.crabs) {
      const d = fear(c.x, c.z, 7.5);
      if (d >= 0) {
        // Scuttle sideways, away from the car, staying on the sand
        const ax = (c.x - cp.x) / (d || 1), az = (c.z - cp.z) / (d || 1);
        c.vx = ax * 5.5; c.vz = az * 5.5; c.scared = 1.2;
        c.yaw = Math.atan2(-az, ax); // turned so its own sideways (+X) points along the escape: crabs run sideways
      }
      c.scared -= dt;
      const sp = c.scared > 0 ? 1 : 0;
      if (!sp) { c.vx *= 0.9; c.vz *= 0.9; }
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (onSand(nx, nz)) { c.x = nx; c.z = nz; } else { c.vx *= -0.5; c.vz *= -0.5; }
      const step = Math.sin(t * (sp ? 30 : 3) + c.phase);
      c.root.position.set(c.x, heightAt(c.x, c.z) + Math.abs(step) * 0.03 * sp, c.z);
      c.root.rotation.y = c.yaw;
      const P = c.parts;
      if (P['Legs left']) P['Legs left'].rotation.z = step * (sp ? 0.35 : 0.05);
      if (P['Legs right']) P['Legs right'].rotation.z = -step * (sp ? 0.35 : 0.05);
      const wave = sp ? 0.5 : 0.25 * Math.max(0, Math.sin(t * 1.3 + c.phase)); // claws up now and then, high when scared
      if (P['Claw left']) P['Claw left'].rotation.x = -wave * (0.8 + 0.4 * Math.sin(t * 9 + c.phase));
      if (P['Claw right']) P['Claw right'].rotation.x = -wave * (0.8 + 0.4 * Math.sin(t * 9 + c.phase + 1));
    }

    // ---------- Roosters ----------
    for (const r of this.roosters) {
      const d = fear(r.x, r.z, 8);
      if (d >= 0 && r.scared <= 0) {
        // Scatter: run straight away with a squawk and a flutter
        const ax = (r.x - cp.x) / (d || 1), az = (r.z - cp.z) / (d || 1);
        r.tx = r.x + ax * 9 + rand(-2, 2); r.tz = r.z + az * 9 + rand(-2, 2);
        r.scared = 1.6; r.hop = 0.5;
        if (d < 14) this.sound.squawk?.();
      }
      r.scared -= dt;
      if (r.scared <= 0 && Math.hypot(r.tx - r.x, r.tz - r.z) < 0.3 && Math.random() < dt * 0.4) {
        // Wander: a new spot near home every few seconds
        r.tx = r.home[0] + rand(-4, 4); r.tz = r.home[1] + rand(-4, 4);
      }
      const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
      const want = r.scared > 0 ? 7 : dist > 0.3 ? 1.4 : 0;
      r.speed += (want - r.speed) * Math.min(1, dt * 6);
      if (dist > 0.05 && r.speed > 0.05) {
        const nx = r.x + (dx / dist) * r.speed * dt, nz = r.z + (dz / dist) * r.speed * dt;
        if (landSD(nx, nz) > 0.5) { r.x = nx; r.z = nz; } else { r.tx = r.x; r.tz = r.z; }
        r.yaw = Math.atan2(dx, dz);
      }
      r.hop = Math.max(0, r.hop - dt);
      const run = Math.min(1, r.speed / 3), walk = Math.sin(t * (6 + r.speed * 3) + r.phase);
      r.root.position.set(r.x, heightAt(r.x, r.z) + Math.abs(walk) * 0.06 * Math.min(1, r.speed) + Math.sin(r.hop * Math.PI * 2) * 0.35 * (r.hop > 0 ? 1 : 0), r.z);
      r.root.rotation.y = r.yaw;
      const P = r.parts;
      if (P['Leg left']) P['Leg left'].rotation.x = walk * 0.6 * Math.min(1, r.speed);
      if (P['Leg right']) P['Leg right'].rotation.x = -walk * 0.6 * Math.min(1, r.speed);
      const flap = r.scared > 0 ? Math.sin(t * 26) * 0.9 : 0;
      if (P['Wing left']) P['Wing left'].rotation.z = -Math.abs(flap) - run * 0.2;
      if (P['Wing right']) P['Wing right'].rotation.z = Math.abs(flap) + run * 0.2;
      // Pecking when standing still
      r.peck = r.speed < 0.2 ? Math.max(0, Math.sin(t * 2.2 + r.phase)) ** 6 : 0;
      if (P.Head) P.Head.rotation.x = r.peck * 0.9;
      if (P.Tail) P.Tail.rotation.x = Math.sin(t * 3 + r.phase) * 0.05 - run * 0.15;
    }

    // ---------- Seabirds ----------
    for (const b of this.birds) {
      b.ang += b.speed * dt;
      const x = b.cx + Math.cos(b.ang) * b.r, z = b.cz + Math.sin(b.ang) * b.r;
      const y = b.h + Math.sin(t * 0.5 + b.phase) * 0.8;
      b.root.position.set(x, y, z);
      b.root.rotation.set(0, Math.atan2(-Math.sin(b.ang) * Math.sign(b.speed), Math.cos(b.ang) * Math.sign(b.speed)), -0.25 * Math.sign(b.speed)); // banked into the turn
      // Flap a few beats, then glide
      const beat = Math.sin(t * 0.7 + b.phase) > 0.3 ? Math.sin(t * 9 + b.phase) * 0.6 : 0.08;
      if (b.parts['Wing left']) b.parts['Wing left'].rotation.z = beat;
      if (b.parts['Wing right']) b.parts['Wing right'].rotation.z = -beat;
      b.root.visible = rain < 0.6;
    }

    // ---------- Honu ----------
    for (const h of this.turtles) {
      const P = h.parts;
      if (h.swim) {
        // A slow loop through the shallows, half under the water
        h.ang += dt * 0.08;
        const x = h.cx + Math.cos(h.ang) * 6, z = h.cz + Math.sin(h.ang) * 3;
        h.root.position.set(x, -0.32 + Math.sin(t * 0.8 + h.phase) * 0.04, z);
        h.root.rotation.y = Math.atan2(-Math.sin(h.ang) * 6, Math.cos(h.ang) * 3); // facing along the loop
        const s = Math.sin(t * 1.6 + h.phase);
        for (const k of ['Flipper front left', 'Flipper back right']) if (P[k]) P[k].rotation.y = s * 0.5;
        for (const k of ['Flipper front right', 'Flipper back left']) if (P[k]) P[k].rotation.y = -s * 0.5;
      } else {
        // Resting on the sand, head up now and then; slides off into the sea if the car comes close
        const d = fear(h.x, h.z, 6);
        if (d >= 0) { h.swim = true; h.cx = h.x; h.cz = h.z + 6; h.ang = -Math.PI / 2; }
        h.root.position.set(h.x, heightAt(h.x, h.z), h.z);
        h.root.rotation.y = h.yaw;
        if (P.Head) P.Head.rotation.x = -Math.max(0, Math.sin(t * 0.4 + h.phase)) * 0.4;
      }
    }

    // ---------- Dolphins ----------
    for (const dl of this.dolphins) {
      if (!dl.leap) {
        dl.wait -= dt;
        if (dl.wait <= 0) {
          // Leap somewhere in the sea not far from the car, if the car is near enough the coast to see it
          const ang = rand(0, 6.28), r = rand(10, 26);
          const x = cp.x + Math.cos(ang) * r, z = cp.z + Math.sin(ang) * r;
          if (coastSD(x, z) < -7) {
            const dir = rand(0, 6.28), len = rand(5, 8);
            dl.leap = { x, z, dx: Math.sin(dir), dz: Math.cos(dir), len, dur: 1.5, t: 0, h: rand(1.8, 2.6) };
            dl.root.visible = true;
            this.fx.splash(new THREE.Vector3(x, -0.1, z), 1.2);
          }
          dl.wait = rand(4, 11);
        }
      }
      const L = dl.leap;
      if (L) {
        L.t += dt;
        const u = L.t / L.dur;
        const x = L.x + L.dx * L.len * u, z = L.z + L.dz * L.len * u;
        const y = -0.9 + Math.sin(Math.PI * u) * L.h;
        const vy = Math.cos(Math.PI * u) * Math.PI * L.h / L.dur, vh = L.len / L.dur;
        dl.root.position.set(x, y, z);
        dl.root.rotation.set(-Math.atan2(vy, vh), Math.atan2(L.dx, L.dz), 0, 'YXZ');
        if (dl.parts.Tail) dl.parts.Tail.rotation.x = Math.sin(L.t * 14) * 0.25;
        if (u >= 1) { this.fx.splash(new THREE.Vector3(x, -0.1, z), 1.4); dl.leap = null; dl.root.visible = false; }
      }
    }

    // ---------- Butterflies ----------
    const showFlies = night < 0.4 && rain < 0.3;
    for (const f of this.flies) {
      f.root.visible = showFlies;
      if (!showFlies) continue;
      f.t += dt;
      if (!f.home || Math.hypot(f.home[0] - cp.x, f.home[1] - cp.z) > 34) {
        const near = this.plants.filter(([x, z]) => Math.abs(x - cp.x) < 28 && Math.abs(z - cp.z) < 28);
        f.home = near.length ? near[Math.floor(Math.random() * near.length)] : [cp.x + rand(-10, 10), cp.z + rand(-10, 10)];
      }
      const [hx, hz] = f.home;
      const x = hx + Math.sin(f.t * 0.7 + f.phase) * 2.2 + Math.sin(f.t * 1.9) * 0.5;
      const z = hz + Math.cos(f.t * 0.6 + f.phase * 1.3) * 2.2;
      const y = heightAt(hx, hz) + 1.4 + Math.sin(f.t * 1.3 + f.phase) * 0.7 + Math.abs(Math.sin(f.t * 5)) * 0.15;
      const px = f.root.position.x, pz = f.root.position.z;
      f.root.position.set(x, y, z);
      f.root.rotation.y = Math.atan2(x - px, z - pz);
      const flap = Math.sin(f.t * 22 + f.phase) * 0.9;
      if (f.parts['Wing left']) f.parts['Wing left'].rotation.z = flap;
      if (f.parts['Wing right']) f.parts['Wing right'].rotation.z = -flap;
    }
  }
}
