# Shoreline

Browser driving game at https://games.shauna.digital/shoreline/. Read `README.md` (stack, file layout, controls), then `_docs/PROJECT_STATUS.md` (what is live, decisions, what is next), then `_docs/ASSET_PROMPTS.md` before making or asking for any new art.

- Three.js 0.170, Rapier 0.14 (raycast vehicle), Vite 5 with `base: './'`. `npm run build` into `dist/`.
- Repo `shaunadigital/shoreline`, Vercel project `shoreline`, team `shaunagits-projects`. Push to `main` and deploy to production by default; do not hand Shauna a local dev server unless she asks. The hub repo `shaunagits/games` mounts the game at `/shoreline/`.
- The island layout lives in `src/island-plan.json`. Change it there, then redraw the sketch with `python3 tools/draw-plan.py art/island-plan.png`.
- New .glb files: run `node tools/glb-clean.mjs in.glb public/models/<name>.glb` first (Blender exports every scene).
- Test with headless Playwright through `window.__shoreline` and `simulate()`; real-time screenshots lag in headless.
- No em dashes in any text. No AI or assistant credit in code, commits or docs.
- All artwork is Shauna's and original. The reference site inspired the feel, the circuit shape and the pools layout only: no copying its art, models, music, names or text. No real brand marks (the off-roader has no Jeep-style grille).
- Shauna creates new GitHub repositories herself.
- Ask before creating a skill. Keep any unanswered question at the bottom of each reply until she answers.
