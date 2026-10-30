import * as THREE from 'three';
import { addGlow, addBeam } from './daycycle.js';
import RAPIER from './rapier.js';
import { bakeColored } from './models.js';
import { heightAt } from './terrain.js';
import { landSD } from './plan.js';
import { shade } from './shading.js';
import * as L from './layout.js';

// The second wave of props and mini games: lighthouse, pier, beach scenes to crash through,
// explosives, a treasure chest, soccer and mini golf. The race lives in track.js.

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
const nm = (n) => n.replace(/_/g, ' '); // the loader turns spaces in part names into underscores
const has = (re) => (n) => re.test(nm(n));
const not = (f) => (n, o) => !f(n, o);
const q4 = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const centerOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new V3());

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// A model placed on the island: base at ground height, turned by `yaw`, scaled by `s`
function place(x, z, yaw, s, dy = 0, y = null) {
  const pos = new V3(x, (y ?? heightAt(x, z)) + dy, z);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  return { pos, q, s, yaw, toWorld: (v) => v.clone().multiplyScalar(s).applyQuaternion(q).add(pos), toLocal: (v) => v.clone().sub(pos).applyQuaternion(q.clone().invert()).divideScalar(s) };
}

function partBox(model, filter) {
  const b = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && filter(o.name, o)) b.expandByObject(o); });
  return b;
}

// Yaw that turns a model's front (+Z) toward a direction on the ground
const yawToward = (dx, dz) => Math.atan2(dx, dz);

export class Extras {
  constructor({ scene, world, island, ui, fx, car, models }) {
    Object.assign(this, { scene, world, island, ui, fx, car, models });
    this.updaters = [];
    this.explosives = [];
    const m = models;
    if (m.lighthouse) this.buildLighthouse(m.lighthouse);
    if (m.pier) this.buildPier(m.pier);
    if (m.beachSet) this.buildBeachSet(m.beachSet);
    if (m.surfRack) this.buildSurfRack(m.surfRack);
    if (m.fruitCart) this.buildFruitCart(m.fruitCart);
    if (m.dynamite) L.DYNAMITE.forEach(([x, z], i) => this.addExplosive('dynamite', m.dynamite, x, z, i * 1.3));
    if (m.coconuts) L.COCONUT_BOMBS.forEach(([x, z], i) => this.addExplosive('coconut', m.coconuts, x, z, i * 2.1));
    if (m.fireworks) this.addExplosive('fireworks', m.fireworks, L.FIREWORK_BARREL[0], L.FIREWORK_BARREL[1], 0.4);
    if (m.chest) this.buildChest(m.chest);
    if (m.goal) this.buildSoccer(m.goal);
    if (m.golf) this.buildGolf(m.golf);
  }

  // ---------- helpers ----------
  staticMesh(geo, P, mat = vcMat) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(P.pos); mesh.quaternion.copy(P.q); mesh.scale.setScalar(P.s);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  boxCollider(P, box, { pad = 0, fixed = true } = {}) {
    const c = box.getCenter(new V3()), h = box.getSize(new V3()).multiplyScalar(P.s / 2), w = P.toWorld(c);
    const desc = RAPIER.ColliderDesc.cuboid(Math.max(h.x + pad, 0.05), Math.max(h.y, 0.05), Math.max(h.z + pad, 0.05));
    if (fixed) return this.island.addStatic(desc, w.x, w.y, w.z, q4(P.q));
    return desc;
  }

