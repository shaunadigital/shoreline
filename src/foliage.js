import * as THREE from 'three';
import { shade } from './shading.js';
import { WIND, WIND_GLSL } from './wind.js';

// Leaf clumps, the way the reference site draws its trees and bushes: each clump is a loose ball of small
// flat cards, each showing one cut-out leaf (a texture drawn here in code), turned toward the camera, shaded
// from a deep shadow-side color to a bright sunlit color by which way each card's bent normal faces the sun,
// each card a little lighter or darker, fluttering in the island's wind, and thinning out when it stands
// between the camera and the car. Cards are a fixed size in the world (not scaled with the clump), so big
// and small clumps show the same small leaves, with gaps between them and ragged edges.

const CARDS = 130; // leaf cards per clump (fewer on small screens): fuller crowns, halfway to the reference (2026-10-30)
const CARD = 0.32; // card size in world units (the leaf fills most of it)

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One pointed leaf with a soft, bright middle: the alpha test cuts a crisp leaf edge from the gradient
function leafTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  const len = S * 0.46, wid = len * 0.48;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.7, 'rgb(170,170,170)');
  g.addColorStop(1, 'rgb(80,80,80)');
  ctx.fillStyle = g;
  ctx.beginPath(); // a leaf: two arcs meeting in points at both ends
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(0, -wid * 1.25, len, 0);
  ctx.quadraticCurveTo(0, wid * 1.25, -len, 0);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter; // mipmaps, so distant leaves don't shimmer
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

