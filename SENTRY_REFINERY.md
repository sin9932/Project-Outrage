# Sentry gun and refinery lifecycle

Branch: codex/realtime-tank-3d. Main stays unmerged.

## Refinery and harvester
The economy marks one pending free harvester on refinery placement. It queries the building atlas's construction end time rather than waiting for a renderer flag, so off-screen construction works. Dead or selling refineries cancel the pending spawn. The spawned unit records its home refinery.
The docking approach is exactly one tile outside the dock. The authoritative phases are enter, turn, unload, close:
- Move forward one tile into the bay.
- Rotate in place to face outward, with the rear discharge at the refinery.
- Open the hatch and keep the previously implemented one-second cargo payment.
- Close the hatch and resume the harvest order after 0.5 simulation seconds.
There is no multi-tile reverse or separate forced exit leg. Ordinary navigation handles the next harvest route. Queue ownership, cancellation and destruction recovery remain.

## Sentry gun
The supplied base/head images guide the model: five fixed silver outriggers with team-colored feet, orange reference receiver and ammo drums, three rotating barrels. Orange armor becomes the live faction color; silver/steel remain fixed.
- Editable model: tools/blender/sentry.blend
- Reproducible builder: tools/blender/build_sentry.py
- Runtime GLB: client/asset/model/sentry/sentry.glb
- Contract: client/js/sentry.js
- Preview: docs/sentry-preview.png; game view: docs/sentry-gameplay.png

This uses live 3D geometry through the existing instanced vehicle renderer. The base stays fixed while the head turns continuously. Construction now uses the authored 3.2-second Build clip, with mechanical subassembly motion and underground clipping. Selling reverses that same clip. See SENTRY_ASSEMBLY_FIX.md. Destruction retains its separate 1.1-second procedural collapse and existing explosion/debris/smoke effects.

Simulation owns target, yaw and shot timing. Auto targeting checks visible hostile ground units and skips hidden, transported and cloaked targets. Target scans are throttled to 0.15 seconds, aiming updates every tick, and firing waits for alignment. Existing explicit force-fire handling remains. No firing during construction. Model muzzle anchors are checked against the firing contract.

Existing role/stats remain a basic anti-infantry defense: cost 500, HP 400, range 540 world units, 0.65-second burst interval, 40 infantry / 22 other damage. The infantry class is read from the unit definition instead of an absent instance field. It does not require power and its firing cadence is not reduced during a power shortage. These are this project's values, not a claim of an exact RA2 rules clone.

## Verification
Chrome and Firefox: no early refinery spawn, off-screen construction completion, one-tile approach, stationary turn, 1,000 exact payout, 0.5-second departure, four-direction sentry tracking, no construction-time shots, model/physics muzzle agreement (~0.000003 world units), destruction ghost expiry, no page errors. Firefox also checks destruction before refinery completion produces no free harvester.
Existing docking tests pass two queued unloads, exact credits, cancel/cargo preservation and destroyed refinery release. Tank mesh picking, continuous movement and muzzle regression pass.
The production UI test uses the existing debug fast-production switch to skip queue time/payment, then clicks Defense -> Sentry -> map placement. It checks the real placement path; it does not benchmark normal queue timing.
Evidence: client/tests/sentry-refinery-evidence.json.
Refresh with Ctrl+F5 and start a new match. Build a barracks, then find Sentry Gun in Defense.
