/* atlas_tp.js v3
   - Supports TexturePacker multipack (json.textures[]) AND single-pack (json.frames + meta.image)
   - Auto baseDir from jsonUrl if not provided
   - Exposes: PO.atlasTP.loadTPAtlasAny (and alias loadTPAtlasMulti), drawFrame, listFramesByPrefix
*/
(function(){
  const PO = (window.PO = window.PO || {});
  PO.atlasTP = PO.atlasTP || {};

  const _imgCache = new Map();

  function _join(base, rel){
    base = String(base || "");
    rel = String(rel || "");
    if (!base) return rel;
    if (!rel) return base;
    if (base.endsWith("/") && rel.startsWith("/")) return base + rel.slice(1);
    if (!base.endsWith("/") && !rel.startsWith("/")) return base + "/" + rel;
    return base + rel;
  }

  function _inferBaseDir(jsonUrl){
    try{
      const noHash = String(jsonUrl).split("#")[0];
      const noQ = noHash.split("?")[0];
      const i = noQ.lastIndexOf("/");
      return (i >= 0) ? noQ.slice(0, i+1) : "";
    }catch(_e){
      return "";
    }
  }

  function _loadImage(url){
    const key = String(url);
    if (_imgCache.has(key)) return _imgCache.get(key);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed: " + url));
      img.src = url;
    });
    _imgCache.set(key, p);
    return p;
  }

  function _normFrameObj(fr){
    const F = fr.frame || fr;
    const w = (F && F.w) || 0, h = (F && F.h) || 0;
    const SSS = fr.spriteSourceSize || {x:0,y:0,w:w,h:h};
    const SS  = fr.sourceSize || {w:(SSS.w||w), h:(SSS.h||h)};
    return {
      frame: F,
      rotated: !!fr.rotated,
      trimmed: !!fr.trimmed,
      spriteSourceSize: SSS,
      sourceSize: SS,
      anchor: fr.anchor || null,
    };
  }

  function _parseTPMulti(json){
    const atlas = { textures:[], frames:new Map() };
    const textures = Array.isArray(json.textures) ? json.textures : [];
    for (let ti=0; ti<textures.length; ti++){
      const t = textures[ti] || {};
      const tex = {
        image: t.image,
        size: t.size || { w:0, h:0 },
        frames: Array.isArray(t.frames) ? t.frames : [],
        img: null,
      };
      atlas.textures.push(tex);
      for (const fr0 of tex.frames){
        const fr = fr0 || {};
        const name = fr.filename;
        if (!name) continue;
        const nf = _normFrameObj(fr);
        atlas.frames.set(name, {
          tex: ti,
          frame: nf.frame,
          rotated: nf.rotated,
          trimmed: nf.trimmed,
          spriteSourceSize: nf.spriteSourceSize,
          sourceSize: nf.sourceSize,
          anchor: nf.anchor,
        });
      }
    }
    return atlas;
  }

  function _parseTPSingle(json){
    const atlas = { textures:[], frames:new Map() };
    const meta = (json && json.meta) ? json.meta : {};
    const image = meta.image || (json && json.image) || null;

    const tex = { image: image, size: meta.size || {w:0,h:0}, frames: [], img: null };
    atlas.textures.push(tex);

    let framesArr = [];
    if (Array.isArray(json.frames)){
      // frames: [{filename, frame, ...}, ...]
      framesArr = json.frames;
    } else if (json.frames && typeof json.frames === "object"){
      // frames: { "name.png": {frame:{...}, ...}, ...}
      framesArr = Object.entries(json.frames).map(([filename, obj]) => {
        const o = obj || {};
        return Object.assign({ filename }, o);
      });
    }

    for (const fr0 of framesArr){
      const fr = fr0 || {};
      const name = fr.filename;
      if (!name) continue;
      const nf = _normFrameObj(fr);
      atlas.frames.set(name, {
        tex: 0,
        frame: nf.frame,
        rotated: nf.rotated,
        trimmed: nf.trimmed,
        spriteSourceSize: nf.spriteSourceSize,
        sourceSize: nf.sourceSize,
        anchor: nf.anchor,
      });
    }
    return atlas;
  }

  function _parseTexturePacker(json){
    if (json && Array.isArray(json.textures)) return _parseTPMulti(json);
    return _parseTPSingle(json || {});
  }

  async function loadTPAtlasAny(jsonUrl, baseDir){
    if (!baseDir) baseDir = _inferBaseDir(jsonUrl);

    const res = await fetch(jsonUrl, {cache:"no-store"});
    if (!res.ok) throw new Error("Atlas JSON fetch failed: " + jsonUrl + " (HTTP " + res.status + ")");
    const text = await res.text();
    const t = (text || "").trim();
    if (!t || t[0] === "<"){
      throw new Error("Atlas JSON is HTML (missing file or SPA fallback): " + jsonUrl);
    }

    let json;
    try{ json = JSON.parse(t); }
    catch(e){ throw new Error("Atlas JSON parse failed: " + jsonUrl + " (" + e.message + ")"); }

    const atlas = _parseTexturePacker(json);

    // load textures
    for (let i=0;i<atlas.textures.length;i++){
      const tx = atlas.textures[i];
      if (!tx || !tx.image) continue;
      const imgPath = _join(baseDir || "", tx.image);
      tx.img = await _loadImage(imgPath);
    }

    return atlas;
  }

  function drawFrame(ctx, atlas, frameName, x, y, scale=1, alpha=1){
    if (!atlas || !atlas.frames) return false;
    const fr = (atlas.frames.get) ? atlas.frames.get(frameName) : null;
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

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = ctx.globalAlpha * alpha;

    ctx.drawImage(img, F.x, F.y, F.w, F.h, x + ox*scale, y + oy*scale, F.w*scale, F.h*scale);

    ctx.restore();
    return true;
  }

  function trailingNumber(name) {
    if (!name) return null;
    const m = String(name).match(/(\d+)(?=\.[a-zA-Z0-9]+$)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function listFramesByPrefix(atlas, prefix){
    if (!atlas || !atlas.frames) return [];
    const keys = Array.from(atlas.frames.keys());
    const pre = String(prefix || "");
    const hits = keys.filter(k => String(k).startsWith(pre));
    hits.sort((a,b)=>{
      const na = trailingNumber(a);
      const nb = trailingNumber(b);
      if (na == null && nb == null) return String(a).localeCompare(String(b));
      if (na == null) return 1;
      if (nb == null) return -1;
      return na - nb;
    });
    return hits;
  }

  PO.atlasTP.loadTPAtlasAny = loadTPAtlasAny;
  // backward-compatible aliases
  PO.atlasTP.loadTPAtlasMulti = loadTPAtlasAny;
  PO.atlasTP.drawFrame = drawFrame;
  PO.atlasTP.listFramesByPrefix = listFramesByPrefix;
})();
