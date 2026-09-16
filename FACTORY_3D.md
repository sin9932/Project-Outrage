# Real-time war factory

The supplied closed/open-roof images are shape references, reconstructed as an articulated Blender model with concrete walls, buttresses, faction stripes, roof ribs, fans, rear equipment, interior work stations, a rolling front shutter and a vehicle apron. TeamColor materials follow the existing player/enemy palette.

Contract: existing 3x4 tile footprint retained; model scale 20 world units/metre. Blender -Y forward/+Z up becomes glTF +Z forward/+Y up. The ground exit faces world +Y. Roof pivots and door pivot are separate from the Build assembly tracks. client/js/factory.js owns dimensions, timing, construction/sale progress and dispatch state.

Build: 1.6 simulation seconds, foundation/floor then staggered walls and gate, then roof and rear equipment. Underground geometry is clipped using the shared instanced renderer. Selling samples the same clip backward; footprint is retained until completion. Destruction reuses existing effects with a short collapsing model ghost.

Roof: independently hinged left/right leaves open and close around their outer edges. OUFactory.beginAirLaunch(building,time) starts the simulation-owned hatch cycle. There are no aircraft in the current roster: actual aircraft production/flying units are NOT added in this change. The hatch and its launch hook are ready for that future unit implementation.

Ground dispatch: a fully paid production queue item becomes the visual dispatch ticket. Door opens for 0.35 seconds; the vehicle travels inside/outside for 1.4 seconds. Its actual tank/harvester geometry shares the factory depth buffer, so walls occlude it correctly. At the exit the ticket becomes one real gameplay unit, facing outward, then follows its rally point or clears the apron. IFV retains its existing placeholder marker; this is not an IFV art replacement.

The exit apron is reserved against new buildings but remains walkable. Production waits if blocked, cancellation does not spawn a ghost unit, and changing primary factories preserves a dispatch already in progress. Queue completion/payment is separated from dispatch so zero spare credits cannot prevent a fully paid vehicle leaving or cause repeat charges. The renderer only reads simulation state.

Rendering: frame pages are grouped by model span. Large factory cells are normalized inside the existing instanced scene, while world composition preserves building scale. Tank/harvester/sentry rendering and picking continue to use their original span. The GLB includes packed weathered albedo maps; editable source is tools/blender/factory.blend, reproduced by tools/blender/build_factory.py.

Validation:
- Chrome and Firefox factory tests: Build/reverse parity, hatch closed/open/closed, internal vehicle before spawn, sequential exits, obstructed-exit wait/recovery, harvester exit, dispatch cancellation, zero-balance fully-paid exit and reverse sale. No page errors.
- Existing sentry/refinery test passes: targeting, muzzle alignment, no construction-time fire, harvester construction timing and unloading.
- Existing tank browser test passes: model picking, zoom picking, movement/continuous heading, firing and muzzle alignment.
- Actual in-game construction, roof and vehicle intermediate frames inspected.

Preview GIFs are deterministic samples of the real-time model, not replacement sprites: docs/factory-build.gif, factory-roof.gif and factory-drive.gif. Tests exercise live production separately. docs/factory-stages.png and factory-preview.png provide stills. Evidence: client/tests/factory-evidence.json.

Reload with Ctrl+F5 and build a factory in a fresh game. Main is not merged.

## Reference fidelity revision

The factory now follows the supplied olive military hangar reference: battered wall sections, tapered piers, a projecting armored portal with diagonal silver guides, sloped traction apron, paired segmented roof panels, service grilles and door, fan housings, faction insignias, crates and barrels. Packed albedo textures provide irregular surface wear. Texture pixels use sRGB encoding for agreement between Blender and glTF. Crowd batching retains mapped materials instead of replacing them with flat vertex colors. Existing footprint, articulation pivots, timings and production state remain unchanged.

Revalidated live construction/reverse sale, roof cycle and dispatch on Chromium and Firefox after the geometry replacement. Updated stills and GIFs show the revised model.

## Industrial detail revision

Replaced upright narrow piers with stepped, battered buttresses. Added recessed louver assemblies and anchors, thicker roof frames, inset armor plates, captive bolts and hinge bearings. Fan housings now have sloping front vents. Exterior props are authored with reusable oil_drum, supply_crate and pallet builders: rolled drum beads, recessed lids and bungs, identifying stencils, timber panels, steel straps, rivets, lifting handles and shipping labels. Asymmetric clusters on both sides remain clear of the production exit. Utility pipes, flanges and electrical cabinets add service detail.

Eight albedo maps include mottling, runoff and lower-wall dirt. A 2048px contact-occlusion atlas uses a separate ContactUV channel and is exported through glTF occlusionTexture. Rigid geometry is joined per assembly group; tiny bevels are omitted and visible bevels use one segment. The final export contains 48,470 vertices (5,346,592 bytes), reduced from the first detail pass of 172,384 vertices. The renderer retains aoMap as well as color textures in its material batches.

Chrome and Firefox construction, sale, hatch and dispatch tests pass with no page errors. A separate 1440x900 Chromium smoke scene measured one and six visible factories: both used one atlas page and 68 draw calls, with median requestAnimationFrame interval 8.3ms and p95 8.4ms on this PC. This isolates factory rendering; it is not a whole-battle performance guarantee. Reproduce with client/tests/factory-detail.browser.cjs (OUTRAGE_PLAYWRIGHT required). Evidence is in client/tests/factory-detail-evidence.json; normal game-scale capture is docs/factory-gameplay.png and close view is docs/factory-in-game.png.
