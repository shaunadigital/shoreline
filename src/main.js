import './style.css';
import * as THREE from 'three';
import RAPIER from './rapier.js';
import { buildTerrain, buildWater, heightAt } from './terrain.js';
import { Vehicle, loadVehicleModel, updateCarLamps } from './vehicle.js';
import { World } from './world.js';
import { Bowling, ShellHunt } from './games.js';
import { loadGLB } from './models.js';
import { Extras } from './extras.js';
import { Effects } from './fx.js';
import { Circuit } from './track.js';
import { Flora } from './flora.js';
import { buildPaths, buildBridges } from './paths.js';
import { TRACK, PATHS, BRIDGES } from './plan.js';
import { Litter } from './litter.js';
import { DayCycle } from './daycycle.js';
import { Post } from './post.js';
import { Grass } from './grass.js';
import { applyShading, setSeeThrough } from './shading.js';
import { SPAWN, LANDING_GRASS, BOWLING, WELCOME_SIGN, SHELL_SIGN, ZONE_SIGNS, VILLAGE_TORCHES } from './layout.js';

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
  // Start every model download at once, while the physics engine and fonts load (they used to come in three waves)
  const extraNames = {
    lighthouse: 'lighthouse', pier: 'pier', beachSet: 'beach-set', surfRack: 'surf-rack', fruitCart: 'fruit-cart', dynamite: 'dynamite-crate', coconuts: 'coconut-bombs', fireworks: 'firework-barrel', chest: 'treasure-chest', goal: 'soccer-goal', golf: 'golf-hole', arch: 'race-arch', coin: 'gold-doubloon',
    poinciana: 'tree-poinciana', jacaranda: 'tree-jacaranda', plumeria: 'tree-plumeria', goldenShower: 'tree-golden-shower', hibiscus: 'bush-hibiscus', monstera: 'bush-monstera',
  };
  const baseModelsP = Promise.all(['palm', 'tiki-pin', 'tiki-hut', 'sailboat', 'tiki-torch', 'shell-conch', 'shell-scallop', 'shell-cowrie', 'signpost', 'rock-1', 'rock-2', 'rock-3', 'rock-4'].map((n) => loadGLB(`./models/${n}.glb`)));
  const carModelP = loadVehicleModel('./models/offroader.glb');
  const extraModelsP = Promise.all(Object.entries(extraNames).map(async ([k, f]) => [k, await loadGLB(`./models/${f}.glb`)]));
  await RAPIER.init();
  try { await Promise.all([document.fonts.load('64px "Shrikhand"'), document.fonts.load('600 34px "DM Sans"')]); } catch { /* fallback fonts are fine */ }

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('#scene') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Colors are shaded by hand (see shading.js), so no tone mapping on top
  renderer.toneMapping = THREE.NoToneMapping;

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

  // Camera framing taken from the reference site, scaled to our car (2.85 long against its 3.25): a narrow
  // 25 degree lens, 41 degrees above the ground, looking in diagonally, pulling back as you speed up and further
  // on tall phone screens. The distance was set by matching the car's size on screen side by side with the
  // live reference (its car takes about 150 of 960 pixels): 27 units by default, wheel zoom from 13 to 40.
  const CAR_RATIO = 2.85 / 3.25;
  const CAM = { fov: 25, phi: Math.PI * 0.27, theta: Math.PI * 0.25, min: 15 * CAR_RATIO, max: 40, tallOffset: 9 * CAR_RATIO, idealRatio: 16 / 9, baseRatio: 0.5, speedAmplitude: -0.4, speedEdge: [5, 40] };
  const camera = new THREE.PerspectiveCamera(CAM.fov, window.innerWidth / window.innerHeight, 0.5, 900);

  scene.add(new THREE.HemisphereLight('#bfe6ff', '#f2c48a', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_OFFSET = new THREE.Vector3(-30, 50, 25);

  // Physics
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });

  const [palmModel, pinModel, hutModel, boatModel, torchModel, conchModel, scallopModel, cowrieModel, signModel, ...rockModels] = await baseModelsP;
  buildTerrain(scene, world);
  const water = buildWater(scene);
  buildPaths(scene);
  const island = new World(scene, world, { palm: palmModel, hut: hutModel, boat: boatModel, torch: torchModel, sign: signModel, rocks: rockModels.filter(Boolean) });
  const bowling = new Bowling(scene, world, island, ui, pinModel, BOWLING);
  island.sign('Welcome to Shoreline', WELCOME_SIGN[0], WELCOME_SIGN[1], 0.1, 'Follow the sand paths');
  island.sign('Shell Hunt', SHELL_SIGN[0], SHELL_SIGN[1], 0.25, 'Find all 8 by the water');
  for (const [text, x, z] of ZONE_SIGNS) island.sign(text, x, z, 0.1);
  for (const [x, z] of VILLAGE_TORCHES) island.torch(x, z);

  const spawn = new THREE.Vector3(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
  const carModel = await carModelP;
  const car = new Vehicle(scene, world, spawn, carModel);
  car.reset(spawn, SPAWN.yaw);

  // Props and mini games in their zones
  const fx = new Effects(scene);
  ui.celebrate = (pos) => fx.celebrate(pos || car.position, 4);
  const extraModels = Object.fromEntries(await extraModelsP);
  const extras = new Extras({ scene, world, island, ui, fx, car, models: extraModels });
  const circuit = new Circuit({ scene, world, island, ui, fx, car, arch: extraModels.arch });
  buildBridges(scene, island, extraModels.pier);
  const flora = new Flora(scene, world, island, extraModels);
  // Each tree and bush gathers a grass patch round it
  const plants = [
    ...flora.groups.flatMap((g) => g.spots.map((sp) => [sp.x, sp.z, g.bush ? 1.4 : 2.6])),
    ...LANDING_GRASS, // hand-placed patches so the first view isn't a bare sand plaza
  ];
  const grass = new Grass(scene, renderer, { small: Math.min(innerWidth, innerHeight) < 600, plants });
  new Litter(scene, flora.litterSpots, { small: Math.min(innerWidth, innerHeight) < 600 }); // fallen leaves and petals
  const shells = new ShellHunt(scene, ui, 8, { conch: conchModel, scallop: scallopModel, cowrie: cowrieModel }, (x, z) => island.isOpen(x, z, 0.5));
  applyShading(scene);
  const dayCycle = new DayCycle({ scene, sky, water });
  dayCycle.build();
  const post = new Post(renderer, scene, camera);

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

  let zoomBase = CAM.baseRatio, zoomSmoothed = CAM.baseRatio;
  const tallness = () => Math.max(1, CAM.idealRatio / (innerWidth / innerHeight)) - 1;
  const radiusMax = () => CAM.max + tallness() * CAM.tallOffset;
  // Drag on the scene to swing the camera around the car; it eases back after you let go
  let orbit = 0, orbitPitch = 0, dragging = null, sinceDrag = 99;
  const canvas = $('#scene');
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, o: orbit, p: orbitPitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbit = dragging.o - (e.clientX - dragging.x) * 0.008;
    orbitPitch = THREE.MathUtils.clamp(dragging.p - (e.clientY - dragging.y) * 0.004, -0.6, 0.45);
    sinceDrag = 0;
  });
  const endDrag = () => { dragging = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  addEventListener('wheel', (e) => { zoomBase = THREE.MathUtils.clamp(zoomBase - Math.sign(e.deltaY) * 0.05, 0, 1); }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    grass.fit(grassRadius());
    post.resize();
  });

  // ---------- Loop ----------
  const camTarget = new THREE.Vector3().copy(spawn);
  const camOffset = (radius, pitch = 0, yaw = 0) => new THREE.Vector3().setFromSphericalCoords(radius, THREE.MathUtils.clamp(CAM.phi - pitch, 0.15, 1.4), CAM.theta + yaw);
  camera.position.copy(spawn).add(camOffset(THREE.MathUtils.lerp(CAM.min, radiusMax(), 1 - zoomSmoothed)));
  camera.lookAt(spawn);
  const clock = new THREE.Clock();
  const STEP = 1 / 60;
  let acc = 0;
  let upsideTimer = 0;
  let elapsed = 0;
  let dustTimer = 0;
  const debug = { holdCamera: false, stats: null };
  // ?debug in the address shows a performance panel (frame rate, CPU and GPU time per frame)
  if (new URLSearchParams(location.search).has('debug')) {
    import('stats-gl').then(({ default: Stats }) => {
      const stats = new Stats({ trackGPU: true, horizontal: false });
      stats.init(renderer);
      stats.dom.style.cssText += ';top:auto;bottom:90px;left:12px;z-index:50';
      document.body.appendChild(stats.dom);
      debug.stats = stats;
    });
  }
  // The grass patch covers what the camera sees: its centre is the middle of the patch of ground in view,
  // its size (set on resize) is what the view covers when fully zoomed out
  const ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const groundHits = (cam) => ndc.map(([x, y]) => {
    const d = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(cam.position).normalize();
    const t = d.y < -0.05 ? (0.8 - cam.position.y) / d.y : 80;
    return cam.position.clone().addScaledVector(d, Math.min(t, 80));
  });
  const grassCenter = () => groundHits(camera).reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  const grassRadius = () => {
    const cam = camera.clone();
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    // The view at full speed from the default zoom (zooming out further than that shows the patch edge fading)
    cam.position.copy(camOffset(THREE.MathUtils.lerp(CAM.min, radiusMax(), 1 - (CAM.baseRatio + CAM.speedAmplitude))));
    cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const hits = groundHits(cam), c = hits.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
    return Math.max(...hits.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  };
  grass.fit(grassRadius());

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1) * (fx.slow > 0 ? 0.35 : 1); // slow motion right after a close blast
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
    grass.update(dt, elapsed, grassCenter(), car.position, car.wheels, car.grounded);
    grass.uniforms.uBlast.value.copy(fx.blastAt);
    dustTimer += dt;
    if (car.grounded && dustTimer > 0.06 && (Math.abs(car.speed) > 7 || car.drifting)) {
      dustTimer = 0;
      for (const w of [car.wheels[2], car.wheels[3]]) fx.dust(w.position.clone().add(new THREE.Vector3(0, -0.25, 0)), car.drifting ? 1.4 : 1);
    }
    // Pools: wheels in the water throw spray and the water drags the car back a little
    const inWater = car.grounded && heightAt(car.position.x, car.position.z) < -0.2;
    if (inWater) {
      const v = car.body.linvel(), drag = Math.exp(-dt * 0.9);
      car.body.setLinvel({ x: v.x * drag, y: v.y, z: v.z * drag }, true);
      if (Math.abs(car.speed) > 2 && dustTimer > 0.05) {
        dustTimer = 0;
        const amt = Math.min(1.6, Math.abs(car.speed) / 8);
        for (const w of car.wheels) fx.splash(w.position.clone().add(new THREE.Vector3(0, -0.2, 0)), amt);
      }
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
    dayCycle.update(dt, camera);
    updateCarLamps(dayCycle.state.night);
    if (debug.holdCamera) { post.render(scene, camera, dayCycle.state.night); debug.stats?.update(); requestAnimationFrame(frame); return; }
    const v = car.body.linvel();
    const lead = new THREE.Vector3(v.x, 0, v.z).multiplyScalar(0.25);
    camTarget.lerp(new THREE.Vector3().copy(car.position).add(lead), 1 - Math.exp(-dt * 8)); // tighter follow for the narrow lens
    sinceDrag += dt;
    if (!dragging && sinceDrag > 2.5) { orbit *= Math.exp(-dt * 1.5); orbitPitch *= Math.exp(-dt * 1.5); }
    const sp = THREE.MathUtils.smoothstep(Math.abs(car.speed), CAM.speedEdge[0], CAM.speedEdge[1]);
    zoomSmoothed = THREE.MathUtils.lerp(zoomSmoothed, zoomBase + CAM.speedAmplitude * sp, Math.min(1, dt * 10));
    const radius = THREE.MathUtils.lerp(CAM.min, radiusMax(), 1 - zoomSmoothed);
    const want = camTarget.clone().add(camOffset(radius, orbitPitch, orbit));
    camera.position.lerp(want, 1 - Math.exp(-dt * 5));
    camera.lookAt(camTarget);
    if (fx.shake > 0) { // camera kick from explosions
      const k = fx.shake * fx.shake * 0.35;
      camera.position.add(new THREE.Vector3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k));
      camera.rotateZ((Math.random() - 0.5) * k * 0.12);
    }
    sun.position.copy(camTarget).add(SUN_OFFSET);
    sun.target.position.copy(camTarget);

    setSeeThrough(car.position, camera, renderer);
    $('#speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    post.render(scene, camera, dayCycle.state.night);
    debug.stats?.update();
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
  window.__shoreline = { RAPIER, car, world, camera, simulate, island, shells, extras, circuit, flora, bowling, grass, renderer, scene, spawn, debug, plan: { TRACK, PATHS, BRIDGES }, ui, setZoom: (z) => { zoomBase = z; } };
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
