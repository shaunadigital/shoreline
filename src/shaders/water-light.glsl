// Light on the water surface (2026-11-11), used by the water shader in terrain.js and the surf in surf.js.
//
// Sun glints: tiny ripples tilt the surface in every direction; wherever one tilts just right to bounce
// the sun into the camera, it flashes. The ripple normal comes from two layers of moving waves, and the
// glint is the classic half-vector test (the normal close to halfway between the sun and the camera),
// cut off very sharp so only a scatter of points light up. As the camera orbits, a different set lines up,
// so the sparkles move with the view.
//
// Night glow: the sea's own light (bioluminescence). Foam glows a soft blue at night, and where the car
// drives or splashes through the water, glowing rings spread out and fade (points sent from main.js).

uniform vec3 uSunDir;        // toward the sun
uniform float uGlint;        // 0 none to 1 midday
uniform vec3 uGlintColor;
uniform float uGlowNight;    // 0 by day to 1 at night
uniform vec3 uGlowColor;
uniform vec3 uGlowPts[ 12 ]; // x, z, start time of each splash of light
uniform float uGlowTime;
uniform float uMist;         // sea mist far out, 0 to 1
uniform vec3 uMistColor;

float sunGlint( vec3 w, float t ) {
  if ( uGlint <= 0.0 ) return 0.0;
  vec2 p = w.xz;
  // Ripple slopes: a few crossing waves, moving
  float sx = sin( p.x * 4.1 + p.y * 1.3 + t * 2.3 ) + 0.6 * sin( p.x * 7.3 - p.y * 5.1 - t * 3.1 ) + 0.4 * sin( p.y * 11.0 + t * 4.0 );
  float sz = cos( p.y * 3.7 - p.x * 1.9 + t * 1.9 ) + 0.6 * cos( p.y * 6.9 + p.x * 4.7 + t * 2.7 ) + 0.4 * cos( p.x * 10.3 - t * 3.6 );
  vec3 n = normalize( vec3( sx * 0.32, 1.0, sz * 0.32 ) );
  vec3 v = normalize( cameraPosition - w );
  vec3 h = normalize( v + uSunDir );
  float g = smoothstep( 0.9965, 0.9995, dot( n, h ) );
  return g * uGlint;
}

vec3 waterGlow( vec3 w, float foam ) {
  if ( uGlowNight <= 0.01 ) return vec3( 0.0 );
  float glow = foam * 0.5;
  for ( int i = 0; i < 12; i++ ) {
    vec3 g = uGlowPts[ i ];
    float age = uGlowTime - g.z;
    if ( age < 0.0 || age > 3.5 ) continue;
    float d = distance( w.xz, g.xy );
    float r = 0.6 + age * 1.6;                                      // the ring spreads
    float ring = smoothstep( 0.4, 0.0, abs( d - r ) ) * 0.45 + smoothstep( r, 0.0, d ) * 0.1;
    glow += ring * exp( -age * 1.1 );
  }
  return uGlowColor * min( glow, 1.2 ) * uGlowNight; // capped, so overlapping rings do not pile into a blob
}

// Sea mist (2026-11-12): a soft pale haze over the open sea far from the shore, drifting in thin patches,
// so the island seems to float. off: distance out from the shore.
vec3 seaMist( vec3 col, vec2 xz, float off, float t ) {
  if ( uMist <= 0.0 ) return col;
  float drift = 0.7 + 0.3 * sin( xz.x * 0.05 + t * 0.15 ) * sin( xz.y * 0.07 - t * 0.11 );
  return mix( col, uMistColor, smoothstep( 9.0, 36.0, off ) * 0.72 * drift * uMist );
}

// Stars in the water at night (2026-11-12): the sky the camera never sees, reflected on calm open water.
// One possible star per small cell of the sea, most cells empty, each twinkling at its own pace.
float seaStars( vec2 xz, float off, float t ) {
  if ( uGlowNight <= 0.01 || off < 3.0 ) return 0.0;
  vec2 cell = floor( xz * 1.4 ), f = fract( xz * 1.4 );
  float h = fract( sin( dot( cell, vec2( 41.3, 289.1 ) ) ) * 43758.5453 );
  if ( h < 0.975 ) return 0.0;
  vec2 c = vec2( fract( h * 17.0 ), fract( h * 31.0 ) ) * 0.6 + 0.2;
  float d = length( f - c );
  float tw = 0.55 + 0.45 * sin( t * ( 1.5 + h * 3.0 ) + h * 60.0 );
  return smoothstep( 0.09, 0.0, d ) * tw * uGlowNight * smoothstep( 3.0, 8.0, off );
}
