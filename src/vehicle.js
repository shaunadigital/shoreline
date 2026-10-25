import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

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
    wheelRadius: 0.42,
    rest: 0.4,
    engine: 290,
    maxSpeed: 17,
    steer: 0.5,
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
  constructor(scene, world, spawn) {
    this.world = world;
    this.spawn = spawn.clone();
    this.styleKey = 'offroad';

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCanSleep(false)
        .setLinearDamping(0.15)
        .setAngularDamping(0.8)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.15, 0.32, 0.68)
        .setMassProperties(120, { x: 0, y: -0.4, z: 0 }, { x: 30, y: 60, z: 50 }, { w: 1, x: 0, y: 0, z: 0 })
        .setFriction(0.4)
        .setRestitution(0.1),
      this.body
    );

    this.controller = world.createVehicleController(this.body);
    this.wheelPts = [[0.82, -0.12, 0.62], [0.82, -0.12, -0.62], [-0.82, -0.12, 0.62], [-0.82, -0.12, -0.62]];
    this.wheelPts.forEach(([x, y, z], i) => {
      this.controller.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, 0.32, 0.3);
      this.controller.setWheelSuspensionStiffness(i, 26);
      this.controller.setWheelFrictionSlip(i, 2.4);
      this.controller.setWheelMaxSuspensionTravel(i, 0.35);
      this.controller.setWheelSuspensionCompression(i, 2.4);
      this.controller.setWheelSuspensionRelaxation(i, 3.0);
      this.controller.setWheelSideFrictionStiffness(i, 1.2);
    });

    this.group = new THREE.Group();
    scene.add(this.group);
    this.models = {};
    for (const [k, s] of Object.entries(STYLES)) {
      const m = s.build();
      m.visible = false;
      this.group.add(m);
      this.models[k] = m;
    }
    this.wheels = this.wheelPts.map(() => {
      const w = new THREE.Group();
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
    this.setStyle('offroad');
  }

  get style() {
    return STYLES[this.styleKey];
  }

  setStyle(key) {
    this.styleKey = key;
    const s = STYLES[key];
    for (const [k, m] of Object.entries(this.models)) m.visible = k === key;
    this.models[key].position.y = s.wheelRadius - 0.3 + 0.05;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelRadius(i, s.wheelRadius);
      this.controller.setWheelSuspensionRestLength(i, s.rest);
      this.wheels[i].scale.set(s.wheelRadius, s.wheelRadius, key === 'offroad' ? 1.3 : 1);
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
    const targetSteer = input.steer * s.steer * THREE.MathUtils.lerp(1, 0.45, Math.min(1, Math.abs(speed) / s.maxSpeed));
    this.steer = THREE.MathUtils.lerp(this.steer, targetSteer, 1 - Math.exp(-dt * 10));

    let force = 0;
    let brake = 0;
    if (input.throttle > 0) {
      force = speed < s.maxSpeed ? -s.engine * input.throttle : 0;
      if (speed < -0.5) brake = 4;
    } else if (input.throttle < 0) {
      force = speed > -s.maxSpeed * 0.5 ? -s.engine * 0.7 * input.throttle : 0;
      if (speed > 0.5) brake = 4;
    }
    if (input.brake) brake = 6;
    if (input.boost && input.throttle > 0 && speed < s.maxSpeed * 1.5) force *= 1.7;
    if (!input.throttle && !input.brake) brake = 0.25;

    for (let i = 0; i < 4; i++) {
      this.controller.setWheelEngineForce(i, i >= 2 ? force : force * 0.4);
      this.controller.setWheelBrake(i, brake);
    }
    this.controller.setWheelSteering(0, this.steer);
    this.controller.setWheelSteering(1, this.steer);
    this.controller.updateVehicle(dt);
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
