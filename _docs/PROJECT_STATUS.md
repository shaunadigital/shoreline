# Shoreline: project status

Last updated 2026-10-30 (style board round 1 session).

## What it is

A browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. Inspired by the feel of Bruno Simon's portfolio (bruno-simon.com), with Shauna's own tropical look, vehicle and art. For fun, not commercial.

- Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)
- Repo: https://github.com/shaunadigital/shoreline (public, branch `main`)
- Vercel project `shoreline` (team `shaunagits-projects`). Deploys go through the Vercel MCP `create_deployment` with `gitSource` pointing at the repo, then check the live bundle hash. The hub (repo `shaunagits/games`) mounts it at `/shoreline/` with one redirect and two rewrites in its `vercel.json`, and shows a Shoreline card (first, with the New sticker).
- Who does what: Shauna makes all the art (concept images, then 3D in Blender, exported as .glb). Claude does code, integration, layout and deploys. Asset prompts and the pipeline are in `_docs/ASSET_PROMPTS.md`.

## Where we left off (2026-10-30)

Read this first next session. Everything below is pushed to `main` and deployed to production.

**How this round worked.** Shauna asked how games like this are normally designed. We made a style board (a private claude.ai artifact, "Shoreline Style Board"): the reference and Shoreline side by side for seven topics, captured in her Chrome at the same window size, with a pick and a note per topic plus three small ideas. Her picks are stored in the board's database (`choices` collection) and were built as follows. A zone-by-zone board was offered; Shauna wants to judge these changes first and decide then.

| Topic | Her pick | What was built |
| --- | --- | --- |
| Light and color | Toward the reference | `src/post.js`: tilt-shift blur at the top and bottom of the screen, a glow on anything brighter than white, a light warm grade and vignette. `?nofx` turns them off. Warmer day sun. |
| Grass | Toward the reference | Thin dense blades (`BLADE_W` 0.12, `SPACING` 0.22, 330 x 330 blades), olive most of the way up with golden tips only, mostly upright, cleaner patch edges (`PATCH` ramp 0.42 to 0.5, fade 0.7). Grass colors `#8f9a3c` / `#7d8c38`. |
| Tree canopies | In between: denser, but keep branches visible and keep or enhance the scattered petals | 130 cards per clump (80 on small screens), fuller insides, clumps 0.8 to 1.3 of `clumpR`, still separate so branches show. Fallen petals in each tree's own colors gather under it (`src/litter.js`). |
| Ground and paths | Toward the reference | Fallen leaves and petals scattered over the land (`src/litter.js`), smaller worn spots of darker earth. |
| Water | Toward the reference | Teal at the shore deepening fast to blue, thin foam lines rolling in, a steady line at the sand, floating leaves (`buildWater` in `src/terrain.js`). |
| Props and buildings | Keep ours, add depth (shading, leaves on top) | Contact shading: the sides of props darken toward the ground (`SHADE_AO` in `src/shading.js`, sides only so roads and paths are unaffected). Leaves dropped onto roofs, crates, carts, signs and the letters by raycast. |
| Time of day | Toward the reference | `src/daycycle.js`: a 6 minute cycle (day holds most of it, then sunset, night, dawn). Sun and shadow colors, sky, fog and water follow; at night torches and the lighthouse glow with halos and pools of light, and the beam brightens. `?time=day|sunset|night|dawn` holds one time; the T key skips to the next. |
| Splashes in the pools | Yes | Spray off every wheel and a gentle drag while in a pool (`fx.splash`, main loop). |
| Grass at the landing | Yes | `LANDING_GRASS` in `src/layout.js`: five hand-placed patches. |
| Darker earth under props | Yes, plus ground variation | `PROP_EARTH` in `src/terrain.js`: trodden darker earth with a worn edge under huts, carts, ramps, crates, signs and the bowling lane. |

**Then, for more depth on props and the car (Shauna asked how the reference car gets its depth):**
- Edge light: faces toward the sun but turned from the camera catch a bright rim (`uRim` in `src/shading.js`, props and the car only).
- Crevice shading: ambient occlusion from the N8AO library (`src/post.js`), half resolution, in a purple tint (`#3b2a73`), with SMAA edge smoothing after the passes. Off on small screens unless `?ao`; `?noao` turns it off on desktop.
- Car lights: parts named "headlight lens", "lamp" or "tail light" glow, with a halo at each lamp and a pool of light ahead at night (`updateCarLamps` in `src/vehicle.js`). New light parts in Blender should have "lamp" in their name.
- Most of the reference car's depth is in its modelling (bevels, separate trim pieces, inset windows and seams, two tones per part, chunky tread). Shauna chose not to add a Blender checklist to the art guide.

