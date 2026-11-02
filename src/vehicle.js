import * as THREE from 'three';
import RAPIER from './rapier.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shade } from './shading.js';

// The car model is fitted automatically: scaled to the game's car length, turned so its front faces +X
// (the front is the end away from the spare tire), and, when it has its own road wheels, the physics
// wheels are placed where those wheels are and sized to them. The road wheels are dropped from the body;
// the spare tire is the template for the four wheels the game spins and steers.
const CAR_LENGTH = 2.85; // game units, front to back
const SPARE_PART = /spare/i;
const ROAD_WHEEL = /knobby tire core|deep tread block|wheel hub|hub center|wheel rim|tire/i; // the model's own wheels (the spare is kept)
const nm = (n) => n.replace(/_/g, ' '); // the loader turns spaces in part names into underscores
const BOARD_PART = /surfboard/i; // the surfboard, its fin and ties: a separate piece that bounces on the roof
const isLamp = (n) => /lens|headlight|lamp|tail ?light/i.test(nm(n)) && !/housing|recessed|cap\b/i.test(nm(n)); // parts that light up
const TAIL_LAMP = /tail ?light|brake ?light/i, REVERSE_LAMP = /revers/i; // the model's own rear lamps, when it has them
const ACCENT = '#FFC43D'; // sunny yellow: wheel rims (2026-11-01)

