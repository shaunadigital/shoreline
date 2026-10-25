# Shoreline

A tiny tropical island you explore in an off-roader. Knock over the letters, hunt for shells on the beach, and bowl a strike with the tiki pins.

Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)

## Stack

- [Three.js](https://threejs.org) for rendering
- [Rapier](https://rapier.rs) for physics (raycast vehicle controller)
- [Vite](https://vitejs.dev) for the build, hosted on Vercel

## Run it

```bash
npm install
npm run dev     # local dev server
npm run build   # production build into dist/
```

## Layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, sky, lights, camera, input, main loop |
| `src/oahu-data.js` | Oahu coastline, mountain crest lines and crater position in game units |
| `src/terrain.js` | Island height (coast distance, two ridges, crater, flat play zones), terrain mesh and collider, water shader |
| `src/models.js` | Loads the .glb models and bakes them into fast single meshes |
| `src/vehicle.js` | Off-roader model and vehicle physics |
| `src/world.js` | Palms, rocks, letters, ramps, crates, beach balls, hut, boat, clouds, signs, torches |
| `src/games.js` | Mini games: Tiki Bowling and Shell Hunt |

## Credits

Coastline from [Natural Earth](https://www.naturalearthdata.com/) 1:10m land polygons (public domain).

## Controls

WASD or arrow keys to drive, Space to brake, Shift to boost, R to flip back over. Touch buttons appear on phones.
