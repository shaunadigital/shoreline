# Shoreline devlog

The full story of how Shoreline was made: what Shauna asked for in each session, what was decided and why, how it was built (techniques, files, numbers), what went wrong along the way, and how it turned out. It is written so the project can be pieced back together later, and as source material for posts, case studies or talks.

`PROJECT_STATUS.md` is the short "where are we now" page. This file is the history. Every working session adds a section at the end (see CLAUDE.md).

Dates are Shauna's local dates (Hawaii). Git commit times are in UTC, ten hours ahead, so a late-afternoon session shows up as the next day in `git log`.

---

## How the game is made

**The idea.** A small browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. The feel is inspired by Bruno Simon's 2025 portfolio (bruno-simon.com), with Shauna's own island, vehicle, art, colors and sound. For fun, not commercial. Live at https://games.shauna.digital/shoreline/, mounted inside her games hub.

**Who does what.**
- Shauna: direction and every visual decision, all the art (concept images in an image generator, then 3D through an image-to-3D step or her own Blender script, exported as .glb), and testing by driving.
- Claude (working sessions in Claude Code and the Claude app): code, integrating models, layout, testing, deploys and these docs.

**Stack.** Three.js 0.170 for rendering, Rapier 0.14 for physics (its raycast vehicle controller drives the car), Vite 5 for the build, Vercel for hosting. No game engine.

**The loop that made it work.**
1. Shauna says what she wants, often "like the example".
2. Claude reads how the reference does it (its source is MIT licensed, github.com/brunosimon/folio-2025) and writes our own version with our own code, textures, colors and models. Nothing visual is copied.
3. Claude tests in headless Chromium (`tools/checks/play.mjs`), deploys to production, and for any "look like the reference" request compares side by side with the live reference in Shauna's Chrome at the same window size.
4. Shauna drives it and reacts. Repeat.

**Rules that shaped it.** Every asset is Shauna's and original. No brand marks (the off-roader never gets a Jeep-style grille). No copying the reference's art, models, textures, music, sounds, names or text. No em dashes anywhere. No AI credit in code or commits (commits are authored as Shauna). Push to production by default.

---

## Session 1: the prototype (2026-10-25, morning)

**Asked.** A tropical island driving game in the browser, in the spirit of Bruno Simon's portfolio, living at games.shauna.digital/shoreline.

**Built, in order** (git log 10-25 18:52 to 23:27 UTC):
- A first prototype with a car, physics and an island. Narrowed to one vehicle, the off-roader. Relative asset paths (`base: './'` in Vite) so it works mounted at `/shoreline/` inside the games hub.
- Shauna's first Blender models wired in: the off-roader, palm, tiki pin, hut, sailboat, torch and three seashells.
- The island shaped like Oʻahu, from real terrain data. Clouds raised above the camera, a closer camera, the Shoreline logo.
- Shell Hunt (three shell kinds, one rare cowrie), a drive-through tiki hut, then twelve more props and four mini games (Tiki Bowling, soccer, mini golf, the treasure chest).
- "Livelier driving" and recovering from flips with the controls (steer or throttle rocks the car back over, Space hops it).

**Decided, and why.**
- Name "Shoreline". Off-roader only. Public repo.
- Driving feel is good for now (it stayed untouched until the new car in session 4).
- Replace the Oʻahu island with a new flat, designed island: the real terrain was hilly and hard to drive and lay out games on. No mountains, no paintable map.
- Island plan drafts were drawn as a JSON plan plus a sketch (`src/island-plan.json`, `tools/draw-plan.py`). Draft 2 was approved with changes: the circuit follows the general serpentine shape of the reference's track (mirrored to the east and north side) and the pools follow the reference's pool layout; nothing else is copied. Shauna added a short raised, banked turn on the top straight and kept the sports park between the start straight and the south loop pond.
- Sound waits until the new island exists; music must be CC0 tropical tracks, not the reference's.
- "Ask the Tiki" (a Claude-powered chat character in the village): not now, maybe later, because it would need a small server with rate limits.

**Docs created.** `PROJECT_STATUS.md`, `ASSET_PROMPTS.md` (the style block every concept image starts with, one prompt per asset, the export pipeline) and `tools/glb-clean.mjs` (Blender exports every scene in the .blend file; the tool keeps only the active one).

---

## Session 2: the new island and matching the reference (2026-10-25 afternoon into 10-26)

**Asked.** Build the approved island, and make the grass, trees and light feel like the reference.

