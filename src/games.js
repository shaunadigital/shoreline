import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { heightAt, FLAT_ZONES } from './terrain.js';
import { randomSpot } from './world.js';
import { bakeColored } from './models.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// ---------- Tiki Bowling ----------
export class Bowling {
  constructor(scene, world, w, ui, pinModel = null) {
    this.world = world;
    this.ui = ui;
    this.state = 'ready';
    this.best = Number(store.get('shoreline.bowling') || 0);
    const laneZ = 13;
    const lane = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 3.2), new THREE.MeshStandardMaterial({ color: '#e9c48c', flatShading: true }));
    lane.position.set(2, 0.79, laneZ);
    lane.receiveShadow = true;
    scene.add(lane);
    for (const z of [laneZ - 1.7, laneZ + 1.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 0.15), new THREE.MeshStandardMaterial({ color: '#ff7a59', flatShading: true }));
      rail.position.set(2, 0.84, z);
      scene.add(rail);
    }
    w.torch(-5.5, laneZ - 2.4); w.torch(-5.5, laneZ + 2.4);
    w.torch(10.5, laneZ - 2.4); w.torch(10.5, laneZ + 2.4);
    w.sign('Tiki Bowling', -7, laneZ - 3.6, 0.25, 'Knock down all 10');

    // Pin shape: a lathe profile
    const prof = [[0, 0], [0.18, 0], [0.22, 0.25], [0.2, 0.55], [0.12, 0.8], [0.1, 0.92], [0.13, 1.02], [0.1, 1.12], [0, 1.16]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    let geo = new THREE.LatheGeometry(prof, 8);
    geo.translate(0, -0.58, 0);
    let white = new THREE.MeshStandardMaterial({ color: '#fffaf0', flatShading: true, roughness: 0.4 });
    if (pinModel) {
      // Tiki pin model: 2.29 tall with its base at 0. Carved face parts get a darker wood so they read from the game camera.
      const faceWood = new THREE.Color('#9c6a3c');
      geo = bakeColored(pinModel, () => true, (n) => (/brow|nose|tooth/i.test(n) ? faceWood : null));
      geo.translate(0, -1.145, 0);
      geo.scale(0.507, 0.507, 0.507);
      geo.rotateY(-Math.PI / 4); // face turned toward the camera and the approach lane
      white = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 });
    }
    const band = new THREE.MeshStandardMaterial({ color: '#ff4d6d', flatShading: true });

    this.pins = [];
    const head = new THREE.Vector3(7, 0, laneZ);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        const x = head.x + row * 0.75;
        const z = head.z + (i - row / 2) * 0.75;
        const y = 0.8 + 0.6;
        const mesh = new THREE.Mesh(geo, white);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.08, 8), band);
        stripe.position.y = 0.32;
        if (!pinModel) mesh.add(stripe);
        mesh.castShadow = true;
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(0.2));
        world.createCollider(RAPIER.ColliderDesc.cylinder(0.56, 0.19).setDensity(4).setFriction(0.4).setRestitution(0.3), body);
        scene.add(mesh);
        this.pins.push({ mesh, body, home: new THREE.Vector3(x, y, z) });
      }
    }
    this.timer = 0;
    this.knocked = 0;
    this.render();
  }

  isDown(p) {
    const q = p.body.rotation();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const t = p.body.translation();
    return up.y < 0.75 || Math.hypot(t.x - p.home.x, t.z - p.home.z) > 0.7;
  }

  resetPins() {
    for (const p of this.pins) {
      p.body.setTranslation(p.home, true);
      p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.knocked = 0;
    this.state = 'ready';
    this.render();
  }

  render() {
    this.ui.setStat('bowling', `${this.knocked}/10`, this.best ? `best ${this.best}` : 'drive into the pins');
  }

  update(dt) {
    for (const p of this.pins) {
      const t = p.body.translation(), q = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    if (this.state === 'resetting') {
      this.timer -= dt;
      if (this.timer <= 0) this.resetPins();
      return;
    }
    const n = this.pins.filter((p) => this.isDown(p)).length;
    if (n !== this.knocked) {
      if (this.state === 'ready') { this.state = 'rolling'; this.timer = 4; }
      else this.timer = Math.max(this.timer, 1.5);
      this.knocked = n;
      this.render();
    }
    if (this.state === 'rolling') {
      this.timer -= dt;
      if (this.timer <= 0 || n === 10) {
        if (n === 10) this.ui.toast('STRIKE! 🎳', 'All ten tiki pins down.');
        else this.ui.toast(`${n} pins!`, 'Pins reset in a moment.');
        if (n > this.best) { this.best = n; store.set('shoreline.bowling', String(n)); }
        this.state = 'resetting';
        this.timer = 3;
        this.render();
      }
    }
  }
}

// ---------- Shell Hunt ----------
export class ShellHunt {
  constructor(scene, ui, count = 8, shellModel = null) {
    this.ui = ui;
    this.shells = [];
    this.found = 0;
    this.start = null;
    this.best = Number(store.get('shoreline.shells') || 0);
    const pink = new THREE.MeshStandardMaterial({ color: '#ffb3a7', flatShading: true, emissive: '#ff7a8a', emissiveIntensity: 0.25 });
    const cream = new THREE.MeshStandardMaterial({ color: '#fff1dc', flatShading: true });
    // Shells sit on dry sand around the coast, spread out from each other
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [];
    for (let tries = 0; spots.length < count && tries < 5000; tries++) {
      const s = randomSpot(r, 3, 4.5);
      if (!s) continue;
      const gap = tries < 3000 ? 22 : 10; // relax spacing rather than loop forever
      if (spots.every(([x, z]) => Math.hypot(x - s[0], z - s[1]) > gap) && FLAT_ZONES.every(([fx, fz, fr]) => Math.hypot(fx - s[0], fz - s[1]) > fr + 4)) spots.push(s);
    }
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const g = new THREE.Group();
      const spiral = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 7), pink);
      spiral.rotation.z = Math.PI / 2.4;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 5, 8), cream);
      lip.position.x = -0.3; lip.rotation.y = Math.PI / 2;
      if (shellModel) {
        // Model: about 1.6 long, centered and scaled down to collectible size.
        if (!this.shellGeo) {
          this.shellGeo = bakeColored(shellModel);
          this.shellGeo.center();
          this.shellGeo.scale(0.6, 0.6, 0.6);
          this.shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, emissive: '#ff7a8a', emissiveIntensity: 0.12 });
        }
        const m = new THREE.Mesh(this.shellGeo, this.shellMat);
        m.rotation.x = -0.35;
        g.add(m);
      } else g.add(spiral, lip);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20), new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2;
      const y = heightAt(x, z);
      ring.position.set(x, y + 0.05, z);
      g.position.set(x, y + 0.8, z);
      scene.add(g, ring);
      this.shells.push({ g, ring, pos: new THREE.Vector3(x, y, z), got: false, phase: i });
    }
    this.render();
  }

  render() {
    const sub = this.best ? `best ${this.best.toFixed(1)}s` : 'find them on the beach';
    this.ui.setStat('shells', `${this.found}/${this.shells.length}`, sub);
  }

  reset() {
    for (const s of this.shells) { s.got = false; s.g.visible = s.ring.visible = true; }
    this.found = 0;
    this.start = null;
    this.render();
  }

  update(t, carPos) {
    for (const s of this.shells) {
      if (s.got) continue;
      s.g.rotation.y = t * 1.5 + s.phase;
      s.g.position.y = s.pos.y + 0.8 + Math.sin(t * 2 + s.phase) * 0.15;
      s.ring.scale.setScalar(1 + Math.sin(t * 3 + s.phase) * 0.08);
      if (Math.hypot(carPos.x - s.pos.x, carPos.z - s.pos.z) < 2.2 && Math.abs(carPos.y - s.pos.y) < 3) {
        s.got = true;
        s.g.visible = s.ring.visible = false;
        if (this.start === null) this.start = t;
        this.found++;
        if (this.found === this.shells.length) {
          const time = t - this.start;
          const record = !this.best || time < this.best;
          if (record) { this.best = time; store.set('shoreline.shells', String(time)); }
          this.ui.toast('All shells found! 🐚', `${time.toFixed(1)} seconds${record ? ', a new best' : ''}. They will wash back up soon.`);
          setTimeout(() => this.reset(), 6000);
        } else {
          this.ui.toast('Shell found', `${this.found} of ${this.shells.length}`, 1400);
        }
        this.render();
      }
    }
  }
}
