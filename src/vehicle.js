import * as THREE from 'three';
import RAPIER from './rapier.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The car model is fitted automatically: scaled to the game's car length, turned so its front faces +X
// (the front is the end away from the spare tire), and, when it has its own road wheels, the physics
// wheels are placed where those wheels are and sized to them. The road wheels are dropped from the body;
// the spare tire is the template for the four wheels the game spins and steers.
const CAR_LENGTH = 2.85; // game units, front to back
const SPARE_PART = /spare/i;
const ROAD_WHEEL = /knobby tire core|deep tread block|wheel hub|hub center/i; // the model's own wheels (not the spare)
const nm = (n) => n.replace(/_/g, ' '); // the loader turns spaces in part names into underscores
const isLamp = (n) => /lens|headlight|lamp|tail ?light/i.test(nm(n)) && !/housing|recessed|cap\b/i.test(nm(n)); // parts that light up at night

// Car lights: lamp materials glow and a halo and a pool of light show at night (updateCarLamps, called each frame)
const LAMPS = { materials: [], glows: [] };
export function updateCarLamps(night) {
  for (const m of LAMPS.materials) m.emissiveIntensity = 0.15 + 2.6 * night;
  for (const g of LAMPS.glows) { g.material.opacity = g.userData.max * night; g.visible = night > 0.01; }
}
function glowTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
// Vertical offset of the body when the model has no road wheels to fit to (the first off-roader)
const MODEL_Y = -0.55;
const WHEEL_ATTACH_Y = -0.12, WHEEL_REST_DROP = 0.33; // physics wheel attachment height and typical suspension length under load

