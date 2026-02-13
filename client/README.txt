RA2-style anti-jitter patch

- Replace your client/js/game.js with the included game.js.
- index.html is included unchanged (for reference).

Main change: infantry get deterministic sub-slots inside destination tiles (move + attack-move) and followPath respects final order point.
