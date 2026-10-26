// Clearance of every placed prop from water, the circuit edge and the paths
import * as L from '../../src/layout.js';
import { landSD, trackDist, pathDist, TRACK_W, CURB_W } from '../../src/plan.js';
const hw = TRACK_W / 2 + CURB_W;
const rows = [];
const add = (name, x, z) => rows.push({ name, x, z, sd: landSD(x, z), tr: trackDist(x, z) - hw, pa: pathDist(x, z) - 2.1 });
add('spawn', L.SPAWN.x, L.SPAWN.z);
for (let i = -7; i <= 7; i += 7) add('letters' + i, L.LETTERS.x + i, L.LETTERS.z);
add('welcome', ...L.WELCOME_SIGN); add('shellsign', ...L.SHELL_SIGN);
L.BEACH_BALLS.forEach((p, i) => add('ball' + i, ...p));
add('hut', ...L.HUT); add('lane W', L.BOWLING.x - 8, L.BOWLING.z); add('pins', L.BOWLING.x + 6, L.BOWLING.z);
add('cart', ...L.FRUIT_CART); add('firework', ...L.FIREWORK_BARREL);
L.RAMPS.forEach(([x, z], i) => add('ramp' + i, x, z)); add('crates', ...L.CRATES);
L.DYNAMITE.forEach((p, i) => add('dyn' + i, ...p));
for (const s of [-1, 1]) add('goal' + s, L.SOCCER.x + Math.cos(L.SOCCER.angle) * s * (L.SOCCER.length / 2 + 2), L.SOCCER.z + Math.sin(L.SOCCER.angle) * s * (L.SOCCER.length / 2 + 2));
for (const s of [-1, 1]) add('touch' + s, L.SOCCER.x + s * L.SOCCER.width / 2, L.SOCCER.z);
add('green', ...L.GOLF.green); add('tee', ...L.GOLF.tee);
add('pier', ...L.PIER.start); add('beachset', ...L.BEACH_SET); add('surf', ...L.SURF_RACK);
L.COCONUT_BOMBS.forEach((p, i) => add('coco' + i, ...p));
add('lighthouse', ...L.LIGHTHOUSE); add('chest', ...L.CHEST);
L.ZONE_SIGNS.forEach(([t, x, z]) => add(t, x, z));
for (const r of rows) {
  const flag = (r.sd < 3 ? ' WATER' : '') + (r.tr < 1.5 ? ' TRACK' : '');
  console.log(r.name.padEnd(16), `(${r.x.toFixed(1)},${r.z.toFixed(1)})`.padEnd(15), 'land', r.sd.toFixed(1).padStart(6), ' track', r.tr.toFixed(1).padStart(6), ' path', r.pa.toFixed(1).padStart(6), flag);
}
