Modular RTS Skeleton (ES Modules)
================================

- index.html loads ./js/main.js as the only entrypoint.
- Systems mutate state; render reads state.
- This is a working scaffold (you'll see a grid; entities can be added from dev console).

To run:
- Serve with a static server (VSCode Live Server / http-server / Netlify / GitHub Pages).
- Do NOT open via file:// for module imports.

Next step to migrate your existing project:
1) Upload your current js/game.js, js/units.js, js/buildings.js, js/atlas_tp.js.
2) I will split their contents into the /core, /entities, /systems, /render layout and wire them into main.js.