**Then, explosions (Shauna asked for them to feel more dynamic, like the reference):** a short fuse (the spark flares for 0.3 s), then a noise fireball brighter than white that swells and burns away with a sooty edge (plus a smaller second one), a shock ring along the ground, tumbling debris that bounces, rolling smoke, a scorch mark that fades over 8 s, sparks, a camera kick scaled by distance, the grass blown flat outward (`uBlast` in `src/grass.js`) and a moment of slow motion when the car is caught close (`fx.boom` in `src/fx.js`). The physics push is unchanged.

**Then, load time (Shauna asked):** from about 21 s to about 6 s in the headless test (a real laptop is faster). The leaves-on-props raycast had been testing the grass mesh (hundreds of thousands of triangles) and cost about 15 s; it now tests only small props near each spot. All models start downloading at once while the physics engine and fonts load, and the grass bake checks only plants near each texel. Then (Shauna approved): models are meshopt-compressed (2.1 MB to 1.3 MB; `tools/glb-compress.mjs`, run automatically by `glb-clean.mjs`, decoded with `setMeshoptDecoder`), and the physics engine moved from `@dimforge/rapier3d-compat` (WebAssembly packed into the script as text) to `@dimforge/rapier3d` with its .wasm as its own file (`vite-plugin-wasm`, build target es2022, imported through `src/rapier.js`). The main script went from 3.1 MB (1.1 MB gzipped) to 1.2 MB (380 KB gzipped) plus a 1.4 MB .wasm the browser compiles while it downloads.

**Sound:** Shauna approved the plan (engine and chimes made in code, everything else from CC0 libraries such as Kenney and Freesound, CC0 tropical music, mute and volume controls). The reference site's sounds cannot be used: its sound effects come from commercial libraries licensed to its author, and the project rule is no copying its music or art.

**Then, Shauna's beach asset kit (2026-10-30):** built in Blender by her script `build_beach_assets.py` (folder `~/Desktop/beach-blender-asset-kit`, every part named, bevels baked in). In the game now: the detailed buggy (`offroader.glb`), palm, square tiki hut without the mask, start gate without faces, pier and bridge section, signpost (`signpost.glb`) and four rocks (`rock-1` to `rock-4`). Code that fits them:
- Car (`loadVehicleModel` in `src/vehicle.js`): fitted automatically. Scaled to 2.85 long, turned so the front (away from the spare) faces +X, the model's own road wheels removed from the body and used to place and size the physics wheels (wider track, about 0.84 out, radius about 0.42) and the body collider widened to match. The spare tire is the wheel template. Lamp parts (lens, headlight, lamp; not housings) glow at night.
- Palm: the trunk base is moved to the collider point (the trunk curves) and the crown pivots where the trunk ends; leaflets are drawn double sided.
- Hut (`buildSquareHut` in `src/world.js`): scaled to 6.6 across, floor sunk to a small bump, colliders for floor, posts and roof, coconut lanterns glow at night.
- Gate (`buildArch` in `src/track.js`): banner reads "Start", the four lamps glow at night.
- Pier and bridges: scaled so decks are 4.8 wide whatever the model.
- Signs (`modelSign` in `src/world.js`): each zone name is painted onto "Sign board face".
- Rocks: random of the four, sized like the old ones, box colliders from the main rock.
- The lighthouse beam now only shows from dusk to dawn.
- Gotcha: compressed (quantized) model positions cannot be transformed in place; copy them to plain floats first (as `bakeColored` does). The sign face once disappeared because of this.

**Then, sound (2026-10-30):** `src/audio.js`. Every effect is synthesized with Web Audio (no files): engine (pitch with speed and throttle, more with boost), tires, skids, water, wind rush, surf near the shore, birds by day and crickets at night (day cycle), torch crackle in the village, and one-shots for shells, rare shells, coins, pins, goals, golf, laps, checkpoints, the race start, explosions (fuse and boom, quieter far away), fireworks, jumps, landings, hits and bushes. Most event sounds key off toast titles (`sound.onToast`), coins and pins off the HUD counts. Speaker button cycles all on, music off, all off; M mutes; kept in localStorage `shoreline.audio`. Music: put CC0 tracks in `public/audio/` and list their file names in `public/audio/music.json` (a JSON array); without that file there is no music.

