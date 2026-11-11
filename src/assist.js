import * as THREE from 'three';
import RAPIER from './rapier.js';

// Tree dodge (2026-11-11, Shauna: "make it so that it's easier to drive around without hitting trees").
// Each physics step, look ahead along the way the car is moving for tree trunks it would hit. When one is in
// the way, turn the car's heading and its velocity together by a small angle away from the trunk, just
// enough to pass it with a little room. It never adds or takes away speed, only bends the path, and it
// works with the player's steering: steering away already, it adds little; steering into the trunk, it
// still bends the path but only as hard as its turn limit allows.
// Trunks also became slippery (friction 0, world.js and flora.js), so a car that still clips one slides
// along it instead of stopping dead.
// `?assist=0` in the address turns the dodge off.

const ON = new URLSearchParams(location.search).get('assist') !== '0';
const MAX_TURN = 1.5; // radians a second the dodge may bend the path
const MARGIN = 0.45; // room left between the car's side and the trunk
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion();

export class TreeAssist {
  // trees: [x, z, radius] trunks; halfWidth: half the car's width
  constructor(trees, halfWidth) {
    this.trees = trees;
    this.halfWidth = halfWidth;
    this.on = ON;
    this.active = 0; // last dodge angle per second (for checks and the debug panel)
    this.dodges = 0; // how many times it stepped in (for checks)
    this._was = false;
  }

  step(car, dt) {
    this.active = 0;
    if (!this.on || !car.grounded) { this._was = false; return; }
    const v = car.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (speed < 4) { this._was = false; return; }
    const p = car.body.translation();
    const fx = v.x / speed, fz = v.z / speed; // direction of travel (forward or reverse)
    const look = THREE.MathUtils.clamp(speed * 0.75, 4, 15);
    // Nearest trunk ahead that the car's path would touch
    let hit = null, best = Infinity;
    for (const [tx, tz, r] of this.trees) {
      const dx = tx - p.x, dz = tz - p.z;
      const along = dx * fx + dz * fz;
      if (along < 0.6 || along > look) continue;
      const lat = dx * fz - dz * fx; // positive: on the side a positive turn about Y goes (the left)
      const clear = r + this.halfWidth + MARGIN;
      if (Math.abs(lat) >= clear || along >= best) continue;
      best = along;
      hit = { along, lat, clear, dist: Math.hypot(dx, dz) };
    }
    if (!hit) { this._was = false; return; }
    // Turn away from the side the trunk is on (a trunk dead ahead: away from it toward where the player steers)
    let away = hit.lat > 0 ? -1 : 1; // -1: turn right, 1: turn left
    if (Math.abs(hit.lat) < 0.15 && car.steerInput) away = car.steerInput > 0 ? 1 : -1;
    // How far the heading must turn so the path just clears the trunk: the angle to the trunk's edge minus
    // the angle to its centre
    const d = Math.max(hit.dist, hit.clear + 0.01);
    const need = Math.asin(Math.min(1, hit.clear / d)) - Math.asin(Math.min(1, Math.abs(hit.lat) / d)) * (Math.sign(hit.lat) === -away ? 1 : -1);
    if (need <= 0) { this._was = false; return; }
    const angle = Math.min(need, MAX_TURN * dt * (car.drifting ? 0.6 : 1));
    // Positive rotation about Y turns the direction of travel to the left (counterclockwise from above)
    const a = angle * away;
    _r.setFromAxisAngle(Y, a);
    const nv = new THREE.Vector3(v.x, 0, v.z).applyQuaternion(_r);
    car.body.setLinvel({ x: nv.x, y: v.y, z: nv.z }, true);
    const q = car.body.rotation();
    _q.set(q.x, q.y, q.z, q.w).premultiply(_r);
    car.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.active = angle / dt;
    if (!this._was) this.dodges++;
    this._was = true;
  }
}

// Bumps (2026-11-11): which trunks the car is touching right now. Each tree is checked against the car's
// own box (its length and width, turned with the car), so a scrape along the side counts too. A tree
// counts once, then not again until the car has been clear of it for a moment.
export class TreeBumps {
  constructor(trees, halfLength, halfWidth) {
    Object.assign(this, { trees, halfLength, halfWidth });
    this.touching = new Map(); // tree index -> time last touched
  }

  // Returns the trees newly hit: [{ tree, dir: [x, z] away from the car, speed }]
  check(car, t) {
    const out = [];
    const p = car.position, speed = Math.abs(car.speed);
    const q = car.group.quaternion;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q), side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    this.trees.forEach((tree, i) => {
      const [tx, tz, r] = tree;
      const dx = tx - p.x, dz = tz - p.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) return;
      const a = dx * fwd.x + dz * fwd.z, b = dx * side.x + dz * side.z;
      const ca = THREE.MathUtils.clamp(a, -this.halfLength, this.halfLength), cb = THREE.MathUtils.clamp(b, -this.halfWidth, this.halfWidth);
      const gap = Math.hypot(a - ca, b - cb) - r;
      if (gap < 0.18) {
        const last = this.touching.get(i);
        this.touching.set(i, t);
        if (last === undefined && speed > 1.5) {
          const d = Math.hypot(dx, dz) || 1;
          out.push({ tree, dir: [dx / d, dz / d], speed });
        }
      } else if (this.touching.has(i) && t - this.touching.get(i) > 0.6) this.touching.delete(i);
    });
    return out;
  }
}

// Tree trunks are slippery (2026-11-11): no friction, so a car that clips one slides along it instead of
// catching and stopping dead (the tree dodge in assist.js steers round most of them first)
export function trunkCollider(halfHeight, radius) {
  return RAPIER.ColliderDesc.cylinder(halfHeight, radius)
    .setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setRestitution(0.15);
}
