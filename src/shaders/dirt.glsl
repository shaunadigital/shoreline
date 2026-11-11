// Dirt on the car: sand and mud that build up from the bottom of the car as it drives off the road and
// wash off in the pools and the rain (amount, color and wetness come from src/dirt.js each frame).
//
// Where the dirt sits is worked out per pixel from two positions:
// - the car-local height (vDirtCar.y), so dirt climbs from the bottom of the tires up the fenders and
//   body as the amount grows, the way a real car gets dirty;
// - the part's own position (vDirtObj), for the blotchy noise, so the pattern stays stuck to each part,
//   and turns with the wheels instead of swimming over them.
// Spatters of small specks reach above the main line. Upward-facing panels gather a little dust too.
// Dirty paint loses its shine (shadeDirt also dims the gloss in shading.js); fresh mud is darker and
// keeps a wet sheen.

uniform float uDirt;       // 0 clean to 1 caked
uniform vec3 uDirtColor;   // follows the ground the car has been on
uniform float uDirtWet;    // 0 dry to 1 just out of the water
uniform vec2 uDirtRange;   // car-local height of the bottom of the tires and the top of the cage
varying vec3 vDirtCar;
varying vec3 vDirtObj;
varying vec3 vDirtUp;      // the surface normal in car space
float shadeDirt = 0.0;     // read by the gloss in shading.js

float dirtHash( vec3 p ) {
  p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
  p += dot( p, p.yxz + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}

// Smooth value noise in 3D
float dirtNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( dirtHash( i ), dirtHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( dirtHash( i + vec3( 0, 1, 0 ) ), dirtHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( dirtHash( i + vec3( 0, 0, 1 ) ), dirtHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( dirtHash( i + vec3( 0, 1, 1 ) ), dirtHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z );
}

float dirtFbm( vec3 p ) {
  return dirtNoise( p ) * 0.55 + dirtNoise( p * 2.1 + 7.3 ) * 0.3 + dirtNoise( p * 4.7 + 1.9 ) * 0.15;
}

// 0 to 1: how much dirt covers this pixel
float dirtMask() {
  if ( uDirt <= 0.001 ) return 0.0;
  float h = clamp( ( vDirtCar.y - uDirtRange.x ) / ( uDirtRange.y - uDirtRange.x ), 0.0, 1.0 ); // 0 at the ground
  float n = dirtFbm( vDirtObj * 2.6 );
  // The dirt line rises with the amount (from the tires at the start to about half the car's height
  // when caked), ragged along its edge
  float reach = 0.08 + uDirt * 0.42;
  float line = reach - h + ( n - 0.5 ) * 0.3;
  float body = smoothstep( 0.0, 0.06, line ) * ( 0.7 + 0.3 * n ); // thinner in places, not one flat coat
  // Specks thrown up just above the line
  vec3 sp = vDirtObj * 16.0, cell = floor( sp );
  vec3 centre = 0.5 + ( vec3( dirtHash( cell + 1.7 ), dirtHash( cell + 4.1 ), dirtHash( cell + 8.3 ) ) - 0.5 ) * 0.4;
  float dot_ = smoothstep( 0.3, 0.22, length( fract( sp ) - centre ) ); // round, not the square cell
  float speck = step( 1.0 - 0.12 * uDirt, dirtHash( cell ) ) * dot_ * smoothstep( 0.22, 0.0, h - reach );
  // Dust settled on top surfaces (hood, fenders, the board)
  float top = smoothstep( 0.6, 0.95, vDirtUp.y ) * smoothstep( 0.5, 0.8, n ) * uDirt * 0.35;
  return clamp( max( max( body, speck * 0.75 ), top ), 0.0, 1.0 ) * smoothstep( 0.0, 0.08, uDirt );
}

void applyDirt( inout vec3 color ) {
  float m = dirtMask();
  vec3 mud = uDirtColor * mix( 1.0, 0.55, uDirtWet ); // wet mud is darker
  color = mix( color, mud, m * 0.85 );
  shadeDirt = m * ( 1.0 - uDirtWet * 0.6 ); // wet mud still shines a little
}
