import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { landSD, PLAN, GROUND } from './plan.js';
import { shade } from './shading.js';
import { Foliage } from './foliage.js';

// Shauna's flowering trees and bushes (the grass lives in grass.js).
// Trunks and branches stay her models. The leafy canopy becomes leaf clumps (foliage.js), the way the
// reference site draws its trees: each of her canopy parts marks where a clump goes, how big it is and its
// color. Flowers that hang or sit on top (blossoms, golden shower bunches) stay her models and sway.

const nm = (n) => n.replace(/_/g, ' ');
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const CELL = 42; // map cell size for splitting instanced meshes
// Trees thin out when they stand between the camera and the car
const topMat = shade(vcMat.clone(), { seeThrough: true });

// Parts by name: `trunk` stays a model, `clump` parts become leaf clumps of about `clumpR` (model units),
// anything else (flowers) stays a model that sways. `scale` is [min, max], `trunkR` the collider radius before scaling.
// Scales give trees 6 to 8 tall, the reference's tree to car ratio (its trees are 7 to 9 tall against a 3.25 car).
const SPECIES = {
  poinciana: { trunk: /trunk|root flare|branch/i, clump: /canopy/i, clumpR: 0.42, scale: [2.4, 2.7], trunkR: 0.3, sway: 0.7 },
  jacaranda: { trunk: /trunk|branch/i, clump: /cluster|crown|green patch/i, clumpR: 0.4, scale: [2.5, 2.9], trunkR: 0.22, sway: 1 },
  plumeria: { trunk: /trunk|fork|bare branch|knot/i, clump: /long plumeria leaf/i, clumpR: 0.3, scale: [3.0, 3.4], trunkR: 0.3, sway: 0.9 },
  goldenShower: { trunk: /trunk|root flare|shower branch/i, clump: /canopy/i, clumpR: 0.45, scale: [2.6, 3.0], trunkR: 0.28, sway: 1 },
};
// Bushes have no collider: you drive through them and they shake. The monstera keeps its own big split leaves,
// which leaf clumps would lose.
const BUSHES = {
  hibiscus: { trunk: /woody stem/i, clump: /shrub core|glossy hibiscus leaf|shrub center/i, clumpR: 0.36, scale: [1.2, 1.6] },
  monstera: { trunk: null, clump: null, scale: [1.4, 1.9] },
};
// Which way the camera looks from (its default direction), for turning the leaf cards toward it
const TOWARD_CAMERA = new THREE.Vector3().setFromSphericalCoords(1, Math.PI * 0.27, Math.PI * 0.25);

