/* FIX: ensure global impacts array exists (ESM/legacy bridge) */
globalThis.__impacts = globalThis.__impacts || [];
var __impacts = globalThis.__impacts;
var fires = (typeof fires !== 'undefined' && fires) ? fires : [];
try { if (typeof window !== 'undefined') window.fires = fires; } catch(e) {}

/* bullet_system.js
   - Extracted from game.js (tickBullets/applyDamage/applyAreaDamageAt)
   - Runs in global scope and expects game.js to call it with a context object.
*/
(function(){
  "use strict";


// ---- module-compat shims (legacy expected globals) ----
var updateExplosions = function proxy_updateExplosions() {
  try {
    var fn = (typeof globalThis !== 'undefined') ? globalThis.updateExplosions : (typeof window !== 'undefined' ? window.updateExplosions : undefined);
    if (typeof fn === 'function') return fn.apply(null, arguments);
  } catch(e) {}
  // no-op fallback
};
// -------------------------------------------------------

// legacy expected global: healMarks (fx marks / decals)
var healMarks = function proxy_healMarks() {
  try {
    var v = (typeof globalThis !== 'undefined') ? globalThis.healMarks : (typeof window !== 'undefined' ? window.healMarks : undefined);
    if (v === undefined) {
      v = [];
      try { if (typeof globalThis !== 'undefined') globalThis.healMarks = v; } catch(e) {}
      try { if (typeof window !== 'undefined') window.healMarks = v; } catch(e) {}
    }
    return v;
  } catch(e) { return []; }
}();
// -------------------------------------------------------
  const BulletSystem = {};


  function applyDamage(target, dmg, srcId=null, srcTeam=null, C){
      if (!target || !target.alive) return;
      if (target.attackable === false) return;
  
    window.__combatUntil = Math.max(window.__combatUntil||0, performance.now()+12000);
      target.lastDamaged = C.state.t;
      if (srcId!=null){
        target.lastAttacker = srcId;
        target.lastAttackerTeam = srcTeam;
        target.lastAttackedAt = C.state.t;
      }
  
      // Sniper: being attacked reveals for 1.5s; if not hit again, auto-cloaks when timer expires.
      if (target.kind==="sniper"){
        target.cloakBreak = Math.max(target.cloakBreak||0, 1.5);
        target.cloaked = false;
      }
  
      // Player under attack: toast + minimap ping + SPACE jump memory (4s window, max 2 saved).
      if (srcTeam===C.TEAM.ENEMY && target.team===C.TEAM.PLAYER){
        if (target.kind==="harvester" || C.BUILD[target.kind]) C.notifyPlayerAttacked(target);
      }
  
      target.hp -= dmg;
  
      if (target.hp > 0) return;
  
      // Centralized death handling: NEVER do partial cleanup in random call sites.
      C.handleEntityDeath(target, srcId, srcTeam);
    }

  function applyAreaDamageAt(x,y, radius, dmg, srcId=null, srcTeam=null, C){
      const r2 = radius*radius;
      for (const u of C.units){
        if (!u.alive || u.inTransport || u.hidden) continue;
        if (C.dist2(x,y,u.x,u.y) <= r2){ applyDamage(u, dmg, srcId, srcTeam); }
      }
      for (const b of C.buildings){
        if (!b.alive || b.civ) continue;
        // Buildings: use center distance
        if (C.dist2(x,y,b.x,b.y) <= r2){ applyDamage(b, dmg, srcId, srcTeam); }
      }
    }

  function tickBullets(dt, C){
  
  // ---- external deps (injected from game.js) ----
const {
  bullets = [], units = [], buildings = [],
  flashes = [], sparks = [], particles = [],
  explored = null,
  TEAM, BUILD, state = { t: 0 },
  TILE = 48,
  inMap = (()=>true), idx = (()=>0),
  dist = ((ax,ay,bx,by)=>Math.hypot(bx-ax,by-ay)),
  dist2 = ((ax,ay,bx,by)=>{const dx=bx-ax, dy=by-ay; return dx*dx+dy*dy;}),
  norm = ((x,y)=>{const l=Math.hypot(x,y)||1; return {x:x/l,y:y/l};}),
  rand = Math.random,
  getEntityById = (()=>null),
  buildingAnyExplored = (()=>true),
  notifyPlayerAttacked = (()=>{}),
  handleEntityDeath = (()=>{}),
  impacts = null,
} = (C||{});

// Some legacy code uses `impacts` for hit particles.
// If not provided, fall back to particles array.
const _impacts = impacts || particles;

  
  // Local wrappers that keep API identical to original code
  const applyDamageLocal = (target, dmg, srcId=null, srcTeam=null) =>
    BulletSystem.applyDamage(target, dmg, srcId, srcTeam, C);
  
  const applyAreaDamageAtLocal = (x,y, radius, dmg, srcId=null, srcTeam=null) =>
    BulletSystem.applyAreaDamageAt(x, y, radius, dmg, srcId, srcTeam, C);
  
  
      // bullets + shells
  
      function explodeMissile(bl, ix, iy){
        // impact FX (missile)
        flashes.push({x: ix, y: iy, r: 44 + Math.random()*10, life: 0.10, delay: 0});
        for (let k=0;k<6;k++){
          const ang = Math.random()*Math.PI*2;
          const spd = 70 + Math.random()*160;
          _impacts.push({x:ix,y:iy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.20,delay:0});
        }
  
        // direct hit + splash
        const t = (bl.tid!=null) ? getEntityById(bl.tid) : null;
        if (t && t.alive && t.attackable!==false && t.team!==bl.team){
          // FIX: buildings are large; checking only center distance makes edge hits deal 0 damage.
          // If we have an explicit hit target, always apply direct damage.
          // (Infantry/vehicles still "feel" it via splash too.)
          applyDamageLocal(t, (bl.dmg||0), bl.ownerId, bl.team);
        } else {
          // Fallback: if no explicit target id, still allow edge/side hits on buildings
          // by checking the impact point against enemy building AABBs.
          const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          for (const b of buildings){
            if (!b.alive || b.team!==enemyTeam) continue;
            if (b.attackable===false) continue;
            const x0=b.x-b.w/2-2, y0=b.y-b.h/2-2;
            const x1=x0+b.w+4, y1=y0+b.h+4;
            if (ix>=x0 && ix<=x1 && iy>=y0 && iy<=y1){
              applyDamageLocal(b, (bl.dmg||0), bl.ownerId, bl.team);
              break;
            }
          }
        }
  
        // splash
        applyAreaDamageAtLocal(ix, iy, 38, (bl.dmg||0)*0.45, bl.ownerId, bl.team);
      }
  
  
      for (let i=bullets.length-1;i>=0;i--){
        const bl = bullets[i];
  
        if (bl.kind==="shell"){
          // track moving target so shells can actually hit infantry
          if (bl.tid){
            const tEnt = getEntityById(bl.tid);
            if (tEnt && tEnt.alive){ bl.x1 = tEnt.x; bl.y1 = tEnt.y; }
          }
          bl.t += dt / (bl.dur||0.25);
          const t = Math.min(1, bl.t);
          bl.x = bl.x0 + (bl.x1 - bl.x0)*t;
          bl.y = bl.y0 + (bl.y1 - bl.y0)*t;
  
          if (t >= 1){
            // impact at destination
            let hit=null;
  
            // Friendly-fire support (CTRL force-attack testing):
            // If a shell was fired with allowFriendly and tracks a specific entity id,
            // allow damage regardless of team.
            if (bl.allowFriendly && bl.tid){
              const tEnt = getEntityById(bl.tid);
              if (tEnt && tEnt.alive && !tEnt.inTransport && !tEnt.hidden){
                hit = tEnt;
              }
            }
  
            const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
  
            if (!hit){
            // units
            for (const u of units){
              if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
  const tx=tileOfX(u.x), ty=tileOfY(u.y);
              if (enemyTeam===TEAM.ENEMY){
                if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
              }
              if (dist2(bl.x, bl.y, u.x, u.y) <= (u.r+10)*(u.r+10)){ hit=u; break; }
            }
            // buildings
            if (!hit){
              for (const b of buildings){
                if (!b.alive || b.team!==enemyTeam) continue;
                if (b.attackable===false) continue;
                if (enemyTeam===TEAM.ENEMY){
                  if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
                }
                const x0=b.x-b.w/2, y0=b.y-b.h/2;
                if (bl.x>=x0-8 && bl.x<=x0+b.w+8 && bl.y>=y0-8 && bl.y<=y0+b.h+8){ hit=b; break; }
              }
            }
  
            // dmg bonus: tank
            let dmg = bl.dmg;
            const owner = getEntityById(bl.ownerId);
            if (owner && owner.kind==="tank"){
              // slightly reduced vs infantry (tank was deleting infantry too fast)
              if (hit && hit.cls==="inf") dmg *= 0.70;
              // modest bonus vs vehicles/buildings
              if (hit && (BUILD[hit.kind] || hit.kind==="tank")) dmg *= 1.15;
            }
  
            }
  
            if (hit) applyDamageLocal(hit, dmg, bl.ownerId, bl.team);
  
            // impact FX: ellipse dodge + sparks
            flashes.push({x: bl.x, y: bl.y, r: 48 + Math.random()*10, life: 0.10, delay: 0});
            for (let k=0;k<6;k++){
              const ang = Math.random()*Math.PI*2;
              const spd = 60 + Math.random()*140;
              _impacts.push({x:bl.x,y:bl.y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.22,delay:0});
            }
  
            // Ore deformation: explosive shell impacts on ore will shallow it over time.
            try{
              const owner2 = getEntityById(bl.ownerId);
              if (owner2 && owner2.kind==="tank"){
                const tx=(bl.x/TILE)|0, ty=(bl.y/TILE)|0;
                if (inMap(tx,ty)){
                  const ii=idx(tx,ty);
                  if (ore[ii] > 0){
                    const dig = 22 + (dmg||0)*0.35;
                    ore[ii] = Math.max(0, ore[ii] - dig);
                  }
                }
              }
            }catch(_e){}
  
            bullets.splice(i,1);
          }
          continue;
        }
  
        // normal bullet (linear)
        bl.life -= dt;
        const px = bl.x, py = bl.y;
        bl.x += bl.vx*dt;
        bl.y += bl.vy*dt;
  
        // Swept collision for missiles to prevent tunneling through buildings at high speed.
        // (Checks the segment [prev -> current] against unit circles and building AABBs.)
        if (bl.kind==="missile"){
          const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          let hit=null;
  
          for (const u of units){
            if (!u.alive||u.team!==enemyTeam||u.inTransport||u.hidden) continue;
            const txU=tileOfX(u.x), tyU=tileOfY(u.y);
            if (enemyTeam===TEAM.ENEMY){
              if (inMap(txU,tyU) && !explored[TEAM.PLAYER][idx(txU,tyU)]) continue;
            }
            const rr = (u.r||18) + 3;
            if (segIntersectsCircle(px,py, bl.x,bl.y, u.x,u.y, rr)){ hit=u; break; }
          }
          if (!hit){
            for (const b of buildings){
              if (!b.alive||b.team!==enemyTeam) continue;
              if (b.attackable===false) continue;
              if (enemyTeam===TEAM.ENEMY){
                if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
              }
              const x0=b.x-b.w/2-2, y0=b.y-b.h/2-2;
              const x1=x0+b.w+4, y1=y0+b.h+4;
              if (segIntersectsAABB(px,py, bl.x,bl.y, x0,y0,x1,y1)){ hit=b; break; }
            }
          }
          if (hit){
            bl.tid = hit.id;
            explodeMissile(bl, bl.x, bl.y);
            bullets.splice(i,1);
            continue;
          }
        }
  
        if (bl.life<=0){
          if (bl.kind==="missile"){
            const ix = (bl.tx??bl.x), iy = (bl.ty??bl.y);
            explodeMissile(bl, ix, iy);
          }
          bullets.splice(i,1); continue;
        }
  
        const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
        let hit=null;
  
        for (const u of units){
          if (!u.alive||u.team!==enemyTeam||u.inTransport||u.hidden) continue;
          const tx=tileOfX(u.x), ty=tileOfY(u.y);
          if (enemyTeam===TEAM.ENEMY){
            if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
          }
          if (dist2(bl.x,bl.y,u.x,u.y) <= u.r*u.r){ hit=u; break; }
        }
        if (!hit){
          for (const b of buildings){
            if (!b.alive||b.team!==enemyTeam) continue;
            if (b.attackable===false) continue;
            if (enemyTeam===TEAM.ENEMY){
                  if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
                }
            const x0=b.x-b.w/2, y0=b.y-b.h/2;
            if (bl.x>=x0 && bl.x<=x0+b.w && bl.y>=y0 && bl.y<=y0+b.h){ hit=b; break; }
          }
        }
        if (hit){
          if (bl.kind==="missile"){
            bl.tid = hit.id;
            explodeMissile(bl, bl.x, bl.y);
            bullets.splice(i,1);
            continue;
          }
          let dmg = bl.dmg;
          const owner = getEntityById(bl.ownerId);
          if (owner && owner.kind==="tank"){
            if (BUILD[hit.kind] || hit.kind==="tank") dmg *= 1.25;
          }
          applyDamageLocal(hit, dmg, bl.ownerId, bl.team);
          bullets.splice(i,1);
        }
      }
      for (let i=__impacts.length-1;i>=0;i--){
        const p = _impacts[i];
        p.delay = (p.delay||0) - dt;
        if (p.delay > 0) continue;
        p.life -= dt;
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        // quick drag
        p.vx *= (1 - Math.min(1, dt*7.5));
        p.vy *= (1 - Math.min(1, dt*7.5));
        if (p.life<=0) _impacts.splice(i,1);
      }
      // Building fire particles when HP is critically low (<30%)
      for (const b of buildings){
        if (b.attackable===false) continue;
        const r = (b.hpMax>0) ? (b.hp/b.hpMax) : 1;
        if (r < 0.30){
          b._fireAcc = (b._fireAcc||0) + dt;
          if (b._fireAcc >= 0.08){
            b._fireAcc = 0;
            const tw = (b.tw||1), th = (b.th||1);
            // spawn near the roof area
            const rx = (Math.random()-0.5) * tw * TILE * 0.55;
            const ry = (Math.random()-0.5) * th * TILE * 0.55;
            fires.push({
              x: b.x + rx, y: b.y + ry,
              vx: (Math.random()*2-1)*12,
              vy: (Math.random()*2-1)*12,
              rise: 18 + Math.random()*26,
              life: 0.55 + Math.random()*0.35
            });
          }
        } else {
          b._fireAcc = 0;
        }
      }
  
      for (let i=fires.length-1;i>=0;i--){
        const f = fires[i];
        f.life -= dt;
        if (f.life<=0){ fires.splice(i,1); continue; }
        f.x += f.vx*dt; f.y += f.vy*dt;
        f.rise *= (1 - Math.min(1, dt*2.5));
      }
  
      updateExplosions(dt);
  
      for (let i=healMarks.length-1;i>=0;i--){
        const h = healMarks[i];
        h.life -= dt;
        if (h.life<=0) healMarks.splice(i,1);
      }
  
      // shell casings physics (simple hop + fall)
      for (let i=casings.length-1;i>=0;i--){
        const c = casings[i];
        c.delay = (c.delay||0) - dt;
        if (c.delay > 0) continue;
  
        c.life -= dt;
        c.x += c.vx*dt;
        c.y += c.vy*dt;
  
        // gravity on z
        c.vz -= 820*dt;
        c.z += c.vz*dt;
  
        // ground bounce
        if (c.z < 0){
          c.z = 0;
          c.vz *= -0.42;
          c.vx *= 0.78;
          c.vy *= 0.78;
        }
  
        // air/ground drag
        c.vx *= (1 - Math.min(1, dt*1.6));
        c.vy *= (1 - Math.min(1, dt*1.6));
        c.rot += (c.vx*0.003 + c.vy*0.003);
  
        if (c.life<=0) casings.splice(i,1);
      }
  
      for (let i=traces.length-1;i>=0;i--){
        traces[i].delay = (traces[i].delay||0) - dt;
        if (traces[i].delay > 0) continue;
        traces[i].life -= dt;
        if (traces[i].life<=0) traces.splice(i,1);
      }
  
      for (let i=flashes.length-1;i>=0;i--){
        flashes[i].delay = (flashes[i].delay||0) - dt;
        if (flashes[i].delay > 0) continue;
        flashes[i].life -= dt;
        if (flashes[i].life<=0) flashes.splice(i,1);
      }
    }

  BulletSystem.applyDamage = applyDamage;
  BulletSystem.applyAreaDamageAt = applyAreaDamageAt;
  BulletSystem.tickBullets = tickBullets;

  window.BulletSystem = BulletSystem;
})();
