import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildTerrain, buildWater, heightAt } from './terrain.js';
import { Vehicle, loadVehicleModel } from './vehicle.js';
import { World } from './world.js';
import { Bowling, ShellHunt } from './games.js';
import { loadGLB } from './models.js';

// ---------- UI helpers ----------
const $ = (s) => document.querySelector(s);
const ui = {
  setStat(key, value, sub) {
    const el = $(`[data-stat="${key}"]`);
    if (!el) return;
    el.querySelector('.v').textContent = value;
    el.querySelector('.s').textContent = sub;
  },
  toast(title, body, ms = 2800) {
    const t = $('#toast');
    t.querySelector('strong').textContent = title;
    t.querySelector('span').textContent = body;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(ui._t);
    ui._t = setTimeout(() => t.classList.remove('show'), ms);
  },
};

async function start() {
  await RAPIER.init();
  try { await Promise.all([document.fonts.load('64px "Shrikhand"'), document.fonts.load('600 34px "DM Sans"')]); } catch { /* fallback fonts are fine */ }

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('#scene') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#ffd9b0');
  scene.fog = new THREE.Fog(HORIZON, 70, 190);

  // Sky dome: deep blue overhead into a warm golden horizon
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color('#3fa9f5') }, mid: { value: new THREE.Color('#9fd8ff') }, bottom: { value: HORIZON } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = normalize(vP).y; vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h)); gl_FragColor = vec4(c,1.0);
        #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 900);

  scene.add(new THREE.HemisphereLight('#bfe6ff', '#f2c48a', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_OFFSET = new THREE.Vector3(-30, 50, 25);

  // Physics
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });

  const [palmModel, pinModel, hutModel, boatModel, torchModel, shellModel] = await Promise.all(
    ['palm', 'tiki-pin', 'tiki-hut', 'sailboat', 'tiki-torch', 'seashell'].map((n) => loadGLB(`./models/${n}.glb`))
  );
  buildTerrain(scene, world);
  const water = buildWater(scene);
  const island = new World(scene, world, { palm: palmModel, hut: hutModel, boat: boatModel, torch: torchModel });
  const bowling = new Bowling(scene, world, island, ui, pinModel);
  const shells = new ShellHunt(scene, ui, 8, shellModel);
  island.sign('Shell Hunt', -4.5, 6.5, 0.3, 'Collect all 8 on the beach');
  island.sign('Jump!', -3.5, -12, 0.3);

  const spawn = new THREE.Vector3(0, heightAt(0, 0), 0);
  const carModel = await loadVehicleModel('./models/offroader.glb');
  const car = new Vehicle(scene, world, spawn, carModel);
  car.reset(spawn, 0);

  // ---------- Input ----------
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, rev: false };
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyR') car.rightUp();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const has = (...c) => c.some((k) => keys.has(k));
  const readInput = () => ({
    throttle: (has('KeyW', 'ArrowUp') || touch.gas ? 1 : 0) - (has('KeyS', 'ArrowDown') || touch.rev ? 1 : 0),
    steer: (has('KeyA', 'ArrowLeft') || touch.left ? 1 : 0) - (has('KeyD', 'ArrowRight') || touch.right ? 1 : 0),
    brake: has('Space'),
    boost: has('ShiftLeft', 'ShiftRight'),
  });
  document.querySelectorAll('[data-touch]').forEach((b) => {
    const k = b.dataset.touch;
    const on = (e) => { e.preventDefault(); touch[k] = true; b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  $('#reset').addEventListener('click', () => car.rightUp());

  let zoom = innerWidth / innerHeight < 0.8 ? 1.55 : 1;
  addEventListener('wheel', (e) => { zoom = THREE.MathUtils.clamp(zoom + e.deltaY * 0.001, 0.6, 2.3); }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------- Loop ----------
  const CAM_OFFSET = new THREE.Vector3(0, 9, 10.5); // close, like a toy on a table
  const camTarget = new THREE.Vector3().copy(spawn);
  camera.position.copy(spawn).add(CAM_OFFSET);
  const clock = new THREE.Clock();
  const STEP = 1 / 60;
  let acc = 0;
  let upsideTimer = 0;
  let elapsed = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    acc += dt;
    const input = readInput();
    while (acc >= STEP) {
      car.update(STEP, input);
      world.step();
      acc -= STEP;
    }
    car.sync();
    island.update(elapsed, dt);
    bowling.update(dt);
    shells.update(elapsed, car.position);
    water.material.uniforms.uTime.value = elapsed;

    // Safety nets: fell in the sea, or stuck on the roof
    if (car.position.y < -1.3) {
      car.reset(spawn, 0);
      ui.toast('Splash!', 'Towed back to the beach.', 1800);
    }
    upsideTimer = car.isUpsideDown() ? upsideTimer + dt : 0;
    if (upsideTimer > 2) { car.rightUp(); upsideTimer = 0; }

    // Camera follows with a little look-ahead
    const v = car.body.linvel();
    const lead = new THREE.Vector3(v.x, 0, v.z).multiplyScalar(0.25);
    camTarget.lerp(new THREE.Vector3().copy(car.position).add(lead), 1 - Math.exp(-dt * 4));
    const want = camTarget.clone().add(CAM_OFFSET.clone().multiplyScalar(zoom));
    camera.position.lerp(want, 1 - Math.exp(-dt * 5));
    camera.lookAt(camTarget);
    sun.position.copy(camTarget).add(SUN_OFFSET);
    sun.target.position.copy(camTarget);

    $('#speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  // Debug hook: run the simulation synchronously (used for automated checks)
  const simulate = (seconds, input) => {
    for (let i = 0; i < seconds / STEP; i++) {
      car.update(STEP, { throttle: 0, steer: 0, brake: false, boost: false, ...input });
      world.step();
      car.sync();
      bowling.update(STEP);
      elapsed += STEP;
      shells.update(elapsed, car.position);
    }
  };
  window.__shoreline = { car, world, camera, simulate, island, setZoom: (z) => { zoom = z; } };
}

$('#play').addEventListener('click', () => {
  $('#intro').classList.add('gone');
  $('#hud').classList.add('show');
});

start().then(() => {
  $('#play').disabled = false;
  $('#play').textContent = 'Start driving';
}).catch((err) => {
  console.error(err);
  $('#play').textContent = 'Could not load. Try refreshing.';
});
