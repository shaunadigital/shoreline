import * as THREE from 'three';
import { SHADE } from './shading.js';

// Time of day (Shauna's call, 2026-10-30, after the style board): the island cycles through day, sunset,
// night and dawn. Every lit material reads the sun and shadow colors from shading.js, so changing those
// recolors the whole island; the sky, fog and water follow, and at night the torches and the lighthouse
// glow. `?time=day|sunset|night|dawn` in the address holds one time; the T key skips to the next one.

export const CYCLE = 360; // seconds for a full day
// Keyframes by phase (0 to 1). Day holds for most of the cycle.
const KEYS = [
  { at: 0.0, name: 'day', light: '#ffdcc4', li: 1.22, shadow: '#7650e6', top: '#3fa9f5', mid: '#a6d8f7', bottom: '#ffd3a8', fog: '#ffd3a8', water: [1, 1, 1], night: 0 },
  { at: 0.5, name: 'day', light: '#ffdcc4', li: 1.22, shadow: '#7650e6', top: '#3fa9f5', mid: '#a6d8f7', bottom: '#ffd3a8', fog: '#ffd3a8', water: [1, 1, 1], night: 0 },
  { at: 0.62, name: 'sunset', light: '#ffae78', li: 1.15, shadow: '#6a3fd0', top: '#4a5fc4', mid: '#f29a7c', bottom: '#ffb27a', fog: '#f3a07e', water: [1, 0.72, 0.7], night: 0.25 },
  { at: 0.72, name: 'night', light: '#8094ff', li: 0.62, shadow: '#2e2672', top: '#0b1240', mid: '#252e6c', bottom: '#4a3f7d', fog: '#2e2a5e', water: [0.16, 0.2, 0.42], night: 1 },
  { at: 0.88, name: 'night', light: '#8094ff', li: 0.62, shadow: '#2e2672', top: '#0b1240', mid: '#252e6c', bottom: '#4a3f7d', fog: '#2e2a5e', water: [0.16, 0.2, 0.42], night: 1 },
  { at: 0.95, name: 'dawn', light: '#ffc0a4', li: 1.0, shadow: '#6b48c8', top: '#5b7fd6', mid: '#f4b5a6', bottom: '#ffcfa8', fog: '#f2bfa6', water: [0.78, 0.7, 0.8], night: 0.3 },
  { at: 1.0, name: 'day', light: '#ffdcc4', li: 1.22, shadow: '#7650e6', top: '#3fa9f5', mid: '#a6d8f7', bottom: '#ffd3a8', fog: '#ffd3a8', water: [1, 1, 1], night: 0 },
].map((k) => ({ ...k, light: new THREE.Color(k.light), shadow: new THREE.Color(k.shadow), top: new THREE.Color(k.top), mid: new THREE.Color(k.mid), bottom: new THREE.Color(k.bottom), fog: new THREE.Color(k.fog), water: new THREE.Color(...k.water) }));
const HOLD = { day: 0.2, sunset: 0.62, night: 0.8, dawn: 0.95 };

// Things that light up at night: [position, color, size], plus materials whose color is pushed past white
// at night so the glow picks them up, and additive materials (the lighthouse beam) that brighten
const glows = [], boosts = [], beams = [];
export function addGlow(pos, color, size, material = null) {
  glows.push({ pos: pos.clone(), color: new THREE.Color(color), size });
  if (material) boosts.push({ material, base: material.color.clone() });
}
export function addBeam(material) { beams.push({ material, base: material.opacity }); }

function glowTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export class DayCycle {
  constructor({ scene, sky, water }) {
    Object.assign(this, { scene, sky, water });
    const pinned = new URLSearchParams(location.search).get('time');
    this.phase = HOLD[pinned] ?? 0.05;
    this.running = !HOLD[pinned];
    this.state = { night: 0, name: 'day' };
    addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat) this.skip(); });
  }

  // Call once everything has registered its glows
  build() {
    const tex = glowTexture();
    // Halos round each light, and a warm pool of light on the ground beneath it
    const mk = (count) => new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), count);
    this.halos = mk(glows.length);
    this.pools = mk(glows.length);
    this.halos.frustumCulled = this.pools.frustumCulled = false;
    this.halos.renderOrder = this.pools.renderOrder = 5;
    glows.forEach((g, i) => { this.halos.setColorAt(i, g.color); this.pools.setColorAt(i, g.color); });
    this.scene.add(this.halos, this.pools);
    this.apply(true);
  }

  skip() {
    const order = ['day', 'sunset', 'night', 'dawn'];
    this.phase = HOLD[order[(order.indexOf(this.state.name) + 1) % 4]];
  }

  sample(phase) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].at <= phase) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(phase, a.at, b.at);
    return { a, b, t };
  }

  update(dt, camera) {
    if (this.running) this.phase = (this.phase + dt / CYCLE) % 1;
    this.apply(false, camera);
  }

  apply(force, camera) {
    const { a, b, t } = this.sample(this.phase);
    const L = (k) => a[k].clone().lerp(b[k], t);
    SHADE.uLightColor.value.copy(L('light'));
    SHADE.uLightIntensity.value = THREE.MathUtils.lerp(a.li, b.li, t);
    SHADE.uShadowColor.value.copy(L('shadow'));
    const u = this.sky.material.uniforms;
    u.top.value.copy(L('top')); u.mid.value.copy(L('mid')); u.bottom.value.copy(L('bottom'));
    this.scene.fog.color.copy(L('fog'));
    this.water.material.uniforms.uTint.value.copy(L('water'));
    const night = THREE.MathUtils.lerp(a.night, b.night, t);
    this.state.night = night;
    this.state.name = t < 0.5 ? a.name : b.name;
    for (const { material, base } of boosts) material.color.copy(base).multiplyScalar(1 + 1.8 * night);
    for (const { material, base } of beams) material.opacity = base * 2.8 * night; // the lighthouse beam only shows from dusk to dawn
    if (!this.halos) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    if (camera) q.copy(camera.quaternion);
    const k = Math.max(0.0001, night);
    glows.forEach((g, i) => {
      this.halos.setMatrixAt(i, m.compose(g.pos, q, s.setScalar(g.size * k)));
      const ground = g.pos.clone(); ground.y = Math.max(0, g.pos.y - g.size * 1.1) + 0.06;
      this.pools.setMatrixAt(i, m.compose(ground, flat, s.setScalar(g.size * 3.2 * k)));
    });
    this.halos.material.opacity = Math.min(1, night * 1.2) * 0.8;
    this.pools.material.opacity = night * 0.35;
    this.halos.visible = this.pools.visible = night > 0.01;
    this.halos.instanceMatrix.needsUpdate = this.pools.instanceMatrix.needsUpdate = true;
  }
}
