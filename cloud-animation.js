// ============================================================
// CLOUD-ANIMATION.JS — Transition « nuages » entre la recherche
// start.gg et l'affichage du tournoi importé.
//
// Design : Claude Design "Cloud Search Animation" (esthétique
// douce lavande/dorée, lotus zen). Porté de React/JSX vers du
// JS vanilla + CSS injecté.
//
// API publique :
//   window.cloudAnimStart()              → enclenche clouds-in
//   window.cloudAnimSetGames(games)      → met à jour les cartes
//                                          (games: [{name, sub, entrants, color, emoji, imgUrl}])
//   window.cloudAnimEnd()                → enclenche clouds-out + cleanup
//
// Phases :
//   'clouds-in'   ~1.2s  → mur de nuages monte depuis le bas
//   'clouds-hold' tant que !cloudAnimEnd() (min 1.5s pour respirer)
//   'clouds-out'  ~1.3s  → mur dissipe vers le haut + fade
// ============================================================

(function() {
  // ── Palette par défaut pour cycler les couleurs des cartes-jeux
  const DEFAULT_COLORS = ['#e8a5a5', '#f0c87a', '#a8c4ea', '#c8a8e8', '#a8d8c4', '#f0a8c4', '#a8e8d4'];
  const DEFAULT_EMOJIS = ['⚔️', '🥊', '🐉', '🎸', '🔥', '🌸', '⚡', '💫'];

  // Garde-fou : ne pas double-lancer
  let _started = false;
  let _startTs = 0;
  let _holdMinUntil = 0;
  let _pendingEnd = false;
  const MIN_HOLD_MS = 1500;     // garde au moins 1.5s de "hold" pour laisser respirer
  const IN_PHASE_MS = 1300;
  const OUT_PHASE_MS = 1300;

  // ── Construction d'un SVG nuage minimaliste ──
  // Forme épurée : 3 ellipses plates, un seul aplat de couleur, sans
  // gradient — proche d'une icône weather minimaliste. Plus lisible et
  // moins lourd à rasteriser que les nuages vaporeux d'origine.
  function buildCloudSvg(width, tone) {
    const fill = tone === 'shadow' ? '#ece1f4' : '#ffffff';
    return `<svg width="${width}" height="${width * 0.55}" viewBox="0 0 320 176" style="display:block;">
      <g fill="${fill}">
        <ellipse cx="100" cy="110" rx="60" ry="46"/>
        <ellipse cx="200" cy="92"  rx="80" ry="62"/>
        <ellipse cx="160" cy="130" rx="120" ry="40"/>
      </g>
    </svg>`;
  }

  // ── Mur de nuages dense (couvre tout le viewport) ──
  // Coordonnées x/y en pourcentages, w en px (taille du SVG), d = delay s.
  // 12 nuages (vs 21 avant) + le veil CSS suffisent pour couvrir l'écran
  // sans saturer le GPU avec trop de SVG superposés.
  const FILLER_CLOUDS = [
    { x: 10, y: -8,  w: 620, d: 0.00 },
    { x: 50, y: -10, w: 660, d: 0.06 },
    { x: 90, y: -6,  w: 600, d: 0.12 },
    { x: 0,  y: 28,  w: 700, d: 0.04 },
    { x: 45, y: 24,  w: 720, d: 0.10 },
    { x: 95, y: 28,  w: 660, d: 0.16 },
    { x: 8,  y: 60,  w: 700, d: 0.08 },
    { x: 50, y: 64,  w: 740, d: 0.14 },
    { x: 92, y: 60,  w: 680, d: 0.20 },
    { x: 12, y: 95,  w: 640, d: 0.10 },
    { x: 50, y: 98,  w: 700, d: 0.16 },
    { x: 88, y: 95,  w: 640, d: 0.22 },
  ];

  // ── Création (lazy) du DOM de l'animation ──
  function ensureRoot() {
    let root = document.getElementById('cloudAnimRoot');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'cloudAnimRoot';
    root.className = 'cloud-stage';
    // Veil = wash blanc/lavande (radial-gradients qui ressemblent à des nuages)
    root.innerHTML = `
      <div class="cloud-veil"></div>
      <div class="cloud-filler">
        ${FILLER_CLOUDS.map((c, i) => `
          <div class="cloud-filler-item" style="left:${c.x}%;top:${c.y}%;--delay:${c.d}s;">
            ${buildCloudSvg(c.w, i % 3 === 0 ? 'shadow' : 'light')}
          </div>
        `).join('')}
      </div>
      <div class="cloud-items-layer"></div>
      <div class="cloud-particles">
        ${Array.from({ length: 14 }).map((_, i) => `
          <span class="particle" style="left:${5 + (i * 6.8) % 90}%;top:${12 + ((i * 17) % 74)}%;animation-delay:${(i * 0.18) % 2.4}s;"></span>
        `).join('')}
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
    })[c]);
  }

  // ── Rendu des cartes-jeux (sur les nuages avant) ──
  function renderGameCards(games) {
    const root = ensureRoot();
    const layer = root.querySelector('.cloud-items-layer');
    if (!layer) return;
    if (!games || !games.length) { layer.innerHTML = ''; return; }
    const total = games.length;
    layer.innerHTML = games.map((g, i) => {
      const t      = total > 1 ? i / (total - 1) : 0.5;
      const xPct   = 12 + t * 76;
      const arc    = Math.sin(t * Math.PI) * 14;
      const yPct   = 48 - arc;
      const size   = 360 + Math.sin(t * Math.PI) * 100;
      const delay  = 0.4 + i * 0.10;
      const color  = g.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      const emoji  = g.emoji || DEFAULT_EMOJIS[i % DEFAULT_EMOJIS.length];
      const sub    = g.sub != null ? g.sub : '';
      const entrants = g.entrants != null ? g.entrants : '';
      const iconInner = g.imgUrl
        ? `<img src="${escHtml(g.imgUrl)}" alt="" loading="lazy" />`
        : `<span>${escHtml(emoji)}</span>`;
      return `
        <div class="cloud-item" style="left:${xPct}%;top:${yPct}%;--delay:${delay}s;--size:${size}px;">
          <div class="cloud-art">${buildCloudSvg(size, 'light')}</div>
          <div class="cloud-content">
            <div class="game-emoji" style="background:${color}33;border-color:${color};">${iconInner}</div>
            <div class="game-name">${escHtml(g.name || '')}</div>
            <div class="game-sub">${escHtml(sub)}${sub && entrants ? ' · ' : ''}${escHtml(entrants)}</div>
          </div>
        </div>`;
    }).join('');
  }

  function setPhase(phase) {
    const root = ensureRoot();
    root.classList.remove('stage-clouds-in', 'stage-clouds-hold', 'stage-clouds-out');
    root.classList.add('stage-' + phase);
  }

  // ── API publique ──
  function cloudAnimStart(initialGames) {
    if (_started) return; // déjà en cours
    _started = true;
    _pendingEnd = false;
    _startTs = performance.now();
    _holdMinUntil = _startTs + IN_PHASE_MS + MIN_HOLD_MS;
    ensureRoot();
    renderGameCards(initialGames || []);
    // Petite frame pour que le CSS prenne en compte le mount avant l'animation
    requestAnimationFrame(() => {
      setPhase('clouds-in');
      // Après IN_PHASE_MS on bascule en hold (les nuages flottent)
      setTimeout(() => {
        if (!_started) return;
        setPhase('clouds-hold');
        if (_pendingEnd) _doEnd();
      }, IN_PHASE_MS);
    });
  }

  function cloudAnimSetGames(games) {
    if (!_started) return;
    renderGameCards(games);
  }

  function _doEnd() {
    setPhase('clouds-out');
    setTimeout(() => {
      const root = document.getElementById('cloudAnimRoot');
      if (root) root.remove();
      _started = false;
      _pendingEnd = false;
    }, OUT_PHASE_MS);
  }

  function cloudAnimEnd() {
    if (!_started) return;
    _pendingEnd = true;
    const now = performance.now();
    const wait = Math.max(0, _holdMinUntil - now);
    setTimeout(_doEnd, wait);
  }

  // Annulation immédiate (utile en cas d'erreur)
  function cloudAnimCancel() {
    if (!_started) return;
    const root = document.getElementById('cloudAnimRoot');
    if (root) root.remove();
    _started = false;
    _pendingEnd = false;
  }

  window.cloudAnimStart  = cloudAnimStart;
  window.cloudAnimSetGames = cloudAnimSetGames;
  window.cloudAnimEnd    = cloudAnimEnd;
  window.cloudAnimCancel = cloudAnimCancel;

  // ── Injection du CSS (porté du React design) ──
  // Optimisations vs le design d'origine :
  //  - `will-change: transform, opacity` sur les éléments animés → promotion
  //    en couche GPU dédiée, évite les repaints à chaque frame.
  //  - `transform: translate3d` au lieu de translate (force le composite GPU).
  //  - `filter: blur()` retiré des animations (CPU-bound, c'est la 1re cause
  //    de jank). Le blur de drop-shadow est conservé seulement sur les SVG
  //    statiques (pas animé).
  //  - `contain: layout style paint` pour isoler l'arbre du reste de la page.
  //  - Moins de filler clouds (12 vs 21) et de particules (14 vs 28).
  const css = `
.cloud-stage {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 999999;
  overflow: hidden;
  contain: layout style paint;
}
.cloud-stage .cloud-veil {
  position: absolute;
  inset: 0;
  /* Veil minimaliste : juste un aplat blanc cassé légèrement lavande,
     sans la couche dense de radial-gradients. Le rendu est plus net et
     les nuages SVG ressortent mieux contre ce fond uniforme. */
  background: #f7f1fb;
  opacity: 0;
  transform: translate3d(0, 40px, 0) scale(1.05);
  transform-origin: center bottom;
  transition: opacity 0.9s ease, transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
}
.cloud-stage.stage-clouds-in   .cloud-veil { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
.cloud-stage.stage-clouds-hold .cloud-veil { opacity: 1; transform: translate3d(0, 0, 0) scale(1); animation: cloudVeilBob 6s ease-in-out infinite alternate; }
.cloud-stage.stage-clouds-out  .cloud-veil { opacity: 0; transform: translate3d(0, -60px, 0) scale(1.1); transition-duration: 1.2s; }
@keyframes cloudVeilBob {
  from { transform: translate3d(0, -4px, 0) scale(1); }
  to   { transform: translate3d(0, 6px, 0)  scale(1.01); }
}

.cloud-stage .cloud-filler { position: absolute; inset: 0; z-index: 1; }
.cloud-stage .cloud-filler-item {
  position: absolute;
  transform: translate3d(-50%, -50%, 0) translateY(120px) scale(0.6);
  opacity: 0;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.cloud-stage.stage-clouds-in .cloud-filler-item {
  animation: cloudFillerIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-hold .cloud-filler-item {
  transform: translate3d(-50%, -50%, 0) translateY(0) scale(1);
  opacity: 1;
  animation: cloudFillerBob 6s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-out .cloud-filler-item {
  animation: cloudFillerOut 1.3s cubic-bezier(0.5, 0, 0.75, 0) forwards;
  animation-delay: var(--delay);
}
/* Animations purement transform+opacity → 100% GPU. Pas de blur animé.
   Le côté "vaporeux" des nuages vient déjà du veil (gradients) +
   drop-shadow statique sur l'art. */
@keyframes cloudFillerIn {
  0%   { transform: translate3d(-50%, -50%, 0) translateY(120px) scale(0.65); opacity: 0; }
  100% { transform: translate3d(-50%, -50%, 0) translateY(0)     scale(1);    opacity: 1; }
}
@keyframes cloudFillerBob {
  from { transform: translate3d(-50%, -50%, 0) translateY(-4px) scale(1); }
  to   { transform: translate3d(-50%, -50%, 0) translateY(6px)  scale(1.015); }
}
@keyframes cloudFillerOut {
  0%   { transform: translate3d(-50%, -50%, 0) translateY(0)      scale(1);   opacity: 1; }
  100% { transform: translate3d(-50%, -50%, 0) translateY(-140px) scale(1.4); opacity: 0; }
}

.cloud-stage .cloud-items-layer { position: absolute; inset: 0; z-index: 3; }
.cloud-stage .cloud-item {
  position: absolute;
  transform: translate3d(-50%, -50%, 0) translateY(180px) scale(0.35);
  opacity: 0;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.cloud-stage.stage-clouds-in .cloud-item {
  animation: cloudItemIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-hold .cloud-item {
  transform: translate3d(-50%, -50%, 0) translateY(0) scale(1);
  opacity: 1;
  animation: cloudItemBob 4s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-out .cloud-item {
  animation: cloudItemOut 1.2s cubic-bezier(0.5, 0, 0.75, 0) forwards;
  animation-delay: var(--delay);
}
@keyframes cloudItemIn {
  0%   { transform: translate3d(-50%, -50%, 0) translateY(180px) scale(0.4); opacity: 0; }
  100% { transform: translate3d(-50%, -50%, 0) translateY(0)     scale(1);   opacity: 1; }
}
@keyframes cloudItemBob {
  from { transform: translate3d(-50%, -50%, 0) translateY(-6px) scale(1); }
  to   { transform: translate3d(-50%, -50%, 0) translateY(8px)  scale(1.02); }
}
@keyframes cloudItemOut {
  0%   { transform: translate3d(-50%, -50%, 0) translateY(0)      scale(1);   opacity: 1; }
  100% { transform: translate3d(-50%, -50%, 0) translateY(-160px) scale(1.5); opacity: 0; }
}

/* Drop-shadow très léger et plus haut pour garder la lisibilité sans
   alourdir visuellement les formes plates. */
.cloud-stage .cloud-art { position: relative; filter: drop-shadow(0 4px 10px rgba(120, 90, 180, 0.10)); }
.cloud-stage .cloud-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14px 18px 30px;
  gap: 6px;
}
.cloud-stage .game-emoji {
  width: 56px; height: 56px;
  border-radius: 50%;
  border: 2px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  margin-bottom: 6px;
  background: #fff;
  box-shadow: 0 6px 14px -4px rgba(120, 90, 180, 0.2);
  overflow: hidden;
}
.cloud-stage .game-emoji img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
}
.cloud-stage .game-name {
  font-family: 'Fraunces', 'Manrope', 'Montserrat', serif;
  font-weight: 700;
  font-size: 18px;
  color: #4a3974;
  line-height: 1.15;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cloud-stage .game-sub {
  font-size: 12px;
  color: #9a8cb5;
  font-family: ui-monospace, "JetBrains Mono", monospace;
}

.cloud-stage .cloud-particles { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.cloud-stage .particle {
  position: absolute;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #e8c878;
  opacity: 0;
  box-shadow: 0 0 10px rgba(212, 167, 71, 0.7);
  will-change: transform, opacity;
}
.cloud-stage.stage-clouds-in .particle,
.cloud-stage.stage-clouds-hold .particle {
  animation: cloudParticleFloat 2.5s ease-in-out infinite;
}
@keyframes cloudParticleFloat {
  0%, 100% { opacity: 0;   transform: translate3d(0, 0, 0)     scale(0.5); }
  50%      { opacity: 0.8; transform: translate3d(0, -20px, 0) scale(1); }
}
`;
  const styleEl = document.createElement('style');
  styleEl.id = 'cloudAnimStyles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
})();
