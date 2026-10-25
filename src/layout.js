// Where the bigger props and mini games live on the island (game units, north is -Z).
// Positions were picked on a flat-land map so nothing sits in the water or on a steep slope.

export const SOCCER = { x: 22, z: 17, angle: 1.05, length: 20, width: 11 }; // field runs along `angle`
export const GOLF = { green: [5, -35], tee: [11, -30] };
export const CHEST = [36, 35]; // in the crater
export const LIGHTHOUSE = [62, 39]; // on the south-east point
export const PIER = { shore: [26.2, 38.1], dir: [-0.65, 0.76] }; // runs from the beach out over the water
export const BEACH_SET = [22, 29.5];
export const SURF_RACK = [17, 30];
export const FRUIT_CART = [-17.5, -10];
export const CRATES = [-12, -14];
export const DYNAMITE = [[-9, -17], [11, 6]];
export const COCONUT_BOMBS = [[-1, 27], [50, 10], [-27, 16], [-43, -16]];
export const FIREWORK_BARREL = [12.5, 10]; // beside the end of the bowling lane
// Race loop: gate 1 is start and finish. Each gate faces the next one.
export const RACE_GATES = [[16, -6], [7, -21], [-4, -31], [-14, -19], [-10, 3], [-1, 7]];

// Circles the terrain flattens to ground height: [x, z, radius]
export const LAYOUT_FLAT = [
  [GOLF.green[0], GOLF.green[1], 6], [GOLF.tee[0], GOLF.tee[1], 2.5],
  [FRUIT_CART[0], FRUIT_CART[1], 4],
  ...RACE_GATES.map(([x, z]) => [x, z, 3.5]),
];

// Circles kept clear of palms, bushes and rocks: [x, z, radius]
export const LAYOUT_BLOCKED = [
  [SOCCER.x, SOCCER.z, 15], [GOLF.green[0], GOLF.green[1], 7], [GOLF.tee[0], GOLF.tee[1], 6],
  [CHEST[0], CHEST[1], 4], [LIGHTHOUSE[0], LIGHTHOUSE[1], 5], [BEACH_SET[0], BEACH_SET[1], 4],
  [SURF_RACK[0], SURF_RACK[1], 3], [FRUIT_CART[0], FRUIT_CART[1], 5], [CRATES[0], CRATES[1], 4],
  ...DYNAMITE.map(([x, z]) => [x, z, 3]), ...COCONUT_BOMBS.map(([x, z]) => [x, z, 3]),
  [FIREWORK_BARREL[0], FIREWORK_BARREL[1], 3],
  ...RACE_GATES.map(([x, z]) => [x, z, 5]),
  // the pier's landing on the beach
  [PIER.shore[0] - PIER.dir[0] * 2, PIER.shore[1] - PIER.dir[1] * 2, 4],
];
