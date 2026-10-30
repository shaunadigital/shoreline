import * as THREE from 'three';

// One shading recipe for the whole island, in place of the standard lit materials:
// - lit side: the base color times the sun color
// - shadow side and cast shadows: the base color times a tinted shadow color (never gray)
// - undersides near the ground pick up a little of the ground color (light bouncing off it)
// Every MeshStandardMaterial and MeshLambertMaterial in the scene is patched by `applyShading(scene)`.

export const SHADE = {
  uLightColor: { value: new THREE.Color('#ffe4d2') }, // warm sun
  uLightIntensity: { value: 1.2 },
  uShadowColor: { value: new THREE.Color('#7650e6') }, // deep purple shadows, toward the reference's
  uCoreLow: { value: -0.25 }, // dot(normal, sun) at or below this is fully in shadow
  uCoreHigh: { value: 1.0 }, // facing the sun is fully lit; in between ramps softly, so shapes read as round
  uBounceStrength: { value: 0.45 },
  uBounceDistance: { value: 1.4 },
  // See-through: leaves and palms between the camera and the car fade out around it (screen position in pixels)
  uCarScreen: { value: new THREE.Vector2(-9999, -9999) },
  uCarDepth: { value: 0 },
  uSeeInner: { value: 60 },
  uSeeOuter: { value: 280 },
  uGround: { value: null }, // ground color texture (set by setGroundTexture)
  uGroundExtent: { value: 1 },
  uRim: { value: 0.5 }, // strength of the edge light on props and the car
  uHeightMap: { value: null }, // ground height (grass.js map, green channel), for the contact shading at the foot of props
};

// Tell the see-through effect where the car is on screen (call every frame)
const _v = new THREE.Vector3();
export function setSeeThrough(carPos, camera, renderer) {
  _v.copy(carPos).applyMatrix4(camera.matrixWorldInverse);
  SHADE.uCarDepth.value = -_v.z;
  _v.copy(carPos).project(camera);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  SHADE.uCarScreen.value.set((_v.x * 0.5 + 0.5) * size.x, (_v.y * 0.5 + 0.5) * size.y);
  // Edges in screen heights, as in the reference (3 and 15 over the camera distance), a little tighter
  const dist = camera.position.distanceTo(carPos);
  SHADE.uSeeInner.value = (3 / dist) * size.y;
  SHADE.uSeeOuter.value = (12 / dist) * size.y;
}

export function setGroundTexture(tex, extent, heights = null) {
  SHADE.uGround.value = tex;
  SHADE.uHeightMap.value = heights;
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
uniform sampler2D uHeightMap;
uniform float uRim;
uniform vec2 uCarScreen;
uniform float uCarDepth;
uniform float uSeeInner;
uniform float uSeeOuter;
#ifdef SHADE_EXTRA
  varying float vShadeExtra; // extra shadow from the mesh itself (grass blades darken toward the root)
#endif
`;
const SEE_THROUGH = /* glsl */ `
{
  // In front of the car and near it on screen: thin out with a dither pattern, fully open close to the car
  if ( -vViewPosition.z < uCarDepth - 1.5 ) {
    float keep = smoothstep( uSeeInner, uSeeOuter, distance( gl_FragCoord.xy, uCarScreen ) );
    vec2 p = mod( floor( gl_FragCoord.xy ), 4.0 );
    float bayer = mod( p.x * 2.0 + p.y * 3.0 + floor( p.y * 0.5 ) * 5.0, 4.0 ) / 4.0 + mod( p.y, 2.0 ) * 0.125;
    if ( keep < 0.999 && keep <= bayer ) discard;
  }
}
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
  #ifdef SHADE_AO
    // Contact shading: props darken toward where they meet the ground, so they sit in it (2026-10-30)
    float groundY = texture2D( uHeightMap, ( vShadeWorld.xz + uGroundExtent ) / ( 2.0 * uGroundExtent ) ).g * 3.5 - 0.5;
    shade = max( shade, ( 1.0 - smoothstep( 0.0, 1.1, vShadeWorld.y - groundY ) ) * 0.5 * ( 1.0 - smoothstep( 0.5, 0.9, nW.y ) ) ); // sides only: flat ground pieces (road, paths, lanes) stay as they are
  #endif
  col = mix( col, base * uShadowColor, clamp( shade, 0.0, 1.0 ) );
  #if defined( SHADE_AO ) && NUM_DIR_LIGHTS > 0
    // Edge light (2026-10-30): faces turned away from the camera but toward the sun catch a bright rim,
    // so bevels and the outlines of props and the car read clearly against the ground
    {
      float rim = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 2.2 );
      float sunSide = smoothstep( 0.0, 0.6, dot( normal, directionalLights[ 0 ].direction ) );
      col += base * uLightColor * uLightIntensity * rim * sunSide * ( 1.0 - clamp( shade, 0.0, 1.0 ) ) * uRim;
    }
  #endif
  outgoingLight = col + totalEmissiveRadiance;
}
`;

// Patch one material. `extra` adds a per-vertex shadow varying (vShadeExtra) the vertex shader must write.
export function shade(material, { extra = false, seeThrough = false } = {}) {
  if (material.userData.shaded) return material;
  material.userData.shaded = true;
  const ao = !material.userData.noAO && !extra; // ground-level things (terrain, grass, litter, leaves) opt out
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    prev?.call(material, sh, renderer);
    Object.assign(sh.uniforms, SHADE);
    if (extra) sh.defines = { ...(sh.defines || {}), SHADE_EXTRA: '' };
    if (ao) sh.defines = { ...(sh.defines || {}), SHADE_AO: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <opaque_fragment>', FRAG_MAIN + '\n#include <opaque_fragment>');
    if (seeThrough) sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + SEE_THROUGH);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|shade' + (extra ? '+extra' : '') + (seeThrough ? '+see' : '') + (ao ? '+ao' : '');
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
