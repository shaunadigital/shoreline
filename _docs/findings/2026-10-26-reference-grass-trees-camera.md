# Reference site: grass, leaf clumps, shading and camera (2026-10-26)

## Question

Why did Shoreline's grass and trees look so much plainer than the reference site's (bruno-simon.com, Bruno Simon's 2025 portfolio), and how does the reference draw them?

## Where the answers came from

- Source: https://github.com/brunosimon/folio-2025 (MIT license). Cloned with `git clone --depth 1 https://github.com/brunosimon/folio-2025`. It uses Three.js 0.183 with WebGPU and TSL node materials; Shoreline is on Three.js 0.170 with WebGL, so the techniques were rewritten with `onBeforeCompile` shader patches.
- Files read: `sources/Game/World/Grass.js`, `Foliage.js`, `Trees.js`, `Bushes.js`, `Wind.js`, `Terrain.js`, `View.js`, `Ligthing.js` (sic), `Materials/MeshDefaultMaterial.js`, `Cycles/DayCycles.js`, `Physics/PhysicsVehicle.js`.
- Model sizes were read from the .glb JSON headers with Python (accessor min/max times node scale), because the files are Draco compressed and gltf-transform could not decode them here.
- The live site, opened in Shauna's Chrome next to the live Shoreline at the same window size (960 x 638), with screenshots and zooms.

## What the reference does

- **Grass**: one patch of 280 x 280 single-triangle blades around the camera's view, wrapping with `mod` as the camera moves. Blades face the camera, take the terrain's color, are shaded at the root (shadow mix = 1 - tipness), get height from a noise texture, sway with a noise-based wind and are flattened by wheel tracks drawn into a render target. A painted terrain texture (R/G/B channels) says where grass grows.
- **Trees**: only the trunk is modeled. The leafy parts in Blender are placeholder blobs named `treeLeaves*`; each becomes a clump of 80 cards (0.8 square, inside a unit ball, normals bent 85 percent outward) showing a leaf shape from a 128 px "foliageSDF" texture with an alpha threshold. Cards face the camera's default direction with a random roll. Color mixes between two colors by `dot(normal, sunDirection)`. Flutter rotates the card UVs by the wind. Foliage near the car on screen fades out (see-through). Bushes are the same clumps without a trunk.
- **Shading**: a custom output for every material: base color times light color and intensity (day: #ffd2c2, 1.2), core shadow from `dot(normal, sun)` with soft edges (-0.25 to 1), cast shadow, both mixed toward base color times a shadow color (day: #6d3fff), light bounce from the ground color onto undersides, fog.
- **Camera**: fov 25, polar angle 0.27 pi (about 41 degrees above the ground), azimuth 0.25 pi (diagonal), radius 15 to 30 (default ratio 0.6, so 21), pulling back with speed, further on tall screens.
- **Sizes**: car 3.25 x 1.89 x 1.32 (wheel radius 0.4), oak and birch trees 7 to 9 tall, cherry 5 to 6.6, crates 1.06, world 192 across.

## Wrong turns (why the source numbers were not enough)

1. Grass was first sized from the code (0.6 tall, 0.1 half width). On screen it was about a quarter of the reference's height. The reference grows blades for the area its camera covers (`surfaceOverflow`), so its effective blades are about 1.1 tall, 0.19 half width, one every 0.29 units. Shoreline then went to full length everywhere at Shauna's request.
2. Our grass was also rendered dark because the material was double sided and back faces flipped the normal, putting every blade in shadow. Fix: keep the upward normal on both faces (replace `normal_fragment_begin`). The same fix is used for leaf cards.
3. The camera was set from the code default (radius 21, scaled to 18 for our car). Side by side, the reference's car took about 150 of 960 pixels and ours 215, so the live reference sits further back than its code default suggests. Shoreline's default is now 27, matched by screen size.

## Shoreline's versions

`src/grass.js`, `src/foliage.js`, `src/flora.js` (clump templates from Shauna's canopy part names), `src/shading.js`, the camera block in `src/main.js`. Leaf texture, colors and code are our own; nothing is copied.

## Before redoing any of this

- Check the reference repo for changes (`git log -1` in the clone) before trusting these numbers.
- Compare side by side in the browser at the same window size; a screenshot of only one side proves nothing.
