// Headless check of the built game: loads dist/ through `vite preview`, reports console errors and load time,
// drives with simulate(), and saves screenshots. Usage: npm run build && node tools/checks/play.mjs [outDir]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // the globally installed one
import { spawn } from 'child_process';
import fs from 'fs';

const out = process.argv[2] || '/tmp/shoreline-shots';
fs.mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('4179') && r()));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const [vw, vh] = (process.env.VIEW || '1280x800').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto('http://localhost:4179/');
await page.waitForFunction(() => window.__shoreline, null, { timeout: 120000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.click('#play');
const shot = async (name) => { await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); };
const steps = JSON.parse(process.env.STEPS || '[]');
const results = {};
for (const step of steps) {
  results[step.name] = await page.evaluate(step.js);
  if (step.shot) await shot(step.name);
}
console.log(JSON.stringify(results, null, 1));
console.log('errors/warnings:', errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : 'none');
await browser.close();
process.kill(-server.pid);
process.exit(0);
