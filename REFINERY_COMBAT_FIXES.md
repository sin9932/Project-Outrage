# Refinery and combat fixes
Branch: codex/realtime-tank-3d. Main is not merged.

## Changes
- Refinery collision tests solid footprint cells with the unit radius. The entrance's three walkable cells no longer have a padded rectangle trapping units.
- Movement commands received outside a simulation tick are queued, retaining order/target identity. An expired frame deadline no longer silently drops commands.
- Units crossing the refinery front draw above its ramp without changing simulation positions.
- Complete cargo payment takes one simulation second after the 0.4-second hatch opening. Integer delta accounting preserves total credits.
- OUHarvester owns ore tuning: ordinary tiles contain 48-240 units, mining is 125 units/second. A full tile lasts 1.92 simulation seconds. Capacity remains unchanged.
- Float64 ore storage prevents fractional subtraction being truncated every tick. Gem extraction respects doubled cargo credit value.
- Pooled InstancedMesh batches draw live articulated vehicle geometry per atlas page. Picking and muzzle contracts remain.
- Cached cloud inversion replaces a large canvas filter. Viewport culling and two compound fog fills reduce 2D draw calls.

## Verification
Nine exit cases (tank, harvester, infantry in each entrance cell) pass, including paint order. Three ore tiles depleted with removed ore = carried ore = 720. Full cargo paid exactly 1,000 credits in 1.408 seconds including hatch opening.
Navigation, tank3d and docking regressions pass, including cancellation and destroyed refinery recovery.

96-tank, 12-second samples, 1440x900, fog off:
| Browser | Before frames / p95 interval | After frames / p95 interval |
| --- | --- | --- |
| Chrome | 696 / 25 ms | 1339 / 16.6 ms |
| Playwright Firefox | 222 / 58.34 ms | 368 / 41.66 ms |

Firefox with fog: 354 frames, p95 41.68 ms, max 83.34 ms. Attack command 0-1 ms; path processing max eight per tick. No page errors; attacks deal damage. Evidence: client/tests/refinery-combat-evidence.json.
Separate local samples are not universal FPS guarantees. Firefox still has substantial rendering cost: the 96-unit scenario does not sustain 60 FPS. Automated fixture positions do not replay the exact user match. Ore cadence is RA2-like, not identical global RA2 balance.

## Running
Serve preview on localhost:8765. OUTRAGE_PLAYWRIGHT points to Playwright; OUTRAGE_BROWSER selects chromium/firefox; OUTRAGE_STRESS_COUNT defaults to 48; OUTRAGE_FOG=1 enables fog; OUTRAGE_CHROME optionally selects a Chromium executable.
combat-performance.browser.cjs takes an output JSON path. port-resource.browser.cjs takes an output directory.
Ctrl+F5 and start a new match to regenerate ore with the new amounts.

Follow-up: ORE_VISUAL_TURN_FIXES.md documents five density stages and faster turning.
