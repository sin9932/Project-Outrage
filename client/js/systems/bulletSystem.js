import { TEAM, BUILD } from "../core/config.js";
import { dist2 } from "../utils/math.js";

// Legacy BulletSystem registers itself on window.BulletSystem (loaded via js/legacy/index.js).
function handleEntityDeath(state, ent){
  if(!ent || !ent.alive) return;
  ent.alive = false;
  state.entities.deadQueue.push(ent.id);
}

function notifyPlayerAttacked(state, ent){
  // Minimal UI hook. You can route this through renderUI later.
  const name = ent?.kind ?? "entity";
  state.ui.toast.text = `공격받음: ${name}`;
  state.ui.toast.until = performance.now() + 1500;
}

function makeContext(state){
  // Legacy BulletSystem expects plain arrays (with length/index),
  // not iterators/Maps.
  const unitsArr = Array.isArray(state.units)
    ? state.units
    : Array.from(state.entities?.units?.values?.() ?? []);
  const buildingsArr = Array.isArray(state.buildings)
    ? state.buildings
    : Array.from(state.entities?.buildings?.values?.() ?? []);
  const bulletsArr = state.bullets?.list ?? state.bullets ?? [];

  // Ensure FX buckets exist
  state.fx = state.fx || { flashes: [], sparks: [], particles: [], impacts: [] };

  // Minimal geometry helpers
  const dist = (ax,ay,bx,by)=>Math.hypot(bx-ax, by-ay);
  const norm = (x,y)=>{ const l=Math.hypot(x,y)||1; return { x:x/l, y:y/l }; };
  const rand = Math.random;

  const getEntityById = (id)=>{
    for(const u of unitsArr){ if(u?.id===id) return u; }
    for(const b of buildingsArr){ if(b?.id===id) return b; }
    return null;
  };

  return {
    TEAM,
    BUILD,
    bullets: bulletsArr,
    units: unitsArr,
    buildings: buildingsArr,
    flashes: state.fx.flashes,
    sparks: state.fx.sparks,
    particles: state.fx.particles,
    impacts: state.fx.impacts,
    explored: state.explored ?? null,

    // world helpers (safe stubs; upgrade later)
    TILE: state.world?.tileSize ?? 48,
    inMap: (x,y)=>Number.isFinite(x)&&Number.isFinite(y),
    idx: ()=>0,

    // math
    dist,
    dist2,
    norm,
    rand,

    // sim time
    state: { t: state.sim?.t ?? state.t ?? 0 },

    // hooks
    getEntityById,
    buildingAnyExplored: ()=>true,
    handleEntityDeath: (ent)=>handleEntityDeath(state, ent),
    notifyPlayerAttacked: (ent)=>notifyPlayerAttacked(state, ent),
  };
}

export function tickBullets(state, dt, bus){
  void bus;
  const BS = window.BulletSystem;
  if(!BS || typeof BS.tickBullets !== "function") return;

  const C = makeContext(state);
  BS.tickBullets(dt, C);
}

export function applyDamage(state, target, dmg, srcId=null, srcTeam=null){
  const BS = window.BulletSystem;
  if(!BS || typeof BS.applyDamage !== "function") return;
  const C = makeContext(state);
  BS.applyDamage(target, dmg, srcId, srcTeam, C);
}

export function applyAreaDamageAt(state, x, y, radius, dmg, srcId=null, srcTeam=null){
  const BS = window.BulletSystem;
  if(!BS || typeof BS.applyAreaDamageAt !== "function") return;
  const C = makeContext(state);
  BS.applyAreaDamageAt(x, y, radius, dmg, srcId, srcTeam, C);
}
