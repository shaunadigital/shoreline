# Shoreline: project status

Last updated 2026-11-12, session 10 (the look, the car, wildlife, a trailer and a "How I made it" page).

This page is the current state. The full history (what was asked, decided and why, how it was built, wrong turns) is in `_docs/DEVLOG.md`.

## What it is

A browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. Inspired by the feel of Bruno Simon's portfolio (bruno-simon.com), with Shauna's own tropical look, vehicle and art. For fun, not commercial.

- Live: https://shauna.digital/games/shoreline/ (also https://shoreline-psi.vercel.app)
- Repo: https://github.com/shaunadigital/shoreline (public, branch `main`)
- Vercel project `shoreline` (team `shaunagits-projects`). Deploys go through the Vercel MCP `create_deployment` with `gitSource` pointing at the repo, then check the live bundle hash. The hub (repo `shaunagits/games`) mounts it at `/shoreline/` with one redirect and two rewrites in its `vercel.json`, and shows a Shoreline card (first, with the New sticker).
- Who does what: Shauna makes all the art (concept images, then 3D in Blender, exported as .glb). Claude does code, integration, layout and deploys. Asset prompts and the pipeline are in `_docs/ASSET_PROMPTS.md`.

## Where we left off (2026-11-12, session 10: look, car, wildlife, trailer, "How I made it")

