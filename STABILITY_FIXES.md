# Gameplay stability fixes — 2026-09-16

Work branch: `codex/realtime-tank-3d`. Main is not merged.

## Problems and changes

- Large building attacks constructed unvalidated one-waypoint routes, calculated conflicting approach goals, and retried missing paths every frame. Combat approaches now belong to simulation and enter a FIFO Map queue. Requests retain order identity and target identity so superseded commands cannot restore old paths. The shared path budget is eight searches per simulation tick with a four-millisecond admission window; an individual bounded A* can exceed that window. Harvest/move callers retain their synchronous result contract. Deferring a search no longer erases a valid route.
- Hull turning was counted as obstruction. Simulation now exposes its turning state and only accumulates attack-stuck time while a routed unit is stationary without turning. Repath cooldown also applies when paths are missing. Building approach goals remain stable during traversal.
- Spatial-grid insertion clamps both coordinate bounds. An initial stress fixture accidentally placed units outside the map and exposed the missing lower clamp; normal-coordinate benchmarks below have no exceptions.
- Right click clears selection. A right-button drag exceeding six CSS pixels pans the camera and preserves selection. Existing left-click commands remain intact.
- Startup previously recolored entire atlases and all animation frames. It now warms entry frames and reuses cropped frame tinting on demand. Concurrent building load requests share one promise.
- Tinting previously returned a new Image whose data URL had not decoded yet. This caused actual empty construction/idle frames. The palette utility now supports a synchronous canvas result for building caches; existing image consumers retain their old contract.
- Construction rendering reads its timestamp without changing completion state and starts idle animation at the construction boundary. There is no extra last-frame replay or opacity fade. Selling rendering also no longer initializes simulation timestamps.

## Verification

Windows Chrome headless, 1440×900, local HTTP server, actual game and real-time GLB tanks. Each benchmark uses a fresh browser context; these are local warm-server measurements, not cold Internet download times. Stress fixtures clear terrain around an enemy HQ and raise its HP; they are confined to test code.

| Scenario | Start-click to running | Command time | Frame p95 | Maximum frame gap | Shots in 12 seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before, 48 tanks | 10,235 ms | 3.2 ms | 50 ms | 275 ms | 204 |
| After, 48 tanks | 917 ms | 0.4 ms | 41.7 ms | 66.7 ms | 199 |
| After, 120 tanks | 897 ms | 0.6 ms | 75.1 ms | 83.4 ms | 359 |

Both after runs completed without page errors, dealt building damage, drained the pending attack queue, and admitted at most eight queued searches per tick. Units already in range are expected to fire without moving; the 120-unit run recorded 70 units moving or firing.

Additional passes:
- Real game mouse right-click deselection and right-drag camera movement retaining selection.
- Barracks, power and refinery at five times around construction completion: nonempty pixels, identical repeated rendering, unchanged entity state. Final visible-pixel counts remain stable across the boundary.
- Existing GLB picking, movement, continuous hull rotation, independent turret aiming, firing and damage regression.
- Model muzzle/physics agreement within 0.000004 world units.
- Read-only pose/turn contract test, JavaScript syntax checks and git whitespace checks.

The 120-tank case remains below 60 FPS. The current renderer composites many detailed real-time models; this change prevents command/path stalls and reduces spikes, but does not claim unrestricted army sizes or full rendering optimization. Multiplayer determinism, all maps and low-end machines were not validated.

## Reproduce

Serve `client` on localhost:8765. Set `OUTRAGE_PLAYWRIGHT` to a Playwright installation; the browser scripts use the standard Windows Chrome executable.

```powershell
node client/tests/tank-motion.cjs
node client/tests/tank3d.browser.cjs test-results
node client/tests/stability.browser.cjs test-results
node client/tests/stability-benchmark.cjs test-results/bugs-final.json
$env:OUTRAGE_STRESS_COUNT = '120'
node client/tests/stability-benchmark.cjs test-results/bugs-120.json
```

Evidence: `client/tests/stability-evidence.json`, `docs/construction-boundary.png`.
