# Shoreline: project status

Last updated 2026-10-25.

## What it is

A browser driving game and portfolio piece: drive a little coral off-roader around a tropical island, knock things over, play mini games. Inspired by the feel of Bruno Simon's portfolio (bruno-simon.com), with Shauna's own tropical look, vehicle and art. For fun, not commercial.

- Live: https://games.shauna.digital/shoreline/ (also https://shoreline-psi.vercel.app)
- Repo: https://github.com/shaunadigital/shoreline (public, branch `main`)
- Vercel project `shoreline` (team `shaunagits-projects`). Deploys go through the Vercel MCP `create_deployment` with `gitSource` pointing at the repo, then check the live bundle hash. The hub (repo `shaunagits/games`) mounts it at `/shoreline/` with one redirect and two rewrites in its `vercel.json`, and shows a Shoreline card (first, with the New sticker).
- Who does what: Shauna makes all the art (concept images, then 3D in Blender, exported as .glb). Claude does code, integration, layout and deploys. Asset prompts and the pipeline are in `_docs/ASSET_PROMPTS.md`.

## Live now (built on the old Oahu-shaped island)

- Off-roader with raycast vehicle physics: boost, handbrake drift, jump, anti-roll, air control, flip recovery with the controls, auto-right after 8 s upside down, sea tow back to land.
- Mini games: Tiki Bowling, Shell Hunt (8 shells, 1 rare), treasure chest (18 coins), soccer, mini golf, tiki gate race (laps timed). Best scores in localStorage (`shoreline.bowling`, `.shells`, `.goals`, `.golf`, `.race`).
- Props: palms (instanced, swaying), tiki hut you can drive through, sailboat, torches, lighthouse with beam, pier, beach set, surf rack, fruit cart, dynamite, coconut bombs, firework barrel, crates, letters, ramps, beach balls.
- Effects: explosions, dust, sparks, fireworks on wins.
- Touch controls on phones.

## Decided

| Date | Decision |
| --- | --- |
| 2026-10 | Name "Shoreline". Off-roader, no Jeep-style grille. Public repo. Lives at games.shauna.digital/shoreline. |
| 2026-10-25 | Driving feel is good for now. |
| 2026-10-25 | Replace the Oahu island with a new, flat, designed island. No mountains. No paintable map. |
| 2026-10-25 | **Island plan draft 2 approved, with changes**: `src/island-plan.json`, drawn in `art/island-plan.png`. The circuit copies the general serpentine shape of the reference map's track (mirrored to the east and north side) and the pools copy the reference's pool layout. Nothing else is copied. Changes asked for: add a short raised, banked turn on the top straight (at the small kink near the middle of the north edge), and keep the sports park where draft 2 shows it (open grass between the start straight and the south loop pond). |
| 2026-10-25 | Sound waits until the new island is built. Music: find different CC0 tropical tracks, not the reference site's. |
| 2026-10-25 | "Ask the Tiki" (a Claude-powered chat character): not now, maybe later. It would need a small server with rate limits. |

## Next: build the new island

From `src/island-plan.json` (single source for the sketch and the terrain). Coordinates: game units, x east, z south, shapes are control points for smooth closed curves (`tools/draw-plan.py` shows how they are drawn).

1. **Terrain.** Replace `src/terrain.js` height with a flat island: coast from `coast`, pools from `lagoons` cut to water with sandy banks, small gentle bumps only. Delete `src/oahu-data.js` and the Oahu credit in the README. Keep the shared `heightAt` for visuals and the trimesh collider, and the coast distance texture for the water shader (it must now include the pools).
2. **Race circuit.** Asphalt ribbon mesh along `track.loop` (width 7), red and white curbs on both edges, dashed center line, checkered start line at `track.startLine`, the race arch over it. The banked turn on the top straight. Rework the race game to use the circuit (checkpoints along the loop instead of the old gates).
3. **Paths and bridges.** Sand paths from `paths`. Bridges (pier model) wherever a path crosses water: `draw-plan.py` already finds these crossings.
4. **Zones.** Move every prop and mini game into its zone from `zones` (Landing, Race circuit, Jump yard, Tiki village, Sports park, Beach front, Lighthouse point, Treasure crater). `src/layout.js` holds the positions today. The treasure crater is a small rim to climb, not a mountain.
5. **Nature.** Instanced grass blades in code. Trees from Shauna's new models when they arrive (see ASSET_PROMPTS.md), placed off the track, paths, zones and water like the sketch. Palms along beaches.
6. **Boat** sails around the island on the `boatLoop` ellipse.
7. **Check** with the headless Playwright tests (the `window.__shoreline` hook and `simulate()`), then deploy, then update README.

## After that

- Sound effects and CC0 music.
- Achievements and reasons to keep playing (a list of goals across the mini games, saved in localStorage, shown in a small panel).
- Tree and bush models, once Shauna sends them.

## Known notes

- Headless Chromium (swiftshader) is slow, so tests drive the game with `simulate()` rather than real time.
- Vercel builds one project at a time for this account; a stuck build elsewhere (for example faf-app) blocks deploys here.
- Right after a deploy, the live site can serve the old bundle for a minute. Retry once the bundle hash matches.
- Every Blender export includes all scenes in the .blend: always run `tools/glb-clean.mjs`.
