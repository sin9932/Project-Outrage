/* atlas_tp.js
   Minimal TexturePacker JSON (multi-texture) loader + draw helper.
   - Supports format: { textures:[{image,size,frames:[{filename,frame,rotated,trimmed,spriteSourceSize,sourceSize,anchor}]}] }
*/
(function(){
  "use strict";
  const PO = (window.PO = window.PO || {});
  PO.atlasTP = PO.atlasTP || {};

  function _loadImage(src){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = ()=>reject(new Error("Image load failed: " + src));
      img.src = src;
    });
  }

  function _join(baseDir, file){
    if (!baseDir) return file;
    if (baseDir.endsWith("/")) return baseDir + file;
    return baseDir + "/" + file;
  }

  function _parseTPMulti(json){
    const atlas = { textures:[], frames:new Map() };
    const textures = json.textures || [];
    for (let ti=0; ti<textures.length; ti++){
      const t = textures[ti];
      const tex = {
        image: t.image,
        size: t.size || { w:0, h:0 },
        frames: t.frames || [],
        img: null,
      };
      atlas.textures.push(tex);
      for (const fr of tex.frames){
        const name = fr.filename;
        atlas.frames.set(name, {
          tex: ti,
          name,
          frame: fr.frame,
          rotated: !!fr.rotated,
          trimmed: !!fr.trimmed,
          spriteSourceSize: fr.spriteSourceSize || { x:0,y:0,w:fr.frame.w,h:fr.frame.h },
          sourceSize: fr.sourceSize || { w:fr.frame.w,h:fr.frame.h },
          anchor: fr.anchor || { x:0.5, y:0.5 },
        });
      }
    }
    return atlas;
  }

  async function loadTPAtlasMulti(jsonUrl, baseDir){
    // Avoid "cached HTML pretending to be JSON" (304 can keep a bad cached body).
    const res = await fetch(jsonUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Atlas JSON fetch failed: " + jsonUrl + " (" + res.status + ")");
    let json;
    try{
      json = await res.json();
    }catch(e){
      // If server returned HTML (SPA fallback / 404 page), res.json() throws.
      const txt = await res.text().catch(()=> "");
      const head = (txt || "").slice(0, 120).replace(/\s+/g, " ").trim();
      throw new Error("Atlas JSON parse failed: " + jsonUrl + " | startsWith: " + head);
    }
    const atlas = _parseTPMulti(json);

    for (let i=0;i<atlas.textures.length;i++){
      const t = atlas.textures[i];
      const imgPath = _join(baseDir || "", t.image);
      t.img = await _loadImage(imgPath);
    }
    return atlas;
  }

  function drawFrame(ctx, atlas, frameName, x, y, scale=1, alpha=1){
    const fr = atlas.frames.get(frameName);
    if (!fr) return false;
    const tex = atlas.textures[fr.tex];
    const img = tex && tex.img;
    if (!img) return false;

    const F = fr.frame;
    const SSS = fr.spriteSourceSize;
    const SS = fr.sourceSize;
    const A = fr.anchor || {x:0.5,y:0.5};

    const ox = (-SS.w * A.x) + SSS.x;
    const oy = (-SS.h * A.y) + SSS.y;

    if (fr.rotated){
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(x + (ox*scale), y + (oy*scale));
      ctx.rotate(-Math.PI/2);
      ctx.drawImage(img, F.x, F.y, F.h, F.w, 0, 0, F.h*scale, F.w*scale);
      ctx.restore();
      return true;
    }

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(img, F.x, F.y, F.w, F.h, x + ox*scale, y + oy*scale, F.w*scale, F.h*scale);
    ctx.restore();
    return true;
  }

  function getFrameSourceSize(atlas, frameName){
    const fr = atlas.frames.get(frameName);
    if (!fr) return null;
    return { w: fr.sourceSize.w, h: fr.sourceSize.h };
  }

  PO.atlasTP.loadTPAtlasMulti = loadTPAtlasMulti;
  PO.atlasTP.drawFrame = drawFrame;
  PO.atlasTP.getFrameSourceSize = getFrameSourceSize;
})();
