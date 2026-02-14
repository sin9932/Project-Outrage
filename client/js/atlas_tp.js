/* atlas_tp.js v4
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

  function _parseTPMulti(json, baseDir){
  // Normalize a variety of atlas JSON formats:
  // - TexturePacker: { meta:{image}, frames:{name:{frame:{x,y,w,h}, ...}} }
  // - TexturePacker multipack: { textures:[{image, frames:{...}}, ...] }
  // - Aseprite array/hash: { meta:{image}, frames:[{filename, frame:{...}, ...}] } or frames:{name:{frame:{...}}}
  const atlas = {
    textures: [],
    frames: new Map(),
    ready: true,
    json
  };

  function normPath(p){
    if(!p) return null;
    // keep URLs, otherwise resolve relative to baseDir
    if(/^(https?:)?\/\//i.test(p)) return p;
    if(p.startsWith('/')) return p;
    return baseDir + p;
  }

  function addTexture(imageName){
    const url = normPath(imageName);
    if(!url) return -1;
    const tex = { url, img: new Image(), ready: false };
    // Same-origin in your GH Pages setup, but keep safe for dev.
    try{ tex.img.crossOrigin = 'anonymous'; }catch(_){}
    tex.img.onload = ()=>{ tex.ready = true; };
    tex.img.onerror = ()=>{ tex.ready = false; };
    tex.img.src = url;
    atlas.textures.push(tex);
    return atlas.textures.length - 1;
  }

  function normRect(r){
    if(!r) return {x:0,y:0,w:0,h:0};
    // Some tools use {x,y,w,h} already
    if(typeof r.x==='number') return {x:r.x, y:r.y, w:r.w ?? r.width ?? 0, h:r.h ?? r.height ?? 0};
    return {x:0,y:0,w:0,h:0};
  }

  function normSize(s, fallbackW, fallbackH){
    if(!s) return {w:fallbackW, h:fallbackH};
    return {w: s.w ?? s.width ?? fallbackW, h: s.h ?? s.height ?? fallbackH};
  }

  function addFrame(name, fr, texIndex){
    if(!name) return;
    const frameRect = normRect(fr.frame || fr.frameRect || fr);
    const rotated = !!fr.rotated;
    const trimmed = !!fr.trimmed;

    const sss = fr.spriteSourceSize || fr.sprite_source_size || fr.spriteSource || null;
    const source = fr.sourceSize || fr.source_size || fr.source || null;

    const spriteSourceSize = sss ? {
      x: sss.x ?? 0,
      y: sss.y ?? 0,
      w: sss.w ?? sss.width ?? frameRect.w,
      h: sss.h ?? sss.height ?? frameRect.h
    } : { x:0, y:0, w: frameRect.w, h: frameRect.h };

    const sourceSize = source ? normSize(source, frameRect.w, frameRect.h) : { w: frameRect.w, h: frameRect.h };

    atlas.frames.set(String(name), {
      tex: texIndex,
      frame: frameRect,
      rotated,
      trimmed,
      spriteSourceSize,
      sourceSize
    });
  }

  // Multipack (TexturePacker)
  if(Array.isArray(json && json.textures)){
    for(const t of json.textures){
      const imgName = t.image || (t.meta && t.meta.image) || (t.metadata && t.metadata.image);
      const texIndex = addTexture(imgName);
      const frames = t.frames || {};
      if(Array.isArray(frames)){
        for(const fr of frames){
          addFrame(fr.filename || fr.name, fr, texIndex);
        }
      }else{
        for(const [k, fr] of Object.entries(frames)){
          addFrame(k, fr, texIndex);
        }
      }
    }
    return atlas;
  }

  // Single sheet
  const imgName = (json && json.meta && json.meta.image) || (json && json.image) || null;
  const texIndex = addTexture(imgName);

  const frames = (json && json.frames) ? json.frames : null;
  if(Array.isArray(frames)){
    for(let i=0;i<frames.length;i++){
      const fr = frames[i];
      addFrame(fr.filename || fr.name || ('frame_' + i), fr, texIndex);
    }
  }else if(frames && typeof frames === 'object'){
    for(const [k, fr] of Object.entries(frames)){
      addFrame(k, fr, texIndex);
    }
  }

  return atlas;
}

  async function loadTPAtlasMulti(jsonUrl, baseDir){
    // baseDir default: directory of jsonUrl
    if (!baseDir){
      try{
        const noHash = String(jsonUrl).split("#")[0];
        const noQ = noHash.split("?")[0];
        const i = noQ.lastIndexOf("/");
        baseDir = (i>=0) ? noQ.slice(0,i+1) : "";
      }catch(_e){
        baseDir = "";
      }
    }

    const res = await fetch(jsonUrl, {cache:"no-store"});
    if (!res.ok) throw new Error("Atlas JSON fetch failed: " + jsonUrl + " (HTTP " + res.status + ")");
    const text = await res.text();
    const t = text.trim();
    if (!t || t[0] === "<"){
      // Cloudflare Pages / SPA fallbacks often return HTML for missing JSON
      throw new Error("Atlas JSON is not JSON (got HTML). URL: " + jsonUrl);
    }

    let json;
    try{ json = JSON.parse(text); }
    catch(e){ throw new Error("Atlas JSON parse failed: " + jsonUrl + " (" + e.message + ")"); }

    const atlas = _parseTPMulti(json);

    for (let i=0;i<atlas.textures.length;i++){
      const tx = atlas.textures[i];
      const imgPath = _join(baseDir || "", tx.image);
      tx.img = await _loadImage(imgPath);
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

  
// --- helpers: numeric-suffix ordering for animations (e.g. foo_1.png .. foo_20.png) ---
function trailingNumber(name) {
  if (!name) return null;
  const m = String(name).match(/(\d+)(?=\.[a-zA-Z0-9]+$)/);
  return m ? parseInt(m[1], 10) : null;
}

function listFramesByPrefix(atlas, prefix, opts) {
  opts = opts || {};
  const want = String(prefix || '');
  const keys = (atlas && atlas.frames)
    ? Array.from(atlas.frames.keys ? atlas.frames.keys() : Object.keys(atlas.frames))
    : [];
  let frames = keys.filter(k => String(k).startsWith(want));
  if (opts.sortNumeric !== false) {
    frames.sort((a,b) => {
      const na = trailingNumber(a);
      const nb = trailingNumber(b);
      if (na == null && nb == null) return String(a).localeCompare(String(b));
      if (na == null) return 1;
      if (nb == null) return -1;
      if (na !== nb) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }
  return frames;
}

function getFrame(atlas, frameName) {
  if (!atlas || !atlas.frames) return null;
  if (atlas.frames.get) return atlas.frames.get(frameName) || null;
  return atlas.frames[frameName] || null;
}


// Apply a normalized pivot (TexturePacker "anchor") to frames.
// Pivot is normalized to the SOURCE size (not the trimmed frame).
function applyPivot(atlas, frameName, pivot){
  const fr = getFrame(atlas, frameName);
  if (!fr) return false;
  fr.anchor = { x: Number(pivot.x), y: Number(pivot.y) };
  return true;
}

function applyPivotToFrames(atlas, frameNames, pivot){
  if (!frameNames) return 0;
  let n = 0;
  for (const name of frameNames){
    if (applyPivot(atlas, name, pivot)) n++;
  }
  return n;
}

function applyPivotByPrefix(atlas, prefix, pivot, opts){
  const frames = listFramesByPrefix(atlas, prefix, opts);
  return applyPivotToFrames(atlas, frames, pivot);
}

// localStorage schema (same origin):
//   key "PO_PIVOT_OVERRIDES" => { "<prefix>": { "x": 0.5, "y": 0.52 }, ... }
function loadPivotOverridesFromLocalStorage(key){
  try{
    const raw = localStorage.getItem(key || 'PO_PIVOT_OVERRIDES');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  }catch(e){
    return null;
  }
}

function applyPivotOverrides(atlas, overrides, opts){
  if (!overrides) return 0;
  let n = 0;
  for (const prefix of Object.keys(overrides)){
    const p = overrides[prefix];
    if (!p) continue;
    n += applyPivotByPrefix(atlas, prefix, { x: p.x, y: p.y }, opts);
  }
  return n;
}

function getFrameSourceSize(atlas, frameName){
    const fr = atlas.frames.get(frameName);
    if (!fr) return null;
    return { w: fr.sourceSize.w, h: fr.sourceSize.h };
  }

  PO.atlasTP.loadTPAtlasMulti = loadTPAtlasMulti;
  PO.atlasTP.drawFrame = drawFrame;
  PO.atlasTP.getFrameSourceSize = getFrameSourceSize;
  PO.atlasTP.listFramesByPrefix = listFramesByPrefix;
  PO.atlasTP.trailingNumber = trailingNumber;
  PO.atlasTP.applyPivot = applyPivot;
  PO.atlasTP.applyPivotToFrames = applyPivotToFrames;
  PO.atlasTP.applyPivotByPrefix = applyPivotByPrefix;
  PO.atlasTP.loadPivotOverridesFromLocalStorage = loadPivotOverridesFromLocalStorage;
  PO.atlasTP.applyPivotOverrides = applyPivotOverrides;
  PO.atlasTP.getFrame = getFrame;
})();