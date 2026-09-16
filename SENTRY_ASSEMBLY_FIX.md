# Sentry assembly and reverse sale

Replaces the two-stage whole-model scaling effect with an authored Blender/glTF Build clip (96 frames at 30 FPS, 3.2 seconds, 13 exported transform channels).

Visible order: foundation, staggered outrigger extension, telescoping pedestal, vertically rising receiver with rigidly attached ammo rack, a short seated hold, then straight axial barrel extension. The receiver seats at frame 68; barrels extend during frames 72-92. The hull and turret remain full-sized geometry; the pedestal and barrel telescope change only their axial scales. Each animated subassembly is preserved during rigid-part batching.

Unassembled geometry starts below ground. Per-instance ground clipping subtracts the atlas-cell offset before comparing against the ground plane, so below-ground parts are hidden without whole-object visibility pops. Completed models retain their normal geometry and live yaw/barrel movement.

Construction and selling sample the exact same clip. Selling starts at the current construction progress and runs backward at the same rate. A complete sale takes 3.2 simulation seconds; an interrupted build takes its elapsed portion. Selling disables sentry firing and clears its targeting. The building remains alive and its tile occupied until the reverse animation finishes. Repeated clicks cannot issue a second refund.

The sell animation descriptors and finalization loop are shared with the existing barracks/power/refinery paths; their sprite reverse playback remains intact. No explosion is triggered by sale.

Verification:
- Chrome: same-progress forward/reverse transforms agree on all sampled joints, moving subassemblies change pose; ammo rack and gun hinge remain rigid; receiver is stationary during barrel deployment, UI-triggered full and partial sale, occupancy retained then freed, exactly one 250-credit refund.
- Firefox: full and partial UI sale and transform parity pass.
- Existing barracks, power and refinery sale paths pass with refunds 250/300/1000.
- Sentry combat and refinery regression pass with the new clip: no construction-time shots, four-direction targeting, muzzle alignment, deferred harvester spawn and one-tile docking.
- No page errors. Actual assembly stages were inspected visually after underground clipping was added.

Files:
- tools/blender/sentry.blend contains the Build NLA tracks.
- tools/blender/build_sentry.py reproduces the asset and animation.
- docs/sentry-build-sell.gif is a game-rendered forward/reverse clip preview.
- docs/sentry-assembly-stages.png shows eight assembly stages.
- client/tests/sentry-assembly.browser.cjs exercises the actual sale UI.
- client/tests/sentry-assembly-evidence.json records results.

The GIF is a deterministic preview of the shared clip, not a recording of UI clicks; those are covered separately by the browser test.
Reload with Ctrl+F5 and start a fresh game. Main remains unmerged.

Follow-up: removed the opposing receiver/hinge rotations and rearward barrel slide that swept barrels through the box. Front and rear game-rendered intermediate frames were inspected. The completed geometry and muzzle transform are unchanged. Chrome and Firefox full/partial sale and the combat/refinery regression passed again.
