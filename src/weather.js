import * as THREE from 'three';
import { SHADE } from './shading.js';
import { TERRAIN_GRASS } from './terrain.js';
import { WIND } from './wind.js';

// Passing tropical showers (2026-11-04, Shauna picked it from the ideas list): now and then a short shower
// sweeps in, the light dims and greys, rain streaks fall slanted by the island wind, the ground goes dark
// and a little shiny, and the rain loop plays; when it clears by day, a rainbow stands over the sea for a
// while. `?weather=rain` in the address starts a shower at once; `window.__shoreline.weather.shower()` too.

const GREY_LIGHT = new THREE.Color('#c9d2e0'), GREY_SKY_TOP = new THREE.Color('#6e7f96'), GREY_SKY = new THREE.Color('#a9b4c2'), GREY_FOG = new THREE.Color('#b9c0c8');

export class Weather {
  constructor(scene, sky, sound) {
    this.scene = scene; this.sky = sky; this.sound = sound;
    this.rain = 0; // 0 dry to 1 full shower
    this.wet = 0; // the ground dries slower than the rain stops
    this.bow = 0; // rainbow
    this.state = 'dry';
    this.timer = 70 + Math.random() * 60; // first shower a minute or two in
    this.showerLen = 0;
    // Rain streaks: line segments in a box that follows the camera's target
    this.N = 1400; this.box = { w: 46, h: 22 };
    const pos = new Float32Array(this.N * 6);
    this.drops = Array.from({ length: this.N }, () => ({ x: (Math.random() - 0.5) * this.box.w, y: Math.random() * this.box.h, z: (Math.random() - 0.5) * this.box.w, v: 26 + Math.random() * 10 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#dfe9f5', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.rainbow = this.makeRainbow();
    scene.add(this.rainbow);
    if (new URLSearchParams(location.search).get('weather') === 'rain') this.timer = 3;
  }

  // A rainbow: a wide half ring with the seven colors as soft bands, drawn without fog so it shows far off
  makeRainbow() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 128);
    const bands = ['rgba(255,60,60,0)', 'rgba(255,60,60,1)', 'rgba(255,150,40,1)', 'rgba(255,230,70,1)', 'rgba(90,220,100,1)', 'rgba(70,150,255,1)', 'rgba(120,90,230,1)', 'rgba(170,90,220,0)'];
    bands.forEach((col, i) => grad.addColorStop(i / (bands.length - 1), col));
    g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    const R0 = 20, R1 = 23.5;
    const geo = new THREE.RingGeometry(R0, R1, 96, 1, 0, Math.PI);
    // Map the texture across the ring's width (radius), not around it
    const uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, 0.5, (r - R0) / (R1 - R0)); }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthTest: false }));
    m.visible = false;
    m.renderOrder = 10;
    return m;
  }

  shower(len = 26 + Math.random() * 16) { this.state = 'rain'; this.showerLen = len; this.timer = len; }

  // After the day cycle has set its colors: grey them by the rain. target: the point the camera follows.
  update(dt, camera, target, night) {
    this.timer -= dt;
    if (this.state === 'dry' && this.timer <= 0) this.shower();
    else if (this.state === 'rain' && this.timer <= 0) { this.state = 'clearing'; this.timer = 30; }
    else if (this.state === 'clearing' && this.timer <= 0) { this.state = 'dry'; this.timer = 110 + Math.random() * 120; }
    const want = this.state === 'rain' ? 1 : 0;
    this.rain += (want - this.rain) * Math.min(1, dt * (want ? 0.35 : 0.22)); // rolls in over a few seconds, eases off slower
    this.wet += ((this.rain > 0.3 ? 1 : 0) - this.wet) * Math.min(1, dt * (this.rain > 0.3 ? 0.25 : 0.04));
    const bowWant = this.state === 'clearing' && this.timer < 26 && night < 0.3 ? 1 : 0;
    this.bow += (bowWant - this.bow) * Math.min(1, dt * (bowWant ? 0.3 : 0.15));

    // Grey, dimmer light and sky while it rains
    const k = this.rain;
    if (k > 0.001) {
      SHADE.uLightColor.value.lerp(GREY_LIGHT, 0.55 * k);
      SHADE.uLightIntensity.value *= 1 - 0.3 * k;
      const u = this.sky.material.uniforms;
      u.top.value.lerp(GREY_SKY_TOP, 0.6 * k * (1 - night)); u.mid.value.lerp(GREY_SKY, 0.6 * k * (1 - night)); u.bottom.value.lerp(GREY_FOG, 0.5 * k * (1 - night));
      this.scene.fog.color.lerp(GREY_FOG, 0.5 * k * (1 - night));
    }
    TERRAIN_GRASS.uWet.value = this.wet;

    // Rain streaks, slanted with the wind
    this.lines.visible = k > 0.02;
    if (this.lines.visible) {
      const dir = WIND.uWindDir.value, a = this.lines.geometry.attributes.position.array, { w, h } = this.box;
      const sx = dir.x * 0.18, sz = dir.y * 0.18, len = 0.75;
      this.drops.forEach((d, i) => {
        d.y -= d.v * dt; d.x += sx * d.v * dt; d.z += sz * d.v * dt;
        if (d.y < 0) { d.y += h; d.x = (Math.random() - 0.5) * w; d.z = (Math.random() - 0.5) * w; }
        const x = target.x + d.x, z = target.z + d.z, y = d.y - 1;
        a.set([x, y, z, x - sx * len * 1.6, y + len * 1.6, z - sz * len * 1.6], i * 6);
      });
      this.lines.geometry.attributes.position.needsUpdate = true;
      this.lines.material.opacity = 0.42 * k;
      this.lines.material.color.set(night > 0.5 ? '#8f9cd8' : '#dfe9f5');
    }

    // The camera looks down at the island and never sees the sky, so the rainbow is drawn in the view itself:
    // a faint arc across the screen with its feet past the bottom corners, over everything, like light in the
    // lens after a shower
    this.rainbow.visible = this.bow > 0.01;
    if (this.rainbow.visible) {
      const D = 30, half = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = half * camera.aspect;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      this.rainbow.position.copy(camera.position).addScaledVector(fwd, D).addScaledVector(up, -half * 0.95);
      this.rainbow.quaternion.copy(camera.quaternion);
      this.rainbow.scale.setScalar(Math.min(halfW * 0.92, half * 1.75) / 20);
      this.rainbow.material.opacity = 0.3 * this.bow;
    }
    this.sound?.setRain?.(k);
  }
}
