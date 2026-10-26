import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { landSD, PLAN, GROUND } from './plan.js';

// Shauna's flowering trees and bushes, plus instanced grass blades made in code.
// Each tree is baked into two instanced meshes (trunk and leafy top) so a whole species
// costs two draw calls and the tops sway on their own, like the palms.

const nm = (n) => n.replace(/_/g, ' ');
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const CELL = 42; // map cell size for splitting instanced meshes

// Trunk parts by name; everything else is the leafy top. `scale` is [min, max], `trunkR` the collider radius before scaling.
const SPECIES = {
  poinciana: { trunk: /trunk|root flare|branch/i, scale: [2.1, 2.6], trunkR: 0.3, weight: 1, sway: 0.7 },
  jacaranda: { trunk: /trunk|branch/i, scale: [2.2, 2.7], trunkR: 0.22, weight: 1, sway: 1 },
  plumeria: { trunk: /trunk|fork|bare branch|knot/i, scale: [2.3, 2.8], trunkR: 0.3, weight: 1, sway: 0.9 },
  goldenShower: { trunk: /trunk|root flare|shower branch/i, scale: [2.2, 2.7], trunkR: 0.28, weight: 1, sway: 1 },
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
    this.buildGrass(innerWidth < 800 ? 9000 : 18000);
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
        g.trunks = new THREE.InstancedMesh(baked.trunk, vcMat, list.length);
        g.trunks.castShadow = true;
        this.scene.add(g.trunks);
      }
      g.tops = new THREE.InstancedMesh(baked.top, vcMat, list.length);
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

  // ---------- grass ----------
  buildGrass(count) {
    // One tuft: three bent blades, tip at uv.y = 1 for the wind
    const blades = [];
    for (let b = 0; b < 3; b++) {
      const g = new THREE.BufferGeometry();
      const h = 0.36 + b * 0.08, w = 0.09;
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.02, h, 0.05], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      g.rotateY((b / 3) * Math.PI * 2 + 0.4);
      g.translate(Math.cos(b * 2.1) * 0.08, 0, Math.sin(b * 2.1) * 0.08);
      blades.push(g);
    }
    const geo = mergeTris(blades);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    this.grassTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vTip;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTip = uv.y;
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gust = sin(uTime * 1.6 + wp.x * 0.15 + wp.z * 0.1) * 0.6 + sin(uTime * 3.1 + wp.x * 0.4) * 0.25;
          transformed.x += gust * 0.12 * uv.y * uv.y;
          transformed.z += gust * 0.06 * uv.y * uv.y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mix(vec3(0.09, 0.30, 0.10), vec3(0.42, 0.70, 0.20), vTip), opacity );')
        // Both sides of a blade are lit as if facing up (no flipping for the back face)
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
    };
    const r = this.rand, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const cells = new Map();
    let n = 0;
    for (let t = 0; t < count * 6 && n < count; t++) {
      // Clumps: pick a centre, scatter tufts around it
      const x0 = -84 + r() * 168, z0 = -84 + r() * 168;
      if (landSD(x0, z0) < 5.5 || !this.island.isOpen(x0, z0, 0.3)) continue;
      const k = 4 + Math.floor(r() * 7);
      const key = `${Math.floor(x0 / CELL)},${Math.floor(z0 / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      for (let j = 0; j < k && n < count; j++) {
        const x = x0 + (r() - 0.5) * 2.4, z = z0 + (r() - 0.5) * 2.4;
        if (landSD(x, z) < 5) continue;
        const s = 0.8 + r() * 0.7;
        cells.get(key).push(m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.02, z), q.setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(s, s * (0.8 + r() * 0.5), s)).clone());
        n++;
      }
    }
    this.grass = [];
    for (const list of cells.values()) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.grass.push(mesh);
    }
    this.grassCount = n;
  }

  update(t, carPos) {
    // Sway only the cells near the car (the rest are hidden by distance and fog)
    for (const g of this.groups) {
      const c = g.tops.boundingSphere.center;
      if (!carPos || Math.hypot(c.x - carPos.x, c.z - carPos.z) < 95) this.updateGroup(g, t, carPos);
    }
    if (this.grassTime) this.grassTime.value = t;
  }
}

function mergeTris(geos) {
  const pos = [], uv = [];
  for (const g of geos) { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeVertexNormals();
  // Light the blades as if they faced up, so they don't go dark side-on
  const nrm = out.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return out;
}

export { PLAN };
