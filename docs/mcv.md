# MCV / deployable construction yard

Work lives on `codex/realtime-tank-3d`. Main is not merged.

## Player controls and timing

- Build a completed war factory and service depot to produce an MCV at the factory. Cost: 3,000 credits. HP: 3,000, derived from the existing HQ spec. It is unarmed and uses vehicle navigation.
- Select the MCV and press **D**, or double-click, to deploy on an unobstructed 5×5 flat footprint. Trees, ore, buildings, reserved factory/refinery entrances and other units block deployment.
- Deployment and packing each take **0.8 simulation seconds**. The HQ reserves its footprint and enables building prerequisites as soon as deployment starts. There is no additional construction lockout after the animation.
- Enable **MCV redeployment** before starting the match. A ground movement order to a completed selected HQ folds it into an MCV, then drives to that destination. Repacking and selling are blocked during deployment to prevent overlapping conversions.
- Repeated deployment preserves current HP, selection and group. No repacking refund, crew spawn or production score increment. Selling retains the separate refund/evacuation rules and never creates a controllable MCV.
- Service depots repair one nearby stationary vehicle per second: 30 HP for 5 credits.

## Shared ownership

`tech.js` owns prerequisite tables and operational availability for the UI, economy and AI. An HQ in `deploy` is operational; `pack` and selling are not. MCV production requires both completed prerequisites; losing one pauses the current ticket and rebuilding resumes it.

`mcv.js` owns site validation, fixed-heading alignment, deployment/repacking timing, atomic entity conversion and strategic MCV AI. Existing footprint, occupancy, pathfinding, selection and economy interfaces remain authoritative. Occupancy starts at deployment and stays reserved until packing finishes. Destruction during conversion cannot produce another vehicle.

AI excludes MCVs from assault groups. Without an HQ, a completed factory/depot and sufficient funds allow one replacement MCV. Site search examines at most 24 candidates per 0.8-second think and uses existing path budgets.

## Art and rendering

The completed construction yard uses the **existing** `asset/sprite/const/normal/con_yard_n.png`. Its original broad armored base, corner supports, fans, vents, octagonal pedestal, lattice mast, crane, drums and crates are preserved. The stale crop for a different image size was replaced with the actual alpha bounds of the 1644×1256 source and a ground-plane pivot.

`hq_assembly.js` owns the source-space articulation masks and projected panel hinges. It partitions the original artwork into platform, body, armor, roof collar, pedestal, mast and crane parts. Overlapping outlines have explicit priority so each source pixel belongs to only one part. Platforms extend before walls unfold, the pedestal/mast lift, then the crane locks into place. Forward and reverse sample the same progress. The endpoint draws the same original sprite directly; there is no whole-building crossfade to an unrelated model.

`tools/blender/build_mcv.py` creates the real-time eight-wheel truck and its chassis, hinged cab, rear-shell hinges, hydraulic stabilizers and outriggers. The silhouette follows the supplied single-cab, rounded-container reference. Blender uses metres/Z-up; glTF uses Y-up/+Z-forward. The fixed model multiplier is 1.65 at 20 world units/metre. The authored three-second `Deploy` clip is sampled over the 0.8-second gameplay interval. No animated object scales are used in the vehicle asset.

This is a hybrid construction effect: real-time vehicle geometry plus articulated original building artwork. It does not simulate every building panel as a rigid-body 3D object. Completed yards use the existing palette cache and do not enter the WebGL assembly atlas. No new smoke or shadow simulation was added.

Animation-order references: [Allied MCV cinematic](https://www.youtube.com/watch?v=I-JU-bAOiao), viewed as sampled frames across the downloaded 37.4-second video; and [AVSP Allied MCV deployment](https://www.moddb.com/mods/avsp/images/allied-mcv-deployanim), inspected across its 81 frames. The source remains reference material, not a shipped game asset. The requested 0.8-second speed is project tuning, not a claim about original RA2 frame timing.

Regenerate the vehicle asset:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python tools/blender/build_mcv.py -- client/asset/model/mcv
```

## Validation

Chromium and Firefox passed the real-game regression with zero page errors. Chromium measured 0.8063 seconds for deployment; both browsers verified that a real construction ticket advanced while deployment was still active.

`client/tests/mcv.browser.cjs` exercises the actual game: invalid terrain/ore/occupied footprints, D/double-click deployment, measured fast transition, construction-lane progress during deployment, blocked overlapping repack, HP conservation, reverse pose equality, option gate, factory/depot loss and recovery, factory dispatch, transition destruction, sale and enemy recovery AI. Art is reviewed separately at 25 poses in the actual renderer.

Launch with `Outrage_3D_Game.cmd`, refresh with Ctrl+F5, and start a new match to apply the redeployment option.
