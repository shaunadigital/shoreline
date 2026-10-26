# Shoreline asset prompts and pipeline

How every 3D asset in Shoreline is made, the shared style, the prompt for each asset, and how a new one gets into the game. Use this when making anything new so it matches what is already on the island.

Note on the prompts: the exact wording of the first prompts was lost when an earlier working session was compacted. The prompts below were rebuilt from the finished models (their parts, proportions and the colors in their materials), so they produce the same look. If Shauna still has the originals in her image generator's history, paste them over these.

## Pipeline

1. **Concept image.** Shauna makes one image per asset in an image generator, using the style block plus the asset prompt below.
2. **3D model.** The image goes through an image-to-3D step and is finished in Blender. Each asset (or each batch of assets) is its own scene in one .blend file, with parts named in plain words ("Hood", "Spare tire", "Lid") and flat colored materials, no textures.
3. **Export.** File > Export > glTF 2.0 (.glb) with the asset's scene active. Blender exports every scene in the file, so the extra scenes always come along.
4. **Clean.** From the repo root: `node tools/glb-clean.mjs in.glb public/models/<name>.glb`. It keeps only the active scene, merges duplicates, drops unused data and prints the triangle count, size, materials and parts. Check that the kept scene is the right one.
5. **Wire it in.** `src/main.js` loads the models (the first list near line 94, the `extraNames` map for props, trees and bushes, `loadVehicleModel` for the car). Trees and bushes are placed and swayed in `src/flora.js`: a tree's trunk parts are picked by name (trunk, root flare, branch, fork, knot) and everything else sways as the leafy top. `bakeColored` in `src/models.js` merges a model into one fast vertex-colored mesh. GLTFLoader turns spaces in part names into underscores, so code looks parts up with `nm()`.

Targets: under about 5,000 triangles per prop (palms and trees are instanced, so under about 3,000 there), real-world-ish size in meters (the off-roader is about 4.6 long), origin at the base center, +Y up, front facing +Z where it matters.

## Style block (paste before every asset prompt)

> Stylized low-poly 3D game asset, chunky toy-like proportions, smooth simple shapes with soft bevels, flat solid colors with no textures, no outlines and no text. Warm tropical palette: coral #FF6B4A, teal #26B7B1, sunny yellow #FFC43D, cream #FFF1DA, warm wood #A87950 and light wood #C79867, dark wood #5D402C, leaf greens #8DBA42 / #61953D / #447E39. Single object centered, three-quarter view from slightly above, soft even studio light, plain light gray background, whole object in frame. Original design, no logos or brand marks.

For a Blender-friendly result add: "Separate, clearly readable parts. Symmetrical where it makes sense."

## Palette in use (from the finished models)

| Name | Hex | Used on |
| --- | --- | --- |
| Coral | #FF6B4A | Off-roader body, bands, stripes, flags |
| Teal | #26B7B1 | Surfboards, chairs, trims |
| Dark teal | #215A60 | Lighthouse cap, barrel hoops |
| Sunny yellow | #FFC43D | Off-roader accents, fuses, gold trim |
| Cream / white | #FFF1DA / #F5F3E8 | Stripes, sails, pins |
| Wood / light / dark | #A87950 / #C79867 / #5D402C | Everything wooden |
| Straw | #DDB650 / #E8C56C | Hut roof |
| Bamboo | #C7A86B | Soccer goal, torches |
| Rope | #E9D6AA | Pier, arch, goal |
| Greens | #8DBA42 / #61953D / #447E39 / #A4CB4B / #69A848 | Fronds, golf green |
| Coconut | #8C5D3B | Coconuts, coconut bombs |
| Brass / gold | #C99C40 / #FFC34D | Chest, lighthouse |
| Glass | #C6ECED / #B7D9DF | Lighthouse lamp, windshield |
| Rock | #858C89 | Lighthouse base |

## Assets made so far

