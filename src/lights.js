import * as THREE from 'three';

// String lights (2026-11-12): strings of little bulbs that sag between neighboring tiki torches (the landing,
// the tiki village, the bowling lane and anywhere else torches stand), off by day and glowing in warm
// mixed colors at night, bright enough for the glow pass to give each bulb a halo. Each torch strings to
// its nearest neighbor or two within reach, so the strings follow wherever torches are placed.

const COLORS = ['#ffd27a', '#ff9a6a', '#7fe0d0', '#ffb3d0', '#fff0c8'];
const SPACING = 0.65;

export class StringLights {
  // spots: [x, y, z] tops of the torches (where the string ties on)
  constructor(scene, spots) {
    const pairs = [];
    spots.forEach((a, i) => {
      const near = spots.map((b, j) => ({ j, d: Math.hypot(a[0] - b[0], a[2] - b[2]) }))
        .filter(({ j, d }) => j !== i && d > 3 && d < 11.5).sort((x, y) => x.d - y.d).slice(0, 2);
      for (const { j } of near) if (!pairs.some(([p, q]) => (p === i && q === j) || (p === j && q === i))) pairs.push([i, j]);
    });
    const bulbs = [], wire = [];
    for (const [i, j] of pairs) {
      const a = new THREE.Vector3(...spots[i]), b = new THREE.Vector3(...spots[j]);
      const len = a.distanceTo(b), n = Math.max(2, Math.round(len / SPACING)), sag = 0.12 * len;
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const p = a.clone().lerp(b, u);
        p.y -= sag * 4 * u * (1 - u); // hangs lowest in the middle
        if (prev) wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        if (k > 0 && k < n) bulbs.push(p);
        prev = p;
      }
    }
    this.count = bulbs.length;
    const geo = new THREE.SphereGeometry(0.05, 8, 6);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, Math.max(1, bulbs.length));
    this.base = [];
    const m = new THREE.Matrix4();
    bulbs.forEach((p, k) => {
      m.makeTranslation(p.x, p.y - 0.06, p.z);
      this.mesh.setMatrixAt(k, m);
      const c = new THREE.Color(COLORS[k % COLORS.length]);
      this.base.push(c);
      this.mesh.setColorAt(k, c);
    });
    this.mesh.count = bulbs.length;
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.wire = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({ color: '#2a2030' }));
    scene.add(this.mesh, this.wire);
    this.lastNight = -1;
    this._c = new THREE.Color();
  }

  update(t, night) {
    if (!this.count) return;
    // Off by day (pale glass), glowing at night with a gentle shimmer along each string
    const on = THREE.MathUtils.smoothstep(night, 0.35, 0.85);
    if (Math.abs(on - this.lastNight) < 0.002 && on < 0.01) return;
    this.lastNight = on;
    for (let k = 0; k < this.count; k++) {
      const flick = 0.85 + 0.15 * Math.sin(t * 2.2 + k * 1.7);
      this._c.copy(this.base[k]).multiplyScalar(0.55 + on * 1.5 * flick);
      if (on < 0.01) this._c.lerp(new THREE.Color('#e8e2d6'), 0.6);
      this.mesh.setColorAt(k, this._c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
}
