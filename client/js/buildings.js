// buildings.js patch: Barrack atlases + pivot/scale + team palette + sell/destroy FX (v23)
//
// Drop-in: overwrite client/js/buildings.js
// Compatible with atlas_tp.js v6+ (loadAtlasTP/listFramesByPrefix/drawFrame/applyPivotByPrefix)
//
// v23 fixes vs v22:
// - Correct distruct frame prefix: barrack_distruction_
// - Correct applyPivotByPrefix signature (pivot object)
// - Correct position math: use worldToScreen(tileX,tileY) directly (no iso->world reconversion)
// - Team palette tint: replaces magenta pixels with team color (cached)
// - Sell/Destroy FX: keeps playing via "ghost" even when entity vanishes instantly (UI click + removal detection fallback)

(function () {
  'use strict';

  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};

  const KEY = 'barrack';
  const VER = 'v23';

  const DEFAULT_PIVOT = { x: 0.4955, y: 0.4370 };
  const DEFAULT_SCALE = 0.14;
  const FPS_CONSTRUCT = 12;
  const FPS_DISTRUCT = 12;

  const LOG_ONCE = new Set();
  function logOnce(k, ...args) {
    if (LOG_ONCE.has(k)) return;
    LOG_ONCE.add(k);
    console.log(...args);
  }
  function warnOnce(k, ...args) {
    if (LOG_ONCE.has(k)) return;
    LOG_ONCE.add(k);
    console.warn(...args);
  }

  function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function readPivot() {
    try {
      const x = safeNum(localStorage.getItem('po_barrack_pivot_x')) ?? safeNum(localStorage.getItem('barrack_pivot_x'));
      const y = safeNum(localStorage.getItem('po_barrack_pivot_y')) ?? safeNum(localStorage.getItem('barrack_pivot_y'));
      if (x !== null && y !== null) return { x, y };
    } catch (_) {}
    return { ...DEFAULT_PIVOT };
  }

  function readScale() {
    try {
      const s = safeNum(localStorage.getItem('po_barrack_scale')) ?? safeNum(localStorage.getItem('barrack_scale'));
      if (s !== null && s > 0) return s;
    } catch (_) {}
    return DEFAULT_SCALE;
  }

  function nowSec(state) {
    const t = state && (state.t ?? state.time ?? state.now ?? state.nowSec ?? null);
    if (typeof t === 'number' && isFinite(t)) return t;
    return performance.now() / 1000;
  }

  function stamp60(state) {
    return Math.floor(nowSec(state) * 60);
  }

  function isBarrack(ent) {
    if (!ent) return false;
    const k = (ent.kind ?? ent.type ?? ent.name ?? '').toString().toLowerCase();
    return k === 'barrack' || k === 'barracks' || k === 'rax' || ent._isBarrack === true;
  }

  function entTile(ent) {
    const tx = ent.tx ?? ent.tileX ?? ent.x ?? 0;
    const ty = ent.ty ?? ent.tileY ?? ent.y ?? 0;
    return { x: tx, y: ty };
  }

  function worldToScreen(tile, helpers) {
    try {
      if (helpers && typeof helpers.worldToScreen === 'function') {
        const p = helpers.worldToScreen(tile.x, tile.y);
        if (p && isFinite(p.x) && isFinite(p.y)) return { x: p.x, y: p.y };
      }
      if (typeof window.worldToScreen === 'function') {
        const p = window.worldToScreen(tile.x, tile.y);
        if (p && isFinite(p.x) && isFinite(p.y)) return { x: p.x, y: p.y };
      }
    } catch (_) {}

    // fallback (rough)
    const tileW = (PO.cfg && PO.cfg.tileW) || 64;
    const tileH = (PO.cfg && PO.cfg.tileH) || 32;
    return { x: (tile.x - tile.y) * (tileW / 2), y: (tile.x + tile.y) * (tileH / 2) };
  }

  function isOnscreen(p, ctx) {
    if (!ctx || !ctx.canvas) return true;
    const w = ctx.canvas.width || 0;
    const h = ctx.canvas.height || 0;
    const m = 350;
    return p.x >= -m && p.x <= w + m && p.y >= -m && p.y <= h + m;
  }

  // ---------------- team color helpers ----------------
  function clamp255(n) {
    n = n | 0;
    return n < 0 ? 0 : n > 255 ? 255 : n;
  }
  function hex2(n) {
    const s = clamp255(n).toString(16);
    return s.length === 1 ? '0' + s : s;
  }

  function normalizeColorToHex(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim();
    if (!s) return null;

    if (s[0] === '#') {
      if (s.length === 4) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
      if (s.length === 7) return s.toLowerCase();
      if (s.length === 9) return s.slice(0, 7).toLowerCase();
      return null;
    }

    const m = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
      return ('#' + hex2(r) + hex2(g) + hex2(b)).toLowerCase();
    }

    return null;
  }

  function getTeamColorsArray() {
    return (
      PO.teamColors ||
      (PO.cfg && (PO.cfg.teamColors || PO.cfg.factionColors)) ||
      (PO.palettes && PO.palettes.teamColors) ||
      window.teamColors ||
      null
    );
  }

  function getTeamIndex(ent) {
    const t = ent.team ?? ent.teamId ?? ent.ownerTeam ?? ent.factionId ?? ent.playerId ?? null;
    if (typeof t === 'number' && isFinite(t)) return t | 0;
    if (typeof t === 'string') {
      const s = t.toLowerCase();
      if (s === 'player' || s === 'ally' || s === 'blue') return 0;
      if (s === 'enemy' || s === 'red') return 1;
    }
    if (ent.isEnemy === true) return 1;
    return 0;
  }

  function getTeamColor(ent) {
    if (!ent) return null;

    const direct =
      ent.teamColor ||
      ent.factionColor ||
      ent.color ||
      ent.tint ||
      (ent.owner && (ent.owner.teamColor || ent.owner.color || ent.owner.factionColor)) ||
      null;

    const d = normalizeColorToHex(direct);
    if (d) return d;

    // localStorage common keys (try to follow your earlier note)
    try {
      const lsKeys = ['po_team_color', 'po_faction_color', 'po_player_color', 'team_color', 'faction_color', 'player_color'];
      for (const k of lsKeys) {
        const v = normalizeColorToHex(localStorage.getItem(k) || '');
        if (v) return v;
      }
    } catch (_) {}

    const arr = getTeamColorsArray();
    if (arr && typeof arr === 'object') {
      const idx = getTeamIndex(ent);
      const v = normalizeColorToHex(arr[idx] || arr[String(idx)] || '');
      if (v) return v;
    }

    // fallback
    const idx = getTeamIndex(ent);
    return idx === 1 ? '#ff3b3b' : '#3da9ff';
  }

  // ---------------- tint cache (magenta -> teamColor) ----------------
  function getTrimmedCanvas(atlas, fr) {
    atlas.__poTrimCache = atlas.__poTrimCache || new Map();
    const key = fr.name + '|' + fr.texIndex;
    if (atlas.__poTrimCache.has(key)) return atlas.__poTrimCache.get(key);

    const tex = atlas.textures && atlas.textures[fr.texIndex];
    const img = tex && tex.img;
    if (!img) return null;

    const sx = fr.frame.x,
      sy = fr.frame.y,
      sw = fr.frame.w,
      sh = fr.frame.h;

    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    if (!fr.rotated) {
      c.width = sw;
      c.height = sh;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      // match atlas_tp getRotatedCanvas: width=sh, height=sw
      c.width = sh;
      c.height = sw;
      ctx.save();
      ctx.translate(0, c.height);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    }

    atlas.__poTrimCache.set(key, c);
    return c;
  }

  function tintMagentaTo(canvas, teamHex) {
    // returns a new canvas
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);

    let data;
    try {
      data = octx.getImageData(0, 0, out.width, out.height);
    } catch (e) {
      // security/cors
      return null;
    }

    const rT = parseInt(teamHex.slice(1, 3), 16);
    const gT = parseInt(teamHex.slice(3, 5), 16);
    const bT = parseInt(teamHex.slice(5, 7), 16);

    const d = data.data;

    // tolerance: magenta-ish pixels
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      // classic #ff00ff with tolerance
      if (r > 200 && g < 70 && b > 200) {
        d[i] = rT;
        d[i + 1] = gT;
        d[i + 2] = bT;
      }
    }

    octx.putImageData(data, 0, 0);
    return out;
  }

  function getTintedCanvas(atlas, fr, teamHex) {
    atlas.__poTintCache = atlas.__poTintCache || new Map();
    const key = fr.name + '|' + fr.texIndex + '|' + teamHex;
    if (atlas.__poTintCache.has(key)) return atlas.__poTintCache.get(key);

    const base = getTrimmedCanvas(atlas, fr);
    if (!base) return null;

    const tinted = tintMagentaTo(base, teamHex);
    if (!tinted) {
      warnOnce('tint_cors', `[${KEY}:${VER}] tint failed (canvas tainted?). Barrack will render without palette tint.`);
      atlas.__poTintCache.set(key, base);
      return base;
    }

    atlas.__poTintCache.set(key, tinted);
    return tinted;
  }

  function drawFrameBarrack(ctx, atlas, frameName, x, y, opts) {
    const fr = atlas && atlas.frames && atlas.frames.get ? atlas.frames.get(frameName) : null;
    if (!fr) return false;

    const scale = Number(opts.scale ?? 1);
    const alpha = Number(opts.alpha ?? 1);
    const teamHex = normalizeColorToHex(opts.teamColor || '');

    const pivot = opts.pivot || fr.pivot || { x: 0.5, y: 0.5 };
    const px = pivot.x ?? 0.5;
    const py = pivot.y ?? 0.5;

    const origW = (fr.sourceSize && fr.sourceSize.w) || (fr.rotated ? fr.frame.h : fr.frame.w);
    const origH = (fr.sourceSize && fr.sourceSize.h) || (fr.rotated ? fr.frame.w : fr.frame.h);
    const trimX = (fr.spriteSourceSize && fr.spriteSourceSize.x) || 0;
    const trimY = (fr.spriteSourceSize && fr.spriteSourceSize.y) || 0;

    const dx = x - px * origW * scale + trimX * scale;
    const dy = y - py * origH * scale + trimY * scale;

    const img = teamHex ? getTintedCanvas(atlas, fr, teamHex) : getTrimmedCanvas(atlas, fr);
    if (!img) return false;

    ctx.save();
    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = oldAlpha * alpha;
    ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, img.width * scale, img.height * scale);
    ctx.globalAlpha = oldAlpha;
    ctx.restore();
    return true;
  }

  // ---------------- barrack atlases ----------------
  const S = {
    urls: null,
    atlases: { normal: null, construct: null, distruct: null },
    frames: { normal: [], construct: [], distruct: [] },
    loading: { normal: false, construct: false, distruct: false },
    ready: { normal: false, construct: false, distruct: false },

    ghosts: [],
    tracked: new Map(), // id -> snapshot
    lastGcStamp: 0,

    installed: false,
    kicked: false,
  };

  function setPaths() {
    // Use absolute root (Cloudflare Pages serves /client as site root). Your assets are under /asset/...
    const ROOT = '/asset/sprite/const';
    S.urls = {
      normal: `${ROOT}/normal/barrack/barrack_idle.json`,
      construct: `${ROOT}/const_anim/barrack/barrack_const.json`,
      distruct: `${ROOT}/distruct/barrack/barrack_distruct.json`,
    };
  }

  function hasAtlasTP() {
    return !!(PO.atlasTP && typeof PO.atlasTP.loadAtlasTP === 'function' && typeof PO.atlasTP.listFramesByPrefix === 'function');
  }

  async function ensureAtlas(kind) {
    if (S.ready[kind]) return true;
    if (!hasAtlasTP()) return false;
    if (S.loading[kind]) return false;

    const url = S.urls && S.urls[kind];
    if (!url) return false;

    S.loading[kind] = true;
    try {
      const atlas = await PO.atlasTP.loadAtlasTP(url);
      if (!atlas) return false;

      S.atlases[kind] = atlas;

      let prefix;
      if (kind === 'normal') prefix = 'barrack_idle';
      else if (kind === 'construct') prefix = 'barrack_con_complete_';
      else prefix = 'barrack_distruction_';

      S.frames[kind] = PO.atlasTP.listFramesByPrefix(atlas, prefix, { sort: true });

      // Apply pivot override to all barrack* frames (correct signature: pivot object)
      const piv = readPivot();
      try {
        PO.atlasTP.applyPivotByPrefix(atlas, 'barrack_', { x: piv.x, y: piv.y });
      } catch (e) {
        // not fatal
      }

      S.ready[kind] = true;
      logOnce(`atlas_${kind}`, `[${KEY}:${VER}] atlas '${kind}' loaded`, url);
      return true;
    } catch (e) {
      warnOnce(`atlas_${kind}_err`, `[${KEY}:${VER}] atlas '${kind}' failed`, url, e);
      return false;
    } finally {
      S.loading[kind] = false;
    }
  }

  function kickLoad() {
    if (S.kicked) return;
    S.kicked = true;

    if (!S.urls) setPaths();

    // fire-and-forget
    ensureAtlas('normal');
    ensureAtlas('construct');
    ensureAtlas('distruct');

    logOnce('kick', `[${KEY}:${VER}] patch loaded. loading barrack atlases...`);
  }

  function allReady() {
    return S.ready.normal && S.ready.construct && S.ready.distruct;
  }

  // ---------------- animation selection ----------------
  function getHp(ent) {
    const v = ent.hp ?? ent.health ?? ent.HP ?? null;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function getBuildProgress(ent) {
    const v = ent.buildProgress ?? ent.progress ?? ent.bp ?? null;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function kindFor(ent) {
    if (!ent) return 'normal';

    if (ent._selling || ent.selling || ent.isSelling || (typeof ent.sellProgress === 'number')) return 'sell';

    const hp = getHp(ent);
    if ((hp !== null && hp <= 0) || ent._destroyed || ent.destroyed || ent.dead) return 'distruct';

    const bp = getBuildProgress(ent);
    if (ent._constructing || ent.constructing || (bp !== null && bp < 1)) return 'construct';

    return 'normal';
  }

  function frameAt(kind, frames, t, entOrGhost) {
    if (!frames || !frames.length) return null;

    if (kind === 'normal') {
      // loop idle (but your normal atlas has a stable static frame too)
      const fps = 8;
      const idx = Math.floor(t * fps) % frames.length;
      return frames[idx];
    }

    const fps = kind === 'distruct' ? FPS_DISTRUCT : FPS_CONSTRUCT;
    const key = kind === 'distruct' ? '__po_distructAt' : kind === 'sell' ? '__po_sellAt' : '__po_constructAt';
    if (entOrGhost[key] == null) entOrGhost[key] = t;
    const dt = Math.max(0, t - entOrGhost[key]);
    let idx = Math.floor(dt * fps);
    if (idx >= frames.length) idx = frames.length - 1;
    if (kind === 'sell') idx = (frames.length - 1) - idx;
    return frames[Math.max(0, Math.min(frames.length - 1, idx))];
  }

  // ---------------- ghosts (sell/destroy) ----------------
  function spawnGhost(snap, kind, t0) {
    const g = {
      kind,
      tx: snap.tx,
      ty: snap.ty,
      teamColor: snap.teamColor,
      hp: snap.hp,
      __po_start: t0 ?? null,
    };
    S.ghosts.push(g);
  }

  function gcTracked(state) {
    const s = stamp60(state);
    if (s === S.lastGcStamp) return;
    S.lastGcStamp = s;

    // if entity vanished (not seen for a few frames) and it was onscreen, spawn ghost
    const TH = 6; // frames
    for (const [id, snap] of S.tracked.entries()) {
      if (s - snap.lastSeen < TH) continue;
      if (!snap.lastOnscreen) {
        S.tracked.delete(id);
        continue;
      }

      const k = snap.hp !== null && snap.hp <= 0 ? 'distruct' : 'sell';
      spawnGhost(snap, k, snap.lastSeenTime);
      S.tracked.delete(id);
    }
  }

  function drawGhosts(ctx, helpers, state) {
    if (!S.ghosts.length) return;

    const t = nowSec(state);

    const framesConstruct = S.frames.construct;
    const framesDistruct = S.frames.distruct;

    const scale = readScale();
    const pivot = readPivot();

    const keep = [];
    for (const g of S.ghosts) {
      // sync one-shot start time
      if (g.__po_start != null && g.__po_sellAt == null && g.__po_distructAt == null) {
        const key = g.kind === 'sell' ? '__po_sellAt' : '__po_distructAt';
        g[key] = g.__po_start;
        g.__po_start = null;
      }

      const tile = { x: g.tx, y: g.ty };
      const p = worldToScreen(tile, helpers);

      const frames = g.kind === 'distruct' ? framesDistruct : framesConstruct;
      const atlas = g.kind === 'distruct' ? S.atlases.distruct : S.atlases.construct;

      const frame = frameAt(g.kind, frames, t, g);
      if (frame) {
        drawFrameBarrack(ctx, atlas, frame, p.x, p.y, { scale, alpha: 1, pivot, teamColor: g.teamColor });
      }

      const key = g.kind === 'distruct' ? '__po_distructAt' : '__po_sellAt';
      const start = g[key] ?? t;
      const fps = g.kind === 'distruct' ? FPS_DISTRUCT : FPS_CONSTRUCT;
      const dt = Math.max(0, t - start);
      const idx = Math.floor(dt * fps);
      if (idx < frames.length - 1) keep.push(g);
    }

    S.ghosts = keep;
  }

  // ---------------- main barrack draw ----------------
  function drawBarrack(ent, ctx, helpers, state) {
    if (!allReady()) return false;

    const kind = kindFor(ent);
    const t = nowSec(state);

    const scale = readScale();
    const pivot = readPivot();
    const teamColor = getTeamColor(ent);

    const tile = entTile(ent);
    const p = worldToScreen(tile, helpers);

    const atlas = kind === 'construct' || kind === 'sell' ? S.atlases.construct : kind === 'distruct' ? S.atlases.distruct : S.atlases.normal;
    const frames = kind === 'construct' || kind === 'sell' ? S.frames.construct : kind === 'distruct' ? S.frames.distruct : S.frames.normal;

    const frame = frameAt(kind, frames, t, ent);
    if (!frame) return false;

    return drawFrameBarrack(ctx, atlas, frame, p.x, p.y, { scale, alpha: 1, pivot, teamColor });
  }

  // ---------------- track removal fallback ----------------
  function trackBarrack(ent, ctx, helpers, state) {
    const s = stamp60(state);
    const id = (ent.id ?? ent.uid ?? ent._id ?? ent.guid ?? null);
    const tile = entTile(ent);
    const p = worldToScreen(tile, helpers);

    const snapId = id != null ? String(id) : `${tile.x},${tile.y}`;
    const hp = getHp(ent);

    S.tracked.set(snapId, {
      id: snapId,
      tx: tile.x,
      ty: tile.y,
      hp,
      teamColor: getTeamColor(ent),
      lastSeen: s,
      lastSeenTime: nowSec(state),
      lastOnscreen: isOnscreen(p, ctx),
    });
  }

  // ---------------- install patch ----------------
  function tryInstall() {
    if (S.installed) return true;
    if (!PO.buildings || typeof PO.buildings.drawBuilding !== 'function') return false;

    const orig = PO.buildings.drawBuilding;

    PO.buildings.drawBuilding = function patchedDrawBuilding(...args) {
      // locate ctx + ent + helpers/state
      let ctx = null,
        ent = null,
        helpers = null,
        state = null;
      for (const a of args) {
        if (!ctx && a && typeof a.drawImage === 'function') ctx = a;
        else if (!ent && a && typeof a === 'object' && (a.kind || a.type || a.name || a.hp != null || a.buildProgress != null)) ent = a;
        else if (!helpers && a && typeof a === 'object' && typeof a.worldToScreen === 'function') helpers = a;
        else if (!state && a && typeof a === 'object' && (typeof a.t === 'number' || typeof a.time === 'number' || typeof a.now === 'number')) state = a;
      }

      // always keep atlases loading
      if (!S.kicked) kickLoad();

      // run GC once per frame
      gcTracked(state);

      // draw ghost FX (but only when atlases ready)
      if (allReady() && ctx) drawGhosts(ctx, helpers, state);

      // barrack override
      if (ent && isBarrack(ent)) {
        // track for removal-based fallback
        if (ctx) trackBarrack(ent, ctx, helpers, state);

        if (allReady() && ctx) {
          // draw our barrack
          const ok = drawBarrack(ent, ctx, helpers, state);
          if (ok) return true;
        }
        // suppress default fallback box while loading
        return true;
      }

      return orig.apply(this, args);
    };

    S.installed = true;
    const piv = readPivot();
    const sc = readScale();
    logOnce('installed', `[${KEY}:${VER}] installed. pivot=`, piv, `scale=${sc}`);
    return true;
  }

  // ---------------- sell button hook ----------------
  function installSellHook() {
    // DOM fallback for "매각" button
    try {
      document.addEventListener(
        'click',
        (ev) => {
          const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
          if (!btn) return;
          const txt = (btn.textContent || '').trim();
          if (txt !== '매각') return;

          const ent =
            PO.selected ||
            PO.sel ||
            (PO.ui && (PO.ui.selected || PO.ui.sel || PO.ui.currentSelected)) ||
            (PO.game && (PO.game.selected || PO.game.sel)) ||
            null;

          if (ent && isBarrack(ent)) {
            const tile = entTile(ent);
            spawnGhost({ tx: tile.x, ty: tile.y, hp: getHp(ent), teamColor: getTeamColor(ent) }, 'sell', nowSec(null));
          }
        },
        true
      );
    } catch (_) {}
  }

  // ---------------- boot ----------------
  setPaths();
  installSellHook();

  (function bootRetry() {
    if (tryInstall()) return;
    setTimeout(bootRetry, 200);
  })();
})();
