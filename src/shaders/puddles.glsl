// Puddles after rain (2026-11-11), on the open ground, the sand paths and the road.
//
// Where they form: a slow noise over the ground in world space, low spots first. As the ground gets wet
// (uPuddleWet, from weather.js) the waterline in that noise rises and puddles spread; as it dries it
// sinks, so the puddles shrink back to their deepest middles and vanish.
// What they show: the ground darkens toward its wet color, then a mirror-like film reflects the sky
// color, stronger at a low viewing angle (Fresnel). While it rains, drops land in them: each small cell
// of the puddle gets a ring that grows and fades at its own time.

uniform float uPuddleWet;   // 0 dry to 1 soaked
uniform float uPuddleRain;  // 0 to 1, rain falling now
uniform vec3 uPuddleSky;    // the sky color to reflect
uniform float uPuddleTime;
varying vec3 vPuddleW;
varying float vPuddleUp;    // how much the surface faces up (no puddles on walls)

float puddleHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float puddleNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( puddleHash( i ), puddleHash( i + vec2( 1, 0 ) ), f.x ), mix( puddleHash( i + vec2( 0, 1 ) ), puddleHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}

// 0 to 1: how much puddle covers this point (amount scales it: less on grassy ground)
float puddleMask( vec2 xz, float amount ) {
  if ( uPuddleWet <= 0.02 || amount <= 0.0 ) return 0.0;
  float n = puddleNoise( xz * 0.16 ) * 0.65 + puddleNoise( xz * 0.45 + 3.1 ) * 0.35;
  float level = 1.0 - uPuddleWet * 0.5 * amount; // the waterline in the noise
  return smoothstep( level, level + 0.035, n );
}

vec3 rainRings( vec2 xz, float t ) {
  vec2 cell = floor( xz * 1.6 ), f = fract( xz * 1.6 ) - 0.5;
  float h = puddleHash( cell );
  vec2 c = ( vec2( puddleHash( cell + 2.3 ), puddleHash( cell + 5.7 ) ) - 0.5 ) * 0.5;
  float life = fract( t * ( 0.9 + h * 0.6 ) + h * 7.0 );
  float r = life * 0.42;
  float ring = smoothstep( 0.04, 0.0, abs( length( f - c ) - r ) ) * ( 1.0 - life );
  return vec3( ring );
}

void applyPuddle( inout vec3 color, float amount ) {
  float m = puddleMask( vPuddleW.xz, amount ) * smoothstep( 0.85, 0.97, vPuddleUp );
  if ( m <= 0.0 ) return;
  vec3 v = normalize( cameraPosition - vPuddleW );
  float fresnel = 0.3 + 0.5 * pow( 1.0 - max( v.y, 0.0 ), 2.0 );
  vec3 wet = color * 0.5;
  vec3 film = mix( wet, uPuddleSky, fresnel );
  film += rainRings( vPuddleW.xz, uPuddleTime ) * uPuddleRain * 0.35;
  color = mix( color, film, m );
}
