// Clean a .glb exported from Blender before it goes in public/models/.
// Blender exports every scene in the .blend file, so this keeps only the default (active)
// scene, merges duplicate data and drops anything unused, then prints a short report.
//
// Usage (from the repo root):  node tools/glb-clean.mjs in.glb public/models/name.glb
import { NodeIO, getBounds } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.log('usage: node tools/glb-clean.mjs in.glb out.glb'); process.exit(1); }
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
const keep = root.getDefaultScene();
const scenes = root.listScenes().map((s) => s.getName());
for (const s of root.listScenes()) if (s !== keep) {
  const walk = (n) => { n.listChildren().forEach(walk); n.dispose(); };
  s.listChildren().forEach(walk); s.dispose();
}
await doc.transform(dedup(), prune());
const f = (v) => v.map((x) => x.toFixed(2)).join(', ');
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
const b = getBounds(keep);
console.log(`kept scene "${keep.getName()}" of [${scenes.join(' | ')}]`);
console.log(`triangles ${tris}, size ${f(b.max.map((v, i) => v - b.min[i]))}`);
console.log('materials', root.listMaterials().map((m) => m.getName()).join(', '));
console.log('parts', keep.listChildren().map((n) => n.getName()).join(', '));
await io.write(dst, doc);
