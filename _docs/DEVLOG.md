# Shoreline devlog

The full story of how Shoreline was made: what Shauna asked for in each session, what was decided and why, how it was built (techniques, files, numbers), what went wrong along the way, and how it turned out. It is written so the project can be pieced back together later, and as source material for posts, case studies or talks.

`PROJECT_STATUS.md` is the short "where are we now" page. This file is the history. Every working session adds a section at the end (see CLAUDE.md).

Dates are Shauna's local dates (Hawaii). Git commit times are in UTC, ten hours ahead, so a late-afternoon session shows up as the next day in `git log`.

---

## How the game is made

**The idea.** A small browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. The feel is inspired by Bruno Simon's 2025 portfolio (bruno-simon.com), with Shauna's own island, vehicle, art, colors and sound. For fun, not commercial. Live at https://shauna.digital/games/shoreline/, mounted inside her games hub.

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

**Asked.** A tropical island driving game in the browser, in the spirit of Bruno Simon's portfolio, living at shauna.digital/games/shoreline.

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

**Music.** Searched for CC0 tropical music (the plan from session 1 ruled out the reference's music) and checked each license on its page, leaving out a steel drum track that needs a credit (CC-BY). Five candidates went to Shauna: Tozan's Caribbean Steel Drums 1 and 2 and Tropoix, wipics' Tropical Loop, Tsorthan Grove's Bamboo Blitz. She picked Caribbean Steel Drums 2, Bamboo Blitz, and Tropoix to play once as an intro. The cloud workspace could download them directly, so she didn't have to. Each was converted to MP3 (Safari doesn't reliably play Ogg) and loudness-normalized to -16 LUFS so no track jumps out (`ffmpeg ... -af loudnorm=I=-16:TP=-1.5`). `public/audio/music.json` lists the intro and the tracks; `public/audio/CREDITS.md` records titles, artists and sources. Tropoix starts when you press Start driving (browsers only allow sound after a click, so it can't play on the title card), then the two tracks take turns with a short pause between them. Music sits quietly under the effects (music bus at 0.32) and the speaker button's middle setting turns it off.

### Volume control

**Asked.** "Can we add volume control on the screen for the user?" then "volume control or easily accessible mute button".

**How.** Both. The speaker button mutes and unmutes in one click (M does too), and a sliders button beside it opens a small panel with Music and Effects sliders. The sliders are squared before they reach the volume so they feel even to the ear; settings are kept in localStorage (`shoreline.audio`). Moving a slider unmutes. Sliders give focus back to the game after a change, so the arrow keys keep driving the car.

**Bug found.** The music player and the music volume were both stored as `music` on the sound object; when a track loaded it replaced the volume number and the browser rejected the volume change. The player is now `player`.

### An intro that covers the loading

**Asked.** "Any ideas for making a little intro like the example, perhaps to take up the loading time?" Three ideas went back: (1) a swoop down from a postcard view of the island, (2) the island grows outward from the car, closest to the reference's feel in our own style, (3) a sunrise as loading finishes. Shauna picked 2.

**How it works.**
1. *Loading:* a dark sea (navy to deep teal) with the logo and a gold ring that fills as the 33 models arrive and the island is built (`setProgress` in `src/main.js`, an SVG ring in `index.html`).
2. *Ready:* the loading screen fades and the real 3D scene shows through, but only a lit circle of the landing (radius 9.5) around the car, with the dynamite and crate stacks inside it, a softly pulsing ring of light at its edge, the logo at the top, a Start button and the controls at the bottom, and "Start" pressed into the sand just behind the car (a canvas texture laid on the ground, turned to read upright from the camera; `START_WORD` in `src/layout.js` keeps grass and props off that spot).
3. *Start:* a click, tap or any key starts the sound and a rising whoosh with a shimmer, and the circle grows outward from the car to cover the island in about 2.6 seconds (it eases in, slow at first then rushing out), the ring of light riding its edge, while the sky and fog brighten from the dark sea to the day.

**The technique** (`src/reveal.js`). Every material in the scene is patched once after the island is built so that anything farther than the reveal radius from the car is not drawn, with a dithered soft edge; the water shader gets the same test. Outside the circle you see the sky dome, which is pulled toward the same dark navy as the loading screen, so the hand-off from HTML to 3D is seamless. When the circle has grown past the view, the radius is set huge and nothing is cut. Driving input is ignored until the start.

**Small fixes found while checking it.** The loading background wasn't cleared when the island was ready (the 3D circle stayed hidden). A beach ball sat on the sand lettering; moving it let a grass patch grow over the word, so the word's spot is now kept bare.

### The opening, like the reference

**Asked.** "Can we add a bunch of dynamic to the beginning scene so that it's easy for the user to run right into it?" Then: "Move it so that it's in front of the car. So that if the user just hits go straight, as most will at first, it will drive them straight into the dynamite."

**How.** Three light crate stacks at the landing that scatter easily, and a dynamite crate directly ahead of the spawn on the car's straight line north, with the biggest crate stack right behind it to catch the blast. Pressing forward first thing sets off the fuse, the blast, the slow motion and a shower of crates.

### Getting unstuck, and the sea

**Asked.** The car got stuck while Shauna was testing: "can we make it so that the car can right itself". And: the surrounding water should be drivable for a short distance, like the reference.

**How.** On its side or roof and not moving for 0.8 seconds, or wedged with the throttle held for 1.5 seconds, the car hops and a damped spring turns it back onto its wheels (in testing: roof to upright in about 3 seconds). The old teleport stays as a 6 second last resort. The sea floor got a shallow shelf about 0.6 deep for 10 units out from every beach, with the same spray and drag as the pools; past it the floor drops away and the car is towed back.

### A UX and UI review of the screen

**Asked.** "Can we have a UX/UI do a quick review of our screen?" (alongside "What if we added more elements, like some wildlife?")

**How.** Screenshots of the loading, ready, playing and volume states at desktop (1280x800) and phone (390x844) went to a separate reviewer that had not seen the build, so the review was not the builder grading its own work. Its read: desktop is in good shape, the phone breaks down.

**What it caught that testing had missed.** The new volume sliders could not be dragged. The whole HUD ignores the pointer so clicks fall through to the game, and only buttons were switched back on; the sliders inherited "ignore". The earlier test clicked the buttons from code, which skips that check. The lesson: test controls with real pointer clicks (Playwright `page.click` and `mouse.click`), not `element.click()`. On phone the volume panel also opened underneath the touch buttons.

**Fixed now** (`src/style.css`, `index.html`):
- Sliders take the pointer; the button row sits above the touch pad (`z-index: 2`). Verified with a real click: Music 70 to 16 on desktop and phone.
- Phone touch pad: buttons 66 to 58 px with a 10 px gap so all five fit a 390 px screen (they overflowed by about 8 px).
- Phone stats: smaller cards, the subtitle line hidden, so all three fit in one row under the logo.
- Phone toast moved to 30% down the screen so it no longer covers the stats; the race timer stays on one line above the controls.
- Safe-area insets for notched phones (`viewport-fit=cover`), keyboard focus rings, reduced-motion support, the toast announced to screen readers, the touch pad hidden from them.

**Left for Shauna to decide** (design calls, not bugs): the ready screen says "Start" twice (button and sand); white on the coral button is low contrast (2.6:1, a deeper coral fixes it); a small "?" help pill for the controls once the start screen's key line is gone.

**Shauna's calls, then built:**
- The ready button now says "Play", so "Start" appears once, pressed into the sand.
- A deeper coral (`--coral-button` #d9502f, 3.9:1 with white text, up from 2.6:1) behind white text on the Play button, the phone gas button and the pop-up messages. The lighter coral stays everywhere else (the logo and the 3D art are unchanged).
- A "?" button at the left of the bottom-right row opens a small controls card: the keys on desktop, a one-line guide to the touch buttons on phone. Opening it closes the volume panel and the other way around; a tap anywhere else closes both. Checked with real clicks on desktop and phone.

**Wildlife.** Shauna asked: "What if we added more elements, like some wildlife? Would that be a lot to add?" The answer: not a lot. Each animal is a small model plus simple motion written in code, and the reactive ones are the fun ones. Ideas offered: crabs that scuttle away from the car, wild chickens that scatter with a squawk, seabirds circling or a flock lifting off, honu resting on the sand or swimming in the shallows, fish or dolphins jumping offshore, butterflies around the flowers. She will make the art next session. The concept prompts given in chat are kept here so the next session can use them. Paste the style block from `_docs/ASSET_PROMPTS.md` first. The "Parts" line names the Blender parts so the code can move them. Aim for about 1,500 triangles for small animals, since several are on screen at once.

#### Wildlife concept prompts

| Animal | What it does in the game | Prompt (after the style block) | Parts |
| --- | --- | --- | --- |
| Crab | Scuttles sideways away from the car | A small cartoon beach crab, round coral shell with cream underside, two big friendly claws, eyes on short stalks, four thin legs on each side. Top-down three-quarter view. | Body, Eye left, Eye right, Claw left, Claw right, Legs left, Legs right |
| Wild chicken | Scatters with a squawk | A plump cartoon wild rooster, rusty orange and gold body, dark teal and green tail feathers in a tall arc, small red comb, yellow beak and legs, standing alert. | Body, Head, Tail, Wing left, Wing right, Leg left, Leg right |
| Seabird | Circles overhead, or a flock lifts off | A simple cartoon seabird in flight, white body, long slender pale gray wings spread wide, dark wingtips, small yellow beak, tucked feet. Viewed from slightly below. | Body, Wing left, Wing right, Tail |
| Honu | Rests on the sand, swims slowly in the shallows | A cartoon green sea turtle, rounded olive and caramel shell with soft plate shapes, cream underside, gentle smiling face, four paddle flippers, front flippers longer. | Shell, Head, Flipper front left, Flipper front right, Flipper back left, Flipper back right |
| Dolphin | Jumps in an arc offshore | A cartoon dolphin mid-leap, smooth gray-blue back fading to a cream belly, curved dorsal fin, friendly face, tail flukes. Side three-quarter view. | Body, Tail, Fin left, Fin right |
| Butterfly | Drifts around the flowers | A tiny cartoon butterfly, rounded wings in sunny yellow with coral edges and small cream dots, slim dark body, two short antennae. Wings open, viewed from above. | Body, Wing left, Wing right |

**Plan for wiring them in.** Each animal is cleaned with `tools/glb-clean.mjs`, loaded like the props, and moved by a small controller in code: legs, wings and flippers swing on their named parts, crabs, chickens and birds read the car's distance and flee or lift off, honu and dolphins follow their own loops. Placement goes in `src/layout.js` (beaches for crabs and honu, open grass near the village for chickens, offshore for dolphins, flowers for butterflies).

### Moments worth writing about

- The design question that started the session, and turning the answer into a working tool: a style board where the picks are saved and read straight back into the work instead of retyped.
- Side by side beats source code: the reference's own numbers gave a quarter-height grass and a too-close camera.
- 21 seconds to 2.5: one feature added that morning was secretly testing every grass blade on the island.
- A whole soundscape with no sound files, and what it took to make a synthesized engine stop sounding robotic (firing pulses, gears, shift dips, crackle).
- From concept image to a Blender script that builds a whole asset kit, and a car loader that fits any car model automatically.
- Designing the first five seconds: put the dynamite where people will drive anyway.
- A fresh pair of eyes: a reviewer that never saw the build found the volume sliders it shipped could not be moved.
- Wildlife as the next layer of life on the island: animals that react to the car, planned with part names so Shauna's models can move.

## Session 5: the car's look and feel (2026-11-01)

**Asked.** "How could I enhance, improve, elevate the look and feel of the vehicle in this game?" After a list of ideas, Shauna picked the first bundle: "build the first bundle and then list what is left so we can decide what to add or remove." A driver character: "Yes that would be great, but lets get the car right first." A paint picker: "No, not yet."

**What the code showed first.**
- The island's shading recipe (`src/shading.js`) replaces the standard lighting entirely, so the roughness and metalness the car loader set did nothing. Every car surface had the same matte finish. A finish has to be drawn by the recipe itself.
- The bevels are already in the model (each part is a box with one bevel segment, exported flat shaded), so smoothing the normals would have turned flat panels pillowy. They stay flat; the new highlight picks them out instead. (The first suggestion in chat said the loader flattened the bevels. Reading the model showed it doesn't, so that change was dropped.)
- The car's meshes cast shadows but did not receive them, so the roll cage and surfboard never shaded the seats or hood.
- The model has no tail lights at all.

**Built** (commit d201f1f):
- **Gloss** (`src/shading.js`): `shade(material, { gloss: [strength, sharpness, metal tint] })` adds a sun highlight to the recipe, a sharp lobe plus a broad faint one, tinted by the base color for metal, fading in shadow. Car finishes in `src/vehicle.js`: glass 1.1 / 160, metal 0.7 / 28 tinted, paint (coral, flares, yellow, teal) 0.55 / 70, cream lamps 0.4 / 50, satin black trim 0.22 / 36, seats 0.18 / 20, rubber none.
- **Glass**: 32% opacity (was 50%), tinted a little toward pale blue.
- **Self-shadow**: every opaque car mesh, the wheels and the board receive shadows.
- **Sprung body** (`Vehicle.updatePose`, called each frame after `sync()`): the body sits on a `pose` group between the physics box and the model. Acceleration is measured in the world and turned into the car's frame (measuring it in the car's own frame first read zero in a steady turn, because that frame turns with the car). Lean out of turns up to 0.08 rad (0.0045 per unit of side acceleration), squat when accelerating and nose dip when braking (0.0045 per unit, -0.07 to 0.06), around a pivot near the axles. Damped springs (stiffness 140, damping 11), stepped in 8 ms slices so they stay stable on slow frames. Landing from a fall faster than 2 units/s pushes the body down into a squash with a slight squash and stretch (up to 5%). Looks only: the physics and the driving are unchanged.
- **Surfboard**: split from the body by part name (`/surfboard/`, which includes its fin and ties) onto its own pivot. It follows the body's lean with extra (1.6x roll, 1.8x pitch) on a looser spring (70, 4.5), so it lags and wobbles, and nods on landings.
- **Ground shadow**: a soft rounded rectangle right under the car, from a Rapier ray straight down that skips the car's own body, laid flat on whatever it hits (ground, ramps, crates). It shrinks to half and fades over the first 3.2 units of height, so jump height reads from the high camera. The sun's shadow stays as it was.
- **Tail and reversing lights**: small lamp pods on the top rear edge of the tub, inboard of the rear fender flares. The first two placements on the rear face were hidden behind the bumper tube and the flares from the game camera, so they moved up. Red tail lamps glow softly by day, more at night, and flare (emissive 3.5, past white so the glow pass catches it) with a halo when braking or on the handbrake. White reversing lamps light up in reverse. `window.__shoreline.carLamps.force = { braking: 1 }` holds them on for checks.
- **Dust by surface** (`src/main.js`, `fx.dust(pos, size, color)`): pale sand on sand, brown on dirt and grass, light tire smoke on the road only when sliding. The front wheels join in when drifting or sliding sideways faster than 2.5 units/s. The surface and slip values are worked out once per frame and shared with the sound.

**Checked.** Before and after close-ups at the same camera spots, a rear close-up with the brake lights held on, a game-camera view, a turn (roll reached its limit at 11.8 units/s) and a jump (ground shadow 0.42 to 0.24 opacity and 3.0 to 2.1 wide at the top; landing squash -0.055 then a small rebound, board nod 0.077). No console errors; plan-check and layout-check unchanged.

**Left to decide** (the list Shauna asked for, given in chat):
- Skid marks you can see on sand and the road (the tire tracks already flatten grass).
- A boost flame or heat shimmer, and speed lines.
- Sand dusting that builds up off-road and washes off in water, with drips and a wet shine after.
- Tire squash on landing and a little sand tint on the tires.
- A driver character (Shauna's art, after the car is right).
- Real tail lights in the Blender model, to replace the code-made pods.
- Paint picker and stickers (not yet).

**Moments worth writing about.**
- The lighting recipe that made the island look hand-painted also quietly erased every material setting on the car. Gloss had to be added to the recipe rather than switched on.
- The lean that read zero: measured in the car's own turning frame, a steady turn has no acceleration at all.
- Tail lights placed where they look right in a model viewer were invisible from the game's camera. Where the player looks from decides where things go.

### Side by side with the reference car

**Asked.** "How can I improve the way the vehicle looks and bring it more to the level of the example?" Then: "Which silhouette do you think would look better?", and a brief for her image generator and Blender script, given in chat (not in a file, at her request).

**Compared** in Shauna's Chrome, same window, both start screens (the reference would not start from an automated click). The reference car reads as one solid mass (closed body, roof, big fenders), uses about two tones plus glowing lights (red body, near-black trim, amber lamps), makes its lights part of the design (roof bar, front strip), breaks big panels with small dark cut-in details, and has colored rims. Ours read busy: an open cage of thin tubes, many colors at similar brightness (coral, darker coral flares, yellow, orange seats, teal, cream, blue-grey metal), lamps lit only at night, grey hubs.

**Decided.** Silhouette: a bolder open buggy with a solid soft top over the cage, rather than a closed body. The high camera mostly sees the roof, so a solid top gives the car a clear shape from above; it keeps the beach identity and the surfboard, stays clearly different from the reference, and leaves the cabin open for the driver character later. Color rule for the new model: coral body, one charcoal trim color (fenders, bumpers, cage, seats), sunny yellow only for rims and one hood accent, amber lamps, cream soft top, teal board.

**Built now** (code, with the current model):
- Headlights and roof lamps glow amber by day (lens color #ffb340, emissive #ff9a2a at 0.45, up to 2.65 at night). A paler lens tint turned pink under the purple shadow color, and a stronger glow clipped to white, so the lens color itself carries the amber.
- Wheel hubs in sunny yellow (#FFC43D): the spare's metal hub gets its own yellow material, and the spare is the template for all four wheels.
- Seats half as bright, so the body reads as one shape against the interior.
- Loader ready for the new model: parts named "Tail light" or "Brake light" and "Reversing" become the model's own tail and reversing lamps (the code-made pods are then skipped); "wheel rim" and "tire" parts count as road wheels unless their name has "spare".

**Part and material names the code expects from the new model** (also in the brief): road wheel parts contain "tire", "wheel rim" or "wheel hub"; every spare part starts with "Spare" and the spare matches the road wheels exactly; lamp lenses contain "lens", housings "housing"; "Tail light lens", "Reversing lamp lens"; every surfboard part contains "Surfboard"; the body tub is "Coral chassis"; materials named coral, black (the charcoal trim), rubber, yellow, cream, teal, teal_dark, glass, seat, metal.


## 2026-11-01: new off-roader asset, local Desktop replacement

Shauna asked: "Replace the Shoreline off-roader (offroader.glb) with a new version", following the concept-first beach asset workflow, with exact game-facing part/material names and a complete-car budget below about 10,000 triangles. She specified a 4.6 m open buggy that reads from high above: broad coral panels, thick charcoal cage, cream soft top, teal surfboard, yellow rims and one hood stripe, oversized tires, matching spare, amber front lenses, and unobstructed high rear red/white lenses.

The concept image was created and shown before the editable Blender model was built. The car is procedural, with two-segment bevels on its main coral panels and one-segment modifiers on small parts. Four real round holes are cut through every rim. The spare and all four road wheels share corresponding mesh data and modifier settings, including all 12 tread blocks. Each of the 179 parts remains its own named mesh object. All 13 prescribed materials and colors survived cleanup; black and seat use different roughness so deduplication keeps their names distinct.

The first model was 11,318 triangles. Hidden tube-cap bevels, tire interior edges, outer-rim edge selection, and small-bolt geometry were adjusted while retaining the visible body bevels. The overhead render then showed the surfboard partly hiding the middle roof lamps and the bumper partly hiding the fog lamps. The roof bar was moved forward of the board nose, the fog lamps moved forward, and the grille slots made genuinely recessed. Final count: 9,470 triangles across all objects, including bevels and all five wheels. The cleanup report's 4,194 triangles counts shared mesh data once, so it is not the complete-car figure. Final compressed GLB: 155,180 bytes, about 152 KiB. Dimensions after cleanup: 2.730 x 3.074 x 4.627 m (+Y up, +Z front, -Z spare, base-center origin).

Validation ran in Blender 5.2.3 LTS and through unchanged copies of tools/glb-clean.mjs and tools/glb-compress.mjs. A separate workspace held the dependencies because the Desktop copy had no node_modules. Checks covered names and colors, zero textures, all 60 road-wheel components identical to the spare, rim through-holes, and visibility ray tests for every front lens and all four rear lenses. An isolated Vite production build passed. Fresh headless Chrome loaded the actual built game with the new asset, found four fitted wheels (radius about 0.408 game units), the surfboard, native tail and reversing lamps, and a finite pose after a short simulation. No JavaScript errors; software-renderer ReadPixels warnings only. This was not a frame-rate benchmark.

The previous Desktop model was saved as previous-offroader.glb in the delivery folder, then public/models/offroader.glb was replaced atomically after hash checks. No game source, physics, loader behavior, dependency file, remote repository, or production deployment was changed. The Desktop directory is a plain project copy, not a Git checkout. Remote integration and any removal of loader stopgaps remain separate work.

Full delivery and evidence: /Users/shauna/Documents/Codex/2026-10-30/please-make-this-graphic-for-this-3/outputs/shoreline-offroader/. It includes the concept and prompt, build_offroader.py, offroader.blend, raw and cleaned GLBs, a full 179-row CSV/Markdown part inventory, all material names/colors, render views, JSON checks, and the game screenshot.

Superseded 2026-11-02: Shauna went back to an open cage, and the open beach buggy v3 replaced this model in the game (see PROJECT_STATUS, The new car). This roof model was never deployed.


## 2026-11-02: New address, shauna.digital/games/shoreline

**Asked.** Shauna: games.shauna.digital "is hard to link to and get to, even for me. The browser often thinks I am searching because it expects the 'https://'."

**Decided.** All games moved under `shauna.digital/games/<game>/` (a folder on the business site, not each game at the top level, so they never clash with business pages and there is one easy address to share). The Midnights hub stays at `shauna.digital/games/` for now (Shauna).

**How.** Nothing in this game moved. The shauna.digital Netlify site proxies `/games/shoreline/*` to `shoreline-psi.vercel.app` (rule in that repo's `netlify.toml`); its strict security headers do not apply to proxied pages, so the 3D, fonts and audio load as before. games.shauna.digital redirects every path to the same path under `shauna.digital/games/` (308). In this repo only text changed: the "More games" link in `index.html`, plus the docs.

**Result.** Checked live with Playwright: loads with no console errors. Player saves are per web address, so anyone who played at the old address starts fresh.

## 2026-11-02 (later): Feedback panel, credit and links

**Asked.** Shauna: credit should go to shauna.dev, not the business site; make sure every game has a way back to the games page; add an in-game feedback panel.

**Built.** The start screen and the "?" controls panel now both show More games, Feedback and Made by Shauna (shauna.dev). Feedback opens the shared panel from the games repo (`https://shauna.digital/games/feedback.js`, one script for all five games): a 1 to 5 face rating, "What should I fix or add?", an optional email, sent by Formspree as "Game feedback: Shoreline". It sits in a shadow root and stops key events, so typing W or any key in the note does not drive the car or start the game (checked with Playwright).

**Went wrong.** The links in the "?" panel first ran together and were pale teal on the light glass panel; `#help-panel p` is a flex row with a 2px gap. Fixed with its own rule (`#help-panel p.help-links`), darker teal (#13615c), underlined.

## Session 6: choosing the new car (2026-11-02)

**Asked.** Shauna started with the roof model from 2026-11-01: "Please look at these outputs and evaluate them for an improvement in the vehicle in this game. Make no changes yet." Then, after the review: "Maybe we should go back to an open cage. Can we try to get another car option from the generator?" She ran each new prompt in her own image generator and Blender session (Codex) and brought back three more versions to judge. Once v3 was in: "Yes please. No character for now... lets just get the vehicle looking better first." After driving it: "The tires come through the top fenders, mostly when I reverse but also when you move forward."

**How each model was judged.** Not from its own renders alone. Each GLB went into a clean clone of the repo, was built, and was screenshotted headless at the same spawn and camera (default zoom, closest zoom from the front quarter, closest zoom from behind) next to the live car. Composite images went to Shauna each round: live vs roof model, then live vs roof vs open v1, then live vs v1 vs v2, then live vs v2 vs v3.

**Round 1, roof model (built 2026-11-01, never deployed).** Clean build: 179 named parts, exact palette, 9,470 triangles, native tail and reversing lamps, spare identical to the road wheels. But from the game camera the cream soft top covered the cabin and most of the coral, so the car read as a cream rectangle on a dark chassis, with the board shrunk to a stripe. It also had square box fenders, tractor-like paddle tread, small rims that went brown in game light, and rear lamps on tall posts. Lesson: a studio render from the side flatters a roof; the game camera looks down, so the roof is the car.

**Round 2, open buggy v1.** Prompt written here: no roof, board on two cage crossbars, rounded coral fenders instead of charcoal boxes (to cut the dark mass), a slimmer cage, about 20 small rounded tread blocks, larger rims with flush centers, rear lamps flush in the tub corners. Result: the best concept so far; in game it read as a coral beach buggy again. Gaps: the tires sat tucked inside the fenders, the rims filled the wheel and read tan, the rear lamps were tiny, and the coral panels were faceted.

**Round 3, v2 (a Blender pass, prompt written here).** Tires pushed out 12.5% of their width past the fenders, rims cut to about 60% of the wheel with thicker rubber, rear lamps doubled, smooth shading with weighted normals on the coral, bent cage corners, a 12,000 triangle cap, plus a render from the game's own camera (25 degree lens, 41 degrees up, 45 degrees round, car about 150 px long). Gains showed most at the rear lamps. The model grew from 2.71 m to 3.16 m wide, which widens the game's wheel track by about 17%, because the physics wheels are fitted to the model's wheels.

**Round 4, v3.** Codex generated a new concept from the v2 render, then lowered and raked the nose, replaced the square rear lamp blocks with rounded shoulders, filled out the board and enlarged the arches slightly. 11,560 triangles, 182 parts, 12 colors, about 186 KiB. A smaller step than v2 but the best so far; the remaining gap to its concept (flat-sided fender shells) is left for later, if it bothers Shauna while driving.

**Ideas on file, not built.** Ways to get more from model generation: judge at game size in Blender, weighted normals as the cheapest softening, a bigger triangle budget for the one car, parts named for motion. Character ideas offered (race number, own badge, side wave, beach gear in the back, antenna pennant, lei, spare cover, sand dust, mud flaps, plate). Shauna: the car's look first, character later.

**Built and deployed.**
- `public/models/offroader.glb` is v3 (commit 3ea10e7).
- Rims in shade: the shading recipe multiplies the shadow side by a deep purple, which turns yellow into tan. Yellow parts (rims and hood stripe) now get an emissive glow of their own color at 0.3 in `prep()` in `src/vehicle.js`. Tried 0.14 first: still tan. At 0.3 the shaded spare reads golden and lit rims do not wash out.
- Tires through the fenders (commit c395007, looks only, driving unchanged). Measured headless with a small tool that casts rays straight up from points across each tire's tread to the body above. Cause: the body was placed for a suspension length of 0.33 (`WHEEL_REST_DROP`), but the car actually settles at about 0.22, so the tires sat about 0.17 inside the fenders standing still. Braking and boosted turns compress the suspension to its 0.05 limit, about 0.3 inside. The model's own arches give only about 0.04 to 0.05 of room above the tire. Fix: `WHEEL_REST_DROP` is now 0.22; the loader measures that room per wheel from the model (`fit.arch`, a small `rayUp` helper); and `updatePose` lifts the body each frame just enough to keep a 0.02 gap (`ARCH_MARGIN`) when a wheel compresses further. Checked standing, full throttle, hard braking, reverse, stopping from reverse, reverse turns and boosted turns: every tire stays at least 0.02 clear, where it was up to 0.3 inside before.
- Docs: PROJECT_STATUS (the new car), ASSET_PROMPTS (offroader row), and the 2026-11-01 roof model entry from the other session merged into this devlog with a note that v3 replaced it.
- Shauna's Desktop copy brought up to date (nine files, each checked by hash against the repo). The first copy was blocked as an overwrite until Shauna approved it.

**Went wrong, and the lessons.**
- The fender problem was in the game code from the start, not the model: the 0.33 seat height was a guess written for an earlier car with more room above its tires. Each review here judged the models standing still at the spawn, where the tires looked "tucked in" and that was blamed on the fenders. Lesson: when a model looks wrong in game, measure the fit (wheel to arch) before blaming the art.
- The headless screenshots run on a software renderer; Shauna's own drive caught the fender clipping. Keep asking her to drive after any car change.

**Result.** Live at shauna.digital/games/shoreline: the open beach buggy v3, yellow rims that hold their color in shade, and tires that stay inside their arches. Not yet judged by Shauna: how the wider track drives, and whether the body lift on hard braking looks too stiff.

**Moments worth writing about.**
- Four car models in one day, each judged inside the game rather than from its pretty render, and the roof model rejected because the game camera looks straight down at the roof.
- An AI image generator and a Blender script as the art pipeline, with Shauna directing it and bringing each version back for a side by side.
- A "model problem" that turned out to be one wrong number in the code (0.33 instead of 0.22).

## Session 7: opening at night (2026-11-03)

**Asked.** Shauna: "Lets work on the Shoreline game. Check github and prod for latest. Can we evaluate starting at night, the way the example does?" After the evaluation she picked the recommendation: "First the night look pass, then A", and to push it and then compare with the reference in her Chrome.

**Checked first.** GitHub `main`, the live site and the Desktop copy all matched (live bundle `index-m7Vn4bny.js`, rebuilt from `main` to the same hash; Desktop files matched the repo by hash).

**What the reference actually does.** Read from its source (`sources/Game/Cycles/DayCycles.js` and `Cycles.js` in brunosimon/folio-2025). It does not always start at night. Its day runs on the real clock, a 4 minute loop timed from the current time, so everyone visiting at the same moment sees the same time of day, and night (dusk to dawn) is 45% of the loop. About half of all visits land in the evening or at night. Its night is a strong, saturated blue light (`#3240ff`, intensity 3.8, against 1.2 by day), deep violet shadows and navy to plum fog, and it uses night as a switch: pole lights turn on, sounds and the map change, and the opening's reveal circle takes the night color.

**Our night before.** Screenshots at `?time=night` showed a dimmed, washed out day: pale grey sand, a muddy maroon car, a cream ring in the opening, and nothing glowing at the landing except the car.

**Options offered.** A, always open at night and let dawn come about a minute after Start. B, the reference's shared clock with more night. C, Hawaiʻi real time. Recommended A after a look pass, because every visitor gets the same strong first impression and the dark sea loading screen flows straight into it. Shauna: A. This replaces the 2026-10-30 call that every visit starts in daytime.

**Built** (`src/daycycle.js`, `src/reveal.js`, `src/vehicle.js`, `src/layout.js`, `src/main.js`):
- Night keyframe: light `#4c5aff` at 1.15, shadow `#3016b0`, sky top `#050a2a`, middle `#161d5e`, bottom `#3a2068`, fog `#1d1a54`, water tint (0.2, 0.26, 0.62). Sunset and dawn moved a little toward pink and violet so the change into and out of night is smooth.
- Edge light (`SHADE.uRim`) follows the time of day: 0.5 by day, 0.65 at sunset and dawn, 1.1 at night, so outlines read against the dark.
- The opening's ring and pool of light take the time's color (`reveal` per keyframe: warm `#ffe3a3` by day, moonlit `#9fa8ff` at night) through `Opening.setTint`. The pool texture is now white and tinted by its material.
- Four tiki torches round the landing (`LANDING_TORCHES` in `src/layout.js`: (3.6, 27.8), (-7.2, 29.5), (2.6, 19.2), (-6.2, 19.4)), inside the lit circle, beside the paths, kept clear of grass and trees and counted in the torch crackle sound. Added to `layout-check`.
- The car stays coral: coral and fender materials get an emissive of their own color that rises with night only (0 by day, 0.3 at night, in `updateCarLamps`).
- Night start: `NIGHT_START` 0.73. The clock waits on the start screen and starts with `dayCycle.start()` when the player presses Start; dawn's colors begin about 54 s later (phase 0.88) and full day arrives about 97 s after Start. `?time=` still holds one time. `window.__shoreline.dayCycle` added for checks.

**Tuning rounds.** First pass light `#5f6cff` at 1.75: the sand near the car went almost white lilac and the car stayed maroon. Second, `#5462ff` at 1.4 with the car glow at 0.4: the car read coral but slightly flat. Third, `#4c5aff` at 1.15, glow 0.3: kept.

**Checked.** Headless at night: waiting screen, 25 s after Start, and a high view of the island. Clock check: phase holds at 0.73 before Start, runs after, night still at +56 s, day at +96 s. `plan-check` and `layout-check` clean, no console errors.

**Went wrong.** `pkill -f "vite preview"` in the same shell command matched the shell itself and killed it, twice, before any screenshot was taken; a leftover preview server then held the port so the next run waited forever. Lesson: free ports with `fuser -k <port>/tcp`, not `pkill -f` with a pattern that appears in the command.

**First side by side in Shauna's Chrome** (same window, 792 x 415, the reference caught at deep night by timing its clock). Ours read as dusk, not night: the ground in the circle was pale lavender, close to white, where the reference's is a mid-dark slate violet. The reference gets its contrast from a few warm lights (a lamp post, the headlights) against that dark ground, and its circle edge is a crisp bright line; ours was faint. Outside the circle both were dark blue-violet already. Our car read as coral, as intended. Shauna: go ahead with a darker tune.

**Second pass** (commit 56e9c1f):
- Night light `#6a5aff` at 0.78 (from `#4c5aff` at 1.15): a little more violet and darker.
- The opening's soft pool of light fades to about a third at night (`multiplyScalar(1 - 0.65 * night)` in `Opening.setTint`), so the start screen reads as night instead of a spotlight.
- The ring is a thin line (inner radius 0.965 instead of 0.9), whiter, and just past white at night so the glow pass gives it a soft halo; it pulses less (opacity 0.85 to 1).
- Torch light pools grow at night (3.2 up to 4.4 times the light's size) and are stronger (opacity 0.5 from 0.35).
- Ground in the circle now measures about (105, 85, 150) on the start screen and (94, 69, 138) after Start, against the reference's (97, 74, 154).

**Went wrong (second pass).** Lowering the night light seemed to change almost nothing. Three rounds of smaller and smaller numbers (1.15, 0.75, 0.66, 0.46) all measured nearly the same. Cause: the headless "after Start" screenshots were taken while the opening was still growing (the software renderer runs at a few frames a second, so the 2.6 s opening takes about half a minute of real time), and the opening's pool of light covered the landing. The start screen comparison in Chrome had the same pool at full strength. Measured properly (a minute after Start, then each light level held 15 s), the light does drive the ground as expected, and 0.46 was too dark. The pool itself was the main reason the start screen looked pale. Lessons: in headless checks, wait for the opening to finish before judging colors; and on the start screen, check what the opening adds before blaming the lighting. A first try at a brighter ring (color times 2.5 at night) blew the glow pass into wide white smears; the final ring sits only just past white.

**Result.** Live: every visit opens on a moonlit, slate-violet landing with four torches throwing warm pools of light and a thin lilac ring, the island spreads out in the blue night, and the sun comes up about a minute and a half in.

**Moments worth writing about.**
- "The way the example does" turned out to be a shared real-time clock, not a night start; we kept the feeling (opening at night) and chose a scripted sunrise instead.
- The trick that keeps a coral car coral under blue moonlight: let its paint glow faintly in its own color, only at night.
- Chasing a "too bright" night by turning the moon down, when the real culprit was the opening's spotlight sitting on top of it.

**Second side by side in Shauna's Chrome** (same window, reference at deep night). Ground in the circle about (93, 72, 118) against the reference's (89, 69, 150): the same darkness, ours a little warmer because our ground is warm sand and theirs is grey tile. Torches stand out against the dark sand as the reference's lamp post does; the ring is a crisp lilac line; the car reads coral. Kept warm on purpose (a beach). Shauna: "Looks good for now." Session closed; work continues in another session.

## Session 8: music off, sound control on the start screen (2026-11-04)

**Asked.** Shauna: "Can you turn off the music, so it's just sound effects, etc? And put a volume/mute button on the main screen."

**Decided.**
- Music off, not deleted: a `MUSIC = false` switch at the top of `src/audio.js` makes `loadMusic()` return before fetching `music.json`, so no track downloads. The tracks and the player code stay, so music can come back with one line.
- With music gone there is one volume, so the in-game panel's Music and Effects sliders became a single Volume slider.
- "Main screen" read as the start screen (the in-game HUD already had mute). The control sits under Play, in the same dark pill style as the links row, so it fits on a phone without crowding the logo.

**Built.**
- `index.html`: `.intro-sound` row under Play with `#intro-sound` (speaker) and `#intro-vol` (slider, 0 to 100). Both speaker buttons share the class `sound-toggle`, both sliders `vol-sfx`.
- `src/main.js`: one `updateSoundButton()` updates every speaker button and slider, so the start screen and HUD always agree. A speaker click with the slider at zero unmutes to 80% rather than staying silent. The start screen's "tap anywhere to play" now ignores taps on the sound row (`closest('a, .intro-sound')`).
- `src/style.css`: the start screen sound row (34 px round speaker, 120 px slider, teal accent).
- Settings still save to localStorage (`shoreline.audio`); the old music value is kept but unused.

**Checked.** Headless at 1280 x 800 and 390 x 844: mute and slider work on the start screen, do not start the game, update the HUD controls and saved settings; Play still starts; no requests to `audio/` files.

**Went wrong.** Playwright's normal `click()` on the start screen timed out (the software renderer runs a few frames a second, so the page never looks "stable"). Dispatching the events directly worked. The first push was refused because the repo was not attached to the session yet; attaching it fixed it.

**Result.** Live: no music, just the engine, waves, birds and the rest; a mute button and volume slider under Play on the start screen.

### Part 2: recorded sound effects

**Asked.** Shauna asked whether we had sounds for driving over water, into an explosive or into a tree (we did, all made in code, with trees sharing one general crash thud), then: "Can we find some actual sounds for these rather than code-generated, like we did for the music, etc?" Music files: keep them for now.

**Decided.**
- Same source as the music: OpenGameArt, CC0 only (searched with its CC0 and sound effect filters). Kenney and Freesound were not reachable from the build machine.
- Shauna picks by ear. About 450 clips were downloaded, cut down by length and loudness to 3 to 6 options for each of ten sounds, levelled to the same peak and put on a private listening page (a Claude artifact) with Play and Pick buttons and a Copy my picks button. Each option links to its OpenGameArt page.
- Her picks: Splash E (thimras, Ocean splash), Driving through water D (rubberduck, 100 CC0 SFX #2 water loop), Shore waves A (jasinski's Alki Beach recording via qubodup), Explosion F (pauliuw, Explosion somewhere far), Fuse A (themightyglider), Fireworks D (rubberduck fw_04), Hitting a tree F (rubberduck wood hit), Crashing into things C (rubberduck hit), Bushes C (qubodup dry leaves rustle), Landing A (rubberduck hit).
- Trees get their own sound now (they shared the crash thud before).
- Kept in code: engine, tires, skids and anything that changes continuously with speed or surface, plus chimes, birds, crickets and torches. Shauna said yes to looking for a recorded engine, so that is the next pick.

**Built.**
- `public/audio/sfx/`: nine mono MP3s (96 kbps) and `water-loop.wav` (22 kHz mono). The loop is a WAV because MP3 adds a few milliseconds of silence at the start, which would click at every loop. 632 KB in all.
- `src/audio.js`: `SAMPLES` maps names to files; `loadSamples()` fetches and decodes them when sound starts; `sample(name, gain, { vary, rate })` plays one with a random pitch change (6 to 12 percent). Every one-shot tries its recording first and falls back to the coded sound. The water loop takes over the old noise layer's volume control (times 1.6). Waves: a recorded wave breaks every 2.6 to 5 s at 0.05 plus up to 0.45 near the shore, over a very faint hush of the sea. Big explosions play slightly lower.
- Gains: splash 0.55, crash 0.42, tree 0.5, landing 0.45, bushes 0.22, fuse 0.3, explosion 0.85, firework 0.45 (times distance and impact strength as before).
- Trees: `island.trees` filled by `World` (palms) and `Flora` (other trees), 186 trunks. `main.js` plays `tree` instead of `hit` when the car stops suddenly within 2.4 of a trunk.
- `public/audio/CREDITS.md`: a sound effects table with file, use, original name, creator and link.

**Checked.** Headless: all ten recordings decode, the water loop starts, 186 trees found, every sound plays with no console errors. Live bundle confirmed.

**Engine options.** Five CC0 engine recordings added to the listening page: domasx2's racing loop (cut from a public domain recording of a real car), two from pauliuw, two phone recordings from ggbotnet. A recording alone does not show how it would sound in the game, so each got a seven-second revving preview made by looping a steady piece of it and speeding it up and down (idle, up with a gear change dip, back to idle), next to the recording as it is.

**Engine built.** Shauna: "B". The preview's piece of pauliuw's recording (3 s from 0:08, ends crossfaded over 60 ms so it loops without a seam) is `engine-loop.wav` (22 kHz mono, 130 KB). `startEngineLoop()` plays it into the engine's existing chain, after the saturator so the recording is not distorted. Each frame its speed is 0.75 + (revs above idle / 5500) x 1.15, the same 0.75 to 1.9 range as the preview she heard, and the coded firing loops are muted. The throttle filter opens much wider for the recording (1400 Hz plus up to 2600 with throttle) since the coded loops needed a dark filter to sound right and the recording does not. Checked headless: the loop loads and the revs drive it; no errors.

**Moments worth writing about.**
- Picking sounds like picking music: a page of options to play side by side beat describing them in words.
- A real recording of a tree knock needs the game to know it hit a tree; the physics only reported "a sudden stop", so the game now remembers where every trunk is.
- The tiny gap MP3 puts at the start of a file is why the one looping sound ships as a WAV.

### Part 3: big bowling pins

**Asked.** "Can we make the bowling pins big like they are in the example?" And how hard the reference's confetti floating in the wind and lying on the ground would be.

**Measured, not guessed.** The reference's source is public (MIT, github.com/brunosimon/folio-2025), and its models are in the repo. Reading the glTF files: its pin (`refPinPhysicalDynamic`) is 1.02 wide and 2.97 tall; its car body is about 3 long (4.07 model units at 0.735 scale); its pins sit 1.15 apart down the lane and 1.44 across. So its pins stand about as tall as the car is long. Ours were 1.16 tall next to a 2.85 car, about 40 percent.

**Built** (`src/games.js`): `PIN_H` 2.8, `ROW` 1.1, `ACROSS` 1.38, `LANE_W` 6 (was 3.2). The tiki model scales to 2.8 (from 1.16), the collider is a cylinder 0.44 across and the pin's full height, density 1.5 (mass about 2.5 against the car's 120; at 0.65 the pins flew ahead of the car like paper, at 14 times the old weight the car would bounce off). Down when tipped or moved 1.2 (was 0.7). The triangle starts 3.4 from the lane centre so the back row fits on the lane. Rails, torches and sign move out with the width. `BOWLING` moved from z -19 to -18.2 because the wider lane's north rail ran into the hut deck stairs; its clear zones grew (layout 4 to 5.5, grass apron 3.5 to 4.8, flat ground 4.5 to 5.6).

**Checked.** `layout-check` clean for the lane and pins; headless, a straight full-throttle run from the lane start knocks all ten (twice, at both lane positions). Screenshots by day show the pins as tall as the car.

### Part 4: moving leaves, confetti, sound levels

**Asked.** Both the reference's effects: "Both I guess." Sound: "The explosion is a little quiet, the rest are good. Maybe the ocean should be a little more quiet."

**What the reference does** (read from its source): `Leaves.js` keeps a few thousand small cards in a square that follows the player and moves them on the graphics card (WebGPU compute): pushed by the vehicle, lifted while moving fast, wind from a noise texture, explosion push, heavy damping on the ground, light on water, gravity, and cards that leave the square wrap round to the other side. `Confetti.js` pops 500 pieces in three pastel colors on achievements and checkpoints, up and out over 5 s. Our game is WebGL, so the same ideas are written as plain code, with our own numbers and colors.

**Built.**
- `src/drift.js` (new): `Drift`, 2,400 instanced leaf and petal cards (1,300 on phones) using the litter's petal shape and colors, in a 70 square round the car (wider than the camera sees). Each card has a weight (0.55 to 1) so light ones fly further and fall slower. Car: within 2.6 and above speed 2, cards are pushed with the car's velocity and outward, and lifted. Falling: top speed 0.8 to 2, sway, spin and tumble. Ground damping 7 per second, water 0.7 with a slow drift downwind. Wind: a resting card checks the gust about every 2 s (the grass's noise texture read on the CPU) and is pushed when it is strong. Blasts use `fx.blastAt`. Resting cards sleep; none are placed on the open sea, fewer on the road.
- `src/litter.js`: the fixed scatter cut from 9,000 to 2,400 (petals under trees and leaves on props unchanged), since the moving cards now cover the ground round the car; exports its colors and petal texture.
- `src/fx.js`: `confetti(pos)`, 260 bits shooting up 6 to 12 and out up to 4.5, falling like paper, landing flat and shrinking away at 6.5 s; `celebrate()` now starts with it.
- `src/audio.js`: explosion recording at 1.5 (was 0.85) plus a coded deep thump at 0.45; waves 0.03 plus up to 0.28 near the shore (was 0.05 plus 0.45), the sea hush 0.008 plus 0.012 (was 0.012 plus 0.02).

**Checked.** Headless by day: driving through the landing kicked up about 190 cards (160 in the air), they settled and slept again; cards float on the landing pool; a confetti burst over the car. Cost per frame in swiftshader: 0.66 ms with cards resting, 1.36 ms with all 2,400 awake. No console errors.

**Moments worth writing about.**
- The reference does this on the graphics card; a few thousand cards is small enough to do in plain code, as long as resting ones sleep.
- One noise texture drives the grass, the tree leaves and now the loose leaves, so a gust visibly crosses all three.

### Part 5: ground confetti, rain and rainbow, surf, secrets

**Asked.** From the ideas list: "I want 3. And 2 and 1. Plus the cave behind the waterfall hidden secret, and any others you can think of." (1 rain showers with a rainbow, 2 confetti that blows along the ground, 3 surf and spray.) Before that, about the confetti: "The example has it kind of blowing in the wind along the top of the surface, but I like this for now."

**Ground confetti** (`GroundConfetti` in `src/drift.js`). A burst's bits that land are handed over instead of lying still: lighter than the leaves, they read the same gust noise every frame and slide downwind when it is above a low threshold, flip and hop when moving fast, are kicked up by the car and blown by blasts, and shrink away after 22 to 34 s. Headless: of 260 landed bits, 196 had moved more than 0.3 six seconds later with the car standing still.

**Rain and rainbow** (`src/weather.js`).
- A simple state machine: dry 2 to 4 minutes (the first shower a minute or two in), rain 26 to 42 s, then 30 s of clearing. The rain amount eases in over a few seconds and out more slowly; wetness follows more slowly still.
- After the day cycle sets its colors each frame, the weather greys them: sun color toward #c9d2e0 and 30 percent dimmer, sky and fog toward grey (by day only).
- 1,400 line streaks in a 46 square, 22 high box round the car, falling 26 to 36 a second and slanted by the island wind's direction; bluer at night.
- Wet ground: a `uWet` uniform added to the terrain shader darkens the color 24 percent and lowers roughness.
- Rain loop: `public/audio/sfx/rain-loop.wav` from rubberduck's 30 CC0 SFX loops (rain.ogg), already downloaded with the sound packs; Claude picked it, so Shauna has not chosen it by ear.
- Rainbow, wrong first: a ring placed over the sea beyond the island never showed, because the game camera looks down at 41 degrees with a 25 degree lens and never sees the horizon. Fixed by drawing it in the view: a soft seven-band arc parallel to the screen, feet past the bottom corners, faint (0.3) and added on top of the picture, fading in a few seconds after a daytime shower and out after about half a minute.

**Surf** (`src/surf.js`).
- A strip mesh laid along the whole coastline (the coast curve resampled every 0.8, 12 rows from 1.6 out to sea to 3.2 up the beach), following the sand's height.
- One timing used in the shader and in code: a wave every 7 s, out of step along the coast (two slow sines of the distance along it), each running up a different distance (1.3 to 2.5); fast up (30 percent of the cycle), slow back. The water shows below the edge with a broken foam line along it; above it, a fading band of darker wet sand where the wave reached.
- Wrong first: the strip came out jagged. The sea plane's own swell (0.24 up and down on a coarse grid) cut through it, and the terrain's coarse triangles poked through near the waterline (those sand teeth were already there before the surf). Fixed by keeping the strip just above the swell's highest point (0.11) and fading it into the sea, which also covers the teeth.
- In play: spray from the wheels while driving in a wave, and when a wave runs up into the car, a burst of spray and the splash sound.

**Secrets** (`src/secrets.js`, counter in the HUD after the first one, kept in localStorage).
- Behind the falls. No cliffs existed, so one is built in code: a height field 10 deep and 12 wide rising to 5.2, steep at the front, grassy on top, with a slot cut through the front for a cave; the cave's roof is a lumpy cap of the same rock (turns see-through while the car is inside); the collider is a triangle mesh of the same height field. A curtain of falling water (scrolling streaks, top lip leaning out) covers the cave mouth, with a plunge pool and ripples in front, spray at its foot and a soft roar that grows as the car comes near. At the back of the cave, the tiki pin model in shining gold, turning slowly.
  - Placing it: only one open spot west of the landing was free of the circuit, zones, paths and props. Facing east toward the path, the waterfall was seen edge on, because the camera always looks from the south-east. So the cliff turned to face south-east, and a search over positions found (-21, 22): back to the pool, plunge pool about 5 from the path. A tree and later a bush grew in front of the pool until its clear zone was widened (centre moved forward, radius 10.5). The cave slot first was too narrow (the car caught a wall when slightly off centre); widened to 2.8 either side.
- Sky shell: a golden scallop over the jump yard. Measured first: from 15 back at full throttle the car peaks at 3.2 after the first east ramp; with boost through both ramps it reaches 4.85 around x 62. The shell floats at 4.5 there with a faint sparkle column under it; a boosted run passes within 0.44 of it.
- Aloha: typing a, l, o, h, a recolors the car's coral paint (body and darker fender flares) through teal, yellow, pink, lilac, green and back.
- Wave rider: a wave runs into the car while it goes faster than 7.

**Checked.** Headless at each step: rain, wet ground and rainbow by screenshot; ground confetti moving; surf up and back by screenshots at chosen times; the cave found by driving in (counter 1/4), the sky shell found on a boosted run, aloha by key events (2/4). No console errors. `plan-check` and `layout-check` clean.

**Note for later.** The cliff is code-made. If Shauna wants it in her own style, an asset prompt: "A tropical rock cliff about 10 m wide and 5 m tall with a grassy flat top, a cave opening about 5 m wide and 3 m tall in the front face, a smooth lip above the opening where a waterfall would pour, mossy ledges, chunky rounded rock forms." (with the style block from ASSET_PROMPTS.md). The waterfall water, pool and cave contents would stay in code.

**Moments worth writing about.**
- A rainbow in a game whose camera never sees the sky.
- The waterfall had to turn to face the camera, because the camera never turns.
- Surf hid an old flaw: the sand's coarse teeth at the waterline were there all along.
- Four secrets, one per kind of play: exploring (the cave), skill (the sky shell), a typed code, and timing (catching a wave).

### Session close (2026-11-05)

Shauna: "Please update the project docs and close this session." Repo clean and in step with GitHub; her Desktop copy checked file by file against the repo (identical). `PROJECT_STATUS.md` reorganised: session 8 is now the "where we left off" section, grouped by sound, bowling, moving leaves and confetti, and rain, surf and secrets; Next and Open questions carry the unanswered questions (what to change after a drive, the amount of moving leaves, a phone way to the aloha secret) and the ideas offered but not picked; Known notes gained how to test things outside `simulate()` and why things face south-east.

**Session 8 in one line.** Music off and a start screen volume control; recorded CC0 sound effects and engine picked by ear on a listening page; pins as big as the reference's; leaves, petals and confetti that the car and wind move; passing rain with a rainbow; surf on every beach; and four secrets, starting with a cave behind a waterfall.

## Session 9: custom shaders (2026-11-11)

**What Shauna asked.** First: "How would I add my own custom shaders? And what else can I do to enhance the world or my vehicle or the gameplay?" After the answer: "Lets do the shaders so i can add it to my resume/portfolio. What do you recommend doing? Please proceed."

**How shaders already worked in the game** (the answer to the first question). Three ways, all in use before this session:
1. Patch a built-in material with `onBeforeCompile` (the shading recipe in `shading.js`, the grass, the terrain): the object keeps Three.js lighting, shadows and fog, and code is spliced into its GLSL at named `#include` points.
2. A `ShaderMaterial` written from scratch for things that need no sun (the water, the surf). These must include the opening's `REVEAL` uniforms or they show before the island grows in.
3. A full-screen `ShaderPass` in `post.js` (tilt-shift, the warm grade).

**What was decided and why.** Three shaders that each show a different technique, so each can stand on its own on a portfolio page:
- **Caustics** (procedural pattern, shared between two materials): the moving web of light on the floor of the pools and the shallow sea.
- **Dirt on the car** (a material driven by gameplay): sand and mud that build up while driving off the road and wash off in water and rain.
- **Boost speed blur** (screen-space post processing): radial blur, color split and speed lines while boosting.
- Shaders now live in their own files in `src/shaders/`, imported as text with Vite's built-in `?raw` (no plugin needed), so they read as real shader code in the repo. The older shaders stay inside their JS files.

**How each was built.**

*Caustics* (`src/shaders/caustics.glsl`, wired in `src/terrain.js`).
- A Voronoi (cell) pattern whose cell centres orbit slowly. Light gathers where cells meet, so each layer is the gap between the nearest and second-nearest centre (zero on an edge), turned into thin lines with a smoothstep.
- Two layers at different sizes (0.85 and 1.35 times) drift against each other, and a slow sine ripple bends both, so the web keeps re-forming instead of sliding. Where both layers agree, the light is brightest (a product term).
- Red, green and blue are read a hair apart (0.022 and 0.012), which gives the brightest lines a faint rainbow fringe.
- Drawn twice from the same GLSL: on the ground under the water (the terrain shader knows its world height; caustics fade in just below the surface at -0.15 and out by 2.6 deep) at 0.5, and on the water surface in the shallows at 0.26, because the water's color hides most of the floor.
- One set of uniforms (`CAUSTICS` in terrain.js) for both, updated each frame by `updateCaustics`: tinted by the sun color from the day cycle, 0.2 at night (moonlight), dimmed 70 percent in rain. `?caustics=0` turns them off.
- Tuning: the first pass was too bold, with wide lines and a strong rainbow split (screenshots side by side); the lines were thinned (edge widths 0.22 to 0.16 and 0.3 to 0.22), the pattern made finer (0.55 to 0.7 per unit) and the split halved.
- Cost: both draws skip the work where the strength is zero (deep sea, dry land, `?caustics=0`).

*Dirt on the car* (`src/shaders/dirt.glsl`, `src/dirt.js`, hooked in `src/vehicle.js` and one line in `src/shading.js`).
- Every car material except the glass and the lamps gets the dirt before the shading recipe patches it (`addDirt`, then `shade`), with its own program cache key (the lesson from the terrain's black paths in an earlier session).
- Where the dirt sits uses two positions per pixel: the height in the car's own space (from the bottom of the tires to the top of the car, measured at load), so dirt climbs from the tires up the fenders as the amount grows; and the part's own position for the blotchy noise, so the pattern sticks to each part and turns with the wheels instead of swimming over them (the wheels are separate objects that spin).
- The mask: a ragged line that rises from 8 percent of the height when clean to about half the car when caked, a three-octave value noise for blotches and thinner patches, round specks thrown just above the line, and a little dust on upward-facing panels (hood, fenders, the board).
- Dirty paint loses its shine: `shadeDirt` dims the gloss highlight in the shading recipe, and covers the coral paint's faint night glow.
- In play (`Dirt.update`, every frame): fast driving on sand adds 0.016 a second, on earth and grass 0.026, double and a half in a drift, a burst of 0.06 on a landing off the road, nothing on the road; it builds slower as it cakes on. The color drifts toward the ground's (sand `#c4a273`, earth `#7e5e3e`). A pool rinses it off in about 3 seconds and leaves the car wet (wet mud is darker and keeps a little shine); rain rinses it slowly. Headless: 5 s of full throttle off the road gives 0.14; 3 s in a pool takes it back to 0.
- Tuning: at 0.75 the first version covered the whole car and read as a brown car, and its specks were square (one per cube cell). The reach was lowered and the specks made round. `?dirt=0.8` starts the car dirty.

*Boost speed blur* (`src/shaders/speed.frag.glsl`, a `ShaderPass` in `src/post.js` after the warm grade).
- Radial blur toward the car's position on screen (projected each frame), so the car stays sharp and the edges streak. Ten samples starting at a random offset per pixel, which turns the steps between samples into fine grain.
- A small red and blue split at the edges, and speed lines: the view is cut into 180 thin wedges by angle; about one in seven carries a streak that slides outward over time.
- Amount: eases in with the boost (4 per second up, 2.5 down) and grows with speed (6 to 24). The pass is switched off when the amount is zero, so it costs nothing the rest of the time, and it stays off for players whose device asks for reduced motion.
- Tuning: the first screenshot was far too strong (blur 0.1 of the screen, split 0.014, visible sample steps); it went to 0.04, 0.005, jittered samples and a later start (0.22 from the car).

**Checks.** Headless after each change: pool by day from the game camera and close up, the car at dirt 0, 0.5, 0.75 and 1 by day and at night, the boost pass at full strength, and the dirt build-up and wash-off numbers. No console errors. `tools/checks/play.mjs` gained `QUERY` (for example `QUERY='?time=day'`).

**Moments worth writing about.**
- One GLSL file, two materials: the same caustics light the pool floor and the water above it.
- Dirt that climbs: a single number (how dirty) drives a height line in the car's own space, which is how real cars get dirty, bottom first.
- The wheels problem: noise in world space would slide over a spinning tire, so the pattern uses each part's own space and only the height uses the car's.
- A post effect that costs nothing until you press boost.
