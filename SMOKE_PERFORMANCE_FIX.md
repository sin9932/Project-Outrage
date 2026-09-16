# Firefox building-destruction smoke performance
Three simultaneous power-plant destructions, Firefox on development PC, 1440x900, fog disabled. Measurements are main render callback time, not total frame time.
| After destruction | Before fix | After fix |
| --- | --- | --- |
| Mean | 64.71 ms | 26.72 ms |
| p95 | 99 ms | 38 ms |
| Max | 102 ms | 46 ms |
Normal pre-destruction means were 22.85 and 20.14 ms respectively.
Instrumented drawImage attribution found 3777 ms in 128x128 smoke texture draws (15265 submissions across the measured period); building animation draw calls were minor.
Soft smoke now blends into a reusable quarter-width/quarter-height canvas and composites once. Particle simulation, count, lifetime, visibility checks, death animation and damage remain unchanged. The visual tradeoff is lower spatial resolution for soft smoke. Resize reallocates the effect surface; normal frames reuse it. The surface is cleared each frame.
destruction-smoke.browser.cjs passes actual destruction, smoke retention, odd-size viewport resize, and no page errors. A repeat measured 26.33 ms mean / 40 ms p95. Screenshot inspected. Baseline/after evidence in client/tests/smoke-performance-evidence.json.
Remaining cost: ordinary Firefox scene drawing still takes about 20 ms here; this is not a promise of 60 FPS in every battle.
