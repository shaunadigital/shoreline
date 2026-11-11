// Caustics: the moving web of light on the floor of shallow water, where the ripples on the surface
// bend sunlight and gather it into bright lines.
//
// Built from two layers of drifting cells (a Voronoi pattern). The light gathers where two cells meet,
// so each layer is the gap between the nearest and second-nearest cell centre: zero on an edge. The two
// layers move against each other at different sizes and the surface ripple bends both, so the web keeps
// re-forming instead of sliding. Red, green and blue are read a hair apart, which splits the brightest
// lines into a faint rainbow fringe, as real caustics do.
//
// Shared by two materials in terrain.js: the ground under the water, and the water surface itself.

vec2 causticHash( vec2 p ) {
  p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
  return fract( sin( p ) * 43758.5453 );
}

// Distance from p to the nearest edge between cells; the cell centres orbit slowly with time.
float causticEdge( vec2 p, float t ) {
  vec2 i = floor( p ), f = fract( p );
  float d1 = 8.0, d2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) {
    for ( int x = -1; x <= 1; x++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 o = causticHash( i + g );
      o = 0.5 + 0.42 * sin( t + 6.2831 * o );
      float d = length( g + o - f );
      if ( d < d1 ) { d2 = d1; d1 = d; }
      else if ( d < d2 ) { d2 = d; }
    }
  }
  return d2 - d1;
}

// One channel: two layers of lines, sharpened, where both layers agree the light is brightest.
float causticSample( vec2 p, float t ) {
  vec2 ripple = vec2( sin( p.y * 0.9 + t * 0.8 ), cos( p.x * 0.8 - t * 0.7 ) ) * 0.22;
  float a = 1.0 - smoothstep( 0.0, 0.16, causticEdge( p * 0.85 + ripple, t * 0.9 ) );
  float b = 1.0 - smoothstep( 0.0, 0.22, causticEdge( p * 1.35 + vec2( 3.7, 1.9 ) - ripple, 1.3 - t * 0.7 ) );
  return a * a * 0.55 + b * b * 0.3 + a * b * 0.9;
}

// The full pattern at world position xz (units), 0 to about 1.5, with a little color split.
vec3 caustics( vec2 xz, float t ) {
  vec2 p = xz * 0.7;
  vec2 split = vec2( 0.022, 0.012 );
  return vec3(
    causticSample( p + split, t ),
    causticSample( p, t ),
    causticSample( p - split, t )
  );
}
