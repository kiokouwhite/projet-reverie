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
    return _overlay;
  }

  // Calcule la boîte d'un titre en pixels relatifs au canvas (donc à l'overlay).
  function titleBox(key) {
    const cfg = (typeof CONFIG !== 'undefined') ? CONFIG[key] : null;
    if (!cfg) return null;
    const text = titleText(key);
    if (!text) return null;
    const sc = dispScale();
    if (!sc) return null;
    // La boîte représente la ZONE DE TEXTE disponible (= maxW dans drawTitles),
    // centrée sur cfg.x. C'est cette zone qu'on étire avec les poignées
    // latérales : plus large = le texte a plus de place (moins condensé) ;
    // plus étroite = le texte est resserré dans la zone.
    const maxW = defaultMaxW(key, cfg);
    const padY = cfg.s * 0.18;
    const leftRef = cfg.x - maxW / 2;
    const topRef  = cfg.y - cfg.s * 0.92 - padY;       // ascendante approx
    const wBoxRef = maxW;
    const hBoxRef = cfg.s * 1.15 + padY * 2;
    // Position du canvas relative à l'ORIGINE de l'overlay (et non du wrap, qui
    // a une bordure) → alignement exact des boîtes sur le canvas.
    const c = canvas();
    let offX = 0, offY = 0;
    if (c && _overlay) {
      const cr = c.getBoundingClientRect(), or = _overlay.getBoundingClientRect();
      offX = cr.left - or.left; offY = cr.top - or.top;
    }
    return {
      left: offX + leftRef * sc,
      top:  offY + topRef  * sc,
      w:    wBoxRef * sc,
      h:    hBoxRef * sc,
    };
  }

  // Écrit x/y/s dans CONFIG + sliders, persiste, re-rend.
  function applyTitle(key, patch, livePreview) {
    const T = (typeof CONFIG !== 'undefined') ? CONFIG[key] : null;
    if (!T) return;
    Object.assign(T, patch);
    T.x = Math.max(0, Math.min(REF, T.x));
    T.y = Math.max(0, Math.min(REF, T.y));
    T.s = Math.max(10, Math.min(220, T.s));
    if ('maxW' in patch) T.maxW = Math.max(60, Math.min(REF, T.maxW));
    const p = key.toLowerCase();
    const setEl = (suf, val) => {
      const s = document.getElementById(p + suf); if (s) s.value = Math.round(val);
      const n = document.getElementById(p + suf + '_n'); if (n) n.value = Math.round(val);
    };
    if ('x' in patch) setEl('x', T.x);
    if ('y' in patch) setEl('y', T.y);
    if ('s' in patch) setEl('s', T.s);
    if (typeof saveTitleConfig === 'function') saveTitleConfig();
    if (typeof renderEditorCanvas === 'function') renderEditorCanvas();
    if (livePreview && typeof generatePreview === 'function') generatePreview();
  }

  function refresh() {
    const ov = ensureOverlay();
    if (!ov) return;
    if (!isActive()) { ov.style.display = 'none'; return; }
    ov.style.display = 'block';
    ov.innerHTML = '';
    KEYS.forEach(key => {
      const box = titleBox(key);
      if (!box || box.w < 4) return;
      const el = document.createElement('div');
      el.className = 'etm-box';
      el.dataset.key = key;
      el.style.left = box.left + 'px';
      el.style.top = box.top + 'px';
      el.style.width = box.w + 'px';
      el.style.height = box.h + 'px';
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
    const key = boxEl.dataset.key;
    const cfg = (typeof CONFIG !== 'undefined') ? CONFIG[key] : null;
    if (!cfg) return;
    e.preventDefault();
    const sc = dispScale() || 1;
    const mode = handle
      ? (handle.classList.contains('etm-e') ? 'zoneE' : 'zoneW')
      : 'move';
    _drag = {
      key, mode,
      startX: e.clientX, startY: e.clientY,
      x0: cfg.x, y0: cfg.y, maxW0: defaultMaxW(key, cfg), sc,
    };
    boxEl.classList.add('etm-active');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(e) {
    if (!_drag) return;
    const dx = e.clientX - _drag.startX;
    const dy = e.clientY - _drag.startY;
    if (_drag.mode === 'move') {
      applyTitle(_drag.key, {
        x: _drag.x0 + dx / _drag.sc,
        y: _drag.y0 + dy / _drag.sc,
      }, false);
    } else {
      // Étirement de la zone de texte (maxW). Zone centrée sur x → tirer un bord
      // l'élargit/rétrécit symétriquement (le bord suit le curseur).
      const dxRef = dx / _drag.sc;
      const newMaxW = _drag.mode === 'zoneE'
        ? _drag.maxW0 + 2 * dxRef    // bord droit vers la droite = plus large
        : _drag.maxW0 - 2 * dxRef;   // bord gauche vers la gauche (dx<0) = plus large
      applyTitle(_drag.key, { maxW: newMaxW }, false);
    }
    refresh();
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    if (_drag && typeof generatePreview === 'function') generatePreview();
    _drag = null;
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
