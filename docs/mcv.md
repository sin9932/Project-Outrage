# MCV / deployable future construction yard

Development worktree: `codex/future-yard`. Published game branch:
`codex/realtime-tank-3d`. Main is not merged.

## Match start and lifecycle

Both teams start with one MCV, without a prebuilt construction yard. Setup selects
and centers the player's vehicle, reveals normal unit vision, and chooses a clear
5×5 deployment footprint near the selected beacon. Blocked beacons search nearest
legal positions. The two initial future footprints stay separate. Random starts
use the same placement path. Setup creates units directly; it never creates and
removes a temporary HQ.

The enemy tries its current safe site before using its existing bounded search.
Its normal building planner takes over after deployment. Existing elimination
rules already consider live mobile MCVs, including short-game mode.

Production still requires a completed war factory and service depot. MCV cost is
3,000; maximum HP matches HQ (3,000). D or double-click deploys; the build lane can
operate during the 0.8-second transition. Optional movement-command repacking
preserves current HP, selection and group without healing, refunds or duplicates.
Selling, destruction, occupancy and prerequisites retain their existing owners.

## Visual design, asset revision 5

The completed building is an asymmetric integrated production base: a dominant
right/rear vaulted machinery hall, attached front command wedge, left/rear twin
power columns and thermal fins, an armored phased-array sensor bay, and a lower
forward crane. Broad ceramic armor, blue graphite machinery recesses and faction
inserts replace the weathered concrete skirt and corrugated rooftop containers.
Ground supplies are protected cassettes attached to the deployment aprons.

Silhouette reference: the completed frame of the creator's
[AVSP Allied MCV deployment](https://www.moddb.com/mods/avsp/images/allied-mcv-deployanim).
The submitted WebP contains one frame; the linked original GIF has 81 frames.
Reference pixels are not included in the game model.

`build_mcv.py` owns the chassis, low mechanical plinth and crane.
`yard_equipment.py` owns the hall, command, power, radar and logistics assemblies.
The four half-arch roof sections hinge from the hall side walls; end bulkheads
extend in nested courses. Equipment has permanent attachment joints, mounting
skids and fixed telescopic sleeves. Packed internal cassettes intentionally share
some hidden volume; this is an art-directed mechanism, not a collision simulation.

The previous floating plank was the entry hood: its old closed transform placed
it above the cab. The hood now nests behind the cab; its deployed endpoint meets
the lower entry roof. The hook cable also folds horizontally inside the rear
capsule. Packed geometry is reviewed in all eight vehicle headings.

No animated scale, alpha reveals, sprite fragments or endpoint model swaps are
used. The same Deploy clip runs in reverse. Authoring uses metres/Z-up/-Y-forward;
GLB uses Y-up/+Z-forward, 20 game units per metre and constant model scale 1.65.
The 3-second authored clip is sampled in 0.8 simulation seconds. `contract.json`
records dimensions, hierarchy, local poses and timings; imports validate it.

## Rendering and verification

`mcv.js` owns simulation state. `tank3d.js` only reads and poses the model.
`hq_assembly.js` caches the exact final model raster by color and resolution in a
32 MiB LRU; settled yards share images and submit no new WebGL pages after warm-up.

Regenerate with:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --factory-startup --python tools/blender/build_mcv.py -- client/asset/model/mcv --review
```

The optional review renders seven deployment stages and eight packed headings.
`mcv-start.browser.cjs` exercises real match initialization, fog, selection, valid
sites, short-game survival, D and double-click, enemy deployment/building, actual
pause-menu restart, opposite beacon, obstruction fallback and random setup.
The existing MCV integration test exercises the full lifecycle/production flow.
The art test captures 49 poses and eight vehicle headings, checks exact endpoint
pixels, renderer read-only behavior and six-yard image reuse. Pixel checks isolate
the building raster because clouds advance independently of simulation pause.

## Current validation

Chromium and Firefox passed the complete new-game MCV start suite with zero page errors, including selected mobile start, fog, valid sites, short-game survival, keyboard/double-click deployment, enemy deployment and subsequent building, pause-menu restart, opposite beacon, blocked-beacon fallback and random starts.

Chromium passed the full MCV lifecycle/production regression. Measured deployment: 0.8081 seconds. Construction advanced during deployment; HP, option gating, reverse posing, prerequisites, production, destruction and sale remained correct.

Art validation covered 49 poses and eight actual game vehicle headings. Endpoint pixel differences: 0. Six settled yards shared one 624,100-byte image with 0 new WebGL pages after warm-up. Renderers did not mutate simulation state.

The packed sleeve rotates into the cargo bay; the mast and nested hall roof also retract deeper to clear the curved capsule skin. Offline vertex checks used the actual faceted skin rather than only a rectangular bounding box, followed by eight-angle Blender and actual-game image review. Hidden internal components intentionally overlap.
