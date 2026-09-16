# Development policy

The owner requires refactoring alongside feature development. This policy applies to future work.

- Locate the active entry point, state owner and module boundary before editing.
- Do not borrow similarly named fields from legacy code. Trace definitions and consumers.
- Simulation owns authoritative position, heading, targeting and firing state.
  Rendering and picking may only read simulation state; visual caches belong to the renderer.
- Keep model dimensions, axis conventions and motion tuning in one documented contract.
  Validate imported assets against that contract instead of silently guessing.
- Refactor duplicated logic and temporary coupling touched by a feature.
  Avoid unrelated wholesale rewrites.
- Reuse existing commands, navigation, damage, fog and selection systems.
- Verify affected behavior through the actual game, including regression cases.
  Record what passed and the remaining limitations.
- Keep implementation, fixtures and developer-only scenarios separate.
- Work on an isolated branch/worktree; preserve the owner's uncommitted work.
- Explain GitHub publication before pushing when no publication authorization exists.

- Use Red Alert 2 as the default reference for this project’s fixed isometric presentation, controls and unit/building behavior.
- Direction requests refer to the player’s screen. Keep entrances visible; do not rotate a whole building merely to change its exit side.
- Treat supplied deployment references as choreography and motion-weight references as well as design references: stagger connected mechanisms, ease acceleration/braking, and use restrained settling.
