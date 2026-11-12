import * as THREE from 'three';
import RAPIER from './rapier.js';
import { heightAt } from './terrain.js';
import { bakeColored } from './models.js';
import { FALLS, SKY_SHELL } from './layout.js';
import { CAR_LAMPS } from './vehicle.js';

// Hidden secrets (2026-11-04, Shauna: "the cave behind the waterfall hidden secret, and any others you can
// think of"). Four to find, none of them announced until found:
//   - Behind the falls: drive through the waterfall just west of the landing into the cave, where a golden tiki waits.
//   - Sky shell: a golden shell floating high over the jump yard, only reachable by boosting through both east ramps.
//   - Aloha: type A L O H A on the keyboard and the off-roader changes its paint (again for the next color).
//   - Wave rider: be in the surf at speed when a wave runs up the beach into you.
// Found secrets are kept in localStorage; a Secrets counter appears in the HUD once the first is found.

const KEY = 'shoreline.secrets';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } },
};
const LIST = {
  falls: ['Secret: behind the falls', 'A golden tiki was hiding in the cave.'],
  sky: ['Secret: the sky shell', 'Boosted high enough to grab it.'],
  aloha: ['Secret: aloha!', 'New paint. Type it again to change colors.'],
  wave: ['Secret: wave rider', 'Caught a wave at full speed.'],
};
const PAINTS = ['#26b7b1', '#ffc43d', '#ff8fb8', '#a98cff', '#7ccf5a', null]; // null: back to the original coral

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Secrets {
  constructor({ scene, world, island, ui, fx, sound, pinModel, scallopModel }) {
    Object.assign(this, { scene, ui, fx, sound });
    this.found = new Set(store.get());
    this.total = Object.keys(LIST).length;
    if (this.found.size) this.showCount();
    this.t = 0;
    this.buildFalls(scene, island, pinModel);
    this.buildSkyShell(scene, scallopModel);
    // Aloha: the last five letters typed
    this.typed = '';
    this.paint = -1;
    addEventListener('keydown', (e) => {
      if (e.repeat || e.key.length !== 1) return;
      this.typed = (this.typed + e.key.toLowerCase()).slice(-5);
      if (this.typed === 'aloha') { this.typed = ''; this.find('aloha'); this.repaint(); } // found first, so its paint is unlocked (garage.js)
    });
  }

  showCount() { this.ui.setStat('secrets', `${this.found.size}/${this.total}`, this.found.size === this.total ? 'all found!' : 'hidden on the island'); }

  find(id, at = null) {
    if (this.found.has(id)) return false;
    this.found.add(id);
    store.set([...this.found]);
    const [title, body] = LIST[id];
    this.ui.toast(`${title} 🔍`, body, 3200);
    this.showCount();
    if (at) this.fx.confetti(at);
    this.sound.play('rare');
    if (this.found.size === this.total) setTimeout(() => this.ui.toast('All four secrets! 🌺', 'You know this island by heart.', 3400), 3400);
    return true;
  }

  // ---------- Aloha: new paint ----------
  repaint() {
    this.paint = (this.paint + 1) % PAINTS.length;
    for (const m of CAR_LAMPS.paint) {
      m.userData.base ||= m.color.clone();
      const c = PAINTS[this.paint] ? new THREE.Color(PAINTS[this.paint]) : m.userData.base.clone();
      if (/^flare/i.test(m.name) && PAINTS[this.paint]) c.multiplyScalar(0.82); // the fender flares stay a shade darker
      m.color.copy(c); m.emissive.copy(c);
    }
  }

  // ---------- Wave rider (called by the surf when a wave reaches the car) ----------
  waveHit(speed, at) { if (speed > 7) this.find('wave', at); }

  // ---------- The waterfall and its cave ----------
  // Local frame: u along FALLS.dir (toward the path), v across. The cliff foot is u = 0; the rock rises behind
  // (u < 0) to a grassy top, with a slot cut into it for the cave; a sheet of falling water covers the cave
  // mouth and a shallow plunge pool spreads in front.
  local(x, z) { const [fx, fz] = FALLS.dir, dx = x - FALLS.x, dz = z - FALLS.z; return { u: dx * fx + dz * fz, v: -dx * fz + dz * fx }; }
  world(u, v) { const [fx, fz] = FALLS.dir; return [FALLS.x + fx * u - fz * v, FALLS.z + fz * u + fx * v]; }

  buildFalls(scene, island, pinModel) {
    const H = 5.2, U0 = -9.5, U1 = 0.7, V = 6.2, NU = 34, NV = 40;
    const slot = (u, v) => (1 - smooth(2.1, 2.8, Math.abs(v))) * smooth(-5.2, -4.4, u); // the cave's floor plan, wide enough for the car with room to steer
    const hill = (u, v) => {
      const body = smooth(0.7, -0.6, u) * smooth(U0, U0 + 3.5, u) * smooth(V, V - 2.8, Math.abs(v));
      const lump = 0.35 * Math.sin(u * 1.3 + v * 0.7) * Math.cos(v * 1.1 - u * 0.4) + 0.25 * Math.sin(v * 2.3 + 1);
      return Math.max(0, (H + lump) * body * (1 - slot(u, v)));
    };
    // Height field as triangles, each with its own flat color by slope and height
    const pos = [], col = [], rock = new THREE.Color('#8a7d72'), dark = new THREE.Color('#5f544c'), wet = new THREE.Color('#4f5b5a'), green = new THREE.Color('#69a848'), green2 = new THREE.Color('#5a9a40');
    const P = (i, j) => { const u = U0 + ((U1 - U0) * i) / NU, v = -V + (2 * V * j) / NV, h = hill(u, v); const [x, z] = this.world(u, v); return new THREE.Vector3(x, heightAt(x, z) + h - (h < 0.05 ? 0.08 : 0), z); };
    const tri = (a, b, c, i, j) => {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      if (n.y < 0) n.negate();
      const y = (a.y + b.y + c.y) / 3 - heightAt((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3);
      if (y < 0.06) return; // flat ground: leave it to the terrain
      const u = U0 + ((U1 - U0) * i) / NU, v = -V + (2 * V * j) / NV;
      let c0 = n.y > 0.8 && y > 2.6 ? ((i + j) % 3 ? green : green2) : rock.clone().lerp(dark, Math.abs(Math.sin(i * 1.7 + j * 2.3)) * 0.5);
      if (slot(u + 0.6, v) > 0.2 || slot(u, v * 0.8) > 0.4) c0 = dark; // the cave walls
      if (u > -0.9 && Math.abs(v) < 3 && n.y < 0.6) c0 = wet; // dark wet rock behind and beside the falls
      for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); col.push(c0.r, c0.g, c0.b); }
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      tri(a, b, c, i, j); tri(a, c, d, i, j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const hillMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }));
    hillMesh.castShadow = hillMesh.receiveShadow = true;
    scene.add(hillMesh);
    const idx = new Uint32Array(pos.length / 3).map((_, k) => k);
    island.addStatic(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), idx), 0, 0, 0);

    // The roof over the cave: a lumpy cap of the same rock with grass on top, flat underneath, see-through
    // while the car is inside
    const roofGeo = new THREE.IcosahedronGeometry(1, 2);
    const rp = roofGeo.attributes.position, rc = [];
    for (let k = 0; k < rp.count; k++) {
      let x = rp.getX(k) * 3.1, y = rp.getY(k), z = rp.getZ(k) * 3.4;
      const n = 1 + 0.12 * Math.sin(x * 2.3 + z * 1.7) * Math.cos(z * 2.1 - x);
      y = y < -0.1 ? -0.1 : y * 1.5 * n; // flat underneath at the cave's ceiling
      rp.setXYZ(k, x * n, y + 1.0, z * n);
    }
    for (let k = 0; k < rp.count; k += 3) {
      const ys = (rp.getY(k) + rp.getY(k + 1) + rp.getY(k + 2)) / 3, c = ys > 1.9 ? green : rock;
      for (let q = 0; q < 3; q++) rc.push(c.r, c.g, c.b);
    }
    roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    roofGeo.computeVertexNormals();
    this.roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, transparent: true }));
    const [rx, rz] = this.world(-2.2, 0), yaw = Math.atan2(-FALLS.dir[1], FALLS.dir[0]);
    this.roof.position.set(rx, heightAt(rx, rz) + 1.85, rz);
    this.roof.rotation.y = yaw;
    this.roof.castShadow = true;
    scene.add(this.roof);

    // The golden tiki at the back of the cave
    if (pinModel) {
      const g = bakeColored(pinModel, () => true);
      g.scale(0.55, 0.55, 0.55);
      this.idol = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#ffc34d', emissive: '#ffae2e', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35, flatShading: true }));
      const [ix, iz] = this.world(-4.1, 0);
      this.idol.position.set(ix, heightAt(ix, iz), iz);
      this.idol.rotation.y = yaw + Math.PI / 2;
      scene.add(this.idol);
    }

    // The falling water: a curtain from the clifftop over the cave mouth, streaks scrolling down
    this.fallsTime = { value: 0 };
    const [wx, wz] = this.world(0.55, 0), base = heightAt(wx, wz);
    const sheet = new THREE.PlaneGeometry(5.6, H + 0.2, 1, 24);
    const sp = sheet.attributes.position;
    for (let k = 0; k < sp.count; k++) { const y = sp.getY(k) / (H + 0.2) + 0.5; sp.setZ(k, Math.max(0, y - 0.7) * 0.8); } // the top lip leans out
    this.sheet = new THREE.Mesh(sheet, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: this.fallsTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 127.1) * 43758.5); }
        void main() {
          float col = floor(vUv.x * 40.0), r = h(col);
          float s = fract(vUv.y * (2.0 + r * 2.0) + uTime * (1.6 + r * 0.9) + r * 7.0);
          float streak = smoothstep(0.0, 0.25, s) * smoothstep(1.0, 0.55, s);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          vec3 c = mix(vec3(0.36, 0.74, 0.82), vec3(0.95, 0.99, 1.0), streak * 0.6 + smoothstep(0.25, 0.0, vUv.y) * 0.5);
          gl_FragColor = vec4(c * 0.92, (0.6 + 0.35 * streak) * edge);
        }`,
    }));
    this.sheet.position.set(wx, base + (H + 0.2) / 2, wz);
    this.sheet.rotation.y = yaw + Math.PI / 2;
    this.sheet.renderOrder = 3;
    scene.add(this.sheet);

    // The plunge pool: a shallow round of water in front, with a ring of foam where the falls land
    const pool = new THREE.CircleGeometry(3.2, 40);
    pool.rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(pool, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uTime: this.fallsTime },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vP;
        void main() {
          float r = length(vP) / 3.2;
          vec3 c = mix(vec3(0.24, 0.79, 0.75), vec3(0.18, 0.55, 0.72), smoothstep(0.0, 0.8, r));
          float ring = smoothstep(0.06, 0.0, abs(fract(r * 3.0 - uTime * 0.6) - 0.5) - 0.38) * (1.0 - r);
          float foam = smoothstep(0.75, 0.0, length(vP - vec2(-2.0, 0.0)));
          c = mix(c, vec3(1.0), clamp(ring * 0.35 + foam * 0.8, 0.0, 1.0));
          gl_FragColor = vec4(c, 0.88 * smoothstep(1.0, 0.86, r));
        }`,
    }));
    const [px, pz] = this.world(2.4, 0);
    this.pool.position.set(px, heightAt(px, pz) + 0.05, pz);
    this.pool.rotation.y = yaw;
    scene.add(this.pool);
    this.wasIn = false;
    this.wasBehind = false;
  }

  // ---------- Sky shell ----------
  buildSkyShell(scene, scallopModel) {
    const [x, y, z] = SKY_SHELL;
    let geo;
    if (scallopModel) { geo = bakeColored(scallopModel, () => true); geo.center(); const b = new THREE.Box3().setFromBufferAttribute(geo.attributes.position); const s = 1.1 / Math.max(...b.getSize(new THREE.Vector3()).toArray()); geo.scale(s, s, s); }
    else geo = new THREE.OctahedronGeometry(0.5);
    this.sky = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffb02e', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3, flatShading: true }));
    this.sky.position.set(x, y, z);
    this.sky.visible = !this.found.has('sky');
    scene.add(this.sky);
    // A faint column of sparkle under it, so a curious player spots it from the ground
    const g = new THREE.CylinderGeometry(0.05, 0.6, y - 0.8, 10, 1, true);
    this.skyBeam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.skyBeam.position.set(x, (y + 0.8) / 2, z);
    this.skyBeam.visible = this.sky.visible;
    scene.add(this.skyBeam);
  }

  update(dt, car, speed) {
    this.t += dt;
    this.fallsTime.value = this.t;
    // Falls: the cave, the roof turning see-through, a splash when passing through the water, the sound
    const { u, v } = this.local(car.x, car.z);
    const inCave = u < -0.4 && u > -5 && Math.abs(v) < 2.4;
    if (inCave && !this.wasIn) this.find('falls', new THREE.Vector3(car.x, heightAt(car.x, car.z), car.z));
    this.wasIn = inCave;
    const target = inCave ? 0.18 : 1;
    this.roof.material.opacity += (target - this.roof.material.opacity) * Math.min(1, dt * 6);
    this.roof.material.depthWrite = this.roof.material.opacity > 0.95;
    const behind = u < 0.55;
    if (Math.abs(v) < 2.8 && u > -1.5 && u < 2.5 && behind !== this.wasBehind) {
      for (let k = 0; k < 4; k++) this.fx.splash(new THREE.Vector3(car.x + (Math.random() - 0.5) * 1.5, heightAt(car.x, car.z) + 1 + Math.random(), car.z + (Math.random() - 0.5) * 1.5), 1.3);
      this.sound.play('splash', { amount: 0.7 });
    }
    this.wasBehind = behind;
    if (this.idol) this.idol.rotation.y += dt * 0.6;
    const [fx0, fz0] = this.world(0.6, 0);
    this.sound.setFalls?.(Math.max(0, 1 - Math.hypot(car.x - fx0, car.z - fz0) / 24));
    if (Math.random() < dt * 8) { const [sx, sz] = this.world(0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 4); this.fx.splash(new THREE.Vector3(sx, heightAt(sx, sz) + 0.1, sz), 0.5); }

    // Sky shell: spin and bob, and collect it within reach
    if (this.sky.visible) {
      this.sky.rotation.y += dt * 1.5;
      this.sky.position.y = SKY_SHELL[1] + Math.sin(this.t * 2) * 0.15;
      if (Math.hypot(car.x - SKY_SHELL[0], car.y - this.sky.position.y, car.z - SKY_SHELL[2]) < 1.9) {
        this.sky.visible = this.skyBeam.visible = false;
        this.find('sky', this.sky.position.clone());
      }
    }
  }
}
