import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { landSD, trackDist, TRACK_W, CURB_W } from './plan.js';

// Fallen leaves and petals scattered on the ground, so open ground never looks empty (the reference's
// trick, with our own shapes and colors). Petals gather under each flowering tree in that tree's colors;
// a light scatter of dry leaves and the odd petal covers the rest of the land. One instanced mesh of
// small flat cards cut out by a drawn texture.

const HW = TRACK_W / 2 + CURB_W;
const LEAF_COLORS = ['#c46a3a', '#d8963c', '#9a6236', '#b8543c', '#8f8a3a', '#e3b357'].map((c) => new THREE.Color(c));
const PETAL_COLORS = ['#ef8fb0', '#f4e7d2', '#f6c84b', '#b48cf0'].map((c) => new THREE.Color(c));

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A rounded petal shape: white inside, cut by the alpha test
function petalTexture() {
  const S = 32, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S * 0.42, S * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  return tex;
}

export class Litter {
  // trees: [{ x, z, s, colors: [THREE.Color] }] (flowering trees and bushes, from flora.js)
  constructor(scene, trees, { small = false } = {}) {
    const r = rng(41), items = [];
    const put = (x, z, color, size) => {
      const y = heightAt(x, z);
      if (y < -0.12 || landSD(x, z) < 0.5) return;
      items.push({ x, y, z, color, size });
    };
    // Under each tree: petals in its own colors, thickest near the trunk
    for (const t of trees) {
      const n = Math.round(26 * t.s * (small ? 0.6 : 1));
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.4 * t.s;
        const base = t.colors[Math.floor(r() * t.colors.length)];
        put(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.12), 0.2 + r() * 0.12);
      }
    }
    // Everywhere else: a light scatter, a little thinner on the road
    const count = small ? 4500 : 9000;
    for (let i = 0; i < count; i++) {
      const x = -88 + r() * 176, z = -88 + r() * 176;
      if (trackDist(x, z) < HW && r() < 0.6) continue;
      const petal = r() < 0.2;
      const pal = petal ? PETAL_COLORS : LEAF_COLORS;
      put(x, z, pal[Math.floor(r() * pal.length)].clone().offsetHSL(0, 0, (r() - 0.5) * 0.1), petal ? 0.2 + r() * 0.1 : 0.26 + r() * 0.16);
    }

    const geo = new THREE.PlaneGeometry(1, 0.7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ alphaMap: petalTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, it.y + 0.04, it.z);
      o.rotation.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
      o.scale.setScalar(it.size);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, it.color);
    });
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    this.mesh = mesh;
  }
}
