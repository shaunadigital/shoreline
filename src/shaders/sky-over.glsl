// What the sky casts on the island (2026-11-12): cloud shadows, plus the mist and stars on the sea.
//
// Cloud shadows: big soft patches of shade that drift across land and sea with the wind. A slow two-octave
// noise in world space moves along the wind; where it rises past the cloud cover, the ground falls into
// shade. The cover thickens in rain. Used by the shading recipe (every lit material) and the water.

uniform float uCloudTime;
uniform vec2 uCloudDir;
uniform float uCloudCover;    // 0 clear to 1 overcast
uniform float uCloudStrength; // how dark the shade is (less at night)

float cloudHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cloudNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cloudHash( i ), cloudHash( i + vec2( 1, 0 ) ), f.x ), mix( cloudHash( i + vec2( 0, 1 ) ), cloudHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}

// 0 in the sun to 1 under the middle of a cloud
float cloudShadow( vec2 xz ) {
  if ( uCloudStrength <= 0.0 ) return 0.0;
  vec2 p = xz * 0.026 - uCloudDir * uCloudTime * 0.03;
  float n = cloudNoise( p ) * 0.65 + cloudNoise( p * 2.3 + 4.1 ) * 0.35;
  float edge = 0.7 - uCloudCover * 0.33; // about a third of the sky in cloud on a fair day
  return smoothstep( edge - 0.08, edge + 0.1, n ) * uCloudStrength;
}
