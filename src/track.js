import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TRACK, TRACK_LEN, TRACK_W, CURB_W, GROUND, PLAN, BANK, bankWeight, nearestTrack } from './plan.js';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { shade } from './shading.js';

// The race circuit: an asphalt ribbon with red and white curbs, a dashed center line,
// a checkered start line under the race arch, and a short raised, banked turn on the top straight.
// The lap game is timed from the start line through checkpoints spread around the loop.

const V3 = THREE.Vector3;
const HW = TRACK_W / 2;
const ROAD_Y = GROUND + 0.04; // just above the level ground under it
const ASPHALT = new THREE.Color('#3a4149');
const ASPHALT2 = new THREE.Color('#363d45');
const CURB_RED = new THREE.Color('#e8483c');
const CURB_WHITE = new THREE.Color('#f7f1e4');
const WALL = new THREE.Color('#c9a27a');
const WALL2 = new THREE.Color('#b48b62');
const RAIL = new THREE.Color('#26b7b1');
const nm = (n) => n.replace(/_/g, ' ');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// Road surface at a sample: center height and bank (rise per unit to the right)
function profile(p) {
  const w = bankWeight(p.s);
  // Raise the outside of the turn: the kink bulges north, so the north side (the left, -normal) goes up
  return { y: ROAD_Y + BANK.height * w, slope: -Math.tan(BANK.angle) * w, w };
}
// Offset lines along the circuit. On the inside of a tight corner an offset line would run backwards
// and fold over itself, so there it waits in place until the corner has turned past it.
const offsetCache = new Map();
function offsetLine(lateral) {
  if (offsetCache.has(lateral)) return offsetCache.get(lateral);
  const n = TRACK.length, out = new Array(n);
  const start = nearestTrack(...PLAN.track.startLine); // on a straight, never folded
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n, p = TRACK[i];
    let x = p.x + p.nx * lateral, z = p.z + p.nz * lateral;
    if (prev && (x - prev[0]) * p.tx + (z - prev[1]) * p.tz < 0.02) [x, z] = prev;
    if (k < n) out[i] = [x, z];
    prev = [x, z];
  }
  offsetCache.set(lateral, out);
  return out;
}
export function roadPoint(i, lateral, lift = 0) {
  const k = (i + TRACK.length) % TRACK.length, p = TRACK[k], pr = profile(p);
  const [x, z] = Math.abs(lateral) > 1.5 ? offsetLine(lateral)[k] : [p.x + p.nx * lateral, p.z + p.nz * lateral];
  return new V3(x, pr.y + pr.slope * lateral + lift, z);
}

export class Circuit {
  constructor({ scene, world, island, ui, fx, car, arch }) {
    Object.assign(this, { scene, world, island, ui, fx, car });
    this.buildRoad();
    this.buildMarkings();
    this.buildRaisedSides();
    this.startIdx = nearestTrack(...PLAN.track.startLine);
    if (arch) this.buildArch(arch);
    this.buildRace();
  }

