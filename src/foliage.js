import * as THREE from 'three';
import { shade } from './shading.js';

// Leaf clumps, the way the reference site draws its trees and bushes: each clump is a ball of small flat
// cards showing a cut-out leaf shape (a texture drawn here in code), turned toward the camera, shaded from a
// shadow-side color to a sunlit color by which way each card's bent normal faces the sun, fluttering by
// turning the leaf texture in the wind, and thinning out when it stands between the camera and the car.

const CARDS = 85; // leaf cards per clump (fewer on small screens)
const CARD = 0.8; // card size, for a clump of radius 1

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A sheet of pointed leaves with soft, bright centres: the alpha test cuts a crisp leaf edge from the gradient
function leafTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const r = rng(91);
  for (let i = 0; i < 22; i++) {
    const x = 14 + r() * 100, y = 14 + r() * 100, len = 15 + r() * 10, wid = len * (0.42 + r() * 0.18), a = r() * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, 'rgb(255,255,255)');
    g.addColorStop(0.75, 'rgb(150,150,150)');
    g.addColorStop(1, 'rgb(70,70,70)');
    ctx.fillStyle = g;
    ctx.beginPath(); // a leaf: two arcs meeting in points at both ends
    ctx.moveTo(-len, 0);
    ctx.quadraticCurveTo(0, -wid * 1.25, len, 0);
    ctx.quadraticCurveTo(0, wid * 1.25, -len, 0);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; // no mipmaps, so the cut edge stays crisp at a distance
  tex.generateMipmaps = false;
  return tex;
}

// One clump: cards scattered through a ball of radius 1, mostly near its surface, normals bent outward
function clumpGeometry(cards) {
  const r = rng(7), planes = [];
  for (let i = 0; i < cards; i++) {
    const g = new THREE.PlaneGeometry(CARD, CARD);
    g.rotateZ(r() * Math.PI * 2);
    const p = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1 - r() ** 3, Math.acos(2 * r() - 1), r() * Math.PI * 2));
    p.z *= 0.6; // a little flatter toward the camera, so cards overlap less
    g.translate(p.x, p.y, p.z);
    const out = p.clone().normalize(), pos = g.attributes.position, nrm = g.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).normalize().lerp(out, 0.85).normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
    planes.push(g);
  }
  const pos = [], nrm = [], uv = [], idx = [];
  let o = 0;
  for (const g of planes) {
    pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// Two colors for a clump from one base color: a deeper shadow side and a brighter sunlit side
export function clumpColors(base) {
  const a = base.clone().multiplyScalar(0.72).offsetHSL(0, 0.06, 0);
  const b = base.clone().offsetHSL(0.01, 0, 0.08);
  return [a, b];
}

export class Foliage {
  // towardCamera: direction from the scene to the camera (cards are turned to face it)
  constructor(scene, towardCamera, { small = false } = {}) {
    this.scene = scene;
    this.toward = towardCamera.clone().normalize();
    this.texture = leafTexture();
    this.geometry = clumpGeometry(small ? 55 : CARDS);
    this.time = { value: 0 };
    this.material = this.makeMaterial();
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: this.texture, alphaTest: 0.5 });
    this.clumps = [];
    this.meshes = [];
  }

  makeMaterial() {
    const mat = new THREE.MeshLambertMaterial({ alphaMap: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLeafTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 colorA;
          attribute vec3 colorB;
          varying vec3 vColorA;
          varying vec3 vColorB;
          uniform float uLeafTime;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          {
            // Flutter: turn each card's leaf picture a little in the wind, gusts rolling across the island
            vec4 cw = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            float a = ( sin( uLeafTime * 1.7 + cw.x * 0.35 + position.x * 2.0 ) + sin( uLeafTime * 2.6 + cw.z * 0.3 + position.y * 2.0 ) ) * 0.32;
            vec2 d = vAlphaMapUv - 0.5;
            vAlphaMapUv = vec2( d.x * cos( a ) - d.y * sin( a ), d.x * sin( a ) + d.y * cos( a ) ) + 0.5;
          }
          vColorA = colorA;
          vColorB = colorB;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec4 cw = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            transformed.xy += vec2( sin( uLeafTime * 1.1 + cw.x * 0.2 ), cos( uLeafTime * 0.9 + cw.z * 0.2 ) ) * 0.035; // the clump drifts gently
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vColorA;\nvarying vec3 vColorB;')
        // Both faces keep the outward normal, so a card seen from behind is not thrown into shadow
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          #if NUM_DIR_LIGHTS > 0
            diffuseColor.rgb = mix( vColorA, vColorB, smoothstep( 0.0, 1.0, dot( normal, directionalLights[ 0 ].direction ) ) );
          #endif`);
    };
    return shade(mat, { seeThrough: true });
  }

  // Add a clump: world centre, radius, base color. Returns its index (for shaking it later).
  add(center, radius, color, phase = 0) {
    const [a, b] = clumpColors(color);
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
