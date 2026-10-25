import { defineConfig } from 'vite';

// Relative asset paths so the game works both at its own domain root
// and when mounted at games.shauna.digital/shoreline/
export default defineConfig({
  base: './',
});
