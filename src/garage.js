import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { CAR_LAMPS } from './vehicle.js';
import { shade } from './shading.js';

// Paint and decals (2026-11-12): rewards for playing. Each secret found unlocks a paint color, finding all
// four unlocks one more, a finished lap of the circuit unlocks a race number on the rear fenders and a strike at
// bowling unlocks a hibiscus on the hood. The paint button (🎨) opens a panel to pick; locked ones say how to
// earn them. Typing "aloha" still changes the paint, now through the colors unlocked so far.
// The choice is kept in localStorage `shoreline.garage`.

export const PAINTS = [
  { id: 'coral', name: 'Coral', color: null, how: '' },
  { id: 'teal', name: 'Lagoon', color: '#26b7b1', secret: 'aloha', how: 'Type the island greeting' },
  { id: 'sun', name: 'Sunshine', color: '#ffc43d', secret: 'falls', how: 'Find what hides behind the falls' },
  { id: 'pink', name: 'Hibiscus', color: '#ff8fb8', secret: 'sky', how: 'Grab the shell in the sky' },
  { id: 'lilac', name: 'Jacaranda', color: '#a98cff', secret: 'wave', how: 'Catch a wave at full speed' },
  { id: 'green', name: 'Monstera', color: '#7ccf5a', all: true, how: 'Find all four secrets' },
];
const DECALS = [
  { id: 'number', name: 'Race number', key: 'shoreline.circuit', how: 'Finish a lap of the circuit' },
  { id: 'flower', name: 'Hood flower', key: 'shoreline.bowling', need: 10, how: 'Bowl a strike' },
];
const KEY = 'shoreline.garage';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Decal pictures, drawn here (original art): a race number in a white roundel, and a hibiscus flower
function decalTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'number') {
    g.fillStyle = '#fff7ea'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.strokeStyle = '#21323a'; g.stroke();
    g.fillStyle = '#21323a'; g.font = '800 170px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('7', 128, 140);
  } else {
    g.translate(128, 128);
    for (let i = 0; i < 5; i++) {
      g.rotate((Math.PI * 2) / 5);
      g.fillStyle = i % 2 ? '#ff6f8f' : '#ff86a2';
      g.beginPath(); g.ellipse(0, -58, 46, 62, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#c2185b'; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd36b'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -62); g.stroke();
    g.fillStyle = '#ffd36b'; for (const [x, y] of [[18, -66], [8, -60], [26, -58]]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Garage {
  constructor({ car, secrets, ui }) {
    Object.assign(this, { car, secrets, ui });
    this.state = { paint: 'coral', number: false, flower: false, ...load() };
    this.decals = {};
    this.panel = document.getElementById('garage-panel');
    this.button = document.getElementById('garage');
    this.button?.addEventListener('click', () => this.toggle());
    // Aloha cycles through the unlocked colors
    secrets.repaint = () => {
      const open = PAINTS.filter((p) => this.unlocked(p));
      const i = open.findIndex((p) => p.id === this.state.paint);
      this.pick(open[(i + 1) % open.length].id);
    };
    // A secret found may unlock a paint: say so
    const find = secrets.find.bind(secrets);
    secrets.find = (id, at) => {
      const before = PAINTS.filter((p) => this.unlocked(p)).length;
      const isNew = find(id, at);
      if (isNew && PAINTS.filter((p) => this.unlocked(p)).length > before) setTimeout(() => ui.toast('New paint unlocked 🎨', 'Pick it from the paint button.', 3000), 3500);
      return isNew;
    };
    this.apply();
  }

  unlocked(p) {
    if (!p.secret && !p.all) return true;
    const found = this.secrets.found;
    return p.all ? found.size >= this.secrets.total : found.has(p.secret);
  }
  decalUnlocked(d) { const v = read(d.key); return d.need ? Number(v || 0) >= d.need : !!v; }

  toggle(open = this.panel.hidden) {
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) this.render();
  }

  render() {
    const p = this.panel;
    p.innerHTML = '<p class="garage-title">Paint</p>';
    const row = document.createElement('div'); row.className = 'garage-swatches';
    for (const paint of PAINTS) {
      const b = document.createElement('button');
      const ok = this.unlocked(paint);
      b.className = 'swatch' + (this.state.paint === paint.id ? ' on' : '');
      b.style.setProperty('--c', paint.color || '#e2553a');
      b.disabled = !ok;
      b.title = ok ? paint.name : `Locked: ${paint.how}`;
      b.setAttribute('aria-label', b.title);
      if (!ok) b.textContent = '🔒';
      b.addEventListener('click', () => { this.pick(paint.id); this.render(); });
      row.append(b);
    }
    p.append(row);
    const t2 = document.createElement('p'); t2.className = 'garage-title'; t2.textContent = 'Stickers'; p.append(t2);
    for (const d of DECALS) {
      const ok = this.decalUnlocked(d);
      const l = document.createElement('label'); l.className = 'garage-decal' + (ok ? '' : ' locked');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = ok && this.state[d.id]; c.disabled = !ok;
      c.addEventListener('change', () => { this.state[d.id] = c.checked; save(this.state); this.apply(); });
      l.append(c, document.createTextNode(ok ? d.name : `${d.name} (${d.how.toLowerCase()})`));
      p.append(l);
    }
  }

  pick(id) {
    this.state.paint = id;
    save(this.state);
    this.apply();
  }

  apply() {
    const paint = PAINTS.find((p) => p.id === this.state.paint && this.unlocked(p)) || PAINTS[0];
    for (const m of CAR_LAMPS.paint) {
      m.userData.base ||= m.color.clone();
      const c = paint.color ? new THREE.Color(paint.color) : m.userData.base.clone();
      if (/^flare/i.test(m.name) && paint.color) c.multiplyScalar(0.82); // the fender flares stay a shade darker
      m.color.copy(c); m.emissive.copy(c);
    }
    for (const d of DECALS) this.setDecal(d.id, this.decalUnlocked(d) && !!this.state[d.id]);
  }

  // Stick a decal onto the body by casting rays at the painted panels from outside the car
  setDecal(id, on) {
    if (!on) { for (const m of this.decals[id] || []) m.removeFromParent(); this.decals[id] = []; return; }
    if (this.decals[id]?.length) return;
    const car = this.car;
    car.group.updateMatrixWorld(true);
    const targets = [];
    car.pose.traverse((o) => { if (o.isMesh && CAR_LAMPS.paint.includes(o.material)) targets.push(o); });
    if (!targets.length) return;
    // Each shot is a list of tries (from, direction) in the car's own space; the first that hits paint wins.
    // Both stickers go on top surfaces, which is what the game camera sees: the number on top of each rear
    // fender (the buggy's sides are open), the flower on the hood.
    const down = (xs, z = 0) => xs.map((x) => [new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0)]);
    // Over the rear wheels (from the car's own wheel positions), where the fender tops are
    const wp = car.fit?.wheelPts || [[-1.3, 0, 1.3]];
    const rx = Math.min(...wp.map((w) => w[0])), wz = Math.max(...wp.map((w) => Math.abs(w[2])));
    const xs = [rx, rx + 0.12, rx - 0.12, rx + 0.25];
    const shots = id === 'number' ? [down(xs, wz), down(xs, -wz)] : [down([0.9, 1.1, 0.7, 1.3])];
    const mat = new THREE.MeshStandardMaterial({ map: decalTexture(id), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6 });
    shade(mat);
    const ray = new THREE.Raycaster();
    const local = car.group.matrixWorld;
    this.decals[id] = [];
    for (const tries of shots) {
      let hit = null;
      for (const [from, dir] of tries) {
        ray.set(from.clone().applyMatrix4(local), dir.clone().transformDirection(local));
        hit = ray.intersectObjects(targets, false)[0];
        if (hit && Math.abs(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(ray.ray.direction)) > 0.6) break; // a panel facing the ray, not a sliver
        hit = null;
      }
      if (!hit) continue;
      // Facing out of the panel, with the top of the sticker toward the front of the car
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const orient = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(1, 0, 0).applyQuaternion(car.group.quaternion))));
      const size = id === 'number' ? 0.5 : 0.75;
      const geo = new DecalGeometry(hit.object, hit.point, orient, new THREE.Vector3(size, size, 0.3));
      // Decal vertices come out in world space: carry them into the panel's own space so the decal rides along
      geo.applyMatrix4(hit.object.matrixWorld.clone().invert());
      const mesh = new THREE.Mesh(geo, mat);
      hit.object.add(mesh);
      this.decals[id].push(mesh);
    }
  }
}
