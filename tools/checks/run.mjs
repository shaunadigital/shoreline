// Bundles a check script with esbuild (so the .json import works) and runs it in Node.
import { build } from 'esbuild';
import { pathToFileURL } from 'url';
const name = process.argv[2];
const out = `/tmp/shoreline-${name}.mjs`;
await build({ entryPoints: [new URL(`./${name}.mjs`, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out, external: ['three', '@dimforge/*'], logLevel: 'error' });
const t = performance.now();
await import(pathToFileURL(out).href);
console.log(`(${(performance.now() - t).toFixed(0)} ms)`);
