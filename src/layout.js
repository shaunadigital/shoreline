// Where every prop and mini game sits on the new island (game units, x east, z south, north is -Z).
// Each group lives in its zone from src/island-plan.json; positions were checked against the
// circuit, the paths and the pools with tools/checks (node tools/checks/run.mjs layout-check).
import { zone, PLAN, landSD } from './plan.js';

const Z = (id) => zone(id).at;

// ---------- Landing ----------
export const SPAWN = { x: -1.8, z: 24, yaw: Math.PI / 2 }; // facing north, up the path toward the letters
export const LETTERS = { x: -3.2, z: 13 }; // centre of the SHORELINE letters
export const WELCOME_SIGN = [-9, 26];
export const SHELL_SIGN = [-13, 21];
export const BEACH_BALLS = [[3, 17], [-8, 16], [-4, 28], [1, 26], [-14, 28]];
// Hand-placed grass patches round the landing (Shauna's call, 2026-10-30): [x, z, size], as the patches round plants
export const LANDING_GRASS = [[-15, 14, 2.2], [9, 12, 2], [-12, 33, 2], [6, 31, 2], [-18, 21, 1.6]];

// ---------- Tiki village ----------
export const HUT = [-29, -24.5];
export const BOWLING = { x: -18.5, z: -19 }; // lane centre; the lane runs east, pins at the east end
export const FRUIT_CART = [-38, -21];
export const FIREWORK_BARREL = [-8.5, -15.5]; // beside the end of the bowling lane
export const VILLAGE_TORCHES = [[-33, -28], [-25, -28.5], [-33, -20.5]];

// ---------- Jump yard ----------
// Ramps: [x, z, yaw]; yaw 0 launches east, PI launches west
export const RAMPS = [[45, -6.5, 0], [60, -6.5, 0], [56, -16, Math.PI], [48, 3, Math.PI]];
export const CRATES = [70, -6.5];
export const DYNAMITE = [[53, 3.5], [64, -17], [40, -17]];

// ---------- Sports park ----------
export const SOCCER = { x: 21.3, z: 31, angle: Math.PI / 2, length: 19, width: 9 }; // field runs along `angle`
export const GOLF = { green: [18.5, 51], tee: [25.5, 56] };

// ---------- Beach front ----------
export const PIER = { start: PLAN.markers.pier, dir: [0, 1] }; // starts on the sand and runs out to sea
export const BEACH_SET = [-23, 72];
export const SURF_RACK = [-7.5, 73];
export const COCONUT_BOMBS = [[-27, 64], [-3, 67], [-68, 2], [77, -16]];

// ---------- Lighthouse point ----------
export const LIGHTHOUSE = [-73, 15.2];

// ---------- Treasure crater ----------
export const CHEST = Z('crater');

// Zone signs: [text, x, z]
export const ZONE_SIGNS = [
  ['Tiki Village', -21, -11],
  ['Jump Yard', 39, -2],
  ['Sports Park', 26, 15.5],
  ['Beach', -9.5, 60],
  ['Treasure Crater', -60, -44],
  ['Lighthouse', -66, 22],
];

// Circles the terrain keeps level, on top of the zones: [x, z, radius]
export const LAYOUT_FLAT = [
  [GOLF.green[0], GOLF.green[1], 6], [GOLF.tee[0], GOLF.tee[1], 3],
  [SOCCER.x, SOCCER.z - SOCCER.length / 2 - 2, 6], [SOCCER.x, SOCCER.z + SOCCER.length / 2 + 2, 6],
  ...RAMPS.map(([x, z]) => [x, z, 5]),
];

// Circles kept clear of trees, bushes, grass and rocks: [x, z, radius]
export const LAYOUT_BLOCKED = [
  [SPAWN.x, SPAWN.z, 6], [LETTERS.x, LETTERS.z, 9], [WELCOME_SIGN[0], WELCOME_SIGN[1], 2.5], [SHELL_SIGN[0], SHELL_SIGN[1], 2.5],
  [HUT[0], HUT[1], 5.5], [FRUIT_CART[0], FRUIT_CART[1], 4.5], [FIREWORK_BARREL[0], FIREWORK_BARREL[1], 3],
  [BOWLING.x - 6, BOWLING.z, 4], [BOWLING.x, BOWLING.z, 4], [BOWLING.x + 6, BOWLING.z, 4],
  ...RAMPS.flatMap(([x, z, yaw]) => [[x, z, 4.5], [x + Math.cos(yaw) * 9, z - Math.sin(yaw) * 9, 5], [x - Math.cos(yaw) * 8, z + Math.sin(yaw) * 8, 4]]),
  [CRATES[0], CRATES[1], 4], ...DYNAMITE.map(([x, z]) => [x, z, 3.5]),
  [GOLF.green[0], GOLF.green[1], 6], [GOLF.tee[0], GOLF.tee[1], 3],
  [BEACH_SET[0], BEACH_SET[1], 4], [SURF_RACK[0], SURF_RACK[1], 3.5], ...COCONUT_BOMBS.map(([x, z]) => [x, z, 3.5]),
  [PIER.start[0], PIER.start[1] + 3, 4],
  [LIGHTHOUSE[0], LIGHTHOUSE[1], 6], [CHEST[0], CHEST[1], 7],
  ...ZONE_SIGNS.map(([, x, z]) => [x, z, 2.5]),
];

// Soccer field rectangle (with room for the goals), also kept clear
export function inSoccer(x, z, pad = 0) {
  const dx = x - SOCCER.x, dz = z - SOCCER.z, ca = Math.cos(SOCCER.angle), sa = Math.sin(SOCCER.angle);
  return Math.abs(dx * ca + dz * sa) < SOCCER.length / 2 + 3.5 + pad && Math.abs(-dx * sa + dz * ca) < SOCCER.width / 2 + 1.5 + pad;
}

export { landSD };