// Loads the off-roader .glb and returns { body, wheel, fit } ready to use, or null on failure.
// fit: { wheelPts, radius, modelY } when the model has its own road wheels, else null.
export async function loadVehicleModel(url) {
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    // Which way is front: away from the spare tire
    const spareBox = new THREE.Box3(), all = new THREE.Box3();
    root.traverse((o) => { if (!o.isMesh) return; all.expandByObject(o); if (SPARE_PART.test(o.name)) spareBox.expandByObject(o); });
    const c0 = all.getCenter(new THREE.Vector3()), sc = spareBox.getCenter(new THREE.Vector3()), size0 = all.getSize(new THREE.Vector3());
    const alongZ = Math.abs(sc.z - c0.z) > Math.abs(sc.x - c0.x);
    const frontSign = alongZ ? -Math.sign(sc.z - c0.z) : -Math.sign(sc.x - c0.x);
    const yaw = alongZ ? (frontSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (frontSign > 0 ? 0 : Math.PI);
    const scale = CAR_LENGTH / (alongZ ? size0.z : size0.x);
    const fitM = new THREE.Matrix4().makeRotationY(yaw).premultiply(new THREE.Matrix4().makeScale(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-c0.x, 0, -c0.z));

    const byMat = new Map(), spareByMat = new Map(), wheelBoxes = new Map();
    const lampSpots = [], lampMats = new Map();
    const fitted = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      // Normalize every part to plain non-indexed positions so they can be merged
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const g = new THREE.BufferGeometry();
      const pa = src.attributes.position;
      const pos = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.applyMatrix4(o.matrixWorld).applyMatrix4(fitM);
      g.computeVertexNormals();
      g.computeBoundingBox();
      if (ROAD_WHEEL.test(nm(o.name))) { // collect the road wheels by position (front/back, left/right), then drop them
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        const key = `${Math.sign(c.x)},${Math.sign(c.z)}`;
        if (!wheelBoxes.has(key)) wheelBoxes.set(key, new THREE.Box3());
        wheelBoxes.get(key).union(g.boundingBox);
        return;
      }
      fitted.union(g.boundingBox);
      let m = o.material;
      if (isLamp(o.name)) { // lamps get their own copy of the material so only they glow
        if (!lampMats.has(m)) lampMats.set(m, m.clone());
        m = lampMats.get(m);
        lampSpots.push(g.boundingBox.getCenter(new THREE.Vector3()));
      }
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(g);
      if (SPARE_PART.test(o.name)) {
        if (!spareByMat.has(m)) spareByMat.set(m, []);
        spareByMat.get(m).push(g.clone());
      }
    });
    const prep = (m) => {
      m.flatShading = true;
      m.roughness = 0.75;
      m.metalness = 0;
      if (/windshield|glass/i.test(m.name)) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
      m.needsUpdate = true;
      return m;
    };
    const body = new THREE.Group();
    for (const [m, geos] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), prep(m));
      mesh.castShadow = true;
      body.add(mesh);
    }

    // Fit the physics wheels to the model's road wheels
    let fit = null;
    if (wheelBoxes.size === 4) {
      const boxes = [...wheelBoxes.values()];
      const centers = boxes.map((b) => b.getCenter(new THREE.Vector3()));
      const radius = Math.max(...boxes.map((b) => b.getSize(new THREE.Vector3()).y)) / 2;
      const order = [[1, 1], [1, -1], [-1, 1], [-1, -1]]; // front left/right, rear left/right, as the physics wheels
      const wheelPts = order.map(([fx, fz]) => {
        const c = centers.find((p) => Math.sign(p.x) === fx && Math.sign(p.z) === fz);
        return [c.x, WHEEL_ATTACH_Y, c.z];
      });
      const wheelY = centers.reduce((a, p) => a + p.y, 0) / 4;
      fit = { wheelPts, radius, modelY: WHEEL_ATTACH_Y - WHEEL_REST_DROP - wheelY, halfWidth: Math.max(...centers.map((p) => Math.abs(p.z))) };
    }
    body.position.y = fit ? fit.modelY : MODEL_Y;

    // Lamps: their material glows (past white at night, so the glow pass picks it up), plus a halo at each
    // lamp and a soft pool of light on the ground ahead (forward is +X)
    for (const m of lampMats.values()) {
      m.emissive = m.color.clone().lerp(new THREE.Color('#fff2c8'), 0.5);
      LAMPS.materials.push(m);
    }
    if (lampSpots.length) {
      const tex = glowTexture();
      for (const p of lampSpots) {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffe9b0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.position.copy(p);
        halo.scale.setScalar(lampSpots.length > 3 ? 0.9 : 1.6);
        halo.userData.max = 0.9;
        body.add(halo); LAMPS.glows.push(halo);
      }
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: '#ffe2a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(fitted.max.x + 2.6, fitted.min.y + 0.05, 0);
      pool.scale.set(5, 3.2, 1);
      pool.userData.max = 0.45;
      body.add(pool); LAMPS.glows.push(pool);
      updateCarLamps(0);
    }

    // Wheel template: the spare tire, centred, axle along Z, normalized to radius 1
    const spareFit = new THREE.Box3();
    for (const geos of spareByMat.values()) for (const g of geos) { g.computeBoundingBox(); spareFit.union(g.boundingBox); }
    const c = spareFit.getCenter(new THREE.Vector3()), size = spareFit.getSize(new THREE.Vector3());
    const axleX = size.x < size.z; // thinnest side is the axle
    const radius = Math.max(size.y, axleX ? size.z : size.x) / 2;
    const wheel = new THREE.Group();
    for (const [m, geos] of spareByMat) {
      const g = mergeGeometries(geos);
      g.translate(-c.x, -c.y, -c.z);
      if (axleX) g.rotateY(Math.PI / 2);
      g.scale(1 / radius, 1 / radius, 1 / radius);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      wheel.add(mesh);
    }
    return { body, wheel, fit };
  } catch (err) {
    console.warn('Vehicle model failed to load, using the built-in one.', err);
    return null;
  }
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra });
const box = (w, h, d, m) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  return mesh;
};
const cyl = (rt, rb, h, m, seg = 10) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  return mesh;
};

