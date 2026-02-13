// fx_core.js - shared FX bootstrap + tile sync
(function(){
  'use strict';
  const FX = window.FX = window.FX || {};
  FX._setTileHooks = FX._setTileHooks || [];
  // Tile size used by FX modules (synced via hooks)
  FX.TILE = FX.TILE || 64;
  FX.setTile = function(t){
    FX.TILE = t || FX.TILE || 64;
    for (const fn of FX._setTileHooks){
      try{ fn(FX.TILE); } catch(e){ console.error("[FX] setTile hook error", e); }
    }
  };
  // simple shared helpers
  FX.clamp = FX.clamp || function(v,a,b){ return Math.max(a, Math.min(b, v)); };
  // init sync
  FX.setTile(FX.TILE);
})();
