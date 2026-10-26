import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { landSD, PLAN, GROUND } from './plan.js';
import { shade } from './shading.js';

// Shauna's flowering trees and bushes (the grass lives in grass.js).
// Each tree is baked into two instanced meshes (trunk and leafy top) so a whole species
// costs two draw calls and the tops sway on their own, like the palms.

const nm = (n) => n.replace(/_/g, ' ');
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const CELL = 42; // map cell size for splitting instanced meshes
// Trees thin out when they stand between the camera and the car
const topMat = shade(vcMat.clone(), { seeThrough: true });

// Trunk parts by name; everything else is the leafy top. `scale` is [min, max], `trunkR` the collider radius before scaling.
// Scales give trees 6 to 8 tall, the reference's tree to car ratio (its trees are 7 to 9 tall against a 3.25 car).
const SPECIES = {
  poinciana: { trunk: /trunk|root flare|branch/i, scale: [2.4, 2.7], trunkR: 0.3, weight: 1, sway: 0.7 },
  jacaranda: { trunk: /trunk|branch/i, scale: [2.5, 2.9], trunkR: 0.22, weight: 1, sway: 1 },
  plumeria: { trunk: /trunk|fork|bare branch|knot/i, scale: [3.0, 3.4], trunkR: 0.3, weight: 1, sway: 0.9 },
  goldenShower: { trunk: /trunk|root flare|shower branch/i, scale: [2.6, 3.0], trunkR: 0.28, weight: 1, sway: 1 },
};
const BUSHES = {
  hibiscus: { scale: [1.2, 1.6], weight: 1 },
  monstera: { scale: [1.4, 1.9], weight: 1 },
};

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Flora {
  // models: { poinciana, jacaranda, plumeria, goldenShower, hibiscus, monstera } (any may be null)
  constructor(scene, world, island, models) {
    Object.assign(this, { scene, world, island });
    this.groups = [];
    this.rand = rng(23);
    const trees = Object.entries(SPECIES).filter(([k]) => models[k]);
    const bushes = Object.entries(BUSHES).filter(([k]) => models[k]);
    this.placeTrees(trees, models, 120);
    this.placeBushes(bushes, models, 90);
  }

  // A species baked for instancing: trunk geometry, top geometry with its pivot at the base of the canopy
  bake(model, trunkRe) {
    const isTrunk = (n) => (trunkRe ? trunkRe.test(nm(n)) : false);
    const trunk = trunkRe ? bakeColored(model, isTrunk) : null;
    const top = bakeColored(model, (n) => !isTrunk(n));
    top.computeBoundingBox();
    const pivotY = trunkRe ? top.boundingBox.min.y + (top.boundingBox.max.y - top.boundingBox.min.y) * 0.2 : 0;
    top.translate(0, -pivotY, 0);
    return { trunk, top, pivotY, height: top.boundingBox.max.y };
  }

  // Instances are split into map cells so the camera only draws the cells it can see
  addGroup(baked, spots, sway, bush = false) {
    const cells = new Map();
    for (const p of spots) {
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const list of cells.values()) {
      const g = { spots: list, pivot: new THREE.Vector3(0, baked.pivotY, 0), sway, bush };
      if (baked.trunk) {
        g.trunks = new THREE.InstancedMesh(baked.trunk, topMat, list.length); // branches reach into the canopy, so they thin out too
        g.trunks.castShadow = true;
        this.scene.add(g.trunks);
      }
      g.tops = new THREE.InstancedMesh(baked.top, bush ? vcMat : topMat, list.length);
      g.tops.castShadow = true;
      g.tops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(g.tops);
      list.forEach((p, i) => {
        p.base = m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(p.s, p.s, p.s)).clone();
        if (g.trunks) g.trunks.setMatrixAt(i, p.base);
      });
      if (g.trunks) { g.trunks.instanceMatrix.needsUpdate = true; g.trunks.computeBoundingSphere(); }
      this.groups.push(g);
      this.updateGroup(g, 0);
      g.tops.computeBoundingSphere();
      g.tops.boundingSphere.radius += 1; // room for the sway
    }
  }

  // Random dry, open spot (off the circuit, paths, zones and props). `lo`/`hi` limit the distance to water.
  spot(lo, hi, pad) {
    const r = this.rand;
    for (let t = 0; t < 400; t++) {
      const x = -84 + r() * 168, z = -84 + r() * 168;
      const sd = landSD(x, z);
      if (sd < lo || sd > hi) continue;
      if (!this.island.isOpen(x, z, pad)) continue;
      const y = heightAt(x, z);
      if (y < GROUND - 0.3) continue;
      return { x, z, y };
    }
    return null;
  }

  placeTrees(species, models, count) {
    if (!species.length) return;
    const r = this.rand;
    const spots = Object.fromEntries(species.map(([k]) => [k, []]));
    const baked = Object.fromEntries(species.map(([k, s]) => [k, this.bake(models[k], s.trunk)]));
    for (let i = 0; i < count; i++) {
      const [k, s] = species[i % species.length];
      const sc = s.scale[0] + r() * (s.scale[1] - s.scale[0]);
      const p = this.spot(6, 60, 0.8 * sc);
      if (!p) continue;
      spots[k].push({ ...p, y: p.y - 0.05, yaw: r() * Math.PI * 2, s: sc, phase: r() * 10, amt: 0.6 + r() * 0.6 });
      this.island.addStatic(RAPIER.ColliderDesc.cylinder(1.4, s.trunkR * sc), p.x, p.y + 1.4, p.z);
      this.island.blocked.push([p.x, p.z, 1.4 * sc]);
    }
    for (const [k, s] of species) this.addGroup(baked[k], spots[k], s.sway);
  }

  // Bushes: no collider, you drive straight through them and they shake
  placeBushes(kinds, models, count) {
    if (!kinds.length) return;
    const r = this.rand;
    for (const [k, b] of kinds) {
      const baked = this.bake(models[k], null);
      const spots = [];
      for (let i = 0; i < count / kinds.length; i++) {
        const sc = b.scale[0] + r() * (b.scale[1] - b.scale[0]);
        // Bushes like the edges: along paths and pool shores as well as open grass
        const p = this.spot(3, 60, 0.4);
        if (!p) continue;
        spots.push({ ...p, y: p.y - 0.05, yaw: r() * Math.PI * 2, s: sc, phase: r() * 10, amt: 1, hit: 0 });
        this.island.blocked.push([p.x, p.z, 1.1 * sc]);
      }
      this.addGroup(baked, spots, 0.6, true);
    }
  }

  updateGroup(g, t, carPos) {
    const m = new THREE.Matrix4(), c = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    g.spots.forEach((p, i) => {
      let shake = 0;
      if (g.bush && carPos) {
        const d = Math.hypot(carPos.x - p.x, carPos.z - p.z);
        if (d < 1.6 * p.s) p.hit = 1;
        p.hit *= 0.96;
        shake = p.hit * Math.sin(t * 22 + p.phase) * 0.25;
      }
      const w = Math.sin(t * 1.1 + p.phase) * 0.5 + Math.sin(t * 2.3 + p.phase * 1.7) * 0.25;
      e.set(Math.sin(t * 1.5 + p.phase) * 0.03 * p.amt * g.sway + shake, 0, w * 0.06 * p.amt * g.sway + shake * 0.7);
      c.compose(g.pivot, q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      m.copy(p.base).multiply(c);
      g.tops.setMatrixAt(i, m);
    });
    g.tops.instanceMatrix.needsUpdate = true;
  }

  update(t, carPos) {
    // Sway only the cells near the car (the rest are hidden by distance and fog)
    for (const g of this.groups) {
      const c = g.tops.boundingSphere.center;
      if (!carPos || Math.hypot(c.x - carPos.x, c.z - carPos.z) < 95) this.updateGroup(g, t, carPos);
    }
  }
}

export { PLAN };
