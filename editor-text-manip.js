// ============================================================
// EDITOR-TEXT-MANIP.JS — Manipulation directe des TITRES sur l'aperçu éditeur
// ------------------------------------------------------------
// Pose une couche d'interaction par-dessus #editorCanvas : on peut cliquer
// un titre (T1/T2/T3) et le DÉPLACER (glisser la boîte) ou le REDIMENSIONNER
// (glisser une poignée de coin → change la taille de police).
//
// Ne touche PAS au rendu : on lit/écrit uniquement CONFIG.T1/T2/T3 et les
// sliders existants, puis on re-rend. Actif seulement en format non-Magna
// (les titres Lorem sont positionnés via CONFIG.Tx ; Magna a son propre rendu).
// ============================================================
(function () {
  'use strict';

  const REF = 1400;                  // repère de référence (CONFIG.REF_SIZE)
  const KEYS = ['T1', 'T2', 'T3'];
  let _overlay = null;
  let _drag = null;                  // état de glissement courant
  let _selected = null;              // clé "kind:id" de la zone sélectionnée (seule boîte affichée)

  function canvas() { return document.getElementById('editorCanvas'); }
  function wrap()   { return document.querySelector('.editor-canvas-wrap'); }

  // Texte affiché pour chaque titre (même source que drawTitles).
  function titleText(key) {
    const nameEl = document.getElementById('tournamentName');
    const name = (nameEl ? nameEl.value : '') || 'Lorem Ipsum';
    const game = (typeof GAMES !== 'undefined' && typeof currentGame !== 'undefined'
      && GAMES[currentGame]) ? GAMES[currentGame] : { sub1: '', sub2: '' };
    if (key === 'T1') return name.toUpperCase();
    if (key === 'T2') return game.sub1 || '';
    return game.sub2 || '';
  }

  // Largeur de la zone de texte (maxW). Mêmes défauts que drawTitles.
  function defaultMaxW(key, cfg) {
    if (cfg && cfg.maxW) return cfg.maxW;
    return key === 'T2' ? 960 : 800;
  }

  // Reproduit le choix police/weight de drawTitles pour une mesure fidèle.
  function titleFont(cfg, sizePx) {
    const isT8 = (typeof currentGame !== 'undefined' && currentGame === 'tekken8');
    let stack = isT8 ? 'Anton, sans-serif' : 'Montserrat, sans-serif';
    let weight = isT8 ? '400' : '800';
    if (cfg.font) {
      const meta = (typeof _fontMeta === 'function') ? _fontMeta(cfg.font) : null;
      stack = `"${cfg.font}", ${stack}`;
      if (meta) weight = meta.weight;
    }
    return `${weight} ${Math.round(sizePx)}px ${stack}`;
  }

  // Largeur du texte en unités REF (mesurée à la taille REF du titre).
  function measureRefWidth(cfg, text) {
    const c = canvas();
    if (!c) return 0;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.font = titleFont(cfg, cfg.s);
    try { ctx.letterSpacing = `${cfg.l || 0}px`; } catch (_) {}
    const w = ctx.measureText(text).width;
    try { ctx.letterSpacing = '0px'; } catch (_) {}
    ctx.restore();
    return w;
  }

  // Échelle repère→pixels d'affichage (le canvas est rendu en REF, affiché en CSS).
  function dispScale() {
    const c = canvas();
    if (!c) return 0;
    const r = c.getBoundingClientRect();
    return r.width / REF;
  }

  function isActive() {
    const modal = document.getElementById('editorModal');
    if (!modal || modal.style.display === 'none') return false;
    if (typeof currentFormat !== 'undefined' && currentFormat === 'magna') return false;
    return true;
  }

  function ensureOverlay() {
    const w = wrap();
    if (!w) return null;
    if (_overlay && _overlay.parentElement === w) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'etm-overlay';
    _overlay.innerHTML = '';
    w.style.position = w.style.position || 'relative';
    w.appendChild(_overlay);
    // Clic dans le vide (sur le canvas, hors d'une boîte) → désélectionne :
    // toutes les zones redeviennent invisibles. L'overlay est pointer-events:none,
    // donc les clics hors boîte atteignent le canvas → on les capte ici.
    const c = canvas();
    if (c && !c._etmDeselectBound) {
      c.addEventListener('pointerdown', () => { if (_selected !== null) { _selected = null; refresh(); } });
      c._etmDeselectBound = true;
    }
    return _overlay;
  }

  // Calcule la boîte d'un titre en pixels relatifs au canvas (donc à l'overlay).
  // Boîte d'affichage (px relatifs à l'overlay) depuis un descripteur en coords
  // REF : {cx (centre), base (baseline), size, maxW (largeur de zone)}.
  function boxFromDesc(d) {
    const sc = dispScale();
    if (!sc) return null;
    const padY = d.size * 0.18;
    const leftRef = d.cx - d.maxW / 2;
    const topRef  = d.base - d.size * 0.92 - padY;
    const wBoxRef = d.maxW;
    const hBoxRef = d.size * 1.15 + padY * 2;
    // Position du canvas relative à l'ORIGINE de l'overlay (le wrap a une
    // bordure) → alignement exact des boîtes sur le canvas.
    const c = canvas();
    let offX = 0, offY = 0;
    if (c && _overlay) {
      const cr = c.getBoundingClientRect(), or = _overlay.getBoundingClientRect();
      offX = cr.left - or.left; offY = cr.top - or.top;
    }
    return { left: offX + leftRef * sc, top: offY + topRef * sc, w: wBoxRef * sc, h: hBoxRef * sc };
  }

  // Zones éditables = titres (CONFIG.Tx) + pseudos (capturés pendant le rendu).
  function collectDescs() {
    const list = [];
    KEYS.forEach(key => {
      const cfg = (typeof CONFIG !== 'undefined') ? CONFIG[key] : null;
      if (!cfg || !titleText(key)) return;
      list.push({ kind: 'title', id: key, cx: cfg.x, base: cfg.y, size: cfg.s, maxW: defaultMaxW(key, cfg) });
    });
    (window._etmNameRegions || []).forEach(r => {
      if (r && r.maxW > 0) list.push({ kind: 'name', id: r.idx, cx: r.cx, base: r.y, size: r.size, maxW: r.maxW });
    });
    return list;
  }

  // Titre : écrit x/y/maxW dans CONFIG.Tx + sliders, persiste, re-rend.
  function applyTitle(key, patch) {
    const T = (typeof CONFIG !== 'undefined') ? CONFIG[key] : null;
    if (!T) return;
    Object.assign(T, patch);
    T.x = Math.max(0, Math.min(REF, T.x));
    T.y = Math.max(0, Math.min(REF, T.y));
    if ('maxW' in patch) T.maxW = Math.max(60, Math.min(REF, T.maxW));
    const p = key.toLowerCase();
    const setEl = (suf, val) => {
      const s = document.getElementById(p + suf); if (s) s.value = Math.round(val);
      const n = document.getElementById(p + suf + '_n'); if (n) n.value = Math.round(val);
    };
    if ('x' in patch) setEl('x', T.x);
    if ('y' in patch) setEl('y', T.y);
    if (typeof saveTitleConfig === 'function') saveTitleConfig();
    if (typeof renderEditorCanvas === 'function') renderEditorCanvas();
  }

  // Pseudo : écrit décalage / zone dans la config joueur, persiste, re-rend.
  function applyName(idx, patch) {
    if (typeof savePlayerNameCfg !== 'function') return;
    const clean = {};
    if ('xOffset' in patch) clean.xOffset = Math.round(patch.xOffset);
    if ('yOffset' in patch) clean.yOffset = Math.round(patch.yOffset);
    if ('maxW' in patch) clean.maxW = Math.max(60, Math.min(REF, Math.round(patch.maxW)));
    savePlayerNameCfg(idx, clean);
    if (typeof renderEditorCanvas === 'function') renderEditorCanvas();
  }

  function refresh() {
    const ov = ensureOverlay();
    if (!ov) return;
    if (!isActive()) { ov.style.display = 'none'; return; }
    ov.style.display = 'block';
    ov.innerHTML = '';
    collectDescs().forEach(d => {
      const box = boxFromDesc(d);
      if (!box || box.w < 4) return;
      const el = document.createElement('div');
      el.className = 'etm-box etm-' + d.kind;
      el.dataset.kind = d.kind;
      el.dataset.id = d.id;
      if (_selected === d.kind + ':' + d.id) el.classList.add('etm-selected');
      el.style.left = box.left + 'px';
      el.style.top = box.top + 'px';
      el.style.width = box.w + 'px';
      el.style.height = box.h + 'px';
      el.title = d.kind === 'name'
        ? 'Pseudo — glisser pour déplacer, bords pour la zone'
        : 'Titre — glisser pour déplacer, bords pour la zone';
      el.innerHTML = '<span class="etm-handle etm-w"></span><span class="etm-handle etm-e"></span>';
      ov.appendChild(el);
    });
  }
  window.editorTextManipRefresh = refresh;

  // ── Glissement (déplacement + redimensionnement) ──
  function onDown(e) {
    const handle = e.target.closest('.etm-handle');
    const boxEl  = e.target.closest('.etm-box');
    if (!boxEl) return;
    // Sélectionne cette zone (les autres se cachent) — la zone reste affichée
    // tant qu'on ne clique pas ailleurs.
    _selected = boxEl.dataset.kind + ':' + boxEl.dataset.id;
    if (_overlay) _overlay.querySelectorAll('.etm-box.etm-selected')
      .forEach(b => { if (b !== boxEl) b.classList.remove('etm-selected'); });
    boxEl.classList.add('etm-selected');
    e.preventDefault();
    const kind = boxEl.dataset.kind;
    const sc = dispScale() || 1;
    const mode = handle
      ? (handle.classList.contains('etm-e') ? 'zoneE' : 'zoneW')
      : 'move';
    if (kind === 'title') {
      const id = boxEl.dataset.id;
      const cfg = (typeof CONFIG !== 'undefined') ? CONFIG[id] : null;
      if (!cfg) return;
      _drag = { kind, id, mode, sc, startX: e.clientX, startY: e.clientY,
                x0: cfg.x, y0: cfg.y, maxW0: defaultMaxW(id, cfg) };
    } else {
      const idx = +boxEl.dataset.id;
      const cfg = (typeof getPlayerNameCfg === 'function') ? getPlayerNameCfg(idx) : null;
      if (!cfg) return;
      const reg = (window._etmNameRegions || []).find(r => r.idx === idx);
      _drag = { kind, id: idx, mode, sc, startX: e.clientX, startY: e.clientY,
                ox0: cfg.xOffset || 0, oy0: cfg.yOffset || 0,
                maxW0: cfg.maxW || (reg ? reg.maxW : 360) };
    }
    boxEl.classList.add('etm-active');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(e) {
    if (!_drag) return;
    const dxRef = (e.clientX - _drag.startX) / _drag.sc;
    const dyRef = (e.clientY - _drag.startY) / _drag.sc;
    // Zone centrée → tirer un bord l'élargit/rétrécit symétriquement.
    const zoneW = (m0) => _drag.mode === 'zoneE' ? m0 + 2 * dxRef : m0 - 2 * dxRef;
    if (_drag.kind === 'title') {
      if (_drag.mode === 'move') applyTitle(_drag.id, { x: _drag.x0 + dxRef, y: _drag.y0 + dyRef });
      else                       applyTitle(_drag.id, { maxW: zoneW(_drag.maxW0) });
    } else {
      if (_drag.mode === 'move') applyName(_drag.id, { xOffset: _drag.ox0 + dxRef, yOffset: _drag.oy0 + dyRef });
      else                       applyName(_drag.id, { maxW: zoneW(_drag.maxW0) });
    }
    refresh();
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    const wasName = _drag && _drag.kind === 'name';
    _drag = null;
    // Sync des sliders pseudos + aperçu principal au relâchement.
    if (wasName && typeof renderNameEditor === 'function') renderNameEditor();
    if (typeof generatePreview === 'function') generatePreview();
    refresh();
  }

  // Init : délégation des pointerdown sur l'overlay + repositionnement au resize.
  function init() {
    const ov = ensureOverlay();
    if (ov && !ov._bound) {
      ov.addEventListener('pointerdown', onDown);
      ov._bound = true;
    }
    refresh();
  }
  window.editorTextManipInit = init;

  window.addEventListener('resize', () => { if (isActive()) refresh(); });
  if (document.readyState !== 'loading') setTimeout(init, 0);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
})();
