// Compress .glb models for faster loading: vertex data is quantized and packed with meshopt
// (EXT_meshopt_compression), usually about a third of the size. The game's loaders decode it
// (setMeshoptDecoder in src/models.js and src/vehicle.js). glb-clean.mjs runs this on every new model.
//
// Usage (from the repo root):  node tools/glb-compress.mjs public/models/name.glb [more.glb ...]
// Files are compressed in place; a file that is already compressed is left alone.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';

export async function compress(file) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) return console.log(`${file}: already compressed`);
  const before = fs.statSync(file).size;
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(file, doc);
  console.log(`${file}: ${(before / 1024).toFixed(0)} KB -> ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

if (process.argv[1].endsWith('glb-compress.mjs')) for (const f of process.argv.slice(2)) await compress(f);
