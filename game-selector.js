// ============================================================
// GAME-SELECTOR.JS — Pill button avec swipe / crossfade entre jeux
//
// Port vanilla JS du design "Game Selector" (Claude Design).
// Remplace le <select id="gameSelect"> dans le slide Paramètres :
//   - Flèches gauche/droite qui restent fixes
//   - Nom + fond du jeu courant qui glissent et se mélangent en crossfade
//   - Léger parallaxe sur le nom (peak au milieu du swipe)
//   - Fond start.gg utilisé en priorité quand disponible (capturé via
//     setStartggImage(gameId, url) depuis multi.js), sinon backgrounds
//     locaux backgrounds/{gameId}.jpg, sinon dégradé pastel auto.
//
// API publique :
//   window.gameSelectorInit()                    → monte le pill
//   window.gameSelectorRefresh()                 → re-lit la liste des jeux
//                                                  (utile après ajout layout custom)
//   window.gameSelectorSyncToGameSelect()        → aligne sur la value du <select>
//   window.gameSelectorSetStartggImage(id, url)  → fournit un fond start.gg
// ============================================================

(function() {
  // ── Fond start.gg par jeu (rempli au fur et à mesure des imports) ──
  const _startggBg = {};   // gameId → URL d'image start.gg

  // Palette de tints/inks fallback par game id (couleurs dans l'esprit du jeu).
  const GAME_THEME = {
    ssbu:    { tint: '#fde2dc', ink: '#dc2626' },
    sf6:     { tint: '#f1e3fb', ink: '#7c3aed' },
    ggst:    { tint: '#fbd9e8', ink: '#db2777' },
    tekken8: { tint: '#dde6fa', ink: '#2563eb' },
    '2xko':  { tint: '#dff2e3', ink: '#16a34a' },
    dbfz:    { tint: '#fde9c7', ink: '#d97706' },
  };
  // Couleur générique pour les autres jeux (layouts custom etc.)
  const FALLBACK_THEME = { tint: '#ece5f7', ink: '#6d28d9' };

  function themeFor(gameId) {
    return GAME_THEME[gameId] || FALLBACK_THEME;
  }

  function hexLerp(a, b, t) {
    const pa = a.replace('#','').match(/.{2}/g).map(x => parseInt(x, 16));
    const pb = b.replace('#','').match(/.{2}/g).map(x => parseInt(x, 16));
    const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function smoothstep(x) {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // Construit la liste des jeux depuis le <select id="gameSelect"> caché
  // (la source de vérité de l'app : les autres modules continuent d'écouter
  // les events change sur ce select).
  function readGamesFromSelect() {
    const sel = document.getElementById('gameSelect');
    if (!sel) return [];
    const games = [];
    Array.from(sel.options).forEach(opt => {
      if (!opt.value || opt.disabled) return;
      const id = opt.value;
      const theme = themeFor(id);
      // bg : start.gg si dispo, sinon le PNG/JPG local par défaut
      const sggUrl = _startggBg[id];
      let bg;
      if (sggUrl) {
        // ⚠️ url(...) en SIMPLE QUOTES : le style inline est lui-même
        // wrappé en double-quotes, donc des " dans url() ferment l'attribut
        // prématurément et la propriété background n'est jamais appliquée.
        bg = `linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.32)), url('${sggUrl}') center/cover`;
      } else {
        // Fond intégré ou dégradé pastel basé sur la teinte du jeu
        const localBgUrl = guessLocalBg(id);
        if (localBgUrl) {
          bg = `linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.28)), url('${localBgUrl}') center/cover`;
        } else {
          bg = makeGradient(theme);
        }
      }
      games.push({ id, name: opt.textContent.trim(), tint: theme.tint, ink: theme.ink, bg });
    });
    return games;
  }

  // Devine l'URL de fond local pour les jeux built-in
  function guessLocalBg(id) {
    const builtin = ['ssbu', 'sf6', 'ggst', 'tekken8', '2xko'];
    if (!builtin.includes(id)) return null;
    const relPath = `backgrounds/${id}.jpg`;
    return (typeof assetUrl === 'function') ? assetUrl(relPath) : relPath;
  }

  function makeGradient(theme) {
    // Dégradé pastel auto basé sur la teinte du jeu (utilisé quand
    // aucune image de fond n'est connue).
    const t = theme.tint;
    const k = theme.ink;
    return `
      radial-gradient(110% 80% at 25% 30%, ${k}33 0%, transparent 60%),
      radial-gradient(90% 80% at 85% 80%, ${k}22 0%, transparent 55%),
      linear-gradient(135deg, ${t} 0%, ${t} 100%)
    `;
  }

  // ── État interne du pill ──
  let _games = [];
  let _index = 0;
  let _offset = 0;
  let _rafId = null;
  let _root = null;
  let _animating = false;

  const PILL_WIDTH = 320;
  const PILL_HEIGHT = 56;
  const ARROW_SIZE = 44;
  const ANIM_MS = 620;

  function findIndexOf(gameId) {
    return Math.max(0, _games.findIndex(g => g.id === gameId));
  }

  function wrap(i) {
    const N = _games.length;
    if (!N) return 0;
    return ((i % N) + N) % N;
  }

  function cancelAnim() {
    if (_rafId != null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _animating = false;
  }

  function animateTo(targetDelta, onDone) {
    cancelAnim();
    _animating = true;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / ANIM_MS, 1);
      _offset = targetDelta * easeOutCubic(t);
      render();
      if (t < 1) {
        _rafId = requestAnimationFrame(tick);
      } else {
        _rafId = null;
        _animating = false;
        onDone && onDone();
      }
    };
    _rafId = requestAnimationFrame(tick);
  }

  function go(delta) {
    if (_animating || !_games.length) return;
    animateTo(delta, () => {
      _index = wrap(_index + delta);
      _offset = 0;
      // Propage le changement vers le <select> caché → autres modules réagissent
      const sel = document.getElementById('gameSelect');
      if (sel) {
        sel.value = _games[_index].id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      render();
    });
  }

  // ── Construction du DOM (une seule fois) ──
  function mount(container) {
    container.innerHTML = `
      <div class="gs-pill-wrap">
        <div class="gs-pill-bg"></div>
        <div class="gs-pill-clip">
          <div class="gs-bg-layers"></div>
          <div class="gs-pill-highlight"></div>
          <div class="gs-text-layers"></div>
        </div>
        <button type="button" class="gs-arrow gs-arrow-left"  aria-label="Jeu précédent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><polyline points="14,7 8,12 14,17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="gs-arrow-ripple"></span>
        </button>
        <button type="button" class="gs-arrow gs-arrow-right" aria-label="Jeu suivant">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><polyline points="10,7 16,12 10,17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="gs-arrow-ripple"></span>
        </button>
      </div>`;
    _root = container.querySelector('.gs-pill-wrap');
    const leftBtn  = container.querySelector('.gs-arrow-left');
    const rightBtn = container.querySelector('.gs-arrow-right');
    const rippleLeft  = leftBtn.querySelector('.gs-arrow-ripple');
    const rippleRight = rightBtn.querySelector('.gs-arrow-ripple');
    const ripple = (el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'gsRipple 480ms ease-out';
    };
    leftBtn.addEventListener('click', () => { ripple(rippleLeft); go(-1); });
    rightBtn.addEventListener('click', () => { ripple(rippleRight); go(+1); });
    // Navigation clavier active seulement quand le pill est visible (slide
    // Paramètres ouvert). On écoute globalement + on check la visibilité.
    window.addEventListener('keydown', (e) => {
      const visible = _root && _root.offsetParent !== null;
      if (!visible) return;
      // Ne pas voler les flèches quand on est dans un input/textarea
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(+1); }
    });
  }

  // ── Rendu (rappelé chaque frame pendant les anims) ──
  function render() {
    if (!_root || !_games.length) return;
    const N = _games.length;
    const virtual = _index + _offset;

    // Tint + ink interpolés entre les jeux adjacents
    const i0 = Math.floor(virtual);
    const i1 = Math.ceil(virtual);
    const tFrac = virtual - i0;
    const g0 = _games[wrap(i0)];
    const g1 = _games[wrap(i1)];
    const tint = hexLerp(g0.tint, g1.tint, tFrac);
    const ink  = hexLerp(g0.ink,  g1.ink,  tFrac);

    // Fond du pill (couleur interpolée)
    const bgEl = _root.querySelector('.gs-pill-bg');
    if (bgEl) {
      bgEl.style.background = `linear-gradient(180deg, ${tint}f5 0%, ${tint} 100%)`;
      bgEl.style.boxShadow = `
        0 1px 2px rgba(0,0,0,0.04),
        0 8px 24px ${ink}22,
        inset 0 1px 0 rgba(255,255,255,0.7),
        inset 0 -1px 0 ${ink}1a`;
    }
    // Couleur des flèches suit l'ink
    _root.querySelectorAll('.gs-arrow').forEach(a => a.style.color = ink);

    // Layers visibles (jeu courant + voisins proches pour le crossfade)
    const layers = _games.map((g, i) => {
      let d = i - virtual;
      if (d >  N / 2) d -= N;
      if (d < -N / 2) d += N;
      const absD = Math.abs(d);
      if (absD >= 1.2) return null;
      const fade = smoothstep(1 - absD);
      const motionPct = 55;     // % de glissement
      const parallaxPx = 14;    // parallaxe du texte
      const bgTx   = d * motionPct;
      const textPx = Math.sin(absD * Math.PI) * parallaxPx * Math.sign(d || 1);
      return { g, i, fade, bgTx, textTx: d * motionPct, textPx };
    }).filter(Boolean);

    const bgLayers = _root.querySelector('.gs-bg-layers');
    const txLayers = _root.querySelector('.gs-text-layers');
    if (bgLayers) {
      bgLayers.innerHTML = layers.map(l => `
        <div class="gs-bg-layer" style="background:${l.g.bg};opacity:${l.fade};transform:translate3d(${l.bgTx}%,0,0);"></div>
      `).join('');
    }
    if (txLayers) {
      txLayers.innerHTML = layers.map(l => `
        <div class="gs-text-layer" style="opacity:${l.fade};transform:translate3d(calc(${l.textTx}% + ${l.textPx}px),0,0);">
          <span class="gs-text" style="color:${l.g.ink};text-shadow:0 1px 0 rgba(255,255,255,0.4),0 0 6px rgba(0,0,0,0.35);">
            <span class="gs-text-count">${l.i + 1} / ${N}</span>
            <span class="gs-text-sep">—</span>
            <span class="gs-text-name">${escHtml(l.g.name)}</span>
          </span>
        </div>
      `).join('');
    }
  }

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
    })[c]);
  }

  // ── API publique ──
  function refresh() {
    _games = readGamesFromSelect();
    // Aligne l'index sur la value courante du select
    const sel = document.getElementById('gameSelect');
    if (sel && sel.value) _index = findIndexOf(sel.value);
    _offset = 0;
    render();
  }

  function syncToGameSelect() {
    const sel = document.getElementById('gameSelect');
    if (!sel) return;
    const idx = findIndexOf(sel.value);
    if (idx !== _index) {
      _index = idx;
      _offset = 0;
      render();
    }
  }

  function setStartggImage(gameId, url) {
    if (!gameId || !url) return;
    if (_startggBg[gameId] === url) return;
    _startggBg[gameId] = url;
    // Si on a déjà chargé les jeux, on les recharge pour intégrer le nouveau fond
    if (_games.length) refresh();
  }

  function init() {
    const host = document.getElementById('gameSelectorPill');
    if (!host) return;
    mount(host);
    refresh();
    // Re-sync si une autre partie de l'app change le <select>
    const sel = document.getElementById('gameSelect');
    if (sel) {
      // MutationObserver sur la value via setter custom : trop intrusif.
      // À la place on écoute 'change' (qu'on dispatch nous-mêmes mais aussi
      // que d'autres modules peuvent dispatcher) — petite garde anti-boucle.
      sel.addEventListener('change', () => {
        if (_animating) return; // pendant nos propres anims
        syncToGameSelect();
      });
    }
  }

  window.gameSelectorInit              = init;
  window.gameSelectorRefresh           = refresh;
  window.gameSelectorSyncToGameSelect  = syncToGameSelect;
  window.gameSelectorSetStartggImage   = setStartggImage;

  // ─────────────────────────────────────────────────────────────────────
  // MODE "MULTI" — instance pour la navigation entre graphes importés
  // (remplace #prevBtn / #graphCounter / #nextBtn dans #multiNav).
  // Source de vérité : window.graphs[] (rempli par multi.js#importAllEvents)
  // Navigation : prevGraph()/nextGraph()/currentGraphIdx exposés par multi.js
  // ─────────────────────────────────────────────────────────────────────
  let _multiRoot = null;
  let _multiAnimating = false;
  let _multiRafId = null;
  let _multiOffset = 0;

  function _multiCancel() {
    if (_multiRafId != null) { cancelAnimationFrame(_multiRafId); _multiRafId = null; }
    _multiAnimating = false;
  }

  // Accès au global `graphs` (let top-level dans multi.js → pas sur window
   // mais accessible via typeof checks dans le scope global du navigateur).
  function _getGraphs() {
    try { return (typeof graphs !== 'undefined' && Array.isArray(graphs)) ? graphs : []; }
    catch (e) { return []; }
  }
  function _getCurrentGraphIdx() {
    try { return (typeof currentGraphIdx === 'number') ? currentGraphIdx : 0; }
    catch (e) { return 0; }
  }

  function _multiCurrentGames() {
    const graphs = _getGraphs();
    return graphs.map(g => {
      const id   = g.game;
      const theme = themeFor(id);
      // Image start.gg per-graph en priorité, puis _startggBg global,
      // puis bg local, puis dégradé.
      const sgg = g.videogameImageUrl || _startggBg[id];
      let bg;
      if (sgg) {
        // Single quotes pour url() — voir commentaire dans readGamesFromSelect
        bg = `linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.42)), url('${sgg}') center/cover`;
      } else {
        const local = guessLocalBg(id);
        if (local) bg = `linear-gradient(180deg, rgba(0,0,0,0.14), rgba(0,0,0,0.34)), url('${local}') center/cover`;
        else       bg = makeGradient(theme);
      }
      return {
        id, name: g.gameName || id, tint: theme.tint, ink: theme.ink, bg
      };
    });
  }

  function _multiAnimateTo(targetDelta, onDone) {
    _multiCancel();
    _multiAnimating = true;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / ANIM_MS, 1);
      _multiOffset = targetDelta * easeOutCubic(t);
      _multiRender();
      if (t < 1) {
        _multiRafId = requestAnimationFrame(tick);
      } else {
        _multiRafId = null;
        _multiAnimating = false;
        onDone && onDone();
      }
    };
    _multiRafId = requestAnimationFrame(tick);
  }

  function _multiGo(delta) {
    if (_multiAnimating) return;
    const games = _multiCurrentGames();
    if (games.length <= 1) return; // 1 seul graph → flèches inactives
    _multiAnimateTo(delta, () => {
      _multiOffset = 0;
      // Délègue à la nav existante. Function declarations top-level vont sur
      // window dans la plupart des navigateurs, mais on tente les deux pour
      // robustesse.
      try {
        if (delta < 0) {
          if (typeof window.prevGraph === 'function') window.prevGraph();
          else if (typeof prevGraph === 'function')   prevGraph();
        }
        if (delta > 0) {
          if (typeof window.nextGraph === 'function') window.nextGraph();
          else if (typeof nextGraph === 'function')   nextGraph();
        }
      } catch (e) { console.warn('[gs] nav error', e); }
    });
  }

  function _multiMount(container) {
    container.innerHTML = `
      <div class="gs-pill-wrap gs-pill-multi">
        <div class="gs-pill-bg"></div>
        <div class="gs-pill-clip">
          <div class="gs-bg-layers"></div>
          <div class="gs-pill-highlight"></div>
          <div class="gs-text-layers"></div>
        </div>
        <button type="button" class="gs-arrow gs-arrow-left"  aria-label="Graph précédent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><polyline points="14,7 8,12 14,17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="gs-arrow-ripple"></span>
        </button>
        <button type="button" class="gs-arrow gs-arrow-right" aria-label="Graph suivant">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><polyline points="10,7 16,12 10,17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="gs-arrow-ripple"></span>
        </button>
      </div>`;
    _multiRoot = container.querySelector('.gs-pill-wrap');
    const leftBtn  = container.querySelector('.gs-arrow-left');
    const rightBtn = container.querySelector('.gs-arrow-right');
    const rippleL = leftBtn.querySelector('.gs-arrow-ripple');
    const rippleR = rightBtn.querySelector('.gs-arrow-ripple');
    const ripple = (el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'gsRipple 480ms ease-out';
    };
    leftBtn.addEventListener('click', () => { ripple(rippleL); _multiGo(-1); });
    rightBtn.addEventListener('click', () => { ripple(rippleR); _multiGo(+1); });
  }

  function _multiRender() {
    if (!_multiRoot) return;
    const games = _multiCurrentGames();
    const N = games.length;
    if (!N) { _multiRoot.style.visibility = 'hidden'; return; }
    _multiRoot.style.visibility = '';
    const idx = _getCurrentGraphIdx();
    const virtual = idx + _multiOffset;
    const i0 = Math.floor(virtual);
    const i1 = Math.ceil(virtual);
    const tFrac = virtual - i0;
    const wrap = (i) => ((i % N) + N) % N;
    const g0 = games[wrap(i0)];
    const g1 = games[wrap(i1)];
    const tint = hexLerp(g0.tint, g1.tint, tFrac);
    const ink  = hexLerp(g0.ink,  g1.ink,  tFrac);

    const bgEl = _multiRoot.querySelector('.gs-pill-bg');
    if (bgEl) {
      bgEl.style.background = `linear-gradient(180deg, ${tint}f5 0%, ${tint} 100%)`;
      bgEl.style.boxShadow = `
        0 1px 2px rgba(0,0,0,0.04),
        0 8px 24px ${ink}22,
        inset 0 1px 0 rgba(255,255,255,0.7),
        inset 0 -1px 0 ${ink}1a`;
    }
    _multiRoot.querySelectorAll('.gs-arrow').forEach(a => {
      a.style.color = ink;
      // Désactive visuellement les flèches quand il n'y a qu'1 graph
      const disabled = N <= 1;
      a.style.opacity = disabled ? '0.35' : '1';
      a.style.cursor  = disabled ? 'not-allowed' : 'pointer';
    });

    const layers = games.map((g, i) => {
      let d = i - virtual;
      if (d >  N / 2) d -= N;
      if (d < -N / 2) d += N;
      const absD = Math.abs(d);
      if (absD >= 1.2) return null;
      const fade = smoothstep(1 - absD);
      const motionPct = 55;
      const parallaxPx = 14;
      const textPx = Math.sin(absD * Math.PI) * parallaxPx * Math.sign(d || 1);
      return { g, i, fade, bgTx: d * motionPct, textTx: d * motionPct, textPx };
    }).filter(Boolean);

    const bgLayers = _multiRoot.querySelector('.gs-bg-layers');
    const txLayers = _multiRoot.querySelector('.gs-text-layers');
    if (bgLayers) {
      bgLayers.innerHTML = layers.map(l => `
        <div class="gs-bg-layer" style="background:${l.g.bg};opacity:${l.fade};transform:translate3d(${l.bgTx}%,0,0);"></div>
      `).join('');
    }
    if (txLayers) {
      txLayers.innerHTML = layers.map(l => `
        <div class="gs-text-layer" style="opacity:${l.fade};transform:translate3d(calc(${l.textTx}% + ${l.textPx}px),0,0);">
          <span class="gs-text" style="color:#fff;text-shadow:0 1px 0 rgba(0,0,0,0.4),0 0 8px rgba(0,0,0,0.6);">
            <span class="gs-text-count" style="opacity:0.85;">${l.i + 1} / ${N}</span>
            <span class="gs-text-sep" style="opacity:0.6;">—</span>
            <span class="gs-text-name">${escHtml(l.g.name)}</span>
          </span>
        </div>
      `).join('');
    }
  }

  function gameSelectorMultiInit() {
    const host = document.getElementById('gameSelectorMultiPill');
    if (!host) return;
    _multiMount(host);
    _multiRender();
  }
  function gameSelectorMultiRefresh() {
    _multiOffset = 0;
    _multiRender();
  }
  window.gameSelectorMultiInit    = gameSelectorMultiInit;
  window.gameSelectorMultiRefresh = gameSelectorMultiRefresh;

  // ── CSS injecté ──
  const css = `
.gs-pill-wrap {
  position: relative;
  width: ${PILL_WIDTH}px;
  height: ${PILL_HEIGHT + 4}px;
  max-width: 100%;
  display: flex;
  align-items: center;
  user-select: none;
  margin-bottom: 8px;
}
.gs-pill-bg {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  transition: box-shadow 280ms ease;
  will-change: background;
}
.gs-pill-clip {
  position: absolute;
  left: 4px; right: 4px; top: 2px; bottom: 2px;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
}
.gs-bg-layers, .gs-text-layers {
  position: absolute;
  inset: 0;
}
.gs-bg-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  will-change: opacity, transform;
}
.gs-pill-highlight {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 50%);
  pointer-events: none;
}
.gs-text-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  will-change: opacity, transform;
}
.gs-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.005em;
  white-space: nowrap;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 8px;
}
.gs-text-count { opacity: 0.7; font-variant-numeric: tabular-nums; font-weight: 500; }
.gs-text-sep   { opacity: 0.45; }
.gs-text-name  { font-weight: 700; }
.gs-arrow {
  position: absolute;
  width: ${ARROW_SIZE}px;
  height: ${ARROW_SIZE}px;
  border-radius: 50%;
  border: none;
  background: #ffffff;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.08);
  transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 120ms ease, color 280ms ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
  top: 50%;
  z-index: 2;
}
.gs-arrow-left  { left: 6px;  transform: translateY(-50%); }
.gs-arrow-right { right: 6px; transform: translateY(-50%); }
.gs-arrow:active {
  transform: translateY(-50%) scale(0.92);
  box-shadow: 0 1px 2px rgba(0,0,0,0.10), inset 0 1px 2px rgba(0,0,0,0.06);
}
.gs-arrow-ripple {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle at center, currentColor 0%, transparent 60%);
  opacity: 0;
}
@keyframes gsRipple {
  0%   { opacity: 0.4; transform: scale(0.3); }
  100% { opacity: 0;   transform: scale(1.4); }
}
`;
  const styleEl = document.createElement('style');
  styleEl.id = 'gameSelectorStyles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
})();