**How it was done.**
- The island is built from the plan: flat ground, sandy beaches, nine pools, the circuit with curbs, a checkered start line under a race arch, the banked turn, sand paths and a bridge, and eight zones each with a sign. Three small fits found while building: the south pond was cut back where it ran under the start straight, the coast pushed out under the east straight, and the two tightest corners eased so the inside curbs never fold.
- Read the reference's source for technique: camera-following grass (one patch of blades that wraps around the view), leaf clumps for trees (many small leaf cards in a ball, shaded by which way they face the sun), and one hand-made shading recipe for every material (lit side times a warm sun color, shadow side times a purple tint, never gray, plus light bounced up from the ground). Written as our own code on Three.js WebGL with `onBeforeCompile` shader patches, since the reference uses WebGPU and TSL. Notes: `_docs/findings/2026-10-26-reference-grass-trees-camera.md`.
- Camera from the reference's numbers scaled to our car: a narrow 25 degree lens, 41 degrees above the ground, looking in diagonally.

**What went wrong, and the lesson.** Built from the reference's source numbers alone, our grass came out about a quarter of the on-screen height and the camera 1.4 times too close. The source has a default the live site doesn't use. Only putting the two side by side in Shauna's Chrome at the same window size caught it (our car took 215 of 960 pixels against the reference's 150). Since then every "look like the reference" change is checked side by side, never from numbers. A second bug: grass rendered as if in shadow because double-sided blades flip their normal on the back face; fixed by keeping the normal pointing up.

**Decided.** Golden grass and purple shadows. Leaf clumps for tree and bush tops, keeping Shauna's trunks and flowers. The monstera keeps its own split leaves (generic leaf cards would lose its shape). Bushes have no collider, so you drive through and they shake. Commits authored as Shauna with no co-author lines.

---

## Session 3: grass, trees and pools after Shauna's drive (2026-10-27)

**Asked, after driving it.** The full-length grass was too tall everywhere; the leaf clumps were heavy and blocky; a see-through ring around the car looked like a halo; the pools should be drivable.