  // A loose piece that sits still (asleep) until something bumps it, then tumbles with physics.
  // `parts: true` gives it one box per mesh part (for open shapes like chairs and racks).
  piece(model, filter, P, { density = 1, ball = false, parts = false, restitution = 0.25 } = {}) {
    const geo = bakeColored(model, filter);
    if (!geo) return null;
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new V3()), size = geo.boundingBox.getSize(new V3());
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, vcMat);
    mesh.scale.setScalar(P.s);
    mesh.castShadow = true;
    const w = P.toWorld(c);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(w.x, w.y + 0.02, w.z).setRotation(q4(P.q)).setLinearDamping(0.2).setAngularDamping(0.35).setSleeping(true)
    );
    const colliders = [];
    if (parts) {
      model.traverse((o) => {
        if (!o.isMesh || !filter(o.name, o)) return;
        const b = new THREE.Box3().setFromObject(o), bc = b.getCenter(new V3()).sub(c).multiplyScalar(P.s), hs = b.getSize(new V3()).multiplyScalar(P.s / 2);
        if (Math.max(hs.x, hs.y, hs.z) < 0.03) return;
        colliders.push(RAPIER.ColliderDesc.cuboid(Math.max(hs.x, 0.03), Math.max(hs.y, 0.03), Math.max(hs.z, 0.03)).setTranslation(bc.x, bc.y, bc.z));
      });
    } else {
      const hs = size.clone().multiplyScalar(P.s / 2);
      colliders.push(ball ? RAPIER.ColliderDesc.ball(Math.max(hs.x, hs.y, hs.z) * 0.9) : RAPIER.ColliderDesc.cuboid(Math.max(hs.x, 0.04), Math.max(hs.y, 0.04), Math.max(hs.z, 0.04)));
    }
    for (const d of colliders) this.world.createCollider(d.setDensity(density).setRestitution(restitution).setFriction(0.7), body);
    this.island.addDynamic(mesh, body);
    return { mesh, body };
  }

  carNear(p, r) {
    const c = this.car.position;
    return Math.hypot(c.x - p.x, c.z - p.z) < r && Math.abs(c.y - p.y) < 4;
  }

  // ---------- lighthouse with a sweeping beam ----------
  buildLighthouse(model) {
    const [x, z] = L.LIGHTHOUSE;
    const P = place(x, z, -0.5, 3, -0.4);
    const isLamp = has(/lighthouse lamp/i), isGlass = has(/glass/i);
    this.staticMesh(bakeColored(model, (n) => !isLamp(n) && !isGlass(n)), P);
    this.staticMesh(bakeColored(model, isGlass), P, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.35, roughness: 0.1 }));
    const lampBox = partBox(model, isLamp);
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe68a' });
    this.staticMesh(bakeColored(model, isLamp), P, lampMat);
    // Colliders: rocky base and the tower
    this.boxCollider(P, partBox(model, has(/rocky lighthouse base/i)), { pad: -0.4 });
    const tower = partBox(model, has(/tower course|coral stripe|tower foundation/i));
    const tc = P.toWorld(tower.getCenter(new V3())), th = tower.getSize(new V3()).multiplyScalar(P.s / 2);
    this.island.addStatic(RAPIER.ColliderDesc.cylinder(th.y, Math.max(th.x, th.z)), tc.x, tc.y, tc.z);
    // Beam: two long soft cones turning around the lamp
    const lamp = P.toWorld(lampBox.getCenter(new V3()));
    const beam = new THREE.Group();
    beam.position.copy(lamp);
    const coneGeo = new THREE.ConeGeometry(2.6, 22, 20, 1, true);
    coneGeo.translate(0, -11, 0);
    coneGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const a of [0, Math.PI]) { const c = new THREE.Mesh(coneGeo, beamMat); c.rotation.y = a; beam.add(c); }
    this.scene.add(beam);
    this.updaters.push((dt) => { beam.rotation.y += dt * 0.7; });
    addGlow(lamp, '#ffe68a', 5, lampMat); // shines at night (daycycle.js)
    addBeam(beamMat);
  }

  // ---------- pier running from the beach out over the water ----------
  buildPier(model) {
    const { start, dir } = L.PIER;
    // Walk out from the sand to the water's edge
    let d = 0;
    while (d < 30 && landSD(start[0] + dir[0] * d, start[1] + dir[1] * d) > 0) d += 0.25;
    const shore = [start[0] + dir[0] * d, start[1] + dir[1] * d];
    const S = 3;
    const deck = partBox(model, has(/deck plank/i));
    const ladder = partBox(model, has(/ladder/i));
    const ladderAtPlusZ = ladder.getCenter(new V3()).z > 0;
    const yaw = yawToward(dir[0], dir[1]) + (ladderAtPlusZ ? 0 : Math.PI); // ladder end goes out to sea
    const len = (deck.max.z - deck.min.z) * S;
    const cx = shore[0] + dir[0] * (len / 2 - 2.5), cz = shore[1] + dir[1] * (len / 2 - 2.5);
    const deckTop = 0.45;
    const P = place(cx, cz, yaw, S, 0, deckTop - deck.max.y * S);
    this.staticMesh(bakeColored(model), P);
    this.boxCollider(P, deck);
  }

  // ---------- beach scenes you can crash through ----------
  buildBeachSet(model) {
    const [x, z] = L.BEACH_SET;
    const P = place(x, z, 0.3, 1.5, 0.02);
    const isUmbrella = has(/umbrella/i), isCooler = has(/cooler/i), isChair = (n) => !isUmbrella(n) && !isCooler(n);
    const coolerX = partBox(model, isCooler).getCenter(new V3()).x;
    this.piece(model, isUmbrella, P, { density: 0.25, parts: true });
    this.piece(model, isCooler, P, { density: 0.6 });
    this.piece(model, (n, o) => isChair(n) && centerOf(o).x < coolerX, P, { density: 0.3, parts: true });
    this.piece(model, (n, o) => isChair(n) && centerOf(o).x >= coolerX, P, { density: 0.3, parts: true });
  }

  buildSurfRack(model) {
    const [x, z] = L.SURF_RACK;
    const P = place(x, z, -0.2, 1.4, 0.02);
    const boards = [];
    model.traverse((o) => { if (o.isMesh && has(/upright .* surfboard/i)(o.name)) boards.push(o); });
    const owner = (o) => boards.reduce((best, b) => (Math.abs(centerOf(b).x - centerOf(o).x) < Math.abs(centerOf(best).x - centerOf(o).x) ? b : best));
    for (const b of boards) this.piece(model, (n, o) => o === b || (has(/surfboard stripe/i)(n) && owner(o) === b), P, { density: 0.3 });
    this.piece(model, has(/rack|peg/i), P, { density: 0.5, parts: true });
  }

  buildFruitCart(model) {
    const [x, z] = L.FRUIT_CART;
    const P = place(x, z, 0.9, 2.2, 0.02);
    const isFruit = has(/banana|coconut|pineapple/i);
    this.staticMesh(bakeColored(model, not(isFruit)), P);
    // Solid up to the deck so loose fruit lands on it
    const deck = partBox(model, has(/cart deck|wheel|axle/i));
    this.boxCollider(P, deck);
    const fruit = [];
    const pines = [];
    model.traverse((o) => { if (o.isMesh && has(/pineapple body/i)(o.name)) pines.push(o); });
    const nearestPine = (o) => pines.reduce((best, p) => (centerOf(p).distanceTo(centerOf(o)) < centerOf(best).distanceTo(centerOf(o)) ? p : best));
    model.traverse((o) => {
      if (!o.isMesh) return;
      const n = nm(o.name);
      if (/market coconut/i.test(n)) fruit.push(this.piece(model, (_, oo) => oo === o, P, { density: 0.8, ball: true, restitution: 0.4 }));
      else if (/banana/i.test(n)) fruit.push(this.piece(model, (_, oo) => oo === o, P, { density: 0.5 }));
      else if (/pineapple body/i.test(n)) fruit.push(this.piece(model, (nn, oo) => oo === o || (/crown/i.test(nm(nn)) && nearestPine(oo) === o), P, { density: 0.6 }));
    });
    // Crashing into the cart throws the fruit
    const center = P.pos.clone();
    let cooldown = 0;
    this.updaters.push((dt) => {
      cooldown -= dt;
      if (cooldown > 0 || !this.carNear(center, 4.2) || Math.abs(this.car.speed) < 3) return;
      cooldown = 2;
      const v = this.car.body.linvel();
      for (const f of fruit) {
        if (!f) continue;
        const m = f.body.mass();
        f.body.applyImpulse({ x: (v.x * 0.35 + (Math.random() - 0.5) * 3) * m, y: (4 + Math.random() * 3) * m, z: (v.z * 0.35 + (Math.random() - 0.5) * 3) * m }, true);
      }
    });
  }

  // ---------- explosives ----------
  addExplosive(kind, model, x, z, phase) {
    const cfg = { dynamite: { s: 1.3, power: 24, size: 1.6 }, coconut: { s: 1.4, power: 14, size: 1.1 }, fireworks: { s: 1.3, power: 11, size: 0.9 } }[kind];
    const P = place(x, z, phase, cfg.s, 0.01);
    const isSpark = has(/spark|ray/i);
    const group = new THREE.Group();
    const body = new THREE.Mesh(bakeColored(model, not(isSpark)), vcMat);
    body.castShadow = true;
    group.add(body);
    const sparkGeo = bakeColored(model, isSpark);
    const spark = sparkGeo ? new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: '#ffe066' })) : null;
    if (spark) group.add(spark);
    group.position.copy(P.pos); group.quaternion.copy(P.q); group.scale.setScalar(P.s);
    this.scene.add(group);
    const box = partBox(model, () => true);
    const collider = this.boxCollider(P, box, { pad: -0.05 });
    const center = P.toWorld(box.getCenter(new V3()));
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * P.s * 0.5 + 1.7;
    const e = { kind, cfg, group, spark, collider, center, radius, armed: true, wait: 0, phase };
    this.explosives.push(e);
  }

  explode(e) {
    e.armed = false;
    e.fuse = 0;
    e.wait = 6;
    e.group.visible = false;
    e.collider.setEnabled(false); // the static body holding its collider
    const cp = this.car.position;
    this.fx.boom(e.center.clone().add(new V3(0, 0.6, 0)), e.cfg.size, { carDist: Math.hypot(cp.x - e.center.x, cp.z - e.center.z) });
    if (e.kind === 'fireworks') this.fx.celebrate(e.center, 5);
    if (e.kind === 'coconut') this.fx.sparks(e.center.clone().add(new V3(0, 0.6, 0)), 24, 7, ['#6b4a2b', '#a97b4f'], { life: 1.2, size: 0.3 });
    this.blast(e.center, 7.5, e.cfg.power);
  }

  // Push everything nearby away from the blast (including the off-roader)
  blast(center, R, power) {
    this.world.forEachRigidBody((b) => {
      if (!b.isDynamic()) return;
      const t = b.translation();
      const d = new V3(t.x - center.x, t.y - center.y, t.z - center.z);
      const dist = d.length();
      if (dist > R) return;
      d.y = Math.max(d.y, 0) + 1.6 * Math.max(dist, 1); // mostly up, a little out
      d.normalize();
      const k = power * (1 - dist / R) * b.mass();
      b.wakeUp();
      b.applyImpulse({ x: d.x * k, y: d.y * k, z: d.z * k }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * k * 0.15, y: (Math.random() - 0.5) * k * 0.15, z: (Math.random() - 0.5) * k * 0.15 }, true);
    });
  }

  updateExplosives(dt, t) {
    for (const e of this.explosives) {
      if (e.armed) {
        if (e.fuse > 0) { // fuse burning: the spark flares and flickers fast, then it blows
          e.fuse -= dt;
          if (e.spark) { e.spark.visible = Math.sin(t * 70) > -0.6; e.spark.scale.setScalar(1 + (0.3 - e.fuse) * 4); }
          if (e.fuse <= 0) { if (e.spark) e.spark.scale.setScalar(1); this.explode(e); }
          continue;
        }
        if (e.spark) e.spark.visible = Math.sin(t * 22 + e.phase * 7) > -0.4;
        if (this.carNear(e.center, e.radius)) e.fuse = 0.3;
      } else {
        e.wait -= dt;
        if (e.wait <= 0 && !this.carNear(e.center, e.radius + 5)) {
          e.armed = true;
          e.group.visible = true;
          e.collider.setEnabled(true);
        }
      }
    }
  }

  // ---------- treasure chest in the crater ----------
  buildChest(model) {
    const [x, z] = L.CHEST;
    const P = place(x, z, -0.6, 1.7, 0);
    const isLid = has(/arched lid plank|lid strap/i), isCoin = has(/coin/i);
    this.staticMesh(bakeColored(model, (n) => !isLid(n) && !isCoin(n)), P);
    const peeking = this.staticMesh(bakeColored(model, isCoin), P);
    this.boxCollider(P, partBox(model, (n) => !isLid(n) && !isCoin(n)));
    // Lid on a hinge along its back bottom edge
    const lidBox = partBox(model, isLid);
    const hinge = new V3(0, lidBox.min.y, lidBox.min.z);
    const lidGeo = bakeColored(model, isLid);
    lidGeo.translate(-hinge.x, -hinge.y, -hinge.z);
    const pivot = new THREE.Group();
    pivot.position.copy(P.toWorld(hinge)); pivot.quaternion.copy(P.q); pivot.scale.setScalar(P.s);
    const lid = new THREE.Mesh(lidGeo, vcMat);
    lid.castShadow = true;
    pivot.add(lid);
    this.scene.add(pivot);
    // One coin shape, reused for the treasure that spills out
    // The gold doubloon model when it loaded, otherwise one of the chest's own coins
    let first = null;
    model.traverse((o) => { if (!first && o.isMesh && isCoin(o.name)) first = o; });
    const coinGeo = this.models.coin ? bakeColored(this.models.coin) : bakeColored(model, (_, o) => o === first);
    if (this.models.coin) coinGeo.rotateX(Math.PI / 2); // lie it flat: the star faces up
    coinGeo.computeBoundingBox();
    coinGeo.center();
    coinGeo.computeBoundingBox();
    const cs = coinGeo.boundingBox.getSize(new V3());
    const coinScale = 0.5 / Math.max(cs.x, cs.y, cs.z); // coins about half a unit across
    const coinMat = shade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, metalness: 0.4, emissive: '#7a5200', emissiveIntensity: 0.25 }));
    const top = P.toWorld(new V3(0, lidBox.min.y + 0.2, 0));
    const chest = { P, pivot, peeking, open: 0, opening: false, coins: [], found: 0, total: 18, resetIn: 0, center: P.pos.clone() };
    this.chest = chest;

    const spill = () => {
      for (let i = 0; i < chest.total; i++) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.scale.setScalar(coinScale);
        mesh.castShadow = true;
        const a = Math.random() * Math.PI * 2;
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(top.x + Math.cos(a) * 0.3, top.y + 0.3 + i * 0.03, top.z + Math.sin(a) * 0.3).setLinearDamping(0.3).setAngularDamping(0.4));
        this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.06, 0.25).setDensity(2).setRestitution(0.35).setFriction(0.8), body);
        body.setLinvel({ x: Math.cos(a) * (2 + Math.random() * 3), y: 6 + Math.random() * 4, z: Math.sin(a) * (2 + Math.random() * 3) }, true);
        body.setAngvel({ x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 }, true);
        this.scene.add(mesh);
        chest.coins.push({ mesh, body });
      }
    };
    const removeCoin = (c) => { this.scene.remove(c.mesh); this.world.removeRigidBody(c.body); };

    this.updaters.push((dt) => {
      // Open when the off-roader rolls up
      if (!chest.opening && chest.open === 0 && this.carNear(chest.center, 3.4)) {
        chest.opening = true;
        peeking.visible = false;
        spill();
        this.fx.sparks(top.clone(), 40, 6, ['#ffd23f', '#fff3d6'], { life: 1, size: 0.25, up: 0.6 });
        this.ui.toast('Treasure! 🪙', 'Drive over the coins to collect them.', 2400);
        this.ui.setStat('treasure', `${chest.found}/${chest.total}`, 'coins collected');
      }
      const target = chest.opening ? 1 : 0;
      chest.open += (target - chest.open) * Math.min(1, dt * 6);
      pivot.rotation.x = -1.9 * chest.open;
      // Coins: sync, collect, or lose to the sea
      for (const c of chest.coins.slice()) {
        const t = c.body.translation(), r = c.body.rotation();
        c.mesh.position.set(t.x, t.y, t.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        const car = this.car.position;
        if (Math.hypot(car.x - t.x, car.z - t.z) < 1.7 && Math.abs(car.y - t.y) < 2.2 && c.body.linvel().y < 3) {
          removeCoin(c); chest.coins.splice(chest.coins.indexOf(c), 1); chest.found++;
          this.fx.sparks(new V3(t.x, t.y + 0.3, t.z), 8, 3, ['#ffd23f'], { life: 0.5, size: 0.18 });
          this.ui.setStat('treasure', `${chest.found}/${chest.total}`, 'coins collected');
          if (chest.found === chest.total) { this.ui.toast('All the treasure! 🏴‍☠️', 'Every last coin.', 2600); this.fx.celebrate(this.car.position, 5); }
        } else if (t.y < -1.5) { removeCoin(c); chest.coins.splice(chest.coins.indexOf(c), 1); }
      }
      // Once the coins are gone, the chest closes and refills
      if (chest.opening && chest.coins.length === 0) {
        chest.resetIn += dt;
        if (chest.resetIn > 12 && !this.carNear(chest.center, 6)) { chest.opening = false; chest.resetIn = 0; chest.found = 0; peeking.visible = true; }
      }
    });
  }

  // ---------- soccer ----------
  buildSoccer(model) {
    const { x, z, angle, length, width } = L.SOCCER;
    const u = new V3(Math.cos(angle), 0, Math.sin(angle)), v = new V3(-Math.sin(angle), 0, Math.cos(angle));
    const ground = heightAt(x, z);
    // Field lines
    const lineMat = new THREE.MeshBasicMaterial({ color: '#fbf6ec', polygonOffset: true, polygonOffsetFactor: -2 });
    const field = new THREE.Group();
    field.position.set(x, ground + 0.03, z);
    field.rotation.y = -angle;
    const strip = (w, d, px, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat); m.position.set(px, 0, pz); field.add(m); };
    strip(length, 0.18, 0, width / 2); strip(length, 0.18, 0, -width / 2);
    strip(0.18, width, length / 2, 0); strip(0.18, width, -length / 2, 0); strip(0.18, width, 0, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.3, 32), lineMat);
    ring.rotation.x = -Math.PI / 2; field.add(ring);
    this.scene.add(field);

    // Goals at both ends, mouths facing the middle
    const S = 2;
    const uprights = partBox(model, has(/goal upright/i));
    const mouth = new V3((uprights.min.x + uprights.max.x) / 2, 0, (uprights.min.z + uprights.max.z) / 2);
    const back = partBox(model, has(/rear .* net|rear top bar/i));
    const bar = partBox(model, has(/crossbar/i));
    this.goals = [];
    for (const side of [-1, 1]) {
      const end = new V3(x, 0, z).addScaledVector(u, side * length / 2);
      const facing = u.clone().multiplyScalar(-side);
      const yaw = yawToward(facing.x, facing.z);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      const off = mouth.clone().multiplyScalar(S).applyQuaternion(q);
      const P = place(end.x - off.x, end.z - off.z, yaw, S, 0.0, ground);
      this.staticMesh(bakeColored(model), P);
      for (const f of [has(/goal upright/i), has(/crossbar/i), has(/rear top bar/i), has(/side ground bamboo/i), has(/side top bamboo/i)]) {
        model.traverse((o) => { if (o.isMesh && f(o.name)) this.boxCollider(P, new THREE.Box3().setFromObject(o)); });
      }
      this.boxCollider(P, back);
      for (const sgn of [-1, 1]) this.boxCollider(P, partBox(model, (n, o) => has(/side (horizontal|vertical) rope/i)(n) && Math.sign(centerOf(o).x - mouth.x) === sgn));
      this.goals.push({ P, inner: { x0: uprights.min.x + 0.12, x1: uprights.max.x - 0.12, z0: back.min.z, z1: mouth.z, y1: bar.max.y } });
    }

    // Big ball, made in code
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), white = new THREE.Color('#fbf6ec'), coral = new THREE.Color('#ff7a59');
    for (let i = 0; i < pos.count; i += 3) { const c = (Math.floor(i / 3) % 4 === 0) ? coral : white; for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5 }));
    mesh.castShadow = true;
    this.scene.add(mesh);
    const kickoff = new V3(x, ground + 1.2, z);
    const ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(kickoff.x, kickoff.y, kickoff.z).setLinearDamping(0.25).setAngularDamping(0.4).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.ball(1).setDensity(1.2).setRestitution(0.6).setFriction(0.6), ball);
    const reset = () => { ball.setTranslation(kickoff, true); ball.setLinvel({ x: 0, y: 0, z: 0 }, true); ball.setAngvel({ x: 0, y: 0, z: 0 }, true); };
    let goals = Number(store.get('shoreline.goals') || 0);
    let cool = 0;
    this.soccer = { ball, reset };
    this.updaters.push((dt) => {
      const t = ball.translation(), r = ball.rotation();
      mesh.position.set(t.x, t.y, t.z); mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (t.y < -1.5) reset();
      cool -= dt;
      if (cool > 0) { if (cool < 0.05) reset(); return; }
      for (const goal of this.goals) {
        const l = goal.P.toLocal(new V3(t.x, t.y, t.z)), i = goal.inner;
        if (l.x > i.x0 && l.x < i.x1 && l.z > i.z0 && l.z < i.z1 - 0.3 && l.y < i.y1) {
          goals++; store.set('shoreline.goals', String(goals));
          this.ui.toast('GOAL! ⚽', `That makes ${goals}.`, 2200);
          this.ui.setStat('goals', String(goals), 'goals scored');
          this.fx.celebrate(new V3(t.x, t.y, t.z), 4);
          cool = 2.5;
        }
      }
    });
    if (goals) this.ui.setStat('goals', String(goals), 'goals scored');
  }

  // ---------- mini golf ----------
  buildGolf(model) {
    const [gx, gz] = L.GOLF.green, [tx, tz] = L.GOLF.tee;
    const S = 2.5;
    const green = partBox(model, has(/green with open cup/i));
    const P = place(gx, gz, 0, S, 0, heightAt(gx, gz) - green.max.y * S + 0.01);
    const isFlag = has(/golf flag$/i);
    this.staticMesh(bakeColored(model, not(isFlag)), P);
    // Flag waves around its pole
    const pole = partBox(model, has(/flagpole/i)).getCenter(new V3());
    const flagGeo = bakeColored(model, isFlag);
    flagGeo.translate(-pole.x, 0, -pole.z);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    const flagPivot = new THREE.Group();
    flagPivot.position.copy(P.toWorld(new V3(pole.x, 0, pole.z))); flagPivot.scale.setScalar(S);
    flagPivot.add(flag); this.scene.add(flagPivot);
    const cup = P.toWorld(partBox(model, has(/cup bottom|cup inner wall/i)).getCenter(new V3()));
    // Tee marker and the big golf ball
    const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 18), new THREE.MeshStandardMaterial({ color: '#ff7a59', flatShading: true }));
    tee.position.set(tx, heightAt(tx, tz) + 0.03, tz); this.scene.add(tee);
    const teePos = new V3(tx, heightAt(tx, tz) + 0.7, tz);
    const R = 0.6;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), new THREE.MeshStandardMaterial({ color: '#fffaf0', flatShading: true, roughness: 0.4 }));
    mesh.castShadow = true; this.scene.add(mesh);
    const ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(teePos.x, teePos.y, teePos.z).setLinearDamping(0.55).setAngularDamping(0.8).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(2.2).setRestitution(0.35).setFriction(0.7), ball);
    let strokes = 0, resting = true, sinking = 0, best = Number(store.get('shoreline.golf') || 0);
    const reset = () => {
      ball.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      ball.setTranslation(teePos, true); ball.setLinvel({ x: 0, y: 0, z: 0 }, true); ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      strokes = 0; resting = true; sinking = 0;
    };
    this.golf = { ball, cup, reset };
    if (best) this.ui.setStat('golf', `best ${best}`, best === 1 ? 'hole in one' : 'strokes');
    this.updaters.push((dt, time) => {
      flag.rotation.y = Math.sin(time * 2.2) * 0.25;
      const t = ball.translation(), r = ball.rotation();
      mesh.position.set(t.x, t.y, t.z); mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (sinking) {
        sinking -= dt;
        ball.setNextKinematicTranslation({ x: cup.x, y: Math.max(t.y - dt * 1.5, cup.y - 0.4), z: cup.z });
        if (sinking <= 0) reset();
        return;
      }
      const vel = ball.linvel(), speed = Math.hypot(vel.x, vel.y, vel.z);
      if (resting && speed > 1.2) { strokes++; resting = false; }
      else if (!resting && speed < 0.25) resting = true;
      if (Math.hypot(t.x - cup.x, t.z - cup.z) < 0.85 && speed < 8 && t.y < cup.y + 1.6) {
        ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        sinking = 2.2;
        const n = Math.max(1, strokes);
        this.ui.toast(n === 1 ? 'Hole in one! ⛳' : `In the hole in ${n}!`, n === 1 ? 'Straight in.' : 'The ball is back on the tee.', 2400);
        if (!best || n < best) { best = n; store.set('shoreline.golf', String(n)); }
        this.ui.setStat('golf', `best ${best}`, best === 1 ? 'hole in one' : 'strokes');
        this.fx.celebrate(cup, n === 1 ? 6 : 3);
      } else if (t.y < -1.5) {
        this.ui.toast('Lost ball', 'Back to the tee.', 1600);
        reset();
      }
    });
  }

  update(dt, time) {
    this.updateExplosives(dt, time);
    for (const u of this.updaters) u(dt, time);
  }
}