// Where a species' leaf clumps go: its canopy parts, grouped by color and merged into balls about `R` across
function clumpTemplates(model, re, R) {
  if (!re) return [];
  const groups = new Map();
  model.traverse((o) => {
    if (!o.isMesh || !re.test(nm(o.name))) return;
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const key = o.material.color.getHexString();
    if (!groups.has(key)) groups.set(key, { color: o.material.color.clone(), parts: [] });
    groups.get(key).parts.push({ c, r: Math.max(size.x, size.y, size.z) / 2 });
  });
  const out = [];
  for (const { color, parts } of groups.values()) {
    const clusters = [];
    for (const p of parts) {
      const near = clusters.find((k) => k.c.distanceTo(p.c) < R * 1.2); // only close parts merge, so clumps stay separate and branches show
      if (near) { near.members.push(p); near.c.lerp(p.c, 1 / near.members.length); }
      else clusters.push({ c: p.c.clone(), members: [p] });
    }
    for (const k of clusters) {
      const spread = Math.max(...k.members.map((m) => k.c.distanceTo(m.c) + m.r * 0.7));
      out.push({ c: k.c, r: THREE.MathUtils.clamp(spread, R * 0.6, R * 1.1), color });
    }
  }
  return out;
}

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
    this.foliage = new Foliage(scene, TOWARD_CAMERA, { small: Math.min(innerWidth, innerHeight) < 600 });
    this.bushClumps = [];
    const trees = Object.entries(SPECIES).filter(([k]) => models[k]);
    const bushes = Object.entries(BUSHES).filter(([k]) => models[k]);
    this.placeTrees(trees, models, 120);
    this.placeBushes(bushes, models, 90);
    this.foliage.build(CELL);
  }

  // Leaf clumps for one plant placed at p (x, y, z, yaw, s)
  addClumps(templates, p) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), r = this.rand, ids = [];
    const hue = (r() - 0.5) * 0.04; // each plant a slightly different hue
    for (const t of templates) {
      const c = t.c.clone().multiplyScalar(p.s).applyQuaternion(q).add(new THREE.Vector3(p.x, p.y, p.z));
      ids.push(this.foliage.add(c, t.r * p.s, t.color, r(), hue));
    }
    return ids;
  }

  // A species baked for instancing: trunk geometry, top geometry with its pivot at the base of the canopy
  bake(model, trunkRe, clumpRe = null) {
    const isTrunk = (n) => (trunkRe ? trunkRe.test(nm(n)) : false);
    const isClump = (n) => (clumpRe ? clumpRe.test(nm(n)) : false);
    const trunk = trunkRe ? bakeColored(model, isTrunk) : null;
    const top = bakeColored(model, (n) => !isTrunk(n) && !isClump(n)); // flowers, or the whole plant when it has no clumps
    let pivotY = 0;
    if (top) {
      top.computeBoundingBox();
      pivotY = trunkRe ? top.boundingBox.min.y + (top.boundingBox.max.y - top.boundingBox.min.y) * 0.2 : 0;
      top.translate(0, -pivotY, 0);
    }
    return { trunk, top, pivotY };
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
        g.trunks = new THREE.InstancedMesh(baked.trunk, bush ? vcMat : topMat, list.length); // tree branches reach into the canopy, so they thin out too
        g.trunks.castShadow = true;
        this.scene.add(g.trunks);
      }
      if (baked.top) {
        g.tops = new THREE.InstancedMesh(baked.top, bush ? vcMat : topMat, list.length);
        g.tops.castShadow = true;
        g.tops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(g.tops);
      }
      list.forEach((p, i) => {
        p.base = m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(p.s, p.s, p.s)).clone();
        if (g.trunks) g.trunks.setMatrixAt(i, p.base);
      });
      if (g.trunks) { g.trunks.instanceMatrix.needsUpdate = true; g.trunks.computeBoundingSphere(); }
      if (!g.tops) continue;
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
    const baked = Object.fromEntries(species.map(([k, s]) => [k, this.bake(models[k], s.trunk, s.clump)]));
    const templates = Object.fromEntries(species.map(([k, s]) => [k, clumpTemplates(models[k], s.clump, s.clumpR)]));
    this.clumpCounts = Object.fromEntries(species.map(([k]) => [k, templates[k].length]));
    for (let i = 0; i < count; i++) {
      const [k, s] = species[i % species.length];
      const sc = s.scale[0] + r() * (s.scale[1] - s.scale[0]);
      const p = this.spot(6, 60, 0.8 * sc);
      if (!p) continue;
      const spot = { ...p, y: p.y - 0.05, yaw: r() * Math.PI * 2, s: sc, phase: r() * 10, amt: 0.3 + r() * 0.3 };
      spots[k].push(spot);
      this.addClumps(templates[k], spot);
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
      const baked = this.bake(models[k], b.trunk, b.clump);
      const templates = clumpTemplates(models[k], b.clump, b.clumpR);
      const spots = [];
      for (let i = 0; i < count / kinds.length; i++) {
        const sc = b.scale[0] + r() * (b.scale[1] - b.scale[0]);
        // Bushes like the edges: along paths and pool shores as well as open grass
        const p = this.spot(3, 60, 0.4);
        if (!p) continue;
        const spot = { ...p, y: p.y - 0.05, yaw: r() * Math.PI * 2, s: sc, phase: r() * 10, amt: 1, hit: 0 };
        spot.clumps = this.addClumps(templates, spot);
        if (spot.clumps.length) this.bushClumps.push(spot);
        spots.push(spot);
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
    this.foliage.update(t);
    // Bushes the car drives through shake their leaf clumps
    if (carPos) for (const b of this.bushClumps) {
      const d = Math.hypot(carPos.x - b.x, carPos.z - b.z);
      if (d < 1.6 * b.s) b.hitC = 1;
      if (!b.hitC) continue;
      b.hitC *= 0.96;
      const k = b.hitC < 0.02 ? 0 : b.hitC;
      if (!k) b.hitC = 0;
      for (const id of b.clumps) this.foliage.nudge(id, new THREE.Vector3(Math.sin(t * 22 + id) * 0.18 * k, Math.abs(Math.sin(t * 17 + id)) * 0.06 * k, Math.cos(t * 19 + id) * 0.18 * k));
    }
    // Sway only the cells near the car (the rest are hidden by distance and fog)
    for (const g of this.groups) {
      const c = g.tops.boundingSphere.center;
      if (!carPos || Math.hypot(c.x - carPos.x, c.z - carPos.z) < 95) this.updateGroup(g, t, carPos);
    }
  }
}

export { PLAN };
