import * as THREE from 'three';

// Tire tracks for the grass. A small map of the ground around the car, drawn on the GPU: each frame the
// last map is copied in (shifted as the car moves, and faded a little so the grass grows back over about
// a minute), then one soft strip per wheel is drawn from where the wheel was to where it is now. The grass
// reads the map and lowers its blades. Tracks sit exactly behind each wheel, tire wide, with soft edges.

const AREA = 64; // map covers AREA x AREA units around the car
const RES = 512; // texels across (0.125 units each)
const REGROW = 55; // seconds for a full-strength track to fade away
const WHEEL_W = 0.62; // track width

export class Tracks {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.targets = [new THREE.WebGLRenderTarget(RES, RES, opts), new THREE.WebGLRenderTarget(RES, RES, opts)];
    this.current = 0;
    this.center = new THREE.Vector2(); // world xz the map is centered on (snapped to texels)
    this.uniforms = { uTracks: { value: this.targets[0].texture }, uTrackCenter: { value: this.center }, uTrackArea: { value: AREA } };
    this.last = []; // each wheel's previous ground position
    this.started = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-AREA / 2, AREA / 2, AREA / 2, -AREA / 2, -10, 10);
    // camera looks straight down; map x = world x, map y = world -z
    this.camera.position.set(0, 1, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    // Copy pass: the previous map, shifted by how far the center moved, faded a little
    this.copy = new THREE.Mesh(
      new THREE.PlaneGeometry(AREA, AREA).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { uPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uFade: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: `uniform sampler2D uPrev; uniform vec2 uShift; uniform float uFade; varying vec2 vUv;
          void main() {
            vec2 uv = vUv + uShift;
            float inside = step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 );
            float v = texture2D( uPrev, uv ).r * inside;
            gl_FragColor = vec4( max( v - uFade, 0.0 ), 0.0, 0.0, 1.0 );
          }`,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
    this.copy.renderOrder = 0;
    this.scene.add(this.copy);

    // One strip per wheel, kept at the highest value where strips overlap
    this.stripMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `varying vec2 vUv;
        void main() {
          float across = abs( vUv.y - 0.5 ) * 2.0;
          gl_FragColor = vec4( 1.0 - smoothstep( 0.45, 1.0, across ), 0.0, 0.0, 1.0 );
        }`,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide, // strips can wind either way depending on the direction of travel
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.strips = [];
  }

  strip(i) {
    if (!this.strips[i]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      const m = new THREE.Mesh(geo, this.stripMat);
      m.frustumCulled = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this.strips[i] = m;
    }
    return this.strips[i];
  }

  // Place a wheel's strip from a to b (world xz), relative to the map center; a little longer than the
  // step so consecutive strips join without gaps
  setStrip(m, a, b) {
    const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz) || 1e-4;
    const ux = dx / len, uz = dz / len, px = -uz * WHEEL_W / 2, pz = ux * WHEEL_W / 2, ext = 0.08;
    const ax = a.x - ux * ext - this.center.x, az = a.y - uz * ext - this.center.y;
    const bx = b.x + ux * ext - this.center.x, bz = b.y + uz * ext - this.center.y;
    const p = m.geometry.attributes.position;
    p.setXYZ(0, ax + px, 0, az + pz); p.setXYZ(1, ax - px, 0, az - pz);
    p.setXYZ(2, bx + px, 0, bz + pz); p.setXYZ(3, bx - px, 0, bz - pz);
    p.needsUpdate = true;
    m.visible = true;
  }

  // wheels: objects with .position (world); grounded: whether the car is on the ground
  update(dt, carPos, wheels, grounded) {
    const texel = AREA / RES;
    const nx = Math.round(carPos.x / texel) * texel, nz = Math.round(carPos.z / texel) * texel;
    const shift = new THREE.Vector2(nx - this.center.x, -(nz - this.center.y)).divideScalar(AREA);
    if (!this.started) shift.set(10, 10); // first frame: start from an empty map
    this.center.set(nx, nz);

    const read = this.targets[this.current], write = this.targets[1 - this.current];
    const cm = this.copy.material.uniforms;
    cm.uPrev.value = read.texture;
    cm.uShift.value.copy(shift);
    cm.uFade.value = dt / REGROW;

    wheels.forEach((w, i) => {
      const m = this.strip(i);
      const now = new THREE.Vector2(w.position.x, w.position.z);
      const prev = this.last[i];
      if (grounded && prev && prev.distanceTo(now) < 3) this.setStrip(m, prev, now);
      else m.visible = false;
      this.last[i] = now;
    });

    const r = this.renderer, oldTarget = r.getRenderTarget(), oldAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(write);
    r.render(this.scene, this.camera);
    r.setRenderTarget(oldTarget);
    r.autoClear = oldAuto;
    this.current = 1 - this.current;
    this.uniforms.uTracks.value = write.texture;
    this.started = true;
  }
}

// GLSL for the grass: how flattened the grass is at world xz (0 to 1)
export const TRACKS_GLSL = `
  uniform sampler2D uTracks; uniform vec2 uTrackCenter; uniform float uTrackArea;
  float trackAt( vec2 wp ) {
    vec2 uv = vec2( wp.x - uTrackCenter.x, uTrackCenter.y - wp.y ) / uTrackArea + 0.5;
    if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
    return texture2D( uTracks, uv ).r;
  }
`;
