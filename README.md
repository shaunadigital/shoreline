# Shoreline

A tiny tropical island shaped like Oahu that you explore in an off-roader. Knock things over, blow things up, hunt for shells, bowl a strike, score a goal, sink a putt, race the tiki gates and find the treasure.

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
| `src/layout.js` | Where the second wave of props and mini games sit, and the zones kept flat or clear for them |
| `src/extras.js` | Lighthouse, pier, beach scenes, explosives, treasure chest, soccer, mini golf and the tiki gate race |
| `src/fx.js` | Explosions, smoke, sparks and fireworks |

## Credits

Coastline from [Natural Earth](https://www.naturalearthdata.com/) 1:10m land polygons (public domain).

## Controls

WASD or arrow keys to drive, Space to jump, B or Ctrl to handbrake and drift, Shift to boost, R to respawn, drag to look around. In the air, steer spins the car and throttle flips it. Tipped over, steer or throttle rocks it back onto its wheels and Space hops it. Touch buttons appear on phones.