// One clump: cards scattered through a ball of radius 1, mostly on a shell near its surface with a few
// strays past it for a ragged edge, normals bent outward. Each card's vertices carry the card's centre
// (the shader keeps cards a fixed world size) and a random shade.
function clumpGeometry(cards) {
  const r = rng(7), pos = [], nrm = [], uv = [], ctr = [], shade = [], idx = [];
  for (let i = 0; i < cards; i++) {
    const u = r();
    const rad = u < 0.6 ? 0.7 + r() * 0.3 : u < 0.88 ? 0.25 + r() * 0.45 : 1.0 + r() * 0.3; // a fuller inside so the crown reads as a mass, still ragged at the edge
    const p = new THREE.Vector3().setFromSpherical(new THREE.Spherical(rad, Math.acos(2 * r() - 1), r() * Math.PI * 2));
    p.z *= 0.6; // a little flatter toward the camera, so cards overlap less
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateZ(r() * Math.PI * 2);
    g.translate(p.x, p.y, p.z);
    const out = p.clone().normalize(), gp = g.attributes.position, s = r(), o = pos.length / 3;
    for (let k = 0; k < gp.count; k++) {
      pos.push(gp.getX(k), gp.getY(k), gp.getZ(k));
      const v = new THREE.Vector3(gp.getX(k), gp.getY(k), gp.getZ(k)).normalize().lerp(out, 0.85).normalize();
      nrm.push(v.x, v.y, v.z);
      ctr.push(p.x, p.y, p.z);
      shade.push(s);
    }
    uv.push(...g.attributes.uv.array);
    for (const k of g.index.array) idx.push(k + o);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('cardCenter', new THREE.Float32BufferAttribute(ctr, 3));
  geo.setAttribute('cardShade', new THREE.Float32BufferAttribute(shade, 1));
  geo.setIndex(idx);
  return geo;
}

// Cards stay CARD wide in the world whatever the clump's size (the instance scale is the clump radius)
const CARD_SIZE_GLSL = `
  {
    float clumpScale = length( instanceMatrix[ 0 ].xyz );
    transformed = cardCenter + ( transformed - cardCenter ) * ( ${CARD.toFixed(3)} / clumpScale );
  }`;

// Two colors for a clump from one base color: a deeper shadow side and a brighter sunlit side
export function clumpColors(base) {
  const a = base.clone().multiplyScalar(0.5).lerp(new THREE.Color('#3b2a73'), 0.12).offsetHSL(0, 0.05, 0);
  const b = base.clone().offsetHSL(0.01, 0.02, 0.15);
  return [a, b];
}

export class Foliage {
  // towardCamera: direction from the scene to the camera (cards are turned to face it)
  constructor(scene, towardCamera, { small = false } = {}) {
    this.scene = scene;
    this.toward = towardCamera.clone().normalize();
    this.texture = leafTexture();
    this.geometry = clumpGeometry(small ? 80 : CARDS);
    this.time = { value: 0 };
    this.material = this.makeMaterial();
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: this.texture, alphaTest: 0.5 });
    this.depth.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 cardCenter;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + CARD_SIZE_GLSL);
    };
    this.clumps = [];
    this.meshes = [];
  }

  makeMaterial() {
    const mat = new THREE.MeshLambertMaterial({ alphaMap: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, WIND);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 colorA;
          attribute vec3 colorB;
          attribute vec3 cardCenter;
          attribute float cardShade;
          varying vec3 vColorA;
          varying vec3 vColorB;
          varying float vCardShade;
          ${WIND_GLSL}`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          {
            // Flutter: turn each card's leaf picture a little in the wind, gusts rolling across the island
            vec4 cw = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            float gust = 0.6 + abs( windGust( cw.xz ) ) * 1.6; // stronger flutter where a gust passes
            float a = ( sin( uWindTime * 1.7 + cw.x * 0.35 + cardCenter.x * 6.0 ) + sin( uWindTime * 2.6 + cw.z * 0.3 + cardCenter.y * 6.0 ) ) * 0.3 * gust;
            vec2 d = vAlphaMapUv - 0.5;
            vAlphaMapUv = vec2( d.x * cos( a ) - d.y * sin( a ), d.x * sin( a ) + d.y * cos( a ) ) + 0.5;
          }
          vColorA = colorA;
          vColorB = colorB;
          vCardShade = cardShade;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          ${CARD_SIZE_GLSL}
          {
            vec4 cw = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            float gust = windGust( cw.xz );
            transformed.xy += vec2( sin( uWindTime * 1.1 + cw.x * 0.2 ), cos( uWindTime * 0.9 + cw.z * 0.2 ) ) * ( 0.025 + 0.03 * abs( gust ) ); // the clump drifts with the gusts
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vColorA;\nvarying vec3 vColorB;\nvarying float vCardShade;')
        // Both faces keep the outward normal, so a card seen from behind is not thrown into shadow
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          #if NUM_DIR_LIGHTS > 0
            diffuseColor.rgb = mix( vColorA, vColorB, smoothstep( -0.2, 0.8, dot( normal, directionalLights[ 0 ].direction ) ) );
            diffuseColor.rgb *= 0.88 + 0.24 * vCardShade; // each leaf a little lighter or darker
          #endif`);
    };
    return shade(mat);
  }

  // Add a clump: world centre, radius, base color. Returns its index (for shaking it later).
  add(center, radius, color, phase = 0, hue = 0) {
    const [a, b] = clumpColors(color.clone().offsetHSL(hue, 0, 0));
    this.clumps.push({ center: center.clone(), radius, a, b, roll: phase * 6.283, offset: new THREE.Vector3() });
    return this.clumps.length - 1;
  }

  // Build the instanced meshes, split into map cells for culling
  build(cell = 42) {
    const cells = new Map();
    this.clumps.forEach((c, i) => {
      const key = `${Math.floor(c.center.x / cell)},${Math.floor(c.center.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    });
    for (const list of cells.values()) {
      const geo = this.geometry.clone();
      const ca = new Float32Array(list.length * 3), cb = new Float32Array(list.length * 3);
      list.forEach((ci, k) => { const c = this.clumps[ci]; ca.set([c.a.r, c.a.g, c.a.b], k * 3); cb.set([c.b.r, c.b.g, c.b.b], k * 3); });
      geo.setAttribute('colorA', new THREE.InstancedBufferAttribute(ca, 3));
      geo.setAttribute('colorB', new THREE.InstancedBufferAttribute(cb, 3));
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      mesh.customDepthMaterial = this.depth;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.list = list;
      list.forEach((ci, k) => { this.clumps[ci].mesh = mesh; this.clumps[ci].slot = k; this.writeMatrix(ci); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  // Face the camera, with a random roll so clumps don't look stamped
  writeMatrix(i) {
    const c = this.clumps[i];
    const o = new THREE.Object3D();
    o.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
    o.position.copy(c.center).add(c.offset);
    o.lookAt(o.position.clone().add(this.toward));
    o.scale.setScalar(c.radius);
    o.updateMatrix();
    c.mesh.setMatrixAt(c.slot, o.matrix);
  }

  // Move a clump by an offset (used to shake bushes the car drives through)
  nudge(i, offset) {
    const c = this.clumps[i];
    c.offset.copy(offset);
    this.writeMatrix(i);
    c.mesh.instanceMatrix.needsUpdate = true;
  }

  update(time) {
    this.time.value = time;
  }
}
