# Shoreline

Browser driving game at https://games.shauna.digital/shoreline/. Read `README.md` (stack, file layout, controls), then `_docs/PROJECT_STATUS.md` (what is live, decisions, what is next), then `_docs/ASSET_PROMPTS.md` before making or asking for any new art. `_docs/DEVLOG.md` is the full history of every session.

- Three.js 0.170, Rapier 0.14 (raycast vehicle), Vite 5 with `base: './'`. `npm run build` into `dist/`.
- Repo `shaunadigital/shoreline`, Vercel project `shoreline`, team `shaunagits-projects`. Push to `main` and deploy to production by default; do not hand Shauna a local dev server unless she asks. The hub repo `shaunagits/games` mounts the game at `/shoreline/`.
- The island layout lives in `src/island-plan.json`. Change it there, then redraw the sketch with `python3 tools/draw-plan.py art/island-plan.png`.
- New .glb files: run `node tools/glb-clean.mjs in.glb public/models/<name>.glb` first (Blender exports every scene).
- Test with headless Playwright through `window.__shoreline` and `simulate()`; real-time screenshots lag in headless. Checks, from the repo root: `node tools/checks/run.mjs plan-check`, `node tools/checks/run.mjs layout-check`, and after `npm run build`, `NODE_PATH=$(npm root -g) STEPS='[...]' node tools/checks/play.mjs /tmp/shots` (see Known notes in PROJECT_STATUS.md).
- Judge any "look like the reference" request side by side with the live site in Shauna's Chrome at the same window size, not from its source numbers alone.
- No em dashes in any text. No AI or assistant credit in code, commits or docs.
- All artwork is Shauna's and original. The reference site inspired the feel, the circuit shape, the pools layout, and the techniques for grass, leaf clumps, shading and camera framing (written in our own code with our own textures and colors). No copying its art, models, textures, music, names or text. No real brand marks (the off-roader has no Jeep-style grille).
- Shauna creates new GitHub repositories herself.
- Ask before creating a skill. Keep any unanswered question at the bottom of each reply until she answers.
- Before ending a session, add the session to `_docs/DEVLOG.md` (what Shauna asked, in her words where useful; what was decided and why; how it was built, with files and key numbers; what went wrong and the lesson; the result; moments worth writing about) and bring `_docs/PROJECT_STATUS.md` up to date. The devlog should be detailed enough for Shauna to piece together later how she made the game and why, and to use as content.
