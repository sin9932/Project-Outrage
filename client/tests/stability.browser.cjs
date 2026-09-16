const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT);
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 try{
 await page.goto('http://127.0.0.1:8765/index.html?debug=1&tankdemo=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready',null,{timeout:120000});
 await page.locator('#fogOff').check();await page.locator('#startBtn').click();
 await page.waitForFunction(()=>OUTankTest.running,null,{timeout:120000});
 const selected=await page.evaluate(()=>{const g=OUTankTest,u=g.units.find(u=>u.kind==='tank'&&u.team===0);g.state.selection.clear();g.state.selection.add(u.id);g.centerCameraOn(u.x,u.y);return u.id});
 await page.mouse.click(600,400,{button:'right'});
 assert.equal(await page.evaluate(()=>OUTankTest.state.selection.size),0,'Right click must clear selection');
 await page.evaluate(id=>OUTankTest.state.selection.add(id),selected);
 const before=await page.evaluate(()=>({x:OUTankTest.cam.x,y:OUTankTest.cam.y}));
 await page.mouse.move(600,400);await page.mouse.down({button:'right'});await page.mouse.move(700,470,{steps:10});await page.mouse.up({button:'right'});
 const pan=await page.evaluate(id=>({selected:OUTankTest.state.selection.has(id),x:OUTankTest.cam.x,y:OUTankTest.cam.y}),selected);
 assert(pan.selected,'Right drag must retain selection');assert(Math.hypot(pan.x-before.x,pan.y-before.y)>10,'Right drag must pan');
 const construction=await page.evaluate(async()=>{
 const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=900;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const kinds=[['barracks','barrack','_barrackBuildT0'],['power','power','_powerBuildT0'],['refinery','refinery','_refineryBuildT0']];
 const report=[];
 for(let row=0;row<kinds.length;row++){
 const [kind,asset,key]=kinds[row],d=await(await fetch('asset/sprite/const/const_anim/'+asset+'/'+asset+'_const.json')).json();
 const textures=d.textures||[d];let count=0;
 for(const t of textures){const f=t.frames;count+=(Array.isArray(f)?f:Object.keys(f||{})).length;}
 const end=count/24;
 const ent={kind,x:0,y:0,team:0,hp:100,hpMax:100,alive:true,[key]:0};
 const times=[end-.025,end,end+.075,end+.15,end+.3],area=[];
 for(let col=0;col<times.length;col++){
 const c=document.createElement('canvas');c.width=300;c.height=300;const cx=c.getContext('2d',{willReadFrequently:true});
 const state={t:times[col],colors:OUTankTest.state.colors};
 const draw=()=>PO.buildings.drawBuilding(ent,cx,{zoom:1},{worldToScreen:()=>({x:150,y:225})},state);
 const old=JSON.stringify(ent);if(!draw())throw Error(kind+' did not draw');
 if(JSON.stringify(ent)!==old)throw Error('Renderer mutated construction state');
 const first=cx.getImageData(0,0,300,300).data;let pixels=0;for(let i=3;i<first.length;i+=4)if(first[i]>32)pixels++;
 if(pixels<1000)throw Error(kind+' blank construction boundary');
 cx.clearRect(0,0,300,300);draw();const second=cx.getImageData(0,0,300,300).data;
 if(first.some((v,i)=>v!==second[i]))throw Error(kind+' depends on previous render');
 ctx.drawImage(c,col*300,row*300);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(kind+' '+times[col].toFixed(3),col*300+8,row*300+25);
 area.push(pixels);
 }
 report.push({kind,frames:count,pixels:area});
 }
 return {report,png:canvas.toDataURL('image/png').split(',')[1]};
 });
 fs.writeFileSync(path.join(process.argv[2],'construction-boundary.png'),Buffer.from(construction.png,'base64'));
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(path.join(process.argv[2],'stability-input-buildings.json'),JSON.stringify({pass:true,rightClick:true,rightDrag:pan,construction:construction.report,errors},null,2));
 console.log('INPUT_CONSTRUCTION_PASS',JSON.stringify(construction.report));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});