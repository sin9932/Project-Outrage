# Yard proportions, deployment weight and right-hand factory entrance

The previous factory change turned the entire building away from the camera.
The yard also left too much empty foundation around a low production hall, and
its joints stopped abruptly rather than settling under load.

The factory now retains its roof and foundation orientation. Its portal, shutter
and ramp occupy the right-hand wall, with a matching opening, clear interior lane
and simulation exit. A finished service facade closes the former entrance. The
model contract verifies heading, scale and root orientation at load time.

The construction yard has a smaller apron, a higher central roof and a production
hall with 12% more width, 6% more depth and 16% more height. These dimensions are
baked into the rigid geometry. Packed hinge positions keep the hall inside the
MCV; no animated scaling is used. The work crane, cargo and warehouse shutter
share the revised height contract.

Deployment remains 0.8 seconds. Overlapping stages establish the foundation,
lift internal equipment and close the shell before the crane settles. Heavy
slides brake over a longer tail; rotating equipment has restrained overshoot.
Repacking traverses the same animation in reverse. Stable yards continue to use
the exact deployment endpoint as their cached image.

Validation on the isolated `yard-motion` checkout:

- Chrome and Firefox: MCV production, D/double-click deployment, immediate
  construction during deployment, option-gated repacking, preserved health,
  separate selling and destruction, enemy deployment.
- Chrome measured deployment at 0.815 seconds, including frame sampling.
- Chrome and Firefox: right-hand factory dispatch, blocked-exit waiting,
  sequential production, harvester exit, cancellation, paid production at zero
  balance, primary-factory changes, roof hatch and reverse sale.
- 49 deployment poses and eight packed headings inspected in the game renderer.
- Construction completion work: FIFO, team/nearest-yard routing, cancellation,
  zero differing pixels at the work endpoints and read-only rendering.
- Animated-to-cached yard transition: zero differing pixels. Six settled yards
  share one cached image and submit zero WebGL pages.
- Motion curves have zero endpoint velocity; heavy slides remain monotonic;
  rotating-part overshoot stays below 0.8% of travel.

`mcv-deploy-refined.gif` is the actual game renderer's deployment and reverse
deployment, with 0.8-second moving segments and holds for inspection. It is not
the separate container-handling animation. `yard-proportions-in-game.png` shows
the revised final proportions, and `factory-right-dispatch.png` shows the exit.
