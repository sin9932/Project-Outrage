# Ore stages, exterior background and light-tank turning

- Atlas inspection confirms gem local cells 0-4 and gold cells 5-9, each sparse to full. Rendered GIDs now derive from current resource amount instead of the original map GID. Zero amount produces no ore draw.
- Initial map amounts decode each resource's five atlas levels independently: 48, 96, 144, 192, 240. Gold local IDs no longer incorrectly include the five-cell gem offset in their quantity. Capacity, gem credit multiplier and mining rate are unchanged.
- The main canvas starts with an opaque black fill. Multiply clouds cannot paint grey onto the formerly transparent map exterior, including with fog disabled.
- The existing central tank motion contract now uses hull 8 and turret 12 radians/second (previously 3.2/4.8). Turret, hull, then movement sequencing remains. This is a responsiveness tuning target, not a claim of exact original Grizzly statistics.

Chrome and Firefox actual-game tests confirm all five source rectangles for both resources, no ore draws at zero, and black opaque exterior pixel [0,0,0,255].
At 30/60/120 simulated updates per second, a 90-degree turn from both headings aligned takes 0.30/0.317/0.317 seconds. Actual-game navigation regression passes all three phases with movement yaw error below 1e-10, camera corners and ground targeting. Read-only pose and frame-rate independent turn tests pass. No page errors.
Tests: client/tests/ore-visual-turn.browser.cjs (OUTRAGE_BROWSER=firefox optional), navigation.browser.cjs, tank-motion.cjs.
Evidence: client/tests/ore-visual-turn-evidence.json.
Reload and start a new game for corrected initial ore density amounts. Main remains unmerged.
