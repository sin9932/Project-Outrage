# Real-time light tank prototype

The light tank is now an articulated GLB rendered from actual geometry every frame.
There are no pre-rendered directional views in this path.

## Try it
Run client/start-3d-preview.cmd on Windows (Python 3 required).
The browser opens the existing game with three light tanks in the central field.
Press Start. Left-click a tank, then left-click the ground to move.
Left-click an enemy to attack; Ctrl+left-click the ground to force-fire.
Use the wheel to zoom. Right-drag pans the camera.
Normal index.html matches retain their original starting economy; the three
bonus tanks require both debug=1 and tankdemo=1.

## Architecture
- tank_motion.js owns continuous world-space hull/turret yaw and muzzle geometry.
- tank3d.js uses Three.js 0.180.0 and GLTFLoader, vendored with the MIT license.
- The live WebGL result is composited at the tank's existing painter-sort position.
  Terrain, buildings, fog, selection markers and most effects remain in Canvas2D.
- This is an RA2-like mixed rendering prototype, not a full 3D terrain/depth engine.
- Hull and turret rotate independently. Firing waits for actual turret alignment.
- Shells start at physical muzzle x/y/z; height affects rendering, not collision x/y.
- The barrel recoils and road wheels rotate with traveled distance.
  Track belts are currently static meshes.
- Existing sprite display remains an explicit comparison/failure fallback:
  append tank3d=0. Continuous movement is renderer independent.
- Unit picking uses the current model's mesh and camera; drag-selection retains
  the existing footprint behavior.

## Asset and scale
client/asset/model/lite_tank/light_tank.glb
43,080 triangles, 15 Blender components, 64 glTF material primitives.
20 game world units per model meter; Blender -Y forward / glTF +Z forward.
Blender source: tools/blender/build_light_tank.py.
The original authoring .blend remains in the desktop model output folder.
Current priority is a working integration. LODs, material/draw-call reduction,
large-army benchmarks and true depth interaction with 3D terrain remain follow-up work.

## Verification
The Playwright test uses the real game, DOM mouse clicks, existing command
handlers and simulation. It checks mesh selection, movement, intermediate yaw,
independent turret aim, firing/damage, model-to-physics muzzle agreement and zoom.
Run a local HTTP server for client on 127.0.0.1:8765, install playwright@1.55.0,
and execute client/tests/tank3d.browser.cjs OUTPUT_DIRECTORY.
Set OUTRAGE_PLAYWRIGHT to an installed Playwright package path if necessary.
The test currently uses the standard Windows Chrome installation.
debug=1 validation was repaired to use hpMax, buildOcc and typed occupancy arrays.

The original main worktree is preserved. This work lives on codex/realtime-tank-3d.
