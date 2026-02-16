// Project-Outrage shared helpers (safe extraction stage 1)
// Intentionally tiny + dependency-free.
// Loaded before game.js so game can reuse helpers without growing itself.
(function(){
  const OU = (typeof window !== "undefined") ? (window.OU || (window.OU = {})) : {};

  // DOM helpers
  OU.$  = OU.$  || ((id) => document.getElementById(id));
  OU.qs = OU.qs || ((sel, root=document) => root.querySelector(sel));
  OU.qsa= OU.qsa|| ((sel, root=document) => Array.from(root.querySelectorAll(sel)));

  // Math helpers
  OU.clamp = OU.clamp || ((v,a,b)=>Math.max(a,Math.min(b,v)));
  OU.dist2 = OU.dist2 || ((ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; });
  OU.rnd   = OU.rnd   || ((a,b)=> a + Math.random()*(b-a));
  OU.irnd  = OU.irnd  || ((a,b)=> Math.floor(OU.rnd(a, b+1)));

  // Timing
  OU.now = OU.now || (() => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());

  // Misc
  OU.noop = OU.noop || (()=>{});
})();