// Vehicle looks. Each one shares the same physics body. Forward is +X.
const STYLES = {
  offroad: {
    label: 'Off-roader',
    wheelRadius: 0.38,
    rest: 0.4,
    engine: 520, // punchy: fun beats realistic
    maxSpeed: 22,
    steer: 0.55,
    wheelColor: '#24242a',
    build() {
      const g = new THREE.Group();
      const body = mat('#ffc43d');
      const trim = mat('#ff6b4a');
      const dark = mat('#2f2f37');
      const glass = mat('#9fe3ff', { roughness: 0.2 });
      const hull = box(2.5, 0.6, 1.45, body); hull.position.y = 0.3; g.add(hull);
      const hood = box(0.8, 0.2, 1.4, body); hood.position.set(0.85, 0.7, 0); g.add(hood);
      const grille = box(0.06, 0.5, 1.2, dark); grille.position.set(1.27, 0.35, 0); g.add(grille);
      const bumper = box(0.2, 0.18, 1.6, trim); bumper.position.set(1.32, 0.05, 0); g.add(bumper);
      const rear = bumper.clone(); rear.position.x = -1.32; g.add(rear);
      const shield = box(0.06, 0.5, 1.35, glass); shield.position.set(0.42, 1.0, 0); shield.rotation.z = -0.2; g.add(shield);
      // Roll cage
      for (const z of [0.66, -0.66]) {
        const a = box(0.08, 0.9, 0.08, dark); a.position.set(-0.3, 1.05, z); g.add(a);
        const b = box(0.08, 0.9, 0.08, dark); b.position.set(-1.1, 1.05, z); g.add(b);
        const top = box(0.9, 0.08, 0.08, dark); top.position.set(-0.7, 1.5, z); g.add(top);
      }
      const cross = box(0.08, 0.08, 1.4, dark); cross.position.set(-0.7, 1.5, 0); g.add(cross);
      const seats = box(0.5, 0.5, 1.1, trim); seats.position.set(-0.45, 0.8, 0); g.add(seats);
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 10), dark);
      spare.rotation.z = Math.PI / 2; spare.position.set(-1.38, 0.75, 0); spare.castShadow = true; g.add(spare);
      for (const z of [0.5, -0.5]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), mat('#fff4c2', { emissive: '#ffe28a', emissiveIntensity: 0.8 }));
        l.rotation.z = Math.PI / 2; l.position.set(1.3, 0.48, z); g.add(l);
      }
      // Surfboard on the cage
      const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.5, 3, 8), mat('#3fd0c9'));
      board.scale.set(1, 1, 0.25); board.rotation.z = Math.PI / 2; board.position.set(-0.7, 1.62, 0); board.castShadow = true;
      g.add(board);
      return g;
    },
  },
};

