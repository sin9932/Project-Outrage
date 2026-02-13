
/* =====================================================
   RTS CORE - REFACTORED STRUCTURE (STABLE BASE)
   ===================================================== */

/* ======================
   GLOBAL STATE MODULE
   ====================== */
const GameState = {
  time: 0,
  running: false,
  gameOver: false
};

const Entities = {
  units: [],
  buildings: []
};

const Selection = new Set();

/* ======================
   UTILS MODULE
   ====================== */
function dist2(x1,y1,x2,y2){
  const dx = x2-x1;
  const dy = y2-y1;
  return dx*dx + dy*dy;
}

/* ======================
   DAMAGE / COMBAT MODULE
   ====================== */
const Combat = {

  applyDamage(target, dmg, srcId=null, srcTeam=null){
    if (!target || !target.alive) return;
    if (target.attackable === false) return;

    target.hp -= dmg;

    if (target.hp > 0) return;

    this.handleDeath(target);
  },

  handleDeath(ent){
    if (!ent || !ent.alive) return;

    ent.alive = false;
    Selection.delete(ent.id);

    if (ent.onDeath) ent.onDeath();
  },

  applyAreaDamage(x,y,radius,dmg,srcId=null,srcTeam=null){
    const r2 = radius*radius;

    for (const u of Entities.units){
      if (!u.alive) continue;
      if (dist2(x,y,u.x,u.y) <= r2){
        this.applyDamage(u,dmg,srcId,srcTeam);
      }
    }

    for (const b of Entities.buildings){
      if (!b.alive) continue;
      if (dist2(x,y,b.x,b.y) <= r2){
        this.applyDamage(b,dmg,srcId,srcTeam);
      }
    }
  }

};

/* ======================
   BULLET SYSTEM MODULE
   ====================== */
const Bullets = {

  list: [],

  tick(dt){
    for (let i=this.list.length-1;i>=0;i--){
      const b = this.list[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0){
        this.list.splice(i,1);
      }
    }
  }

};

/* ======================
   AI MODULE
   ====================== */
const AI = {

  pickTarget(){

    for (const b of Entities.buildings){
      if (b.alive && b.team==="PLAYER"){
        return {x:b.x,y:b.y};
      }
    }

    for (const u of Entities.units){
      if (u.alive && u.team==="PLAYER"){
        return {x:u.x,y:u.y};
      }
    }

    return null;
  },

  tick(dt){
    const target = this.pickTarget();
    if (!target) return;

    for (const u of Entities.units){
      if (!u.alive) continue;
      if (u.team!=="ENEMY") continue;

      u.targetX = target.x;
      u.targetY = target.y;
    }
  }

};

/* ======================
   MAIN TICK LOOP
   ====================== */
function tick(dt){

  if (!GameState.running) return;
  if (GameState.gameOver) return;

  GameState.time += dt;

  AI.tick(dt);
  Bullets.tick(dt);
}

/* ======================
   INIT
   ====================== */
function startGame(){
  GameState.running = true;
  GameState.gameOver = false;
  GameState.time = 0;
}

console.log("Refactored RTS Core Loaded.");


// === RTS namespace bridge (safe refactor aid) ===
(function(){
  try {
    const api = { GameState, Entities, Selection, Combat, Bullets, AI, tick, startGame, dist2 };
    window.RTS = api;
    console.log('[RTS] namespace ready:', Object.keys(api));
  } catch (e) {
    console.error('[RTS] namespace init failed:', e);
  }
})();
