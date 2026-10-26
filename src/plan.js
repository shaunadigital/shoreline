// The island plan (src/island-plan.json) turned into shapes the game can use:
// smooth curves for the coast, pools, circuit and paths, plus fast distance lookups.
// The curves use the same Catmull-Rom sampling as tools/draw-plan.py, so the game matches the sketch.
import PLAN from './island-plan.json';

export { PLAN };
export const GROUND = 0.8; // height of the flat island
export const TRACK_W = PLAN.track.width; // asphalt width
export const CURB_W = 0.9; // red and white curb on each edge
export const PATH_W = 4.2; // sand path width

export function catmull(pts, closed = true, n = 24) {
  const out = [];
  const m = pts.length;
  const at = (i) => (closed ? pts[(i + m) % m] : pts[Math.max(0, Math.min(m - 1, i))]);
  const spans = closed ? m : m - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  if (!closed) out.push([...pts[m - 1]]);
  return out;
}

// Resample a polyline at an even spacing. Returns points with arc length `s`.
export function resample(pts, step, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const out = [];
  let j = 0;
  for (let k = 0; k < (closed ? n : n + 1); k++) {
    const s = (k / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push({ x: src[j][0] + (src[j + 1][0] - src[j][0]) * t, z: src[j][1] + (src[j + 1][1] - src[j][1]) * t, s });
  }
  return { pts: out, length: total };
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ---------- shapes ----------
export const COAST = catmull(PLAN.coast, true, 12);
export const POOLS = Object.values(PLAN.lagoons).map((p) => catmull(p, true, 12));

// Circuit: centerline every ~1 unit with tangent (direction of travel) and right-hand normal
const loopRaw = catmull(PLAN.track.loop, true, 40);
const loop = resample(loopRaw, 1, true);
// Ease the tightest corners a little (the kink and the south-west hairpin), so the curbs on the inside never fold over
for (let it = 0; it < 25; it++) {
  const P = loop.pts, n = P.length, nx = new Float32Array(n), nz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    nx[i] = P[i].x + 0.5 * ((a.x + b.x) / 2 - P[i].x);
    nz[i] = P[i].z + 0.5 * ((a.z + b.z) / 2 - P[i].z);
  }
  P.forEach((p, i) => { p.x = nx[i]; p.z = nz[i]; });
}
export const TRACK_LEN = loop.length;
export const TRACK = loop.pts.map((p, i, a) => {
  const nx = a[(i + 1) % a.length], pv = a[(i - 1 + a.length) % a.length];
  const tx = nx.x - pv.x, tz = nx.z - pv.z, l = Math.hypot(tx, tz);
  return { ...p, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
});

// Index of the track sample nearest a point (brute force, a few hundred samples)
export function nearestTrack(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < TRACK.length; i++) {
    const d = (TRACK[i].x - x) ** 2 + (TRACK[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// The raised, banked turn: the small kink in the top straight (loop point 9)
const KINK = PLAN.track.loop[9];
const kinkIdx = nearestTrack(KINK[0], KINK[1]);
export const BANK = { idx: kinkIdx, s: TRACK[kinkIdx].s, height: 1.9, flat: 5, ramp: 13, angle: 0.3 };
// 0..1 weight of the raised section at track arc length s
export function bankWeight(s) {
  let d = Math.abs(s - BANK.s);
  d = Math.min(d, TRACK_LEN - d);
  if (d <= BANK.flat) return 1;
  if (d >= BANK.flat + BANK.ramp) return 0;
  const t = (d - BANK.flat) / BANK.ramp;
  return 0.5 + 0.5 * Math.cos(Math.PI * t);
}

// Sand paths, each a smooth open curve, sampled about every half unit
export const PATHS = PLAN.paths.map((p) => resample(catmull(p, false, 24), 0.5, false).pts);

// ---------- distance grids ----------
export const EXTENT = 110; // grids cover [-EXTENT, EXTENT] on both axes
const RES = 1;
const N = Math.round((EXTENT * 2) / RES) + 1;
const coastGrid = new Float32Array(N * N); // signed distance to the coast, positive on land
const poolGrid = new Float32Array(N * N); // signed distance to the nearest pool, negative inside one
const trackGrid = new Float32Array(N * N); // distance to the circuit centerline
const pathGrid = new Float32Array(N * N); // distance to the nearest path centerline

// Cells inside a closed polygon, filled row by row
function fill(mask, poly) {
  for (let j = 0; j < N; j++) {
    const z = -EXTENT + j * RES, xs = [];
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const [xi, zi] = poly[i], [xk, zk] = poly[k];
      if ((zi > z) !== (zk > z)) xs.push(xi + ((z - zi) * (xk - xi)) / (zk - zi));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.ceil((xs[q] + EXTENT) / RES), i1 = Math.floor((xs[q + 1] + EXTENT) / RES);
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) mask[j * N + i] = 1;
    }
  }
}
// Unsigned distance to a set of polylines, out to `R` (cells further away get R).
// Each polyline is densified, then every point stamps the cells around it.
function stampDistance(grid, lines, R, closed) {
  grid.fill(R);
  const r = Math.ceil(R / RES);
  for (const line of lines) {
    const pts = resample(line, 0.35, closed).pts;
    for (const p of pts) {
      const ci = Math.round((p.x + EXTENT) / RES), cj = Math.round((p.z + EXTENT) / RES);
      for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) {
        const dz = -EXTENT + j * RES - p.z;
        for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
          const d = Math.hypot(-EXTENT + i * RES - p.x, dz), k = j * N + i;
          if (d < grid[k]) grid[k] = d;
        }
      }
    }
  }
}
{
  const coastIn = new Uint8Array(N * N), poolIn = new Uint8Array(N * N);
  fill(coastIn, COAST);
  for (const p of POOLS) fill(poolIn, p);
  stampDistance(coastGrid, [COAST], 24, true);
  stampDistance(poolGrid, POOLS, 24, true);
  for (let k = 0; k < N * N; k++) {
    if (!coastIn[k]) coastGrid[k] = -coastGrid[k];
    if (poolIn[k]) poolGrid[k] = -poolGrid[k];
  }
  stampDistance(trackGrid, [TRACK.map((p) => [p.x, p.z])], 16, true);
  stampDistance(pathGrid, PATHS.map((p) => p.map((q) => [q.x, q.z])), 16, false);
  // The circuit runs on dry ground: pools that reach under it are cut back to a bank beside it
  const keep = TRACK_W / 2 + CURB_W + 3;
  // and the coast is pushed out the same way, except at the raised banked turn, which reaches over the surf
  const [kx, kz] = PLAN.track.loop[9];
  for (let k = 0; k < N * N; k++) {
    poolGrid[k] = Math.max(poolGrid[k], keep - trackGrid[k]);
    const x = -EXTENT + (k % N) * RES, z = -EXTENT + Math.floor(k / N) * RES;
    const nearBank = 1 - Math.min(1, Math.max(0, (Math.hypot(x - kx, z - kz) - 14) / 10));
    coastGrid[k] = Math.max(coastGrid[k], (keep - trackGrid[k]) * (1 - nearBank) - 30 * nearBank);
  }
}
function sample(grid, x, z) {
  const fx = Math.min(N - 1.001, Math.max(0, (x + EXTENT) / RES));
  const fz = Math.min(N - 1.001, Math.max(0, (z + EXTENT) / RES));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export const coastSD = (x, z) => sample(coastGrid, x, z);
export const poolSD = (x, z) => sample(poolGrid, x, z);
// Distance to water of any kind: positive on dry land, negative in the sea or a pool
export const landSD = (x, z) => Math.min(coastSD(x, z), poolSD(x, z));
export const inPool = (x, z) => poolSD(x, z) < 0 && coastSD(x, z) > 0;
export const trackDist = (x, z) => sample(trackGrid, x, z);
export const pathDist = (x, z) => sample(pathGrid, x, z);
export const GRID = { N, RES, EXTENT, coastGrid, poolGrid };

// ---------- bridges: wherever a path crosses a pool ----------
export const BRIDGES = [];
for (const p of PATHS) {
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const a = run[0], b = run[run.length - 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      // Reach out onto dry, level ground at both ends
      let ea = 2, eb = 2;
      while (ea < 12 && landSD(a.x - ux * ea, a.z - uz * ea) < 5) ea += 0.5;
      while (eb < 12 && landSD(b.x + ux * eb, b.z + uz * eb) < 5) eb += 0.5;
      BRIDGES.push({ a: [a.x - ux * ea, a.z - uz * ea], b: [b.x + ux * eb, b.z + uz * eb] });
    }
    run = [];
  };
  for (const q of p) {
    if (landSD(q.x, q.z) < 0) run.push(q);
    else flush();
  }
  flush();
}
export const onBridge = (x, z, pad = 0) => BRIDGES.some(({ a, b }) => segDist(x, z, a[0], a[1], b[0], b[1]) < PATH_W / 2 + 0.6 + pad);

export const zone = (id) => PLAN.zones.find((z) => z.id === id);
