import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { heightAt, coastDistance } from './terrain.js';
import { bakeColored } from './models.js';

// Seeded random so the island layout is the same every visit
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flatMat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...extra });
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });

function painted(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

// Island bounds (game units) for scattering props
export const BOUNDS = { x0: -48, x1: 70, z0: -44, z1: 47 };
// Random point on the island whose distance from the shore is within [lo, hi]
export function randomSpot(r, lo, hi, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const x = BOUNDS.x0 + r() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + r() * (BOUNDS.z1 - BOUNDS.z0);
    const sd = coastDistance(x, z);
    if (sd >= lo && sd <= hi) return [x, z, sd];
  }
  return null;
}

export class World {
  constructor(scene, world, models = {}) {
    this.scene = scene;
    this.models = models;
    this.world = world;
    this.dynamic = [];
    this.swayers = [];
    this.flames = [];
    this.clouds = [];
    this.floaters = [];
    this.font = new FontLoader().parse(fontJson);
    this.rand = rng(7);
    this.blocked = [
      // zones kept clear of trees: [x, z, radius]
      [0, 0, 9], [2, 13, 11], [0, -9, 13], [0, -15, 6], [0, -24, 5], [-7.5, 21, 6], [-7.5, 28, 5], [6, -17, 5], [-6, -22, 6], [36, 35, 7],
    ];

    this.buildPalms(70);
    this.buildRocks(26);
    this.buildLetters('SHORELINE');
    this.buildRamps();
    this.buildCrates();
    this.buildBeachBalls();
    this.buildHut(-6, -22);
    this.buildBoat();
    this.buildClouds();
  }

