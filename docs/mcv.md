# MCV / deployable construction yard

Added on the isolated `codex/realtime-tank-3d` branch. Main is not merged.

## Player controls

- Build a war factory and service depot. Both must finish their assembly before MCV production becomes available in the vehicle tab.
- MCV costs 3,000 credits, has 3,000 HP (derived from the HQ spec), is unarmed, and uses vehicle navigation with heading-before-translation.
- Select it and press **D**, or double-click it, to deploy on an unobstructed 5×5 flat footprint. Trees, ore, buildings, reserved factory/refinery entrances and other units block deployment.
- Enable **MCV redeployment** before starting the game. Select a completed construction yard and click a ground destination: it folds back into an MCV and drives there. Deploy again as often as needed.
- Redeployment preserves current HP and group number. It does not give credits, spawn crew, or increment production/construction scores. Selling is separate: refund and existing evacuation rules, reversed assembly followed by removal, no MCV unit.
- The new service depot repairs one nearby stationary vehicle each second (30 HP for 5 credits). Its footprint is a solid workshop; vehicles park beside it.

## Ownership and consistency

`client/js/tech.js` owns the prerequisite tables previously duplicated in UI, AI and economy. The same MCV prerequisite predicate gates the button, queue API and active production. Losing a prerequisite pauses an active MCV ticket; rebuilding resumes it. Existing FIFO cancellation behavior remains in the economy module.

`client/js/mcv.js` owns deployment, packing, validity checks, conversion and strategic MCV AI. It reuses the footprint helper, occupancy, pathfinding, addUnit/addBuilding, selection and economy interfaces. Deployment reserves the whole yard footprint at animation start. Packing holds that footprint until animation completion. Replacement is atomic within one simulation tick, with one live entity throughout. Death during either transition cannot produce another vehicle.

Enemy MCVs are excluded from assault groups. When the enemy has lost its HQ and retains a completed factory/depot and sufficient money, it prioritizes one MCV. Site search processes at most 24 candidates per 0.8-second think, avoids nearby armed opponents, and uses existing budgeted paths. This is a project-specific RA2-style recovery policy, not a claim to reproduce the original game's AI source.

## Art contract

`tools/blender/build_mcv.py` creates `client/asset/model/mcv/mcv.blend`, `mcv.glb` and `contract.json`.

Blender: metres, Z up. glTF: Y up, +Z forward. Runtime scale: 20 world units/metre. Mobile silhouette: eight wheels, split purple cab, silver container quarters. A fixed 1.65 model scale is applied equally to mobile, transforming and deployed geometry. The resulting vehicle is roughly 2.5× the existing light tank’s length, with a 50-world-unit navigation radius; it starts deeper inside the factory bay. There is no animated size inflation.

One three-second **Deploy** clip animates rigid translations and hinges. No animated object scales, mesh swaps or directional sprite sheets: chassis rails and deck leaves telescope, suspension/container pods spread, cab halves fold into the front supports, roof and end-wall leaves unfold, nested tower stages lift, and the crane boom extends. The same clip sampled backwards gives packing. All articulated empty nodes survive renderer batching.

The final yard is reconstructed to share its physical components with the vehicle; it is not the old yard image pasted over the final frame. Reference artwork informs the design, but its proportions and mechanical layout are not an exact reproduction.

Completed yards are rendered once per team color/resolution into a bounded 24-entry image cache. Moving MCVs and transformations use the existing shared instanced 3D atlas. Existing destruction effects are retained; no new smoke simulation or shadow subsystem is introduced.

Regenerate:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python tools/blender/build_mcv.py -- client/asset/model/mcv
```

## Validation

`client/tests/mcv.browser.cjs` runs against the actual game at port 8765 with the existing Playwright tooling. Chromium and Firefox passed: prerequisite loss/restoration and production exit, invalid ore/terrain/occupied footprints, D deployment, double-click deployment, ground-click repacking, option gate, HP conservation, exact forward/reverse pose equality, no repack refund/extra crew, no respawn after transition destruction, distinct sale, and enemy autonomous deployment. Browser page errors: zero.

The existing `factory.browser.cjs` Chromium regression also passed: sequential dispatch, blocked-exit waiting, harvester exit, cancelled tickets, fully paid production with zero balance, primary-factory switching, roof opening, and reverse sale.

For local testing use the existing `Outrage_3D_Game.cmd` launcher, refresh with Ctrl+F5, and start a new game to apply the redeployment option.