  // ---------- road ribbon ----------
  buildRoad() {
    const pos = [], col = [], phys = [];
    const quad = (a, b, c, d, color) => {
      for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z);
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
      for (const v of [a, b, c, a, c, d]) phys.push(v.x, v.y, v.z);
    };
    const n = TRACK.length;
    const lanes = [-HW - CURB_W, -HW, -HW / 2, 0, HW / 2, HW, HW + CURB_W];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      const stripe = Math.floor(TRACK[i].s / 1.6) % 2 === 0 ? CURB_RED : CURB_WHITE;
      for (let l = 0; l < lanes.length - 1; l++) {
        const a = roadPoint(i, lanes[l]), b = roadPoint(i, lanes[l + 1]), c = roadPoint(j, lanes[l + 1]), d = roadPoint(j, lanes[l]);
        const curb = l === 0 || l === lanes.length - 2;
        if (curb) { const lift = 0.05; for (const v of [a, b, c, d]) v.y += lift; }
        quad(a, b, c, d, curb ? stripe : ((i >> 2) + l) % 2 ? ASPHALT : ASPHALT2);
      }
      // Skirts down to the ground on both edges: a low lip on the flat, a solid embankment under the raised turn
      for (const side of [-1, 1]) {
        const e = side * (HW + CURB_W);
        const a = roadPoint(i, e, 0.05), d = roadPoint(j, e, 0.05);
        const a0 = new V3(a.x, Math.min(heightAt(a.x, a.z), GROUND) - 0.5, a.z), d0 = new V3(d.x, Math.min(heightAt(d.x, d.z), GROUND) - 0.5, d.z);
        if (profile(TRACK[i]).w > 0.02) { a0.y = Math.min(a0.y, -2.5); d0.y = Math.min(d0.y, -2.5); }
        const color = Math.floor(TRACK[i].s / 2) % 2 ? WALL : WALL2;
        if (side > 0) quad(a, a0, d0, d, color); else quad(a, d, d0, a0, color);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.road = mesh;
    const idx = new Uint32Array(phys.length / 3).map((_, k) => k);
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(phys), idx).setFriction(1.0));
  }

  // ---------- dashed center line and checkered start ----------
  buildMarkings() {
    const pos = [], col = [];
    const quad = (a, b, c, d, color) => {
      for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z);
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
    };
    const cream = new THREE.Color('#f2ead6');
    for (let i = 0; i < TRACK.length - 1; i++) {
      if (Math.floor(TRACK[i].s / 2) % 2) continue;
      quad(roadPoint(i, -0.12, 0.012), roadPoint(i, 0.12, 0.012), roadPoint(i + 1, 0.12, 0.012), roadPoint(i + 1, -0.12, 0.012), cream);
    }
    // Checkered start line: 6 squares across, two rows
    const si = nearestTrack(...PLAN.track.startLine);
    const p = TRACK[si];
    const cell = TRACK_W / 6;
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 6; k++) {
        const l0 = -HW + k * cell, l1 = l0 + cell, f0 = (r - 1) * cell, f1 = f0 + cell;
        const at = (l, f) => new V3(p.x + p.nx * l + p.tx * f, ROAD_Y + 0.015, p.z + p.nz * l + p.tz * f);
        quad(at(l0, f0), at(l1, f0), at(l1, f1), at(l0, f1), (k + r) % 2 ? new THREE.Color('#ffffff') : new THREE.Color('#22252a'));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // ---------- rails along the raised turn so you stay on it ----------
  buildRaisedSides() {
    const parts = [];
    const H = 0.7, T = 0.25;
    for (let i = 0; i < TRACK.length; i++) {
      const w = profile(TRACK[i]).w;
      if (w < 0.25) continue;
      for (const side of [-1, 1]) {
        const e = side * (HW + CURB_W + T / 2);
        const a = roadPoint(i, e), b = roadPoint(i + 1, e);
        const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b) + 0.05;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        const g = new THREE.BoxGeometry(T, H, len);
        g.rotateY(yaw); g.translate(mid.x, mid.y + H / 2, mid.z);
        const c = Math.floor(TRACK[i].s / 1.6) % 2 ? CURB_WHITE : RAIL;
        const arr = new Float32Array(g.attributes.position.count * 3);
        for (let k = 0; k < arr.length; k += 3) arr.set([c.r, c.g, c.b], k);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        parts.push(g.toNonIndexed());
        const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw);
        this.island.addStatic(RAPIER.ColliderDesc.cuboid(T / 2, H / 2, len / 2), mid.x, mid.y + H / 2, mid.z, { x: q.x, y: q.y, z: q.z, w: q.w });
      }
    }
    if (!parts.length) return;
    for (const g of parts) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
    const geo = mergeAll(parts);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // ---------- race arch over the start line ----------
  buildArch(model) {
    const p = TRACK[this.startIdx];
    const posts = [];
    model.traverse((o) => { if (o.isMesh && /gate post/i.test(nm(o.name))) posts.push(new THREE.Box3().setFromObject(o)); });
    posts.sort((a, b) => a.min.x - b.min.x);
    const gap = posts.length === 2 ? posts[1].min.x - posts[0].max.x : 2.6;
    const S = (TRACK_W + CURB_W * 2 + 1.2) / gap; // posts stand just outside the curbs
    const yaw = Math.atan2(p.tx, p.tz);
    const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw);
    const base = new V3(p.x, GROUND - 0.02, p.z);
    // The arch is tall over the road: it thins out like the trees when it hides the car
    const mesh = new THREE.Mesh(bakeColored(model), shade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), {}));
    mesh.position.copy(base); mesh.quaternion.copy(q); mesh.scale.setScalar(S);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    for (const b of posts) {
      const c = b.getCenter(new V3()).multiplyScalar(S).applyQuaternion(q).add(base), h = b.getSize(new V3()).multiplyScalar(S / 2);
      this.island.addStatic(RAPIER.ColliderDesc.cuboid(h.x * 0.8, h.y, h.z * 0.8), c.x, c.y, c.z, { x: q.x, y: q.y, z: q.z, w: q.w });
    }
    this.island.blocked.push([p.x + p.nx * (HW + 2), p.z + p.nz * (HW + 2), 3], [p.x - p.nx * (HW + 2), p.z - p.nz * (HW + 2), 3]);
    // Sign on the banner
    const banner = new THREE.Box3();
    model.traverse((o) => { if (o.isMesh && /race banner/i.test(nm(o.name))) banner.expandByObject(o); });
    if (!banner.isEmpty()) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 160;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#c98b57'; ctx.fillRect(0, 0, 512, 160);
      ctx.fillStyle = '#fff5e1'; ctx.font = '400 96px "Shrikhand", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Start', 256, 88);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const bc = banner.getCenter(new V3()), bs = banner.getSize(new V3());
      for (const side of [1, -1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(bs.x * 0.62, bs.y * 0.7), mat);
        sign.position.set(bc.x, bc.y, side > 0 ? banner.max.z + 0.02 : banner.min.z - 0.02);
        if (side < 0) sign.rotation.y = Math.PI;
        mesh.add(sign);
      }
    }
  }

  // ---------- lap race ----------
  buildRace() {
    const COUNT = 8; // checkpoints, the first is the start line
    const n = TRACK.length;
    this.checkpoints = [];
    for (let k = 0; k < COUNT; k++) this.checkpoints.push((this.startIdx + Math.round((k * n) / COUNT)) % n);
    // A glowing strip across the road marks the next checkpoint
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_W + CURB_W * 2, 1.2),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    );
    strip.rotation.order = 'YXZ';
    this.scene.add(strip);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9a1a', emissiveIntensity: 0.4, flatShading: true }));
    marker.rotation.x = Math.PI;
    this.scene.add(marker);
    this.race = { racing: false, next: 0, t0: 0, prev: null, best: Number(store.get('shoreline.circuit') || 0), strip, marker };
    if (this.race.best) this.ui.setStat('race', `${this.race.best.toFixed(1)}s`, 'best lap');
  }

  updateRace(time) {
    const R = this.race, N = this.checkpoints.length;
    const idx = this.checkpoints[R.next], p = TRACK[idx];
    const at = roadPoint(idx, 0, 0.03);
    R.strip.position.copy(at);
    R.strip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(p.nx, 0, p.nz), new V3(p.tx, 0, p.tz), new V3(0, 1, 0)));
    R.strip.material.opacity = 0.35 + 0.25 * Math.sin(time * 5);
    R.marker.position.copy(at).add(new V3(0, 6.5 + Math.sin(time * 3) * 0.4, 0));
    R.marker.rotation.y = time * 2;

    const c = this.car.position;
    const rx = c.x - p.x, rz = c.z - p.z;
    const along = rx * p.tx + rz * p.tz, side = rx * p.nx + rz * p.nz;
    const onRoad = Math.abs(side) < HW + CURB_W + 1.5 && Math.abs(c.y - at.y) < 5;
    const crossed = R.prev !== null && R.prev < 0 && along >= 0 && onRoad;
    R.prev = onRoad && Math.abs(along) < 8 ? along : null;
    if (R.racing) {
      const label = R.next === 0 ? 'Finish' : `Checkpoint ${R.next}/${N - 1}`;
      this.ui.race(`🏁 ${label} · ${(time - R.t0).toFixed(1)}s`);
      if (time - R.t0 > 300) { R.racing = false; R.next = 0; this.ui.race(null); }
    }
    if (!crossed) return;
    R.prev = null;
    if (!R.racing) {
      R.racing = true; R.next = 1; R.t0 = time;
      this.ui.toast('Go! 🏁', 'One lap of the circuit. Hit every checkpoint.', 2200);
    } else if (R.next === 0) {
      const lap = time - R.t0;
      R.racing = false;
      const record = !R.best || lap < R.best;
      if (record) { R.best = lap; store.set('shoreline.circuit', String(lap)); }
      this.ui.race(null);
      this.ui.toast(`Lap: ${lap.toFixed(1)}s`, record ? 'A new best!' : `Best is ${R.best.toFixed(1)}s.`, 2800);
      this.ui.setStat('race', `${R.best.toFixed(1)}s`, 'best lap');
      this.fx.celebrate(c, 5);
      // Crossing the line again starts the next lap straight away
      R.racing = true; R.next = 1; R.t0 = time;
    } else {
      this.fx.sparks(at.clone().add(new V3(0, 1.5, 0)), 20, 4, ['#ffd23f', '#2fd3c4'], { life: 0.7, size: 0.25 });
      R.next = (R.next + 1) % N;
    }
  }

  update(dt, time) {
    this.updateRace(time);
  }
}

function mergeAll(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export { TRACK_LEN };
