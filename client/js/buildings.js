// buildings.js patch: Barrack fix v24
// 목표:
// 1) 위치/피벗이 엉뚱한 곳으로 튀는 문제: drawBuilding 인자에서 "화면좌표 힌트"를 우선 사용 + 후보좌표 자동 선택
// 2) 진영 팔레트(마젠타 -> 팀색) 적용
// 3) 매각/파괴 애니메이션: 오브젝트가 즉시 삭제돼도 "고스트"로 끝까지 출력
// 4) 캐시/로드 순서 헷갈림 방지: 로드되면 무조건 콘솔에 로그 찍음
(() => {
  const PO = (window.PO = window.PO || {});
  const KEY = 'barrack';
  const VER = 'v24';

  // 파일이 "로드 됐는지"부터 확실하게 보이게
  console.log(`[${KEY}:${VER}] script loaded`);

  const S = {
    installed: false,
    kicked: false,
    installPath: null,

    // atlases
    atlases: { normal: null, construct: null, distruct: null },
    atlasP: { normal: null, construct: null, distruct: null },

    // URL candidates (여러 배포환경에서 경로가 달라지는 걸 흡수)
    urlCands: { normal: [], construct: [], distruct: [] },

    // best prefix for each atlas kind
    prefix: { normal: null, construct: null, distruct: null },

    // caches
    tintCache: new Map(), // key: frameName|teamHex
    lastSeen: new Map(),  // key: snapId -> snap

    // ghosts
    ghosts: [],
  };

  // ---------------- utils ----------------
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
  const nowSec = (state) => {
    const t = state && (state.t ?? state.time ?? state.now);
    if (typeof t === 'number' && isFinite(t)) return t;
    return performance.now() / 1000;
  };
  const stamp60 = (state) => Math.floor(nowSec(state) * 60);

  function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function safeText(x) {
    try { return String(x); } catch (_) { return ''; }
  }

  function isOnScreen(ctx, x, y, pad = 256) {
    if (!ctx || !ctx.canvas) return false;
    const w = ctx.canvas.width || 0;
    const h = ctx.canvas.height || 0;
    return x >= -pad && y >= -pad && x <= w + pad && y <= h + pad;
  }

  function normalizeHex(c) {
    if (!c) return null;
    const s = safeText(c).trim();
    if (!s) return null;
    // #rgb or #rrggbb
    let m = s.match(/^#([0-9a-fA-F]{3})$/);
    if (m) {
      const r = m[1][0], g = m[1][1], b = m[1][2];
      return ('#' + r + r + g + g + b + b).toLowerCase();
    }
    m = s.match(/^#([0-9a-fA-F]{6})$/);
    if (m) return ('#' + m[1]).toLowerCase();

    // rgb(a)
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(',').map(x => Number(x.trim()));
      if (parts.length >= 3 && parts.every(n => isFinite(n))) {
        const r = Math.max(0, Math.min(255, parts[0] | 0));
        const g = Math.max(0, Math.min(255, parts[1] | 0));
        const b = Math.max(0, Math.min(255, parts[2] | 0));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }
    }
    return null;
  }

  function hexToRgb(hex) {
    const h = normalizeHex(hex);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    };
  }

  // ---------------- config (pivot / scale) ----------------
  function readScale() {
    const d = 0.14;
    try {
      const v = Number(localStorage.getItem('po_barrack_scale'));
      if (isFinite(v) && v > 0.001 && v < 10) return v;
    } catch (_) {}
    return d;
  }

  function readPivot() {
    const def = { x: 0.4955, y: 0.4370 };
    let x = def.x, y = def.y;
    try {
      const px = Number(localStorage.getItem('po_barrack_pivot_x'));
      const py = Number(localStorage.getItem('po_barrack_pivot_y'));
      if (isFinite(px)) x = clamp01(px);
      if (isFinite(py)) y = clamp01(py);
    } catch (_) {}
    return { x, y };
  }

  // ---------------- asset path candidates ----------------
  function makeUrl(rel) {
    // document.baseURI 기준으로 상대경로를 절대 URL로 변환
    return new URL(rel, document.baseURI).toString();
  }

  function setPaths() {
    // 배포환경에 따라 루트가 다를 수 있어서 후보 여러개를 둠
    const roots = [
      'asset/sprite/const',
      'client/asset/sprite/const',
    ];

    // 파일명 후보도 여러개를 둠 (네 폴더/파일이 오타 섞여있을 수 있음)
    const normalJson = [
      'normal/barrack/barrack_idle.json',
    ];

    const constructJson = [
      'const_anim/barrack/barrack_const.json',
      'const_anim/barrack/barrack_con_complete.json',
    ];

    const distructJson = [
      'distruct/barrack/barrack_distruct.json',
      'destruct/barrack/barrack_distruct.json',
      'destruct/barrack/barrack_destruct.json',
      'distruction/barrack/barrack_distruction.json',
      'destruction/barrack/barrack_destruction.json',
    ];

    const build = (root, rel) => makeUrl(root + '/' + rel);

    S.urlCands.normal = roots.flatMap(r => normalJson.map(j => build(r, j)));
    S.urlCands.construct = roots.flatMap(r => constructJson.map(j => build(r, j)));
    S.urlCands.distruct = roots.flatMap(r => distructJson.map(j => build(r, j)));
  }

  setPaths();

  // ---------------- atlas helpers ----------------
  function getAtlasLoader() {
    const A = PO.atlasTP;
    if (!A) return null;
    return A.loadTPAtlasMulti || A.loadTPAtlas || A.loadAtlasTPMulti || A.loadAtlasTP || null;
  }

  function listFrames(atlas, prefix) {
    const A = PO.atlasTP;
    if (!A || typeof A.listFramesByPrefix !== 'function') return [];
    return A.listFramesByPrefix(atlas, prefix, { sort: true });
  }

  function applyPivot(atlas) {
    const A = PO.atlasTP;
    if (!A || typeof A.applyPivotByPrefix !== 'function') return 0;
    const piv = readPivot();
    // barrack_ 로 시작하는 모든 프레임에 pivot 강제
    return A.applyPivotByPrefix(atlas, 'barrack_', piv);
  }

  function pickBestPrefix(atlas, kind) {
    const cands =
      kind === 'normal'
        ? ['barrack_idle', 'barrack_idle_']
        : kind === 'construct'
          ? ['barrack_con_complete_', 'barrack_const_', 'barrack_construct_', 'barrack_build_']
          : ['barrack_distruction_', 'barrack_destruction_', 'barrack_distruct_', 'barrack_destruct_', 'barrack_destroy_'];

    let best = null;
    let bestN = 0;
    for (const p of cands) {
      const n = listFrames(atlas, p).length;
      if (n > bestN) { bestN = n; best = p; }
    }
    return best;
  }

  async function ensureAtlas(kind) {
    if (S.atlases[kind]) return S.atlases[kind];
    if (S.atlasP[kind]) return S.atlasP[kind];

    const loader = getAtlasLoader();
    if (!loader) throw new Error('atlas_tp loader not ready');

    const p = (async () => {
      const cands = S.urlCands[kind] || [];
      let lastErr = null;

      for (const url of cands) {
        try {
          const atlas = await loader(url);
          // pivot apply
          applyPivot(atlas);

          const pref = pickBestPrefix(atlas, kind);
          S.prefix[kind] = pref;

          const size = atlas && atlas.frames ? atlas.frames.size : 0;
          console.log(`[${KEY}:${VER}] ${kind} atlas loaded`, { url, frames: size, prefix: pref });

          S.atlases[kind] = atlas;
          return atlas;
        } catch (e) {
          lastErr = e;
          console.warn(`[${KEY}:${VER}] ${kind} atlas load failed`, url, (e && e.message) ? e.message : e);
        }
      }
      throw lastErr || new Error(`${kind} atlas load failed`);
    })();

    S.atlasP[kind] = p;
    try {
      return await p;
    } finally {
      // keep S.atlasP so concurrent calls share same promise
    }
  }

  function kickLoad() {
    if (S.kicked) return;
    S.kicked = true;
    // 비동기로 로드 시작
    ensureAtlas('normal').catch(() => {});
    ensureAtlas('construct').catch(() => {});
    ensureAtlas('distruct').catch(() => {});
  }

  // ---------------- entity detection ----------------
  function isBarrack(ent) {
    if (!ent || typeof ent !== 'object') return false;
    const n = safeText(ent.kind || ent.type || ent.name || '').toLowerCase();
    if (n.includes('barrack')) return true;
    // id/blueprint name
    const id = safeText(ent.id || ent.blueprint || ent.proto || '').toLowerCase();
    return id.includes('barrack');
  }

  function getTeamIndex(ent) {
    const v =
      ent.team ??
      ent.faction ??
      ent.side ??
      ent.ownerId ??
      (ent.owner && (ent.owner.team ?? ent.owner.faction ?? ent.owner.side)) ??
      0;
    const n = Number(v);
    if (isFinite(n)) return n | 0;
    const s = safeText(v).toLowerCase();
    if (s.includes('enemy') || s.includes('red')) return 1;
    if (s.includes('player') || s.includes('blue')) return 0;
    return 0;
  }

  function getColorFromUI(teamIdx) {
    // index.html에 pColor/eColor input이 있으니 그걸 우선 신뢰
    const p = document.getElementById('pColor');
    const e = document.getElementById('eColor');
    const pHex = normalizeHex(p && p.value);
    const eHex = normalizeHex(e && e.value);

    const link = !!window.LINK_ENEMY_TO_PLAYER_COLOR;
    if (teamIdx === 1 && link && pHex) return pHex;

    if (teamIdx === 0 && pHex) return pHex;
    if (teamIdx === 1 && eHex) return eHex;
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

  function getTeamColor(ent) {
    if (!ent) return null;

    // 0) UI 컬러 픽커 우선
    const idx = getTeamIndex(ent);
    const ui = getColorFromUI(idx);
    if (ui) return ui;

    // 1) 엔티티에 직접 컬러가 박혀있으면 그거 사용
    const direct =
      ent.teamColor ||
      ent.factionColor ||
      ent.color ||
      ent.tint ||
      (ent.owner && (ent.owner.teamColor || ent.owner.color || ent.owner.factionColor)) ||
      null;

    const d = normalizeHex(direct);
    if (d) return d;

    // 2) localStorage common keys
    try {
      const lsKeys = ['po_team_color', 'po_faction_color', 'po_player_color', 'team_color', 'faction_color', 'player_color'];
      for (const k of lsKeys) {
        const v = normalizeHex(localStorage.getItem(k) || '');
        if (v) return v;
      }
    } catch (_) {}

    // 3) 배열 기반 팔레트
    const arr = getTeamColorsArray();
    if (arr && typeof arr === 'object') {
      const v = normalizeHex(arr[idx] || arr[String(idx)] || '');
      if (v) return v;
    }

    // 4) 마지막 fallback
    return idx === 1 ? '#ff3b3b' : '#3da9ff';
  }

  // ---------------- frame selection ----------------
  function kindFor(ent, state) {
    // 상태 문자열도 최대한 흡수
    const st = safeText(ent.state || ent.status || ent.animState || ent.mode || '').toLowerCase();

    const hp = ent.hp ?? ent.health ?? ent.HP;
    const hpNum = Number(hp);

    // sell flags (다양한 이름 흡수)
    if (ent.selling || ent.isSelling || ent.sellProgress != null || ent.sellAt != null || st.includes('sell') || st.includes('sold')) {
      return 'sell';
    }

    // destroyed flags
    if (ent.dead || ent.destroyed || ent.isDestroyed || st.includes('destroy') || st.includes('destruct') || st.includes('distruct') || st.includes('death')) {
      return 'distruct';
    }
    if (isFinite(hpNum) && hpNum <= 0) return 'distruct';

    // building flags
    const bp = ent.buildProgress ?? ent.progress ?? ent.buildPct ?? null;
    const bpn = Number(bp);
    if (isFinite(bpn) && bpn < 1) return 'construct';
    if (st.includes('build') || st.includes('construct')) return 'construct';

    return 'normal';
  }

  function getFramesFor(kind) {
    const atlas = S.atlases[kind];
    const pref = S.prefix[kind];
    if (!atlas || !pref) return [];
    const key = kind + '|' + pref + '|' + (atlas.jsonUrl || '');
    if (S._framesCache && S._framesCache[key]) return S._framesCache[key];
    S._framesCache = S._framesCache || Object.create(null);
    const arr = listFrames(atlas, pref);
    S._framesCache[key] = arr;
    return arr;
  }

  function frameAt(kind, t, reverse = false) {
    const frames = getFramesFor(kind);
    if (!frames || frames.length === 0) return null;

    // 8 fps 정도로 느긋하게
    const fps = 8;
    const idx = Math.floor(t * fps);
    let i = idx % frames.length;
    if (reverse) i = (frames.length - 1 - i);
    return frames[i];
  }

  // ---------------- tinting (magenta -> teamColor) ----------------
  function isMagenta(r, g, b) {
    // 강한 마젠타만 치환. 가장자리 안티앨리어싱도 잡히게 약간 넓게.
    // 기준: R,B 높고 G 낮음
    return r >= 210 && b >= 210 && g <= 90;
  }

  function getTintedCanvas(atlas, frameName, teamHex) {
    if (!atlas || !frameName || !teamHex) return null;
    const fr = atlas.frames && atlas.frames.get(frameName);
    if (!fr) return null;

    const key = frameName + '|' + teamHex;
    if (S.tintCache.has(key)) return S.tintCache.get(key);

    const tex = atlas.textures && atlas.textures[fr.texIndex];
    const img = tex && tex.img;
    if (!img) return null;

    const sw = fr.frame.w, sh = fr.frame.h;
    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const cctx = c.getContext('2d');
    try {
      // rotated는 여기서는 생략. rotated가 나오면 원본 drawFrame로 fallback됨.
      cctx.drawImage(img, fr.frame.x, fr.frame.y, sw, sh, 0, 0, sw, sh);

      const td = hexToRgb(teamHex);
      if (!td) { S.tintCache.set(key, c); return c; }

      const imgData = cctx.getImageData(0, 0, sw, sh);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a === 0) continue;
        if (isMagenta(r, g, b)) {
          d[i] = td.r;
          d[i + 1] = td.g;
          d[i + 2] = td.b;
        }
      }
      cctx.putImageData(imgData, 0, 0);
      S.tintCache.set(key, c);
      return c;
    } catch (e) {
      // 캔버스가 tainted면 tint 못 함. 그럴 땐 null 리턴해서 원본 drawFrame 사용
      console.warn(`[${KEY}:${VER}] tint failed (tainted canvas?)`, e && e.message ? e.message : e);
      S.tintCache.set(key, null);
      return null;
    }
  }

  // ---------------- position: best guess ----------------
  function extractScreenHint(ctx, nums) {
    // nums 후보가 많을 수 있음. 앞 2개, 뒤 2개 둘 다 테스트해서 화면 안에 들어오는 쪽 우선.
    if (!nums || nums.length < 2) return null;

    const candPairs = [];
    candPairs.push([nums[0], nums[1]]);
    if (nums.length >= 4) candPairs.push([nums[nums.length - 2], nums[nums.length - 1]]);

    let best = null;
    let bestScore = 1e18;
    for (const [x, y] of candPairs) {
      if (!isFiniteNum(x) || !isFiniteNum(y)) continue;
      // 화면 내면 최우선
      const ons = isOnScreen(ctx, x, y, 512);
      const score = (ons ? 0 : 1e9) + Math.abs(x) + Math.abs(y);
      if (score < bestScore) { bestScore = score; best = { x, y, from: 'args' }; }
    }
    return best;
  }

  function extractTileCandidates(ent) {
    const out = [];
    const push = (x, y, tag) => {
      if (isFiniteNum(x) && isFiniteNum(y)) out.push({ x, y, tag });
    };

    push(ent.tx, ent.ty, 'tx');
    push(ent.tileX, ent.tileY, 'tileX');
    push(ent.gridX, ent.gridY, 'gridX');
    if (ent.tile && typeof ent.tile === 'object') push(ent.tile.x, ent.tile.y, 'tileObj');
    if (ent.pos && typeof ent.pos === 'object') push(ent.pos.x, ent.pos.y, 'pos');
    // 마지막으로 x,y는 가장 위험 (tile일 수도 있고 worldPx일 수도 있음)
    push(ent.x, ent.y, 'xy');

    return out;
  }

  function worldToScreen(helpers, x, y) {
    try {
      const p = helpers.worldToScreen(x, y);
      if (p && isFiniteNum(p.x) && isFiniteNum(p.y)) return { x: p.x, y: p.y };
      // 일부 구현은 [x,y]로 반환할 수도 있음
      if (Array.isArray(p) && p.length >= 2 && isFiniteNum(p[0]) && isFiniteNum(p[1])) return { x: p[0], y: p[1] };
    } catch (_) {}
    return null;
  }

  function pickBestScreenPos(ctx, helpers, ent) {
    if (!helpers || typeof helpers.worldToScreen !== 'function') return null;

    const cands = extractTileCandidates(ent);
    if (cands.length === 0) return null;

    let best = null;
    let bestScore = 1e18;
    for (const c of cands) {
      const p = worldToScreen(helpers, c.x, c.y);
      if (!p) continue;

      const ons = isOnScreen(ctx, p.x, p.y, 512);
      // tag 우선순위: tx/tileX 쪽이 안전
      const tagPenalty =
        c.tag === 'tx' ? 0 :
        c.tag === 'tileX' ? 10 :
        c.tag === 'gridX' ? 20 :
        c.tag === 'tileObj' ? 30 :
        c.tag === 'pos' ? 40 :
        80; // xy

      // 화면 밖이면 큰 페널티
      const score = (ons ? 0 : 1e9) + tagPenalty + (Math.abs(p.x) + Math.abs(p.y)) * 0.0001;
      if (score < bestScore) {
        bestScore = score;
        best = { x: p.x, y: p.y, from: 'worldToScreen:' + c.tag, tile: { x: c.x, y: c.y } };
      }
    }
    return best;
  }

  function fallbackIso(ent) {
    // 최후의 최후: 타일 기준 iso 변환
    const t = extractTileCandidates(ent)[0] || { x: 0, y: 0 };
    const tileW = 64, tileH = 32;
    return { x: (t.x - t.y) * (tileW / 2), y: (t.x + t.y) * (tileH / 2), from: 'fallbackIso' };
  }

  // ---------------- render (normal + sell + distruct) ----------------
  function drawFrameCustom(ctx, atlas, frameName, pivotPt, scale, pivot, teamHex) {
    if (!ctx || !atlas || !atlas.frames || !frameName) return false;
    const fr = atlas.frames.get(frameName);
    if (!fr) return false;

    // rotated는 tint 처리 귀찮으니 그냥 원본 drawFrame로 fallback
    if (fr.rotated) {
      const A = PO.atlasTP;
      if (A && typeof A.drawFrame === 'function') {
        return A.drawFrame(ctx, atlas, frameName, pivotPt.x, pivotPt.y, { scale, pivot });
      }
      return false;
    }

    const origW = fr.sourceSize.w || fr.frame.w;
    const origH = fr.sourceSize.h || fr.frame.h;

    const px = (pivot && isFiniteNum(pivot.x)) ? pivot.x : 0.5;
    const py = (pivot && isFiniteNum(pivot.y)) ? pivot.y : 0.5;

    const trimX = fr.spriteSourceSize.x || 0;
    const trimY = fr.spriteSourceSize.y || 0;

    const dx = pivotPt.x - px * origW * scale + trimX * scale;
    const dy = pivotPt.y - py * origH * scale + trimY * scale;

    // tint 적용
    const tinted = teamHex ? getTintedCanvas(atlas, frameName, teamHex) : null;
    if (tinted) {
      ctx.drawImage(tinted, 0, 0, tinted.width, tinted.height, dx, dy, tinted.width * scale, tinted.height * scale);
      return true;
    }

    // 원본 draw (pivot 적용)
    const A = PO.atlasTP;
    if (A && typeof A.drawFrame === 'function') {
      return A.drawFrame(ctx, atlas, frameName, pivotPt.x, pivotPt.y, { scale, pivot });
    }
    return false;
  }

  function drawBarrack(ctx, ent, helpers, state, screenHint) {
    kickLoad();

    const t = nowSec(state);
    const kind = kindFor(ent, state);

    // 로드돼야 그릴 수 있음. 로딩 중엔 박스 그리기 싫으니 그냥 "안 그림"
    const atlasKind = (kind === 'sell') ? 'construct' : kind;
    const atlas = S.atlases[atlasKind];
    if (!atlas || !S.prefix[atlasKind]) return true;

    // pivot point 선택
    const pivotPt =
      (screenHint && isFiniteNum(screenHint.x) && isFiniteNum(screenHint.y))
        ? { x: screenHint.x, y: screenHint.y, from: screenHint.from || 'hint' }
        : (pickBestScreenPos(ctx, helpers, ent) || fallbackIso(ent));

    const scale = readScale();
    const pivot = readPivot();
    const teamHex = getTeamColor(ent);

    let frameName = null;
    if (kind === 'normal') frameName = frameAt('normal', t, false);
    else if (kind === 'construct') frameName = frameAt('construct', t, false);
    else if (kind === 'sell') frameName = frameAt('construct', t, true); // 역재생
    else frameName = frameAt('distruct', t, false);

    if (!frameName) return true;

    // 실제 draw
    drawFrameCustom(ctx, atlas, frameName, pivotPt, scale, pivot, teamHex);

    // track snapshot for ghost spawn
    track(ent, pivotPt, kind, state);

    return true;
  }

  function track(ent, pivotPt, kind, state) {
    const id = snapId(ent);
    if (!id) return;
    const s = stamp60(state);
    const hp = Number(ent.hp ?? ent.health ?? ent.HP ?? 1);
    S.lastSeen.set(id, {
      id,
      lastSeen: s,
      lastSeenTime: nowSec(state),
      lastKind: kind,
      lastHp: isFinite(hp) ? hp : 1,
      teamIdx: getTeamIndex(ent),
      screenX: pivotPt.x,
      screenY: pivotPt.y,
      onScreen: true,
    });
  }

  function snapId(ent) {
    const id = ent.id ?? ent._id ?? ent.uid ?? ent.guid ?? null;
    if (id != null) return safeText(id);
    const tx = ent.tx ?? ent.tileX ?? null;
    const ty = ent.ty ?? ent.tileY ?? null;
    if (isFiniteNum(tx) && isFiniteNum(ty)) return `barrack@${tx},${ty}`;
    return null;
  }

  function gcAndSpawnGhosts(state) {
    const s = stamp60(state);
    const TH = 10; // 약 0.16초 정도
    for (const [id, snap] of S.lastSeen.entries()) {
      if (s - snap.lastSeen < TH) continue;

      // 엔티티가 사라진 경우: 마지막 상태로 고스트 생성
      // hp<=0 이면 파괴, 아니면 매각으로 가정
      const kind = (snap.lastHp <= 0) ? 'distruct' : 'sell';

      spawnGhost({
        teamIdx: snap.teamIdx,
        x: snap.screenX,
        y: snap.screenY,
        kind,
        start: snap.lastSeenTime,
      });

      S.lastSeen.delete(id);
    }
  }

  function spawnGhost(g) {
    if (!g || !isFiniteNum(g.x) || !isFiniteNum(g.y)) return;
    const life = (g.kind === 'sell') ? 1.2 : 1.2; // seconds
    S.ghosts.push({
      kind: g.kind,
      teamIdx: g.teamIdx | 0,
      x: g.x,
      y: g.y,
      t0: g.start || (performance.now() / 1000),
      life,
    });
  }

  function drawGhosts(ctx, helpers, state) {
    if (!ctx) return;
    const t = nowSec(state);

    // 오래된 고스트 정리
    S.ghosts = S.ghosts.filter(g => (t - g.t0) <= g.life);

    for (const g of S.ghosts) {
      const atlasKind = (g.kind === 'sell') ? 'construct' : g.kind;
      const atlas = S.atlases[atlasKind];
      if (!atlas || !S.prefix[atlasKind]) continue;

      const scale = readScale();
      const pivot = readPivot();

      const teamHex = getColorFromUI(g.teamIdx) || (g.teamIdx === 1 ? '#ff3b3b' : '#3da9ff');

      const tt = (t - g.t0);
      let frameName = null;
      if (g.kind === 'sell') frameName = frameAt('construct', tt, true);
      else frameName = frameAt('distruct', tt, false);

      if (!frameName) continue;

      drawFrameCustom(ctx, atlas, frameName, { x: g.x, y: g.y }, scale, pivot, teamHex);
    }
  }

  // ---------------- install wrapper ----------------
  function findDrawBuilding() {
    // 1) PO.buildings.drawBuilding
    if (PO.buildings && typeof PO.buildings.drawBuilding === 'function') {
      return { obj: PO.buildings, key: 'drawBuilding', path: 'PO.buildings.drawBuilding' };
    }

    // 2) global drawBuilding
    if (typeof window.drawBuilding === 'function') {
      return { obj: window, key: 'drawBuilding', path: 'window.drawBuilding' };
    }

    // 3) PO.game.drawBuilding
    if (PO.game && typeof PO.game.drawBuilding === 'function') {
      return { obj: PO.game, key: 'drawBuilding', path: 'PO.game.drawBuilding' };
    }

    return null;
  }

  function tryInstall() {
    if (S.installed) return true;

    const ref = findDrawBuilding();
    if (!ref) return false;

    const orig = ref.obj[ref.key];
    if (typeof orig !== 'function') return false;

    ref.obj[ref.key] = function patchedDrawBuilding(...args) {
      // locate ctx + ent + helpers/state
      let ctx = null, ent = null, helpers = null, state = null;
      const nums = [];

      for (const a of args) {
        if (!ctx && a && typeof a.drawImage === 'function') ctx = a;
        else if (!ent && a && typeof a === 'object' && (a.kind || a.type || a.name || a.hp != null || a.buildProgress != null)) ent = a;
        else if (!helpers && a && typeof a === 'object' && typeof a.worldToScreen === 'function') helpers = a;
        else if (!state && a && typeof a === 'object' && (typeof a.t === 'number' || typeof a.time === 'number' || typeof a.now === 'number')) state = a;

        if (isFiniteNum(a)) nums.push(a);
      }

      if (!S.kicked) kickLoad();

      // 고스트는 프레임마다 먼저 그려줌 (ctx 있을 때만)
      if (ctx) {
        try { drawGhosts(ctx, helpers, state); } catch (_) {}
        try { gcAndSpawnGhosts(state); } catch (_) {}
      }

      if (ent && isBarrack(ent)) {
        const hint = extractScreenHint(ctx, nums);
        // barrack은 기본 박스/폴백을 없애기 위해 항상 true 리턴
        try { return drawBarrack(ctx, ent, helpers, state, hint); } catch (e) {
          console.warn(`[${KEY}:${VER}] drawBarrack failed`, e && e.message ? e.message : e);
          return true;
        }
      }

      return orig.apply(this, args);
    };

    S.installed = true;
    S.installPath = ref.path;
    console.log(`[${KEY}:${VER}] installed on ${ref.path}`);
    return true;
  }

  // 반복 설치 시도 (game.js가 나중에 정의될 수도 있음)
  const timer = setInterval(() => {
    try {
      if (tryInstall()) clearInterval(timer);
    } catch (_) {}
  }, 200);

})();
