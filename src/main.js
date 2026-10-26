import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildTerrain, buildWater, heightAt } from './terrain.js';
import { Vehicle, loadVehicleModel } from './vehicle.js';
import { World } from './world.js';
import { Bowling, ShellHunt } from './games.js';
import { loadGLB } from './models.js';
import { Extras } from './extras.js';
import { Effects } from './fx.js';
import { Circuit } from './track.js';
import { Flora } from './flora.js';
import { buildPaths, buildBridges } from './paths.js';
import { TRACK, PATHS, BRIDGES } from './plan.js';
import { SPAWN, BOWLING, WELCOME_SIGN, SHELL_SIGN, ZONE_SIGNS, VILLAGE_TORCHES } from './layout.js';

// ---------- UI helpers ----------
const $ = (s) => document.querySelector(s);
const ui = {
  setStat(key, value, sub) {
    let el = $(`[data-stat="${key}"]`);
    if (!el) {
      const label = { treasure: '🪙 Treasure', goals: '⚽ Soccer', golf: '⛳ Golf', race: '🏁 Race' }[key] || key;
      el = document.createElement('div');
      el.className = 'stat'; el.dataset.stat = key;
      el.innerHTML = `<b>${label}</b><span class="v"></span><span class="s"></span>`;
      $('.stats').appendChild(el);
    }
    el.querySelector('.v').textContent = value;
    el.querySelector('.s').textContent = sub;
  },
  race(text) {
    const el = $('#race');
    el.textContent = text || '';
    el.classList.toggle('show', !!text);
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

  const [palmModel, pinModel, hutModel, boatModel, torchModel, conchModel, scallopModel, cowrieModel] = await Promise.all(
    ['palm', 'tiki-pin', 'tiki-hut', 'sailboat', 'tiki-torch', 'shell-conch', 'shell-scallop', 'shell-cowrie'].map((n) => loadGLB(`./models/${n}.glb`))
  );
  buildTerrain(scene, world);
  const water = buildWater(scene);
  buildPaths(scene);
  const island = new World(scene, world, { palm: palmModel, hut: hutModel, boat: boatModel, torch: torchModel });
  const bowling = new Bowling(scene, world, island, ui, pinModel, BOWLING);
  island.sign('Welcome to Shoreline', WELCOME_SIGN[0], WELCOME_SIGN[1], 0.1, 'Follow the sand paths');
  island.sign('Shell Hunt', SHELL_SIGN[0], SHELL_SIGN[1], 0.25, 'Find all 8 by the water');
  for (const [text, x, z] of ZONE_SIGNS) island.sign(text, x, z, 0.1);
  for (const [x, z] of VILLAGE_TORCHES) island.torch(x, z);

  const spawn = new THREE.Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
  const carModel = await loadVehicleModel('./models/offroader.glb');
  const car = new Vehicle(scene, world, spawn, carModel);
  car.reset(spawn, SPAWN.yaw);

  // Props and mini games in their zones
  const fx = new Effects(scene);
  ui.celebrate = (pos) => fx.celebrate(pos || car.position, 4);
  const extraNames = {
    lighthouse: 'lighthouse', pier: 'pier', beachSet: 'beach-set', surfRack: 'surf-rack', fruitCart: 'fruit-cart', dynamite: 'dynamite-crate', coconuts: 'coconut-bombs', fireworks: 'firework-barrel', chest: 'treasure-chest', goal: 'soccer-goal', golf: 'golf-hole', arch: 'race-arch', coin: 'gold-doubloon',
    poinciana: 'tree-poinciana', jacaranda: 'tree-jacaranda', plumeria: 'tree-plumeria', goldenShower: 'tree-golden-shower', hibiscus: 'bush-hibiscus', monstera: 'bush-monstera',
  };
  const extraModels = Object.fromEntries(await Promise.all(Object.entries(extraNames).map(async ([k, f]) => [k, await loadGLB(`./models/${f}.glb`)])));
  const extras = new Extras({ scene, world, island, ui, fx, car, models: extraModels });
  const circuit = new Circuit({ scene, world, island, ui, fx, car, arch: extraModels.arch });
  buildBridges(scene, island, extraModels.pier);
  const flora = new Flora(scene, world, island, extraModels);
  const shells = new ShellHunt(scene, ui, 8, { conch: conchModel, scallop: scallopModel, cowrie: cowrieModel }, (x, z) => island.isOpen(x, z, 0.5));

  // ---------- Input ----------
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, rev: false, jump: false, brake: false };
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyR') car.rightUp();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ControlLeft'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const has = (...c) => c.some((k) => keys.has(k));
  const readInput = () => ({
    throttle: (has('KeyW', 'ArrowUp') || touch.gas ? 1 : 0) - (has('KeyS', 'ArrowDown') || touch.rev ? 1 : 0),
    steer: (has('KeyA', 'ArrowLeft') || touch.left ? 1 : 0) - (has('KeyD', 'ArrowRight') || touch.right ? 1 : 0),
    brake: has('KeyB', 'ControlLeft', 'ControlRight') || touch.brake,
    jump: has('Space') || touch.jump,
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
  // Drag on the scene to swing the camera around the car; it eases back after you let go
  let orbit = 0, orbitPitch = 0, dragging = null, sinceDrag = 99;
  const canvas = $('#scene');
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, o: orbit, p: orbitPitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbit = dragging.o - (e.clientX - dragging.x) * 0.008;
    orbitPitch = THREE.MathUtils.clamp(dragging.p + (e.clientY - dragging.y) * 0.004, -0.5, 0.45);
    sinceDrag = 0;
  });
  const endDrag = () => { dragging = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
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
  let dustTimer = 0;
  const debug = { holdCamera: false };

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
    extras.update(dt, elapsed);
    circuit.update(dt, elapsed);
    flora.update(elapsed, car.position);
    dustTimer += dt;
    if (car.grounded && dustTimer > 0.06 && (Math.abs(car.speed) > 7 || car.drifting)) {
      dustTimer = 0;
      for (const w of [car.wheels[2], car.wheels[3]]) fx.dust(w.position.clone().add(new THREE.Vector3(0, -0.25, 0)), car.drifting ? 1.4 : 1);
    }
    if (car.justJumped) { car.justJumped = false; fx.dust(car.position.clone().add(new THREE.Vector3(0, -0.6, 0)), 2); }
    fx.update(dt);
    water.material.uniforms.uTime.value = elapsed;

    // Safety nets: fell in the sea, or stuck on the roof
    if (car.position.y < -1.3) {
      car.reset(spawn, SPAWN.yaw);
      ui.toast('Splash!', 'Towed back to the landing.', 1800);
    }
    upsideTimer = car.isUpsideDown() ? upsideTimer + dt : 0;
    if (upsideTimer > 8) { car.rightUp(); upsideTimer = 0; } // last resort; the controls can rock it back first

    // Camera follows with a little look-ahead (automated checks can hold it still)
    if (debug.holdCamera) { renderer.render(scene, camera); requestAnimationFrame(frame); return; }
    const v = car.body.linvel();
    const lead = new THREE.Vector3(v.x, 0, v.z).multiplyScalar(0.25);
    camTarget.lerp(new THREE.Vector3().copy(car.position).add(lead), 1 - Math.exp(-dt * 4));
    sinceDrag += dt;
    if (!dragging && sinceDrag > 2.5) { orbit *= Math.exp(-dt * 1.5); orbitPitch *= Math.exp(-dt * 1.5); }
    const speedZoom = 1 + Math.min(0.25, Math.abs(car.speed) / 90);
    const off = CAM_OFFSET.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), orbitPitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    const want = camTarget.clone().add(off.multiplyScalar(zoom * speedZoom));
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
      extras.update(STEP, elapsed);
      circuit.update(STEP, elapsed);
      fx.update(STEP);
    }
  };
  window.__shoreline = { RAPIER, car, world, camera, simulate, island, shells, extras, circuit, flora, bowling, renderer, scene, spawn, debug, plan: { TRACK, PATHS, BRIDGES }, ui, setZoom: (z) => { zoom = z; } };
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
