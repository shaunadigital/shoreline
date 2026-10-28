# Shoreline: project status

Last updated 2026-10-27 (grass and leaf rework session).

## What it is

A browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. Inspired by the feel of Bruno Simon's portfolio (bruno-simon.com), with Shauna's own tropical look, vehicle and art. For fun, not commercial.

- Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)
- Repo: https://github.com/shaunadigital/shoreline (public, branch `main`)
- Vercel project `shoreline` (team `shaunagits-projects`). Deploys go through the Vercel MCP `create_deployment` with `gitSource` pointing at the repo, then check the live bundle hash. The hub (repo `shaunagits/games`) mounts it at `/shoreline/` with one redirect and two rewrites in its `vercel.json`, and shows a Shoreline card (first, with the New sticker).
- Who does what: Shauna makes all the art (concept images, then 3D in Blender, exported as .glb). Claude does code, integration, layout and deploys. Asset prompts and the pipeline are in `_docs/ASSET_PROMPTS.md`.

## Live now (the new island, built 2026-10-26)

- **Island** from `src/island-plan.json`: flat ground, sandy beaches, nine pools with sandy banks and water you can splash into (tow back to the landing), gentle bumps on open grass only. The Oahu terrain and its data are gone.
- **Race circuit**: asphalt with red and white curbs, dashed center line, checkered start line under the race arch, and the short raised, banked turn at the kink on the top straight (about 1.9 high, tilted up on the outside, teal and white rails so you stay on). Lap race: crossing the start line starts the clock, 7 checkpoints around the loop (a glowing strip and a floating marker show the next one), crossing the line again records the lap and starts the next one. A steady test lap takes about 30 s.
- **Sand paths** between the zones, and a wooden bridge (pier sections) where the landing path crosses the south pond.
- **Zones**: Landing (spawn, SHORELINE letters, welcome and Shell Hunt signs, beach balls), Race circuit, Jump yard (four ramps, crate stack, dynamite), Tiki village (hut you can drive through, bowling lane and torches, fruit cart, firework barrel), Sports park (soccer field and goals, mini golf), Beach front (pier, umbrella and chairs, surf rack, coconut bombs), Lighthouse point (lighthouse, rocks), Treasure crater (small rim to climb, chest that spills gold doubloons). Each zone has a wooden sign.
- **Nature**: 110 swaying palms along the beaches and pool shores, 57 flowering trees (poinciana, jacaranda, plumeria, golden shower) inland (120 are tried; the rest find no room clear of paths, props and other trees), 90 hibiscus and monstera bushes you can drive through (they shake).
- **Leaf clumps** (`src/foliage.js`), the reference site's technique, reworked 2026-10-27 for detail: trunks, branches and flowers stay Shauna's models, and each tree's canopy parts mark where leaf clumps go, how big and what color. Canopy parts only merge when close (`R * 1.2`), so each tree has more, smaller, separate clumps (radius `R * 0.6` to `R * 1.1`) and its branches show between them. A clump is a loose ball of 80 cards (50 on small screens), mostly on a shell near its surface with a few strays past it for a ragged edge. Each card shows one small leaf (0.3 units, a fixed world size whatever the clump's size), turned toward the camera, shaded from a deep shadow-side color (base x 0.5, a touch toward purple) to a bright sunlit one, each leaf a little lighter or darker and each plant a slightly different hue, fluttering in the shared wind, casting leaf-shaped shadows and thinning out near the car. Hibiscus leaves are clumps too; the monstera keeps its own split leaves (confirmed). Fallback: `clump: null` for a species in `src/flora.js` shows its modeled canopy instead.
- **Grass** (`src/grass.js`), reworked 2026-10-27: follows the camera, one patch of 78,400 single-triangle blades (57,600 on small screens), a blade every 0.25 units, wrapping round as you drive. Open fields are about 1 tall (half the car) with tufts up to about 1.4; the grass shrinks into every edge (paths, curbs, sand, bare spots) instead of ending in a wall, and is short (about 0.25 of full) on the soccer pitch, golf, the bowling apron and around the beach balls so they stay readable. It grows wherever the ground is green (including the green apron beside the circuit), reaching a little onto the sand. The terrain reads the same grass map per pixel (`TERRAIN_GRASS` in `src/terrain.js`): green exactly where grass grows and sand everywhere else, so no green ground shows outside the grass. Blades face the camera, vary a little in shade, have brighter golden tips, are shaded at the root, sway in the shared wind (`src/wind.js`, also used by the leaves), and are flattened by smooth tire tracks (`src/tracks.js`: a small map around the car drawn on the GPU, one soft strip per wheel, growing back over about a minute). Bare spots, trimmed to the prop footprints: hut floor, bowling lane, golf green and tee, ramps, crates, fruit cart, lighthouse base, crater rim. Height map: blue channel of the grass data texture (`grassHeight()`); constants `BLADE_H`, `BLADE_W`, `SHORT`.
- **Shading** (`src/shading.js`) is one hand-made recipe for every lit material, like the reference site's: lit side is the base color times a warm sun color (#ffe4d2, 1.2), the shadow side and cast shadows are the base color times a deep purple tint (#7650e6, never gray), and undersides near the ground pick up the ground color. Tone mapping is off.
- **Boat** sails the `boatLoop` circle around the island.
- **Camera and proportions** match the reference site, scaled to our car (2.85 long against its 3.25): a narrow 25 degree lens, 41 degrees above the ground, looking in diagonally (45 degrees), 27 units from the car by default (set by matching the car's size on screen side by side with the live reference), mouse wheel zooms from 13 to 40, pulling back with speed and further on tall phone screens. Trees are 6 to 8 tall, the reference's tree to car ratio. Trees, palms and the start arch thin out with a dither pattern when they stand between the camera and the car.
- Off-roader, mini games, best scores in localStorage (`shoreline.bowling`, `.shells`, `.goals`, `.golf`, and `.circuit` for the lap; the old `.race` key held tiki gate times and is no longer read), effects and touch controls as before.

## Decided

| Date | Decision |
| --- | --- |
| 2026-10 | Name "Shoreline". Off-roader, no Jeep-style grille. Public repo. Lives at games.shauna.digital/shoreline. |
| 2026-10-25 | Driving feel is good for now. |
| 2026-10-25 | Replace the Oahu island with a new, flat, designed island. No mountains. No paintable map. |
| 2026-10-25 | **Island plan draft 2 approved, with changes**: `src/island-plan.json`, drawn in `art/island-plan.png`. The circuit copies the general serpentine shape of the reference map's track (mirrored to the east and north side) and the pools copy the reference's pool layout. Nothing else is copied. Changes asked for: add a short raised, banked turn on the top straight (at the small kink near the middle of the north edge), and keep the sports park where draft 2 shows it (open grass between the start straight and the south loop pond). |
| 2026-10-25 | Sound waits until the new island is built. Music: find different CC0 tropical tracks, not the reference site's. |
| 2026-10-25 | "Ask the Tiki" (a Claude-powered chat character): not now, maybe later. It would need a small server with rate limits. |
| 2026-10-26 | Built the island as planned, with three small fits found while building: the south pond is cut back where it ran under the start straight, the coast is pushed out a little under the east straight, and the tightest corners (the kink and the south-west hairpin) are eased slightly so the inside curbs never fold. The banked turn reaches out over the surf on purpose. |
| 2026-10-26 | Bushes have no collider (you drive through and they shake); trees have trunk colliders. |
| 2026-10-26 | The gold doubloon model is the treasure coin that spills from the chest (confirmed). |
| 2026-10-26 | Grass, tree leaves and shading follow the reference site's techniques (read from its MIT source, github.com/brunosimon/folio-2025), with our own code, colors and textures. Done: camera-following grass and the shading recipe. Next, after Shauna checks the grass: tree and bush tops become generated leaf clumps (many small leaf cards in a ball, a cut-out leaf texture of our own, two colors for sun and shadow side, fluttering in the wind, see-through near the car), keeping her trunks and flower parts. |
| 2026-10-26 | Camera, zoom and sizes follow the reference's numbers scaled to our car. Grass blades need no models: the reference draws each blade as one flat triangle in code. Compared side by side in the browser, our first blades were about a quarter of the reference's on-screen height and were wrongly shaded as if in shadow; fixed by matching its effective blade size and spacing and keeping the blade normal upward. |
| 2026-10-26 | Colors move toward the reference's: warm golden grass (#b9b23c, #a2a636), a warmer sun (#ffe4d2) and deep purple shadows (#7650e6). Camera stays diagonal. Tree and bush tops are leaf clumps. |
| 2026-10-26 | All grass is full length (about 1.9), edge to edge on the green ground, soccer pitch included, replacing the earlier tall and short patches. Shauna asked for it after seeing the patches; it hides the pitch lines and part of the ball (open question below). |
| 2026-10-26 | The monstera keeps its own split leaves instead of leaf clumps: clumps of generic leaf cards would lose its shape. Pending Shauna's confirmation. |
| 2026-10-26 | Supersedes the "Next, after Shauna checks the grass" part of the techniques row above: the leaf clumps are built and live. |
| 2026-10-26 | Visual matching is checked side by side with the live reference in Shauna's Chrome at the same window size, not from its source numbers alone. The source numbers gave grass a quarter of the on-screen height and a camera 1.4 times too close; only the side by side check caught it. |
| 2026-10-26 | Commits are authored as Shauna (shauna.coy@gmail.com) with no assistant co-author lines, per her rule of no AI credit in commits. |
| 2026-10-27 | Grass rework after Shauna's drive: the full-length grass was too tall everywhere and stopped short of the green ground. Now about half the car's height with tufts, shorter toward edges, short on play surfaces, and grown by the same green test as the ground colors. Soccer pitch short and playable (Shauna confirmed). Replaces the 2026-10-26 full-length decision. |
| 2026-10-27 | Leaf clumps were too heavy and blocky (each card was a sheet of about 20 leaves, 85 cards per ball). Reworked for detail rather than reverted to the modeled canopies: one small leaf per card, looser and smaller separate clumps, stronger light to dark range. Monstera keeps its split leaves (Shauna confirmed). |
| 2026-10-27 | No green ground outside the grass (Shauna asked): the terrain takes its green from the grass map instead of per triangle; bare spots and edges are sand. |
| 2026-10-27 | From Bruno Simon's devlog 2: one shared wind for grass and leaves, smooth tire tracks drawn on the GPU, per-blade color variation, and a stats-gl performance panel behind `?debug`. |

## Next

1. Shauna drives the reworked grass and trees and judges them side by side with the reference; tune `BLADE_H`, tuft range and the edge ramp in `src/grass.js`, and `CARDS`, `CARD` and `clumpColors` in `src/foliage.js`.
2. Phone check on a real device with `?debug` (stats-gl panel: frame rate, CPU and GPU time).
3. Sound effects and CC0 music (not the reference site's).
4. Achievements and reasons to keep playing (a list of goals across the mini games, saved in localStorage, shown in a small panel).
5. Devlog ideas not yet built: speed lines at high speed.

## Open questions for Shauna

- A sand path runs diagonally across the soccer pitch (it was hidden by the tall grass). Reroute the path around the pitch, or move the pitch?

## Known notes

- Headless Chromium (swiftshader) is slow, so tests drive the game with `simulate()` rather than real time. `tools/checks/play.mjs` serves `dist/`, runs steps passed in the `STEPS` env var (JSON list of `{name, js, shot}`) and saves screenshots; it needs the globally installed Playwright (`NODE_PATH=$(npm root -g)`). `window.__shoreline.debug.holdCamera = true` stops the follow camera so a check can place it.
- Moving a prop: change `src/layout.js`, then `node tools/checks/run.mjs layout-check` prints each prop's distance to water, the circuit edge and the paths.
- A material that changes its shader in `onBeforeCompile` needs its own `customProgramCacheKey` set before `shade()` patches it, or other standard materials can share its program (the terrain shader once turned paths, the road and props black).
- Startup builds distance grids for the whole island (about 0.4 s on a laptop).
- Vercel builds one project at a time for this account; a stuck build elsewhere (for example faf-app) blocks deploys here.
- Right after a deploy, the live site can serve the old bundle for a minute. Retry once the bundle hash matches.
- Every Blender export includes all scenes in the .blend: always run `tools/glb-clean.mjs`.
- Shauna's Desktop folder `/Users/shauna/Desktop/claudecode/shoreline` is a plain copy, not a git checkout. Sessions work in a clone of the repo and copy changed files there after each push.
- Research behind the grass, leaf clumps, shading and camera: `_docs/findings/2026-10-26-reference-grass-trees-camera.md`.
