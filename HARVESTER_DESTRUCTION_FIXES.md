# Harvester and destruction rendering

Branch: codex/realtime-tank-3d. Main is not merged.

## Building destruction performance

Three real power-plant destructions were measured in Chrome on the development PC.
The scenario includes evacuation infantry, death sprites, debris and smoke.

| Render callback cost | Before | After |
| --- | ---: | ---: |
| Mean after destruction | 5.67 ms | 3.63 ms |
| p95 after destruction | 16.30 ms | 5.10 ms |
| Maximum after destruction | 209.70 ms | 6.90 ms |

These are scenario render timings, not a promise of frame rate on every map/machine.
Evidence: client/tests/destruction-evidence.json.

Three separate costs were fixed:
- Death-frame palette conversion and source image decoding run in a worker. It shares
  the exact palette kernel with the existing synchronous path. Upcoming frames are
  prefetched, and the last prepared frame is held if preparation falls behind.
- Smoke uses one reusable soft texture, viewport culling and a visual-only particle
  budget (768 puffs, 24 emitters). Redundant shadow blur is removed from smoke rings.
  Combat damage is unaffected by visual budgets.
- Evacuation infantry atlas scanning and initial idle-team palettes are prepared
  during startup instead of during the first building explosion. Only the entry
  palettes are warmed; full animation atlases are not synchronously precolored.

## Harvester

The reference is the project's harvester_idle.png: tracked box silhouette, sloped
nose, ribbed intake, side grille, roof hatch and magenta team strips. This is a real
GLB mesh, posed and rendered each frame through the existing shared vehicle renderer.
It is not an eight-direction sprite replacement.

- GLB: client/asset/model/harvester/harvester.glb
- Editable Blender scene: tools/blender/harvester.blend
- Reproducible builder: tools/blender/build_harvester.py
- Preview: docs/harvester-hero.png and docs/harvester-unload-model.png
- Gameplay: docs/harvester-mining.png and docs/harvester-docking.png

The wheels, intake rotor, cargo and rear discharge hatch are separate parts.
Mining has a reusable mineral particle sprite following suction arcs into the intake.
Unloading opens the rear hatch, streams ore out, gradually decreases cargo and credits
integer money deltas. See REFINERY_COMBAT_FIXES.md for the updated one-second
unload and ore depletion balance; the near-full return threshold remains.

## State and geometry contract

client/js/harvester.js owns the shared model/socket and docking contract:
- Blender -Y forward / Z up; glTF +Z forward / Y up.
- Scale 20 world units per model unit, matching the existing vehicle renderer.
- Intake: forward 2.80, height .63. Rear outlet: forward -2.43, height 1.40.
- Imported GLB socket locations are checked at load.
- Simulation owns body yaw, cargo, current mining timestamp and docking phase.
  Renderer caches only presentation state; it never pays money or changes orders.

The existing refinery ramp faces world +X. Three cells along the middle of its +X
footprint edge are walkable. Collision padding and tile occupancy use the same
contract; the rest of the footprint remains blocked.
Docking phases: approach, align, reverse, unload, close, exit.
Only one harvester owns the bay; other returning harvesters wait outside the exit lane.
Changing orders releases ownership and preserves the remaining cargo. Destroying the
refinery clears docking state and resumes existing refinery/ore recovery behavior.
Duplicate legacy dock/refinery helper declarations were removed from simulation.

The refinery remains a 2D building. Its ramp orientation is fixed; rotated refinery
assets would require a corresponding port contract. New vehicle materials reproduce
the reference shape/color scheme but do not include the sprite's baked weathering.

## Verification

- explosion.browser.cjs: actual building destruction, CPU profile and before/after render costs.
- harvester.browser.cjs: movement, mining particles, cargo, complete return/unload/exit,
  three walkable port cells, return to mining, no page errors.
- harvester-docking.browser.cjs: two simultaneous returns pay exactly 80 credits,
  cancellation preserves cargo, destroyed refinery releases dock, no page errors.
- tank3d.browser.cjs: mesh picking, continuous hull, turret independence, shots and muzzle contract.
- navigation.browser.cjs: camera corners at multiple zooms, formation movement and terrain hits.
- stability.browser.cjs: right-click selection and building animation boundary regression.

Run browser tests with the preview server at http://127.0.0.1:8765 and
OUTRAGE_PLAYWRIGHT pointing to the installed Playwright package. Pass an output
directory to harvester/docking/navigation/stability tests and an output JSON filename
to explosion.browser.cjs.
