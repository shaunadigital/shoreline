// Sanity checks on the island plan: run with  node tools/checks/run.mjs plan-check
import { TRACK, TRACK_LEN, TRACK_W, CURB_W, BANK, BRIDGES, landSD, coastSD, poolSD, trackDist, pathDist, PLAN } from '../../src/plan.js';
const hw = TRACK_W / 2 + CURB_W;
console.log('track length', TRACK_LEN.toFixed(1), 'samples', TRACK.length, 'bank idx', BANK.idx, 'at', TRACK[BANK.idx].x.toFixed(1), TRACK[BANK.idx].z.toFixed(1));
let worst = [];
for (const p of TRACK) {
  for (const side of [-1, 1]) {
    const x = p.x + p.nx * hw * side, z = p.z + p.nz * hw * side;
    worst.push({ s: p.s, side, x, z, sd: landSD(x, z) });
  }
}
worst.sort((a, b) => a.sd - b.sd);
console.log('track edge closest to water:', worst.slice(0, 8).map((w) => `s${w.s.toFixed(0)} (${w.x.toFixed(1)},${w.z.toFixed(1)}) sd ${w.sd.toFixed(2)}`).join('\n  '));
// track coming near itself
let near = Infinity, where = null;
for (let i = 0; i < TRACK.length; i++) for (let j = i + 40; j < TRACK.length; j++) {
  if (TRACK.length - (j - i) < 40) continue;
  const d = Math.hypot(TRACK[i].x - TRACK[j].x, TRACK[i].z - TRACK[j].z);
  if (d < near) { near = d; where = [TRACK[i], TRACK[j]]; }
}
console.log('closest approach of two track parts', near.toFixed(2), where.map((p) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' '));
console.log('bridges', JSON.stringify(BRIDGES.map((b) => [b.a.map((v) => +v.toFixed(1)), b.b.map((v) => +v.toFixed(1))])));
for (const z of PLAN.zones) console.log('zone', z.id.padEnd(11), 'sd', landSD(...z.at).toFixed(1), 'track', trackDist(...z.at).toFixed(1), 'path', pathDist(...z.at).toFixed(1));
