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

  // ── 4 formes de nuages minimalistes ──
  // Aplat de couleur unique (pas de gradient). Chaque variante a un
  // viewBox normalisé à la largeur de référence et une hauteur/largeur
  // différente pour varier les silhouettes.
  //   shape 0 : standard (3 ellipses, format ~16:9)
  //   shape 1 : tall (cluster vertical, format carré)
  //   shape 2 : wide (sausage horizontale)
  //   shape 3 : tiny puff (2 ellipses, petit format compact)
  const CLOUD_SHAPES = [
    // [aspectRatio (h/w), svgContent]
    [0.55, `
      <ellipse cx="100" cy="110" rx="60"  ry="46"/>
      <ellipse cx="200" cy="92"  rx="80"  ry="62"/>
      <ellipse cx="160" cy="130" rx="120" ry="40"/>
    `],
    [0.85, `
      <ellipse cx="160" cy="90"  rx="65" ry="55"/>
      <ellipse cx="120" cy="140" rx="60" ry="50"/>
      <ellipse cx="200" cy="150" rx="70" ry="55"/>
      <ellipse cx="160" cy="200" rx="110" ry="42"/>
    `],
    [0.35, `
      <ellipse cx="80"  cy="60" rx="50" ry="38"/>
      <ellipse cx="180" cy="50" rx="60" ry="42"/>
      <ellipse cx="260" cy="62" rx="50" ry="36"/>
      <ellipse cx="160" cy="75" rx="150" ry="32"/>
    `],
    [0.65, `
      <ellipse cx="120" cy="110" rx="70" ry="60"/>
      <ellipse cx="200" cy="110" rx="80" ry="62"/>
    `],
  ];

  function buildCloudSvg(width, tone, shapeIdx) {
    const fill = tone === 'shadow' ? '#ece1f4' : '#ffffff';
    const idx  = ((shapeIdx | 0) % CLOUD_SHAPES.length + CLOUD_SHAPES.length) % CLOUD_SHAPES.length;
    const [aspect, paths] = CLOUD_SHAPES[idx];
    const viewH = Math.round(320 * aspect);
    return `<svg width="${width}" height="${width * aspect}" viewBox="0 0 320 ${viewH}" style="display:block;">
      <g fill="${fill}">${paths}</g>
    </svg>`;
  }

  // ── Mur de nuages dense (couvre tout le viewport) ──
  // x/y : position du centre du nuage en % du viewport
  // w   : taille du SVG en px (varie de 220 à 820 pour briser la régularité)
  // d   : délai d'apparition en secondes (échelonné pour un effet d'explosion)
  // s   : index de forme (0..3) — 4 silhouettes différentes (cf. CLOUD_SHAPES)
  // ~35 nuages : couverture totale du viewport sans laisser apparaître le
  // fond, avec un mix dense de tailles et de formes pour éviter la régularité.
  const FILLER_CLOUDS = [
    // ── Ceinture extérieure (déborde du viewport pour couvrir les bords)
    { x: -5,  y: -8,  w: 760, d: 0.00, s: 0 },
    { x: 30,  y: -10, w: 820, d: 0.04, s: 2 },
    { x: 60,  y: -8,  w: 800, d: 0.06, s: 2 },
    { x: 105, y: -5,  w: 760, d: 0.08, s: 0 },
    { x: -8,  y: 102, w: 780, d: 0.10, s: 0 },
    { x: 30,  y: 105, w: 820, d: 0.12, s: 2 },
    { x: 65,  y: 103, w: 800, d: 0.14, s: 2 },
    { x: 108, y: 100, w: 760, d: 0.16, s: 0 },
    // ── Médianes latérales : grands nuages tall pour murer les côtés
    { x: -10, y: 25,  w: 620, d: 0.18, s: 1 },
    { x: 110, y: 28,  w: 600, d: 0.20, s: 1 },
    { x: -10, y: 55,  w: 640, d: 0.22, s: 1 },
    { x: 110, y: 58,  w: 620, d: 0.24, s: 1 },
    { x: -8,  y: 85,  w: 580, d: 0.26, s: 1 },
    { x: 108, y: 88,  w: 600, d: 0.28, s: 1 },
    // ── Bandes intermédiaires (couvrent les zones entre les bords et le centre)
    { x: 18,  y: 18,  w: 540, d: 0.20, s: 0 },
    { x: 50,  y: 14,  w: 560, d: 0.22, s: 3 },
    { x: 82,  y: 18,  w: 540, d: 0.24, s: 0 },
    { x: 15,  y: 40,  w: 480, d: 0.26, s: 3 },
    { x: 85,  y: 42,  w: 500, d: 0.28, s: 3 },
    { x: 18,  y: 65,  w: 520, d: 0.30, s: 0 },
    { x: 82,  y: 68,  w: 540, d: 0.32, s: 0 },
    { x: 18,  y: 88,  w: 480, d: 0.34, s: 3 },
    { x: 50,  y: 92,  w: 560, d: 0.36, s: 2 },
    { x: 82,  y: 88,  w: 500, d: 0.38, s: 3 },
    // ── Zone centrale : couches successives pour empêcher toute transparence
    { x: 35,  y: 35,  w: 460, d: 0.30, s: 0 },
    { x: 65,  y: 38,  w: 480, d: 0.32, s: 3 },
    { x: 50,  y: 50,  w: 520, d: 0.40, s: 0 },
    { x: 30,  y: 60,  w: 440, d: 0.36, s: 3 },
    { x: 70,  y: 62,  w: 460, d: 0.38, s: 0 },
    { x: 45,  y: 72,  w: 420, d: 0.42, s: 3 },
    // ── Petits puffs aléatoires pour combler les rares trous résiduels
    { x: 25,  y: 8,   w: 280, d: 0.44, s: 3 },
    { x: 75,  y: 6,   w: 300, d: 0.44, s: 3 },
    { x: 8,   y: 50,  w: 260, d: 0.46, s: 3 },
    { x: 92,  y: 50,  w: 280, d: 0.46, s: 3 },
    { x: 60,  y: 82,  w: 320, d: 0.48, s: 3 },
  ];

  // ── Slots pseudo-aléatoires pour les cartes-jeux ──
  // Au lieu d'aligner les jeux sur un arc horizontal central, on les
  // disperse sur tout l'écran (avec marge des bords) selon des positions
  // choisies à la main qui paraissent "naturelles" / non-rectangulaires.
  // L'ordre est aussi réordonné par hash du nom du jeu pour que deux
  // imports différents donnent des dispositions différentes.
  const GAME_SLOTS = [
    { x: 22, y: 30 }, { x: 78, y: 22 }, { x: 50, y: 50 },
    { x: 15, y: 68 }, { x: 82, y: 72 }, { x: 50, y: 18 },
    { x: 30, y: 80 }, { x: 70, y: 45 }, { x: 42, y: 38 },
    { x: 62, y: 68 },
  ];
  function _hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

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
        ${FILLER_CLOUDS.map((c, i) => {
          // Vecteur depuis le centre de l'écran (50%, 50%) vers la position
          // finale, exprimé en vw/vh. À l'état initial le nuage est translaté
          // de (-dx, -dy) pour se retrouver au centre ; il "explose" ensuite
          // vers (0, 0) (sa position finale via left/top).
          const dx = (c.x - 50);
          const dy = (c.y - 50);
          return `
            <div class="cloud-filler-item" style="left:${c.x}%;top:${c.y}%;--delay:${c.d}s;--dx:${-dx}vw;--dy:${-dy}vh;">
              ${buildCloudSvg(c.w, i % 4 === 0 ? 'shadow' : 'light', c.s)}
            </div>`;
        }).join('')}
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
    // Disposition pseudo-aléatoire : on choisit un slot différent pour
    // chaque jeu en partant d'un offset basé sur le hash des noms (donc
    // stable d'un re-render à l'autre pour le même tournoi, mais varié
    // entre deux tournois différents).
    const slotOffset = _hashStr(games.map(g => g.name || '').join('|')) % GAME_SLOTS.length;
    layer.innerHTML = games.map((g, i) => {
      const slot   = GAME_SLOTS[(slotOffset + i) % GAME_SLOTS.length];
      // Léger jitter déterministe (±4%) pour casser l'alignement parfait
      // des slots prédéfinis sans risquer de chevauchement.
      const jitterX = ((_hashStr(g.name + '_x') % 80) - 40) / 10; // ±4%
      const jitterY = ((_hashStr(g.name + '_y') % 80) - 40) / 10;
      const xPct   = Math.max(10, Math.min(90, slot.x + jitterX));
      const yPct   = Math.max(12, Math.min(88, slot.y + jitterY));
      // Tailles variées (320-460px) pour casser l'uniformité.
      const size   = 320 + ((_hashStr(g.name + '_sz') % 140));
      const delay  = 0.4 + i * 0.10;
      const color  = g.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      const emoji  = g.emoji || DEFAULT_EMOJIS[i % DEFAULT_EMOJIS.length];
      const sub    = g.sub != null ? g.sub : '';
      const entrants = g.entrants != null ? g.entrants : '';
      const iconInner = g.imgUrl
        ? `<img src="${escHtml(g.imgUrl)}" alt="" loading="lazy" />`
        : `<span>${escHtml(emoji)}</span>`;
      // Vecteur depuis la position finale vers le centre (50%, 50%) en vw/vh
      // → utilisé par l'animation pour partir du centre et y revenir.
      const dx = -(xPct - 50);
      const dy = -(yPct - 50);
      return `
        <div class="cloud-item" style="left:${xPct}%;top:${yPct}%;--delay:${delay}s;--size:${size}px;--dx:${dx}vw;--dy:${dy}vh;">
          <div class="cloud-art">${buildCloudSvg(size, 'light', 0)}</div>
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
/* Sortie : le veil se rétracte vers le centre en même temps que les nuages
   sont aspirés (effet "trou noir" cohérent). */
.cloud-stage.stage-clouds-out  .cloud-veil { opacity: 0; transform: translate3d(0, 0, 0) scale(0.6); transform-origin: center center; transition-duration: 1.2s; }
@keyframes cloudVeilBob {
  from { transform: translate3d(0, -4px, 0) scale(1); }
  to   { transform: translate3d(0, 6px, 0)  scale(1.01); }
}

.cloud-stage .cloud-filler { position: absolute; inset: 0; z-index: 1; }
.cloud-stage .cloud-filler-item {
  position: absolute;
  /* État initial : translaté de (--dx, --dy) depuis sa position finale,
     ce qui revient à le placer au centre de l'écran (50%, 50%) quel que
     soit son left/top final. Il "explose" ensuite vers sa position via
     l'animation cloudFillerIn. */
  transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.2);
  opacity: 0;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.cloud-stage.stage-clouds-in .cloud-filler-item {
  /* fill-mode: both → applique la frame 0% pendant le delay (au lieu des
     styles statiques) ET garde la frame 100% après. Évite le clignotement
     entre les phases. */
  animation: cloudFillerIn 1.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-hold .cloud-filler-item {
  transform: translate3d(-50%, -50%, 0) scale(1);
  opacity: 1;
  animation: cloudFillerBob 6s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-out .cloud-filler-item {
  /* Easing "in" doux (lent au début, accélère vers la fin) → effet
     d'aspiration : le nuage hésite un instant puis fonce vers le centre.
     fill-mode: both → reste visible (frame 0%) pendant le delay au lieu
     de disparaître brutalement à cause des styles statiques. */
  animation: cloudFillerOut 1.3s cubic-bezier(0.55, 0, 0.4, 1) both;
  animation-delay: var(--delay);
}
/* Animations purement transform+opacity → 100% GPU. Le départ se fait
   depuis le centre de l'écran, les nuages s'éparpillent vers leurs
   positions finales (effet "explosion douce"), puis sont aspirés au
   centre pour disparaître (sortie en miroir de l'entrée). */
@keyframes cloudFillerIn {
  0%   { transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.2); opacity: 0; }
  60%  { opacity: 1; }
  100% { transform: translate3d(-50%, -50%, 0) scale(1); opacity: 1; }
}
@keyframes cloudFillerBob {
  from { transform: translate3d(-50%, -50%, 0) translateY(-4px) scale(1); }
  to   { transform: translate3d(-50%, -50%, 0) translateY(6px)  scale(1.015); }
}
@keyframes cloudFillerOut {
  0%   { transform: translate3d(-50%, -50%, 0) scale(1); opacity: 1; }
  40%  { opacity: 1; }
  100% { transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.12); opacity: 0; }
}

.cloud-stage .cloud-items-layer { position: absolute; inset: 0; z-index: 3; }
.cloud-stage .cloud-item {
  position: absolute;
  /* Mêmes principes que les filler : départ depuis le centre via (--dx, --dy)
     puis explosion vers la position finale. */
  transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.25);
  opacity: 0;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.cloud-stage.stage-clouds-in .cloud-item {
  animation: cloudItemIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-hold .cloud-item {
  transform: translate3d(-50%, -50%, 0) scale(1);
  opacity: 1;
  animation: cloudItemBob 4s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}
.cloud-stage.stage-clouds-out .cloud-item {
  /* fill-mode: both → la frame 0% (position finale visible) reste appliquée
     pendant l'animation-delay au lieu des styles de base invisibles.
     Sans ça : entre le changement de phase et le start réel de cloudItemOut
     (~0.4-0.9s plus tard à cause du delay décalé), le nuage disparaissait
     brièvement avant de réapparaître pour se faire aspirer. */
  animation: cloudItemOut 1.2s cubic-bezier(0.55, 0, 0.4, 1) both;
  animation-delay: var(--delay);
}
@keyframes cloudItemIn {
  0%   { transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.25); opacity: 0; }
  60%  { opacity: 1; }
  100% { transform: translate3d(-50%, -50%, 0) scale(1); opacity: 1; }
}
@keyframes cloudItemBob {
  from { transform: translate3d(-50%, -50%, 0) translateY(-6px) scale(1); }
  to   { transform: translate3d(-50%, -50%, 0) translateY(8px)  scale(1.02); }
}
@keyframes cloudItemOut {
  0%   { transform: translate3d(-50%, -50%, 0) scale(1); opacity: 1; }
  40%  { opacity: 1; }
  100% { transform: translate3d(calc(-50% + var(--dx, 0vw)), calc(-50% + var(--dy, 0vh)), 0) scale(0.15); opacity: 0; }
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
