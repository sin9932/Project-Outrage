const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({});
for(const file of ['tank_config.js','tank_motion.js'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
const m=context.OUTankMotion;
const frozen=Object.freeze({x:10,y:20,bodyDir:1,turretDir:7});
const before=JSON.stringify(frozen);
const point=m.muzzle(frozen,0);
assert([point.x,point.y,point.z].every(Number.isFinite));
assert.equal(JSON.stringify(frozen),before,'Reading muzzle changed simulation data');
assert.equal(Object.hasOwn(frozen,'bodyYaw'),false);
const deg=Math.PI/180;
assert(Math.abs(m.wrap(m.toward(179*deg,-179*deg,1,1)-(-179*deg)))<1e-9);
function integrate(fps){let angle=-2;for(let i=0;i<fps;i++)angle=m.toward(angle,1,1.5,1/fps);return angle;}
assert(Math.abs(integrate(30)-integrate(120))<1e-9,'Turn speed depends on frame rate');
assert(Object.isFrozen(context.OUTankConfig));
console.log('READ_ONLY_POSE_AND_TURN_CONTRACT_PASS');