// Car lights: lamp materials glow and a halo and a pool of light show at night (updateCarLamps, called each frame)
// Tail lights (2026-11-01): the model has none, so two small lamps are added at the back corners. They glow
// softly at night and flare when braking; a white reversing lamp sits beside each.
const LAMPS = { materials: [], glows: [], tail: null, reverse: null, tailGlows: [], braking: 0, reversing: 0 };
export const CAR_LAMPS = LAMPS;
export function updateCarLamps(night) {
  for (const m of LAMPS.materials) m.emissiveIntensity = 0.45 + 2.2 * night; // a warm glow by day too, kept low so the amber does not clip to white (2026-11-01)
  for (const g of LAMPS.glows) { g.material.opacity = g.userData.max * night; g.visible = night > 0.01; }
  if (LAMPS.force) Object.assign(LAMPS, LAMPS.force); // automated checks can hold the brake or reverse lamps on
  if (LAMPS.tail) {
    const b = LAMPS.braking;
    LAMPS.tail.emissiveIntensity = 0.35 + 1.1 * night + 3.2 * b;
    LAMPS.reverse.emissiveIntensity = 0.1 + 3.2 * LAMPS.reversing;
    for (const g of LAMPS.tailGlows) {
      const o = g.userData.reverse ? 0.75 * LAMPS.reversing * (0.35 + 0.65 * night) : Math.max(0.35 * night, b * (0.7 + 0.3 * night));
      g.material.opacity = o; g.visible = o > 0.01;
    }
  }
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

    const byMat = new Map(), spareByMat = new Map(), wheelBoxes = new Map(), boardByMat = new Map();
    const chassis = new THREE.Box3();
    const modelRear = { tail: null, reverse: null, spots: [] };
    let rimMat = null;
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
      if (ROAD_WHEEL.test(nm(o.name)) && !SPARE_PART.test(nm(o.name))) { // collect the road wheels by position (front/back, left/right), then drop them
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        const key = `${Math.sign(c.x)},${Math.sign(c.z)}`;
        if (!wheelBoxes.has(key)) wheelBoxes.set(key, new THREE.Box3());
        wheelBoxes.get(key).union(g.boundingBox);
        return;
      }
      fitted.union(g.boundingBox);
      let m = o.material;
      const pn = nm(o.name);
      if (isLamp(o.name) && (TAIL_LAMP.test(pn) || REVERSE_LAMP.test(pn))) { // the model's own tail and reversing lamps
        const rev = REVERSE_LAMP.test(pn);
        const key = rev ? 'reverse' : 'tail';
        modelRear[key] ??= m.clone();
        m = modelRear[key];
        modelRear.spots.push([g.boundingBox.getCenter(new THREE.Vector3()), rev]);
      } else if (isLamp(o.name)) { // lamps get their own copy of the material so only they glow
        if (!lampMats.has(m)) lampMats.set(m, m.clone());
        m = lampMats.get(m);
        lampSpots.push(g.boundingBox.getCenter(new THREE.Vector3()));
      } else if (SPARE_PART.test(pn) && /metal/i.test(m.name)) { // the spare's hub (the wheel template) in the accent color
        rimMat ??= Object.assign(m.clone(), { name: m.name + ' rim' });
        rimMat.color.set(ACCENT);
        m = rimMat;
      }
      if (/coral chassis/i.test(nm(o.name))) chassis.union(g.boundingBox);
      const into = BOARD_PART.test(nm(o.name)) ? boardByMat : byMat;
      if (!into.has(m)) into.set(m, []);
      into.get(m).push(g);
      if (SPARE_PART.test(o.name)) {
        if (!spareByMat.has(m)) spareByMat.set(m, []);
        spareByMat.get(m).push(g.clone());
      }
    });
    // Finish per material (2026-11-01): glossy paint and glass, tinted highlights on metal, satin black
    // trim, matte rubber. Gloss is [strength, sharpness, metal tint], drawn by the island's shading recipe.
    const finish = (name) => {
      if (/glass|windshield/i.test(name)) return [1.1, 160, 0];
      if (/metal/i.test(name)) return [0.7, 28, 1];
      if (/coral|flare|yellow|teal/i.test(name)) return [0.55, 70, 0];
      if (/cream/i.test(name)) return [0.4, 50, 0];
      if (/seat/i.test(name)) return [0.18, 20, 0];
      if (/black/i.test(name)) return [0.22, 36, 0];
      return null; // rubber
    };
    const prepped = new Set();
    const prep = (m) => {
      if (prepped.has(m)) return m;
      prepped.add(m);
      m.flatShading = true;
      // Seats a step darker so the coral body reads as one shape against its interior (2026-11-01)
      if (/seat/i.test(m.name) && m.color.getHSL({}).l > 0.15) m.color.multiplyScalar(0.5);
      // Yellow rims and stripe keep a little of their own color in shade, so the purple shadow tint does not
      // turn them brown (2026-11-02, open buggy v3)
      if (/^yellow/i.test(m.name)) { m.emissive = m.color.clone(); m.emissiveIntensity = 0.3; }
      if (/windshield|glass/i.test(m.name)) { m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.color.lerp(new THREE.Color('#bfeeff'), 0.35); }
      const gloss = finish(m.name);
      shade(m, gloss ? { gloss } : {});
      m.needsUpdate = true;
      return m;
    };
    const body = new THREE.Group();
    for (const [m, geos] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), prep(m));
      mesh.castShadow = true;
      mesh.receiveShadow = !m.transparent; // the roll cage and board shade the seats and hood
      body.add(mesh);
    }
    // The surfboard on its own pivot so it can lag and bounce a little against its ties
    let board = null;
    if (boardByMat.size) {
      const bb = new THREE.Box3();
      for (const geos of boardByMat.values()) for (const g of geos) bb.union(g.boundingBox);
      const pivot = bb.getCenter(new THREE.Vector3()).setY(bb.min.y);
      board = new THREE.Group();
      board.position.copy(pivot);
      for (const [m, geos] of boardByMat) {
        const g = mergeGeometries(geos);
        g.translate(-pivot.x, -pivot.y, -pivot.z);
        const mesh = new THREE.Mesh(g, prep(m));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        board.add(mesh);
      }
      body.add(board);
    }

    // Tail lights and reversing lamps on the back corners of the chassis
    if (modelRear.tail) { // the model has its own tail lamps: light those instead of adding pods
      const tex = glowTexture();
      modelRear.tail.emissive = new THREE.Color('#ff2a14');
      if (modelRear.reverse) modelRear.reverse.emissive = new THREE.Color('#fff6e0');
      for (const [p, reverse] of modelRear.spots) {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: reverse ? '#fff4d8' : '#ff4030', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
        halo.position.copy(p).add(new THREE.Vector3(-0.1, 0, 0));
        halo.scale.setScalar(reverse ? 0.7 : 0.9);
        halo.userData.reverse = reverse;
        halo.visible = false;
        body.add(halo); LAMPS.tailGlows.push(halo);
      }
      LAMPS.tail = modelRear.tail;
      LAMPS.reverse = modelRear.reverse || new THREE.MeshStandardMaterial();
    } else if (!chassis.isEmpty()) {
      const tail = shade(new THREE.MeshStandardMaterial({ color: '#d42a1c', emissive: '#ff2a14', emissiveIntensity: 0.35, flatShading: true }), { gloss: [0.6, 80, 0] });
      const rev = shade(new THREE.MeshStandardMaterial({ color: '#f4efe6', emissive: '#fff6e0', emissiveIntensity: 0.1, flatShading: true }), { gloss: [0.6, 80, 0] });
      const housing = byMat.size ? [...byMat.keys()].find((m) => /black/i.test(m.name)) : null;
      // Inboard of the rear fender flares (which hide the corners) and outboard of the spare
      // Small pods on the top rear edge of the tub, inboard of the rear fender flares: the bumper tube and the
      // flares hide anything lower or further out from the game's high camera
      const x = chassis.min.x + 0.03, y = chassis.max.y + 0.09, zEdge = chassis.max.z - 0.17;
      const tex = glowTexture();
      for (const side of [1, -1]) {
        const parts = [
          [new THREE.BoxGeometry(0.12, 0.2, 0.3), housing || tail, [x + 0.04, y - 0.01, side * (zEdge - 0.06)]],
          [new THREE.BoxGeometry(0.03, 0.13, 0.15), tail, [x - 0.02, y, side * zEdge]],
          [new THREE.BoxGeometry(0.03, 0.09, 0.08), rev, [x - 0.02, y, side * (zEdge - 0.14)]],
        ];
        for (const [geo, m, p] of parts) {
          const mesh = new THREE.Mesh(geo, m);
          mesh.position.set(...p);
          mesh.castShadow = true;
          body.add(mesh);
        }
        for (const [reverse, zz, color] of [[false, zEdge, '#ff4030'], [true, zEdge - 0.14, '#fff4d8']]) {
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
          halo.position.set(x - 0.1, y, side * zz);
          halo.scale.setScalar(reverse ? 0.7 : 0.9);
          halo.userData.reverse = reverse;
          halo.visible = false;
          body.add(halo); LAMPS.tailGlows.push(halo);
        }
      }
      LAMPS.tail = tail; LAMPS.reverse = rev;
      body.userData.debug = { chassis: chassis.clone(), fitted: fitted.clone() };
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
      m.color.set('#ffb340'); // warm amber lenses, glowing by day too
      m.emissive = new THREE.Color('#ff9a2a');
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
      const mesh = new THREE.Mesh(g, prep(m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wheel.add(mesh);
    }
    return { body, wheel, fit, board };
  } catch (err) {
    console.warn('Vehicle model failed to load, using the built-in one.', err);
    return null;
  }
}

