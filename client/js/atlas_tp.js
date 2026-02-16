/* atlas_tp.js (TexturePacker) v6 + v22 back-compat
   - Supports TP Multi (textures[] array) and TP Hash (frames:{}), plus frames[] array.
   - Produces atlas.frames (Map) and atlas.framesByName (plain object) for compatibility.
   - Provides drawFrame() that respects trimming and optional rotated frames.
*/
(() => {
  const PO = (window.PO = window.PO || {});
  PO.atlasTP = PO.atlasTP || {};

  const VERSION = 10;

  // v9: caching + parallel image load (prevents repeated network/decode on every ensure call)
  const _atlasPromiseCache = new Map();   // jsonUrl -> Promise<atlas>
  const _jsonTextCache     = new Map();   // jsonUrl -> Promise<string>
  const _imagePromiseCache = new Map();   // imgUrl  -> Promise<HTMLImageElement>


  function looksLikeHTML(s) {
    if (!s) return false;
    const head = String(s).trimStart().slice(0, 80).toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head') || head.includes('<body');
  }

  function baseDirFromUrl(url) {
    const q = url.split('?')[0].split('#')[0];
    const i = q.lastIndexOf('/');
    if (i <= 0) return '';
    return q.slice(0, i);
  }

  function joinUrl(base, rel) {
    if (!base) return rel;
    if (!rel) return base;
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    if (rel.startsWith('/')) return b + rel;
    return b + '/' + rel;
  }

  function isPlainObject(x) {
    return x && typeof x === 'object' && !Array.isArray(x);
  }

  function toRect(r) {
    if (!r) return { x: 0, y: 0, w: 0, h: 0 };
    // TP usually uses {x,y,w,h}
    const x = Number(r.x || 0);
    const y = Number(r.y || 0);
    const w = Number(r.w ?? r.width ?? 0);
    const h = Number(r.h ?? r.height ?? 0);
    return { x, y, w, h };
  }

  function toSize(s) {
    if (!s) return { w: 0, h: 0 };
    const w = Number(s.w ?? s.width ?? 0);
    const h = Number(s.h ?? s.height ?? 0);
    return { w, h };
  }

  function toSpriteSourceSize(ss, fallbackW, fallbackH) {
    if (!ss) return { x: 0, y: 0, w: fallbackW, h: fallbackH };
    const x = Number(ss.x || 0);
    const y = Number(ss.y || 0);
    const w = Number(ss.w ?? ss.width ?? fallbackW);
    const h = Number(ss.h ?? ss.height ?? fallbackH);
    return { x, y, w, h };
  }

  function normalizeFrameCommon(filename, fr, texIndex) {
    const frame = toRect(fr.frame || fr);
    const rotated = !!fr.rotated;
    const trimmed = !!fr.trimmed;
    const sourceSize = toSize(fr.sourceSize);
    const spriteSourceSize = toSpriteSourceSize(fr.spriteSourceSize, frame.w, frame.h);
    const pivot = fr.pivot || fr.anchor || null; // TP uses pivot, some tools use anchor
    return {
      name: filename,
      texIndex,
      frame,
      rotated,
      trimmed,
      sourceSize,
      spriteSourceSize,
      pivot, // {x,y} normalized (0..1) in sourceSize space
    };
  }

  function parseTP(data) {
    // Accept JSON text too (some callers pass the fetched text for caching reasons)
    if (typeof data === 'string') {
      try { data = JSON.parse(data); }
      catch (e) { throw new Error('Atlas JSON parse failed: ' + (e && e.message ? e.message : e)); }
    }

    // Returns { textures: [{image, frames: [frameObj]}] }
    if (!data) throw new Error('Invalid atlas JSON (empty).');

    // Multi pack: { textures:[{image, frames:[...]}] }
    if (Array.isArray(data.textures)) {
      const textures = data.textures.map((t) => ({
        image: t.image,
        frames: (Array.isArray(t.frames) ? t.frames
            : (isPlainObject(t.frames) ? Object.entries(t.frames).map(([name, fr]) => Object.assign({ filename: name }, fr))
            : [])), 
      }));
      return { textures };
    }

    // Hash format: { frames: {name:{frame...}, ...}, meta:{image:"x.png"} }
    if (isPlainObject(data.frames)) {
      const image = data.meta && data.meta.image ? data.meta.image : (data.image || null);
      if (!image) throw new Error('TP hash atlas missing meta.image');
      const framesArr = Object.entries(data.frames).map(([name, fr]) => {
        const obj = Object.assign({ filename: name }, fr);
        return obj;
      });
      return { textures: [{ image, frames: framesArr }] };
    }

    // Array frames format: { frames:[{filename,...}], meta:{image:"x.png"} }
    if (Array.isArray(data.frames)) {
      const image = data.meta && data.meta.image ? data.meta.image : (data.image || null);
      if (!image) throw new Error('TP frames[] atlas missing meta.image');
      return { textures: [{ image, frames: data.frames }] };
    }

    throw new Error('Unsupported atlas JSON shape (need textures[] or frames).');
  }

  function loadImage(src) {
    if (_imagePromiseCache.has(src)) return _imagePromiseCache.get(src);

    const p = new Promise((resolve, reject) => {
      const img = new Image();
      // Safe default for canvas use; same-origin still works.
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = async () => {
        try {
          // decode() helps avoid first-draw jank on large PNGs
          if (img.decode) await img.decode().catch(() => {});
        } finally {
          resolve(img);
        }
      };
      img.onerror = () => reject(new Error('Image load failed: ' + src));
      img.src = src;
    });

    _imagePromiseCache.set(src, p);
    p.catch(() => _imagePromiseCache.delete(src));
    return p;
  }

  async function fetchJsonText(url) {
    if (_jsonTextCache.has(url)) return _jsonTextCache.get(url);

    const p = (async () => {
      const resp = await fetch(url, { cache: 'force-cache' });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`Atlas JSON fetch failed (${resp.status}): ${url}`);
      }
      if (looksLikeHTML(text)) {
        throw new Error(`Atlas JSON looked like HTML (CORS/404 page?): ${url}`);
      }
      return text;
    })();

    _jsonTextCache.set(url, p);
    p.catch(() => _jsonTextCache.delete(url));
    return p;
  }


  async function loadTPAtlasMulti(jsonUrl, baseDirOpt=null) {
    // Cache by jsonUrl. If you need different baseDir for same json, pass a unique query string.
    if (_atlasPromiseCache.has(jsonUrl)) return _atlasPromiseCache.get(jsonUrl);

    const p = (async () => {
      const baseDir = baseDirOpt != null ? baseDirOpt : baseDirFromUrl(jsonUrl);

      const text = await fetchJsonText(jsonUrl);
      // fetchJsonText already checks resp.ok + looksLikeHTML, but keep explicit for safety
      if (looksLikeHTML(text)) throw new Error('Atlas JSON looked like HTML (bad path/CORS?): ' + jsonUrl);

      const parsed = parseTP(text);

      // Load all texture images in parallel (huge speedup on first boot)
      const textures = await Promise.all(parsed.textures.map(async (t) => {
        const imgUrl = joinUrl(baseDir, t.image);
        const img = await loadImage(imgUrl);
        return { img: img, image: img, imageUrl: imgUrl, meta: t, frames: t.frames };
      }));

      // Flatten frames into a Map for quick lookup
      const atlas = {
        url: jsonUrl,
        baseDir,
        textures,
        // Optional single-sheet convenience (some callers expect atlas.img)
        img: (textures[0] && textures[0].img) ? textures[0].img : null,
        frames: new Map(),
        framesByName: {},
        frameList: [],
        _rotCache: new Map()
      };

      for (let texIndex = 0; texIndex < textures.length; texIndex++) {
        const tex = textures[texIndex];
        const framesArr = Array.isArray(tex.frames) ? tex.frames : [];
        for (const f of framesArr) {
          const filename = (f && (f.filename || f.name)) ? (f.filename || f.name) : null;
          if (!filename) continue;
          const fr = normalizeFrameCommon(filename, f, texIndex);
          atlas.frames.set(fr.name, fr);
          atlas.framesByName[fr.name] = fr;
          atlas.frameList.push(fr.name);
        }
      }
return atlas;
    })();

    _atlasPromiseCache.set(jsonUrl, p);
    p.catch(() => _atlasPromiseCache.delete(jsonUrl));
    return p;
  }

  // Alias (single-sheet is still supported by loadTPAtlasMulti)
  async function loadTPAtlas(jsonUrl, baseDirOpt = null) {
    return loadTPAtlasMulti(jsonUrl, baseDirOpt);
  }

  function trailingNumber(name) {
    // Pick last run of digits before extension
    const m = String(name).match(/(\d+)(?:\.[^./\\]+)?$/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function listFramesByPrefix(atlas, prefix, opts = {}) {
    const { sort = true } = opts;
    if (!atlas || !atlas.frames) return [];
    const out = [];
    for (const k of atlas.frames.keys()) {
      if (typeof k === 'string' && k.startsWith(prefix)) out.push(k);
    }
    if (sort) {
      out.sort((a, b) => {
        const na = trailingNumber(a), nb = trailingNumber(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    }
    return out;
  }

  function applyPivotByPrefix(atlas, prefix, pivot) {
    if (!atlas || !atlas.frames) return 0;
    let n = 0;
    for (const [k, fr] of atlas.frames.entries()) {
      if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
      fr.pivot = { x: pivot.x, y: pivot.y };
      (atlas.framesByName || (atlas.framesByName = {}))[k] = fr;
      n++;
    }
    return n;
  }

  function getFrameBounds(atlas, frameName) {
    const fr = atlas && atlas.frames ? atlas.frames.get(frameName) : null;
    if (!fr) return null;
    const sw = fr.sourceSize.w || fr.frame.w;
    const sh = fr.sourceSize.h || fr.frame.h;
    const px = fr.pivot ? fr.pivot.x : 0.5;
    const py = fr.pivot ? fr.pivot.y : 0.5;
    return {
      sourceW: sw,
      sourceH: sh,
      pivotX: px,
      pivotY: py,
      trimX: fr.spriteSourceSize.x,
      trimY: fr.spriteSourceSize.y,
      trimW: fr.spriteSourceSize.w,
      trimH: fr.spriteSourceSize.h,
    };
  }

  function getRotatedCanvas(atlas, fr) {
    const key = `${fr.texIndex}:${fr.name}`;
    atlas._rotCache = atlas._rotCache || new Map();
    if (atlas._rotCache.has(key)) return atlas._rotCache.get(key);
    const tex = atlas.textures[fr.texIndex];
    const img = tex.img;
    const { x: sx, y: sy, w: sw, h: sh } = fr.frame;
    // If rotated, TP packed the sprite rotated 90deg clockwise. Undo by rotating -90.
    const c = document.createElement('canvas');
    c.width = sh;
    c.height = sw;
    const cctx = c.getContext('2d');
    cctx.save();
    cctx.translate(0, c.height);
    cctx.rotate(-Math.PI / 2);
    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    cctx.restore();
    atlas._rotCache.set(key, c);
    return c;
  }

  // Draw frame so that (x,y) is the pivot point in world space.
  function drawFrame(ctx, atlas, frameName, x, y, opts = {}) {
    if (!ctx || !atlas || !atlas.frames) return false;
    const fr = atlas.frames.get(frameName);
    if (!fr) return false;

    const scale = Number(opts.scale ?? 1);
    const alpha = Number(opts.alpha ?? 1);

    const tex = atlas.textures[fr.texIndex];
    const img = tex.img;

    // Original (untrimmed) size
    const origW = fr.sourceSize.w || (fr.rotated ? fr.frame.h : fr.frame.w);
    const origH = fr.sourceSize.h || (fr.rotated ? fr.frame.w : fr.frame.h);

    const pivot = opts.pivot || fr.pivot || { x: 0.5, y: 0.5 };
    const px = pivot.x ?? 0.5;
    const py = pivot.y ?? 0.5;

    const trimX = fr.spriteSourceSize.x || 0;
    const trimY = fr.spriteSourceSize.y || 0;

    // Dest top-left for the trimmed rectangle
    const dx = x - px * origW * scale + trimX * scale;
    const dy = y - py * origH * scale + trimY * scale;

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;

    if (!fr.rotated) {
      const { x: sx, y: sy, w: sw, h: sh } = fr.frame;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
    } else {
      // Use cached un-rotated trimmed canvas
      const c = getRotatedCanvas(atlas, fr);
      ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, c.width * scale, c.height * scale);
    }

    ctx.restore();
    return true;
  }

  // Export API
  PO.atlasTP.version = VERSION;
  PO.atlasTP.loadTPAtlasMulti = loadTPAtlasMulti;
  PO.atlasTP.loadTPAtlas = loadTPAtlas;
  PO.atlasTP.drawFrame = drawFrame;
  PO.atlasTP.getFrameBounds = getFrameBounds;
  PO.atlasTP.listFramesByPrefix = listFramesByPrefix;
  PO.atlasTP.applyPivotByPrefix = applyPivotByPrefix;

  // Back-compat aliases (older patches expect loadAtlasTP*)
  PO.atlasTP.loadAtlasTP = loadTPAtlas;
  PO.atlasTP.loadAtlasTPMulti = loadTPAtlasMulti;

  console.log(`[atlas_tp:v${VERSION}] ready`);
})();
