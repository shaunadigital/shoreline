import * as THREE from 'three';
import { COAST, resample, coastSD } from './plan.js';
import { heightAt, WATER_LIGHT } from './terrain.js';
import WATER_LIGHT_GLSL from './shaders/water-light.glsl?raw';
import { REVEAL, REVEAL_FRAG } from './reveal.js';

// Surf on the beach (2026-11-04, Shauna picked it from the ideas list): a strip of shallow water laid along
// the whole coastline that runs up the sand with each wave, a broken line of foam at its edge, and slides
// back leaving a darker band of wet sand. Waves arrive a little out of step along the coast and each runs
// up a different distance. The same timing in code (`edgeAt`) tells the game where the water is, so the
// car throws spray when a wave reaches it.

const PERIOD = 7.0; // seconds per wave
const IN = -1.6, OUT = 3.2; // the strip runs from 1.6 out to sea to 3.2 up the beach

// Where the water's edge is (distance up the beach from the shoreline) at arc length s and time t
const GLSL = /* glsl */ `
  float surfPhase(float s, float t) { return fract(t / ${PERIOD.toFixed(1)} + 0.18 * sin(s * 0.045) + 0.1 * sin(s * 0.13 + 1.0)); }
  float surfRun(float s, float t) { float n = floor(t / ${PERIOD.toFixed(1)} + 0.18 * sin(s * 0.045) + 0.1 * sin(s * 0.13 + 1.0)); return 1.3 + 1.2 * (0.5 + 0.5 * sin(s * 0.21 + n * 1.7)); }
  float surfShape(float ph) { return ph < 0.3 ? 1.0 - pow(1.0 - ph / 0.3, 2.0) : 1.0 - smoothstep(0.3, 1.0, ph); }
  float surfEdge(float s, float t) { return -0.35 + surfRun(s, t) * surfShape(surfPhase(s, t)); }
`;
function phase(s, t) { const x = t / PERIOD + 0.18 * Math.sin(s * 0.045) + 0.1 * Math.sin(s * 0.13 + 1); return { ph: x - Math.floor(x), n: Math.floor(x) }; }
export function edgeAt(s, t) {
  const { ph, n } = phase(s, t);
  const run = 1.3 + 1.2 * (0.5 + 0.5 * Math.sin(s * 0.21 + n * 1.7));
  const shape = ph < 0.3 ? 1 - (1 - ph / 0.3) ** 2 : 1 - THREE.MathUtils.smoothstep(ph, 0.3, 1);
  return { edge: -0.35 + run * shape, rising: ph < 0.3, ph };
}

export class Surf {
  constructor(scene, water) {
    const pts = resample(COAST, 0.8, true).pts; // [{ x, z, s }] or [x, z]
    const P = pts.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
    let s = 0;
    P.forEach((p, i) => { if (i) s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z); p.s = s; });
    this.len = s + Math.hypot(P[0].x - P[P.length - 1].x, P[0].z - P[P.length - 1].z);
    // Land-ward normal at each point (checked against the coast distance, whatever the winding)
    P.forEach((p, i) => {
      const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length];
      let nx = -(b.z - a.z), nz = b.x - a.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (coastSD(p.x + nx, p.z + nz) < coastSD(p.x - nx, p.z - nz)) { nx = -nx; nz = -nz; }
      p.nx = nx; p.nz = nz;
    });
    this.P = P;
    const ROWS = 12, n = P.length;
    const pos = new Float32Array((n + 1) * ROWS * 3), across = new Float32Array((n + 1) * ROWS), along = new Float32Array((n + 1) * ROWS);
    for (let i = 0; i <= n; i++) {
      const p = P[i % n], sAlong = i === n ? this.len : p.s;
      for (let r = 0; r < ROWS; r++) {
        const d = IN + (OUT - IN) * (r / (ROWS - 1)), x = p.x + p.nx * d, z = p.z + p.nz * d, k = i * ROWS + r;
        // A little above the sand (the terrain mesh is coarser than heightAt), and never lower than the top of the
        // sea's swell (0.24 above -0.15), so the swell can't cut it and it hides the sand's coarse teeth there
        pos.set([x, Math.max(heightAt(x, z) + 0.07, 0.11), z], k * 3);
        across[k] = d; along[k] = sAlong;
      }
    }
    const idx = [];
    for (let i = 0; i < n; i++) for (let r = 0; r < ROWS - 1; r++) { const a = i * ROWS + r, b = a + ROWS; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geo.setIndex(idx);
    const wu = water.material.uniforms;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uTime: wu.uTime, uTint: wu.uTint, uFoam: wu.uFoam, uShallow: wu.uShallow, ...REVEAL, ...WATER_LIGHT },
      vertexShader: /* glsl */ `
        attribute float aAcross; attribute float aAlong; varying float vA; varying float vS; varying vec3 vW;
        void main() { vA = aAcross; vS = aAlong; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uTint; uniform vec3 uFoam; uniform vec3 uShallow;
        uniform vec2 uRevealCenter; uniform float uRevealRadius; uniform float uRevealSoft;
        varying float vA; varying float vS; varying vec3 vW;
        ${GLSL}
        ${WATER_LIGHT_GLSL}
        float hash1(float x) { return fract(sin(x * 91.7) * 43758.5453); }
        void main() {
          vec3 vRevealW = vW;
          ${REVEAL_FRAG}
          float ph = surfPhase(vS, uTime), edge = surfEdge(vS, uTime);
          float top = -0.35 + surfRun(vS, uTime); // how far this wave reached
          float fadeIn = smoothstep(${IN.toFixed(1)}, -0.6, vA); // blends into the sea
          if (vA > edge) {
            // Behind a wave sliding back: darker wet sand that dries as the next wave comes
            float wet = step(vA, top) * (ph > 0.3 ? 1.0 - smoothstep(0.3, 1.0, ph) * 0.6 : 0.0) * smoothstep(top, top - 0.6, vA);
            if (wet < 0.01) discard;
            gl_FragColor = vec4(vec3(0.42, 0.27, 0.14) * uTint, 0.16 * wet);
            #include <colorspace_fragment>
            return;
          }
          // The sheet of water: thin and clear, a little brighter where it is thinnest, foam along its edge
          float depth = edge - vA;
          float breakup = 0.55 + 0.45 * sin(vS * 1.9 + hash1(floor(vS * 0.7)) * 6.0 + uTime * 0.7);
          float foam = smoothstep(0.45, 0.05, depth) * breakup + smoothstep(1.2, 0.0, depth) * 0.3 * (ph < 0.3 ? 1.0 : 0.35);
          vec3 col = mix(uShallow * 1.15, uFoam, clamp(foam, 0.0, 1.0));
          float alpha = mix(0.58, 1.0, clamp(foam, 0.0, 1.0)) * fadeIn;
          vec3 glow = waterGlow(vW, clamp(foam, 0.0, 1.0)); // the foam glows blue at night
          gl_FragColor = vec4(col * uTint + glow, alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.lastHit = 0;
  }

  // Where (x, z) sits on the strip: { s (along the coast), d (up the beach), edge } or null if off the beach
  at(x, z, t) {
    const sd = coastSD(x, z);
    if (sd < IN || sd > OUT) return null;
    let best = 1e9, bi = 0;
    for (let i = 0; i < this.P.length; i += 2) { const p = this.P[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = i; } }
    const s = this.P[bi].s;
    return { s, d: sd, ...edgeAt(s, t) };
  }
}
