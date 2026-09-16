# MCV / mechanical construction yard

The game branch is `codex/realtime-tank-3d`; development is isolated in
`codex/yard-facilities`. No main merge.

## Player behavior

- MCV production requires a completed war factory and service depot. Cost 3,000;
  maximum HP 3,000, shared with the construction yard.
- D or double-click deploys on an unobstructed 5×5 flat footprint. Deployment and
  packing take 0.8 simulation seconds. The building lane operates during deployment.
- With MCV redeployment enabled, a movement order to a completed yard packs it and
  sends the resulting MCV to the destination. Current HP, selection and group are
  preserved; there is no heal, refund or duplicate unit.
- Selling remains a separate refund/evacuation operation and never grants an MCV.
- Existing prerequisite, occupancy, pathfinding, damage, AI and factory dispatch
  owners remain unchanged by this art revision.

## Mechanical model, revision 4

The previous source-image masks and affine stretches are removed. Every visible
transformation comes from the same Blender rigid-joint hierarchy:

1. Capsule halves swing outward about lower longitudinal hinges. Stabilizer feet
   take the load while the running chassis settles.
2. Six nested floor leaves and their connected front/rear aprons telescope outward.
   Multiple guide sections stay overlapped throughout the travel.
3. Sloping armor wings rotate upright about floor-carriage hinges. End-wall halves
   slide out from concealed nested cassettes, closing the end bulkheads.
4. Roof leaves slide over the shoulders; the cab folds into the entrance recess.
   The entry hood and central side panels close the remaining openings.
5. A hollow octagonal sleeve rises, followed by two nested lattice mast stages.
   The crane head inherits that movement through the joint hierarchy.
6. The attached boom yaws, pitches up, extends its inner segment and lowers its hook.

The low broad armored body, octagonal sleeve and lattice crane interpret the RA2
construction-yard silhouette and the owner's former exterior. The supplied sprite
is no longer the required endpoint. The hidden cassettes intentionally share some
internal packed volume to achieve the vehicle/building proportions; this is an
art-directed mechanism, not a collision-solved engineering assembly.

There are no animated object scales, sprite pieces, transparency reveals or model
swaps. Reverse deployment samples precisely the same `Deploy` clip backward.
Authoring uses metres/Z-up/-Y-forward; GLB uses Y-up/+Z-forward, 20 world units per
metre and a constant 1.65 multiplier for BOTH endpoints. The authored three-second
clip is sampled over the 0.8-second gameplay interval. `contract.json` records the
complete parent hierarchy, local packed/deployed transforms and joint timings.

`mcv.js` owns simulation state and timing. `tank3d.js` reads state and poses the GLB.
`hq_assembly.js` now owns only a bounded renderer cache, plus the old static sprite's
fallback coordinates. No old image partitioning code remains.

## Operational yard facilities

`tools/blender/yard_equipment.py` builds the architectural equipment through the
same rigid-joint helpers as the chassis. It has no gameplay or renderer state.

- Rear-left corrugated workshop with double service doors and roof lifting eyes.
- Front-right glazed control cabin with a separate door, step and roof air unit.
- Rear-right concave radar dish on a telescoping mast and folding yoke.
- Front-left generator/cooling plant with fans, louvers, switchgear and pipes.
- Roof service walkways, folding guardrails, two folding worklight masts and a
  front access ladder.
- Ground-apron pallets, strapped crates, structural beam stock and service drums.

The two cabin shells unfold from horizontal wall leaves; roofs travel on nested
posts. The equipment rides the existing roof carriages. Radar deployment follows
lateral clearance and mast extension. Ground supplies inherit their apron motion.
The central mast and the crane corridor stay open. There are no new scale tracks,
opacity reveals or separate endpoint images. The asset contract revision and URL
are versioned together so a browser cannot mix the previous GLB with this rig.

## Settled rendering

A completed yard uses a raster captured from the exact final GLB pose, lit with the
same game camera and lights. This avoids a visual swap at the transition endpoint.
Images are shared by faction color and pixel resolution and kept in a 32 MiB LRU
cache. Camera movement reuses the image; zoom/color changes obtain the corresponding
image. Packing returns to the same model. A settled-only view submits no 3D pages
once the cache is warm. The existing building ground-shadow behavior is retained.

## Regeneration and review

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python tools/blender/build_mcv.py -- client/asset/model/mcv --review
```

Omit `--review` to export the GLB, editable `.blend`, and contract without rendering
seven optional review PNGs. Game screenshots and animated previews in `docs/` are
captured from the actual game renderer rather than an unrelated concept render.

`client/tests/mcv.browser.cjs` exercises D/double-click, footprint rejection, 0.8s
timing, building progress during deployment, option gating, HP preservation,
forward/reverse pose equality, prerequisites and factory dispatch, destruction,
selling, enemy deployment and movement-command repacking. `OUTRAGE_URL` optionally
selects an isolated test server; otherwise it uses the existing localhost preview.

`client/tests/mcv-art.browser.cjs` captures 49 poses and checks the actual model
raster for endpoint equality, persistent cache reuse, no simulation writes during
rendering and six-yard shared-image rendering. Pixel checks isolate the building
raster because the game's cloud layer advances independently of simulation pause.

Validation results are recorded beside the captured previews after execution.

## Verified in the game

Revision 4 passed the full Chromium MCV integration test with zero page errors. Measured deployment was 0.8000 seconds; construction advanced before it finished. Production, HP preservation, blocked placement, option gating, double-click, movement-command repacking, reverse pose equality, death, selling and enemy deployment passed.

Art validation captured 49 poses. The final model raster and completed cached image had zero differing pixel channels. Six settled yards shared one 624,100-byte image and submitted zero new WebGL pages after warm-up. Both the packed vehicle and intermediate/final equipment poses were visually reviewed. Revision 4 was tested in Chromium; Firefox coverage belongs to the preceding mechanical revision.
