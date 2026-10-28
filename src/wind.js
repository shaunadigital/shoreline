import * as THREE from 'three';

// One wind for the whole island: grass blades and leaf clumps read the same rolling gusts, so a gust
// visibly crosses the grass and the trees together.

// Tileable smooth noise
function noiseTexture(size = 128) {
  const grid = 16, g = Array.from({ length: grid * grid }, () => Math.random());
  const at = (i, j) => g[((j + grid) % grid) * grid + ((i + grid) % grid)];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * grid, fy = (y / size) * grid, i = Math.floor(fx), j = Math.floor(fy);
      const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const n = (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(n * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export const WIND = {
  uWindTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(Math.sin(2), Math.cos(2)) },
  uWindNoise: { value: noiseTexture() },
};

export function setWindTime(t) {
  WIND.uWindTime.value = t;
}

// GLSL: windGust(world xz) gives the gust at a point, about -1 to 1, rolling along uWindDir
export const WIND_GLSL = `
  uniform float uWindTime; uniform vec2 uWindDir; uniform sampler2D uWindNoise;
  float windGust( vec2 wp ) {
    float n1 = texture2D( uWindNoise, wp * 0.05 + uWindDir * uWindTime * 0.05 ).r - 0.5;
    float n2 = texture2D( uWindNoise, wp * 0.02 + uWindDir * uWindTime * 0.012 ).r - 0.5;
    return n1 + n2;
  }
`;
