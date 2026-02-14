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
  // Auto-derive baseDir from jsonUrl when not provided.
  // TexturePacker multipack JSON usually stores only file names in `textures[].image`.
  // Without a baseDir, the browser tries to load from the current page URL (often site root).
  if (!baseDir) {
    const _clean = (jsonUrl || "").split("#")[0].split("?")[0];
    const _slash = _clean.lastIndexOf("/");
    if (_slash >= 0) baseDir = _clean.slice(0, _slash);
  }
  if (baseDir && baseDir.endsWith("/")) baseDir = baseDir.slice(0, -1);

    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error("Atlas JSON fetch failed: " + jsonUrl);
    const json = await res.json();
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