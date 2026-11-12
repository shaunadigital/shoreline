// Records the trailer: loads the built game in capture mode (`?capture`), plays each scene one frame at a time
// at exactly 1/30 s a frame and saves a JPEG per frame into <out>/<scene>/. tools/trailer.sh encodes them.
// Usage: npm run build && NODE_PATH=$(npm root -g) node tools/trailer.mjs /tmp/trailer [scene names...]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'child_process';
import fs from 'fs';

const out = process.argv[2] || '/tmp/trailer';
const only = process.argv.slice(3);
const FPS = 30;
const STRIDE = Number(process.env.STRIDE || 1); // STRIDE=15 saves every 15th frame only, for a quick look before the full run

// Each scene: time of day (a day-cycle phase), a setup run once, how many seconds to warm up unseen, then
// the input for frame i of `seconds`. Phases: 0 to 0.5 day, 0.62 sunset, 0.72 to 0.88 night, 0.95 dawn.
const SCENES = [
  { name: '1-night-boom', phase: 0.78, seconds: 5.5, warm: 1.2,
    setup: `s.car.reset({ x: -1.8, y: 1.2, z: 25.5 }, Math.PI / 2);`,
    input: `(i) => ({ throttle: i > 20 ? 0.7 : 0 })` },
  { name: '2-night-water', phase: 0.8, seconds: 5, warm: 1,
    setup: `s.car.reset({ x: -8.7, y: 1.2, z: 9 }, Math.PI / 2);`,
    input: `(i) => ({ throttle: 0.55, steer: Math.sin(i / 30) * 0.25 })` },
  { name: '3-dawn-drift', phase: 0.955, seconds: 5, warm: 1,
    setup: `const T = s.plan.TRACK; const a = T[60], b = T[64]; s.car.reset({ x: a.x, y: 1.2, z: a.z }, Math.atan2(-(b.z - a.z), b.x - a.x));`,
    input: `(i) => i < 45 ? { throttle: 1, steer: window.__follow() } : i < 75 ? { throttle: 1, steer: 0.7, brake: true } : { throttle: 0.9, steer: window.__follow() }` },
  { name: '4-day-boost', phase: 0.25, seconds: 5, warm: 1,
    setup: `s.car.reset({ x: -64, y: 1.2, z: 76.5 }, -0.13); s.wildlife.dolphins.forEach((d, i) => { d.wait = 0.6 + i * 1.1; });`,
    input: `(i) => ({ throttle: 1, boost: i > 25 })` },
  { name: '5-rain', phase: 0.3, seconds: 4.5, warm: 1,
    setup: `s.weather.shower(40); s.weather.rain = 1; s.weather.wet = 1; const T = s.plan.TRACK; const a = T[60], b = T[64]; s.car.reset({ x: a.x, y: 1.2, z: a.z }, Math.atan2(-(b.z - a.z), b.x - a.x));`,
    input: `(i) => ({ throttle: 0.75, steer: window.__follow() })` },
  { name: '6-end', phase: 0.6, seconds: 5, warm: 1, title: true,
    setup: `s.weather.rain = 0; s.weather.wet = 0; s.weather.state = 'dry'; const T = s.plan.TRACK; const a = T[20], b = T[24]; s.car.reset({ x: a.x, y: 1.2, z: a.z }, Math.atan2(-(b.z - a.z), b.x - a.x));`,
    input: `(i) => ({ throttle: 0.45, steer: window.__follow() })` },
];

fs.mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('4180') && r()));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4180/?capture');
await page.waitForFunction(() => window.__shoreline, null, { timeout: 180000 });
await page.click('#play');
// Hide the game's buttons and messages; add the end card (logo and where to play), hidden until the last scene
await page.addStyleTag({ content: `#hud, #toast, #race, #intro { display: none !important; }
  #endcard { position: fixed; inset: 0; display: grid; place-content: center; text-align: center; gap: 18px; pointer-events: none; opacity: 0; font: 600 28px 'DM Sans', system-ui, sans-serif; color: #fff7ea; text-shadow: 0 2px 18px rgba(60,20,40,.55); }
  #endcard img { width: 560px; filter: drop-shadow(0 6px 24px rgba(60,20,40,.45)); }` });
await page.evaluate(() => { const d = document.createElement('div'); d.id = 'endcard'; d.innerHTML = '<img src="./logo.webp" alt=""><div>Play free at shauna.digital/games/shoreline</div>'; document.body.append(d); });
// Steering that follows the race circuit: aim at a point a few steps ahead on the track (left is positive)
await page.evaluate(() => {
  window.__follow = () => {
    const s = window.__shoreline, T = s.plan.TRACK, p = s.car.position;
    let best = 0, bd = Infinity;
    T.forEach((t, k) => { const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2; if (d < bd) { bd = d; best = k; } });
    const g = T[(best + 8) % T.length];
    const want = Math.atan2(-(g.z - p.z), g.x - p.x);
    const f = new s.car.position.constructor(1, 0, 0).applyQuaternion(s.car.group.quaternion);
    const have = Math.atan2(-f.z, f.x);
    let d = want - have; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return Math.max(-1, Math.min(1, d * 2.2));
  };
});
// Let the opening finish (the island grows in) before any scene
await page.evaluate(() => { const s = window.__shoreline; for (let i = 0; i < 30 * 8; i++) s.captureFrame(1 / 30, {}, false); });

for (const sc of SCENES) {
  if (only.length && !only.includes(sc.name)) continue;
  const dir = `${out}/${sc.name}`;
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(({ setup, phase, warm }) => {
    const s = window.__shoreline;
    s.dayCycle.phase = phase; s.dayCycle.running = false;
    s.debug.holdCamera = false;
    new Function('s', setup)(s);
    for (let i = 0; i < warm * 30; i++) s.captureFrame(1 / 30, {}, false); // the camera settles on the car
  }, sc);
  const frames = Math.round(sc.seconds * FPS);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(({ input, i, title, frames, draw }) => {
      const s = window.__shoreline;
      s.captureFrame(1 / 30, (0, eval)(input)(i), draw);
      if (title) document.getElementById('endcard').style.opacity = String(Math.min(1, Math.max(0, (i - frames * 0.25) / 30)));
    }, { input: sc.input, i, title: !!sc.title, frames, draw: i % STRIDE === 0 });
    if (i % STRIDE === 0) await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log(sc.name, frames, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.kill(-server.pid);
process.exit(0);