Pushed to `main` and deployed. Session 10 in `_docs/DEVLOG.md` has the detail and the numbers.
- **Look** (`src/atmosphere.js`, `src/shaders/sky-over.glsl`, `src/lights.js`, water shader): drifting cloud shadows (`?clouds=0` off), sun rays through the trees at sunrise and sunset (`?golden` holds them on), heat shimmer on the road at midday, sea mist far out, stars in the water at night, sand blowing across the beaches in gusts, string lights between the tiki torches (132 bulbs, glowing at night).
- **Car** (`src/carfx.js`, `src/garage.js`): headlight pools on the ground at night, horn (H, and a horn button on touch screens), drips after water, sand spray, exhaust flame on boost and pops on upshifts, paint colors unlocked by the secrets and stickers (race number for a lap, hood flower for a strike) from the 🎨 button. Typing aloha cycles the unlocked colors. Saved in localStorage `shoreline.garage`.
- **Wildlife** (`src/wildlife.js`, Shauna's low-poly models in `public/models/`): 14 crabs, 6 roosters, 9 seabirds, 4 honu, 3 dolphins, 12 butterflies, each with its own behavior; crabs and roosters flee the car and the horn.
- **Trailer**: `public/making/trailer.mp4` (30 s, recorded with `?capture` and `tools/trailer.mjs`, encoded by `tools/trailer.sh`, music Bamboo Blitz, CC0).
- **"How I made it" page**: `public/making.html` (served at `/games/shoreline/making.html`), linked from the start screen and the "?" panel.

**Waiting on Shauna (session 10)**
- Read the "How I made it" page and say what to change (it leaves AI out, per the project's no-AI-credit rule; add it if she wants it on the page).
- Watch the trailer; say if she wants different scenes, music or an end card.
- Drive round the new look, car extras and animals and say what to tune.

## Where we left off (2026-11-11, session 9: custom shaders)

Pushed to `main` and deployed to production. Session 9 in `_docs/DEVLOG.md` has the detail and the numbers. Shaders now live in `src/shaders/` as `.glsl` files (imported with Vite's `?raw`).
- **Caustics** (`caustics.glsl`): moving light patterns on the floor of the pools and the shallow sea, and fainter on the water itself. Follows the sun color, faint at night, dimmed by rain. `?caustics=0` turns them off.
- **Dirt on the car** (`dirt.glsl`, `src/dirt.js`): builds up from the tires while driving fast off the road (more in drifts and on landings), in the color of the ground, dulls the paint's shine; a pool washes it off in about 3 s and leaves the car wet, rain rinses it slowly. `?dirt=0.8` starts it dirty. `window.__shoreline.dirt` for checks.
- **Boost speed blur** (`speed.frag.glsl`, in `post.js`): radial blur toward the car, a slight color split and speed lines at the edges while boosting; off when not boosting and for reduced motion.

- **Tree dodge** (`src/assist.js`, same day): the car bends its path round tree trunks it is about to hit (speed unchanged, at most 1.5 radians a second), and trunks have no friction so a clip slides off. Headless: hard hits on trees from 115 of 186 test runs to 14. `?assist=0` turns it off.

- **Five look upgrades** (same day, Shauna picked them from a list): sun glints on the sea and night glow on the water (`src/shaders/water-light.glsl`), puddles after rain on the ground, road and paths (`src/shaders/puddles.glsl`, `src/puddles.js`, `?puddles`), fireflies at night (`src/fireflies.js`, `?fireflies`), skid marks on the road and tire tracks on sand and earth (`src/skids.js`), and trees that shake, drop leaves and knock when bumped (`TreeBumps` in `assist.js`, `treeShake` in `flora.js`).

**Waiting on Shauna (session 9)**
- Drive and say how each feels: caustics strength, how fast the car gets dirty and how dirty, how strong the boost blur is, whether the tree dodge feels natural or too strong, and the five look upgrades (glints, puddles, fireflies and water glow, skid marks, tree shake).

## Where we left off (2026-11-04 to 11-05, session 8: sound, big pins, moving leaves, rain, surf, secrets)

Session closed 2026-11-05. Everything below is pushed to `main` (last code commit f742abe), deployed to production and copied to Shauna's Desktop folder. Session 8 in `_docs/DEVLOG.md` has the detail, in five parts.

### Sound

- Music is off; the game plays sound effects only. `MUSIC = false` at the top of `src/audio.js` skips loading `music.json`. The three tracks stay in `public/audio/` (not downloaded while off), so setting `MUSIC` to true brings them back.
- The start screen has a mute button and a volume slider under Play. Tapping them does not start the game.
- In game, the volume panel now has one slider (Volume) instead of Music and Effects. All speaker buttons and sliders stay in sync and remember their setting between visits.

- Recorded sound effects (Shauna picked each by ear on a listening page of CC0 options from OpenGameArt): splash, driving through water (a loop), shore waves (one breaks every 2.6 to 5 s, louder near the shore), explosion, fuse, firework burst, a new tree knock, crashes, bushes and landing. Files in `public/audio/sfx/`, credits in `public/audio/CREDITS.md`, list in `SAMPLES` at the top of `src/audio.js`. Each plays with a small random pitch change; the coded sound plays until a file has loaded or if it fails.
- Trees: World and Flora keep `island.trees` ([x, z, radius], 186 trunks). A sudden stop within 2.4 of a trunk plays the tree knock instead of the crash.
- Engine: Shauna picked option B (pauliuw, Engine sounds (2)). A 3 s piece made into a seamless loop (`public/audio/sfx/engine-loop.wav`), played at 0.75 times its speed at idle up to 1.9 times at the limiter, replacing the two coded firing loops. Gearbox, shift dips, throttle filter (opened up for the recording), intake hiss and exhaust crackles unchanged.
- Still made in code: tires, skids, jump whoosh, firework launch whistle, wind, birds, crickets, torches, chimes and tunes.
- Music files kept in the repo for later (Shauna, 2026-11-04).
- A listening page of every option (a private Claude artifact, "Shoreline Sound Picks") was how Shauna chose; the clips are not in the repo.

### Bowling

- Big bowling pins like the reference's (Shauna, 2026-11-04). From the reference's source models: its pins are 2.97 tall and its car about 3 long, so ours are 2.8 tall next to our 2.85 car (2.4 times the old 1.16), spaced 1.1 between rows and 1.38 across (its 1.15 and 1.44, scaled). Lane widened from 3.2 to 6, torches and sign moved out, the lane moved 0.8 south (BOWLING z -18.2) to clear the hut deck, and its clear zones in layout, grass and terrain widened. Pins weigh 1.5 density (about 5 times the old pins, still light next to the 120 car); a pin counts as down when tipped or moved 1.2. Headless: one straight run at full throttle from the lane start knocks all ten.

### Moving leaves and confetti

- Loose leaves and petals that move (`src/drift.js`, Shauna: like the reference's): 2,400 cards (1,300 on phones) in a 70 square round the car. The car kicks them up and along, they flutter down, gusts of the island wind (the grass's noise, read on the CPU) push some, explosions (`fx.blastAt`) blow them out, and on pools they float and drift. Cards that leave the square come back in on the far side; resting cards sleep. About 0.7 ms a frame settled, 1.4 ms with all awake (headless). The fixed scatter in `litter.js` thinned from 9,000 to 2,400; petals under trees and leaves on props unchanged.
- Confetti bursts (`fx.confetti`): 260 paper bits in coral, teal, sun yellow, pink, cream and sky blue shoot up, flutter down, rest and shrink away over 6.5 s. Part of every celebration (strike, lap, treasure, golf, firework barrel).
- Sound levels after Shauna's drive: explosion louder (1.5, plus a deep thump under it), shore waves quieter (0.03 plus up to 0.28 near the shore, the sea hush halved). The rest she said are good.
- Confetti that lands is handed to `GroundConfetti` (`src/drift.js`): it skitters along the ground with the island's gusts, hops, gets kicked up by the car and blown by blasts, and shrinks away after 22 to 34 s (900 at most).

### Rain, surf and secrets

- Rain showers (`src/weather.js`): the first a minute or two in, then every 2 to 4 minutes, 26 to 42 s long. Light greys and dims, sky and fog grey (by day), 1,400 rain streaks slanted by the wind round the car, the ground darker and a little shiny (`uWet` in the terrain shader, drying slowly), and a recorded rain loop (rubberduck, CC0, picked by Claude, not yet heard by Shauna). After a daytime shower a faint rainbow arcs across the view for about half a minute; it is drawn in the view, not the world, because the camera never sees the sky. `?weather=rain` starts one at once.
- Surf (`src/surf.js`): a strip of shallow water along the whole coastline runs up the sand every 7 s, out of step along the coast and each a different distance (1.3 to 2.5), with a foam edge, and slides back leaving darker wet sand. The strip sits just above the sea's swell, which also hides the sand's coarse teeth at the waterline. Spray while the car drives in a wave; a burst and splash when a wave runs into the car.
- Secrets (`src/secrets.js`, a Secrets counter appears in the HUD after the first, kept in localStorage `shoreline.secrets`):
  - Behind the falls: a rock cliff just west of the landing (`FALLS` in layout.js, facing south-east toward the camera) with a waterfall over a cave mouth and a plunge pool. Drive through the water into the cave: a spinning golden tiki (the pin model in gold), the cave roof turns see-through, confetti. The cliff is built in code (a height field with a slot for the cave, a lumpy cap for the roof, collider from the same triangles), not one of Shauna's models.
  - Sky shell: a golden scallop floating at (62.5, 4.5, -6.5) over the jump yard with a faint sparkle column under it; reachable only by boosting through both east ramps (headless: a boosted run passes within 0.44 of it; a plain run peaks around 3).
  - Aloha: type A L O H A; the off-roader's paint changes (teal, yellow, pink, lilac, green, back to coral) each time.
  - Wave rider: a wave runs into the car while it is going faster than 7.

**Waiting on Shauna** (also under Open questions)
- Drive round the new things and say what to change: rain (look, how often, the rain sound), the rainbow, surf, the waterfall cliff (made in code; she could make a cliff model instead, see the prompt in the devlog), the secrets.
- How the amount of moving leaves feels (too many, too few, about right).
- Should phone players get their own way to the aloha secret (for example tapping the logo five times)? Today it needs a keyboard, and the sky shell needs the boost key.

## Where we left off (2026-11-03, session 7: opening at night)

Session closed 2026-11-03. Pushed to `main`, deployed to production and copied to Shauna's Desktop folder. Session 7 in `_docs/DEVLOG.md` has the detail and the reasons.

Every visit now opens at night (Shauna's pick, option A) and dawn starts about a minute after Start, with full day about 97 s in. The reference does not always start at night: its day runs on a shared real-time clock, so about half its visits land at night.
- Night look: violet moonlight (`#6a5aff`, 0.78), violet shadows (`#3016b0`), navy to plum sky and fog, darker blue water, stronger edge light at night (`uRim` 1.1). Tuned darker after the first side by side with the reference: ground in the circle now about (94, 69, 138) against its (97, 74, 154).
- The opening's ring and pool of light take the time's color (lilac at night); at night the pool fades to about a third and the ring is a thin line just past white. Torch light pools are bigger and stronger at night.
- Four tiki torches round the landing (`LANDING_TORCHES` in `src/layout.js`).
- The coral paint glows faintly in its own color at night only (0.3), so the car stays coral.
- `NIGHT_START` 0.73 in `src/daycycle.js`; the clock waits on the start screen. `?time=day` and the T key still work. `window.__shoreline.dayCycle` for checks.

Compared side by side with the reference in Shauna's Chrome twice; after the darker tune Shauna: "Looks good for now."

**Waiting on Shauna (night)**
- Play the first minute and a half live and say how the night feels and whether the sunrise timing is right.
- Optional: push the night ground bluer (now a little warmer than the reference's, kept warm on purpose for the sand).

## Session 6: the new car (2026-11-02)

Everything below is pushed to `main`, deployed to production and copied to Shauna's Desktop folder. Session 6 in `_docs/DEVLOG.md` has the detail, the four models compared and the reasons.


The car is now Shauna's **open beach buggy v3** (`public/models/offroader.glb`), picked after comparing four models side by side in the game:
- Roof model (2026-11-01, cream soft top over a thick cage): built and tried on the Desktop copy only, never deployed. From the game camera the roof hid the cabin and coral body and the car read as a cream box on a dark chassis, so Shauna went back to an open cage.
- Open buggy v1, v2, v3 (2026-11-02): open cabin, coral fenders, board on the cage. v2 pushed the tires out past the fenders, made the rims smaller with thicker rubber, doubled the rear lamps, smoothed the coral panels and bent the cage corners. v3 lowered and raked the nose, replaced the square rear lamp blocks with rounded shoulders that hold the lamps, and made the board fuller.
- v3: 11,560 triangles, 182 named parts, 12 flat colors, 4.6 m long, 3.16 m wide, about 186 KiB. It has its own tail and reversing lamps (the code-made pods are skipped automatically) and its spare is an exact copy of the road wheels (the game builds its wheels from the spare).
- Source and evidence: `/Users/shauna/Documents/Codex/2026-10-30/please-make-this-graphic-for-this-3/outputs/open-beach-buggy-v3/` (concept, `build_open_buggy.py`, editable .blend, renders, part list, `GAME_HANDOFF.md`).
- Code: yellow parts (rims, hood stripe) get a small glow of their own color (`emissiveIntensity` 0.3 in `src/vehicle.js`), so the purple shadow tint no longer turns the rims brown in shade, most visibly the spare from the chase camera. The other stopgaps (seat darkening, the spare's metal hub recolor, the amber lens override) are harmless with this model and stay.
- Tires through the fenders (Shauna saw it reversing and driving forward, fixed the same day, looks only): the body was seated for a suspension length of 0.33, but the car settles at about 0.22, so the tires sat up to 0.17 inside the fenders standing still and up to 0.3 on hard braking. Now `WHEEL_REST_DROP` is 0.22, the loader measures the room above each tire from the model (`fit.arch`), and `updatePose` lifts the body just enough to keep a 0.02 gap when a wheel compresses further. Checked headless standing, accelerating, braking, reversing, reverse turns and boosted turns: every tire stays clear.
- The model is wider than the old car (3.16 m against about 2.7 m before scaling), and the wheel track comes from the model (about 17% wider in game), so the car sits wider and should feel more planted.

**Waiting on Shauna (the new car)**
- Drive it and say how the wider track feels, and whether the body looks too stiff on hard braking (it now lifts a little to keep the tires clear).
- Character and markings (race number, badge, beach gear, pennant and the rest): later, after the car's look is settled. Possible further model pass: rounder fenders closer to the v3 concept, only if the flat fender shells bother her while driving.

## Session 5 summary (2026-11-01)

**Done in session 5** (detail in `_docs/DEVLOG.md`, session 5): the car's finish and feel. Gloss added to the shading recipe (glossy paint and glass, tinted metal, satin trim, matte rubber), clearer glass, self-shadowing, a sprung body that leans out of turns, squats, dips and squashes on landing (looks only, driving unchanged), a surfboard that lags and wobbles, a soft ground shadow that fades with jump height, tail lights that flare on braking and reversing lamps (code-made pods: the model has none), and dust colored by surface with the front wheels joining on slides.

Then a side by side with the reference car: amber lamps by day, yellow wheel hubs, darker seats, and the loader made ready for a new car model (session 5, Side by side with the reference car).

**Waiting on Shauna (session 5)**
- The car's feel is good for now (her words: "Good for now"). The other car ideas (skid marks, boost flame, sand build-up, tire squash) wait.
- Driver character: after the car's look is settled. Paint picker: not yet. Desktop logo and island-plan images stay as they are for now.

### Session 4 summary (2026-10-30)

Everything below is pushed to `main`, deployed to production and copied to Shauna's Desktop folder. Session 4 in `_docs/DEVLOG.md` has the detail and the reasons.

**Done in session 4**
- Style board round 1 (private artifact "Shoreline Style Board", https://claude.ai/artifact/RFYSw7ENMaEGeCrpx3zUL3, picks in its `choices` collection) and everything it asked for: thin olive and gold grass, fuller trees, fallen leaves and petals, trodden earth under props, deeper water with foam and floating leaves, pool splashes, landing grass, warm grade and tilt-shift, a day and night cycle with night glows, contact shading and leaves on props.
- Depth: edge light, crevice shading (N8AO, off on phones), glowing headlights.
- Explosions with a fuse, fireball, shock ring, debris, smoke, scorch, camera kick, grass blown flat and slow motion.
- Load time from about 21 s to about 2.5 s (raycast fix, parallel downloads, meshopt models, Rapier wasm as its own file).
- Shauna's beach asset kit in the game: detailed buggy (auto-fitted), palm, square hut, start gate, pier and bridges, signposts with painted zone names, four rocks.
- Sound, all made in code (`src/audio.js`): engine from firing pulses with gears, tires by surface, ambience and event sounds; speaker button and M.
- Intro (Shauna's pick, option 2): a dark sea loading screen with a filling ring, then only a lit circle of the landing with "Start" in the sand, then the island grows outward from the car on start (`src/reveal.js`).
- Volume: the speaker button mutes in one click (M too); the sliders button beside it opens one Volume slider. The start screen has its own mute and volume (2026-11-04).
- Music: off since 2026-11-04 (effects only). The picks are kept for later (all CC0): Tropoix once as the intro, then Caribbean Steel Drums 2 and Bamboo Blitz taking turns (`public/audio/`, `music.json`, `CREDITS.md`).
- The opening: crate stacks at the landing and a dynamite crate straight ahead of the spawn with the big stack behind it.
- The car rights itself when stuck; a shallow sea shelf you can drive into.
- UX review by a fresh reviewer, then fixes: volume sliders now take the pointer (they did not before), phone layout (touch pad fits, stats in one row, toast and race timer clear of each other), "Play" button so "Start" shows once, deeper coral (#d9502f) behind white text, a "?" controls card, focus rings, reduced motion, safe areas for notched phones.

**Start of the next session**
- Shauna brings the wildlife art. The concept prompts and the part names the code expects are in session 4 of `_docs/DEVLOG.md` (Wildlife concept prompts). Wire in whichever animals she made: crabs, wild chickens, seabirds, honu, dolphins, butterflies.

**Waiting on Shauna**
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
| 2026-10 | Name "Shoreline". Off-roader, no Jeep-style grille. Public repo. |
| 2026-11-02 | Lives at shauna.digital/games/shoreline (moved from games.shauna.digital, which redirects; Shauna: the subdomain was hard to type and link to). |
| 2026-11-02 | Start screen and "?" panel show More games, Feedback (shared panel from the games repo) and Made by Shauna (shauna.dev). Start screen links sit on a dark pill so they read on the sand. |
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
| 2026-10-30 | Day and night cycle of 6 minutes, day holding most of it, every visit starting in daytime (Shauna: "great for now"). Start superseded 2026-11-03. |
| 2026-10-30 | Shauna's own models come from concept images plus her Blender script `build_beach_assets.py`; the versions without tiki faces and the hut mask are used. Shauna declined adding a Blender checklist or the new prompts and naming rules to the art guide, and declined a bevel script. |
| 2026-10-30 | The new car changes the driving feel on purpose: wider track and bigger wheels taken from the model, so it is more planted. Shauna drove it: "Car seems right for now." |
| 2026-10-30 | All sound effects are made in code; no sound files. The reference's sounds are not usable (commercial libraries licensed to its author). Music will be CC0 tracks Shauna picks. |
| 2026-10-30 | The opening copies the reference's idea, not its content: drive straight forward from the spawn into a dynamite crate with a crate stack behind it. |
| 2026-10-30 | The car rights itself when stuck (hop and spring), instead of waiting for a teleport. |
| 2026-10-30 | Music: Tropoix (Tozan) plays once as the intro, then Caribbean Steel Drums 2 (Tozan) and Bamboo Blitz (Tsorthan Grove) take turns. All CC0 from OpenGameArt, credited anyway in `public/audio/CREDITS.md`. |
| 2026-11-04 | Music off, sound effects only (Shauna). Mute and volume added to the start screen. Music code kept behind `MUSIC` in `src/audio.js`. Music files kept. |
| 2026-11-04 | Recorded CC0 sound effects replace the coded ones for splash, water, waves, explosion, fuse, firework burst, tree, crash, bushes and landing (Shauna picked each). Engine: option B, recorded loop pitched by the revs. |
| 2026-10-30 | Intro: option 2, the island grows outward from the car (picked over a swoop from above and a sunrise). |
| 2026-10-30 | Project docs keep a full history in `_docs/DEVLOG.md`, detailed enough to reconstruct how and why the game was made and to use as content (Shauna asked). |
| 2026-11-03 | Every visit opens at night and the sun rises about a minute after Start (option A, picked over the reference's shared real-time clock and Hawaiʻi time), after a night look pass. |
| 2026-11-12 | Wildlife uses Shauna's low-poly animal set (`animal-models-lowpoly`), scaled up for the game camera. Stickers go on top surfaces (the buggy's sides are open). The trailer is recorded frame by frame in capture mode, not in real time. |
| 2026-11-11 | Custom shaders for the portfolio: caustics, dirt on the car, boost speed blur (Claude recommended, Shauna said proceed). New shaders go in `src/shaders/` as `.glsl` files imported with `?raw`. |
| 2026-11-11 | Trees stay where they are; the car steers round them (tree dodge) and trunks are slippery, instead of thinning or moving trees (Shauna asked for easier driving round trees). |
| 2026-11-02 | Open cage instead of a soft top: the roof hid the coral body and cabin from the game camera. The car is Shauna's open beach buggy v3; character and markings wait until the car's look is done. |

## Next

0. Wildlife is in (session 10). Possible next: animals in more places, seabirds landing on the pier, chickens following the car.
1. Tune from Shauna's drive of the session 8 additions: rain, rainbow, surf, waterfall cliff, secrets, the amount of moving leaves.
2. Phone check on a real device with `?debug` (phone layout fixed from the UX review on 2026-10-30).
3. Achievements and reasons to keep playing (goals across the mini games, saved in localStorage, shown in a small panel).
4. Ideas offered in sessions 8 and 9, not yet picked: (session 9) heat shimmer on the asphalt, sun rays through the trees, a light sea mist in the distance, boost flame, tree dodge round rocks and signposts, tides, people, a second vehicle, stunt scoring, a daily challenge, deliveries; (session 8) ghost car on the race (best lap as a see-through car), a shareable result card after a strike or lap record, an online leaderboard (small Supabase table), horn and headlights, speed lines and a camera shake on boost, game controller support, photo mode, a "how it was made" page from the devlog. Older: the zone-by-zone board; "Ask the Tiki" (needs a small server).
5. Optional: Shauna models a cliff for the waterfall (prompt in session 8 of the devlog) to replace the code-made one.

## Open questions for Shauna

- After a drive: anything to change about the rain, rainbow, surf, waterfall cliff or secrets?
- The amount of moving leaves: too many, too few or about right?
- A phone way to find the aloha secret (for example tapping the logo five times)?

## Known notes

- New car model: before judging how it sits, check tire to fender room while driving, not just at the spawn. The car settles at a suspension length of about 0.22 and compresses to 0.05 on braking and hard turns; `fit.arch` (measured from the model at load) and `updatePose` keep a 0.02 gap. Session 6 in `_docs/DEVLOG.md` describes the headless measurement (rays straight up from the tread to the body).
- Test HUD controls with real pointer clicks (Playwright `page.click`, `mouse.click`), never `element.click()`: `#hud` has `pointer-events: none` and only buttons and `#sound-panel` switch it back on, so anything new inside the HUD that takes input needs `pointer-events: auto`.

- Headless Chromium (swiftshader) is slow, so tests drive the game with `simulate()` rather than real time. `tools/checks/play.mjs` serves `dist/`, runs steps passed in the `STEPS` env var (JSON list of `{name, js, shot}`) and saves screenshots; it needs the globally installed Playwright (`NODE_PATH=$(npm root -g)`). `window.__shoreline.debug.holdCamera = true` stops the follow camera so a check can place it.
- Moving a prop: change `src/layout.js`, then `node tools/checks/run.mjs layout-check` prints each prop's distance to water, the circuit edge and the paths.
- A material that changes its shader in `onBeforeCompile` needs its own `customProgramCacheKey` set before `shade()` patches it, or other standard materials can share its program (the terrain shader once turned paths, the road and props black).
- Free a stuck preview port with `fuser -k 4179/tcp`; `pkill -f "vite preview"` in the same command kills the shell running it.
- Startup builds distance grids for the whole island (about 0.4 s on a laptop).
- Vercel builds one project at a time for this account; a stuck build elsewhere (for example faf-app) blocks deploys here.
- Right after a deploy, the live site can serve the old bundle for a minute. Retry once the bundle hash matches.
- Every Blender export includes all scenes in the .blend: always run `tools/glb-clean.mjs` (it also compresses the model).
- `src/rapier.js` imports `@dimforge/rapier3d/rapier_wasm3d.js` directly: without it the bundler drops the step that hooks up the WebAssembly and the game fails to load ("reading 'rawintegrationparameters_new'").
- Shauna's Desktop folder `/Users/shauna/Desktop/claudecode/shoreline` is a plain copy, not a git checkout. Sessions work in a clone of the repo and copy changed files there after each push.
- Research behind the grass, leaf clumps, shading and camera: `_docs/findings/2026-10-26-reference-grass-trees-camera.md`.
- `simulate()` steps the car, physics, bowling, shells, extras (explosives), the circuit and effects, but not the camera, grass, sound or the opening; drive into things with `car.reset(pos, yaw)` aimed at them, then `simulate()`.
- The opening hides everything outside a circle until the player starts: headless checks that need the whole island must press a key or click `#play` first (`play.mjs` clicks it).
- The loader turns spaces in part names into underscores: match names with `n.replace(/_/g, ' ')` (the old car's headlights never glowed because of this).
- Compressed (quantized) model positions cannot be transformed in place; copy them to plain floats first, as `bakeColored` does.
- The real-time loop runs only a few frames a second in headless Chromium, so anything not in `simulate()` (weather, drifting leaves, ground confetti, `fx` bursts, secrets) is tested by calling its `update()` in a loop from the step's script, for example `s.weather.update(1/60, s.camera, s.car.position, 0)`. To screenshot the surf at a chosen moment, hold `s.surf.mat.uniforms.uTime` at that time.
- The game camera always looks from the south-east and never sees the sky: anything that should face the player (the waterfall) faces south-east, and the rainbow is drawn in the view.
- Secrets are kept in localStorage `shoreline.secrets`; remove that key to test them again.
- In headless checks, wait about a minute after Start before judging colors: the opening's pool of light covers the landing until it finishes, and the software renderer takes about half a minute of real time to play it.
- Car materials get the dirt (`addDirt` in `src/dirt.js`) before `shade()`; anything new that patches the car's materials must chain the same way. A post pass that is only sometimes on should set `pass.enabled = false` when idle.
- Trailer: `npm run build && NODE_PATH=$(npm root -g) node tools/trailer.mjs /tmp/trailer` (about 4 s a frame in the cloud browser, so about an hour; `STRIDE=15` for a quick preview of every 15th frame), then `tools/trailer.sh /tmp/trailer`. Don't rebuild `dist/` while it runs.
- `window.__shoreline` also exposes `sound`, `fx`, `dayCycle`, `SHADE`, `dirt`, `post`, `wildlife`, `garage`, `atmosphere`, `carFx` and `captureFrame` (the shading uniforms) for checks; sound levels can be read with an AnalyserNode on `sound.master`.
