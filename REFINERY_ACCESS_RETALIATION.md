# Refinery access and retaliation fix

Building placement and preview now reserve the complete live footprint plus the refinery approach column (three tiles). The entrance remains walkable. New refinery placement also checks its approach. Player, AI and setup placement use the same rule; destruction/sale releases reservations.

Existing obstructed refineries are skipped on return. Trucks retain cargo, select another accessible refinery, or wait and retry once per second if none is available. Static access checks are cached per refinery for 0.75 seconds. Changing refineries releases dock ownership. Existing blocking buildings are not deleted automatically.

Damage-directed enemy retaliation now works during guard, attackmove and strategic attack. Attacker-ID checks are staggered at 0.25-0.355 seconds. Repeated damage from the same target does not replace paths/orders. The existing attack scheduler owns pursuit and path budgets. Rally/wave orders preserve a live retaliation target. Player manual orders remain respected.

Chrome and Firefox tests passed: six walkable access cells reject construction and show blocked previews; reservations release; new refineries reject obstructed approaches; a blocked truck retains cargo then unloads 100 at an alternative; clearing the entrance allows a 75-cargo deposit at the original refinery. Actual sentry fire with AI enabled provokes a damaging tank response. No page errors.

The 60-tank repeated-damage test acquired the attacker for all 60 units without an order-reset storm. Simulation tick p95 was 0.5 ms before/during this synthetic scenario; this does not measure all possible map/render loads.

Evidence: client/tests/refinery-access-retaliation-evidence.json. Reload with Ctrl+F5. Existing blockers must be sold/destroyed to reopen that refinery; another refinery is used when available. Main is not merged.
