import * as THREE from 'three';

// One shading recipe for the whole island, in place of the standard lit materials:
// - lit side: the base color times the sun color
// - shadow side and cast shadows: the base color times a tinted shadow color (never gray)
// - undersides near the ground pick up a little of the ground color (light bouncing off it)
// Every MeshStandardMaterial and MeshLambertMaterial in the scene is patched by `applyShading(scene)`.

export const SHADE = {
  uLightColor: { value: new THREE.Color('#fff6e8') },
  uLightIntensity: { value: 1.08 },
  uShadowColor: { value: new THREE.Color('#9189d2') },
  uCoreLow: { value: -0.15 }, // dot(normal, sun) below this is fully in shadow
  uCoreHigh: { value: 0.25 }, // above this is fully lit
  uBounceStrength: { value: 0.45 },
  uBounceDistance: { value: 2.2 },
  uGround: { value: null }, // ground color texture (set by setGroundTexture)
  uGroundExtent: { value: 1 },
};

export function setGroundTexture(tex, extent) {
  SHADE.uGround.value = tex;
  SHADE.uGroundExtent.value = extent;
}

const VERT_PARS = /* glsl */ `
varying vec3 vShadeWorld;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 sw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    sw = instanceMatrix * sw;
  #endif
  vShadeWorld = ( modelMatrix * sw ).xyz;
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vShadeWorld;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uShadowColor;
uniform float uCoreLow;
uniform float uCoreHigh;
uniform float uBounceStrength;
uniform float uBounceDistance;
uniform sampler2D uGround;
uniform float uGroundExtent;
#ifdef SHADE_EXTRA
  varying float vShadeExtra; // extra shadow from the mesh itself (grass blades darken toward the root)
#endif
`;
const FRAG_MAIN = /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec3 col = base;
  vec3 nW = normalize( inverseTransformDirection( normal, viewMatrix ) );

  // Light bounced up from the ground onto undersides
  float facingDown = smoothstep( 0.0, 0.8, dot( nW, vec3( 0.0, -1.0, 0.0 ) ) );
  float nearGround = pow( max( 0.0, ( uBounceDistance - max( 0.0, vShadeWorld.y - 0.8 ) ) / uBounceDistance ), 2.0 );
  vec3 ground = texture2D( uGround, ( vShadeWorld.xz + uGroundExtent ) / ( 2.0 * uGroundExtent ) ).rgb;
  col = mix( col, ground, facingDown * nearGround * uBounceStrength );

  col *= uLightColor * uLightIntensity;

  float core = 0.0;
  float dropShadow = 0.0;
  #if NUM_DIR_LIGHTS > 0
    core = 1.0 - smoothstep( uCoreLow, uCoreHigh, dot( normal, directionalLights[ 0 ].direction ) );
  #endif
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    if ( receiveShadow ) {
      DirectionalLightShadow dls = directionalLightShadows[ 0 ];
      dropShadow = 1.0 - getShadow( directionalShadowMap[ 0 ], dls.shadowMapSize, 1.0, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[ 0 ] );
    }
  #endif
  float shade = max( core, dropShadow );
  #ifdef SHADE_EXTRA
    shade = max( shade, vShadeExtra );
  #endif
  col = mix( col, base * uShadowColor, clamp( shade, 0.0, 1.0 ) );
  outgoingLight = col + totalEmissiveRadiance;
}
`;

// Patch one material. `extra` adds a per-vertex shadow varying (vShadeExtra) the vertex shader must write.
export function shade(material, { extra = false } = {}) {
  if (material.userData.shaded) return material;
  material.userData.shaded = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, SHADE);
    if (extra) sh.defines = { ...(sh.defines || {}), SHADE_EXTRA: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <opaque_fragment>', FRAG_MAIN + '\n#include <opaque_fragment>');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + (extra ? '|shade+' : '|shade');
  material.needsUpdate = true;
  return material;
}

// Patch every lit material in the scene (run once after everything is built; new materials can call shade()).
export function applyShading(scene) {
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.isMeshStandardMaterial || m.isMeshLambertMaterial) shade(m);
    }
  });
}
