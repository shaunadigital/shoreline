# Shoreline

A tiny tropical island you explore in an off-roader. Knock things over, blow things up, hunt for shells, bowl a strike, score a goal, sink a putt, race the circuit and find the treasure.

Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)

## Stack

- [Three.js](https://threejs.org) for rendering
- [Rapier](https://rapier.rs) for physics (raycast vehicle controller), its WebAssembly loaded as its own file
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
| `src/island-plan.json` | The island design: coast, pools, circuit, paths, zones and markers. Change the island here |
| `src/plan.js` | Turns the plan into smooth curves and fast distance lookups (to the coast, pools, circuit and paths), finds the bridges |
| `src/terrain.js` | Island height (flat ground, beaches, shallow pools you can drive through, gentle bumps, the crater rim), terrain mesh (green only under grass) and collider, water shader |
| `src/track.js` | The race circuit (asphalt, curbs, center line, start line, the raised banked turn, rails), the race arch and the lap race |
| `src/paths.js` | Sand paths and the bridges where paths cross pools |
| `src/layout.js` | Where every prop and mini game sits, zone by zone, and the circles kept level or clear for them |
| `src/models.js` | Loads the .glb models and bakes them into fast single meshes |
| `src/vehicle.js` | Off-roader model and vehicle physics |
| `src/world.js` | Palms, rocks, letters, ramps, crates, beach balls, hut, boat, clouds, signs, torches |
| `src/flora.js` | Flowering trees and bushes: places them, keeps trunks and flowers as models, turns canopy parts into leaf clumps |
| `src/foliage.js` | Leaf clumps: loose balls of small single-leaf cards (leaf texture drawn in code), sun and shadow colors, wind flutter |
| `src/grass.js` | Grass that follows the camera: patch layout, curved three-triangle blades, its maps of the island (the terrain reads them too) |
| `src/tracks.js` | Tire tracks: a small map round the car drawn on the GPU that flattens the grass |
| `src/wind.js` | One wind for the grass and the leaves |
| `src/litter.js` | Fallen leaves and petals on the ground and on top of props |
| `src/daycycle.js` | Time of day: sun, shadow, sky, fog and water colors through day, sunset, night and dawn, and the night glows |
| `src/post.js` | Finishing passes: crevice shading, glow, tilt-shift blur, warm grade, vignette and edge smoothing |
| `src/shading.js` | The shading recipe for every lit material: sun color, tinted shadows, light bounced off the ground |
| `src/games.js` | Mini games: Tiki Bowling and Shell Hunt |
| `src/extras.js` | Lighthouse, pier, beach scenes, explosives, treasure chest, soccer and mini golf |
| `src/fx.js` | Explosions, smoke, sparks and fireworks |
| `tools/draw-plan.py` | Draws the island plan to a PNG (`python3 tools/draw-plan.py art/island-plan.png`) |
| `tools/checks/` | Plan and layout clearance checks (`node tools/checks/run.mjs plan-check`, `layout-check`) and the headless play test (`play.mjs`) |
| `tools/glb-clean.mjs` | Cleans a Blender .glb export before it goes in `public/models/`, then compresses it |
| `tools/glb-compress.mjs` | Compresses models with meshopt (smaller downloads) |
| `src/rapier.js` | Loads the physics engine, with its WebAssembly as a separate file |
| `_docs/` | Project status and decisions, asset prompts and the art pipeline |

## Credits

All art is Shauna's own.

## Controls

WASD or arrow keys to drive, Space to jump, B or Ctrl to handbrake and drift, Shift to boost, R to respawn, drag to look around. In the air, steer spins the car and throttle flips it. Tipped over, steer or throttle rocks it back onto its wheels and Space hops it. Touch buttons appear on phones.

T skips to the next time of day.

Add `?debug` to the address for a performance panel (frame rate, CPU and GPU time per frame). `?time=day`, `sunset`, `night` or `dawn` holds one time of day; `?nofx` turns off the finishing passes; `?ao` turns crevice shading on for small screens and `?noao` turns it off elsewhere.