  isClear(x, z, pad = 0) {
    return this.blocked.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r + pad);
  }

  addDynamic(mesh, body) {
    this.dynamic.push({ mesh, body });
    this.scene.add(mesh);
  }

  addStatic(desc, x, y, z, rot) {
    const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    if (rot) b.setRotation(rot, false);
    this.world.createCollider(desc, b);
    return b;
  }

  // ---------- Palms ----------
  makePalm(r, height) {
    const lean = r() * Math.PI * 2;
    const leanAmt = 0.08 + r() * 0.12;
    const trunkParts = [];
    const segs = 7;
    const segH = height / segs;
    let p = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      const rad = THREE.MathUtils.lerp(0.26, 0.15, i / segs);
      const g = new THREE.CylinderGeometry(rad * 0.92, rad, segH * 1.05, 6);
      const off = (i * i) * leanAmt * 0.06;
      g.translate(Math.cos(lean) * off, p.y + segH / 2, Math.sin(lean) * off);
      trunkParts.push(painted(g, i % 2 ? '#a9784e' : '#94653f'));
      p.y += segH;
    }
    const topOff = (segs * segs) * leanAmt * 0.06;
    const top = new THREE.Vector3(Math.cos(lean) * topOff, height, Math.sin(lean) * topOff);
    const trunk = new THREE.Mesh(mergeGeometries(trunkParts), vcMat);
    trunk.castShadow = true;

    const crownParts = [];
    const fronds = 7 + Math.floor(r() * 3);
    for (let i = 0; i < fronds; i++) {
      const len = 2.2 + r() * 0.8;
      const g = new THREE.ConeGeometry(0.45, len, 4, 3);
      // Droop: bend the cone downward along its length
      const pa = g.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const y = pa.getY(k) + len / 2; // 0 at base, len at tip
        pa.setZ(k, pa.getZ(k) * 0.18);
        pa.setX(k, pa.getX(k) - (y / len) ** 2 * 0.9 * len * 0.45);
      }
      g.translate(0, len / 2, 0);
      g.rotateZ(-Math.PI / 2 + 0.35 + r() * 0.3); // tip outward
      g.rotateY((i / fronds) * Math.PI * 2 + r() * 0.3);
      const shade = ['#3fae5a', '#4cbf62', '#2f9a52', '#5ccf6b'][i % 4];
      crownParts.push(painted(g, shade));
    }
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(0.16, 0);
      const a = (i / 3) * Math.PI * 2;
      g.translate(Math.cos(a) * 0.2, -0.2, Math.sin(a) * 0.2);
      crownParts.push(painted(g, '#6b4a2b'));
    }
    const crown = new THREE.Mesh(mergeGeometries(crownParts), vcMat);
    crown.position.copy(top);
    crown.castShadow = true;

    const palm = new THREE.Group();
    palm.add(trunk, crown);
    return { palm, crown };
  }

  buildPalms(count) {
    const r = this.rand;
    this.palmSpots = [];
    let placed = 0, tries = 0;
    while (placed < count && tries < 3000) {
      tries++;
      // Mostly along the coast, some inland
      const spot = randomSpot(r, 2.5, r() < 0.7 ? 14 : 60);
      if (!spot) continue;
      const [x, z] = spot;
      const h = heightAt(x, z);
      if (h < 0.4 || h > 5 || !this.isClear(x, z, 1.5)) continue;
      const height = 3.8 + r() * 2.4;
      if (this.models.palm) {
        this.palmSpots.push({ x, y: h - 0.05, z, yaw: r() * Math.PI * 2, scale: 1.15 + r() * 0.55, phase: r() * 10, amt: 0.6 + r() * 0.6 });
      } else {
        const { palm, crown } = this.makePalm(r, height);
        palm.position.set(x, h - 0.1, z);
        this.scene.add(palm);
        this.swayers.push({ palm, crown, phase: r() * 10, amt: 0.6 + r() * 0.6 });
      }
      this.addStatic(RAPIER.ColliderDesc.cylinder(1.5, 0.28), x, h + 1.4, z);
      this.blocked.push([x, z, 2.2]);
      placed++;
    }
    if (this.models.palm) this.buildPalmInstances();
    // A few beach bushes
    for (let i = 0; i < 70; i++) {
      const spot = randomSpot(r, 6, 60);
      if (!spot) continue;
      const [x, z] = spot;
      if (!this.isClear(x, z) || heightAt(x, z) < 0.5) continue;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + r() * 0.4, 0), flatMat(r() > 0.5 ? '#3d9f55' : '#58b85e'));
      b.scale.y = 0.7;
      b.position.set(x, heightAt(x, z) + 0.15, z);
      b.castShadow = true;
      this.scene.add(b);
      // A pop of hibiscus pink on some bushes
      if (r() > 0.55) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), flatMat('#ff5c8a', { emissive: '#ff2d6f', emissiveIntensity: 0.15 }));
        f.position.set(x + 0.3, heightAt(x, z) + 0.55, z + 0.2);
        this.scene.add(f);
      }
    }
  }

  // Palm model: trunk and crown baked separately and drawn as two instanced meshes,
  // so all palms cost two draw calls and the crowns can sway on their own.
  buildPalmInstances() {
    const isCrown = (n) => /frond|coconut/i.test(n);
    const trunkGeo = bakeColored(this.models.palm, (n) => !isCrown(n));
    const crownGeo = bakeColored(this.models.palm, isCrown);
    this.crownPivot = new THREE.Vector3(0.05, 2.85, 0);
    crownGeo.translate(-this.crownPivot.x, -this.crownPivot.y, -this.crownPivot.z);
    const n = this.palmSpots.length;
    this.palmTrunks = new THREE.InstancedMesh(trunkGeo, vcMat, n);
    this.palmCrowns = new THREE.InstancedMesh(crownGeo, vcMat, n);
    for (const m of [this.palmTrunks, this.palmCrowns]) {
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    this._m = new THREE.Matrix4(); this._c = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.updatePalms(0);
  }

  updatePalms(t) {
    const { _m: m, _c: c, _q: q, _e: e } = this;
    this.palmSpots.forEach((p, i) => {
      const w = Math.sin(t * 1.1 + p.phase) * 0.5 + Math.sin(t * 2.3 + p.phase * 1.7) * 0.25;
      // Whole tree leans a touch, the crown sways more
      e.set(Math.cos(t * 0.9 + p.phase) * 0.012 * p.amt, p.yaw, w * 0.02 * p.amt, 'YXZ');
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromEuler(e), new THREE.Vector3(p.scale, p.scale, p.scale));
      this.palmTrunks.setMatrixAt(i, m);
      e.set(Math.sin(t * 1.7 + p.phase) * 0.06 * p.amt, 0, w * 0.1 * p.amt);
      c.compose(this.crownPivot, q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      this.palmCrowns.setMatrixAt(i, m.clone().multiply(c));
    });
    this.palmTrunks.instanceMatrix.needsUpdate = true;
    this.palmCrowns.instanceMatrix.needsUpdate = true;
  }

  buildRocks(count) {
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const spot = randomSpot(r, -1.5, 5);
      if (!spot) continue;
      const [x, z] = spot;
      if (!this.isClear(x, z)) continue;
      const s = 0.6 + r() * 1.4;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), flatMat(r() > 0.5 ? '#9a8a7e' : '#b3a18f'));
      m.scale.set(1, 0.65, 1.2);
      m.rotation.set(r(), r() * 3, r());
      const y = heightAt(x, z);
      m.position.set(x, y + s * 0.2, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.addStatic(RAPIER.ColliderDesc.ball(s * 0.75), x, y + s * 0.15, z);
    }
  }

  // ---------- Knock-over name letters ----------
  buildLetters(word) {
    const m = flatMat('#fff5e1');
    const accent = flatMat('#ff7a59');
    let x = -9.6;
    const z = -9;
    for (const [i, ch] of [...word].entries()) {
      const g = new TextGeometry(ch, { font: this.font, size: 1.7, depth: 0.7, curveSegments: 3, bevelEnabled: false });
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
      g.translate(-(bb.min.x + w / 2), -(bb.min.y + h / 2), -(bb.min.z + d / 2));
      const mesh = new THREE.Mesh(g, i >= 5 ? accent : m);
      mesh.castShadow = mesh.receiveShadow = true;
      const cx = x + w / 2;
      const y = heightAt(cx, z) + h / 2 + 0.02;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, y, z));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setDensity(12).setFriction(0.8), body);
      this.addDynamic(mesh, body);
      x += w + 0.35;
    }
  }

  // ---------- Ramps ----------
  buildRamps() {
    const ramp = (x, z, yaw, len = 5, wid = 3.2, tilt = 0.27) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt, 'YXZ'));
      const y = heightAt(x, z) + Math.sin(tilt) * (len / 2) - 0.25;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, wid), flatMat('#c98b57'));
      mesh.position.set(x, y, z);
      mesh.quaternion.copy(q);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      // Stripes so it reads as a jump
      for (let i = -1; i <= 1; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.32, 0.3), flatMat('#ff7a59'));
        s.position.set(0, 0, i * 0.9);
        mesh.add(s);
      }
      this.addStatic(RAPIER.ColliderDesc.cuboid(len / 2, 0.15, wid / 2).setFriction(1), x, y, z, { x: q.x, y: q.y, z: q.z, w: q.w });
    };
    // Both launch away from the spawn across flat ground: one north toward the North Shore, one south
    ramp(0, -15, Math.PI / 2);
    ramp(-7.5, 21, -Math.PI / 2);
  }

  // ---------- Crates & balls ----------
  buildCrates() {
    const mats = [flatMat('#d9a066'), flatMat('#c48a52')];
    const base = new THREE.Vector3(6, 0, -17);
    const s = 0.9;
    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3 - row; i++) {
        const x = base.x;
        const z = base.z + (i - (2 - row) / 2) * (s + 0.05);
        const y = heightAt(x, z) + s / 2 + row * s + 0.02;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mats[n++ % 2]);
        const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.02, 0.12, s + 0.02), flatMat('#8a5a33'));
        mesh.add(band);
        mesh.castShadow = mesh.receiveShadow = true;
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2).setDensity(14), body);
        this.addDynamic(mesh, body);
      }
    }
  }

  buildBeachBalls() {
    const spots = [[5, -4], [-6, -4], [20, 18], [-25, 10], [8, -30], [44, 30]];
    for (const [x, z] of spots) {
      const g = new THREE.IcosahedronGeometry(0.6, 1);
      const cols = ['#ff5c5c', '#fff3d6', '#3fb6ff', '#ffd23f', '#fff3d6', '#2fd3a0'];
      const arr = new Float32Array(g.attributes.position.count * 3);
      const c = new THREE.Color();
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2));
        c.set(cols[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6]);
        for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4 }));
      mesh.castShadow = true;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, heightAt(x, z) + 1.2, z).setLinearDamping(0.3).setAngularDamping(0.3)
      );
      this.world.createCollider(RAPIER.ColliderDesc.ball(0.6).setDensity(0.6).setRestitution(0.75), body);
      this.addDynamic(mesh, body);
    }
  }

  // ---------- Hut on the hill ----------
  buildHut(x, z) {
    const y = heightAt(x, z);
    if (this.models.hut) {
      // Model: 3 wide, 3.6 tall, base at 0. Scaled up so the off-roader can drive through between the posts.
      const S = 1.4;
      const geo = bakeColored(this.models.hut);
      const mesh = new THREE.Mesh(geo, vcMat);
      mesh.scale.setScalar(S);
      mesh.position.set(x, y - 0.12, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.addStatic(RAPIER.ColliderDesc.cylinder(0.16 * S, 1.5 * S), x, y - 0.12 + 0.115 * S, z);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.addStatic(RAPIER.ColliderDesc.cylinder(0.95 * S, 0.1 * S), x + Math.cos(a) * 1.13 * S, y + 1.15 * S, z + Math.sin(a) * 1.13 * S);
      }
      this.addStatic(RAPIER.ColliderDesc.cone(0.8 * S, 1.73 * S), x, y + 2.75 * S, z);
      return;
    }
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.4, 8), flatMat('#a66f43'));
    floor.position.y = 0.2;
    g.add(floor);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), flatMat('#7a4f2d'));
      post.position.set(Math.cos(a) * 1.8, 1.4, Math.sin(a) * 1.8);
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2, 8), flatMat('#e3b25c'));
    roof.position.y = 3.3;
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(3.2, 0.6, 8, 1, true), flatMat('#cf9a45'));
    roof2.position.y = 2.45;
    g.add(roof2);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y - 0.1, z);
    this.scene.add(g);
    this.addStatic(RAPIER.ColliderDesc.cylinder(0.3, 2.3), x, y + 0.15, z);
    this.addStatic(RAPIER.ColliderDesc.cone(1, 3), x, y + 3.3, z);
  }

  // ---------- Bobbing sailboat offshore ----------
  buildBoat() {
    if (this.models.boat) {
      // Model: 2.6 long, bow toward +X, keel at 0. Sits a little low so it looks afloat.
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(bakeColored(this.models.boat), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }));
      mesh.scale.setScalar(1.6);
      mesh.position.y = -0.45;
      mesh.castShadow = true;
      g.add(mesh);
      this.scene.add(g);
      this.floaters.push({ obj: g, base: new THREE.Vector3(), phase: 0, drift: true });
      return;
    }
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.6), flatMat('#ffffff'));
    hull.geometry.translate(0, 0, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.02, 0.2, 1.62), flatMat('#1fb5a8'));
    stripe.position.y = 0.15;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), flatMat('#8a5a33'));
    mast.position.set(0.3, 2.8, 0);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(2.2, 0); sailShape.lineTo(0, 4.2); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: '#ff7a59', side: THREE.DoubleSide, flatShading: true }));
    sail.position.set(0.35, 0.6, 0);
    g.add(hull, stripe, mast, sail);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(58, 0, -24);
    g.rotation.y = 0.6;
    this.scene.add(g);
    this.floaters.push({ obj: g, base: g.position.clone(), phase: 0, drift: true });
  }

  buildClouds() {
    const r = this.rand;
    const m = new THREE.MeshStandardMaterial({ color: '#fffaf2', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const puffs = 3 + Math.floor(r() * 3);
      for (let k = 0; k < puffs; k++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + r() * 1.6, 0), m);
        s.position.set(k * 2.1 - puffs, r() * 0.8, r() * 1.5);
        s.scale.y = 0.7;
        g.add(s);
      }
      g.position.set(-90 + r() * 180, 22 + r() * 10, -80 + r() * 120);
      g.userData.speed = 0.6 + r() * 0.8;
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  // Tiki torch with flickering flame
  torch(x, z) {
    const y = heightAt(x, z);
    if (this.models.torch) {
      // Model: 2.65 tall, base at 0. The flame is its own mesh so it can flicker, pivoting at its base.
      const isFlame = (n) => /flame/i.test(n);
      const pole = new THREE.Mesh(bakeColored(this.models.torch, (n) => !isFlame(n)), vcMat);
      const flameGeo = bakeColored(this.models.torch, isFlame);
      flameGeo.translate(0, -2.1, 0);
      const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
      flame.position.set(x, y + 2.1 * 0.95, z);
      flame.scale.setScalar(0.95);
      pole.scale.setScalar(0.95);
      pole.position.set(x, y, z);
      pole.castShadow = true;
      this.scene.add(pole, flame);
      this.flames.push({ flame, phase: Math.random() * 10, base: 0.95 });
      this.addStatic(RAPIER.ColliderDesc.cylinder(0.9, 0.1), x, y + 0.9, z);
      return;
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6), flatMat('#7a4f2d'));
    pole.position.set(x, y + 0.9, z);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.25, 6), flatMat('#4a3220'));
    cup.position.set(x, y + 1.85, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 5), new THREE.MeshBasicMaterial({ color: '#ffb53d' }));
    flame.position.set(x, y + 2.15, z);
    pole.castShadow = true;
    this.scene.add(pole, cup, flame);
    this.flames.push({ flame, phase: Math.random() * 10 });
    this.addStatic(RAPIER.ColliderDesc.cylinder(0.9, 0.1), x, y + 0.9, z);
  }

  // Wooden sign with painted text
  sign(text, x, z, yaw = 0, sub = '') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c98b57'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#b37a49';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 64 + 60, 512, 4);
    ctx.fillStyle = '#fff5e1';
    ctx.font = '700 64px "Shrikhand", Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, sub ? 105 : 128);
    if (sub) { ctx.font = '600 34px "DM Sans", sans-serif'; ctx.fillText(sub, 256, 185); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.12), [
      flatMat('#a66f43'), flatMat('#a66f43'), flatMat('#a66f43'), flatMat('#a66f43'),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), flatMat('#a66f43'),
    ]);
    board.position.y = 1.9;
    board.castShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), flatMat('#7a4f2d'));
    post.position.y = 0.8;
    g.add(board, post);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.scene.add(g);
    this.addStatic(RAPIER.ColliderDesc.cuboid(0.12, 0.9, 0.12), x, y + 0.9, z);
    return { canvas: c, ctx, tex };
  }

  update(t, dt) {
    for (const { mesh, body } of this.dynamic) {
      const p = body.translation(), q = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (const s of this.swayers) {
      const w = Math.sin(t * 1.1 + s.phase) * 0.5 + Math.sin(t * 2.3 + s.phase * 1.7) * 0.25;
      s.palm.rotation.z = w * 0.02 * s.amt;
      s.palm.rotation.x = Math.cos(t * 0.9 + s.phase) * 0.012 * s.amt;
      s.crown.rotation.z = w * 0.08 * s.amt;
      s.crown.rotation.x = Math.sin(t * 1.7 + s.phase) * 0.05 * s.amt;
    }
    if (this.palmTrunks) this.updatePalms(t);
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 13 + f.phase) * 0.15 + Math.sin(t * 7.3 + f.phase) * 0.1;
      const b = f.base || 1;
      f.flame.scale.set(b * (2 - k) * 0.5 + b * 0.5, b * k, b * (2 - k) * 0.5 + b * 0.5);
      f.flame.rotation.y = t * 2;
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 100) c.position.x = -100;
    }
    for (const f of this.floaters) {
      f.obj.position.y = Math.sin(t * 1.2 + f.phase) * 0.15 - 0.1;
      f.obj.rotation.x = Math.sin(t * 0.9 + f.phase) * 0.05;
      f.obj.rotation.z = Math.cos(t * 1.1 + f.phase) * 0.04;
      if (f.drift) {
        // Sails an oval around the island, bow pointing along the direction of travel
        const a = t * 0.025;
        const cx = 10, cz = 1, rx = 76, rz = 62;
        f.obj.position.x = cx + Math.cos(a) * rx;
        f.obj.position.z = cz + Math.sin(a) * rz;
        f.obj.rotation.y = Math.atan2(-Math.cos(a) * rz, -Math.sin(a) * rx);
      }
    }
  }
}
