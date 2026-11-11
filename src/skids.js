import * as THREE from 'three';

// Skid marks and tire tracks (2026-11-11). Every wheel draws a strip on the ground behind it:
// - on the road only when the tires slide (drifts, hard turns, the handbrake, braking hard): dark rubber;
// - on sand and earth whenever the car drives over them: a faint pressed-in track.
// The strips sit in one ring buffer of quads (the oldest is reused when it fills up). Each corner carries
// the time it was laid and how dark it is, and the shader fades it out over its life, so nothing has to be
// updated after it is laid. They darken whatever is under them, so they read by day and at night.

const MAX = 6000; // quads in the buffer
const LIFE = { road: 30, sand: 22, dirt: 26 }; // seconds before a mark has faded
const DARK = { road: 0.55, sand: 0.3, dirt: 0.32 };
const STEP = 0.35; // a new piece every this many units

export class Skids {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 4 * 3);
    this.info = new Float32Array(MAX * 4 * 3); // birth time, darkness, life
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 3, i * 4, i * 4 + 3, i * 4 + 2], i * 6); // corners: back left, back right, front left, front right
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.info.fill(-999);
    this.uTime = { value: 0 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      transparent: true,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
      vertexShader: /* glsl */ `
        attribute vec3 aInfo; uniform float uTime; varying float vA; varying float vEdge;
        void main() {
          float age = uTime - aInfo.x;
          vA = aInfo.y * ( 1.0 - smoothstep( aInfo.z * 0.45, aInfo.z, age ) ) * smoothstep( 0.0, 0.15, age + 0.15 );
          vEdge = float( gl_VertexID % 2 ); // 0 on one side of the strip, 1 on the other
          gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vEdge;
        void main() {
          float soft = smoothstep( 0.0, 0.25, vEdge ) * smoothstep( 1.0, 0.75, vEdge ); // soft edges
          float a = vA * soft;
          if ( a < 0.003 ) discard;
          gl_FragColor = vec4( 0.06, 0.04, 0.08, a ); // a dark, slightly purple tint, like the island's shadows
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.last = [null, null, null, null]; // last point laid per wheel
    this.changed = []; // quads laid this frame: only those are sent to the GPU
  }

  lay(w, p, side, width, kind, strength, t) {
    const last = this.last[w];
    if (!last || last.kind !== kind) { this.last[w] = { p: p.clone(), side: side.clone(), kind }; return; }
    if (last.p.distanceTo(p) < STEP) return;
    if (last.p.distanceTo(p) > 2) { this.last[w] = { p: p.clone(), side: side.clone(), kind }; return; } // a jump or a reset
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const hw = width / 2;
    // Even corners on one edge of the strip, odd on the other (the shader's soft edge reads the vertex number)
    const order = [
      last.p.clone().addScaledVector(last.side, -hw), last.p.clone().addScaledVector(last.side, hw),
      p.clone().addScaledVector(side, -hw), p.clone().addScaledVector(side, hw),
    ];
    order.forEach((c, k) => this.pos.set([c.x, c.y, c.z], (i * 4 + k) * 3));
    for (let k = 0; k < 4; k++) this.info.set([t, DARK[kind] * strength, LIFE[kind]], (i * 4 + k) * 3);
    this.last[w] = { p: p.clone(), side: side.clone(), kind };
    this.changed.push(i);
  }

  // wheels: the four wheel objects (front left, front right, rear left, rear right); state from main.js
  update(t, car, { surface, sliding, braking, inWater, radius }) {
    this.uTime.value = t;
    const q = car.group.quaternion;
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const fast = Math.abs(car.speed);
    for (let w = 0; w < 4; w++) {
      const rear = w >= 2;
      let mark = car.grounded && !inWater && fast > 1.5;
      let strength = 1;
      if (mark && surface === 'road') {
        mark = sliding || (braking && fast > 6);
        if (!rear && !sliding) mark = false;
        strength = car.drifting ? 1 : 0.75;
      }
      if (!mark) { this.last[w] = null; continue; }
      const c = car.wheels[w].position;
      const p = new THREE.Vector3(c.x, c.y - radius + 0.03, c.z);
      this.lay(w, p, side, radius * 0.75, surface, strength, t);
    }
    if (this.changed.length) {
      for (const a of [this.mesh.geometry.attributes.position, this.mesh.geometry.attributes.aInfo]) {
        a.clearUpdateRanges();
        for (const i of this.changed) a.addUpdateRange(i * 12, 12);
        a.needsUpdate = true;
      }
      this.changed = [];
    }
  }
}