**Rounds of grass, and why each changed.**
1. Half-height lawn with tufts: read as stubble.
2. Wall-to-wall lawn: read as carpet.
3. Patches with bare sand and packed earth between them (Shauna's call after comparing side by side): patches from smooth noise plus one gathered round every tree and bush, rising from nothing at the edge to about the car's roof in the middle. Then blades curved and softened (three triangles each) because single triangles looked spiky. The terrain is green only under grass.

**Also.** Leaf clumps reworked to single small leaves in looser, smaller clumps with stronger light to dark. Tree trunks never fade near the car. The see-through ring removed entirely. All nine pools made shallow (about 0.6 under the water). The sand path that crossed the soccer pitch split in two. From Bruno Simon's devlog 2: one shared wind for grass and leaves (`src/wind.js`), smooth tire tracks drawn on the GPU that flatten the grass (`src/tracks.js`), per-blade color variation, and a performance panel behind `?debug`.

---

## Session 4: style board, depth, sound and the asset kit (2026-10-30)

The biggest session so far. It started with Shauna asking where things stood and how games like this are normally designed.

### How games like this are designed, and the style board

**Asked.** "How is this type of game normally designed? Would it be helpful to make a design board or two so it's easier to communicate what I want visually rather than going back and forth?"

**Answer.** Game teams communicate visuals with mood boards (reference images grouped by topic), an art bible or style guide (the rules that come out of the mood board), paintovers (drawing on a screenshot of the game, the standard way to give visual feedback), target renders ("beauty shots") and annotated blockout maps. For Shoreline: a style board now, a zone-by-zone board later if needed.

**How the board was made.** Screenshots of the reference and of Shoreline were captured in Shauna's Chrome at the same window size (headless Chromium was too slow to render the reference). Seven topics side by side, each with notes on what each does differently, and a pick per topic: toward the reference, in between, or keep ours, plus a note. Three small ideas from the last session got yes, show me first or no. The board is a private claude.ai artifact ("Shoreline Style Board", https://claude.ai/artifact/RFYSw7ENMaEGeCrpx3zUL3) whose picks save to its own database, so they could be read straight back instead of retyped.

**Shauna's picks.**

| Topic | Pick | Her note |
| --- | --- | --- |
| Light and color | Toward the reference | |
| Grass | Toward the reference | |
| Tree canopies | In between | "Make the leaves more dense, but keep the branches visible more than the reference. I like the scattered petals, keep those or enhance them." |
| Ground and paths | Toward the reference | |
| Water | Toward the reference | |
| Props and buildings | Keep ours | "Maybe we can add some shading or leaves on top to our buildings to give them more depth and realism." |
| Time of day | Toward the reference | |
| Splashes in the pools | Yes | |
| Grass at the landing | Yes | |
| Darker earth under props | Yes | "Darker earth or tiles to add to the ground variation, which helps it feel more real and alive." |

The zone board was put off: Shauna wanted to judge these changes first.

### Building the picks

- **Grass** (`src/grass.js`): thin dense blades (half width 0.12, one every 0.22 units, 330 x 330 blades, about 327,000 triangles), olive most of the way up with golden tips only, mostly upright, cleaner patch edges. Grass colors `#8f9a3c` and `#7d8c38`.
- **Trees** (`src/foliage.js`, `src/flora.js`): 130 leaf cards per clump instead of 80, fuller insides, bigger clumps that still stay separate so branches show.
- **Fallen leaves and petals** (`src/litter.js`, new): about 9,000 small flat cards scattered over the land, and petals in each tree's own flower colors gathered under it. This is the "enhance the scattered petals" note.
- **Ground** (`src/terrain.js`): trodden darker earth with a wobbly worn edge under huts, carts, ramps, crates, signs and the bowling lane, plus small worn spots.
- **Water** (`buildWater`): teal at the shore deepening fast to blue, thin foam lines rolling in, a steady line at the sand, leaves floating on top.
- **Pools**: spray off every wheel and a little drag. **Landing**: five hand-placed grass patches.
- **Light** (`src/post.js`, new): finishing passes over the frame: a tilt-shift blur at the top and bottom of the screen (the miniature look), a glow on anything brighter than white, a light warm grade and a vignette.
- **Time of day** (`src/daycycle.js`, new): a 6 minute cycle, day holding most of it, then sunset, night and dawn. Because every material already reads its sun and shadow colors from one place (the shading recipe), changing those recolors the whole island; sky, fog and water follow. At night the torches and lighthouse glow with halos and pools of light. T skips to the next time; `?time=night` holds one. Shauna approved the 6 minute length.
- **Props**: contact shading (the sides of props darken toward the ground so they sit in it) and leaves dropped onto roofs, crates, carts, signs and the letters.

### Depth like the reference's car

**Asked.** "How do I get the elements to have more depth, like the vehicle in the example?"

**Answer.** Most of the reference car's depth is in the modelling: bevelled edges that catch a highlight, many separate trim pieces that cast small shadows, inset windows and seams, two tones per part, chunky tread, and lights that glow. The code can add the rest. Built:
- An edge light: faces turned toward the sun but away from the camera catch a bright rim.
- Crevice shading (ambient occlusion, the N8AO library) in the island's purple shadow tint, with SMAA edge smoothing after it. Off on phones.
- Headlights that glow at night with a halo and a pool of light on the road.

Shauna then made new concept images with the image generator (car, palm, rocks, pier, signpost, then the tiki hut and start gate), using prompts that asked for bevels, separate trim, inset seams and two tones per part.

### Explosions

**Asked.** "Can we make the explosions more dynamic, like the example?"

**How.** Studied the reference's technique (a noise-dissolved fireball brighter than white, a physics push, a camera roll kick, leaves blown outward, slow motion when the car is hit hard) and built our own in `fx.boom` (`src/fx.js`): a 0.3 second fuse where the spark flares and flickers, a fireball that swells fast and burns away from the edges with a sooty rim (plus a smaller second one), a shock ring along the ground, debris that tumbles and bounces, rolling smoke, a scorch mark that fades over 8 seconds, a camera kick scaled by distance, the grass blown flat outward, and a moment of slow motion when the car is caught close.

### Load time: 21 seconds to about 2.5

**Asked.** "Are there any ways to get the load time down?"

**What was found.** Timing each startup step showed the leaves-on-props raycast (added earlier the same day) was testing every grass blade on the island, about 15 seconds on its own. Fixes:
1. Raycast only small props near each spot.
2. Start every model download at once while the physics engine and fonts load (they used to come in three waves).
3. The grass setup checks only plants near each spot.
4. Compress every model with meshopt (`tools/glb-compress.mjs`, now run automatically by `glb-clean.mjs`): 2.1 MB to 1.3 MB.
5. Load the physics engine's WebAssembly as its own file instead of packed into the script as text (`@dimforge/rapier3d` with `vite-plugin-wasm` instead of `rapier3d-compat`): the main script went from 3.1 MB to 1.2 MB (380 KB over the wire), and the browser compiles the physics while it downloads.

**Result.** About 2.5 seconds to "Start driving" in Shauna's Chrome.

**Gotcha found.** The bundler dropped the step that hooks up Rapier's WebAssembly, so the game failed to load; `src/rapier.js` now imports that step directly.

### Shauna's beach asset kit

Shauna's Blender Python script `build_beach_assets.py` (in `~/Desktop/beach-blender-asset-kit`, with its own README and test report) builds, from her concept images, a detailed buggy, palm, signpost, square tiki hut, start gate, pier section and four rocks, every part named and bevelled. Fitting them in:
- **Car**: fitted automatically. Scaled to the game's car length, turned so the front (the end away from the spare) faces forward, the model's own road wheels removed and used to place and size the physics wheels, the collider widened. The new car is wider with bigger tires, so it is more planted and harder to flip, the first change to the driving feel since session 1. After driving it Shauna said: "Car seems right for now."
- **Signs**: every zone sign is the signpost with the zone name painted onto its blank "Sign board face".
- **Hut, start gate, pier, palm, rocks**: scaled and placed by code; the gate banner reads "Start"; the gate lamps and hut lanterns glow at night.
- The versions with tiki faces and the mask were left out because Shauna's concepts had none.

**Bugs found.** The old car's headlights never glowed because the loader turns spaces in part names into underscores and the code was matching "headlight lens" with a space. And compressed model positions can't be moved in place (the sign face vanished until it was copied to plain numbers first).

### Sound

**Asked.** The plan approved earlier: engine and chimes in code, everything else from free libraries, CC0 music. Using the reference's sounds was ruled out: they come from commercial libraries licensed to its author, and the project rule is no copying.

**How.** It turned out every effect could be made in code with Web Audio (`src/audio.js`), so there are no sound files at all: tires, skids, water, wind, surf that gets louder near the shore, birds by day and crickets at night, torch crackle, and event sounds (shells, coins, pins, goals, golf, laps, checkpoints, the race start, explosions, fireworks, jumps, landings, crashes, bushes). Most event sounds key off the game's existing toast messages. A speaker button and M mute it.

**Then, "less robotic".** The first engine was a few steady tones and sounded like a buzz. Rebuilt the way real engines sound: a stream of individual four-cylinder firings, each slightly different with uneven timing, recorded into two loops (low and high revs) that are played faster or slower and crossfaded, with a five-speed gearbox, shift dips, intake hiss under load and exhaust crackle when lifting off. Tires got a texture per surface (road hiss, sand crunch, earth rumble with pebble ticks), a squeal on the road and a scrape on sand.

**Music.** Still to add: CC0 candidates found on OpenGameArt (Tozan's Caribbean steel drum tunes and Tropoix, wipics' Tropical Loop, Tsorthan Grove's Bamboo Blitz). Shauna picks; tracks go in `public/audio/` with a `music.json` list.

### The opening, like the reference

**Asked.** "Can we add a bunch of dynamic to the beginning scene so that it's easy for the user to run right into it?" Then: "Move it so that it's in front of the car. So that if the user just hits go straight, as most will at first, it will drive them straight into the dynamite."

**How.** Three light crate stacks at the landing that scatter easily, and a dynamite crate directly ahead of the spawn on the car's straight line north, with the biggest crate stack right behind it to catch the blast. Pressing forward first thing sets off the fuse, the blast, the slow motion and a shower of crates.

### Getting unstuck, and the sea

**Asked.** The car got stuck while Shauna was testing: "can we make it so that the car can right itself". And: the surrounding water should be drivable for a short distance, like the reference.

**How.** On its side or roof and not moving for 0.8 seconds, or wedged with the throttle held for 1.5 seconds, the car hops and a damped spring turns it back onto its wheels (in testing: roof to upright in about 3 seconds). The old teleport stays as a 6 second last resort. The sea floor got a shallow shelf about 0.6 deep for 10 units out from every beach, with the same spray and drag as the pools; past it the floor drops away and the car is towed back.

### Moments worth writing about

- The design question that started the session, and turning the answer into a working tool: a style board where the picks are saved and read straight back into the work instead of retyped.
- Side by side beats source code: the reference's own numbers gave a quarter-height grass and a too-close camera.
- 21 seconds to 2.5: one feature added that morning was secretly testing every grass blade on the island.
- A whole soundscape with no sound files, and what it took to make a synthesized engine stop sounding robotic (firing pulses, gears, shift dips, crackle).
- From concept image to a Blender script that builds a whole asset kit, and a car loader that fits any car model automatically.
- Designing the first five seconds: put the dynamite where people will drive anyway.