| File | Scene in the .blend | Size (m) | Prompt (after the style block) |
| --- | --- | --- | --- |
| offroader.glb | Beach Buggy | 4.6 x 2.5 x 2.3 | A small two-seat open-top off-road beach buggy. Coral body, black roll cage and simple slatted grille (not any real brand's grille), sunny yellow accents, orange-red seats, big chunky tires, round headlights, pale blue windshield, a spare tire mounted on the back and a teal surfboard strapped on top. Friendly and toy-like. |
| palm.glb | Palm and Tiki Assets | 3.4 x 3.6 x 3.6 | A coconut palm tree with a gently curved segmented trunk in warm browns, a full crown of broad bright green fronds in several shades, and a small cluster of brown coconuts under the crown. |
| tiki-pin.glb | Palm and Tiki Assets | 0.9 x 2.3 x 0.9 | A bowling pin shaped like a carved tiki statue: cream wood, a simple friendly carved face, a coral band around the neck. |
| tiki-hut.glb | Four Beach Props | 3.5 x 3.6 x 3.5 | An open-sided tiki hut: four dark wood posts, a big thatched straw roof with a shaggy edge, open on all sides so a small car could drive straight through. |
| sailboat.glb | Four Beach Props | 2.6 x 2.4 x 1.0 | A small wooden sailboat with a light deck, one coral and white sail and a teal stripe on the hull. |
| tiki-torch.glb | Four Beach Props | 0.4 x 2.7 x 0.4 | A tall bamboo tiki torch with a wrapped dark wood band and a stylized orange and gold flame on top. |
| shell-conch.glb | Three Shell Collectibles | 2.2 x 1.5 x 1.3 | A conch shell, peach and cream, chunky spiral with soft knobs. |
| shell-scallop.glb | Three Shell Collectibles | 2.8 x 1.4 x 0.4 | A fan-shaped scallop shell with ribs, coral and pink fading to cream. |
| shell-cowrie.glb | Three Shell Collectibles | 1.6 x 0.7 x 0.9 | A glossy spotted cowrie shell, cream with caramel spots (the rare shell). |
| beach-set.glb | Island Expansion Twelve Props | 2.4 x 2.7 x 2.7 | A beach umbrella with coral and white stripes, two teal wooden beach chairs and a small coral cooler. |
| coconut-bombs.glb | Island Expansion Twelve Props | 1.2 x 1.4 x 0.9 | Three cartoon coconut bombs in a little pile, each with a short black fuse and a yellow spark. |
| dynamite-crate.glb | Island Expansion Twelve Props | 1.1 x 1.5 x 0.9 | A wooden crate holding a bundle of red cartoon dynamite sticks with fuses, a coral warning band and yellow spark. |
| firework-barrel.glb | Island Expansion Twelve Props | 0.9 x 1.9 x 0.9 | A small wooden barrel with dark teal hoops packed with coral, teal and yellow firework rockets pointing up. |
| fruit-cart.glb | Island Expansion Twelve Props | 2.4 x 2.1 x 1.3 | A wooden fruit cart with big wheels, a coral and cream striped awning, a small chalkboard, and pineapples, bananas and coconuts. |
| golf-hole.glb | Island Expansion Twelve Props | 3.1 x 1.5 x 3.1 | A round mini golf green edged with white stones, a hole with a thin flagpole and a coral flag. |
| lighthouse.glb | Island Expansion Twelve Props | 1.9 x 3.2 x 1.7 | A short chunky lighthouse with coral and white stripes, a dark teal cap, a pale blue glass lamp room with a brass rail, on a base of gray rocks. |
| pier.glb | Island Expansion Twelve Props | 1.6 x 1.6 x 5.5 | A straight wooden pier section with plank deck, posts and rope rails. Also used for bridges. |
| race-arch.glb | Island Expansion Twelve Props | 3.7 x 3.3 x 0.7 | A race start gate: two carved tiki posts holding a curved wooden beam with teal caps and yellow trim, a string of coral, teal and yellow pennants hanging below. |
| soccer-goal.glb | Island Expansion Twelve Props | 3.2 x 2.3 x 1.3 | A bamboo soccer goal lashed with rope, white net, a small coral flag on top. |
| surf-rack.glb | Island Expansion Twelve Props | 2.2 x 2.1 x 0.9 | A wooden surfboard rack holding three surfboards: teal, yellow and coral, each with a cream stripe. |
| treasure-chest.glb | Island Expansion Twelve Props | 1.6 x 1.2 x 1.1 | A wooden treasure chest with brass bands, a domed lid as a separate part (it opens in game) and gold coins inside. |
| tree-poinciana.glb | Coin and Flowering Island Plants | 3.5 x 2.3 x 3.5 | A royal poinciana (flame tree): short thick trunk splitting into a few branches, a wide flat umbrella-shaped canopy of bright coral-red flower clusters mixed with green. Leafy top as a separate part from the trunk. |
| tree-jacaranda.glb | Coin and Flowering Island Plants | 2.4 x 2.7 x 2.3 | A jacaranda tree: slim gray-brown trunk and branches, a rounded airy canopy of soft lavender-purple blossom clumps. Leafy top as a separate part from the trunk. |
| tree-plumeria.glb | Coin and Flowering Island Plants | 2.2 x 1.6 x 1.9 | A plumeria (frangipani) tree: thick knobbly forked branches, clusters of long green leaves at the tips with white and yellow five-petal flowers. Leafy top as a separate part from the trunk. |
| tree-golden-shower.glb | Coin and Flowering Island Plants | 2.3 x 2.5 x 2.3 | A golden shower tree: medium trunk, rounded green canopy with long hanging clusters of sunny yellow flowers. Leafy top as a separate part from the trunk. |
| bush-hibiscus.glb | Coin and Flowering Island Plants | 1.8 x 1.2 x 1.6 | A rounded hibiscus bush, deep green leaves with big coral-red and yellow hibiscus flowers. One piece is fine. |
| bush-monstera.glb | Coin and Flowering Island Plants | 1.5 x 1.1 x 1.7 | A clump of monstera plants, big glossy split leaves on curving stems coming out of the ground. One piece is fine. |
| gold-doubloon.glb | Coin and Flowering Island Plants | 1.0 x 1.0 x 0.25 | A thick gold doubloon coin with a raised rim and a stamped star on its face. Used for the treasure coins. (Prompt rebuilt from the model.) |

The hub card art (`img/shoreline-card.webp` in the games repo) and the logo (`art/logo.png`, `public/logo.webp`) are Shauna's too.

## In progress

Nothing right now. Triangle counts of the plants: poinciana 1,380, jacaranda 684, plumeria 3,292, golden shower 548, hibiscus 3,592, monstera 3,564. They are drawn instanced and split into map cells, so the higher ones are fine, but new instanced plants should stay near 3,000.

## Ideas for later (not made yet)

- Grass is generated in code (instanced blades), so no asset is needed.
- Sound and music: wait until the new island is built. Use different CC0 tropical tracks, not the reference site's music.
