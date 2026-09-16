# Navigation, terrain and rendering correction — 2026-09-16

Branch: `codex/realtime-tank-3d`; no merge into main.

## Runtime contracts

- Tank travel uses `OUTankMotion.drive` for both ordinary routes and group flow fields: turret aligns, hull aligns, then translation starts. Stationary target tracking does not overwrite a travel turn. Acceleration uses elapsed time.
- Tanks no longer use lateral position pushes or sideways obstacle steps. Group flow movement checks occupancy/reservations and returns to individual routing when blocked, with a retry cooldown.
- AI keeps a valid attack order for the same target. New waves clear obsolete navigation and let simulation choose the ranged approach; AI no longer paths directly into building centers.
- A ground-fire command snaps to the existing tile-center helper. Its weapon target is separate from the navigation endpoint (`navGoal`); finding a walkable tile must never move the requested impact.
- Terrain damage runs on shell impact, not both launch and impact. Existing ground-fire entity splash is carried with the shell. Tree/Ore radius scans visit only affected tile bounds.
- The map already uses Tiled TMJ data and center-based world helpers. No map migration or arbitrary graphic offset was introduced. Fog sample positions also use cell centers.
- Camera centering/clamping and drag conversion account for zoom. The usable viewport excludes the sidebar, and all four map corners can be brought to its center.

## Rendering

CPU profiling of 120 enemy tanks showed AI decisions taking about 2 ms at their peak, while rendering dominated. Procedural cloud noise was another major hot spot.

- Real-time tank poses are rendered into frame-local pages, then composited in painter order. Each page is copied from WebGL once. These are rebuilt every frame, not stored directional animations.
- Rigid geometry is grouped by material. At small screen size or dense army counts, static material colors are baked into vertex colors to reduce draw calls. Articulated pivots, geometry and live team colors remain; ordinary close views use full materials.
- Units entirely behind the sidebar are excluded from tank rendering.
- Cloud noise is built in row batches within a roughly 1 ms admission budget and published only when the complete image is ready. Original noise parameters remain intact.

## Measurements

Windows Chrome headless, 1440×900, fresh game contexts, local HTTP server, 120 enemy tanks. Diagnostic runs independently disabled AI decisions and tank drawing. Before/after production render runs include AI and all effects. Viewport culling and movement behavior changed as part of the fix, so this is an end-to-end scenario comparison.

| AI enabled, real-time tanks | Before | After |
| --- | ---: | ---: |
| Mean render CPU time | 56.38 ms | 21.55 ms |
| Render p95 | 73.40 ms | 30.90 ms |
| Mean frame interval | 60.73 ms | 36.80 ms |
| Frame p95 | 83.30 ms | 58.30 ms |

Rendering time fell about 62%. The 120-tank case is still below 60 FPS; this is not a claim of unrestricted army sizes. A subsequent flow-occupancy correction was checked by the navigation regression.

## Verification and reproduction

`navigation.browser.cjs` runs the actual game and checks:

- Four map corners at zoom 0.6, 1.0 and 1.8, plus zoom-independent pan displacement.
- Group flow movement, all three travel phases, no position change during turning and velocity aligned with hull yaw.
- Four corners inside the same target cell all produce the same central ground target, preserved after routing. Tree and Ore damage occurs after shell arrival.
- No browser page errors.

The existing tank browser regression covers selection, ordinary movement, independent combat aiming, firing, damage and muzzle agreement. The read-only motion contract and JavaScript syntax/whitespace checks also pass.

Run with `client` served on localhost:8765 and `OUTRAGE_PLAYWRIGHT` pointing to Playwright:

```powershell
node client/tests/navigation.browser.cjs test-results
node client/tests/tank3d.browser.cjs test-results
node client/tests/ai-render-profile.cjs test-results/ai-render-profile.json
```

Evidence: `client/tests/navigation-evidence.json`, `client/tests/ai-render-evidence.json`, `docs/navigation-gameplay.png`.
