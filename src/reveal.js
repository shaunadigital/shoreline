import * as THREE from 'three';

// The opening (Shauna's pick, 2026-10-30, option 2 "the island grows from the car"): while the game loads,
// a dark sea with a ring that fills; once loaded, only a circle of the landing around the car is lit, with
// "Start" drawn in the sand; on start the island spreads outward from the car in a widening ring of light.
//
// Every material in the scene is patched to drop anything outside the circle (uRevealRadius around
// uRevealCenter), with a dithered soft edge. The sky and fog are pulled toward the dark sea colour until
// the circle has grown past the view. Once the island is fully shown the radius is huge and nothing is cut.

export const REVEAL = {
  uRevealCenter: { value: new THREE.Vector2() },
  uRevealRadius: { value: 1e5 },
  uRevealSoft: { value: 1.6 },
};
export const DARK = new THREE.Color('#0b1a2c'); // the sea in the dark, matches the loading screen

const VERT = /* glsl */ `
  {
    vec4 rw = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      rw = instanceMatrix * rw;
    #endif
    vRevealW = ( modelMatrix * rw ).xyz;
  }`;
export const REVEAL_FRAG = /* glsl */ `
  {
    float rd = distance( vRevealW.xz, uRevealCenter );
    if ( rd > uRevealRadius ) discard;
    float edge = smoothstep( uRevealRadius - uRevealSoft, uRevealRadius, rd );
    if ( edge > 0.0 ) {
      vec2 p = mod( floor( gl_FragCoord.xy ), 4.0 );
      float bayer = mod( p.x * 2.0 + p.y * 3.0 + floor( p.y * 0.5 ) * 5.0, 4.0 ) / 4.0 + mod( p.y, 2.0 ) * 0.125;
      if ( edge > bayer ) discard;
    }
  }`;
export const REVEAL_PARS = 'uniform vec2 uRevealCenter; uniform float uRevealRadius; uniform float uRevealSoft; varying vec3 vRevealW;';

// Patch one built-in material (standard, lambert, basic, depth...) to respect the circle
export function patchReveal(m) {
  if (!m || m.userData.reveal || m.isShaderMaterial || m.isSpriteMaterial || m.isLineBasicMaterial || m.isPointsMaterial) return;
  m.userData.reveal = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, REVEAL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + REVEAL_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + REVEAL_FRAG);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|reveal';
  m.needsUpdate = true;
}

export function patchScene(scene) {
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) patchReveal(m);
    if (o.customDepthMaterial) patchReveal(o.customDepthMaterial);
  });
}

// The ring of light at the circle's edge, and the "Start" written in the sand
export class Opening {
  constructor(scene, center, radius, toCamera) {
    this.scene = scene;
    this.center = center.clone();
    this.radius = radius;
    REVEAL.uRevealCenter.value.set(center.x, center.z);
    REVEAL.uRevealRadius.value = radius;
    // Glowing ring on the ground
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffe3a3', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.ringMat.userData.reveal = true; // never cut by the circle itself
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.set(center.x, center.y + 0.08, center.z);
    this.ring.renderOrder = 10;
    scene.add(this.ring);
    // A soft pool of light filling the circle
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,210,0.35)'); grad.addColorStop(0.75, 'rgba(255,220,170,0.12)'); grad.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    this.poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.poolMat.userData.reveal = true;
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.poolMat);
    this.pool.position.copy(this.ring.position);
    scene.add(this.pool);
    this.word = this.sandWord(toCamera);
    this.state = 'waiting';
    this.t = 0;
    this.layout();
  }

  // "Start" pressed into the sand just behind the car, turned to read upright from the camera
  sandWord(toCamera) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 200;
    const g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '400 132px "Shrikhand", Georgia, serif';
    g.fillStyle = 'rgba(255,248,230,0.55)'; g.fillText('Start', 256, 98); // lit rim of the groove
    g.fillStyle = 'rgba(115,62,24,0.88)'; g.fillText('Start', 252, 92); // the groove
    g.font = '700 28px "DM Sans", sans-serif'; g.fillStyle = 'rgba(105,58,22,0.85)';
    g.fillText('click, tap or press any key', 256, 178);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.03).rotateX(-Math.PI / 2), mat);
    const d = toCamera.clone().setY(0).normalize(); // toward the camera
    m.rotation.y = Math.atan2(d.x, d.z);
    m.position.copy(this.center).addScaledVector(d, 3.3).setY(this.center.y + 0.06);
    m.renderOrder = 9;
    this.scene.add(m);
    return m;
  }

  layout() {
    const r = REVEAL.uRevealRadius.value;
    this.ring.scale.setScalar(r);
    this.pool.scale.setScalar(r * 1.05);
  }

  // Start the spread: the circle grows from the car until the whole island shows
  go() {
    if (this.state !== 'waiting') return;
    this.state = 'growing';
    this.t = 0;
  }

  // Returns how dark the sky should still be (1 = the dark sea, 0 = normal)
  update(dt, time) {
    if (this.state === 'done') return 0;
    if (this.state === 'waiting') {
      this.ringMat.opacity = 0.55 + 0.25 * Math.sin(time * 2.4);
      return 1;
    }
    this.t += dt;
    const k = Math.min(1, this.t / 2.6), e = k * k * k; // eases in: slow at first, then rushing out
    REVEAL.uRevealRadius.value = this.radius + e * 230;
    REVEAL.uRevealSoft.value = 1.6 + e * 10;
    this.layout();
    this.ringMat.opacity = 0.9 * (1 - k * 0.6);
    this.poolMat.opacity = 1 - k;
    this.word.material.opacity = Math.max(0, 1 - this.t * 2.5);
    if (k >= 1) {
      this.state = 'done';
      REVEAL.uRevealRadius.value = 1e5;
      for (const o of [this.ring, this.pool, this.word]) { this.scene.remove(o); o.material.dispose(); o.geometry.dispose(); }
      return 0;
    }
    return 1 - THREE.MathUtils.smoothstep(REVEAL.uRevealRadius.value, this.radius + 10, 90);
  }
}
