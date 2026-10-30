import * as THREE from 'three';
import RAPIER from './rapier.js';
import { PATHS, PATH_W, BRIDGES, TRACK_W, CURB_W, GROUND, landSD, trackDist } from './plan.js';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { inSoccer } from './layout.js';

// Sand paths between the zones, and wooden bridges (the pier model) wherever a path crosses a pool.

const nm = (n) => n.replace(/_/g, ' ');
const SAND = new THREE.Color('#e2c48c');
const SAND2 = new THREE.Color('#ddbf86');

export function buildPaths(scene) {
  const pos = [], col = [];
  const hw = PATH_W / 2;
  const skip = (x, z) => landSD(x, z) < 0.3 || trackDist(x, z) < TRACK_W / 2 + CURB_W + 0.2 || inSoccer(x, z, -1.5);
  const pt = (x, z) => new THREE.Vector3(x, heightAt(x, z) + 0.035, z);
  const push = (a, b, c, color) => {
    for (const v of [a, b, c]) pos.push(v.x, v.y, v.z);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i], q = path[i + 1];
      // Normal from the neighbours so the ribbon bends smoothly
      const n0 = normalAt(path, i), n1 = normalAt(path, i + 1);
      if (skip(p.x, p.z) || skip(q.x, q.z)) continue;
      const pieces = 3; // across the path, so it follows small bumps
      for (let k = 0; k < pieces; k++) {
        const a0 = -hw + (k / pieces) * PATH_W, a1 = -hw + ((k + 1) / pieces) * PATH_W;
        const A = pt(p.x + n0[0] * a0, p.z + n0[1] * a0), B = pt(p.x + n0[0] * a1, p.z + n0[1] * a1);
        const C = pt(q.x + n1[0] * a1, q.z + n1[1] * a1), D = pt(q.x + n1[0] * a0, q.z + n1[1] * a0);
        const c = Math.floor(i / 3) % 2 ? SAND : SAND2;
        push(A, B, C, c); push(A, C, D, c);
      }
    }
    // Round ends
    for (const end of [path[0], path[path.length - 1]]) {
      if (skip(end.x, end.z)) continue;
      const seg = 12, ctr = pt(end.x, end.z);
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        push(ctr, pt(end.x + Math.cos(a1) * hw, end.z + Math.sin(a1) * hw), pt(end.x + Math.cos(a0) * hw, end.z + Math.sin(a0) * hw), SAND);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function normalAt(path, i) {
  const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return [-tz / l, tx / l];
}

// Bridges: pier sections laid end to end, deck level with the ground so the car rolls straight on
export function buildBridges(scene, island, model) {
  if (!model) return;
  const deck = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && /deck plank/i.test(nm(o.name))) deck.expandByObject(o); });
  const geo = bakeColored(model, (n) => !/ladder/i.test(nm(n)));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide }); // seaweed ribbons are single faces
  const S = 4.8 / (deck.max.x - deck.min.x); // decks 4.8 wide, whatever the model's size
  const secLen = (deck.max.z - deck.min.z) * S;
  for (const { a, b } of BRIDGES) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L, yaw = Math.atan2(ux, uz);
    const n = Math.max(1, Math.round(L / secLen)), stretch = L / (n * secLen);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const top = GROUND + 0.12;
    const dc = deck.getCenter(new THREE.Vector3());
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = a[0] + dx * t, cz = a[1] + dz * t;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.copy(q);
      mesh.scale.set(S, S, S * stretch);
      // Put the deck centre on the line, deck top at `top`
      const off = new THREE.Vector3(dc.x * S, deck.max.y * S, dc.z * S * stretch).applyQuaternion(q);
      mesh.position.set(cx - off.x, top - off.y, cz - off.z);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
    // One long deck collider, and low side rails so you don't slip into the pool
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const halfW = ((deck.max.x - deck.min.x) * S) / 2;
    const Q = { x: q.x, y: q.y, z: q.z, w: q.w };
    island.addStatic(RAPIER.ColliderDesc.cuboid(halfW, 0.15, L / 2 + 0.5).setFriction(1), mid[0], top - 0.15, mid[1], Q);
    for (const s of [-1, 1]) {
      island.addStatic(RAPIER.ColliderDesc.cuboid(0.12, 0.45, L / 2 - 1.5), mid[0] + uz * s * (halfW + 0.1), top + 0.45, mid[1] - ux * s * (halfW + 0.1), Q);
    }
    // Gentle ramps where the deck meets the sand at both ends
    for (const [ex, ez, sgn] of [[a[0], a[1], -1], [b[0], b[1], 1]]) {
      const g = heightAt(ex + ux * sgn * 1.5, ez + uz * sgn * 1.5);
      if (top - g < 0.25) continue;
      const len = 3, ang = Math.atan2(top - g, len);
      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(sgn * ang, yaw, 0, 'YXZ'));
      island.addStatic(RAPIER.ColliderDesc.cuboid(halfW, 0.1, len / 2), ex + ux * sgn * (len / 2 + 0.3), (top + g) / 2 - 0.1, ez + uz * sgn * (len / 2 + 0.3), { x: rq.x, y: rq.y, z: rq.z, w: rq.w });
    }
  }
}
