# AGT Slime Live — Character asset

The live scene supports an optional rigged character at:

`public/assets/agt-bug.glb`

## Free asset workflow

1. Use the approved reference image as the visual target. Do not substitute a random ant, bee, humanoid, or stock mascot.
2. Create the mesh locally with an open-source image-to-3D workflow (TRELLIS.2 / TripoSR where hardware permits), then clean the topology and materials in Blender.
3. In Blender, build a humanoid-style rig suited to the reference: torso, head, antennae, upper/lower arms, hands/fingers, thighs, shins and feet. Keep the silhouette and orange materials faithful to the reference.
4. Author or retarget the required actions in Blender. Export a single GLB with embedded textures and named animation clips.
5. Save the result as `public/assets/agt-bug.glb`. The page will load it automatically and hide the old geometric prototype only after a successful load.

## Animation clip names

Use these names so the page can map gift events automatically:

- `idle`
- `knead` (both hands working the slime)
- `dance` (or `halay`)
- `wave`
- `water`
- `add`
- `celebrate`

The page maps names containing `dance` to the halay action, `mix` / `slime` to kneading, `hello` to waving, and `jump` / `celebr` to celebration. Other actions fall back to `idle` until explicit clips are added.

## Licensing and cost

- Blender is free and open source.
- Keep the source image, generated mesh, textures, and animation sources in the project notes.
- Only add assets whose licenses explicitly permit the intended use, including commercial livestream use.
- Do not use a free-tier AI export if its license restricts commercial use.
- No paid model, subscription, or API is required by this integration.

## Current state

The GLB loading and animation hook is integrated. The actual reference-matched GLB is not included yet; until it is placed at the path above, the existing prototype remains visible. This prevents a broken or unrelated model from replacing the scene.