// Soft rounded-rectangle shadow texture for under the car
function blobTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(14px)';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(26, 30, S - 52, S - 60, 30);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
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
    // The body sits on its own pose group so it can lean, squat, dip and squash on springs while the
    // physics box and the wheels carry on as before (looks only, the driving is unchanged)
    this.pose = new THREE.Group();
    this.group.add(this.pose);
    this.board = model?.board || null;
    this.boardRest = this.board ? this.board.position.clone() : null;
    this.springs = { roll: [0, 0], pitch: [0, 0], lift: [0, 0], bRoll: [0, 0], bPitch: [0, 0], bLift: [0, 0] };
    this.prevLocalVel = new THREE.Vector3(); // last world velocity
    this.accel = new THREE.Vector3();
    this.wasGrounded = true;
    this.models = {};
    for (const [k, s] of Object.entries(STYLES)) {
      const m = model ? model.body : s.build();
      m.visible = false;
      this.pose.add(m);
      this.models[k] = m;
    }
    // A soft shadow right under the car: it shrinks and fades as the car leaves the ground, so jump height reads
    // from the high camera (the sun's own shadow falls off to one side)
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#2a1c52', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    this.blob.renderOrder = 1;
    this.blobSize = [CAR_LENGTH * 1.15, Math.max(0.66, model?.fit?.halfWidth ?? 0.66) * 2 + 0.75];
    scene.add(this.blob);
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

    LAMPS.braking = input.brake || brake >= 5 ? 1 : 0;
    LAMPS.reversing = input.throttle < 0 && speed < -0.5 ? 1 : 0;
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
    // Self-righting (2026-10-30, like the reference): stuck on a side or the roof, or wedged and not moving
    // with the throttle held, for a moment, the car hops and turns itself back onto its wheels
    const lv = this.body.linvel(), av = this.body.angvel();
    const still = Math.hypot(lv.x, lv.y, lv.z) < 1.2 && Math.hypot(av.x, av.y, av.z) < 1.5;
    const wedged = !!input.throttle && Math.abs(speed) < 0.4 && still;
    this.stuck = (carUp.y < 0.55 && still) || wedged ? (this.stuck || 0) + dt : 0;
    if (this.stuck > (wedged && carUp.y >= 0.55 ? 1.5 : 0.8) && !this.righting) {
      const m = this.body.mass();
      this.body.applyImpulse({ x: 0, y: m * (carUp.y < 0.55 ? 6.5 : 5), z: 0 }, true);
      this.righting = 1.0;
      this.stuck = 0;
    }
    if (this.righting) {
      this.righting = Math.max(0, this.righting - dt);
      // Turn the roof back toward the sky: a spring toward upright with damping, so it lands level
      let axis = carUp.clone().cross(new THREE.Vector3(0, 1, 0));
      const angle = Math.acos(THREE.MathUtils.clamp(carUp.y, -1, 1));
      if (axis.length() < 1e-3) axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rquat);
      axis.normalize();
      const k = 70 * angle, d = 9;
      this.body.applyTorqueImpulse({ x: (axis.x * k - av.x * d) * 45 * dt, y: (-av.y * d * 0.3) * 45 * dt, z: (axis.z * k - av.z * d) * 45 * dt }, true);
      if (angle < 0.15 && grounded) this.righting = 0;
    }
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

  // Looks only (2026-11-01): springs that lean the body out of turns, squat it when accelerating, dip its nose
  // when braking and squash it on landing, plus a surfboard that lags a little behind, and the ground shadow.
  // Called once per rendered frame after sync().
  updatePose(dt) {
    if (dt <= 0 || this.holdPose) return;
    const S = this.springs, q = this.group.quaternion;
    const lv = this.body.linvel();
    // Acceleration measured in the world, then turned into the car's frame (forward x, side z)
    const v = new THREE.Vector3(lv.x, lv.y, lv.z);
    const a = v.clone().sub(this.prevLocalVel).divideScalar(dt).applyQuaternion(q.clone().invert());
    this.prevLocalVel.copy(v);
    const clampA = (v) => THREE.MathUtils.clamp(v, -28, 28);
    this.accel.lerp(new THREE.Vector3(clampA(a.x), 0, clampA(a.z)), 1 - Math.exp(-dt * 14));
    const g = this.grounded;
    const tRoll = g ? THREE.MathUtils.clamp(-this.accel.z * 0.0045, -0.08, 0.08) : 0;
    const tPitch = g ? THREE.MathUtils.clamp(this.accel.x * 0.0045, -0.07, 0.06) : 0;
    if (g && !this.wasGrounded && this.fallSpeed > 2) { // landing: push the body down into a squash, the board nods
      const k = Math.min(1, (this.fallSpeed - 2) / 6);
      S.lift[1] -= 2.2 * k; S.bLift[1] -= 3 * k; S.bPitch[1] += 1.4 * k * (Math.random() < 0.5 ? -1 : 1);
    }
    this.fallSpeed = g ? 0 : Math.max(0, -lv.y);
    this.wasGrounded = g;
    const step = (sp, target, k, c) => { // a damped spring, a few small steps so it stays stable at low frame rates
      const n = Math.ceil(dt / 0.008), h = dt / n;
      for (let i = 0; i < n; i++) { sp[1] += (k * (target - sp[0]) - c * sp[1]) * h; sp[0] += sp[1] * h; }
      return sp[0];
    };
    const roll = step(S.roll, tRoll, 140, 11), pitch = step(S.pitch, tPitch, 140, 11);
    const lift = THREE.MathUtils.clamp(step(S.lift, 0, 220, 13), -0.16, 0.1);
    // Lean around a point near the axles, so it looks like the suspension doing it
    const pivot = new THREE.Vector3(0, -0.45, 0);
    this.pose.rotation.set(roll, 0, pitch);
    this.pose.position.copy(pivot).sub(pivot.clone().applyEuler(this.pose.rotation)).add(new THREE.Vector3(0, lift, 0));
    const squash = THREE.MathUtils.clamp(lift * 0.5, -0.05, 0.03);
    this.pose.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    if (this.board) {
      const br = step(S.bRoll, roll * 1.6, 70, 4.5), bp = step(S.bPitch, pitch * 1.8, 70, 4.5);
      const bl = THREE.MathUtils.clamp(step(S.bLift, 0, 160, 6), -0.08, 0.06);
      this.board.rotation.set(br - roll, 0, bp - pitch);
      this.board.position.copy(this.boardRest).add(new THREE.Vector3(0, bl * 0.5, 0));
    }
    // Ground shadow: a ray straight down past the car's own body
    const t = this.body.translation();
    const hit = this.world.castRayAndGetNormal(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), 12, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, this.body);
    if (hit) {
      const h = Math.max(0, hit.timeOfImpact - 0.75);
      const fade = 1 - THREE.MathUtils.smoothstep(h, 0, 3.2);
      this.blob.visible = fade > 0.02;
      this.blob.position.set(t.x, t.y - hit.timeOfImpact + 0.03, t.z);
      const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      fwd.addScaledVector(n, -fwd.dot(n)).normalize();
      const side = new THREE.Vector3().crossVectors(fwd, n);
      this.blob.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, n, side));
      const sc = 1 - Math.min(0.5, h * 0.25);
      this.blob.scale.set(this.blobSize[0] * sc, 1, this.blobSize[1] * sc);
      this.blob.material.opacity = 0.42 * fade;
    } else this.blob.visible = false;
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
