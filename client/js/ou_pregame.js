// ou_pregame.js
// [refactor] Pregame utilities extracted from game.js
// - preloadImages: load image URLs before game start (avoid first-hit flicker)
// - applyTeamColorsFromPayload: apply player/enemy colors to OURender palette

(function (global) {
  "use strict";

  const OUPregame = global.OUPregame || (global.OUPregame = {});

  /**
   * preloadImages(urls) -> Promise
   * Loads image URLs in parallel. Resolves when all complete (success or error).
   */
  OUPregame.preloadImages = function preloadImages(urls) {
    const list = Array.from(new Set((urls || []).filter(Boolean)));
    return Promise.all(list.map((u) => {
      return new Promise((res) => {
        try {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => res();
          img.onerror = () => res();
          img.src = u;
        } catch (_e) {
          res();
        }
      });
    }));
  };

  /**
   * applyTeamColorsFromPayload(payload, state)
   * Applies payload.playerColor / payload.enemyColor to state.colors,
   * then updates OURender team accent and clears sprite caches.
   */
  OUPregame.applyTeamColorsFromPayload = function applyTeamColorsFromPayload(payload, state) {
    if (payload && payload.playerColor) state.colors.player = payload.playerColor;
    if (payload && payload.enemyColor) state.colors.enemy = payload.enemyColor;

    try {
      const OURender = global.OURender;
      const prgb = (OURender && typeof OURender.hexToRgb === "function")
        ? (OURender.hexToRgb(state.colors.player) || [80, 180, 255])
        : [80, 180, 255];
      const ergb = (OURender && typeof OURender.hexToRgb === "function")
        ? (OURender.hexToRgb(state.colors.enemy) || [255, 60, 60])
        : [255, 60, 60];

      if (OURender && typeof OURender.setTeamAccent === "function") {
        OURender.setTeamAccent({ player: prgb, enemy: ergb, neutral: [170, 170, 170] });
      }
      if (OURender && typeof OURender.clearTeamSpriteCache === "function") {
        OURender.clearTeamSpriteCache();
      }
      if (OURender && typeof OURender.clearInfTeamSheetCache === "function") {
        OURender.clearInfTeamSheetCache();
      }
    } catch (_e) {}
  };
})(window);