export class Vehicle {
  constructor(scene, world, spawn, model = null) {
    this.world = world;
    this.model = model;
    this.spawn = spawn.clone();
    this.styleKey = 'offroad';

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCanSleep(false)
        .setLinearDamping(0.15)
        .setAngularDamping(0.35)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.38, 0.34, Math.max(0.66, (model?.fit?.halfWidth ?? 0) - 0.05)) // as wide as the wheel track
        .setMassProperties(120, { x: 0, y: -0.6, z: 0 }, { x: 30, y: 60, z: 50 }, { w: 1, x: 0, y: 0, z: 0 })
        .setFriction(0.4)
        .setRestitution(0.1),
      this.body
    );

    this.controller = world.createVehicleController(this.body);
    this.fit = model?.fit || null;
    this.wheelPts = this.fit ? this.fit.wheelPts : [[0.8, -0.12, 0.58], [0.8, -0.12, -0.58], [-0.77, -0.12, 0.58], [-0.77, -0.12, -0.58]];
    this.wheelPts.forEach(([x, y, z], i) => {
      this.controller.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, 0.32, 0.3);
      this.controller.setWheelSuspensionStiffness(i, 26);
      this.controller.setWheelFrictionSlip(i, 2.0);
      this.controller.setWheelMaxSuspensionTravel(i, 0.35);
      this.controller.setWheelSuspensionCompression(i, 2.4);
      this.controller.setWheelSuspensionRelaxation(i, 3.0);
      this.controller.setWheelSideFrictionStiffness(i, 1.2);
    });

    this.group = new THREE.Group();
    scene.add(this.group);
    this.models = {};
    for (const [k, s] of Object.entries(STYLES)) {
      const m = model ? model.body : s.build();
      m.visible = false;
      this.group.add(m);
      this.models[k] = m;
    }
    this.wheels = this.wheelPts.map(() => {
      const w = new THREE.Group();
      if (model) {
        w.add(model.wheel.clone());
        scene.add(w);
        return w;
      }
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.28, 12), mat('#2b2b33'));
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8), mat('#f5f0e6'));
      hub.rotation.x = Math.PI / 2;
      w.add(tire, hub);
      scene.add(w);
      return w;
    });
    this.steer = 0;
    this.antiRoll = 60; // strength of the arcade anti-roll assist
    this.setStyle('offroad');
  }

  get style() {
    return STYLES[this.styleKey];
  }

  setStyle(key) {
    this.styleKey = key;
    const s = STYLES[key];
    for (const [k, m] of Object.entries(this.models)) m.visible = k === key;
    if (this.model) this.models[key].position.set(0, this.fit ? this.fit.modelY : MODEL_Y, 0);
    else this.models[key].position.y = s.wheelRadius - 0.3 + 0.05;
    const radius = this.fit ? this.fit.radius : s.wheelRadius;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelRadius(i, radius);
      this.controller.setWheelSuspensionRestLength(i, s.rest);
      if (this.model) this.wheels[i].scale.setScalar(radius);
      else this.wheels[i].scale.set(s.wheelRadius, s.wheelRadius, key === 'offroad' ? 1.3 : 1);
    }
    return s.label;
  }

  reset(pos = this.spawn, yaw = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    this.body.setTranslation({ x: pos.x, y: pos.y + 1.2, z: pos.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // Put the car back on its wheels where it is
  rightUp() {
    const t = this.body.translation();
    const q = this.body.rotation();
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    this.reset(new THREE.Vector3(t.x, t.y, t.z), Math.atan2(-fwd.z, fwd.x));
  }

  update(dt, input) {
    const s = this.style;
    const speed = this.controller.currentVehicleSpeed();
    const grounded = [0, 1, 2, 3].some((i) => this.controller.wheelIsInContact(i));
    const targetSteer = input.steer * s.steer * THREE.MathUtils.lerp(1, 0.6, Math.min(1, Math.abs(speed) / s.maxSpeed));
    this.steer = THREE.MathUtils.lerp(this.steer, targetSteer, 1 - Math.exp(-dt * 12));

    let force = 0;
    let brake = 0;
    if (input.throttle > 0) {
      force = speed < s.maxSpeed ? -s.engine * input.throttle : 0;
      if (speed < -0.5) brake = 5;
    } else if (input.throttle < 0) {
      force = speed > -s.maxSpeed * 0.5 ? -s.engine * 0.7 * input.throttle : 0;
      if (speed > 0.5) brake = 5;
    }
    if (input.boost && input.throttle > 0 && speed < s.maxSpeed * 1.5) force = -s.engine * 1.6;
    if (!input.throttle) brake = Math.max(brake, 0.4);

    // Handbrake: lock and loosen the rear wheels so the tail swings out into a drift
    this.drifting = !!input.brake && grounded && Math.abs(speed) > 4;
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      this.controller.setWheelEngineForce(i, rear ? force : force * 0.5);
      this.controller.setWheelBrake(i, input.brake ? (rear ? 1.2 : 0.3) : brake);
      this.controller.setWheelSideFrictionStiffness(i, input.brake && rear ? 0.12 : 1.2);
    }
    this.controller.setWheelSteering(0, this.steer);
    this.controller.setWheelSteering(1, this.steer);
    this.controller.updateVehicle(dt);

    // Tipped over (on a side or the roof): the controls rock the car back onto its wheels
    const rq = this.body.rotation();
    const rquat = new THREE.Quaternion(rq.x, rq.y, rq.z, rq.w);
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rquat);
    this.tipped = !grounded && carUp.y < 0.55;
    this.jumpCool = Math.max(0, (this.jumpCool || 0) - dt);
    if (this.tipped) {
      // The axis that turns the car's roof back toward the sky. Upside down it is ambiguous,
      // so steering rolls sideways and throttle flips nose over tail.
      let axis = carUp.clone().cross(new THREE.Vector3(0, 1, 0));
      if (axis.length() < 0.25) {
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(rquat), side = new THREE.Vector3(0, 0, 1).applyQuaternion(rquat);
        axis = fwd.multiplyScalar(input.steer || 1).add(side.multiplyScalar(-input.throttle));
      }
      axis.normalize();
      const effort = Math.max(Math.abs(input.steer), Math.abs(input.throttle));
      const m = this.body.mass();
      if (effort > 0) this.body.applyTorqueImpulse(axis.clone().multiplyScalar(m * dt * 16 * effort), true);
      if (input.jump && this.jumpCool === 0) {
        // A hop with a twist toward upright
        this.body.applyImpulse({ x: 0, y: m * 5.5, z: 0 }, true);
        const t = axis.multiplyScalar(m * 2.2);
        this.body.applyTorqueImpulse({ x: t.x, y: t.y, z: t.z }, true);
        this.jumpCool = 0.8;
        this.justJumped = true;
      }
      this.grounded = grounded;
      return;
    }

    // Jump (with a short cooldown so it cannot be spammed into orbit)
    if (input.jump && grounded && this.jumpCool === 0) {
      const m = this.body.mass();
      this.body.applyImpulse({ x: 0, y: m * 7.5, z: 0 }, true);
      this.jumpCool = 0.6;
      this.justJumped = true;
    }
    // Anti-roll: on the ground, gently push the car back toward level so hard turns slide
    // instead of tipping over (an arcade trick; real cars would roll)
    if (grounded) {
      const q = this.body.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const fix = up.clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(this.body.mass() * dt * this.antiRoll);
      const w = this.body.angvel(), m = this.body.mass() * dt * 4;
      this.body.applyTorqueImpulse({ x: fix.x - w.x * m, y: 0, z: fix.z - w.z * m }, true);
    }
    // Air control: steer spins the car, throttle pitches it, so flips are possible
    if (!grounded) {
      const q = this.body.rotation();
      const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const side = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
      const k = this.body.mass() * dt * 4.5;
      const t = up.multiplyScalar(input.steer * k * 0.9).add(side.multiplyScalar(-input.throttle * k));
      this.body.applyTorqueImpulse({ x: t.x, y: t.y, z: t.z }, true);
    }
    this.grounded = grounded;
  }

  sync() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
    this.group.updateMatrixWorld();
    const s = this.style;
    for (let i = 0; i < 4; i++) {
      const [x, y, z] = this.wheelPts[i];
      const susp = this.controller.wheelSuspensionLength(i) ?? s.rest;
      const local = new THREE.Vector3(x, y - susp, z);
      const w = this.wheels[i];
      w.position.copy(local.applyMatrix4(this.group.matrixWorld));
      const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.controller.wheelSteering(i) || 0);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), this.controller.wheelRotation(i) || 0);
      w.quaternion.copy(this.group.quaternion).multiply(steerQ).multiply(spinQ);
    }
  }

  get position() {
    return this.group.position;
  }

  get speed() {
    return this.controller.currentVehicleSpeed();
  }

  isUpsideDown() {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.quaternion);
    return up.y < 0.3;
  }
}
