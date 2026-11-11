// Boost speed blur: a full-screen pass over the finished frame while the car boosts.
//
// - Radial blur: each pixel averages samples taken back toward the car on screen, so the edges of the
//   view streak outward and the car itself stays sharp.
// - Color split: red and blue are read slightly apart at the edges, like a lens at speed.
// - Speed lines: thin bright streaks rush outward from the car, at the edges only. The view is cut into
//   thin wedges by angle; a few random wedges carry a streak that slides outward over time.
//
// uAmount (0 to 1) comes from post.js and is 0 unless boosting, so the pass is switched off the rest of
// the time and costs nothing.

uniform sampler2D tDiffuse;
uniform float uAmount;
uniform vec2 uCenter;   // the car on screen, 0 to 1
uniform float uAspect;  // width / height
uniform float uTime;
varying vec2 vUv;

float speedHash( float n ) { return fract( sin( n * 91.3458 ) * 47453.5453 ); }

void main() {
  vec2 dir = vUv - uCenter;
  vec2 wide = dir * vec2( uAspect, 1.0 );
  float dist = length( wide );
  float edge = smoothstep( 0.22, 0.85, dist ) * uAmount; // the middle stays sharp

  // Radial blur toward the car. The samples start at a random offset per pixel, which turns the steps
  // between them into a fine grain the eye reads as smooth.
  float jitter = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  vec3 sum = vec3( 0.0 );
  float wsum = 0.0;
  for ( int i = 0; i < 10; i++ ) {
    float s = ( float( i ) + jitter ) / 10.0;
    float w = 1.0 - s * 0.6;
    sum += texture2D( tDiffuse, vUv - dir * s * 0.04 * edge ).rgb * w;
    wsum += w;
  }
  vec3 col = sum / wsum;

  // Color split at the edges
  vec2 ca = dir * 0.005 * edge;
  col.r = mix( col.r, texture2D( tDiffuse, vUv + ca ).r, edge );
  col.b = mix( col.b, texture2D( tDiffuse, vUv - ca ).b, edge );

  // Speed lines
  float angle = atan( wide.y, wide.x ) / 6.2831 + 0.5;
  float wedge = floor( angle * 180.0 );
  float pick = speedHash( wedge );
  if ( pick > 0.86 ) {
    float across = abs( fract( angle * 180.0 ) - 0.5 ) * 2.0;      // 0 in the middle of the wedge
    float along = fract( dist * 1.4 - uTime * ( 2.2 + pick * 2.0 ) + pick * 13.0 );
    float streak = smoothstep( 0.35, 0.0, across ) * smoothstep( 0.0, 0.08, along ) * smoothstep( 0.45, 0.1, along );
    col += vec3( 1.0, 0.97, 0.9 ) * streak * edge * edge * 0.4;
  }

  gl_FragColor = vec4( col, 1.0 );
}
