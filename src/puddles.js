import * as THREE from 'three';
import PUDDLE_GLSL from './shaders/puddles.glsl?raw';

// Puddles after rain (2026-11-11). The shader is src/shaders/puddles.glsl; this file holds its uniforms,
// patches a material with it (the road and the sand paths; the terrain calls the shader itself so it can
// keep puddles off the grass) and updates them each frame from the weather and the sky.
// `?puddles` in the address soaks the ground at once (to look at them without waiting for rain).

export const PUDDLES = {
  uPuddleWet: { value: 0 },
  uPuddleRain: { value: 0 },
  uPuddleSky: { value: new THREE.Color('#a6d8f7') },
  uPuddleTime: { value: 0 },
};
export { PUDDLE_GLSL };
const FORCE = new URLSearchParams(location.search).has('puddles');

export const PUDDLE_VERT_PARS = 'varying vec3 vPuddleW; varying float vPuddleUp;';
export const PUDDLE_VERT = 'vPuddleW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vPuddleUp = normalize( mat3( modelMatrix ) * normal ).y;';

// amount: how readily puddles form on this surface (1 the road, less on loose sand)
export function addPuddles(material, amount = 1) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, PUDDLES);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PUDDLE_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PUDDLE_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PUDDLE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>\napplyPuddle( diffuseColor.rgb, ${amount.toFixed(2)} );`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|puddles' + amount;
  return material;
}

export function updatePuddles(t, wet, rain, sky) {
  PUDDLES.uPuddleWet.value = FORCE ? 1 : wet;
  PUDDLES.uPuddleRain.value = FORCE ? Math.max(rain, 0.6) : rain;
  PUDDLES.uPuddleSky.value.copy(sky);
  PUDDLES.uPuddleTime.value = t;
}
