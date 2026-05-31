// ============================================================
// LM-TEXT-MANIP.JS — Manipulation directe des titres + pseudos dans le
// Layout Maker (même système que l'éditeur, mais sur #lmPreviewCanvas).
// ------------------------------------------------------------
// Glisser une boîte = déplacer ; tirer une poignée latérale = étirer la zone
// de texte (maxW). Titres = LM.T1/T2/T3 ; pseudos = LM.slots[i].nameX/nameY
// (+ nameMaxW pour la zone). Les positions des pseudos sont capturées pendant
// le rendu de l'aperçu (window._lmtmRegions, alimenté par layout-maker.js).
// Ne touche pas au moteur de rendu : on écrit dans LM puis lmRenderPreview().
// ============================================================
(function () {
  'use strict';

  const REF = 1400;
  let _overlay = null;
  let _drag = null;
  let _ro = null;   // ResizeObserver sur le canvas

  function lm()     { return (typeof LM !== 'undefined') ? LM : null; }
  function canvas() { return document.getElementById('lmPreviewCanvas'); }
  function wrap()   { const c = canvas(); return c ? (c.closest('.lm-canvas-wrap') || c.parentElement) : null; }

  function isActive() {
    const c = canvas();
    return !!(c && c.offsetParent !== null);   // canvas visible (modal LM ouvert)
  }

  function dispScale() {
    const c = canvas();
    if (!c) return 0;
    return c.getBoundingClientRect().width / REF;
  }

  function ensureOverlay() {
    const w = wrap();
    if (!w) return null;
    if (_overlay && _overlay.parentElement === w) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'etm-overlay';
    if (getComputedStyle(w).position === 'static') w.style.position = 'relative';
    w.appendChild(_overlay);
    _overlay.addEventListener('pointerdown', onDown);
    // Le modal LM se met en page progressivement → la 1re mesure du canvas
    // peut être trop petite. On re-place les poignées dès qu'il change de
    // taille (sinon elles restent tassées en haut).
    const c = canvas();
    if (c && window.ResizeObserver && !_ro) {
      _ro = new ResizeObserver(() => { if (isActive()) refresh(); });
      _ro.observe(c);
    }
    return _overlay;
  }

  // Positionne l'overlay pour qu'il recouvre EXACTEMENT le canvas (le wrap LM
  // est en flex:1 et bien plus grand que le canvas centré → on ne peut pas se
  // contenter d'inset:0). Renvoie false si le canvas n'est pas encore mesurable.
  function positionOverlay(ov) {
    const c = canvas();
    if (!c || c.offsetWidth < 2) return false;
    // On cale l'overlay sur la boîte NON transformée du canvas (offset* ignore
    // les transforms), puis on lui applique la MÊME transform (pan/zoom) avec
    // la même origine/transition → l'overlay et ses poignées suivent exactement
    // le canvas, y compris pendant le pan/zoom de l'aperçu.
    ov.style.inset  = 'auto';
    ov.style.left   = c.offsetLeft + 'px';
    ov.style.top    = c.offsetTop + 'px';
    ov.style.width  = c.offsetWidth + 'px';
    ov.style.height = c.offsetHeight + 'px';
    ov.style.transformOrigin = '0 0';
    ov.style.transition = 'transform 0.15s cubic-bezier(0.25,0.8,0.3,1)';
    ov.style.transform = c.style.transform || 'none';
    return true;
  }

  // Boîte en POURCENTAGES du canvas (overlay = canvas via positionOverlay).
  // Robuste : indépendant de la largeur d'affichage mesurée (qui peut être
  // fausse pendant l'ouverture du modal). Le canvas est carré (réf 1400).
  function boxFromDesc(d) {
    const padY = d.size * 0.18;
    const hRef = d.size * 1.15 + padY * 2;
    return {
      left: (d.cx - d.maxW / 2) / REF * 100,
      top:  (d.y - d.size * 0.92 - padY) / REF * 100,
      w:    d.maxW / REF * 100,
      h:    hRef / REF * 100,
      rot:  d.rot || 0,                               // rotation du texte (deg)
      // Ancre verticale (la ligne de base) dans la boîte → la boîte tourne
      // autour du même point que le texte.
      originY: (d.size * 0.92 + padY) / hRef * 100,
    };
  }

  function refresh() {
    const ov = ensureOverlay();
    if (!ov) return;
    if (!isActive() || !positionOverlay(ov)) { ov.style.display = 'none'; return; }
    ov.style.display = 'block';
    ov.innerHTML = '';
    (window._lmtmRegions || []).forEach(d => {
      if (!d || !(d.maxW > 0)) return;
      const box = boxFromDesc(d);
      if (!box || box.w < 1) return;
      const el = document.createElement('div');
      el.className = 'etm-box etm-' + d.kind;
      el.dataset.kind = d.kind;
      el.dataset.id = d.id != null ? d.id : d.idx;
      el.style.left = box.left + '%';
      el.style.top = box.top + '%';
      el.style.width = box.w + '%';
      el.style.height = box.h + '%';
      // La boîte tourne avec le texte (autour de la ligne de base centrée).
      if (box.rot) {
        el.style.transformOrigin = '50% ' + box.originY + '%';
        el.style.transform = 'rotate(' + box.rot + 'deg)';
      }
      el.title = (d.kind === 'name' ? 'Pseudo' : 'Titre') + ' — glisser pour déplacer, bords pour la zone';
      el.innerHTML = '<span class="etm-handle etm-w"></span><span class="etm-handle etm-e"></span>';
      ov.appendChild(el);
    });
  }
  window.lmTextManipRefresh = refresh;

  function rerender() { if (typeof lmRenderPreview === 'function') lmRenderPreview(); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function onDown(e) {
    const handle = e.target.closest('.etm-handle');
    const boxEl  = e.target.closest('.etm-box');
    if (!boxEl) return;
    const L = lm();
    if (!L) return;
    e.preventDefault();
    e.stopPropagation();   // ne pas déclencher le pan du canvas en même temps
    const kind = boxEl.dataset.kind;
    const sc = dispScale() || 1;
    const mode = handle ? (handle.classList.contains('etm-e') ? 'zoneE' : 'zoneW') : 'move';
    if (kind === 'title') {
      const t = L[boxEl.dataset.id];
      if (!t) return;
      _drag = { kind, ref: t, mode, sc, startX: e.clientX, startY: e.clientY,
                x0: t.x, y0: t.y, maxW0: t.maxW || 900 };
    } else {
      const slot = (L.slots || [])[+boxEl.dataset.id];
      if (!slot) return;
      const nx0 = (slot.nameX != null) ? slot.nameX : slot.cx;
      _drag = { kind, ref: slot, mode, sc, startX: e.clientX, startY: e.clientY,
                x0: nx0, y0: slot.nameY, maxW0: slot.nameMaxW || 360 };
    }
    boxEl.classList.add('etm-active');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(e) {
    if (!_drag) return;
    const dxRef = (e.clientX - _drag.startX) / _drag.sc;
    const dyRef = (e.clientY - _drag.startY) / _drag.sc;
    const zoneW = (m0) => clamp(_drag.mode === 'zoneE' ? m0 + 2 * dxRef : m0 - 2 * dxRef, 60, REF);
    if (_drag.kind === 'title') {
      if (_drag.mode === 'move') {
        _drag.ref.x = clamp(_drag.x0 + dxRef, 0, REF);
        _drag.ref.y = clamp(_drag.y0 + dyRef, 0, REF);
      } else {
        _drag.ref.maxW = zoneW(_drag.maxW0);
      }
    } else {
      if (_drag.mode === 'move') {
        _drag.ref.nameX = clamp(_drag.x0 + dxRef, 0, REF);
        _drag.ref.nameY = clamp(_drag.y0 + dyRef, 0, REF);
      } else {
        _drag.ref.nameMaxW = zoneW(_drag.maxW0);
      }
    }
    rerender();   // re-render + re-capture + refresh
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    _drag = null;
    refresh();
  }

  window.addEventListener('resize', () => { if (isActive()) refresh(); });
})();
