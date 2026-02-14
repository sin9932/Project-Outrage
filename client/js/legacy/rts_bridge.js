/* RTS bridge: provides a single stable namespace without breaking existing globals.
   Goal: you can migrate modules gradually to window.RTS.* while keeping window.G / window.PO alive. */
;(function(){
  const RTS = (window.RTS = window.RTS || {});
  RTS.version = RTS.version || "bridge-v1";

  // Keep legacy roots
  const G  = (window.G  = window.G  || {});
  const PO = (window.PO = window.PO || {});

  // Common buckets (do not overwrite if already set)
  RTS.G  = RTS.G  || G;
  RTS.PO = RTS.PO || PO;

  // Normalize Units / Buildings accessors (best-effort, backward compatible)
  // Units historically lived at window.G.U or window.G.Units depending on build.
  if (!G.Units && G.U) G.Units = G.U;
  if (!G.U && G.Units) G.U = G.Units;
  RTS.Units = RTS.Units || G.Units || {};

  // Buildings historically lived at window.PO.buildings (or sometimes build)
  if (!PO.buildings && PO.build) PO.buildings = PO.build;
  if (!PO.build && PO.buildings) PO.build = PO.buildings;
  RTS.Buildings = RTS.Buildings || PO.buildings || {};

  // AtlasTP helper often lives at window.PO.atlasTP
  RTS.atlasTP = RTS.atlasTP || PO.atlasTP || null;

  // Optional FX namespace (won't throw if missing)
  RTS.FX = RTS.FX || window.FX || null;

  // Minimal debug helper
  RTS.debug = RTS.debug || {};
})();
