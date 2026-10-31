# Shoreline: project status

Last updated 2026-10-30 (session 4: style board, depth, sound, asset kit).

This page is the current state. The full history (what was asked, decided and why, how it was built, wrong turns) is in `_docs/DEVLOG.md`.

## What it is

A browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. Inspired by the feel of Bruno Simon's portfolio (bruno-simon.com), with Shauna's own tropical look, vehicle and art. For fun, not commercial.

- Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)
- Repo: https://github.com/shaunadigital/shoreline (public, branch `main`)
- Vercel project `shoreline` (team `shaunagits-projects`). Deploys go through the Vercel MCP `create_deployment` with `gitSource` pointing at the repo, then check the live bundle hash. The hub (repo `shaunagits/games`) mounts it at `/shoreline/` with one redirect and two rewrites in its `vercel.json`, and shows a Shoreline card (first, with the New sticker).
- Who does what: Shauna makes all the art (concept images, then 3D in Blender, exported as .glb). Claude does code, integration, layout and deploys. Asset prompts and the pipeline are in `_docs/ASSET_PROMPTS.md`.

## Where we left off (2026-10-30)

Everything below is pushed to `main`, deployed to production and copied to Shauna's Desktop folder. Session 4 in `_docs/DEVLOG.md` has the detail and the reasons.

