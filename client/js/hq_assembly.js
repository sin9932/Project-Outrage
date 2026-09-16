/* Construction-yard endpoint cache. Rendering owns this cache; simulation never
 * stores poses or canvases. Both directions use the same rigid Deploy clip. */
(function(g){
 'use strict';
 const source=Object.freeze({crop:{x:240,y:152,w:1165,h:952},pivot:{x:582.5,y:658}});
 const cache=new Map(),limit=32*1024*1024;let bytes=0,hits=0,builds=0;
 function key(color,res){return `${color}:${res}`;}
 function get(k){const v=cache.get(k);if(!v)return null;cache.delete(k);cache.set(k,v);hits++;return v.canvas;}
 function put(k,canvas){const old=cache.get(k);if(old){bytes-=old.bytes;cache.delete(k);}
  const size=canvas.width*canvas.height*4;cache.set(k,{canvas,bytes:size});bytes+=size;builds++;
  while(bytes>limit&&cache.size>1){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}
  return canvas;
 }
 function clear(){cache.clear();bytes=0;}
 g.OUHQAssembly=Object.freeze({source,key,get,put,clear,stats:()=>({entries:cache.size,bytes,hits,builds,limit})});
})(globalThis);
