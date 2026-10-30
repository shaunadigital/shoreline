import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// Relative asset paths so the game works both at its own domain root
// and when mounted at games.shauna.digital/shoreline/.
// The physics engine's WebAssembly is its own file (vite-plugin-wasm); es2022 allows the top-level
// await it uses to start up.
export default defineConfig({
  base: './',
  plugins: [wasm()],
  build: { target: 'es2022' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d'] },
});