**Done in session 4**
- Style board round 1 (private artifact "Shoreline Style Board", https://claude.ai/artifact/RFYSw7ENMaEGeCrpx3zUL3, picks in its `choices` collection) and everything it asked for: thin olive and gold grass, fuller trees, fallen leaves and petals, trodden earth under props, deeper water with foam and floating leaves, pool splashes, landing grass, warm grade and tilt-shift, a day and night cycle with night glows, contact shading and leaves on props.
- Depth: edge light, crevice shading (N8AO, off on phones), glowing headlights.
- Explosions with a fuse, fireball, shock ring, debris, smoke, scorch, camera kick, grass blown flat and slow motion.
- Load time from about 21 s to about 2.5 s (raycast fix, parallel downloads, meshopt models, Rapier wasm as its own file).
- Shauna's beach asset kit in the game: detailed buggy (auto-fitted), palm, square hut, start gate, pier and bridges, signposts with painted zone names, four rocks.
- Sound, all made in code (`src/audio.js`): engine from firing pulses with gears, tires by surface, ambience and event sounds; speaker button and M.
- The opening: crate stacks at the landing and a dynamite crate straight ahead of the spawn with the big stack behind it.
- The car rights itself when stuck; a shallow sea shelf you can drive into.

**Waiting on Shauna**
- Pick music from the CC0 candidates (Tozan's Caribbean Steel Drums 1 and 2 and Tropoix, wipics' Tropical Loop, Tsorthan Grove's Bamboo Blitz; links in the session 4 devlog). OpenGameArt downloads work from the cloud workspace, so the picked tracks can be fetched and wired in directly (`public/audio/` plus `music.json`).
- Listen to the engine and tires and say what to tune.
- Optional later: the zone-by-zone board; a fuller palm crown (a change in her Blender script).
- Phone check with `?debug` (grass is about twice the triangles it was, and the finishing passes add GPU work).

## Live now (the new island, built 2026-10-26, refined 2026-10-27 and 2026-10-30)

- **Island** from `src/island-plan.json`: flat ground, sandy beaches, nine pools with sandy banks, all shallow enough to drive through (floor about 0.6 under the water, since 2026-10-27), gentle bumps on open grass only, and a shallow sea shelf 10 units wide around the coast (2026-10-30). The Oahu terrain and its data are gone.
- **Race circuit**: asphalt with red and white curbs, dashed center line, checkered start line under the race arch, and the short raised, banked turn at the kink on the top straight (about 1.9 high, tilted up on the outside, teal and white rails so you stay on). Lap race: crossing the start line starts the clock, 7 checkpoints around the loop (a glowing strip and a floating marker show the next one), crossing the line again records the lap and starts the next one. A steady test lap takes about 30 s.
- **Sand paths** between the zones, and a wooden bridge (pier sections) where the landing path crosses the south pond.
- **Zones**: Landing (spawn, SHORELINE letters, welcome and Shell Hunt signs, beach balls, three crate stacks and a dynamite crate straight ahead of the spawn), Race circuit, Jump yard (four ramps, crate stack, dynamite), Tiki village (hut you can drive through, bowling lane and torches, fruit cart, firework barrel), Sports park (soccer field and goals, mini golf), Beach front (pier, umbrella and chairs, surf rack, coconut bombs), Lighthouse point (lighthouse, rocks), Treasure crater (small rim to climb, chest that spills gold doubloons). Each zone has Shauna's signpost with its name painted on the board.
- **Nature**: 110 swaying palms along the beaches and pool shores, 57 flowering trees (poinciana, jacaranda, plumeria, golden shower) inland (120 are tried; the rest find no room clear of paths, props and other trees), 90 hibiscus and monstera bushes you can drive through (they shake).
- **Since 2026-10-30** the grass, leaf clump, color and model details below are partly superseded: see Where we left off and session 4 in `_docs/DEVLOG.md` for the current numbers (grass `BLADE_W` 0.12, `SPACING` 0.22, 330 x 330 blades; 130 cards per clump; olive grass `#8f9a3c` / `#7d8c38`; warm day sun `#ffdcc4`; the asset kit models).
- **Leaf clumps** (`src/foliage.js`), the reference site's technique, reworked 2026-10-27 for detail: trunks, branches and flowers stay Shauna's models, and each tree's canopy parts mark where leaf clumps go, how big and what color. Canopy parts only merge when close (`R * 1.2`), so each tree has more, smaller, separate clumps (radius `R * 0.6` to `R * 1.1`) and its branches show between them. A clump is a loose ball of 80 cards (50 on small screens), mostly on a shell near its surface with a few strays past it for a ragged edge. Each card shows one small leaf (0.3 units, a fixed world size whatever the clump's size), turned toward the camera, shaded from a deep shadow-side color (base x 0.5, a touch toward purple) to a bright sunlit one, each leaf a little lighter or darker and each plant a slightly different hue, fluttering in the shared wind, casting leaf-shaped shadows and thinning out near the car. Hibiscus leaves are clumps too; the monstera keeps its own split leaves (confirmed). Fallback: `clump: null` for a species in `src/flora.js` shows its modeled canopy instead.
- **Grass** (`src/grass.js`), patch layout 2026-10-27: grass grows in patches with bare sand and packed earth between them, like the reference's layout. Patches come from smooth noise (`PATCH` low/high/fade: about 40% of the open ground) plus a patch gathered round every tree (radius 2.6) and bush (1.4). Each patch rises from nothing at its edge to about 1.4 in the middle (around the car's windows), so it has a soft rounded outline. Each blade is three triangles (wide root, middle, soft point), wide (`BLADE_W` 0.26 half width) and full most of the way up, and the shader bends it into a curve that droops a little, outward from the patch's middle plus its own random direction, with roots easing softly from dark into bright golden tips. Sand, the road, paths, prop footprints, the soccer pitch, golf, the bowling lane and apron and the beach balls stay clear. One camera-following patch of 48,400 blades (32,400 on small screens), a blade every 0.33 units, about 145,000 triangles. The terrain reads the same map (`TERRAIN_GRASS` in `src/terrain.js`): darker green under the patches, sand mixed with packed earth everywhere else. Blades sway in the shared wind (`src/wind.js`) and are flattened by smooth tire tracks (`src/tracks.js`, growing back over about a minute).
- **Shading** (`src/shading.js`) is one hand-made recipe for every lit material, like the reference site's: lit side is the base color times a warm sun color (#ffe4d2, 1.2), the shadow side and cast shadows are the base color times a deep purple tint (#7650e6, never gray), and undersides near the ground pick up the ground color. Tone mapping is off.
- **Boat** sails the `boatLoop` circle around the island.
- **Camera and proportions** match the reference site, scaled to our car (2.85 long against its 3.25): a narrow 25 degree lens, 41 degrees above the ground, looking in diagonally (45 degrees), 27 units from the car by default (set by matching the car's size on screen side by side with the live reference), mouse wheel zooms from 13 to 40, pulling back with speed and further on tall phone screens. Trees are 6 to 8 tall, the reference's tree to car ratio. Nothing thins out near the car: the see-through ring was removed 2026-10-27 (the code is still in `src/shading.js`, `seeThrough` option, unused).
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
| 2026-10-26 | All grass is full length (about 1.9), edge to edge on the green ground, soccer pitch included, replacing the earlier tall and short patches. Shauna asked for it after seeing the patches. Superseded 2026-10-27 (see below). |
| 2026-10-26 | The monstera keeps its own split leaves instead of leaf clumps: clumps of generic leaf cards would lose its shape. Confirmed 2026-10-27. |
| 2026-10-26 | Supersedes the "Next, after Shauna checks the grass" part of the techniques row above: the leaf clumps are built and live. |
| 2026-10-26 | Visual matching is checked side by side with the live reference in Shauna's Chrome at the same window size, not from its source numbers alone. The source numbers gave grass a quarter of the on-screen height and a camera 1.4 times too close; only the side by side check caught it. |
| 2026-10-26 | Commits are authored as Shauna (shauna.coy@gmail.com) with no assistant co-author lines, per her rule of no AI credit in commits. |
| 2026-10-27 | Grass rework after Shauna's drive: the full-length grass was too tall everywhere and stopped short of the green ground. Now about half the car's height with tufts, shorter toward edges, short on play surfaces, and grown by the same green test as the ground colors. Soccer pitch short and playable (Shauna confirmed). Replaces the 2026-10-26 full-length decision. |
| 2026-10-27 | Leaf clumps were too heavy and blocky (each card was a sheet of about 20 leaves, 85 cards per ball). Reworked for detail rather than reverted to the modeled canopies: one small leaf per card, looser and smaller separate clumps, stronger light to dark range. Monstera keeps its split leaves (Shauna confirmed). |
| 2026-10-27 | No green ground outside the grass (Shauna asked): the terrain takes its green from the grass map instead of per triangle; bare spots and edges are sand. |
| 2026-10-27 | Grass in patches with bare sand and earth between (Shauna's call after comparing side by side with the reference in her Chrome): the half-height lawn read as stubble and wall-to-wall lawn as carpet. Patches peak near the car's roof and taper to nothing; blades wide, leaning outward, dark at the root. Replaces the earlier lawn rows above. |
| 2026-10-27 | The sand path that crossed the soccer pitch is split: one path from the landing ends south of the pitch, the next starts north of it (Claude recommended, Shauna approved). Sports Park sign moved to (26, 15.5) beside the new path end. |
| 2026-10-27 | All interior pools shallow enough to drive through (Shauna asked). Grass blades curved and soft instead of straight single-triangle spikes (Shauna: too spiky and straight compared with the reference). |
| 2026-10-27 | Solid trunks: tree trunks, branches and palm trunks never thin out, as in the reference (Shauna asked). |
| 2026-10-27 | See-through ring removed entirely: leaves, flowers, fronds and the start arch no longer fade near the car (Shauna saw it as a halo round the car). |
| 2026-10-30 | Style board round 1 (Shauna's picks, see Where we left off): light, grass, ground, water and time of day move toward the reference; trees go halfway (denser, branches still showing, petals kept and added on the ground); props keep their look and gain contact shading and leaves on top; pool splashes, landing grass and trodden earth under props are in. |
| 2026-10-27 | From Bruno Simon's devlog 2: one shared wind for grass and leaves, smooth tire tracks drawn on the GPU, per-blade color variation, and a stats-gl performance panel behind `?debug`. |
| 2026-10-30 | Visual direction is set with a style board (reference and Shoreline side by side, a pick and a note per topic) rather than back and forth in chat. A zone-by-zone board waits until this round is judged. |
| 2026-10-30 | Day and night cycle of 6 minutes, day holding most of it, every visit starting in daytime (Shauna: "great for now"). |
| 2026-10-30 | Shauna's own models come from concept images plus her Blender script `build_beach_assets.py`; the versions without tiki faces and the hut mask are used. Shauna declined adding a Blender checklist or the new prompts and naming rules to the art guide, and declined a bevel script. |
| 2026-10-30 | The new car changes the driving feel on purpose: wider track and bigger wheels taken from the model, so it is more planted. Shauna drove it: "Car seems right for now." |
| 2026-10-30 | All sound effects are made in code; no sound files. The reference's sounds are not usable (commercial libraries licensed to its author). Music will be CC0 tracks Shauna picks. |
| 2026-10-30 | The opening copies the reference's idea, not its content: drive straight forward from the spawn into a dynamite crate with a crate stack behind it. |
| 2026-10-30 | The car rights itself when stuck (hop and spring), instead of waiting for a teleport. |
| 2026-10-30 | Project docs keep a full history in `_docs/DEVLOG.md`, detailed enough to reconstruct how and why the game was made and to use as content (Shauna asked). |

## Next

1. Music: wire in the tracks Shauna picks.
2. Tune from Shauna's drive: engine and tire sounds, the opening blast.
3. Phone check on a real device with `?debug`.
4. Achievements and reasons to keep playing (goals across the mini games, saved in localStorage, shown in a small panel).
5. Ideas not yet built: speed lines at high speed; the zone-by-zone board; "Ask the Tiki" (needs a small server).

## Open questions for Shauna

- None right now.

## Known notes

- Headless Chromium (swiftshader) is slow, so tests drive the game with `simulate()` rather than real time. `tools/checks/play.mjs` serves `dist/`, runs steps passed in the `STEPS` env var (JSON list of `{name, js, shot}`) and saves screenshots; it needs the globally installed Playwright (`NODE_PATH=$(npm root -g)`). `window.__shoreline.debug.holdCamera = true` stops the follow camera so a check can place it.
- Moving a prop: change `src/layout.js`, then `node tools/checks/run.mjs layout-check` prints each prop's distance to water, the circuit edge and the paths.
- A material that changes its shader in `onBeforeCompile` needs its own `customProgramCacheKey` set before `shade()` patches it, or other standard materials can share its program (the terrain shader once turned paths, the road and props black).
- Startup builds distance grids for the whole island (about 0.4 s on a laptop).
- Vercel builds one project at a time for this account; a stuck build elsewhere (for example faf-app) blocks deploys here.
- Right after a deploy, the live site can serve the old bundle for a minute. Retry once the bundle hash matches.
- Every Blender export includes all scenes in the .blend: always run `tools/glb-clean.mjs` (it also compresses the model).
- `src/rapier.js` imports `@dimforge/rapier3d/rapier_wasm3d.js` directly: without it the bundler drops the step that hooks up the WebAssembly and the game fails to load ("reading 'rawintegrationparameters_new'").
- Shauna's Desktop folder `/Users/shauna/Desktop/claudecode/shoreline` is a plain copy, not a git checkout. Sessions work in a clone of the repo and copy changed files there after each push.
- Research behind the grass, leaf clumps, shading and camera: `_docs/findings/2026-10-26-reference-grass-trees-camera.md`.
- `simulate()` steps the car and physics only; explosives, the race and other updaters run in the real frame loop, so test them in real time (slow in headless) or in Shauna's Chrome.
- The loader turns spaces in part names into underscores: match names with `n.replace(/_/g, ' ')` (the old car's headlights never glowed because of this).
- Compressed (quantized) model positions cannot be transformed in place; copy them to plain floats first, as `bakeColored` does.
- `window.__shoreline` also exposes `sound` and `fx` for checks; sound levels can be read with an AnalyserNode on `sound.master`.
