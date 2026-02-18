// sim.js
// - Simulation tick wrapper (movement/attack/collision orchestration)
// - Tick functions are injected via refs to avoid DOM dependencies.

(function (global) {
  "use strict";

  const OUSim = global.OUSim || (global.OUSim = {});

  OUSim.create = function create(refs) {
    const r = refs || {};

    const buildings = r.buildings || [];
    const units = r.units || [];
    const bullets = r.bullets || [];
    const flashes = r.flashes || [];
    const impacts = r.impacts || [];
    const explored = r.explored || [];
    const visible = r.visible || [];
    const fires = r.fires || [];
    const healMarks = r.healMarks || [];
    const casings = r.casings || [];
    const traces = r.traces || [];

    const TEAM = r.TEAM || {};
    const POWER = r.POWER || {};
    const DEFENSE = r.DEFENSE || {};
    const BUILD = r.BUILD || {};
    const TILE = r.TILE || 48;
    const ore = r.ore || [];

    const getPowerFactor = r.getPowerFactor;
    const isUnderPower = r.isUnderPower;
    const getEntityById = r.getEntityById;
    const dist2 = r.dist2;
    const tileOfX = r.tileOfX;
    const tileOfY = r.tileOfY;
    const inMap = r.inMap;
    const idx = r.idx;
    const spawnTurretMGTracers = r.spawnTurretMGTracers;
    const applyDamage = r.applyDamage;
    const applyAreaDamageAt = r.applyAreaDamageAt;
    const segIntersectsCircle = r.segIntersectsCircle;
    const segIntersectsAABB = r.segIntersectsAABB;
    const updateExplosions = r.updateExplosions;

    function buildingAnyExplored(viewerTeam, b){
      // Consider a building "known/visible" if any tile in its footprint is explored.
      // Using only (b.tx,b.ty) breaks for large buildings partially in fog.
      const ex = explored[viewerTeam];
      for (let ty=b.ty; ty<b.ty+b.th; ty++){
        for (let tx=b.tx; tx<b.tx+b.tw; tx++){
          if (!inMap(tx,ty)) continue;
          if (ex[idx(tx,ty)]) return true;
        }
      }
      return false;
    }

    function tickTurrets(dt){
      for (const b of buildings){
        if (!b.alive || b.civ || b.kind!=="turret") continue;
        if (b.shootCd>0) b.shootCd -= dt;

        const pf=getPowerFactor ? getPowerFactor(b.team) : 1;
        const spec=DEFENSE.turret;
        const rof=spec.rofBase/pf;
        const range=spec.range;
        if (b.shootCd>0) continue;

        // Low power: powered defenses go offline (RA2-ish)
        if (POWER.turretUse>0 && isUnderPower && isUnderPower(b.team)){
          continue;
        }
        // Force-fire/force-attack overrides auto-targeting.
        if (b.forceFire){
          if (b.forceFire.mode==="id"){
            const t = getEntityById ? getEntityById(b.forceFire.id) : null;
            if (!t || !t.alive || t.attackable===false){ b.forceFire=null; }
            else {
              const d2=dist2(b.x,b.y,t.x,t.y);
              if (d2<=range*range){
                b.shootCd=rof;
                if (spawnTurretMGTracers) spawnTurretMGTracers(b, t);
                const dmg = (t.cls==="inf") ? (spec.dmgInf ?? spec.dmg) : spec.dmg;
                if (applyDamage) applyDamage(t, dmg, b.id, b.team);
              }
              continue;
            }
          } else if (b.forceFire.mode==="pos"){
            const tx=b.forceFire.x, ty=b.forceFire.y;
            const d2=dist2(b.x,b.y, tx, ty);
            if (d2<=range*range){
              b.shootCd=rof;
              if (spawnTurretMGTracers) spawnTurretMGTracers(b, {x:tx, y:ty, cls:"pos"});
              if (applyAreaDamageAt) applyAreaDamageAt(tx,ty, 18, Math.max(1, spec.dmg*0.35), b.id, b.team);
            }
            continue;
          }
        }

        const enemyTeam = b.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
        let best=null, bestD=Infinity;

        // target enemy units
        for (const u of units){
          if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
          if (u.kind==="sniper" && u.cloaked) continue;
          const tx=tileOfX(u.x), ty=tileOfY(u.y);
          if (inMap(tx,ty) && !visible[b.team][idx(tx,ty)]) continue;
          const d2=dist2(b.x,b.y,u.x,u.y);
          if (d2<bestD){ bestD=d2; best=u; }
        }

        // also target enemy buildings
        for (const bb of buildings){
          if (!bb.alive || bb.civ) continue;
          if (bb.team!==enemyTeam) continue;
          if (bb.attackable===false) continue;
          const tx=bb.tx, ty=bb.ty;
          if (inMap(tx,ty) && !visible[b.team][idx(tx,ty)]) continue;
          const d2=dist2(b.x,b.y,bb.x,bb.y);
          if (d2<bestD){ bestD=d2; best=bb; }
        }

        if (best && bestD<=range*range){
          b.shootCd = rof;
          if (spawnTurretMGTracers) spawnTurretMGTracers(b, best);
          const dmg = (best.cls==="inf") ? (spec.dmgInf ?? spec.dmg) : spec.dmg;
          if (applyDamage) applyDamage(best, dmg, b.id, b.team);
        }
      }
    }

    function tickBullets(dt){
      // bullets + shells

      function explodeMissile(bl, ix, iy){
        // impact FX (missile)
        flashes.push({x: ix, y: iy, r: 44 + Math.random()*10, life: 0.10, delay: 0});
        for (let k=0;k<6;k++){
          const ang = Math.random()*Math.PI*2;
          const spd = 70 + Math.random()*160;
          impacts.push({x:ix,y:iy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.20,delay:0});
        }

        // direct hit + splash
        const t = (bl.tid!=null) ? getEntityById(bl.tid) : null;
        if (t && t.alive && t.attackable!==false && t.team!==bl.team){
          // If we have an explicit hit target, always apply direct damage.
          if (applyDamage) applyDamage(t, (bl.dmg||0), bl.ownerId, bl.team);
        } else {
          // Fallback: if no explicit target id, still allow edge/side hits on buildings
          const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          for (const b of buildings){
            if (!b.alive || b.team!==enemyTeam) continue;
            if (b.attackable===false) continue;
            const x0=b.x-b.w/2-2, y0=b.y-b.h/2-2;
            const x1=x0+b.w+4, y1=y0+b.h+4;
            if (ix>=x0 && ix<=x1 && iy>=y0 && iy<=y1){
              if (applyDamage) applyDamage(b, (bl.dmg||0), bl.ownerId, bl.team);
              break;
            }
          }
        }

        // splash
        if (applyAreaDamageAt) applyAreaDamageAt(ix, iy, 38, (bl.dmg||0)*0.45, bl.ownerId, bl.team);
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

            // Friendly-fire support (CTRL force-attack testing)
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
            }

            // dmg bonus: tank
            let dmg = bl.dmg;
            const owner = getEntityById(bl.ownerId);
            if (owner && owner.kind==="tank"){
              // slightly reduced vs infantry
              if (hit && hit.cls==="inf") dmg *= 0.70;
              // modest bonus vs vehicles/buildings
              if (hit && (BUILD[hit.kind] || hit.kind==="tank")) dmg *= 1.15;
            }

            if (hit) applyDamage(hit, dmg, bl.ownerId, bl.team);

            // impact FX
            flashes.push({x: bl.x, y: bl.y, r: 48 + Math.random()*10, life: 0.10, delay: 0});
            for (let k=0;k<6;k++){
              const ang = Math.random()*Math.PI*2;
              const spd = 60 + Math.random()*140;
              impacts.push({x:bl.x,y:bl.y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.22,delay:0});
            }

            // Ore deformation
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
          if (applyDamage) applyDamage(hit, dmg, bl.ownerId, bl.team);
          bullets.splice(i,1);
        }
      }
      for (let i=impacts.length-1;i>=0;i--){
        const p = impacts[i];
        p.delay = (p.delay||0) - dt;
        if (p.delay > 0) continue;
        p.life -= dt;
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        // quick drag
        p.vx *= (1 - Math.min(1, dt*7.5));
        p.vy *= (1 - Math.min(1, dt*7.5));
        if (p.life<=0) impacts.splice(i,1);
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

      if (updateExplosions) updateExplosions(dt);

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

    function tickSim(dt) {
      if (typeof r.tickUnits === "function") r.tickUnits(dt);
      tickTurrets(dt);
      tickBullets(dt);
    }

    return {
      tickSim
    };
  };
})(window);

