# Construction yard operations and vehicle navigation

Based on 7558313, developed in isolated codex/yard-operations, published to
codex/realtime-tank-3d without merging main.

## Changes

- Dark graphite foundation removes the bright white floor grid.
- A narrower command cabin moves aside to expose the warehouse cargo entrance.
- Every actual building completion queues one independent 3.2-second crane work
  cycle: grip the container, hoist/slew, land on the conveyor, take it inside, return.
  The loading hatch conceals replenishment inside the chassis. Work never blocks
  construction, production, deployment or player commands.
- Vehicle A* and flow routes share exact tile-center following and reservations.
  Temporary blockers retain orders. In-place turns are not mistaken for stalls.
  Deterministic yielding resolves opposing cell swaps and preserves new commands.
  Position nudges, premature center arrival and moving at intermediate grid angles
  are removed. Turret aiming remains independent and continuous.
- War factory facing is reversed 180 degrees. A single heading drives its model,
  access reservation, internal dispatch, spawn orientation and outside clearance.

## Actual game validation

Chromium: 32 direction cases across tank, IFV, MCV and harvester; eight-vehicle
formation; long stationary turns; mid-cell and mid-yield retargets; head-on swaps;
blocked-passage recovery. All destinations reached exactly, with zero jumps,
turning slides or unintended destination changes. Shared flow and ground-fire
regression also passed, with hull/velocity error below 3e-12 radians.

Harvester regression: two sequential unloads credit exactly 80, cancellation
preserves cargo, refinery destruction releases the dock. Factory regression:
reversed access/exit and sequential production, blocked exit recovery, cancellation,
paid tickets without spare credits, producer switching, hatch and reverse sale.

Chromium and Firefox: Work completion timing, FIFO, nearest friendly yard routing,
queue transfer, cancellation, deployment sequencing, read-only rendering and
zero pixel change at both clip endpoints and return to cached idle. Chromium MCV
lifecycle and 49-pose/eight-heading art checks passed. All suites had zero page
errors. These are exercised scenarios, not a proof for every possible map layout.

## Evidence

- yard-work.mp4: actual game Work poses at the authored 3.2-second duration,
  with a short idle hold before and after; no concept imagery.
- yard-operations-in-game.png, yard-mobile-eight.jpg
- hq-work-report.json, hq-work-firefox-report.json, yard-ops-art-art.json
- armor-navigation.json, navigation-evidence.json, harvester-docking-evidence.json
- factory-reverse-report.json, yard-ops-mcv.json

## Ownership and asset contract

Simulation owns completion events, movement, headings, reservations and production.
Rendering reads those states. Idle yards reuse the existing shared raster cache.
Blender owns Deploy and Work rigid joints; yard_clip_contract.py restores pruned
constant channels at export, leaving identical 177-channel pose coverage in both
clips. Deploy still runs in 0.8 seconds; match start remains two mobile MCVs.
