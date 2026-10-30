// The physics engine. Rapier's WebAssembly loads as its own file, so the browser can download and
// compile it in parallel with the rest of the game (the "compat" build packed it into the main
// script as text, about 2 MB). `init` is kept so callers don't change; the module is ready on import.
import '@dimforge/rapier3d/rapier_wasm3d.js'; // loads and hooks up the WebAssembly (the bundler otherwise drops this step)
import * as R from '@dimforge/rapier3d';

export default { ...R, init: async () => {} };
