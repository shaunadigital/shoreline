import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The finishing passes over the rendered frame (Shauna's call, 2026-10-30: light and color toward the
// reference): a glow round anything brighter than white (torch flames and the lighthouse at night), a
// tilt-shift blur that softens the top and bottom of the screen like a miniature, and a light warm grade
// with a gentle vignette. `?nofx` in the address turns them all off.

// Blur that grows away from a band across the middle of the screen, one direction per pass
const TiltShift = (dir) => ({
  uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.16 }, uAmount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uStep; uniform float uFocus; uniform float uBand; uniform float uAmount;
    varying vec2 vUv;
    void main() {
      float d = smoothstep( uBand, 0.5, abs( vUv.y - uFocus ) ) * uAmount;
      vec4 sum = vec4( 0.0 );
      float w[5]; w[0] = 0.227; w[1] = 0.195; w[2] = 0.122; w[3] = 0.054; w[4] = 0.016;
      sum += texture2D( tDiffuse, vUv ) * w[0];
      for ( int i = 1; i < 5; i++ ) {
        vec2 o = uStep * ${dir} * float( i ) * d * 2.2;
        sum += texture2D( tDiffuse, vUv + o ) * w[i];
        sum += texture2D( tDiffuse, vUv - o ) * w[i];
      }
      gl_FragColor = sum;
    }`,
});

const Grade = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.06 }, uSat: { value: 1.08 }, uVignette: { value: 0.22 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uWarm; uniform float uSat; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float l = dot( c.rgb, vec3( 0.299, 0.587, 0.114 ) );
      c.rgb = mix( vec3( l ), c.rgb, uSat );
      c.rgb += vec3( 1.0, 0.45, 0.1 ) * uWarm * smoothstep( 0.2, 0.9, l ); // warm the lit side
      c.rgb += vec3( 0.25, 0.05, 0.45 ) * uWarm * 0.6 * ( 1.0 - smoothstep( 0.0, 0.35, l ) ); // purple in the darks
      vec2 v = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep( 0.35, 0.85, length( v * vec2( 1.0, 1.25 ) ) );
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.enabled = !new URLSearchParams(location.search).has('nofx');
    if (!this.enabled) return;
    const small = Math.min(innerWidth, innerHeight) < 600;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.9, 0.6, 1.05); // only brighter than white
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(TiltShift('vec2( 1.0, 0.0 )'));
    this.tiltV = new ShaderPass(TiltShift('vec2( 0.0, 1.0 )'));
    if (small) { this.tiltH.uniforms.uBand.value = this.tiltV.uniforms.uBand.value = 0.22; }
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize() {
    if (!this.enabled) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth / 2, innerHeight / 2);
    const w = innerWidth * pr, h = innerHeight * pr;
    this.tiltH.uniforms.uStep.value.set(1 / w, 0);
    this.tiltV.uniforms.uStep.value.set(0, 1 / h);
    // Blur scales with the screen, so it looks the same at any size
    this.tiltH.uniforms.uStep.value.multiplyScalar(h / 900);
    this.tiltV.uniforms.uStep.value.multiplyScalar(h / 900);
  }

  // night: 0 by day to 1 at night (a stronger glow at night)
  render(scene, camera, night = 0) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.bloom.strength = 0.5 + 0.8 * night;
    this.grade.uniforms.uWarm.value = 0.06 * (1 - night * 0.7);
    this.composer.render();
  }
}