**Then (2026-10-30):** a dynamite crate at the landing beside the big crate stack (`DYNAMITE` in `src/layout.js`; Shauna expected the landing crates to explode, like the reference's). The sea has a shallow shelf about 0.6 deep for 10 units out from the beach (`heightAt` in `src/terrain.js`), so you can drive into the surf with spray and drag; past it the floor drops away and the car is towed back as before.

**Then, engine and tires reworked (Shauna: less robotic):** the engine is two looping buffers of synthesized four-cylinder firing pulses (low and high revs, crossfaded, played faster for higher revs) through a soft saturator, a body resonance and a load filter, with a five-speed gearbox (shift dips, revs follow the wheels in gear and the throttle when stopped or airborne), intake hiss under load and exhaust crackle on lifting off at high revs. Tires change with the surface (road hiss, sand crunch, earth rumble with pebble ticks); sliding squeals on the road (a wobbling tone and rubber hiss) and scrapes on sand, from the handbrake or the back stepping out in a fast corner. `window.__shoreline.sound` is exposed for checks.

**Then, the landing and self-righting (2026-10-30, Shauna asked, like the reference):** three light crate stacks right in front of the spawn (`LANDING_CRATES` in `src/layout.js`, `crateStack` in `src/world.js`) to drive straight into. The car rights itself: on its side or roof and not moving for 0.8 s, or wedged with the throttle held for 1.5 s, it hops and a damped spring turns it back onto its wheels (`src/vehicle.js`); the old teleport is now a 6 s last resort.

**Art in progress (Shauna, 2026-10-30):** new concept images made for the off-roader (light bar, flares, recessed headlights, knobby tires, suspension), the palm, a rock set of four, the pier and bridge section and a wooden signpost with a blank board. Tiki hut (open sides, thatched three-tier roof, plank floor, coconut lanterns) and start gate (pillars, blank banner, four lanterns, pennants) concepts made too. Name lantern parts with "lamp" so they glow at night, and keep the hut floor thin so the car can drive through. Notes for wiring them in: keep only the spare tire (parts named "Spare ...") as the game copies it to make the wheels; name lights "Headlight lens", "Light bar lamp", "Indicator lamp"; the signpost's blank board part is "Sign board face" (the game paints the zone name on it); match the old car's size (about 4.6 long) and facing in Blender.

**Waiting on Shauna**
- Drive the island and judge this round (all four times of day: press T). Then decide on the zone-by-zone board.
- Phone check with `?debug`: grass is about twice the triangles it was, and the finishing passes add GPU work. Small screens already get fewer blades and cards; `?nofx` shows the cost of the passes.

## Live now (the new island, built 2026-10-26, refined 2026-10-27)

- **Island** from `src/island-plan.json`: flat ground, sandy beaches, nine pools with sandy banks, all shallow enough to drive through (floor about 0.6 under the water, since 2026-10-27), gentle bumps on open grass only. The Oahu terrain and its data are gone.
- **Race circuit**: asphalt with red and white curbs, dashed center line, checkered start line under the race arch, and the short raised, banked turn at the kink on the top straight (about 1.9 high, tilted up on the outside, teal and white rails so you stay on). Lap race: crossing the start line starts the clock, 7 checkpoints around the loop (a glowing strip and a floating marker show the next one), crossing the line again records the lap and starts the next one. A steady test lap takes about 30 s.
- **Sand paths** between the zones, and a wooden bridge (pier sections) where the landing path crosses the south pond.
- **Zones**: Landing (spawn, SHORELINE letters, welcome and Shell Hunt signs, beach balls), Race circuit, Jump yard (four ramps, crate stack, dynamite), Tiki village (hut you can drive through, bowling lane and torches, fruit cart, firework barrel), Sports park (soccer field and goals, mini golf), Beach front (pier, umbrella and chairs, surf rack, coconut bombs), Lighthouse point (lighthouse, rocks), Treasure crater (small rim to climb, chest that spills gold doubloons). Each zone has a wooden sign.
- **Nature**: 110 swaying palms along the beaches and pool shores, 57 flowering trees (poinciana, jacaranda, plumeria, golden shower) inland (120 are tried; the rest find no room clear of paths, props and other trees), 90 hibiscus and monstera bushes you can drive through (they shake).
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

## Next

1. Shauna drives this round's changes and judges them; tune from her notes. Then decide whether a zone-by-zone board is needed.
2. Phone check on a real device with `?debug` (stats-gl panel: frame rate, CPU and GPU time).
3. Sound effects and CC0 music (not the reference site's).
4. Achievements and reasons to keep playing (a list of goals across the mini games, saved in localStorage, shown in a small panel).
5. Devlog ideas not yet built: speed lines at high speed.

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
