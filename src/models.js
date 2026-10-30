import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are meshopt-compressed (tools/glb-compress.mjs)

// Load a .glb and return its scene, or null if it fails (callers fall back to built-in shapes).
export async function loadGLB(url) {
  try {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  } catch (err) {
    console.warn(`Model ${url} failed to load, using the built-in one.`, err);
    return null;
  }
}

// Bake the meshes of a scene that pass `filter` into one flat-shaded geometry with
// vertex colors (taken from each mesh's material, or from `colorFor` when it returns one).
// One geometry means one draw call, and it can be instanced.
export function bakeColored(scene, filter = () => true, colorFor = () => null) {
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh || !filter(o.name, o)) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pa = src.attributes.position;
    const pos = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.applyMatrix4(o.matrixWorld);
    const c = colorFor(o.name, o) || o.material.color;
    const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}
