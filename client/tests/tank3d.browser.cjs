const { chromium } = require(process.env.OUTRAGE_PLAYWRIGHT || 'playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const dest=process.argv[2];
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  try {
    await page.goto('http://127.0.0.1:8765/index.html?debug=1&tankdemo=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.OUTankTest && window.OUTank3D?.status==='ready',null,{timeout:120000});
    console.log('MODEL_READY');
    await page.locator('#fogOff').check();
    await page.locator('#startBtn').click();
    await page.waitForFunction(()=>OUTankTest.running && OUTankTest.units.some(u=>u.kind==='tank'),null,{timeout:120000});
    const start=await page.evaluate(()=>{
      const g=OUTankTest, u=g.units.find(u=>u.team===g.TEAM.PLAYER&&u.kind==='tank');
      u.bodyYaw=-2.0;
      g.centerCameraOn(u.x,u.y);
      return {id:u.id,x:u.x,y:u.y};
    });
    await page.waitForTimeout(300);
    let pick=await page.evaluate(id=>{
      const g=OUTankTest,u=g.getEntityById(id),p=g.worldToScreen(u.x,u.y);
      return {x:p.x,y:p.y-20*g.cam.zoom};
    },start.id);
    await page.mouse.click(pick.x,pick.y);
    await page.waitForFunction(id=>OUTankTest.state.selection.has(id),start.id,{timeout:5000});
    console.log('MODEL_RAY_SELECTION_PASS');
    const goal=await page.evaluate(id=>{
      const g=OUTankTest,u=g.getEntityById(id),T=g.TILE;
      for(let dy=2;dy<7;dy++)for(let dx=3;dx<8;dx++){
        const tx=Math.floor(u.x/T)+dx,ty=Math.floor(u.y/T)+dy,i=ty*g.MAP_W+tx;
        if(tx>=g.MAP_W-1||ty>=g.MAP_H-1||g.terrain[i]!==0||g.buildOcc[i]||g.treeHp[i]>0)continue;
        const x=(tx+.5)*T,y=(ty+.5)*T,p=g.worldToScreen(x,y);
        if(p.x>60&&p.x<1120&&p.y>90&&p.y<820)return{x,y,sx:p.x,sy:p.y};
      }
      throw Error('No reachable test destination in viewport');
    },start.id);
    await page.mouse.click(goal.sx,goal.sy);
    const yawSamples=[];
    for(let i=0;i<18;i++){
      await page.waitForTimeout(100);
      yawSamples.push(await page.evaluate(id=>OUTankTest.getEntityById(id).bodyYaw,start.id));
    }
    const moved=await page.evaluate(id=>{const u=OUTankTest.getEntityById(id);return{x:u.x,y:u.y,yaw:u.bodyYaw};},start.id);
    assert(Math.hypot(moved.x-start.x,moved.y-start.y)>30,'Selected tank did not move');
    assert(new Set(yawSamples.map(a=>a.toFixed(3))).size>3,'Hull did not rotate continuously');
    console.log('MOVE_AND_CONTINUOUS_HULL_PASS',moved);
    const enemy=await page.evaluate(id=>{
      const g=OUTankTest,u=g.getEntityById(id);
      u.order={type:'idle',x:u.x,y:u.y};u.path=null;u.vx=0;u.vy=0;
      const e=g.addUnit(g.TEAM.ENEMY,'tank',u.x+170,u.y-90,{skipMvp:true});
      e.hp=e.hpMax=10000;e.canAttack=false;e.range=0;
      g.centerCameraOn(u.x+50,u.y-20);
      return{id:e.id,hp:e.hp};
    },start.id);
    await page.waitForTimeout(350);
    pick=await page.evaluate(id=>{const g=OUTankTest,u=g.getEntityById(id),p=g.worldToScreen(u.x,u.y);return{x:p.x,y:p.y-20*g.cam.zoom};},enemy.id);
    await page.mouse.click(pick.x,pick.y);
    await page.waitForFunction(id=>(OUTankTest.getEntityById(id).shotSerial||0)>0,start.id,{timeout:12000});
    await page.waitForFunction(id=>OUTankTest.getEntityById(id).hp<10000,enemy.id,{timeout:10000});
    const result=await page.evaluate(({id,enemyId})=>{
      const g=OUTankTest,u=g.getEntityById(id),a=OUTankMotion.muzzle(u,g.state.t),b=OUTank3D.muzzleWorld(u,g.state.t);
      return {status:OUTank3D.status,draws:OUTank3D.draws,shots:u.shotSerial,enemyHp:g.getEntityById(enemyId).hp,
        bodyYaw:u.bodyYaw,turretYaw:u.turretYaw,muzzleError:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),asset:OUTank3D.asset};
    },{id:start.id,enemyId:enemy.id});
    assert(result.muzzleError<.01,JSON.stringify(result));
    assert(Math.abs(result.bodyYaw-result.turretYaw)>.1,'Turret is not independent');
    assert.equal(errors.length,0,errors.join('\n'));
    const zoomHits=await page.evaluate(id=>{const g=OUTankTest,u=g.getEntityById(id);return [.6,1,1.8].map(z=>{g.cam.zoom=z;const p=g.worldToScreen(u.x,u.y);return OUTank3D.hitTest(u,{x:p.x,y:p.y-20*z},p,z,g.state.t);});},start.id);
    assert(zoomHits.every(Boolean),'Model picking failed at a supported zoom');
    await page.evaluate(id=>{const g=OUTankTest,u=g.getEntityById(id);g.cam.zoom=1.4;g.centerCameraOn(u.x,u.y);},start.id);
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(dest,'gameplay-3d.png')});
    fs.writeFileSync(path.join(dest,'browser-test.json'),JSON.stringify({pass:true,start,moved,yawSamples,result,errors},null,2));
    console.log('BROWSER_TEST_PASS',JSON.stringify(result));
  }catch(error){
    await page.screenshot({path:path.join(dest,'gameplay-failure.png')}).catch(()=>{});
    const state=await page.evaluate(()=>({renderer:window.OUTank3D?.status,rendererError:window.OUTank3D?.error,running:window.OUTankTest?.running,units:window.OUTankTest?.units?.map(u=>({id:u.id,kind:u.kind,x:u.x,y:u.y,order:u.order}))})).catch(()=>({}));
    fs.writeFileSync(path.join(dest,'browser-test.json'),JSON.stringify({pass:false,error:String(error),errors,state},null,2));
    console.error(error,errors,state);process.exitCode=1;
  }finally{await browser.close();}
})();
