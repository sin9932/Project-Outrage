/* Original-art construction yard assembly. Source-space masks are articulation
 * boundaries, not replacement artwork. The same pose drives deploy/repack/sale.
 * Rendering only: no entity, economy, collision, or timing writes. */
(function(g){
 'use strict';
 const source={crop:{x:240,y:152,w:1165,h:952},pivot:{x:582.5,y:658}};
 const clamp=v=>Math.max(0,Math.min(1,v));
 const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
 // Coordinates refer to the untouched con_yard_n.png. Priority masks partition
 // overlapping outlines exactly once, so settled seams cannot double-darken.
 const definitions=[
  ['crane',.58,1,'swing',[827,350],[[239,151],[1406,151],[1406,382],[239,382]]],
  ['mast',.43,.86,'lift',[829,454],[[239,382],[1406,382],[1406,480],[239,480]]],
  ['pedestal',.30,.70,'lift',[831,591],[[727,433],[938,432],[957,477],[953,559],[828,622],[727,566]]],
  ['roof-collar',.25,.70,'deck',[826,641],[[710,491],[961,546],[1085,656],[1017,704],[886,749],[600,658],[615,600]]],
  ['front-right-armor',.22,.65,'wall',[787,939],[[662,774],[728,727],[848,770],[916,902],[838,977],[697,944]]],
  ['front-left-armor',.20,.61,'wall',[463,868],[[401,676],[516,627],[585,688],[538,819],[493,936],[402,896]]],
  ['rear-right-armor',.23,.66,'wall',[1201,795],[[1069,623],[1201,629],[1284,700],[1287,813],[1187,891],[1117,768]]],
  ['platform',.02,.32,'deck',[823,829],[[239,743],[387,743],[389,890],[709,965],[824,1025],[1269,876],[1277,772],[1406,772],[1406,1105],[239,1105]]],
  ['east-body',.16,.58,'wall',[1060,875],[[826,560],[1406,560],[1406,1105],[826,1105]]],
  ['west-body',.14,.56,'wall',[579,864],[[239,510],[826,510],[826,1105],[239,1105]]],
  ['inner-frame',.12,.49,'lift',[823,810],[[239,151],[1406,151],[1406,1105],[239,1105]]]
 ];
 const parts=definitions.map(([name,start,end,hinge,pivot,points])=>({name,start,end,hinge,pivot:pivot.map((v,i)=>v-[240,152][i]),points:points.map(p=>p.map((v,i)=>v-[240,152][i]))}));
 const polygon=(c,points)=>{c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();};
 function phase(part,progress){return smooth((progress-part.start)/(part.end-part.start));}
 function transform(part,progress){
  const t=phase(part,progress),fold=1-t,[px,py]=part.pivot;
  // Finite projected hinges: the narrow initial face sits inside the opening
  // vehicle. Outriggers slide before walls rotate up; mast lifts before crane locks.
  const a=part.hinge==='deck'?Math.max(.035,Math.sin(t*Math.PI/2)):part.hinge==='wall'?.20+.80*t:part.hinge==='swing'?.08+.92*t:.7+.3*t;
  const d=part.hinge==='wall'?Math.max(.035,Math.sin(t*Math.PI/2)):part.hinge==='deck'?.08+.92*t:Math.max(.015,Math.sin(t*Math.PI/2));
  const angle=part.hinge==='swing'?-.58*fold:0,cos=Math.cos(angle),sin=Math.sin(angle);
  const apertureY=source.pivot.y-(['lift','swing'].includes(part.hinge)?90:0);
  const x=(source.pivot.x-px)*fold,y=(apertureY-py)*fold;
  return{t,a:a*cos,b:a*sin,c:-d*sin,d:d*cos,x:px+x,y:py+y,px,py};
 }
 function draw(c,img,rect,progress){
  const p=clamp(progress);if(p>=1){c.drawImage(img,0,0,source.crop.w,source.crop.h,rect.x,rect.y,rect.w,rect.h);return;}
  c.save();c.translate(rect.x,rect.y);c.scale(rect.w/source.crop.w,rect.h/source.crop.h);
  // Back-to-front part order. Earlier masks own any shared source pixels.
  for(let i=parts.length-1;i>=0;i--){
   const part=parts[i],m=transform(part,p);if(m.t<=0)continue;
   c.save();c.translate(m.x,m.y);c.transform(m.a,m.b,m.c,m.d,0,0);c.translate(-m.px,-m.py);
   c.beginPath();polygon(c,part.points);c.clip();
   for(let j=0;j<i;j++){c.beginPath();c.rect(0,0,source.crop.w,source.crop.h);polygon(c,parts[j].points);c.clip('evenodd');}
   c.drawImage(img,0,0);c.restore();
  }
  c.restore();
 }
 g.OUHQAssembly=Object.freeze({source,draw,pose:p=>parts.map(part=>({name:part.name,...transform(part,p)}))});
})(globalThis);
