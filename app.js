// Couleurs des cases (configurées via l'éditeur visuel)
const BLACK_COLORS  = ['#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe'];
const PURPLE_COLORS = ['#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff'];

// ============================================================
// APP.JS — Logique principale
// ============================================================

let currentGame = 'ssbu';
// Format graphique : 'lorem' (classique, layouts per-game) ou 'magna'
// (Magna Arena, fond rouge rayé + cartes sombres, multi-jeux adaptatif).
// Restauré depuis localStorage à l'init (cf. updateFormat / init bloc).
let currentFormat = 'lorem';
// Nombre de joueurs Magna (single mode). En multi mode, dérivé du nombre
// de standings retournés par l'event (ignoré).
let magnaPlayerCount = 8;
// players[i] = { name, charId, costume (1-8), startggId }
let players = Array.from({length:8}, () => ({name:'', team:'', charId:null, costume:1, charId2:null, costume2:1, startggId:null}));
let bgImg = null;
let currentSlotIndex = null;
let currentCharSlot = 1; // 1 = perso principal, 2 = perso secondaire (2XKO)

// ── CUSTOM SVG ICONS (pastel, multicolored outlines) ─────────────────────────
(function() {
  const S = { pu:'#7a5fc0', pk:'#e07ea0', co:'#e88f6b', mi:'#4fb37a', sk:'#5a8fc8', go:'#c9a14a', pl:'#5a3f8c' };
  const F = { pu:'#e9def7', pk:'#fde0ea', co:'#ffe1cf', mi:'#dcf3e3', sk:'#dceaf8', go:'#fbecc4', cr:'#fbeaf2', li:'#f1e7fb', wh:'#ffffff' };
  const lp = `fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  const sp = (x,y,s,c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"><path d="M0 -5 L0 5 M-5 0 L5 0"/></g>`;
  const wrap = body => `<svg viewBox="0 0 120 120" width="100%" height="100%">${body}</svg>`;

  window._iconSvgs = {
    import: wrap(`
      <path d="M60 26 L60 58" stroke="${S.mi}" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round" fill="none"/>
      <circle cx="60" cy="42" r="14" fill="${F.mi}" stroke="${S.mi}" ${lp}/>
      <path d="M52 38 Q56 34 62 35" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M30 64 Q60 86 90 64" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
      <path d="M30 64 L90 64" stroke="${S.pk}" ${lp}/>
      <path d="M52 70 L60 78 L68 70" stroke="${S.co}" ${lp}/>
      ${sp(26,30,0.7,S.pk)}${sp(96,36,0.6,S.go)}${sp(94,88,0.6,S.sk)}
    `),
    settings: wrap(`
      <path d="M60 28 L66 32 L74 30 L77 38 L84 41 L82 49 L88 56 L82 63 L84 71 L77 74 L74 82 L66 80 L60 84 L54 80 L46 82 L43 74 L36 71 L38 63 L32 56 L38 49 L36 41 L43 38 L46 30 L54 32 Z" fill="${F.li}" stroke="${S.pu}" ${lp}/>
      <circle cx="60" cy="56" r="13" fill="${F.wh}" stroke="${S.pk}" ${lp}/>
      <path d="M64 50 a 8 8 0 1 0 0 12 a 6 6 0 1 1 0 -12" fill="${F.go}" stroke="${S.go}" ${lp}/>
      ${sp(28,30,0.6,S.mi)}${sp(92,32,0.6,S.co)}${sp(36,94,0.5,S.sk)}
    `),
    background: wrap(`
      <rect x="22" y="26" width="76" height="64" rx="8" fill="${F.cr}" stroke="${S.go}" ${lp}/>
      <rect x="28" y="32" width="64" height="52" rx="4" fill="${F.sk}" stroke="${S.sk}" ${lp}/>
      <circle cx="76" cy="46" r="7" fill="${F.co}" stroke="${S.co}" ${lp}/>
      <path d="M28 78 L46 54 L64 72 L80 60 L92 76 L92 84 L28 84 Z" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
      <path d="M28 84 L42 66 L58 82 L72 70 L92 84 Z" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      ${sp(20,20,0.6,S.mi)}${sp(102,98,0.6,S.go)}
    `),
    players: wrap(`
      <circle cx="74" cy="46" r="11" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <path d="M54 92 Q 54 70 74 70 Q 94 70 94 92" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <circle cx="46" cy="50" r="13" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
      <path d="M24 96 Q 24 72 46 72 Q 68 72 68 96" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
      <path d="M38 34 L42 38 L46 30 L50 38 L54 34 L52 42 L40 42 Z" fill="${F.go}" stroke="${S.go}" ${lp}/>
      ${sp(90,32,0.6,S.mi)}${sp(26,32,0.5,S.co)}${sp(100,70,0.5,S.sk)}
    `),
    layouts: wrap(`
      <rect x="22" y="22" width="76" height="76" rx="10" fill="${F.cr}" stroke="${S.go}" ${lp}/>
      <rect x="32" y="32" width="24" height="24" rx="4" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <rect x="64" y="32" width="24" height="24" rx="4" fill="${F.mi}" stroke="${S.mi}" ${lp}/>
      <rect x="32" y="64" width="24" height="24" rx="4" fill="${F.sk}" stroke="${S.sk}" ${lp}/>
      <rect x="64" y="64" width="24" height="24" rx="4" fill="${F.co}" stroke="${S.co}" ${lp}/>
      ${sp(104,104,0.6,S.pu)}${sp(16,16,0.5,S.pu)}
    `),
    url: wrap(`
      <g transform="rotate(-25 60 60)">
        <rect x="20" y="48" rx="13" width="44" height="26" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
        <rect x="56" y="48" rx="13" width="44" height="26" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      </g>
      ${sp(28,30,0.6,S.mi)}${sp(94,86,0.6,S.go)}${sp(92,28,0.5,S.sk)}
    `),
    quill: wrap(`
      <path d="M88 22 Q 36 30 30 80 L 44 80 Q 50 50 88 32 Z" fill="${F.li}" stroke="${S.pu}" ${lp}/>
      <path d="M78 32 Q 60 40 50 70" stroke="${S.pk}" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M70 30 Q 56 40 46 64" stroke="${S.co}" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M88 22 L 32 96" stroke="${S.pl}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M38 86 L 30 96 L 42 90 Z" fill="${F.go}" stroke="${S.go}" ${lp}/>
      <path d="M82 92 Q 76 100 82 106 Q 88 100 82 92 Z" fill="${F.sk}" stroke="${S.sk}" ${lp}/>
      ${sp(28,30,0.6,S.mi)}${sp(100,56,0.5,S.go)}
    `),
    clock: wrap(`
      <rect x="56" y="20" width="8" height="6" rx="2" fill="${F.go}" stroke="${S.go}" ${lp}/>
      <circle cx="60" cy="18" r="3" fill="${F.go}" stroke="${S.go}" ${lp}/>
      <circle cx="60" cy="62" r="32" fill="${F.cr}" stroke="${S.go}" ${lp}/>
      <circle cx="60" cy="62" r="26" fill="${F.wh}" stroke="${S.pk}" ${lp}/>
      <line x1="60" y1="40" x2="60" y2="44" stroke="${S.pu}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="78" y1="62" x2="74" y2="62" stroke="${S.pu}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="60" y1="84" x2="60" y2="80" stroke="${S.pu}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="42" y1="62" x2="46" y2="62" stroke="${S.pu}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="60" y1="62" x2="48" y2="52" stroke="${S.pl}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="60" y1="62" x2="72" y2="54" stroke="${S.co}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="62" r="2.5" fill="${S.pl}" stroke="${S.pl}" stroke-width="2.2"/>
      ${sp(26,56,0.6,S.mi)}${sp(98,92,0.5,S.sk)}
    `),
    bot: wrap(`
      <line x1="60" y1="22" x2="60" y2="34" stroke="${S.pu}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="20" r="4" fill="${F.go}" stroke="${S.go}" ${lp}/>
      <rect x="32" y="34" width="56" height="48" rx="14" fill="${F.pu}" stroke="${S.pu}" ${lp}/>
      <rect x="40" y="44" width="40" height="26" rx="8" fill="${F.cr}" stroke="${S.go}" ${lp}/>
      <circle cx="50" cy="57" r="3.5" fill="${F.mi}" stroke="${S.mi}" ${lp}/>
      <circle cx="70" cy="57" r="3.5" fill="${F.mi}" stroke="${S.mi}" ${lp}/>
      <path d="M54 64 Q 60 67 66 64" stroke="${S.co}" fill="none" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="32" cy="58" r="5" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <circle cx="88" cy="58" r="5" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <rect x="44" y="82" width="32" height="14" rx="6" fill="${F.sk}" stroke="${S.sk}" ${lp}/>
      ${sp(24,30,0.5,S.mi)}${sp(98,32,0.5,S.co)}
    `),
    questions: wrap(`
      <circle cx="60" cy="60" r="30" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <ellipse cx="50" cy="48" rx="10" ry="6" fill="${F.wh}" stroke="none"/>
      <path d="M50 50 Q 50 38 60 38 Q 70 38 70 48 Q 70 56 60 60 L 60 68" stroke="${S.pl}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="78" r="3" fill="${S.pl}" stroke="${S.pl}" stroke-width="2.2"/>
      ${sp(26,30,0.6,S.mi)}${sp(98,42,0.5,S.go)}${sp(94,94,0.5,S.sk)}${sp(28,92,0.5,S.co)}
    `),
    calendar: wrap(`
      <line x1="42" y1="22" x2="42" y2="36" stroke="${S.go}" stroke-width="3" stroke-linecap="round"/>
      <line x1="78" y1="22" x2="78" y2="36" stroke="${S.go}" stroke-width="3" stroke-linecap="round"/>
      <rect x="24" y="32" width="72" height="62" rx="8" fill="${F.wh}" stroke="${S.sk}" ${lp}/>
      <rect x="24" y="32" width="72" height="14" rx="8" fill="${F.sk}" stroke="${S.sk}" ${lp}/>
      <line x1="24" y1="46" x2="96" y2="46" stroke="${S.sk}" stroke-width="2.2"/>
      ${[0,1,2,3,4].map(c=>[0,1,2].map(r=>`<circle cx="${36+c*12}" cy="${58+r*12}" r="2" fill="${c===2&&r===1?F.co:F.li}" stroke="${c===2&&r===1?S.co:S.pu}" stroke-width="2.2"/>`).join('')).join('')}
      ${sp(20,22,0.5,S.mi)}${sp(104,94,0.5,S.pk)}
    `),
    actions: wrap(`
      <path d="M30 60 Q 14 52 10 70 Q 22 72 38 68" fill="${F.li}" stroke="${S.pu}" ${lp}/>
      <path d="M90 60 Q 106 52 110 70 Q 98 72 82 68" fill="${F.li}" stroke="${S.pu}" ${lp}/>
      <rect x="32" y="50" width="56" height="38" rx="4" fill="${F.cr}" stroke="${S.go}" ${lp}/>
      <path d="M32 52 L60 72 L88 52" stroke="${S.co}" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="78" r="6" fill="${F.pk}" stroke="${S.pk}" ${lp}/>
      <path d="M58 76 L60 80 L62 76" stroke="${S.pl}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${sp(60,30,0.7,S.mi)}${sp(26,32,0.5,S.go)}${sp(92,32,0.5,S.sk)}
    `),
  };
})();

// ── TAROT CAROUSEL ────────────────────────────────────────────────────────────
// Slide "Fond" retirée (le fond est éditable via l'éditeur / le layout
// custom). Renumérotation : Joueurs passe en III, Layouts en IV.
const TC_PANELS = [
  { label: 'Import',   roman: 'I',   accent: '#7c5cff', emoji: '🟢', name: 'Import start.gg',       icon: 'import' },
  { label: 'Réglages', roman: 'II',  accent: '#f0a020', emoji: '⚙️', name: 'Paramètres',            icon: 'settings' },
  { label: 'Joueurs',  roman: 'III', accent: '#46d18f', emoji: '👥', name: 'Joueurs & Personnages', icon: 'players' },
  { label: 'Layouts',  roman: 'IV',  accent: '#9a7aff', emoji: '🎨', name: 'Layouts Custom',        icon: 'layouts' },
];

let _tcActive = 0;
let _tcLocked = false;
// backward-compat alias
Object.defineProperty(window, '_leftPanelIdx', { get: () => _tcActive, set: v => { _tcActive = v; } });

function _tcSymHTML(idx, size, stroke) {
  const fns = [
    (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><circle cx="50" cy="50" r="44" stroke-opacity="0.25" stroke-dasharray="2 4"/><path d="M38 42 Q 28 42 28 52 Q 28 62 38 62 L 46 62"/><path d="M62 38 Q 72 38 72 48 Q 72 58 62 58 L 54 58"/><path d="M40 50 L 60 50"/></svg>`,
    (s, c) => { const r=[...Array(8)].map((_,i)=>{const a=(i*45)*Math.PI/180,x1=50+Math.cos(a)*24,y1=50+Math.sin(a)*24,x2=50+Math.cos(a)*32,y2=50+Math.sin(a)*32;return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;}).join(''); return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><circle cx="50" cy="50" r="44" stroke-opacity="0.25" stroke-dasharray="2 4"/>${r}<circle cx="50" cy="50" r="18"/><circle cx="50" cy="50" r="6" fill="${c}" stroke="none"/></svg>`; },
    (s, c) => { const r=[...Array(12)].map((_,i)=>{const a=(i*30)*Math.PI/180,r2=i%2===0?32:28,x1=50+Math.cos(a)*22,y1=50+Math.sin(a)*22,x2=50+Math.cos(a)*r2,y2=50+Math.sin(a)*r2;return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;}).join(''); return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><circle cx="50" cy="50" r="44" stroke-opacity="0.25" stroke-dasharray="2 4"/><circle cx="50" cy="50" r="14"/>${r}</svg>`; },
    (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><circle cx="50" cy="50" r="44" stroke-opacity="0.25" stroke-dasharray="2 4"/><circle cx="38" cy="40" r="7"/><path d="M28 62 Q 28 50 38 50 Q 48 50 48 62"/><circle cx="62" cy="40" r="7"/><path d="M52 62 Q 52 50 62 50 Q 72 50 72 62"/><path d="M44 70 L 56 70" stroke-opacity="0.5"/></svg>`,
    (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="44" stroke-opacity="0.25" stroke-dasharray="2 4"/><path d="M62 30 A 22 22 0 1 0 62 70 A 16 16 0 1 1 62 30 Z"/><circle cx="36" cy="36" r="1.5" fill="${c}"/><circle cx="32" cy="48" r="1" fill="${c}"/><circle cx="40" cy="60" r="1.2" fill="${c}"/></svg>`,
  ];
  return fns[idx](size, stroke);
}

function _tcDiamond() {
  return `<svg width="5" height="5" viewBox="0 0 10 10"><path d="M5 0 L 10 5 L 5 10 L 0 5 Z" fill="#d4b66a"/></svg>`;
}

function _tcCornersHTML(idx) {
  const p = TC_PANELS[idx];
  const r = p.roman;
  const d = _tcDiamond();
  return ['tl','tr','bl','br'].map(pos =>
    `<div class="tc-corner tc-corner-${pos}" style="color:${p.accent}">
      <span class="tc-corner-roman">${r}</span>${d}
    </div>`
  ).join('');
}

function _tcSetSlide(idx, visible) {
  const el = document.getElementById(`leftSlide${idx}`);
  if (!el) return;
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}

function _tcUpdateCornersOn(cardEl, idx) {
  cardEl.querySelectorAll('.tc-corner').forEach(c => c.remove());
  cardEl.insertAdjacentHTML('afterbegin', _tcCornersHTML(idx));
}

function _tcUpdateSigil(idx, animate) {
  const p = TC_PANELS[idx];
  const icon = document.getElementById('tcSigilIcon');
  const title = document.getElementById('tcSigilTitle');
  if (icon) {
    icon.className = animate ? 'tc-sigil-icon animating' : 'tc-sigil-icon';
    icon.innerHTML = '<div style="width:50px;height:50px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
    if (animate) { void icon.offsetWidth; }
  }
  if (title) {
    title.className = animate ? 'tc-sigil-title animating' : 'tc-sigil-title';
    title.textContent = p.name;
    if (animate) { void title.offsetWidth; }
  }
}

function _tcUpdateTabs(idx) {
  document.querySelectorAll('#tcTabs .tc-tab-btn').forEach((btn, i) => {
    const p = TC_PANELS[i];
    const active = i === idx;
    btn.classList.toggle('active', active);
    btn.style.borderColor = active ? p.accent : 'transparent';
    btn.style.boxShadow = active ? `0 2px 8px ${p.accent}33` : 'none';
    btn.innerHTML = '<div style="width:28px;height:28px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
  });
}

function _tcUpdateArrows() {
  const prev = document.getElementById('tcPrev');
  const next = document.getElementById('tcNext');
  if (prev) prev.disabled = _tcActive === 0;
  if (next) next.disabled = _tcActive === TC_PANELS.length - 1;
}

// Avant qu'un tournoi soit importé, on cache toutes les options sauf
// "Import start.gg". L'utilisateur ne voit que le panneau d'import au
// premier accès, puis l'éventail complet s'ouvre une fois qu'il y a
// des données à éditer.
function _tcHasAnyImport() {
  return (typeof players !== 'undefined' && Array.isArray(players)
          && players.some(p => p && p.name))
      || (typeof graphs !== 'undefined' && Array.isArray(graphs) && graphs.length > 0);
}

function _tcRenderTabs() {
  const tabs = document.getElementById('tcTabs');
  if (!tabs) return;
  const hasImport = _tcHasAnyImport();
  tabs.innerHTML = TC_PANELS.map((p, i) => {
    const isActive = i === _tcActive;
    const hidden   = !hasImport && i !== 0;
    const hideCss  = hidden ? 'display:none;' : '';
    const accent   = isActive ? `border-color:${p.accent};box-shadow:0 2px 8px ${p.accent}33;` : '';
    return `<button class="tc-tab-btn${isActive?' active':''}" data-idx="${i}" onclick="tcGo(${i})" title="${p.name}"
        style="${hideCss}${accent}"><div style="width:28px;height:28px">${_iconSvgs[p.icon]||p.emoji}</div></button>`;
  }).join('');
  // Les flèches prev/next n'ont aucun sens tant qu'on n'a qu'un seul panneau
  const prev = document.getElementById('tcPrev');
  const next = document.getElementById('tcNext');
  if (prev) prev.style.display = hasImport ? '' : 'none';
  if (next) next.style.display = hasImport ? '' : 'none';
}

function tcInit() {
  _tcRenderTabs();
  const mainCard = document.getElementById('tcMainCard');
  if (mainCard) _tcUpdateCornersOn(mainCard, 0);
  const inFace = document.querySelector('#tcIncoming .tc-in-face');
  if (inFace) _tcUpdateCornersOn(inFace, 0);
  _tcUpdateSigil(0, false);
  _tcSetSlide(0, true);
  _tcUpdateArrows();
}

function tcGo(target) {
  if (_tcLocked || target === _tcActive || target < 0 || target >= TC_PANELS.length) return;
  const dir = target > _tcActive ? 'right' : 'left';
  _tcLocked = true;

  // Populate incoming face with target slide content clone
  const srcSlide = document.getElementById(`leftSlide${target}`);
  const inContent = document.getElementById('tcInContent');
  if (inContent && srcSlide) inContent.innerHTML = srcSlide.innerHTML;

  // Update incoming face corners
  const inFace = document.querySelector('#tcIncoming .tc-in-face');
  if (inFace) _tcUpdateCornersOn(inFace, target);

  // Run animation
  const incoming = document.getElementById('tcIncoming');
  if (incoming) {
    // Important : garder la classe de base "tc-incoming" pendant le reflow
    // pour conserver position:absolute + inset:0. Si on la retire (className = ''),
    // la carte apparaît brièvement comme un block par défaut → clignotement.
    incoming.style.display = 'block';
    incoming.className = 'tc-incoming';
    void incoming.offsetWidth;
    incoming.className = `tc-incoming from-${dir}`;
  }

  // Update sigil + tabs immediately
  _tcUpdateSigil(target, true);
  _tcUpdateTabs(target);

  // ─── Swap des vraies slides au mi-temps de l'animation (290ms) ───
  // À ce moment, le dos de la carte couvre toute la zone des slides → on peut
  // swapper sans que ce soit visible. Comme `.left-slide` a une transition
  // opacity 0.2s, ça laisse 290ms pour que la transition termine AVANT que la
  // carte se cache à 580ms. Si on swappait à 580ms (comme avant), la carte
  // disparaissait pendant que les slides étaient encore en train de fader →
  // clignotement de l'ancien slide.
  setTimeout(() => {
    _tcSetSlide(_tcActive, false);
    _tcSetSlide(target, true);
    const mainCard = document.getElementById('tcMainCard');
    if (mainCard) _tcUpdateCornersOn(mainCard, target);
  }, 290);

  setTimeout(() => {
    // Hide incoming (les slides ont déjà fini leur transition de 200ms)
    if (incoming) { incoming.style.display = 'none'; incoming.className = 'tc-incoming'; }

    _tcActive = target;
    _tcUpdateArrows();
    _tcLocked = false;
  }, 580);
}

function tcNavigate(delta) { tcGo(_tcActive + delta); }

// ────────────────────────────────────────────────────────────────────────────
// COLLAPSE PANNEAU GAUCHE — système partagé entre tous les onglets
// Un bouton .page-collapse-btn placé dans n'importe quel container avec
// l'attribut data-collapsable-page permet de masquer la colonne gauche
// (.X-left, .panel-left, etc.) via une classe `.left-collapsed` sur le
// container. L'état est persisté en localStorage par tab.
//
// Migration v2 : reset une seule fois les anciennes valeurs persistées
// pour assurer que les utilisateurs voient le panneau gauche par défaut.
const __COLLAPSE_VERSION = 2;
(function migrateCollapseV2() {
  try {
    const ver = parseInt(localStorage.getItem('collapse_reset_ver') || '0', 10);
    if (ver < __COLLAPSE_VERSION) {
      // Reset tous les flags de collapse (ancien et nouveaux)
      ['hr_left_collapsed', 'top8_left_collapsed', 'dc_left_collapsed', 'sgg_left_collapsed']
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem('collapse_reset_ver', String(__COLLAPSE_VERSION));
    }
  } catch {}
})();

function togglePageLeftPanelFromBtn(btn) {
  const page = btn?.closest('[data-collapsable-page]');
  if (!page) return;
  const key = btn.dataset.collapseKey || 'left_collapsed';
  page.classList.toggle('left-collapsed');
  const collapsed = page.classList.contains('left-collapsed');
  btn.textContent = collapsed ? '›' : '‹';
  btn.setAttribute('aria-label', collapsed ? 'Afficher le panneau gauche' : 'Masquer le panneau gauche');
  try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch {}
}

// No-op : on ne restaure plus l'état collapsed au chargement. Décision UX :
// le panneau gauche doit toujours être visible au démarrage (pas caché par
// surprise). Le toggle reste fonctionnel dans la session courante.
function restorePageLeftPanel(_pageEl, _storageKey) {
  // intentionnellement vide
}

// backward-compat — keep old names working (used elsewhere in the codebase)
function setLeftPanel(idx) {
  if (idx === _tcActive) return;
  _tcSetSlide(_tcActive, false);
  _tcSetSlide(idx, true);
  const mainCard = document.getElementById('tcMainCard');
  if (mainCard) _tcUpdateCornersOn(mainCard, idx);
  _tcUpdateSigil(idx, false);
  _tcUpdateTabs(idx);
  _tcActive = idx;
  _tcUpdateArrows();
}
function prevLeftPanel() { tcGo(_tcActive - 1); }
function nextLeftPanel() { tcGo(_tcActive + 1); }

// ── TAROT CAROUSEL — DISCORD (dcTc*) ──────────────────────────────────────────
// Même mécanique que le carousel Top8, mais pour le panneau dc-left.
// IDs: dcTcPrev, dcTcNext, dcTcTabs, dcTcSigilIcon, dcTcSigilTitle,
//      dcTcMainCard, dcTcIncoming, dcTcInContent, dcSlide{0-3}

const DC_TC_PANELS = [
  { label: 'URL',      roman: 'I',   accent: '#7c5cff', emoji: '🔗', name: 'URL start.gg', icon: 'url' },
  { label: 'Réglages', roman: 'II',  accent: '#f0a020', emoji: '⚙️', name: 'Réglages',     icon: 'quill' },
  { label: 'Horaires', roman: 'III', accent: '#e85a8a', emoji: '🕐', name: 'Horaires',     icon: 'clock' },
  { label: 'Bot',      roman: 'IV',  accent: '#46d18f', emoji: '🤖', name: 'Bot Discord',  icon: 'bot' },
];

let _dcTcActive = 0;
let _dcTcLocked = false;

function _dcTcSetSlide(idx, visible) {
  const el = document.getElementById(`dcSlide${idx}`);
  if (!el) return;
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}

function _dcTcUpdateCornersOn(cardEl, idx) {
  const p = DC_TC_PANELS[idx];
  cardEl.querySelectorAll('.tc-corner').forEach(c => c.remove());
  const d = _tcDiamond();
  cardEl.insertAdjacentHTML('afterbegin',
    ['tl','tr','bl','br'].map(pos =>
      `<div class="tc-corner tc-corner-${pos}" style="color:${p.accent}">
        <span class="tc-corner-roman">${p.roman}</span>${d}
      </div>`
    ).join('')
  );
}

function _dcTcUpdateSigil(idx, animate) {
  const p = DC_TC_PANELS[idx];
  const icon  = document.getElementById('dcTcSigilIcon');
  const title = document.getElementById('dcTcSigilTitle');
  if (icon) {
    icon.className = animate ? 'tc-sigil-icon animating' : 'tc-sigil-icon';
    icon.innerHTML = '<div style="width:50px;height:50px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
    if (animate) { void icon.offsetWidth; }
  }
  if (title) {
    title.className = animate ? 'tc-sigil-title animating' : 'tc-sigil-title';
    title.textContent = p.name;
    if (animate) { void title.offsetWidth; }
  }
}

function _dcTcUpdateTabs(idx) {
  document.querySelectorAll('#dcTcTabs .tc-tab-btn').forEach((btn, i) => {
    const p = DC_TC_PANELS[i];
    const active = i === idx;
    btn.classList.toggle('active', active);
    btn.style.borderColor = active ? p.accent : 'transparent';
    btn.style.boxShadow = active ? `0 2px 8px ${p.accent}33` : 'none';
    btn.innerHTML = '<div style="width:28px;height:28px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
  });
}

function _dcTcUpdateArrows() {
  const prev = document.getElementById('dcTcPrev');
  const next = document.getElementById('dcTcNext');
  if (prev) prev.disabled = _dcTcActive === 0;
  if (next) next.disabled = _dcTcActive === DC_TC_PANELS.length - 1;
}

function dcTcInit() {
  const tabs = document.getElementById('dcTcTabs');
  if (tabs) {
    tabs.innerHTML = DC_TC_PANELS.map((p, i) =>
      `<button class="tc-tab-btn${i===0?' active':''}" data-idx="${i}" onclick="dcTcGo(${i})" title="${p.name}"
        style="${i===0?`border-color:${p.accent};box-shadow:0 2px 8px ${p.accent}33`:''}"><div style="width:28px;height:28px">${_iconSvgs[p.icon]||p.emoji}</div></button>`
    ).join('');
  }
  const mainCard = document.getElementById('dcTcMainCard');
  if (mainCard) _dcTcUpdateCornersOn(mainCard, 0);
  const inFace = document.querySelector('#dcTcIncoming .tc-in-face');
  if (inFace) _dcTcUpdateCornersOn(inFace, 0);
  _dcTcUpdateSigil(0, false);
  _dcTcSetSlide(0, true);
  _dcTcUpdateArrows();
}

function dcTcGo(target) {
  if (_dcTcLocked || target === _dcTcActive || target < 0 || target >= DC_TC_PANELS.length) return;
  const dir = target > _dcTcActive ? 'right' : 'left';
  _dcTcLocked = true;

  // Peupler la face entrante avec le contenu de la slide cible
  const srcSlide  = document.getElementById(`dcSlide${target}`);
  const inContent = document.getElementById('dcTcInContent');
  if (inContent && srcSlide) inContent.innerHTML = srcSlide.innerHTML;

  // Coins de la face entrante
  const inFace = document.querySelector('#dcTcIncoming .tc-in-face');
  if (inFace) _dcTcUpdateCornersOn(inFace, target);

  // Lancer l'animation
  const incoming = document.getElementById('dcTcIncoming');
  if (incoming) {
    // Important : garder la classe de base "tc-incoming" pendant le reflow
    // pour conserver position:absolute + inset:0. Si on la retire (className = ''),
    // la carte apparaît brièvement comme un block par défaut → clignotement.
    incoming.style.display = 'block';
    incoming.className = 'tc-incoming';
    void incoming.offsetWidth;
    incoming.className = `tc-incoming from-${dir}`;
  }

  // Mettre à jour sigil + tabs immédiatement
  _dcTcUpdateSigil(target, true);
  _dcTcUpdateTabs(target);

  // Swap des slides à mi-animation (290ms) : la carte couvre tout, donc invisible.
  // Les slides ont 290ms pour finir leur transition opacity avant que la carte se cache.
  setTimeout(() => {
    _dcTcSetSlide(_dcTcActive, false);
    _dcTcSetSlide(target, true);
    const mainCard = document.getElementById('dcTcMainCard');
    if (mainCard) _dcTcUpdateCornersOn(mainCard, target);
  }, 290);

  setTimeout(() => {
    if (incoming) { incoming.style.display = 'none'; incoming.className = 'tc-incoming'; }
    _dcTcActive = target;
    _dcTcUpdateArrows();
    _dcTcLocked = false;
  }, 580);
}

function dcTcNavigate(delta) { dcTcGo(_dcTcActive + delta); }

// ── TAROT CAROUSEL — HORAIRES (hrTc*) ─────────────────────────────────────────
// Même mécanique, panneau hr-left.
// IDs: hrTcPrev, hrTcNext, hrTcTabs, hrTcSigilIcon, hrTcSigilTitle,
//      hrTcMainCard, hrTcIncoming, hrTcInContent, hrSlide{0-3}

// Questions retiré (vit dans la colonne droite). Programme hebdo fusionné
// dans Bot Discord (un seul slide pour tout le setup d'envoi). Reste 2 slides.
const HR_TC_PANELS = [
  { label: 'Bot',     roman: 'I',  accent: '#46d18f', emoji: '🤖', name: 'Bot Discord', icon: 'bot' },
  { label: 'Actions', roman: 'II', accent: '#e85a8a', emoji: '📨', name: 'Actions',     icon: 'actions' },
];

let _hrTcActive = 0;
let _hrTcLocked = false;

function _hrTcSetSlide(idx, visible) {
  const el = document.getElementById(`hrSlide${idx}`);
  if (!el) return;
  el.style.opacity = visible ? '1' : '0';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}

function _hrTcUpdateCornersOn(cardEl, idx) {
  const p = HR_TC_PANELS[idx];
  cardEl.querySelectorAll('.tc-corner').forEach(c => c.remove());
  const d = _tcDiamond();
  cardEl.insertAdjacentHTML('afterbegin',
    ['tl','tr','bl','br'].map(pos =>
      `<div class="tc-corner tc-corner-${pos}" style="color:${p.accent}">
        <span class="tc-corner-roman">${p.roman}</span>${d}
      </div>`
    ).join('')
  );
}

function _hrTcUpdateSigil(idx, animate) {
  const p = HR_TC_PANELS[idx];
  const icon  = document.getElementById('hrTcSigilIcon');
  const title = document.getElementById('hrTcSigilTitle');
  if (icon) {
    icon.className = animate ? 'tc-sigil-icon animating' : 'tc-sigil-icon';
    icon.innerHTML = '<div style="width:50px;height:50px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
    if (animate) { void icon.offsetWidth; }
  }
  if (title) {
    title.className = animate ? 'tc-sigil-title animating' : 'tc-sigil-title';
    title.textContent = p.name;
    if (animate) { void title.offsetWidth; }
  }
}

function _hrTcUpdateTabs(idx) {
  document.querySelectorAll('#hrTcTabs .tc-tab-btn').forEach((btn, i) => {
    const p = HR_TC_PANELS[i];
    const active = i === idx;
    btn.classList.toggle('active', active);
    btn.style.borderColor = active ? p.accent : 'transparent';
    btn.style.boxShadow = active ? `0 2px 8px ${p.accent}33` : 'none';
    btn.innerHTML = '<div style="width:28px;height:28px">' + (_iconSvgs[p.icon] || p.emoji) + '</div>';
  });
}

function _hrTcUpdateArrows() {
  const prev = document.getElementById('hrTcPrev');
  const next = document.getElementById('hrTcNext');
  if (prev) prev.disabled = _hrTcActive === 0;
  if (next) next.disabled = _hrTcActive === HR_TC_PANELS.length - 1;
}

function hrTcInit() {
  const tabs = document.getElementById('hrTcTabs');
  if (tabs) {
    tabs.innerHTML = HR_TC_PANELS.map((p, i) =>
      `<button class="tc-tab-btn${i===0?' active':''}" data-idx="${i}" onclick="hrTcGo(${i})" title="${p.name}"
        style="${i===0?`border-color:${p.accent};box-shadow:0 2px 8px ${p.accent}33`:''}"><div style="width:28px;height:28px">${_iconSvgs[p.icon]||p.emoji}</div></button>`
    ).join('');
  }
  const mainCard = document.getElementById('hrTcMainCard');
  if (mainCard) _hrTcUpdateCornersOn(mainCard, 0);
  const inFace = document.querySelector('#hrTcIncoming .tc-in-face');
  if (inFace) _hrTcUpdateCornersOn(inFace, 0);
  _hrTcUpdateSigil(0, false);
  _hrTcSetSlide(0, true);
  _hrTcUpdateArrows();
}

function hrTcGo(target) {
  if (_hrTcLocked || target === _hrTcActive || target < 0 || target >= HR_TC_PANELS.length) return;
  const dir = target > _hrTcActive ? 'right' : 'left';
  _hrTcLocked = true;

  const srcSlide  = document.getElementById(`hrSlide${target}`);
  const inContent = document.getElementById('hrTcInContent');
  if (inContent && srcSlide) inContent.innerHTML = srcSlide.innerHTML;

  const inFace = document.querySelector('#hrTcIncoming .tc-in-face');
  if (inFace) _hrTcUpdateCornersOn(inFace, target);

  const incoming = document.getElementById('hrTcIncoming');
  if (incoming) {
    // Important : garder la classe de base "tc-incoming" pendant le reflow
    // pour conserver position:absolute + inset:0. Si on la retire (className = ''),
    // la carte apparaît brièvement comme un block par défaut → clignotement.
    incoming.style.display = 'block';
    incoming.className = 'tc-incoming';
    void incoming.offsetWidth;
    incoming.className = `tc-incoming from-${dir}`;
  }

  _hrTcUpdateSigil(target, true);
  _hrTcUpdateTabs(target);

  // Swap des slides à mi-animation (290ms) — masqué par le dos de la carte
  setTimeout(() => {
    _hrTcSetSlide(_hrTcActive, false);
    _hrTcSetSlide(target, true);
    const mainCard = document.getElementById('hrTcMainCard');
    if (mainCard) _hrTcUpdateCornersOn(mainCard, target);
  }, 290);

  setTimeout(() => {
    if (incoming) { incoming.style.display = 'none'; incoming.className = 'tc-incoming'; }
    _hrTcActive = target;
    _hrTcUpdateArrows();
    _hrTcLocked = false;
  }, 580);
}

function hrTcNavigate(delta) { hrTcGo(_hrTcActive + delta); }

document.addEventListener('DOMContentLoaded', async () => {
  _loadNameCfgsFromStorage();
  _loadSlotCfgsFromStorage();
  loadApiKey();

  // Restaurer le dernier jeu sélectionné (survit au Ctrl+Shift+R)
  const _savedGame = localStorage.getItem('top8_last_game');
  if (_savedGame && LAYOUTS[_savedGame]) {
    currentGame = _savedGame;
    const _sel = document.getElementById('gameSelect');
    if (_sel) _sel.value = _savedGame;
  }

  // Restaurer le format graphique (Lorem / Magna)
  const _savedFormat = localStorage.getItem('top8_format');
  if (_savedFormat === 'lorem' || _savedFormat === 'magna') {
    currentFormat = _savedFormat;
    const _fmtSel = document.getElementById('formatSelect');
    if (_fmtSel) _fmtSel.value = _savedFormat;
  }
  // Restaurer le compte de joueurs Magna
  const _savedCount = parseInt(localStorage.getItem('top8_magna_count') || '8', 10);
  if (_savedCount >= 3 && _savedCount <= 16) magnaPlayerCount = _savedCount;
  // Sync UI : afficher le wrap magnaCount si format=magna, mettre à jour la valeur
  applyMagnaUI();

  // Charger le fond du jeu initial (éventuellement restauré)
  const _initGame = document.getElementById('gameSelect')?.value || 'ssbu';
  const defaultLayout = LAYOUTS[_initGame] || LAYOUTS['ssbu'];
  if (defaultLayout?.bgFile) {
    const img = new Image();
    img.onload = () => { bgImg = img; updateUploadLabel(defaultLayout.bgFile); generatePreview(); };
    img.onerror = () => { bgImg = null; };
    img.src = defaultLayout.bgFile;
  }

  // Attendre que les polices soient chargées avant de dessiner
  await document.fonts.load('700 40px Montserrat'); // Bold weight pour Magna
  await document.fonts.load('800 40px Montserrat');
  await document.fonts.load('900 40px Montserrat'); // Black weight (encore utilisé ailleurs)
  await document.fonts.load('400 40px Anton');
  await loadCropsJson();
  if (typeof lmInitCoffreSelector === 'function') lmInitCoffreSelector();
  updateGame(true); // initialise currentGame, players, loadTitleConfig, renderSlots, generatePreview
  initEyeDroppers();

  // ── Barre de navigation : masquer en scroll down, réafficher en scroll up ──
  initHeaderScroll();

  tcInit();
  dcTcInit();
  hrTcInit();

  // ── Trophée hover + confettis Top 8 ──
  initTop8TabEffect();

  // ── Décorations ambiantes ──
  initDecoStars();
  initDecoFireworks();

  // ── Slider jour/nuit ──
  initDNSlider();

  // ── Deep-link import depuis le bot ────────────────────────────────────
  // Quand le bot poste un lien type ?import=<slug> à la fin d'un tournoi,
  // on auto-bascule sur Top 8, on pré-remplit le champ start.gg URL, et
  // on déclenche immédiatement importAllEvents().
  try {
    const qp = new URLSearchParams(window.location.search);
    const importSlug = qp.get('import');
    if (importSlug) {
      // Switch sur l'onglet Top 8 (la barre nav appelle switchTab via
      // liquidSwitchTab pour l'effet visuel, mais switchTab seul suffit ici)
      if (typeof switchTab === 'function') switchTab('top8');
      const urlInp = document.getElementById('startggUrl');
      if (urlInp) {
        urlInp.value = `https://start.gg/tournament/${importSlug}`;
        // Petite tempo pour laisser tous les init terminer avant l'import
        setTimeout(() => {
          if (typeof importAllEvents === 'function') importAllEvents();
        }, 600);
      }
    }
  } catch (e) {
    console.warn('[deep-link] Erreur import auto :', e.message);
  }
});

// ── ÉTOILES — remplacées par des SVG statiques dans index.html ──────────────
function initDecoStars() { /* no-op — stars are now static SVG in .t8-stars */ }

// ── FEUX D'ARTIFICES — remplacés par des SVG statiques dans index.html ───────
function initDecoFireworks() { /* no-op — fireworks are now static SVG in .t8-fireworks */ }

// ── TOP 8 TAB : décorations supprimées ──────────────────────────────────────
function initTop8TabEffect() {
  // Decorations removed
}

// Flash blanc au centre avant les confettis
function _flashCenter(cx, cy) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:     'fixed',
    left:         (cx - 60) + 'px',
    top:          (cy - 60) + 'px',
    width:        '120px',
    height:       '120px',
    borderRadius: '50%',
    background:   'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%)',
    zIndex:       '99999',
    pointerEvents:'none',
    transition:   'transform 0.5s ease, opacity 0.5s ease',
  });
  document.body.appendChild(el);
  void el.offsetWidth;
  el.style.transform = 'scale(4)';
  el.style.opacity   = '0';
  setTimeout(() => el.remove(), 520);
}

// Explosion de confettis depuis (cx, cy)
function launchConfetti(cx, cy) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position:     'fixed',
    top:          '0',
    left:         '0',
    width:        '100%',
    height:       '100%',
    zIndex:       '99997',
    pointerEvents:'none',
  });
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = [
    '#ff6b9d','#ffd93d','#6bcb77','#4d96ff','#ff922b',
    '#cc5de8','#f06595','#74c0fc','#a9e34b','#ff8787',
    '#c9b8ff','#ffb8de','#b8f0e6','#ffa94d','#63e6be',
  ];

  const pieces = [];
  for (let i = 0; i < 260; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 6 + Math.random() * 18;
    const shape = Math.floor(Math.random() * 3); // 0=rect 1=circle 2=ribbon
    const w = 5 + Math.random() * 10;
    pieces.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (Math.random() * 6), // légère poussée vers le haut
      rot:  Math.random() * 360,
      rotV: (Math.random() - 0.5) * 22,
      w,
      h: shape === 2 ? w * 0.3 : w * (0.6 + Math.random() * 0.8),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape,
      life:  1,
      decay: 0.008 + Math.random() * 0.010,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of pieces) {
      if (p.life <= 0) continue;
      alive = true;

      p.vy  += 0.32;    // gravité
      p.vx  *= 0.991;   // résistance air
      p.x   += p.vx;
      p.y   += p.vy;
      p.rot += p.rotV;
      p.life -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;

      if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  }

  requestAnimationFrame(tick);
}

function initHeaderScroll() {
  const header = document.querySelector('.header');
  const app    = document.querySelector('.app');
  if (!header) return;

  // ── Caché par défaut, scroll haut = afficher, clic nav = cacher ─────────────
  let isHidden = true;

  function _show() {
    if (!isHidden) return;
    header.classList.add('header--showing');
    header.classList.remove('header--hidden');
    if (app) { app.classList.add('app--header-showing'); app.classList.remove('app--header-hidden'); }
    document.body.classList.remove('header-hidden');
    header.addEventListener('transitionend', () => {
      header.classList.remove('header--showing');
      if (app) app.classList.remove('app--header-showing');
    }, { once: true });
    isHidden = false;
  }

  function _hide() {
    if (isHidden) return;
    header.classList.remove('header--showing');
    header.classList.add('header--hidden');
    if (app) { app.classList.remove('app--header-showing'); app.classList.add('app--header-hidden'); }
    document.body.classList.add('header-hidden');
    isHidden = true;
  }

  // Caché dès le départ
  header.classList.add('header--hidden');
  if (app) app.classList.add('app--header-hidden');
  document.body.classList.add('header-hidden');

  // Vérifie si l'élément (ou un ancêtre) consomme le wheel — i.e. peut
  // scroller dans la direction demandée. Retourne false si on est à la
  // boundary (scrollTop=0 et scroll-up, ou bottom et scroll-down), pour
  // que le wheel "déborde" et puisse déclencher show/hide du header.
  // Évite que l'utilisateur soit bloqué en haut d'une page interne et
  // ne puisse plus faire réapparaître le header.
  function _insideScrollableConsumes(el, deltaY) {
    while (el && el !== document.body && el !== document.documentElement) {
      const ov = window.getComputedStyle(el).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight) {
        if (deltaY < 0 && el.scrollTop > 0) return true;            // peut scroller up
        if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true; // peut scroller down
        return false; // boundary atteinte → laisse bubbler
      }
      el = el.parentElement;
    }
    return false;
  }

  // Scroll vers le haut → afficher (uniquement si on n'est pas en train de
  // scroller dans un élément interne — sinon le scroll inside montrerait le
  // header par accident dès qu'on remonte une liste).
  // Scroll vers le bas → cacher (TOUJOURS, même dans un élément scrollable :
  // l'intention "je veux maximiser la zone de contenu" doit toujours
  // marcher, sinon l'utilisateur est bloqué sur les pages dont tout le
  // contenu vit dans un panneau scrollable).
  document.addEventListener('wheel', e => {
    if (e.deltaY < 0) {
      if (_insideScrollableConsumes(e.target, e.deltaY)) return;
      _show();
    } else if (e.deltaY > 0) {
      _hide();
    }
  }, { passive: true });

  // Exposer _hide pour que liquidSwitchTab puisse l'appeler
  window._headerHide = _hide;
}

// ── FORMAT GRAPHIQUE ─────────────────────────────────────────────────────────
// Bascule entre 'lorem' (rendu classique per-game via LAYOUTS) et 'magna'
// (rendu Magna Arena, fond rouge à rayures, cartes sombres, multi-jeux).
// Persiste en localStorage et re-render. Le sélecteur de jeu reste utile en
// Lorem (un layout par jeu) ; en Magna le jeu est par-joueur (Phase 3).
function updateFormat(newFormat) {
  if (newFormat !== 'lorem' && newFormat !== 'magna') return;
  currentFormat = newFormat;
  try { localStorage.setItem('top8_format', newFormat); } catch {}
  // Sync le dropdown UI au cas où l'appel vient d'un auto-detect
  const _sel = document.getElementById('formatSelect');
  if (_sel && _sel.value !== newFormat) _sel.value = newFormat;
  applyMagnaUI();
  // En Magna, la section "Jeux sans layout" n'a plus de sens (Magna a
  // un rendu unifié multi-jeux). On la masque immédiatement même si
  // elle avait été montrée par un import précédent.
  if (newFormat === 'magna') {
    const noLayoutWrap = document.getElementById('noLayoutSection');
    if (noLayoutWrap) noLayoutWrap.style.cssText = 'display:none !important';
  }
  // Re-render slots UI (le nombre de slots dépend du format) + preview canvas
  if (typeof renderSlots === 'function') renderSlots();
  if (typeof generatePreview === 'function') generatePreview();
}

// Met à jour le compte de joueurs Magna (clampé 2-16) et re-render.
function updateMagnaCount(delta) {
  magnaPlayerCount = Math.max(2, Math.min(16, magnaPlayerCount + delta));
  try { localStorage.setItem('top8_magna_count', String(magnaPlayerCount)); } catch {}
  const el = document.getElementById('magnaCountValue');
  if (el) el.textContent = String(magnaPlayerCount);
  // Re-render slots UI (panneau "Joueurs & Personnages") + preview canvas
  if (typeof renderSlots === 'function') renderSlots();
  if (typeof generatePreview === 'function') generatePreview();
}

// Affiche/cache les contrôles spécifiques Magna selon le format actuel
// et synchronise la valeur affichée du compteur.
function applyMagnaUI() {
  const wrap = document.getElementById('magnaCountWrap');
  if (wrap) wrap.style.display = (currentFormat === 'magna') ? '' : 'none';
  const el = document.getElementById('magnaCountValue');
  if (el) el.textContent = String(magnaPlayerCount);
}

// Rang labels standards d'un bracket double-élim : 1, 2, 3, 4, 5/5, 7/7,
// 9/9/9/9, 13/13/13/13, 17×8, ... Tronqué à N.
function rankLabelsForN(n) {
  const labels = [];
  let pos = 1;
  while (labels.length < n) {
    if (pos <= 4) {
      labels.push(pos); pos++;
    } else {
      // Tailles de groupe : 5/5 (2), 7/7 (2), 9×4, 13×4, 17×8, 25×8, ...
      let groupSize;
      if (pos === 5 || pos === 7) groupSize = 2;
      else if (pos === 9 || pos === 13) groupSize = 4;
      else groupSize = pos; // doubling pour positions > 16
      for (let j = 0; j < groupSize && labels.length < n; j++) labels.push(pos);
      pos += groupSize;
    }
  }
  return labels.slice(0, n).map(String);
}

// Auto-détecte le format graphique depuis le nom du tournoi.
// Appelé par les flows d'import start.gg (single + multi) après réception
// du nom. Cherche les mots-clés caractéristiques de chaque format dans les
// deux sens : "magna" → format magna, "lorem" → format lorem. Si aucun
// mot-clé n'est trouvé, on laisse le format actuel intact.
function autoDetectFormat(tournamentName) {
  if (!tournamentName) return;
  const lc = tournamentName.toLowerCase();
  const wantsMagna = lc.includes('magna');
  const wantsLorem = lc.includes('lorem');
  // Si les deux apparaissent (cas tordu), magna gagne — c'est l'événement
  // le plus spécifique. Sinon on switch vers celui qui matche.
  if (wantsMagna && currentFormat !== 'magna') {
    updateFormat('magna');
  } else if (wantsLorem && !wantsMagna && currentFormat !== 'lorem') {
    updateFormat('lorem');
  }
}

// Auto-détecte magnaPlayerCount à partir du nombre de joueurs réellement
// remplis dans `players[]` (start.gg single import OU multi mode carousel).
// S'applique pour N entre 2 et 8 — pour N > 8 on garde la valeur courante
// (manuel ou défaut 8) pour respecter le choix utilisateur.
function autoDetectMagnaCount() {
  if (typeof players === 'undefined' || !players) return;
  const filled = players.filter(p => p && p.name).length;
  if (filled >= 2 && filled <= 8 && filled !== magnaPlayerCount) {
    magnaPlayerCount = filled;
    try { localStorage.setItem('top8_magna_count', String(magnaPlayerCount)); } catch {}
    applyMagnaUI();
    if (typeof renderSlots === 'function') renderSlots();
  }
}

// ── JEU ──────────────────────────────────────────────────────────────────────
function updateGame(skipBgReload) {
  currentGame = document.getElementById('gameSelect').value;
  try { localStorage.setItem('top8_last_game', currentGame); } catch {}
  const layout = LAYOUTS[currentGame];
  const count = layout ? layout.playerCount : 8;
  players = Array.from({length:count}, () => ({name:'', team:'', charId:null, costume:1, charId2:null, costume2:1, startggId:null}));
  loadTitleConfig(); // toujours avant generatePreview pour que le rendu soit correct
  // Ne pas recharger le fond si on est en mode multi ou si skipBgReload
  if (!skipBgReload && !(typeof graphs !== 'undefined' && graphs.length > 0)) {
    if (layout?.bgFile) {
      const img = new Image();
      img.onload = () => { bgImg = img; updateUploadLabel(layout.bgFile); generatePreview(); };
      img.onerror = () => { bgImg = null; generatePreview(); };
      img.src = layout.bgFile;
    } else {
      bgImg = null; generatePreview();
    }
  } else {
    generatePreview();
  }
  if (document.getElementById('editorModal')?.style.display !== 'none') {
    initTitleEditor();
    loadNameConfig();
    renderNameEditor();
  }
  renderSlots();
}

function updateUploadLabel(file) {
  const name = file.split('/').pop();
  const el = document.getElementById('uploadContent');
  if (el) el.innerHTML = `✅ Fond auto : <strong>${name}</strong> — <a href="#" onclick="resetBg();return false;" style="color:inherit">changer</a>`;
  document.querySelector('.upload-zone')?.classList.add('loaded');
}

// ── SLOTS ────────────────────────────────────────────────────────────────────
function rankClass(i) {
  if(i===0) return 'rank-badge gold';
  if(i===1) return 'rank-badge silver';
  if(i<=3)  return 'rank-badge bronze';
  return 'rank-badge';
}

// Calcule combien de slots afficher dans le panneau "Joueurs & Personnages".
// - En Magna : suit magnaPlayerCount (single) ou le nombre de filled players
//   (multi mode), pour matcher exactement les cartes affichées dans la preview.
// - En Lorem : suit le playerCount du layout du jeu courant.
function getSlotCountToShow() {
  if (typeof currentFormat !== 'undefined' && currentFormat === 'magna') {
    const inMulti = typeof window !== 'undefined' && !!window._multiTournamentName;
    if (inMulti) {
      const filled = (Array.isArray(players) ? players.filter(p => p && p.name).length : 0);
      return Math.max(2, filled || 8);
    }
    return (typeof magnaPlayerCount !== 'undefined' ? magnaPlayerCount : 8);
  }
  return LAYOUTS[currentGame]?.playerCount || 8;
}

// Modal de recadrage pour une image custom uploadée (X/Y/Zoom). Le crop
// est stocké sur players[slotIdx].customImgCrop = { x, y, scale } et
// appliqué uniquement dans drawMagnaCard (Magna format).
function openMagnaCustomCrop(slotIdx) {
  const p = players?.[slotIdx];
  if (!p || !p.customImgUrl || !p.customImgKey) {
    alert('Aucune image custom à recadrer pour ce slot.');
    return;
  }
  const cached = imgCache[p.customImgKey];
  if (!cached?._img) {
    alert('L\'image n\'a pas fini de charger, réessaie dans une seconde.');
    return;
  }
  if (!p.customImgCrop) p.customImgCrop = { x: 0, y: 0, scale: 1 };
  const crop = p.customImgCrop;

  // Estime un aspect ratio représentatif d'une carte Magna pour ce slot
  // (basé sur le layout courant). Fallback 1.2:1 si on ne peut pas calculer.
  let cardAspect = 1.2; // w/h
  try {
    const n = (typeof magnaPlayerCount !== 'undefined') ? magnaPlayerCount : 8;
    const layout = (typeof magnaLayoutFor === 'function') ? magnaLayoutFor(n) : null;
    const cell = layout?.[slotIdx];
    if (cell) {
      // Approximation : zone des cartes a un aspect ratio dérivé du canvas
      // 16:9 (1920×1080) avec 60px margins. areaW/areaH ≈ 1800/756 ≈ 2.38.
      cardAspect = (cell.w / cell.h) * (1800 / 756);
    }
  } catch {}

  // Construction du modal
  const existing = document.getElementById('magnaCropModal');
  if (existing) existing.remove();
  const previewH = 280;
  const previewW = Math.round(previewH * cardAspect);
  const modal = document.createElement('div');
  modal.id = 'magnaCropModal';
  modal.className = 'modal-bg';
  modal.style.zIndex = 200;
  modal.innerHTML = `
    <div class="modal" style="max-width:520px;padding:20px 24px;">
      <h3 style="margin:0 0 12px;font-weight:800;font-size:18px;">Recadrer l'image custom</h3>
      <div style="display:flex;justify-content:center;margin-bottom:14px;">
        <canvas id="magnaCropPreview" width="${previewW}" height="${previewH}"
                style="border-radius:14px;background:#1a1a1c;box-shadow:0 4px 20px rgba(0,0,0,0.15);"></canvas>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
          <span style="flex:0 0 60px;font-weight:700;">↔ X</span>
          <input type="range" id="cropSliderX" min="-100" max="100" step="1" value="${crop.x}" style="flex:1;">
          <span id="cropValueX" style="flex:0 0 50px;text-align:right;font-variant-numeric:tabular-nums;">${crop.x}%</span>
        </label>
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
          <span style="flex:0 0 60px;font-weight:700;">↕ Y</span>
          <input type="range" id="cropSliderY" min="-100" max="100" step="1" value="${crop.y}" style="flex:1;">
          <span id="cropValueY" style="flex:0 0 50px;text-align:right;font-variant-numeric:tabular-nums;">${crop.y}%</span>
        </label>
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;">
          <span style="flex:0 0 60px;font-weight:700;">🔍 Zoom</span>
          <input type="range" id="cropSliderScale" min="50" max="300" step="1" value="${Math.round(crop.scale*100)}" style="flex:1;">
          <span id="cropValueScale" style="flex:0 0 50px;text-align:right;font-variant-numeric:tabular-nums;">${Math.round(crop.scale*100)}%</span>
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
        <button class="btn" onclick="resetMagnaCustomCrop(${slotIdx})">↺ Réinitialiser</button>
        <button class="btn btn-primary" onclick="closeMagnaCustomCrop()">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const img = cached._img;
  const previewCanvas = modal.querySelector('#magnaCropPreview');
  const renderPreview = () => {
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewW, previewH);
    // Fond carte
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(0, 0, previewW, previewH);
    // Image avec crop appliqué (même formule que drawMagnaCard)
    const aspect = img.naturalWidth / img.naturalHeight;
    let dw = previewW, dh = previewW / aspect;
    if (dh < previewH) { dh = previewH; dw = previewH * aspect; }
    dw *= crop.scale; dh *= crop.scale;
    const dx = (previewW - dw) / 2 + crop.x * previewW * 0.01;
    const dy = (previewH - dh) / 2 + crop.y * previewH * 0.01;
    ctx.save();
    // Clip à la carte (avec coins arrondis pour cohérence visuelle)
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(previewW-r, 0);
    ctx.quadraticCurveTo(previewW, 0, previewW, r);
    ctx.lineTo(previewW, previewH-r);
    ctx.quadraticCurveTo(previewW, previewH, previewW-r, previewH);
    ctx.lineTo(r, previewH);
    ctx.quadraticCurveTo(0, previewH, 0, previewH-r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  };
  renderPreview();

  const slidX = modal.querySelector('#cropSliderX');
  const slidY = modal.querySelector('#cropSliderY');
  const slidS = modal.querySelector('#cropSliderScale');
  const valX  = modal.querySelector('#cropValueX');
  const valY  = modal.querySelector('#cropValueY');
  const valS  = modal.querySelector('#cropValueScale');
  const onChange = () => {
    crop.x = parseInt(slidX.value, 10);
    crop.y = parseInt(slidY.value, 10);
    crop.scale = parseInt(slidS.value, 10) / 100;
    valX.textContent = `${crop.x}%`;
    valY.textContent = `${crop.y}%`;
    valS.textContent = `${slidS.value}%`;
    renderPreview();
    if (typeof generatePreview === 'function') generatePreview();
  };
  slidX.addEventListener('input', onChange);
  slidY.addEventListener('input', onChange);
  slidS.addEventListener('input', onChange);
}

function closeMagnaCustomCrop() {
  const modal = document.getElementById('magnaCropModal');
  if (modal) modal.remove();
  if (typeof renderSlots === 'function') renderSlots();
}

function resetMagnaCustomCrop(slotIdx) {
  if (!players?.[slotIdx]) return;
  players[slotIdx].customImgCrop = { x: 0, y: 0, scale: 1 };
  // Re-ouvre le modal avec valeurs reset
  closeMagnaCustomCrop();
  openMagnaCustomCrop(slotIdx);
}

// Permet à l'utilisateur d'uploader une image custom pour un slot de joueur.
// L'image est convertie en data URL et stockée sur players[i].customImgUrl
// + préchargée dans imgCache pour rendu canvas immédiat. Priorité max
// dans drawMagnaCard (au-dessus du mural local et du fallback start.gg).
function openImportImage(slotIdx) {
  if (typeof players === 'undefined' || !players[slotIdx]) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.style.display = 'none';
  inp.onchange = ev => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      players[slotIdx].customImgUrl = dataUrl;
      // Clé unique (timestamp) pour invalider le cache à chaque upload
      const key = `__custom__${slotIdx}_${Date.now()}`;
      players[slotIdx].customImgKey = key;
      if (!imgCache[key]) imgCache[key] = { _loaded: false, _img: null };
      const img = new Image();
      img.onload = () => {
        imgCache[key]._loaded = true;
        imgCache[key]._img = img;
        if (typeof generatePreview === 'function') generatePreview();
      };
      img.onerror = () => { /* no-op */ };
      img.src = dataUrl;
      if (typeof renderSlots === 'function') renderSlots();
    };
    reader.readAsDataURL(file);
  };
  document.body.appendChild(inp);
  inp.click();
  setTimeout(() => inp.remove(), 1000);
}

function renderSlots() {
  if (document.getElementById('editorModal')?.style.display !== 'none') renderNameEditor();
  // Synchronise l'affichage des onglets tarot : avant un import, seul
  // "Import start.gg" est visible ; après import, tous les onglets s'ouvrent.
  if (typeof _tcRenderTabs === 'function') _tcRenderTabs();
  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = '';
  const layout = LAYOUTS[currentGame];
  const rankDisp = layout?.rankDisplay || CONFIG.RANKS_DISPLAY;
  const slotCount = getSlotCountToShow();
  players.slice(0, slotCount).forEach((p, i) => {
    const is2xko = currentGame === '2xko';
    const char  = p.charId  ? GAMES[currentGame].chars.find(c=>c.id===p.charId)  : null;
    const char2 = (is2xko && p.charId2) ? GAMES[currentGame].chars.find(c=>c.id===p.charId2) : null;
    const base  = char  ? ICON_BASENAME[char.id]  : null;
    const base2 = char2 ? ICON_BASENAME[char2.id] : null;
    const stockUrl  = base  ? getStockIconUrl(char.id,  p.costume)  : null;
    const stockUrl2 = base2 ? getStockIconUrl(char2.id, p.costume2) : null;
    const hasCrop  = char  ? hasCropData(char.id,  p.costume)  : false;
    const hasCrop2 = char2 ? hasCropData(char2.id, p.costume2) : false;

    const div = document.createElement('div');
    div.className = 'slot';
    div.innerHTML = `
      <div class="slot-header">
        <div class="${rankClass(i)}">${rankDisp[i]||i+1}</div>
        <input type="text" placeholder="Pseudo" value="${escHtml(p.name)}"
               oninput="players[${i}].name=this.value" style="flex:1;">
        <input type="text" placeholder="Team" value="${escHtml(p.team||'')}"
               oninput="players[${i}].team=this.value" style="width:70px;">
      </div>
      <div class="char-row">
        ${stockUrl
          ? `<img src="${stockUrl}" class="char-stock" onerror="this.style.display='none'">`
          : (p.customImgUrl
              ? `<img src="${p.customImgUrl}" class="char-stock" alt="Custom">`
              : `<div class="char-icon">${char ? char.icon : '?'}</div>`)
        }
        <span class="char-name">${char ? char.name : (p.customImgUrl ? 'Image custom' : 'Aucun personnage')}</span>
        <button class="btn btn-choose" onclick="openModal(${i},1)">${is2xko ? 'Perso 1' : 'Perso'}</button>
        <button class="btn-import-img" onclick="openImportImage(${i})" title="Importer une image custom pour ce slot" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v3.6A2.4 2.4 0 0 1 18.6 21H5.4A2.4 2.4 0 0 1 3 18.6V15"/>
            <path d="M12 3v12"/>
            <path d="m7 10 5 5 5-5"/>
          </svg>
        </button>
      </div>
      ${is2xko ? `<div class="char-row" style="border-top:1px solid rgba(255,255,255,0.08);">
        ${stockUrl2
          ? `<img src="${stockUrl2}" class="char-stock" onerror="this.style.display='none'">`
          : `<div class="char-icon">${char2 ? char2.icon : '?'}</div>`
        }
        <span class="char-name">${char2 ? char2.name : 'Aucun 2ème perso'}</span>
        <button class="btn btn-choose" onclick="openModal(${i},2)">Perso 2</button>
      </div>` : ''}
      ${char ? `
      ${currentGame === 'ssbu' ? `
      <div class="costume-row">
        ${[1,2,3,4,5,6,7,8].map(n => `
          <button class="costume-btn ${p.costume===n?'active':''}"
                  onclick="selectCostume(${i},${n})" title="Costume ${n}">
            <img src="${getStockIconUrl(char.id, n)}"
                 onerror="this.parentElement.style.display='none'">
          </button>`).join('')}
      </div>` : ''}
      <div class="crop-row">
        <button class="btn btn-crop-adjust" onclick="openCropAdjusterForSlot(${i})">
          ${hasCrop ? '✅ Cadrage — ✏️ Ajuster' : '✏️ Ajuster le cadrage'}
        </button>
      </div>` : ''}
      ${p.customImgUrl ? `
      <div class="crop-row">
        <button class="btn btn-crop-adjust" onclick="openMagnaCustomCrop(${i})">
          ${p.customImgCrop ? '✅ Cadrage custom — ✏️ Ajuster' : "✏️ Recadrer l'image"}
        </button>
      </div>` : ''}
    `;
    grid.appendChild(div);
  });
}

function selectCostume(slotIdx, costume) {
  players[slotIdx].costume = costume;
  // Sauvegarder la préférence si on a un startggId
  if (players[slotIdx].startggId && players[slotIdx].charId) {
    savePlayerPref(players[slotIdx].startggId, players[slotIdx].charId, costume);
  }
  renderSlots();
  generatePreview();
}

// ── CROP HELPERS ──────────────────────────────────────────────────────────────


function openCropAdjusterForSlot(slotIdx) {
  const p = players[slotIdx];
  if (!p.charId) return;
  openCropAdjuster(p.charId, p.costume, slotIdx);
}


function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── MODAL PERSONNAGE ──────────────────────────────────────────────────────────
function openModal(idx, charSlot) {
  currentSlotIndex = idx;
  currentCharSlot = charSlot || 1;
  const layout = LAYOUTS[currentGame];
  const rankDisp = layout?.rankDisplay || CONFIG.RANKS_DISPLAY;
  const slotLabel = currentCharSlot === 2 ? ' — 2ème perso' : '';
  document.getElementById('modalTitle').textContent =
    `${rankDisp[idx] || (idx+1)} — Choisir un personnage${slotLabel}`;
  document.getElementById('charSearch').value = '';
  renderCharGrid('');
  document.getElementById('charModal').style.display = 'flex';
}

function closeModal(e) {
  if(e.target.id==='charModal') document.getElementById('charModal').style.display='none';
}

function renderCharGrid(filter) {
  const grid = document.getElementById('charGrid');
  const chars = GAMES[currentGame].chars.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase()));
  grid.innerHTML = '';
  chars.forEach(c => {
    const btn = document.createElement('button');
    const isSelected = currentCharSlot === 2
      ? players[currentSlotIndex]?.charId2 === c.id
      : players[currentSlotIndex]?.charId  === c.id;
    btn.className = 'char-btn' + (isSelected ? ' selected' : '');
    btn.innerHTML = `<span class="icon">${c.icon}</span><span>${c.name}</span>`;
    btn.onclick = () => {
      const i = currentSlotIndex;
      if (currentCharSlot === 2) {
        players[i].charId2  = c.id;
        players[i].costume2 = 1;
        preloadMural(c.id, 1);
      } else {
        players[i].charId = c.id;
        // Chercher le costume sauvegardé pour ce joueur + ce perso
        if (players[i].startggId) {
          const pref = getPlayerPref(players[i].startggId);
          players[i].costume = (pref && pref.charId === c.id) ? pref.costume : 1;
        } else {
          players[i].costume = 1;
        }
        // Précharger le mural art
        preloadMural(c.id, players[i].costume);
      }

      document.getElementById('charModal').style.display = 'none';
      renderSlots();
      generatePreview();
    };
    grid.appendChild(btn);
  });
}

function filterChars() {
  renderCharGrid(document.getElementById('charSearch').value);
}

// ── FOND ──────────────────────────────────────────────────────────────────────
function loadBg(event) {
  const file = event.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      bgImg = img;
      document.getElementById('uploadContent').innerHTML =
        `✅ <strong>${file.name}</strong><br><span style="font-size:11px;opacity:0.7;">Clique pour changer</span>`;
      document.querySelector('.upload-zone').classList.add('loaded');
      generatePreview();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// Réinitialise le fond (supprime l'image chargée et revient au fond par défaut)
function resetBg() {
  bgImg = null;
  const layout = LAYOUTS[currentGame];
  if (layout?.bgFile) {
    // Recharger le fond par défaut du jeu
    const img = new Image();
    img.onload = () => { bgImg = img; updateUploadLabel(layout.bgFile); generatePreview(); };
    img.onerror = () => { bgImg = null; generatePreview(); };
    img.src = layout.bgFile;
  } else {
    // Pas de fond par défaut : nettoyer le label et régénérer
    const el = document.getElementById('uploadContent');
    if (el) el.innerHTML = 'Clique pour charger ton image de fond<br><span style="font-size:11px;opacity:0.6;">Interchangeable à chaque tournoi</span>';
    document.querySelector('.upload-zone')?.classList.remove('loaded');
    generatePreview();
  }
}

// ── START.GG ──────────────────────────────────────────────────────────────────

function detectGameFromStartGG(gameName) {
  if (!gameName) return null;
  // Cherche dans la map
  if (STARTGG_GAME_MAP[gameName]) return STARTGG_GAME_MAP[gameName];
  // Recherche partielle
  const lower = gameName.toLowerCase();
  if (lower.includes('smash') || lower.includes('ultimate')) return 'ssbu';
  if (lower.includes('guilty gear') || lower.includes('strive')) return 'ggst';
  if (lower.includes('tekken')) return 'tekken8';
  if (lower.includes('2xko')) return '2xko';
  if (lower.includes('street fighter')) return 'sf6';
  if (lower.includes('dragon ball') || lower.includes('fighterz')) return 'dbfz';
  return null;
}
function toggleKey() {
  const inp = document.getElementById('apiKey');
  inp.type = inp.type==='password' ? 'text' : 'password';
}

function saveApiKey() {
  const val = document.getElementById('apiKey').value;
  if (val) localStorage.setItem('top8_startgg_key', val);
  else localStorage.removeItem('top8_startgg_key');
}

function loadApiKey() {
  const saved = localStorage.getItem('top8_startgg_key');
  if (saved) document.getElementById('apiKey').value = saved;
}

function showStatus(type, msg) {
  const el = document.getElementById('fetchStatus');
  el.style.display='block'; el.className='status-msg '+type; el.textContent=msg;
}

function parseStartGGUrl(url) {
  const m = url.match(/start\.gg\/tournament\/([^/?#]+)\/event\/([^/?#]+)/);
  return m ? {tournament:m[1], event:m[2]} : null;
}

async function gqlFetch(apiKey, query, variables) {
  const res = await fetch('https://api.start.gg/gql/alpha', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
    body: JSON.stringify({query, variables})
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if(data.errors) throw new Error(data.errors[0].message);
  return data;
}


// ── SÉLECTEUR D'ÉVÉNEMENT ─────────────────────────────────────────────────────
let selectedEventSlug = null;

function parseTournamentSlug(url) {
  const m = url.match(/start\.gg\/tournament\/([^/?#]+)/);
  return m ? m[1] : null;
}

async function loadEvents() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const rawUrl = document.getElementById('startggUrl').value.trim();
  const btn    = document.getElementById('loadEventsBtn');

  if (!apiKey) { showStatus('error', '❌ Entre ta clé API start.gg d\'abord.'); return; }
  if (!rawUrl) { showStatus('error', '❌ Entre le lien du tournoi.'); return; }

  // Accepter les URL complètes ou juste le slug
  const url = rawUrl.startsWith('http') ? rawUrl : 'https://start.gg/tournament/' + rawUrl;

  const slug = parseTournamentSlug(url);
  if (!slug) { showStatus('error', '❌ Lien invalide. Format : start.gg/tournament/nom-du-tournoi'); return; }

  btn.disabled = true;
  btn.textContent = '⏳';
  showStatus('loading', '⏳ Chargement des événements...');

  try {
    const data = await gqlFetch(apiKey, `
      query($slug:String!) {
        tournament(slug:$slug) {
          name
          events {
            id
            name
            slug
            numEntrants
            videogame { name displayName }
          }
        }
      }
    `, { slug });

    const tournament = data?.data?.tournament;
    if (!tournament) {
      showStatus('error', '❌ Tournoi introuvable. Vérifie le lien.');
      btn.disabled = false; btn.textContent = '🔍 Chercher';
      return;
    }

    const events = tournament.events || [];
    if (!events.length) {
      showStatus('error', '❌ Aucun événement trouvé pour ce tournoi.');
      btn.disabled = false; btn.textContent = '🔍 Chercher';
      return;
    }

    // Remplir le sélecteur
    const select = document.getElementById('eventSelect');
    select.innerHTML = '<option value="">-- Choisir un événement --</option>';
    events.forEach(ev => {
      const gameName = ev.videogame?.displayName || ev.videogame?.name || '';
      const label = `${ev.name}${gameName ? ' — ' + gameName : ''}${ev.numEntrants ? ' ('+ev.numEntrants+' joueurs)' : ''}`;
      const opt = document.createElement('option');
      opt.value = ev.slug;
      opt.textContent = label;
      opt.dataset.game = gameName;
      select.appendChild(opt);
    });

    // Si un seul event, le sélectionner auto
    if (events.length === 1) {
      select.value = events[0].slug;
      onEventSelected();
    }

    document.getElementById('eventSelectorWrap').style.display = 'block';
    showStatus('success', `✅ ${events.length} événement(s) trouvé(s) pour "${tournament.name}"`);

  } catch(err) {
    showStatus('error', '❌ Erreur : ' + err.message);
  }

  btn.disabled = false; btn.textContent = '🔍 Chercher';
}

function onEventSelected() {
  const select = document.getElementById('eventSelect');
  const slug = select.value;
  const fetchBtn = document.getElementById('fetchBtn');

  if (!slug) {
    fetchBtn.style.display = 'none';
    selectedEventSlug = null;
    return;
  }

  selectedEventSlug = slug;
  fetchBtn.style.display = 'block';

  // Auto-détecter le jeu depuis l'option sélectionnée
  const opt = select.options[select.selectedIndex];
  const gameName = opt.dataset.game || '';
  const detected = detectGameFromStartGG(gameName || opt.textContent);
  if (detected) {
    currentGame = detected;
    document.getElementById('gameSelect').value = detected;
    // Charger le fond sans réinitialiser les joueurs
    const layout = LAYOUTS[detected];
    if (layout?.bgFile) {
      const img = new Image();
      img.onload = () => { bgImg = img; updateUploadLabel(layout.bgFile); };
      img.onerror = () => { bgImg = null; };
      img.src = layout.bgFile;
    }
  }
}

async function fetchFromStartGG() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const btn = document.getElementById('fetchBtn');
  if(!apiKey) { showStatus('error','❌ Entre ta clé API start.gg.'); return; }
  if(!selectedEventSlug) { showStatus('error','❌ Sélectionne d\'abord un événement via 🔍 Chercher.'); return; }

  btn.disabled = true;
  const slug = selectedEventSlug;

  try {
    // Étape 1 : standings
    showStatus('loading','⏳ Récupération des résultats...');
    const sd = await gqlFetch(apiKey, `
      query($slug:String!) { event(slug:$slug) {
        id name
        videogame { name displayName }
        tournament{name}
        standings(query:{perPage:8,page:1}) { nodes {
          placement
          entrant { id name participants { player { gamerTag prefix } } }
        }}
      }}`, {slug});

    const event = sd?.data?.event;
    if(!event) { showStatus('error','❌ Événement introuvable.'); btn.disabled=false; return; }
    const standings = (event.standings?.nodes||[]).sort((a,b)=>a.placement-b.placement);
    if(!standings.length) { showStatus('error','❌ Aucun résultat.'); btn.disabled=false; return; }

    players = Array.from({length:8}, ()=>({name:'',team:'',charId:null,costume:1,startggId:null}));
    const entrantIds = [];
    // Comme pour multi.js : on collecte max(layout.playerCount, 8) standings
    // pour que Magna (qui ne suit pas le playerCount per-game Lorem) ait
    // assez de joueurs. Lorem clippe naturellement à layout.playerCount.
    const playerCount2 = Math.max(LAYOUTS[currentGame]?.playerCount || 8, 8);
    standings.slice(0,playerCount2).forEach((s,i) => {
      const participant = s.entrant?.participants?.[0];
      players[i].name = participant?.player?.gamerTag || s.entrant?.name || '???';
      players[i].team = participant?.player?.prefix || '';
      players[i].startggId = s.entrant?.id;
      entrantIds.push(s.entrant?.id);

      // Appliquer les préférences sauvegardées
      const pref = getPlayerPref(s.entrant?.id);
      if(pref) {
        players[i].charId  = pref.charId;
        players[i].costume = pref.costume;
      }
    });

    const tName = event.tournament?.name||'';
    if(tName) {
      const numMatch = tName.match(/#\s*(\d+)/);
      document.getElementById('tournamentName').value = tName.replace(/#\s*\d+/,'').trim()||tName;
      // Auto-détecte le format graphique depuis le nom du tournoi
      // (Magna Arena → format magna). Cf. autoDetectFormat dans app.js.
      autoDetectFormat(tName);
    }

    // Auto-détecte le nombre de joueurs Magna depuis les standings réels :
    // si l'event a < 8 joueurs, on resize le compteur UI pour matcher.
    autoDetectMagnaCount();

    renderSlots();
    showStatus('loading','⏳ Récupération des personnages...');

    // Étape 2 : sets → personnages
    const setsData = await gqlFetch(apiKey, `
      query($slug:String!,$page:Int!,$perPage:Int!) { event(slug:$slug) {
        sets(page:$page,perPage:$perPage,sortType:STANDARD) { nodes {
          games { selections { entrant{id} character{name} } }
        }}
      }}`, {slug, page:1, perPage:30});

    const charCount = {};
    (setsData?.data?.event?.sets?.nodes||[]).forEach(set => {
      (set.games||[]).forEach(game => {
        (game.selections||[]).forEach(sel => {
          const eid = sel?.entrant?.id;
          const cn  = sel?.character?.name;
          if(!eid||!cn) return;
          if(!charCount[eid]) charCount[eid]={};
          charCount[eid][cn] = (charCount[eid][cn]||0)+1;
        });
      });
    });

    let charsFound = 0;
    const is2xko = currentGame === '2xko';
    standings.slice(0, LAYOUTS[currentGame]?.playerCount||8).forEach((s,i) => {
      const counts = charCount[s.entrant?.id];
      if(!counts) return;
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      // Premier perso (ne pas écraser la préférence)
      if(!players[i].charId) {
        const topChar = sorted[0]?.[0];
        if(topChar && STARTGG_TO_ID[topChar]) {
          players[i].charId  = STARTGG_TO_ID[topChar];
          players[i].costume = 1;
          charsFound++;
        }
      }
      // Deuxième perso pour 2XKO
      if(is2xko && !players[i].charId2) {
        const topChar2 = sorted[1]?.[0];
        if(topChar2 && STARTGG_TO_ID[topChar2]) {
          players[i].charId2  = STARTGG_TO_ID[topChar2];
          players[i].costume2 = 1;
          charsFound++;
        }
      }
    });

    // Précharger tous les murals
    players.forEach(p => {
      if(p.charId)  preloadMural(p.charId,  p.costume);
      if(p.charId2) preloadMural(p.charId2, p.costume2||1);
    });

    renderSlots();
    generatePreview();

    const prefsLoaded = standings.slice(0,8).filter((_,i)=>players[i].charId && getPlayerPref(players[i].startggId)).length;
    let msg = `✅ ${standings.length} joueurs importés`;
    if(prefsLoaded)  msg += `, ${prefsLoaded} costumes depuis l'historique`;
    if(charsFound)   msg += `, ${charsFound} personnages auto-détectés`;
    msg += ' !';
    showStatus('success', msg);

  } catch(err) {
    showStatus('error','❌ Erreur : '+err.message);
  }
  btn.disabled = false;
}

// showStatus moved to top

// ── CANVAS ────────────────────────────────────────────────────────────────────
function makePara(sl, sc) {
  const ox=CONFIG.OFFSET_X*sc, oy=CONFIG.OFFSET_Y*sc;
  const xBL=sl.xBL*sc+ox, yT=sl.yT*sc+oy, yB=(sl.yT+sl.h)*sc+oy;
  const w=sl.w*sc, sk=CONFIG.SKEW*sc;
  return {
    pts:[[xBL,yB],[xBL+w,yB],[xBL+w-sk,yT],[xBL-sk,yT]],
    cx:xBL+w/2-sk/2, cy:(yT+yB)/2, nameY:yB+26*sc
  };
}

function drawPara(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  pts.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.closePath();
}

function drawTitles(ctx, sc, overrideName, overrideGame) {
  // overrideName/overrideGame permettent à multi.js de passer les bonnes valeurs
  const nameEl = document.getElementById('tournamentName');
  const name = overrideName || window._multiTournamentName || (nameEl ? nameEl.value : '') || 'Lorem Ipsum';
  const game = overrideGame || window._multiGameData || GAMES[currentGame] || {sub1:'', sub2:''};
  const {T1,T2,T3} = CONFIG;
  ctx.textBaseline='alphabetic'; ctx.textAlign='center';

  // Ombre légère sur tous les textes titre
  ctx.shadowColor   = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur    = 8 * sc;
  ctx.shadowOffsetX = 2 * sc;
  ctx.shadowOffsetY = 2 * sc;

  const isT8titles = (typeof currentGame !== 'undefined' && currentGame === 'tekken8' && !overrideGame);
  const tFont = isT8titles ? 'Anton, sans-serif' : 'Montserrat, sans-serif';
  const tW    = isT8titles ? '400' : (T1.w || '800');

  function drawTitleText(cfg, text, maxW) {
    ctx.font = `${tW} ${Math.round(cfg.s*sc)}px ${tFont}`;
    ctx.letterSpacing = `${cfg.l*sc}px`;
    if ((cfg.strokeWidth||0) > 0) {
      ctx.strokeStyle = cfg.strokeColor || '#000000';
      ctx.lineWidth   = cfg.strokeWidth * sc;
      ctx.lineJoin    = 'round';
      ctx.strokeText(text, cfg.x*sc, cfg.y*sc, (maxW||800)*sc);
    }
    ctx.fillStyle = cfg.color || '#ffffff';
    ctx.fillText(text, cfg.x*sc, cfg.y*sc, (maxW||800)*sc);
  }
  drawTitleText(T1, name.toUpperCase(), T1.maxW||800);
  drawTitleText(T2, game.sub1,          T2.maxW||960);
  drawTitleText(T3, game.sub2,          T3.maxW||800);

  // Reset shadow
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
  ctx.letterSpacing='0px';
}


function drawLayoutSlots(ctx, layout, sc) {
  const rankColors = RANK_COLORS_BY_GAME[currentGame] || [];
  const RANK_LABELS = layout.rankLabels;

  layout.slots.forEach((slot, i) => {
    const p = players[i] || {name:'', team:'', charId:null, costume:1};
    const char = p.charId ? GAMES[currentGame]?.chars?.find(c=>c.id===p.charId) : null;
    const type = layout.slotType;

    ctx.save();

    // Dessiner la forme et clipper — pas de fond coloré (transparent)
    if (type === 'circle') {
      ctx.beginPath();
      ctx.arc(slot.cx*sc, slot.cy*sc, slot.r*sc, 0, Math.PI*2);
      ctx.clip();

    } else if (type === 'tekken8') {
      const sc2 = getSlotCfg(i); // config éditable (cx, cy, w, h, skewTop, fillColor, strokeColor, strokeWidth)
      const tx  = (sc2.cx - sc2.w/2)*sc;
      const ty  = (sc2.cy - sc2.h/2)*sc;
      const tw  = sc2.w*sc;
      const th  = sc2.h*sc;
      const tsk = sc2.skewTop*sc;

      // Quadrilatère générique : chaque coin contrôlable via sc2
      // haut-gauche abaissé de skewTop → bord supérieur incliné
      const trapPts = [
        [tx,      ty + tsk],  // haut-gauche
        [tx + tw, ty],        // haut-droite
        [tx + tw, ty + th],   // bas-droite
        [tx,      ty + th],   // bas-gauche
      ];
      function drawTrap() {
        ctx.beginPath();
        ctx.moveTo(trapPts[0][0], trapPts[0][1]);
        trapPts.slice(1).forEach(([px,py]) => ctx.lineTo(px, py));
        ctx.closePath();
      }

      // Fond
      drawTrap();
      ctx.fillStyle = sc2.fillColor;
      ctx.fill();

      // Personnage clippé dans le trapèze (masque suit parfaitement)
      ctx.save();
      drawTrap();
      ctx.clip();
      if (char) drawCharWithCrop(ctx, char, p.costume, {
        pts: [
          [tx,      ty + th],
          [tx + tw, ty + th],
          [tx + tw, ty],
          [tx,      ty + tsk],
        ],
        cx: tx + tw/2,
        cy: ty + tsk/2 + th/2,
        nameY: sc2.nameY*sc,
      }, sc);
      ctx.restore();

      // Contour par-dessus le personnage
      if (sc2.strokeWidth > 0) {
        drawTrap();
        const sc2col = sc2.strokeColor;
        ctx.shadowColor = sc2col + '88';
        ctx.shadowBlur  = 12*sc;
        ctx.strokeStyle = sc2col;
        ctx.lineWidth   = Math.round(sc2.strokeWidth*sc);
        ctx.stroke();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      }

      // Nom du joueur (Anton, centré sous la carte)
      {
        const nc = getPlayerNameCfg(i);
        const rawName = p.name || `Joueur ${i+1}`;
        const displayName = (p.team ? `${p.team} | ${rawName}` : rawName).toUpperCase();
        ctx.font = `400 ${Math.round(nc.size*sc)}px Anton, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.letterSpacing = '0px';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8*sc;
        ctx.shadowOffsetX = 2*sc; ctx.shadowOffsetY = 2*sc;
        ctx.fillStyle = p.name ? (nc.color || '#ffffff') : 'rgba(255,255,255,0.35)';
        ctx.fillText(displayName, (sc2.cx + nc.xOffset)*sc, (sc2.nameY + nc.yOffset)*sc, sc2.w*sc*1.5);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }

      ctx.restore(); // correspond au ctx.save() du début du forEach
      return;        // skip le code générique rank/name ci-dessous

    } else if (type === '2xko') {
      const sc2 = getSlotCfg(i);
      const { w, h, gap, slant, nameY, strokeColor, strokeWidth, rankSize } = sc2;
      const cxG  = sc2.cx, cyG = sc2.cy;

      // Centres des deux cartes
      const c1x = cxG - w/2 - gap/2;
      const c2x = cxG + w/2 + gap/2;

      // Calcule les 4 points d'un parallélogramme (top penché à droite)
      function paraPoints(cardCx, cardCy) {
        const l = cardCx - w/2, r = cardCx + w/2;
        const top = cardCy - h/2, bot = cardCy + h/2;
        return [
          [l,         bot],  // BL
          [r,         bot],  // BR
          [r + slant, top],  // TR
          [l + slant, top],  // TL
        ];
      }
      function drawParaPath(pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0]*sc, pts[0][1]*sc);
        for (let k=1; k<pts.length; k++) ctx.lineTo(pts[k][0]*sc, pts[k][1]*sc);
        ctx.closePath();
      }

      const char1 = p.charId  ? GAMES[currentGame]?.chars?.find(c=>c.id===p.charId)  : null;
      const char2 = p.charId2 ? GAMES[currentGame]?.chars?.find(c=>c.id===p.charId2) : null;
      const pts1  = paraPoints(c1x, cyG);
      const pts2  = paraPoints(c2x, cyG);

      // ── Carte 1 ────────────────────────────────────────────
      ctx.save();
      drawParaPath(pts1);
      ctx.clip();
      if (char1) {
        const pxPts = pts1.map(([x,y]) => [x*sc, y*sc]);
        const allX1 = pxPts.map(p=>p[0]), allY1 = pxPts.map(p=>p[1]);
        drawCharWithCrop(ctx, char1, p.costume, {
          pts: pxPts,
          cx: (Math.min(...allX1)+Math.max(...allX1))/2,
          cy: (Math.min(...allY1)+Math.max(...allY1))/2,
          nameY: nameY*sc,
        }, sc);
      }
      ctx.restore();
      // Contour carte 1
      if (strokeWidth > 0) {
        drawParaPath(pts1);
        ctx.shadowColor = (strokeColor||'#C8A800') + '99';
        ctx.shadowBlur  = 14*sc;
        ctx.strokeStyle = strokeColor || '#C8A800';
        ctx.lineWidth   = strokeWidth * sc;
        ctx.lineJoin    = 'round';
        ctx.stroke();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      }

      // ── Carte 2 ────────────────────────────────────────────
      ctx.save();
      drawParaPath(pts2);
      ctx.clip();
      if (char2) {
        const pxPts2 = pts2.map(([x,y]) => [x*sc, y*sc]);
        const allX2 = pxPts2.map(p=>p[0]), allY2 = pxPts2.map(p=>p[1]);
        drawCharWithCrop(ctx, char2, p.costume2||1, {
          pts: pxPts2,
          cx: (Math.min(...allX2)+Math.max(...allX2))/2,
          cy: (Math.min(...allY2)+Math.max(...allY2))/2,
          nameY: nameY*sc,
        }, sc);
      }
      ctx.restore();
      // Contour carte 2
      if (strokeWidth > 0) {
        drawParaPath(pts2);
        ctx.shadowColor = (strokeColor||'#C8A800') + '99';
        ctx.shadowBlur  = 14*sc;
        ctx.strokeStyle = strokeColor || '#C8A800';
        ctx.lineWidth   = strokeWidth * sc;
        ctx.lineJoin    = 'round';
        ctx.stroke();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      }

      // ── Numéro de rang ──────────────────────────────────────
      const numColor2 = rankColors[i] || '#ffffff';
      ctx.font = `900 ${Math.round((rankSize||80)*sc)}px Montserrat, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6*sc;
      ctx.fillStyle = numColor2;
      ctx.fillText(RANK_LABELS[i], sc2.rankX*sc, sc2.rankY*sc);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

      // ── Nom du joueur ───────────────────────────────────────
      {
        const nc = getPlayerNameCfg(i);
        const rawName = p.name || `Joueur ${i+1}`;
        const displayName = (p.team ? `${p.team} | ${rawName}` : rawName).toUpperCase();
        ctx.font = `800 ${Math.round(nc.size*sc)}px Montserrat, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.letterSpacing = '2px';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8*sc;
        ctx.shadowOffsetX = 2*sc; ctx.shadowOffsetY = 2*sc;
        ctx.fillStyle = p.name ? (nc.color || '#ffffff') : 'rgba(255,255,255,0.35)';
        ctx.fillText(displayName, (cxG + slant/2 + nc.xOffset)*sc, (nameY + nc.yOffset)*sc, (w*2+gap)*sc*1.3);
        ctx.letterSpacing = '0px';
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }

      ctx.restore(); // outer save
      return;

    } else if (type === 'rectangle') {
      const rx = (slot.cx - slot.w/2)*sc, ry = slot.yT ? slot.yT*sc : (slot.cy - slot.h/2)*sc;
      ctx.beginPath(); ctx.rect(rx, ry, slot.w*sc, slot.h*sc); ctx.clip();

    } else if (type === 'rounded') {
      const rx = (slot.cx - slot.w/2)*sc, ry = slot.yT ? slot.yT*sc : (slot.cy - slot.h/2)*sc;
      const radius = 30*sc;
      ctx.beginPath();
      ctx.moveTo(rx+radius, ry);
      ctx.lineTo(rx+slot.w*sc-radius, ry);
      ctx.quadraticCurveTo(rx+slot.w*sc, ry, rx+slot.w*sc, ry+radius);
      ctx.lineTo(rx+slot.w*sc, ry+slot.h*sc-radius);
      ctx.quadraticCurveTo(rx+slot.w*sc, ry+slot.h*sc, rx+slot.w*sc-radius, ry+slot.h*sc);
      ctx.lineTo(rx+radius, ry+slot.h*sc);
      ctx.quadraticCurveTo(rx, ry+slot.h*sc, rx, ry+slot.h*sc-radius);
      ctx.lineTo(rx, ry+radius);
      ctx.quadraticCurveTo(rx, ry, rx+radius, ry);
      ctx.closePath();
      ctx.clip();

    } else if (type === 'diamond') {
      const cx=slot.cx*sc, cy=slot.cy*sc, hw=slot.w/2*sc, hh=slot.h/2*sc;
      ctx.beginPath();
      ctx.moveTo(cx, cy-hh); ctx.lineTo(cx+hw, cy);
      ctx.lineTo(cx, cy+hh); ctx.lineTo(cx-hw, cy);
      ctx.closePath();
      ctx.clip();
    }

    // Perso dans le slot
    if (char) drawCharWithCrop(ctx, char, p.costume, {
      pts: [[slot.cx*sc - slot.w/2*sc, slot.cy*sc + slot.h/2*sc],
            [slot.cx*sc + slot.w/2*sc, slot.cy*sc + slot.h/2*sc],
            [slot.cx*sc + slot.w/2*sc, slot.cy*sc - slot.h/2*sc],
            [slot.cx*sc - slot.w/2*sc, slot.cy*sc - slot.h/2*sc]],
      cx: slot.cx*sc, cy: slot.cy*sc, nameY: slot.nameY*sc
    }, sc);

    ctx.restore();

    // Numéro de placement
    const numColor = rankColors[i] || '#ffffff';
    ctx.font = `900 ${Math.round(80*sc)}px Montserrat, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = numColor;
    ctx.fillText(RANK_LABELS[i], slot.rankX*sc, slot.rankY*sc);

    // Nom du joueur
    if (p.name) {
      const nc2 = getPlayerNameCfg(i);
      const displayName = (p.team ? `${p.team} | ${p.name}` : p.name).toUpperCase();
      ctx.textBaseline='alphabetic'; ctx.textAlign='center';
      ctx.font=`300 ${Math.round(nc2.size*sc)}px Montserrat, sans-serif`;
      ctx.letterSpacing=`${7*sc}px`;
      ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=6*sc;
      ctx.shadowOffsetX=1*sc; ctx.shadowOffsetY=1*sc;
      ctx.fillStyle = nc2.color || '#ffffff';
      ctx.fillText(displayName, (slot.cx+nc2.xOffset)*sc, (slot.nameY+nc2.yOffset)*sc);
      ctx.letterSpacing='0px';
      ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
    }
  });
}
function renderCanvas(canvas, size) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── Format Magna Arena ─────────────────────────────────────
  // Aspect 16:9 (1920×1080 de référence) vs Lorem qui est carré.
  // Le param `size` représente la LARGEUR ; hauteur dérivée.
  if (currentFormat === 'magna') {
    const MAGNA_REF_W = 1920, MAGNA_REF_H = 1080;
    canvas.width  = size;
    canvas.height = Math.round(size * MAGNA_REF_H / MAGNA_REF_W);
    const scM = size / MAGNA_REF_W;
    drawMagnaCanvas(ctx, canvas.width, canvas.height, scM);
    return;
  }

  // Carré classique Lorem
  canvas.width=size; canvas.height=size;
  const sc = size/CONFIG.REF_SIZE;

  // ── Layout custom (créé via Layout Maker) ──────────────────
  const layout = LAYOUTS[currentGame];
  if (layout?.slotType === 'custom_lm' && layout._lm) {
    const lmData = layout._lm;
    // Utiliser lmDrawBg pour appliquer pan / zoom / blur / darken sauvegardés
    // (cohérent avec l'aperçu du Layout Maker — sinon l'image est juste étirée)
    if (typeof lmDrawBg === 'function') {
      lmDrawBg(ctx, size, bgImg, lmData);
    } else if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, size, size);
    } else {
      const g = ctx.createLinearGradient(0,0,size,size);
      g.addColorStop(0,'#1a1040'); g.addColorStop(1,'#0d0720');
      ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
    }
    if (typeof drawCustomLMLayout !== 'undefined') {
      // Passer players explicitement pour garantir que les vrais noms sont utilisés
      drawCustomLMLayout(ctx, lmData, sc, typeof players !== 'undefined' ? players : []);
    }
    return;
  }

  if(bgImg) ctx.drawImage(bgImg,0,0,size,size);
  else {
    ctx.fillStyle='#1a1040'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle='#f0eeff'; ctx.fillRect(0,0,240*sc,size);
    ctx.fillStyle='rgba(200,190,255,0.5)'; ctx.font=`${Math.round(13*sc)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Charge ton fond dans le panneau gauche', size/2, size/2);
  }

  drawTitles(ctx, sc);

  // Layouts non-SSBU (cercles, rectangles, losanges)
  if (layout && !layout.useParallelogram && layout.slots.length > 0) {
    drawLayoutSlots(ctx, layout, sc);
    return;
  }

  const SSBU_NAME_COLORS=["#d69bfe","#f8e05e","#f8e05e","#ffffff","#ffffff","#ffffff","#ffffff","#ffffff"];
  CONFIG.BLACK_SLOTS.forEach((bsl,i) => {
    const slotCfg = getSlotCfg(i);
    const black = makePara({xBL:slotCfg.xBL, yT:slotCfg.yT, w:slotCfg.w, h:slotCfg.h}, sc);
    const purp  = makePara({xBL:slotCfg.pxBL, yT:slotCfg.pyT, w:slotCfg.pw, h:slotCfg.ph}, sc);
    const rc=CONFIG.RANK_COLORS[i], p=players[i];
    const char = p.charId ? GAMES[currentGame].chars.find(c=>c.id===p.charId) : null;

    // Case principale — personnage
    drawPara(ctx,black.pts); ctx.fillStyle=slotCfg.fillColor; ctx.globalAlpha=1.0; ctx.fill(); ctx.globalAlpha=1;
    ctx.save(); drawPara(ctx,black.pts); ctx.clip();
    if(char) drawCharWithCrop(ctx, char, p.costume, black, sc);
    ctx.restore();

    // Pseudo
    if(p.name) {
      const ncSSBU = getPlayerNameCfg(i);
      const displayName = (p.team ? `${p.team} | ${p.name}` : p.name).toUpperCase();
      ctx.textBaseline='alphabetic'; ctx.textAlign='center';
      ctx.font=`300 ${Math.round(ncSSBU.size*sc)}px Montserrat, sans-serif`;
      ctx.letterSpacing=`${7*sc}px`;
      ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=6*sc;
      ctx.shadowOffsetX=1*sc; ctx.shadowOffsetY=1*sc;
      ctx.fillStyle = ncSSBU.color || SSBU_NAME_COLORS[i] || '#ffffff';
      ctx.fillText(displayName, (slotCfg.nameX + ncSSBU.xOffset)*sc, (slotCfg.nameY + ncSSBU.yOffset)*sc);
      ctx.letterSpacing='0px';
      ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
    }
  });
}

// ── RENDU MAGNA ARENA ─────────────────────────────────────────────────────
// Format esport multi-jeux 16:9 : fond rouge à rayures diagonales, logo en
// haut, cartes sombres avec rang/perso/nom-twitter, nom du tournoi en bas.
// Phase 1 : scaffold (fond + logo placeholder + titre). Cartes en Phase 2.
//   width, height = dimensions canvas en px (aspect 16:9)
//   sc            = facteur d'échelle (width / 1920) pour scaler les éléments
function drawMagnaCanvas(ctx, width, height, sc) {
  // ── État vide : aucun joueur chargé ─────────────────────────────────
  // Si players[] ne contient AUCUN name rempli, on n'affiche pas le layout
  // Magna (qui serait juste 8 cartes "Aucun perso" peu utiles). À la
  // place : un écran gris avec instructions claires pour importer.
  const filledCount = (typeof players !== 'undefined')
    ? players.filter(p => p && p.name).length
    : 0;
  if (filledCount === 0) {
    drawMagnaEmptyState(ctx, width, height, sc);
    return;
  }

  drawMagnaBackground(ctx, width, height);
  // Cartes joueurs : N depuis le nb de standings non-vides en mode multi,
  // sinon magnaPlayerCount (UI).
  const inMulti = !!window._multiTournamentName;
  const n = inMulti ? Math.max(2, filledCount || 8) : magnaPlayerCount;
  // Ordre : background → cards → LOGO → title. On dessine les cartes
  // AVANT le logo pour que celui-ci passe par-dessus quand les cartes
  // remontent visuellement sous le logo (cf. topY plus haut).
  drawMagnaCards(ctx, width, height, sc, players, n);
  drawMagnaLogo(ctx, width, height, sc);
  drawMagnaTitle(ctx, width, height, sc);
}

// Écran d'état vide pour Magna : fond gris uni + instructions au centre.
// Affiché tant qu'aucun joueur n'a été chargé (start.gg ou manuel).
function drawMagnaEmptyState(ctx, width, height, sc) {
  // Fond gris
  ctx.fillStyle = '#3a3a3e';
  ctx.fillRect(0, 0, width, height);

  // Texte central
  const cx = width / 2;
  const cy = height / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Icône
  const iconSize = Math.round(80 * sc);
  ctx.font = `${iconSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.fillText('🏆', cx, cy - iconSize * 1.1);

  // Titre
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `800 ${Math.round(46 * sc)}px "Nunito", "Segoe UI", sans-serif`;
  ctx.fillText('Aucun tournoi chargé', cx, cy + 10 * sc);

  // Instructions
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `600 ${Math.round(26 * sc)}px "Nunito", "Segoe UI", sans-serif`;
  ctx.fillText('Importe un tournoi via start.gg', cx, cy + 70 * sc);
  ctx.fillText('ou ajoute des joueurs dans l’onglet Joueurs', cx, cy + 105 * sc);
}

// Grille de cartes joueurs adaptative.
//   width × height : canvas (16:9, 1920×1080 ref)
//   sc             : facteur d'échelle (width/1920)
//   playersList    : tableau de joueurs ({name, team, charId, costume, ...})
//   n              : nombre de slots à dessiner
// Layout : 4 colonnes maxi, autant de rangées que nécessaire (ceil(n/4)).
// Rangs : 1, 2, 3, 4, 5/5, 7/7, 9×4, 13×4 — cf. rankLabelsForN.
function drawMagnaCards(ctx, width, height, sc, playersList, n) {
  const ranks = rankLabelsForN(n);
  // Zone disponible : remonte plus haut (10%) pour que les cartes
  // passent visuellement sous le logo Magna (qui fait ~22% de la hauteur
  // et est dessiné PAR-DESSUS). Titre en bas réserve 110px.
  const topY    = Math.round(height * 0.10);
  const bottomY = Math.round(height - 110 * sc);
  const leftX   = Math.round(60 * sc);
  const rightX  = Math.round(width - 60 * sc);
  const areaW   = rightX - leftX;
  const areaH   = bottomY - topY;

  // Layout custom par N (cf. mockups utilisateur) : positions/tailles
  // normalisées 0-1 dans la zone des cartes. Slot 1 toujours en grand à
  // gauche, slots suivants arrangés selon le N.
  const layout = magnaLayoutFor(n);
  if (layout) {
    layout.forEach((cell, i) => {
      const x = leftX + cell.x * areaW;
      const y = topY  + cell.y * areaH;
      const w = cell.w * areaW;
      const h = cell.h * areaH;
      drawMagnaCard(ctx, x, y, w, h, sc, playersList[i] || {}, ranks[i]);
    });
    return;
  }

  // Fallback grille 4-col simple pour N=1 ou N>8 (pas dans les mockups)
  const cols    = Math.min(4, n);
  const rows    = Math.ceil(n / cols);
  const gap     = Math.round(16 * sc);
  const cardW   = Math.round((areaW - gap * (cols - 1)) / cols);
  const cardH   = Math.round((areaH - gap * (rows - 1)) / rows);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = leftX + col * (cardW + gap);
    const y = topY  + row * (cardH + gap);
    drawMagnaCard(ctx, x, y, cardW, cardH, sc, playersList[i] || {}, ranks[i]);
  }
}

// Layouts custom par nombre de joueurs N — coords normalisées (0-1) dans
// la zone des cartes. Slot 1 toujours en grand à gauche. Gap consistant
// (1.5% du width) horizontal/vertical entre toutes les cartes.
// Basé sur les mockups utilisateur (N=4..8). N=2, N=3 dérivés du même
// principe. Pour N>8 ou N<2, retourne null → fallback grille simple.
function magnaLayoutFor(n) {
  const GAP = 0.015;
  const SLOT1_W = 0.32;       // largeur slot 1 (grand)
  const TOP_H = 0.55;         // hauteur rangée du haut quand 2 rangées

  if (n === 2) {
    const w = (1 - GAP) / 2;
    return [
      {x: 0,     y: 0, w, h: 1},
      {x: w+GAP, y: 0, w, h: 1},
    ];
  }
  if (n === 3) {
    // Podium : slot 1 grand au milieu (full height), slots 2 & 3 plus
    // petits sur les côtés (~78% height, bottom-aligned). Style estrade
    // de podium olympique.
    const midW  = 0.36;
    const sideW = (1 - 2*GAP - midW) / 2;
    const sideH = 0.78;
    const sideY = 1 - sideH; // bottom-aligned
    return [
      {x: sideW + GAP,                    y: 0,     w: midW,  h: 1},
      {x: 0,                              y: sideY, w: sideW, h: sideH},
      {x: sideW + GAP + midW + GAP,       y: sideY, w: sideW, h: sideH},
    ];
  }
  if (n === 4) {
    // Slot 1 grand + slot 2 grand + slots 3/4 empilés à droite (3 cols)
    const colW = (1 - 2*GAP) / 3;
    const halfH = (1 - GAP) / 2;
    return [
      {x: 0,             y: 0,         w: colW, h: 1},
      {x: colW+GAP,      y: 0,         w: colW, h: 1},
      {x: 2*(colW+GAP),  y: 0,         w: colW, h: halfH},
      {x: 2*(colW+GAP),  y: halfH+GAP, w: colW, h: halfH},
    ];
  }
  if (n === 5) {
    // Slot 1 grand + grille 2×2 à droite
    const rightW = 1 - SLOT1_W - GAP;
    const cardW = (rightW - GAP) / 2;
    const halfH = (1 - GAP) / 2;
    return [
      {x: 0,                   y: 0,         w: SLOT1_W, h: 1},
      {x: SLOT1_W+GAP,         y: 0,         w: cardW,   h: halfH},
      {x: SLOT1_W+GAP+cardW+GAP, y: 0,       w: cardW,   h: halfH},
      {x: SLOT1_W+GAP,         y: halfH+GAP, w: cardW,   h: halfH},
      {x: SLOT1_W+GAP+cardW+GAP, y: halfH+GAP,w: cardW,  h: halfH},
    ];
  }
  if (n === 6) {
    // Slot 1 + rangée 3 cards en haut + rangée 2 cards en bas (squarer)
    const rightW = 1 - SLOT1_W - GAP;
    const topCardW = (rightW - 2*GAP) / 3;
    const bottomCardW = (rightW - GAP) / 2;
    const bottomH = 1 - TOP_H - GAP;
    const out = [{x: 0, y: 0, w: SLOT1_W, h: 1}];
    for (let i = 0; i < 3; i++) {
      out.push({x: SLOT1_W+GAP + i*(topCardW+GAP), y: 0, w: topCardW, h: TOP_H});
    }
    for (let i = 0; i < 2; i++) {
      out.push({x: SLOT1_W+GAP + i*(bottomCardW+GAP), y: TOP_H+GAP, w: bottomCardW, h: bottomH});
    }
    return out;
  }
  if (n === 7) {
    // Slot 1 + 2 rangées de 3 cards à droite
    const rightW = 1 - SLOT1_W - GAP;
    const cardW = (rightW - 2*GAP) / 3;
    const bottomH = 1 - TOP_H - GAP;
    const out = [{x: 0, y: 0, w: SLOT1_W, h: 1}];
    for (let i = 0; i < 3; i++) {
      out.push({x: SLOT1_W+GAP + i*(cardW+GAP), y: 0, w: cardW, h: TOP_H});
    }
    for (let i = 0; i < 3; i++) {
      out.push({x: SLOT1_W+GAP + i*(cardW+GAP), y: TOP_H+GAP, w: cardW, h: bottomH});
    }
    return out;
  }
  if (n === 8) {
    // Slot 1 + rangée 3 cards (plus larges) en haut + rangée 4 cards (plus
    // étroites) en bas. Largeurs alignées sur grille de 12 unités côté droit.
    const rightW = 1 - SLOT1_W - GAP;
    const topCardW = (rightW - 2*GAP) / 3;
    const bottomCardW = (rightW - 3*GAP) / 4;
    const bottomH = 1 - TOP_H - GAP;
    const out = [{x: 0, y: 0, w: SLOT1_W, h: 1}];
    for (let i = 0; i < 3; i++) {
      out.push({x: SLOT1_W+GAP + i*(topCardW+GAP), y: 0, w: topCardW, h: TOP_H});
    }
    for (let i = 0; i < 4; i++) {
      out.push({x: SLOT1_W+GAP + i*(bottomCardW+GAP), y: TOP_H+GAP, w: bottomCardW, h: bottomH});
    }
    return out;
  }
  return null;
}

// Une carte joueur : fond sombre arrondi, rang en haut-gauche, mural perso
// en grand, nom (+team prefix) en bas. Twitter @handle réservé à Phase 3.
function drawMagnaCard(ctx, x, y, w, h, sc, player, rankLabel) {
  ctx.save();
  // Fond carte
  const r = Math.round(14 * sc);
  ctx.fillStyle = '#1a1a1c';
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();

  // Bordure subtile
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = Math.max(1, Math.round(1 * sc));
  ctx.stroke();

  // Pipeline de résolution de l'image du perso (ordre de priorité) :
  //   1. customImgUrl uploadée par l'utilisateur (le plus haut)
  //   2. Mural local via charId
  //   3. Fallback start.gg via charImgUrl
  let hasCharImage = false;
  if (typeof imgCache !== 'undefined') {
    let cachedImg = null;
    // 1. Image custom uploadée
    if (player.customImgKey) {
      const customCached = imgCache[player.customImgKey];
      if (customCached?._loaded && customCached._img) cachedImg = customCached._img;
    }
    // 2. Mural local via charId
    if (!cachedImg && player.charId) {
      const game = player.game || currentGame;
      const key = `${game}_${player.charId}_${player.costume || 1}`;
      const cached = imgCache[key];
      if (cached?._loaded && cached._img) cachedImg = cached._img;
    }
    // 3. Fallback start.gg : utilisé si pas de mural local (404 ou pas de charId)
    if (!cachedImg && player.charImgUrl) {
      const sgKey = `__sg__${player.charImgUrl}`;
      const sgCached = imgCache[sgKey];
      if (sgCached?._loaded && sgCached._img) cachedImg = sgCached._img;
    }
    if (cachedImg) {
      ctx.save();
      roundRectPath(ctx, x, y, w, h, r);
      ctx.clip();
      // Centré, recouvre la carte tout en préservant l'aspect ratio
      const aspect = cachedImg.naturalWidth / cachedImg.naturalHeight;
      let dw = w, dh = w / aspect;
      if (dh < h) { dh = h; dw = h * aspect; }
      // Crop custom (X/Y/Zoom) appliqué uniquement si l'image vient de
      // l'upload custom de l'utilisateur. Format : { x, y, scale }
      // x et y sont des pourcentages de la taille de la carte (-100 à +100)
      const crop = (player.customImgKey && player.customImgCrop) ? player.customImgCrop : null;
      if (crop) {
        dw *= crop.scale; dh *= crop.scale;
      }
      let dx = x + (w - dw) / 2;
      let dy = y + (h - dh) / 2;
      if (crop) {
        dx += crop.x * w * 0.01;
        dy += crop.y * h * 0.01;
      }
      ctx.drawImage(cachedImg, dx, dy, dw, dh);
      ctx.restore();
      hasCharImage = true;
    }
  }

  // Placeholder instructif quand aucun perso n'est chargé : aide l'utilisateur
  // à comprendre où aller pour ajouter une image (onglet Joueurs ou start.gg).
  // Centré dans la carte, sobre (gris semi-transparent par-dessus le noir).
  if (!hasCharImage) {
    ctx.save();
    const cx = x + w / 2;
    const cy = y + h / 2;
    const minDim = Math.min(w, h);
    // Icône image au-dessus
    const iconSize = Math.round(minDim * 0.18);
    ctx.font = `${iconSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🖼️', cx, cy - iconSize * 0.85);
    // Texte principal
    const mainSize = Math.round(minDim * 0.07);
    ctx.font = `800 ${mainSize}px "Nunito", "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Aucun perso', cx, cy + iconSize * 0.2);
    // Sous-texte d'instruction
    const subSize = Math.round(minDim * 0.052);
    ctx.font = `600 ${subSize}px "Nunito", "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillText('Va dans l’onglet Joueurs', cx, cy + iconSize * 0.2 + mainSize * 1.4);
    ctx.fillText('pour en ajouter un', cx, cy + iconSize * 0.2 + mainSize * 1.4 + subSize * 1.3);
    ctx.restore();
  }

  // Rang en haut-gauche : chiffre blanc plein en Montserrat Black 900,
  // avec un contour/shadow noir décalé en bas à droite (effet relief 3D).
  const rankSize = Math.round(Math.min(w, h) * 0.16);
  ctx.font = `900 ${rankSize}px "Montserrat", "Segoe UI", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const rankX = x + Math.round(34 * sc);
  const rankY = y + Math.round(26 * sc);
  // Ombre noire décalée bas-droite (proportionnelle à la taille du rang)
  const off = Math.max(2, Math.round(rankSize * 0.08));
  ctx.fillStyle = '#000';
  ctx.fillText(rankLabel, rankX + off, rankY + off);
  // Chiffre blanc principal
  ctx.fillStyle = '#ffffff';
  ctx.fillText(rankLabel, rankX, rankY);

  // Nom en bas (+ team prefix optionnel). Background degradé bottom pour
  // garantir la lisibilité par-dessus le mural. Police Montserrat Black
  // (weight 900). Texte positionné tout en bas de la carte.
  if (player.name) {
    const nameBoxH = Math.round(h * 0.18);
    const ny = y + h - nameBoxH;
    // Gradient noir transparent → opaque sur les 60% inférieurs
    const grad = ctx.createLinearGradient(0, ny - h*0.15, 0, y + h);
    grad.addColorStop(0, 'rgba(20,20,22,0)');
    grad.addColorStop(1, 'rgba(10,10,12,0.92)');
    ctx.fillStyle = grad;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillRect(x, ny - h*0.15, w, h*0.15 + nameBoxH);
    ctx.restore();

    // Texte nom : team prefix en accent jaune, name en blanc. Police
    // Montserrat Bold (700). Auto-fit pour que le texte tienne dans la
    // carte (réduction du fontSize si le texte composé dépasse la largeur
    // disponible avec un padding latéral de 14px de chaque côté).
    const team = (player.team || '').trim();
    const name = (player.name || '').trim();
    const sepTxt = team ? ' | ' : '';
    const fullText = team + sepTxt + name;

    // Padding latéral : 30px par défaut, mais 70px (×2) pour la 1ʳᵉ place
    // qui a une grande carte → le nom doit garder beaucoup d'air autour
    // de lui pour ne pas paraître écrasant sur la carte du champion.
    const isFirstPlace = rankLabel === '1';
    const padPerSide = isFirstPlace ? 70 : 30;
    const maxTextWidth = w - Math.round(padPerSide * 2 * sc);
    let fontSize = Math.round(h * 0.085);
    ctx.font = `700 ${fontSize}px "Montserrat", "Segoe UI", sans-serif`;
    let totalW = ctx.measureText(fullText).width;
    if (totalW > maxTextWidth) {
      // Réduit proportionnellement (avec un floor minimum de 10px)
      fontSize = Math.max(10, Math.floor(fontSize * (maxTextWidth / totalW)));
      ctx.font = `700 ${fontSize}px "Montserrat", "Segoe UI", sans-serif`;
      totalW = ctx.measureText(fullText).width;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const tx = x + w / 2;
    // Position : remonte le texte du fond (10% de la hauteur de carte
    // depuis le bas) pour laisser plus d'air entre le nom et le bord.
    const ty = y + h - Math.round(h * 0.10);
    if (team) {
      const teamW = ctx.measureText(team).width;
      const sepW  = ctx.measureText(sepTxt).width;
      const startX = tx - totalW / 2;
      ctx.fillStyle = '#f5c623';
      ctx.fillText(team, startX, ty);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sepTxt, startX + teamW, ty);
      ctx.fillText(name, startX + teamW + sepW, ty);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, tx, ty);
    }
  }

  ctx.restore();
}

// Helper : trace un path rectangle arrondi compatible vieux navigateurs
// (ctx.roundRect existe en moderne mais pas universel).
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Fond rouge avec rayures diagonales sombres.
function drawMagnaBackground(ctx, width, height) {
  ctx.fillStyle = '#d80018';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 4); // -45° diagonale
  ctx.strokeStyle = '#9d0017';
  const ref = Math.max(width, height);
  ctx.lineWidth = Math.max(3, ref * 0.0045);
  const span = ref * 1.6;
  const step = Math.max(18, ref * 0.022);
  for (let x = -span; x < span; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, -span);
    ctx.lineTo(x, span);
    ctx.stroke();
  }
  ctx.restore();
}

// Cache global du logo Magna Arena PNG (chargé async une seule fois depuis
// le repo d'assets via jsDelivr). Tant qu'il n'est pas chargé, on dessine
// le placeholder canvas en attendant. Promise-based pour pouvoir attendre
// son chargement depuis les flows d'import multi-event.
let _magnaLogoImg = null;
let _magnaLogoPromise = null;
function loadMagnaLogo() {
  if (_magnaLogoImg) return Promise.resolve(_magnaLogoImg);
  if (_magnaLogoPromise) return _magnaLogoPromise;
  _magnaLogoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      _magnaLogoImg = img;
      // Re-render single mode pour montrer le vrai logo si on est en magna
      if (currentFormat === 'magna' && typeof generatePreview === 'function') {
        generatePreview();
      }
      resolve(img);
    };
    img.onerror = () => {
      console.warn('[Magna] Logo PNG introuvable (backgrounds/magna_logo.png) — placeholder utilisé');
      resolve(null);
    };
    img.src = (typeof assetUrl === 'function')
      ? assetUrl('backgrounds/magna_logo.png')
      : 'backgrounds/magna_logo.png';
  });
  return _magnaLogoPromise;
}

// Logo Magna Arena en haut au centre. Utilise le PNG officiel si chargé,
// sinon retombe sur un placeholder dessiné en canvas (couronne + texte).
function drawMagnaLogo(ctx, width, height, sc) {
  // Trigger le chargement async (idempotent grâce au cache + flag loading)
  if (!_magnaLogoImg) loadMagnaLogo();

  // ── Logo PNG officiel chargé : on l'affiche centré en haut ──
  if (_magnaLogoImg && _magnaLogoImg.naturalWidth > 0) {
    // ≈16.5% de la hauteur (22% × 0.75 = 25% plus petit) — dessiné
    // par-dessus les cartes qui remontent (cf. drawMagnaCards topY=10%)
    // pour donner l'effet "cartes passent SOUS le logo".
    const logoH = Math.round(height * 0.165);
    const aspect = _magnaLogoImg.naturalWidth / _magnaLogoImg.naturalHeight;
    const logoW = Math.round(logoH * aspect);
    const x = Math.round((width - logoW) / 2);
    const y = Math.round(14 * sc);
    ctx.drawImage(_magnaLogoImg, x, y, logoW, logoH);
    return;
  }

  // ── Fallback placeholder en attendant le chargement ──
  ctx.save();
  // Couronne stylisée : 3 triangles dorés
  const cx = width / 2;
  const cy = 70 * sc;
  const crownW = 110 * sc;
  ctx.fillStyle = '#f5c623';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3 * sc;
  ctx.beginPath();
  ctx.moveTo(cx - crownW/2, cy + 30*sc);
  ctx.lineTo(cx - crownW/3, cy - 10*sc);
  ctx.lineTo(cx - crownW/6, cy + 20*sc);
  ctx.lineTo(cx,           cy - 35*sc);
  ctx.lineTo(cx + crownW/6, cy + 20*sc);
  ctx.lineTo(cx + crownW/3, cy - 10*sc);
  ctx.lineTo(cx + crownW/2, cy + 30*sc);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Rubis central
  ctx.fillStyle = '#d80018';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18*sc);
  ctx.lineTo(cx + 9*sc, cy - 5*sc);
  ctx.lineTo(cx, cy + 8*sc);
  ctx.lineTo(cx - 9*sc, cy - 5*sc);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Texte "MAGNA" en gros blanc avec stroke noir
  ctx.font = `900 ${Math.round(72*sc)}px Anton, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7 * sc;
  ctx.strokeStyle = '#1a1a1a';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText('MAGNA', cx, cy + 110*sc);
  ctx.fillText  ('MAGNA', cx, cy + 110*sc);
  // Ruban "ARENA"
  const banY = cy + 130*sc, banW = 220*sc, banH = 42*sc;
  ctx.fillStyle = '#8e1226';
  ctx.fillRect(cx - banW/2, banY, banW, banH);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3 * sc;
  ctx.strokeRect(cx - banW/2, banY, banW, banH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(24*sc)}px Anton, "Arial Black", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ARENA', cx, banY + banH/2 + 2*sc);
  ctx.restore();
}

// Nom du tournoi en bas, gros blanc, letter-spacing.
// En mode multi-event, le nom vient de window._multiTournamentName (set
// par multi.js avant l'appel à renderCanvas) plutôt que du champ input
// qui n'est pas synchronisé en multi.
function drawMagnaTitle(ctx, width, height, sc) {
  const t = (window._multiTournamentName
          || document.getElementById('tournamentName')?.value
          || 'MAGNA ARENA').trim();
  if (!t) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(54*sc)}px Anton, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${4*sc}px`;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8 * sc;
  ctx.shadowOffsetY = 2 * sc;
  ctx.fillText(t.toUpperCase(), width / 2, height - 25 * sc);
  ctx.restore();
}

// État vide : on cache le canvas et on montre un message guidant
// l'utilisateur vers l'import start.gg tant qu'aucune donnée n'a été
// importée. Évite d'afficher le template Lorem Ipsum par défaut.
function _previewHasAnyData() {
  // Réutilise la même heuristique que _tcHasAnyImport() : au moins un
  // joueur nommé, ou au moins un graph dans le mode multi.
  if (typeof _tcHasAnyImport === 'function') return _tcHasAnyImport();
  const hasPlayer = (typeof players !== 'undefined' && Array.isArray(players)
                     && players.some(p => p && p.name));
  const hasGraph  = (typeof graphs !== 'undefined' && Array.isArray(graphs) && graphs.length > 0);
  return hasPlayer || hasGraph;
}

function _togglePreviewEmptyState() {
  const empty  = document.getElementById('previewEmptyState');
  const canvas = document.getElementById('previewCanvas');
  if (!empty || !canvas) return false;
  const isEmpty = !_previewHasAnyData();
  empty.style.display  = isEmpty ? 'flex' : 'none';
  canvas.style.display = isEmpty ? 'none' : '';
  // Quand rien n'est importé : on cache complètement le panneau droit
  // (preview + actions) et on centre le panneau gauche (carte/TV) à l'écran.
  // Toggle d'une classe sur <body> que le CSS écoute pour ces deux comportements.
  document.body.classList.toggle('top8-no-import', isEmpty);
  return isEmpty;
}

function generatePreview() {
  // Avant tout : si aucun tournoi importé, on affiche l'état vide et on
  // saute le rendu canvas (sinon on verrait le template Lorem Ipsum par défaut).
  if (_togglePreviewEmptyState()) return;

  // Précharger les murals puis dessiner
  const toLoad = [];
  players.forEach(p => {
    if (p.charId) toLoad.push(new Promise(resolve => {
      const key = `${currentGame}_${p.charId}_${p.costume}`;
      if(imgCache[key]?._loaded) { resolve(); return; }
      if(!imgCache[key]) imgCache[key] = {_loaded:false, _img:null};
      const img = new Image();
      img.onload  = () => { imgCache[key]._loaded=true; imgCache[key]._img=img; resolve(); };
      img.onerror = () => resolve();
      img.src = getMuralArtUrl(p.charId, p.costume);
    }));
    if (p.charId2) toLoad.push(new Promise(resolve => {
      const key2 = `${currentGame}_${p.charId2}_${p.costume2||1}`;
      if(imgCache[key2]?._loaded) { resolve(); return; }
      if(!imgCache[key2]) imgCache[key2] = {_loaded:false, _img:null};
      const img = new Image();
      img.onload  = () => { imgCache[key2]._loaded=true; imgCache[key2]._img=img; resolve(); };
      img.onerror = () => resolve();
      img.src = getMuralArtUrl(p.charId2, p.costume2||1);
    }));
  });

  Promise.all(toLoad).then(() => {
    loadTitleConfig(); // garantit que CONFIG est à jour au moment du rendu (résolution async)
    renderCanvas(document.getElementById('previewCanvas'), 1400);
    renderEditorCanvas();
    updateTweet();
  });
}

// ── ÉDITEUR DE TITRES ─────────────────────────────────────────────────────────

const TITLE_DEFAULTS = {
  T1: {x:903, y:95,  s:46, l:3,    color:'#ffffff', strokeColor:'#000000', strokeWidth:0},
  T2: {x:901, y:165, s:43, l:11.5, color:'#ffffff', strokeColor:'#000000', strokeWidth:0},
  T3: {x:905, y:229, s:40, l:13,   color:'#ffffff', strokeColor:'#000000', strokeWidth:0},
};

function getTitleConfigs() {
  try { return JSON.parse(localStorage.getItem('top8_title_configs') || '{}'); } catch { return {}; }
}

function saveTitleConfig() {
  // Lecture DOM-first : l'UI est la source de vérité, CONFIG en fallback
  const rf = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
  };
  const readT = (p, T) => ({
    x: rf(`${p}x`, T.x), y: rf(`${p}y`, T.y),
    s: rf(`${p}s`, T.s), l: rf(`${p}l`, T.l),
    color:       rf(`${p}color`,       T.color       ?? '#ffffff'),
    strokeColor: rf(`${p}strokecolor`, T.strokeColor ?? '#000000'),
    strokeWidth: rf(`${p}strokew`,     T.strokeWidth ?? 0),
  });
  const all = getTitleConfigs();
  all[currentGame] = { T1: readT('t1', CONFIG.T1), T2: readT('t2', CONFIG.T2), T3: readT('t3', CONFIG.T3) };
  localStorage.setItem('top8_title_configs', JSON.stringify(all));
}
function manualSaveTitleConfig() {
  syncTitle(); // met CONFIG à jour depuis les sliders
  _showLayoutSavedToast('💾 Titres sauvegardés');
}

function loadTitleConfig() {
  const saved = getTitleConfigs()[currentGame];
  if (saved) {
    Object.assign(CONFIG.T1, saved.T1);
    Object.assign(CONFIG.T2, saved.T2);
    Object.assign(CONFIG.T3, saved.T3);
  } else {
    CONFIG.T1 = {...TITLE_DEFAULTS.T1};
    CONFIG.T2 = {...TITLE_DEFAULTS.T2};
    CONFIG.T3 = {...TITLE_DEFAULTS.T3};
  }
  // Assurer que toutes les propriétés sont présentes
  ['T1','T2','T3'].forEach(t => {
    if (!CONFIG[t].color)       CONFIG[t].color       = '#ffffff';
    if (!CONFIG[t].strokeColor) CONFIG[t].strokeColor = '#000000';
    if (CONFIG[t].strokeWidth === undefined) CONFIG[t].strokeWidth = 0;
  });
  // Si l'éditeur est ouvert, synchroniser l'UI immédiatement
  if (document.getElementById('editorModal')?.style.display !== 'none') {
    initTitleEditor();
  }
}

function openEditorModal() {
  // Layout custom (créé via Layout Maker) → ouvrir l'éditeur LM en mode édition
  if (LAYOUTS[currentGame]?.slotType === 'custom_lm' && typeof lmOpenForEdit === 'function') {
    lmOpenForEdit(currentGame);
    return;
  }

  const modal = document.getElementById('editorModal');
  modal.style.display = 'flex';
  // Badge jeu
  const badge = document.getElementById('editorGameBadge');
  if (badge) badge.textContent = GAME_LABELS[currentGame] || currentGame;
  loadTitleConfig(); // rafraîchit CONFIG depuis localStorage avant d'afficher les sliders
  initTitleEditor();
  loadNameConfig();
  renderNameEditor();
  renderEditorCanvas();
}

function closeEditorModal() {
  saveTitleConfig(); // sauvegarde automatique à la fermeture
  document.getElementById('editorModal').style.display = 'none';
}

function onEditorBgClick(e) {
  if (e.target.id === 'editorModal') closeEditorModal();
}

function renderEditorCanvas() {
  const c = document.getElementById('editorCanvas');
  if (!c || document.getElementById('editorModal').style.display === 'none') return;
  renderCanvas(c, 700);
}

function toggleTitleEditor() {
  // conservé pour compatibilité (multi.js peut l'appeler)
  openEditorModal();
}

function initTitleEditor() {
  const fields = [
    ['t1x', CONFIG.T1.x], ['t1y', CONFIG.T1.y], ['t1s', CONFIG.T1.s], ['t1l', CONFIG.T1.l],
    ['t2x', CONFIG.T2.x], ['t2y', CONFIG.T2.y], ['t2s', CONFIG.T2.s], ['t2l', CONFIG.T2.l],
    ['t3x', CONFIG.T3.x], ['t3y', CONFIG.T3.y], ['t3s', CONFIG.T3.s], ['t3l', CONFIG.T3.l],
  ];
  fields.forEach(([id, val]) => {
    const slider = document.getElementById(id);
    const num    = document.getElementById(id + '_n');
    if (slider) slider.value = val;
    if (num)    num.value    = val;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('t1color', CONFIG.T1.color || '#ffffff');
  set('t2color', CONFIG.T2.color || '#ffffff');
  set('t3color', CONFIG.T3.color || '#ffffff');
  set('t1strokecolor', CONFIG.T1.strokeColor || '#000000');
  set('t2strokecolor', CONFIG.T2.strokeColor || '#000000');
  set('t3strokecolor', CONFIG.T3.strokeColor || '#000000');
  set('t1strokew', CONFIG.T1.strokeWidth || 0);
  set('t2strokew', CONFIG.T2.strokeWidth || 0);
  set('t3strokew', CONFIG.T3.strokeWidth || 0);
}

function renderNameEditor() {
  const container = document.getElementById('nameEditorSlots');
  if (!container) return;
  const layout   = LAYOUTS[currentGame];
  const rankDisp = layout?.rankDisplay || CONFIG.RANKS_DISPLAY;
  container.innerHTML = '';

  const hasSlotEditor = ['tekken8','2xko'].includes(layout?.slotType) || layout?.useParallelogram;

  players.forEach((p, i) => {
    const cfg = getPlayerNameCfg(i);
    const sc2 = hasSlotEditor ? getSlotCfg(i) : null;

    // ── Contrôles carte Tekken 8 ──
    const tekken8Controls = (sc2 && layout?.slotType === 'tekken8') ? `
      <details class="slot-editor-details">
        <summary>🎴 Carte ${rankDisp[i]||i+1}</summary>
        <div class="slot-editor-inner">
          <div class="slot-editor-row-colors">
            <label class="slot-label">Fond</label>
            <input type="color" value="${sc2.fillColor}" class="color-pick"
                   oninput="syncSlot(${i},{fillColor:this.value})" title="Couleur de fond">
            <label class="slot-label" style="margin-left:8px;">Contour</label>
            <input type="color" value="${sc2.strokeColor}" class="color-pick"
                   oninput="syncSlot(${i},{strokeColor:this.value})" title="Couleur du contour">
            <label class="slot-label" style="margin-left:8px;">Épais.</label>
            <input type="number" min="0" max="20" step="0.5" value="${sc2.strokeWidth}" style="width:44px;"
                   oninput="syncSlot(${i},{strokeWidth:+this.value})">
          </div>
          <div class="title-row"><span>Position X</span>
            <input type="range" min="100" max="1300" value="${sc2.cx}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{cx:+this.value})">
            <input type="number" min="100" max="1300" value="${sc2.cx}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{cx:+this.value})"></div>
          <div class="title-row"><span>Position Y</span>
            <input type="range" min="100" max="1300" value="${sc2.cy}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{cy:+this.value})">
            <input type="number" min="100" max="1300" value="${sc2.cy}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{cy:+this.value})"></div>
          <div class="title-row"><span>Largeur</span>
            <input type="range" min="50" max="600" value="${sc2.w}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{w:+this.value})">
            <input type="number" min="50" max="600" value="${sc2.w}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{w:+this.value})"></div>
          <div class="title-row"><span>Hauteur</span>
            <input type="range" min="50" max="700" value="${sc2.h}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{h:+this.value})">
            <input type="number" min="50" max="700" value="${sc2.h}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{h:+this.value})"></div>
          <div class="title-row"><span>Inclinaison</span>
            <input type="range" min="0" max="200" value="${sc2.skewTop}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{skewTop:+this.value})">
            <input type="number" min="0" max="200" value="${sc2.skewTop}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{skewTop:+this.value})"></div>
          <div class="title-row"><span>Y nom</span>
            <input type="range" min="200" max="1380" value="${sc2.nameY}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})">
            <input type="number" min="200" max="1380" value="${sc2.nameY}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})"></div>
          <button class="btn" style="width:100%;font-size:10px;padding:3px;margin-top:4px;"
                  onclick="resetSlotCfg(${i})">↩ Reset carte</button>
        </div>
      </details>` : '';

    // ── Contrôles cases SSBU ──
    const ssbuControls = (sc2 && layout?.useParallelogram) ? `
      <details class="slot-editor-details">
        <summary>🎮 Cases ${rankDisp[i]||i+1}</summary>
        <div class="slot-editor-inner">
          <div class="slot-editor-section-label">◼ Case personnage</div>
          <div class="slot-editor-row-colors">
            <label class="slot-label">Couleur</label>
            <input type="color" value="${sc2.fillColor}" class="color-pick"
                   oninput="syncSlot(${i},{fillColor:this.value})">
          </div>
          <div class="title-row"><span>X gauche</span>
            <input type="range" min="0" max="1200" value="${sc2.xBL}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{xBL:+this.value})">
            <input type="number" min="0" max="1200" value="${sc2.xBL}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{xBL:+this.value})"></div>
          <div class="title-row"><span>Y haut</span>
            <input type="range" min="0" max="1200" value="${sc2.yT}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{yT:+this.value})">
            <input type="number" min="0" max="1200" value="${sc2.yT}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{yT:+this.value})"></div>
          <div class="title-row"><span>Largeur</span>
            <input type="range" min="50" max="700" value="${sc2.w}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{w:+this.value})">
            <input type="number" min="50" max="700" value="${sc2.w}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{w:+this.value})"></div>
          <div class="title-row"><span>Hauteur</span>
            <input type="range" min="50" max="500" value="${sc2.h}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{h:+this.value})">
            <input type="number" min="50" max="500" value="${sc2.h}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{h:+this.value})"></div>
          <div class="slot-editor-section-label" style="margin-top:6px;">✏️ Position du nom</div>
          <div class="title-row"><span>X nom</span>
            <input type="range" min="0" max="1400" value="${sc2.nameX}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{nameX:+this.value})">
            <input type="number" min="0" max="1400" value="${sc2.nameX}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{nameX:+this.value})"></div>
          <div class="title-row"><span>Y nom</span>
            <input type="range" min="100" max="1380" value="${sc2.nameY}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})">
            <input type="number" min="100" max="1380" value="${sc2.nameY}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})"></div>
          <button class="btn" style="width:100%;font-size:10px;padding:3px;margin-top:4px;"
                  onclick="resetSlotCfg(${i})">↩ Reset cases</button>
        </div>
      </details>` : '';

    // ── Contrôles cartes 2XKO ──
    const xkoControls = (sc2 && layout?.slotType === '2xko') ? `
      <details class="slot-editor-details">
        <summary>🎴 Cartes ${rankDisp[i]||i+1}</summary>
        <div class="slot-editor-inner">
          <div class="slot-editor-row-colors">
            <label class="slot-label">Contour</label>
            <input type="color" value="${sc2.strokeColor}" class="color-pick"
                   oninput="syncSlot(${i},{strokeColor:this.value})" title="Couleur du contour">
            <label class="slot-label" style="margin-left:8px;">Épais.</label>
            <input type="number" min="0" max="20" step="0.5" value="${sc2.strokeWidth}" style="width:44px;"
                   oninput="syncSlot(${i},{strokeWidth:+this.value})">
          </div>
          <div class="title-row"><span>Centre X</span>
            <input type="range" min="100" max="1300" value="${sc2.cx}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{cx:+this.value})">
            <input type="number" min="100" max="1300" value="${sc2.cx}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{cx:+this.value})"></div>
          <div class="title-row"><span>Centre Y</span>
            <input type="range" min="100" max="1300" value="${sc2.cy}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{cy:+this.value})">
            <input type="number" min="100" max="1300" value="${sc2.cy}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{cy:+this.value})"></div>
          <div class="title-row"><span>Largeur carte</span>
            <input type="range" min="50" max="500" value="${sc2.w}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{w:+this.value})">
            <input type="number" min="50" max="500" value="${sc2.w}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{w:+this.value})"></div>
          <div class="title-row"><span>Hauteur carte</span>
            <input type="range" min="50" max="700" value="${sc2.h}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{h:+this.value})">
            <input type="number" min="50" max="700" value="${sc2.h}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{h:+this.value})"></div>
          <div class="title-row"><span>Écart entre persos</span>
            <input type="range" min="0" max="120" value="${sc2.gap}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{gap:+this.value})">
            <input type="number" min="0" max="120" value="${sc2.gap}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{gap:+this.value})"></div>
          <div class="title-row"><span>Inclinaison</span>
            <input type="range" min="-150" max="150" value="${sc2.slant}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{slant:+this.value})">
            <input type="number" min="-150" max="150" value="${sc2.slant}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{slant:+this.value})"></div>
          <div class="title-row"><span>Y nom</span>
            <input type="range" min="100" max="1380" value="${sc2.nameY}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})">
            <input type="number" min="100" max="1380" value="${sc2.nameY}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{nameY:+this.value})"></div>
          <div class="slot-editor-section-label" style="margin-top:6px;">🏅 Numéro de rang</div>
          <div class="title-row"><span>X rang</span>
            <input type="range" min="0" max="1400" value="${sc2.rankX}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{rankX:+this.value})">
            <input type="number" min="0" max="1400" value="${sc2.rankX}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{rankX:+this.value})"></div>
          <div class="title-row"><span>Y rang</span>
            <input type="range" min="0" max="1400" value="${sc2.rankY}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{rankY:+this.value})">
            <input type="number" min="0" max="1400" value="${sc2.rankY}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{rankY:+this.value})"></div>
          <div class="title-row"><span>Taille rang</span>
            <input type="range" min="20" max="150" value="${sc2.rankSize}" style="flex:1"
                   oninput="this.nextElementSibling.value=this.value;syncSlot(${i},{rankSize:+this.value})">
            <input type="number" min="20" max="150" value="${sc2.rankSize}" style="width:52px;"
                   oninput="this.previousElementSibling.value=this.value;syncSlot(${i},{rankSize:+this.value})"></div>
          <button class="btn" style="width:100%;font-size:10px;padding:3px;margin-top:4px;"
                  onclick="resetSlotCfg(${i})">↩ Reset cartes</button>
        </div>
      </details>` : '';

    const cardControls = tekken8Controls || xkoControls || ssbuControls;

    const block = document.createElement('div');
    block.className = 'name-player-block';
    block.innerHTML = `
      <div class="name-player-header">
        <div class="name-rank-badge">${rankDisp[i]||i+1}</div>
        <input type="text" placeholder="Team" value="${escHtml(p.team||'')}"
               oninput="players[${i}].team=this.value;renderSlots();generatePreview();"
               style="width:54px;font-size:12px;padding:5px 7px;">
        <input type="text" placeholder="Pseudo" value="${escHtml(p.name||'')}"
               oninput="players[${i}].name=this.value;renderSlots();generatePreview();"
               style="flex:1;font-size:12px;padding:5px 7px;">
        <input type="color" value="${cfg.color}" class="color-pick"
               oninput="syncNamePlayer(${i},{color:this.value})" title="Couleur du nom">
      </div>
      <div class="name-player-sliders">
        <div class="title-row">
          <span>Taille</span>
          <input type="range" min="10" max="110" value="${cfg.size}" style="flex:1"
                 oninput="this.nextElementSibling.value=this.value;syncNamePlayer(${i},{size:+this.value})">
          <input type="number" min="10" max="110" value="${cfg.size}" style="width:52px;"
                 oninput="this.previousElementSibling.value=this.value;syncNamePlayer(${i},{size:+this.value})">
        </div>
        <div class="title-row">
          <span>Décalage X</span>
          <input type="range" min="-400" max="400" value="${cfg.xOffset}" style="flex:1"
                 oninput="this.nextElementSibling.value=this.value;syncNamePlayer(${i},{xOffset:+this.value})">
          <input type="number" min="-400" max="400" value="${cfg.xOffset}" style="width:52px;"
                 oninput="this.previousElementSibling.value=this.value;syncNamePlayer(${i},{xOffset:+this.value})">
        </div>
        <div class="title-row">
          <span>Décalage Y</span>
          <input type="range" min="-400" max="400" value="${cfg.yOffset}" style="flex:1"
                 oninput="this.nextElementSibling.value=this.value;syncNamePlayer(${i},{yOffset:+this.value})">
          <input type="number" min="-400" max="400" value="${cfg.yOffset}" style="width:52px;"
                 oninput="this.previousElementSibling.value=this.value;syncNamePlayer(${i},{yOffset:+this.value})">
        </div>
        <button class="btn" style="width:100%;font-size:10px;padding:3px;margin-top:2px;"
                onclick="resetPlayerNameCfg(${i})">↩ Reset nom</button>
      </div>
      ${cardControls}
    `;
    container.appendChild(block);
  });
}

function syncNamePlayer(i, patch) {
  savePlayerNameCfg(i, patch);
  _renderAll();
}

function _renderAll() {
  renderCanvas(document.getElementById('previewCanvas'), 1400);
  renderEditorCanvas();
}

function resetPlayerNameCfg(i) {
  if (_nameCfgsMem[currentGame]?.players?.[i]) {
    _nameCfgsMem[currentGame].players[i] = null;
    _saveNameCfgsToStorage();
  }
  renderNameEditor();
  _renderAll();
}

function syncTitle() {
  ['t1','t2','t3'].forEach(t => {
    ['x','y','s','l'].forEach(prop => {
      const slider = document.getElementById(`${t}${prop}`);
      const num    = document.getElementById(`${t}${prop}_n`);
      if (slider && num) num.value = slider.value;
      if (slider) CONFIG[t.toUpperCase()][prop] = parseFloat(slider.value);
    });
    const col = document.getElementById(`${t}color`);
    if (col) CONFIG[t.toUpperCase()].color = col.value;
    const scol = document.getElementById(`${t}strokecolor`);
    if (scol) CONFIG[t.toUpperCase()].strokeColor = scol.value;
    const sw = document.getElementById(`${t}strokew`);
    if (sw) CONFIG[t.toUpperCase()].strokeWidth = parseFloat(sw.value) || 0;
  });
  saveTitleConfig();
  _renderAll();
}

function syncTitleNum(sliderId, numId) {
  const slider = document.getElementById(sliderId);
  const num    = document.getElementById(numId);
  if (slider && num) {
    slider.value = num.value;
    const parts = sliderId.match(/^(t\d)([xysl])$/);
    if (parts) CONFIG[parts[1].toUpperCase()][parts[2]] = parseFloat(num.value);
  }
  saveTitleConfig();
  _renderAll();
}

function resetTitleEditor() {
  CONFIG.T1 = {...TITLE_DEFAULTS.T1};
  CONFIG.T2 = {...TITLE_DEFAULTS.T2};
  CONFIG.T3 = {...TITLE_DEFAULTS.T3};
  const all = getTitleConfigs();
  delete all[currentGame];
  localStorage.setItem('top8_title_configs', JSON.stringify(all));
  initTitleEditor();
  generatePreview();
}

// ── CONFIG NOMS PAR JOUEUR ────────────────────────────────────────────────────

const NAME_SIZE_DEFAULTS = { ssbu:20, ggst:20, tekken8:48, '2xko':40, sf6:20, dbfz:20 };

// Stockage en mémoire (plus rapide, sans délai localStorage)
let _nameCfgsMem = {};

function _loadNameCfgsFromStorage() {
  try { _nameCfgsMem = JSON.parse(localStorage.getItem('top8_name_configs') || '{}'); } catch { _nameCfgsMem = {}; }
}
function _saveNameCfgsToStorage() {
  try { localStorage.setItem('top8_name_configs', JSON.stringify(_nameCfgsMem)); } catch {}
}
function getPlayerNameCfg(i) {
  const def = { size: NAME_SIZE_DEFAULTS[currentGame] || 20, xOffset:0, yOffset:0, color:'#ffffff' };
  const saved = _nameCfgsMem[currentGame]?.players?.[i];
  return { ...def, ...(saved || {}) };
}
function savePlayerNameCfg(i, data) {
  if (!_nameCfgsMem[currentGame]) _nameCfgsMem[currentGame] = { players: [] };
  while (_nameCfgsMem[currentGame].players.length <= i)
    _nameCfgsMem[currentGame].players.push(null);
  _nameCfgsMem[currentGame].players[i] = { ...getPlayerNameCfg(i), ...data };
  _saveNameCfgsToStorage();
}
function resetAllPlayerNameCfgs() {
  delete _nameCfgsMem[currentGame];
  _saveNameCfgsToStorage();
}
function loadNameConfig() { /* no-op — per-player now */ }

// ── CONFIG FORMES PAR SLOT (Tekken 8 etc.) ───────────────────────────────────

let _slotCfgsMem = {};

function _loadSlotCfgsFromStorage() {
  try { _slotCfgsMem = JSON.parse(localStorage.getItem('top8_slot_configs') || '{}'); } catch { _slotCfgsMem = {}; }
}
function _saveSlotCfgsToStorage() {
  try {
    localStorage.setItem('top8_slot_configs', JSON.stringify(_slotCfgsMem));
    _showLayoutSavedToast();
  } catch {}
}

let _layoutToastTimer;
function _showLayoutSavedToast(msg = '💾 Layout sauvegardé') {
  let toast = document.getElementById('layoutSavedToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'layoutSavedToast';
    toast.className = 'layout-saved-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_layoutToastTimer);
  _layoutToastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

const SSBU_NAME_XS = [647,1125,657,1113,657,1125,657,1135];
const SSBU_NAME_YS = [543,543,804,804,1068,1068,1326,1326];

function getSlotCfg(i) {
  const layout = LAYOUTS[currentGame];
  const saved  = _slotCfgsMem[currentGame]?.slots?.[i];

  if (layout?.useParallelogram) {
    // SSBU / DBFZ — deux parallélogrammes par slot
    const bsl = CONFIG.BLACK_SLOTS[i]  || {};
    const psl = CONFIG.PURPLE_SLOTS[i] || {};
    const defaults = {
      // Case principale (noire)
      xBL: bsl.xBL, yT: bsl.yT, w: bsl.w, h: bsl.h,
      fillColor: BLACK_COLORS[i] || '#d69bfe',
      // Case rang (violette)
      pxBL: psl.xBL, pyT: psl.yT, pw: psl.w, ph: psl.h,
      purpleColor: PURPLE_COLORS[i] || '#b8c4ff',
      // Position du nom
      nameX: SSBU_NAME_XS[i] ?? 700,
      nameY: SSBU_NAME_YS[i] ?? 600,
    };
    return { ...defaults, ...(saved || {}) };
  }

  // 2XKO — 2 personnages par joueur
  if (layout?.slotType === '2xko') {
    const slot = layout?.slots?.[i] || {};
    const defaults = {
      cx: slot.cx || 700, cy: slot.cy || 700,
      w:  slot.w  || 220, h:  slot.h  || 420,
      gap:   slot.gap   || 20,
      slant: slot.slant || 28,
      nameY: slot.nameY || 900,
      rankX: slot.rankX || 460, rankY: slot.rankY || 300,
      rankSize: slot.rankSize || 80,
      nameSize: slot.nameSize || 42,
      strokeColor: '#C8A800',
      strokeWidth: 4.0,
    };
    return { ...defaults, ...(saved || {}) };
  }

  // Tekken8 / autres formes
  const slot = layout?.slots?.[i] || {};
  const defaults = {
    cx: slot.cx || 700, cy: slot.cy || 700,
    w: slot.w || 250, h: slot.h || 380,
    skewTop: slot.skewTop || 55,
    nameY: slot.nameY || 900,
    fillColor: '#17171c',
    strokeColor: '#e0142a',
    strokeWidth: 5.5,
  };
  return { ...defaults, ...(saved || {}) };
}
function saveSlotCfg(i, data) {
  if (!_slotCfgsMem[currentGame]) _slotCfgsMem[currentGame] = { slots: [] };
  while (_slotCfgsMem[currentGame].slots.length <= i)
    _slotCfgsMem[currentGame].slots.push(null);
  _slotCfgsMem[currentGame].slots[i] = { ...getSlotCfg(i), ...data };
  _saveSlotCfgsToStorage();
}
function syncSlot(i, data) {
  saveSlotCfg(i, data);
  _renderAll();
}
function resetSlotCfg(i) {
  if (_slotCfgsMem[currentGame]?.slots?.[i]) {
    _slotCfgsMem[currentGame].slots[i] = null;
    _saveSlotCfgsToStorage();
  }
  renderNameEditor();
  _renderAll();
}

// ── FOND DANS L'ÉDITEUR ───────────────────────────────────────────────────────
function loadBgEditor(event) {
  loadBg(event); // réutilise la même logique
  const file = event.target.files[0];
  if (file) {
    // Mise à jour du label dans le panneau gauche
    const el = document.getElementById('uploadContentEditor');
    if (el) el.innerHTML = `✅ <strong>${file.name}</strong>`;
    // Mise à jour du label rapide dans la colonne preview
    const ql = document.getElementById('editorBgLabel');
    if (ql) ql.textContent = file.name;
  }
}

// Compose le nom d'affichage d'un joueur pour les tweets : "TEAM | NAME" si team.
function formatPlayerForTweet(p) {
  if (!p) return '???';
  const n = p.name || '???';
  return p.team ? `${p.team} | ${n}` : n;
}

// Template de tweet personnalisable (sauvegardé en localStorage)
const DEFAULT_TWEET_TEMPLATE = '🏆 {tournament} — {game}{suffix}\n\n{top}\n\nMerci à tous ! 🎮 #FGC #{tag}';
function getTweetTemplate() {
  try { return localStorage.getItem('tweet_template') || DEFAULT_TWEET_TEMPLATE; }
  catch { return DEFAULT_TWEET_TEMPLATE; }
}
function saveTweetTemplate(tpl) {
  try {
    if (tpl && tpl !== DEFAULT_TWEET_TEMPLATE) localStorage.setItem('tweet_template', tpl);
    else localStorage.removeItem('tweet_template');
  } catch {}
}

// Substitue les variables du template avec les données du graphe.
function applyTweetTemplate(template, vars) {
  let text = template;
  for (const [k, v] of Object.entries(vars)) {
    text = text.split(k).join(String(v));
  }
  return text;
}

function updateTweet() {
  const name = document.getElementById('tournamentName')?.value || 'Lorem Ipsum';
  const game = GAMES[currentGame]?.name || currentGame;
  document.getElementById('tweetText').value =
    buildTweetText(name, game, players, 0, 1);
}



function triggerDownload() {
  // Essaye d'abord depuis le canvas preview déjà rendu (évite les erreurs CORS)
  try {
    const preview = document.getElementById('previewCanvas');
    if (preview && preview.width > 0) {
      const dataUrl = preview.toDataURL('image/png');
      const name = (document.getElementById('tournamentName') || {}).value || 'tournoi';
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'top8_' + currentGame + '_' + name.replace(/\s/g, '_') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
  } catch(e) {}

  // Fallback : créer un nouveau canvas (peut échouer en file://)
  try {
    const canvas = document.createElement('canvas');
    renderCanvas(canvas, 700);
    const name = (document.getElementById('tournamentName') || {}).value || 'tournoi';
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'top8_' + currentGame + '_' + name.replace(/\s/g, '_') + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch(e) {
    alert('Impossible de télécharger : ' + e.message + '\n\nAstuce : utilise le bouton ⬇ Télécharger à la place.');
    return false;
  }
}
// ── THREAD MODAL ─────────────────────────────────────────────────────────────

function closeThreadModal() {
  document.getElementById('threadModal').style.display = 'none';
}

function openThreadModal() {
  const modal = document.getElementById('threadModal');
  modal.style.display = 'flex';
  document.getElementById('threadLoading').style.display = 'block';
  document.getElementById('threadReady').style.display = 'none';
  document.getElementById('threadLoadingMsg').textContent = 'Génération des images...';
}

// Génère le texte d'un tweet pour un graph en appliquant le template configurable.
// Variables disponibles : {tournament} {game} {tag} {idx} {total} {suffix} {top}
//                         {1er} {2eme} {3eme}
function buildTweetText(tournamentName, gameName, playersList, idx, total) {
  const emojis = ['🥇','🥈','🥉','4️⃣','5️⃣','5️⃣','7️⃣','7️⃣'];
  const top = playersList.slice(0,3)
    .map((p,j) => `${emojis[j]} ${formatPlayerForTweet(p)}`)
    .join('\n');
  const tag = (gameName || '').replace(/[^a-zA-Z0-9]/g,'');
  const suffix = total > 1 ? ` (${idx+1}/${total})` : '';

  return applyTweetTemplate(getTweetTemplate(), {
    '{tournament}': tournamentName || '',
    '{game}':       gameName || '',
    '{tag}':        tag,
    '{idx}':        idx + 1,
    '{total}':      total,
    '{suffix}':     suffix,
    '{top}':        top,
    '{1er}':        playersList[0] ? formatPlayerForTweet(playersList[0]) : '',
    '{2eme}':       playersList[1] ? formatPlayerForTweet(playersList[1]) : '',
    '{3eme}':       playersList[2] ? formatPlayerForTweet(playersList[2]) : '',
  });
}

// ── PHOTOS DISCORD (queue alimentée par les réactions 📤 du bot) ─────────────
// Récupère la config bot depuis l'onglet Discord (réutilise les champs existants).
function getDcBotConfig() {
  const url    = (document.getElementById('dcBotUrl')?.value    || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcSecret')?.value    || '').trim();
  return { url, secret };
}

window._discordPhotos        = []; // photos chargées depuis le bot
window._selectedDiscordPhotos = new Set(); // ids (att.id) sélectionnés

function saveDiscordPhotoChannel() {
  const sel = document.getElementById('discordPhotoChannel');
  if (!sel) return;
  try { localStorage.setItem('dc_photo_channel', sel.value || ''); } catch {}
}

function loadDiscordPhotoChannelFromStorage() {
  const sel = document.getElementById('discordPhotoChannel');
  if (!sel) return;
  try {
    const saved = localStorage.getItem('dc_photo_channel') || '';
    if (saved && [...sel.options].some(o => o.value === saved)) sel.value = saved;
  } catch {}
}

// Charge la liste des canaux du serveur dans le dropdown
async function loadDiscordChannels() {
  const sel = document.getElementById('discordPhotoChannel');
  const status = document.getElementById('discordPhotosStatus');
  if (!sel) return;
  const { url, secret } = getDcBotConfig();
  if (!url || !secret) {
    if (status) {
      status.textContent = '⚠️ URL bot ou secret manquant — configure-les dans l\'onglet ⚙️ Configuration.';
      status.style.color = '#b83d3d';
    }
    return;
  }
  try {
    const res = await fetch(`${url}/channels`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    sel.innerHTML = '<option value="">— Choisis un canal —</option>' +
      (data.channels || []).map(c =>
        `<option value="${c.id}">#${c.name}${c.category ? ' — ' + c.category : ''}</option>`
      ).join('');
    loadDiscordPhotoChannelFromStorage();
    if (status) {
      status.textContent = `${(data.channels || []).length} canaux disponibles. Choisis-en un et clique ↻ Charger.`;
      status.style.color = '#888';
    }
  } catch(e) {
    if (status) {
      status.textContent = `❌ Erreur chargement canaux : ${e.message}`;
      status.style.color = '#b83d3d';
    }
  }
}

async function loadDiscordPhotos() {
  const status = document.getElementById('discordPhotosStatus');
  const sel    = document.getElementById('discordPhotoChannel');
  if (!status) return;
  const { url, secret } = getDcBotConfig();
  if (!url || !secret) {
    status.textContent = '⚠️ URL bot ou secret manquant — configure-les dans l\'onglet ⚙️ Configuration.';
    status.style.color = '#b83d3d';
    return;
  }
  // Si la dropdown est vide, charger les canaux d'abord
  if (sel && sel.options.length <= 1) await loadDiscordChannels();

  const channelId = sel?.value || '';
  status.textContent = '⏳ Chargement des photos…';
  status.style.color = '#888';
  try {
    const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}&limit=30` : '?limit=30';
    const res = await fetch(`${url}/channel-images${qs}`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    window._discordPhotos = data.photos || [];
    renderDiscordPhotosGrid();
    status.textContent = window._discordPhotos.length
      ? `${window._discordPhotos.length} photo(s) — clic pour sélectionner (max 3 par tweet).`
      : 'Aucune photo trouvée dans ce canal.';
    status.style.color = '#888';
  } catch(e) {
    status.textContent = `❌ Erreur : ${e.message}`;
    status.style.color = '#b83d3d';
  }
}

function renderDiscordPhotosGrid() {
  const grid = document.getElementById('discordPhotosGrid');
  if (!grid) return;
  const photos = window._discordPhotos || [];
  if (!photos.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = photos.map(p => {
    const sel = window._selectedDiscordPhotos.has(p.id);
    return `<div onclick="toggleDiscordPhoto('${p.id}')"
      style="position:relative;cursor:pointer;border-radius:6px;overflow:hidden;border:2px solid ${sel ? '#7a5fca' : 'transparent'};aspect-ratio:1;background:#fff;">
      <img src="${p.url}" alt="${escHtml(p.author || '')}"
        style="width:100%;height:100%;object-fit:cover;display:block;">
      ${sel ? `<div style="position:absolute;top:2px;right:2px;background:#7a5fca;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;">✓</div>` : ''}
    </div>`;
  }).join('');
}

function toggleDiscordPhoto(id) {
  const sel = window._selectedDiscordPhotos;
  if (sel.has(id)) sel.delete(id);
  else if (sel.size < 3) sel.add(id);
  else { alert('Maximum 3 photos par tweet (X autorise 4 images max, dont le Top 8).'); return; }
  renderDiscordPhotosGrid();
}

// Télécharge les photos Discord sélectionnées avec un préfixe par tweet.
// Retourne une liste de noms de fichiers téléchargés.
async function downloadSelectedDiscordPhotos(prefix) {
  const photos = (window._discordPhotos || []).filter(p => window._selectedDiscordPhotos.has(p.id));
  const letters = ['a','b','c'];
  const filenames = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    try {
      const r = await fetch(p.url, { mode: 'cors' });
      const blob = await r.blob();
      const ext = (p.filename || '').split('.').pop() || 'png';
      const filename = `${prefix}_photo_${letters[i]}.${ext}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      filenames.push(filename);
    } catch(e) {
      console.warn(`Photo ${p.id} non téléchargée :`, e.message);
    }
  }
  return filenames;
}

// Rendu unifié de la liste des tweets (single et multi modes).
// Lit window._threadItems et reconstruit le DOM.
function renderThreadList() {
  const list = document.getElementById('threadList');
  if (!list) return;
  const items = window._threadItems || [];

  const allBtn = items.length > 1
    ? `<button class="btn-thread-all" onclick="threadOpenAll()">🚀 Tout ouvrir d'un coup</button>`
    : '';

  list.innerHTML = allBtn + items.map((it, idx) => {
    const photoLines = (it.photoFilenames || [])
      .map(f => `<div class="thread-item-filename">📎 ${escHtml(f)}</div>`)
      .join('');
    return `
    <div class="thread-item" id="threadItem${idx}">
      <div class="thread-item-num">${it.num}</div>
      <div class="thread-item-body">
        <div class="thread-item-game">${escHtml(it.game)}</div>
        <div class="thread-item-text" id="threadItemText${idx}">${escHtml(it.text)}</div>
        <div class="thread-item-filename">📎 ${escHtml(it.filename)}</div>
        ${photoLines}
        <div class="thread-item-actions">
          <button class="btn-tweet-copy" onclick="threadCopy(${idx})" id="threadCopyBtn${idx}">📋 Copier texte</button>
          <button class="btn-tweet-copy" onclick="threadCopyImage(${idx})" id="threadImgBtn${idx}" ${it.dataUrl ? '' : 'disabled'}>🖼️ Copier image</button>
          <button class="btn-tweet-open" onclick="threadOpen(${idx})">𝕏 Ouvrir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Copie l'image du graphe dans le presse-papier (utilisable avec Ctrl+V sur X).
async function threadCopyImage(idx) {
  const items = window._threadItems || [];
  const it = items[idx];
  if (!it?.dataUrl) return;
  const btn = document.getElementById(`threadImgBtn${idx}`);
  try {
    const blob = await (await fetch(it.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = '✅ Image copiée !';
      setTimeout(() => { btn.textContent = prev; }, 2000);
    }
  } catch(e) {
    alert(`Copie d'image non supportée par ce navigateur.\nUtilise le PNG téléchargé à la place.\n\nDétail : ${e.message}`);
  }
}

// ── ÉDITEUR DE TEMPLATE DE TWEET ─────────────────────────────────────────────
function toggleTweetTemplateEditor() {
  const ed = document.getElementById('tweetTemplateEditor');
  if (!ed) return;
  const visible = ed.style.display !== 'none';
  if (visible) { ed.style.display = 'none'; return; }
  // Pré-remplir avec le template courant
  const ta = document.getElementById('tweetTemplateInput');
  if (ta) ta.value = getTweetTemplate();
  ed.style.display = 'block';
}

function applyTweetTemplateFromEditor() {
  const ta = document.getElementById('tweetTemplateInput');
  if (!ta) return;
  saveTweetTemplate(ta.value);
  // Régénérer tous les tweets en mémoire
  const items = window._threadItems || [];
  items.forEach(it => {
    if (!it.src) return;
    const newText = buildTweetText(it.src.tournamentName, it.src.gameName, it.src.players, it.src.idx, it.src.total);
    it.text = newText;
    it.tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(newText);
  });
  renderThreadList();
  // Aussi rafraîchir le textarea single-mode si présent
  if (typeof updateTweet === 'function' && document.getElementById('tweetText')) updateTweet();
}

function resetTweetTemplate() {
  saveTweetTemplate(null);
  const ta = document.getElementById('tweetTemplateInput');
  if (ta) ta.value = DEFAULT_TWEET_TEMPLATE;
  applyTweetTemplateFromEditor();
}

// Télécharge un canvas en PNG et retourne le nom de fichier
function downloadCanvas(canvas, filename) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return filename;
}

// Précharge les images murals pour un jeu+joueurs donné
function preloadMurals(gameId, playersList) {
  const loads = [];
  playersList.forEach(p => {
    if (p.charId) loads.push(new Promise(resolve => {
      const key = `${gameId}_${p.charId}_${p.costume}`;
      if (imgCache[key]?._loaded) { resolve(); return; }
      if (!imgCache[key]) imgCache[key] = {_loaded:false, _img:null};
      const img = new Image();
      img.onload  = () => { imgCache[key]._loaded=true; imgCache[key]._img=img; resolve(); };
      img.onerror = () => resolve();
      img.src = getMuralArtUrl(p.charId, p.costume, gameId);
    }));
    // Fallback start.gg image : on précharge TOUJOURS quand charImgUrl est
    // défini, même si charId existe — car le mural local peut 404 (perso
    // pas dans le repo d'assets, ex. Alex SF6 en attendant l'upload).
    // drawMagnaCard utilise le local si chargé, sinon ce fallback.
    if (p.charImgUrl) loads.push(new Promise(resolve => {
      const key = `__sg__${p.charImgUrl}`;
      if (imgCache[key]?._loaded) { resolve(); return; }
      if (!imgCache[key]) imgCache[key] = {_loaded:false, _img:null};
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { imgCache[key]._loaded=true; imgCache[key]._img=img; resolve(); };
      img.onerror = () => resolve();
      img.src = p.charImgUrl;
    }));
    if (p.charId2) loads.push(new Promise(resolve => {
      const key2 = `${gameId}_${p.charId2}_${p.costume2||1}`;
      if (imgCache[key2]?._loaded) { resolve(); return; }
      if (!imgCache[key2]) imgCache[key2] = {_loaded:false, _img:null};
      const img = new Image();
      img.onload  = () => { imgCache[key2]._loaded=true; imgCache[key2]._img=img; resolve(); };
      img.onerror = () => resolve();
      img.src = getMuralArtUrl(p.charId2, p.costume2||1, gameId);
    }));
  });
  return Promise.all(loads);
}

function postToTwitter() {
  // Mode simple (1 seul jeu, pas de multi-graph)
  const tournamentName = document.getElementById('tournamentName')?.value || 'Lorem Ipsum';
  const gameName = GAME_LABELS[currentGame] || currentGame;
  const text = document.getElementById('tweetText')?.value ||
               buildTweetText(tournamentName, gameName, players, 0, 1);
  const filename = `top8_${currentGame}_${tournamentName.replace(/\s/g,'_')}.png`;

  openThreadModal();
  document.getElementById('threadLoadingMsg').textContent = 'Génération de l\'image…';

  preloadMurals(currentGame, players).then(async () => {
    const canvas = document.createElement('canvas');
    renderCanvas(canvas, 1400);
    let dataUrl = null;
    try { dataUrl = canvas.toDataURL('image/png'); } catch(e) {}

    // Photos Discord sélectionnées : on garde leurs URLs en mémoire (pas de
    // téléchargement automatique). L'utilisateur copie l'image principale via
    // "Copier image" puis colle dans X.
    const photoFilenames = [];

    // Afficher le panneau prêt
    document.getElementById('threadLoading').style.display = 'none';
    document.getElementById('threadReady').style.display = 'block';

    const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    window._threadItems = [{
      num: 1, game: gameName, text, filename, tweetUrl, dataUrl,
      photoFilenames,
      src: { tournamentName, gameName, players: [...players], idx: 0, total: 1 },
    }];
    renderThreadList();
  });
}

async function postToInstagram() {
  // Récupère la config bot (clés localStorage partagées avec Discord/Tournament Watch)
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  if (!botUrl || !secret) {
    alert('⚠️ Le QR Instagram nécessite que le bot soit configuré.\nOnglet Configuration → URL du bot + Secret.');
    return;
  }
  // Extrait le PNG du canvas de preview
  const preview = document.getElementById('previewCanvas');
  if (!preview || !preview.width) {
    alert('Aucun aperçu disponible. Génère d\'abord le Top 8.');
    return;
  }
  const text = (document.getElementById('tweetText') || {}).value || '';
  const name = (document.getElementById('tournamentName') || {}).value || 'tournoi';
  const filename = 'top8_' + (typeof currentGame !== 'undefined' ? currentGame + '_' : '') + name.replace(/\s/g, '_') + '.png';
  let pngBase64;
  try {
    pngBase64 = preview.toDataURL('image/png');
  } catch (e) {
    alert('Impossible de lire l\'aperçu : ' + e.message);
    return;
  }
  // Affiche la modale en état "chargement" pendant l'upload
  showInstaQRModal({ loading: true });
  try {
    const r = await fetch(`${botUrl}/insta-share/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: JSON.stringify({ pngBase64, text, filename }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.url) throw new Error('Réponse invalide du serveur');
    showInstaQRModal({ url: data.url });
  } catch (e) {
    closeInstaQRModal();
    alert('Erreur d\'upload : ' + e.message);
  }
}

// Modale QR code pour scanner avec le téléphone
function showInstaQRModal(opts) {
  opts = opts || {};
  let modal = document.getElementById('instaQRModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'instaQRModal';
    modal.className = 'insta-qr-modal';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeInstaQRModal();
    });
    document.body.appendChild(modal);
  }
  if (opts.loading) {
    modal.innerHTML = `
      <div class="insta-qr-box">
        <div class="insta-qr-spinner"></div>
        <div class="insta-qr-loading">Upload de l'image…</div>
      </div>`;
    modal.style.display = 'flex';
    return;
  }
  if (opts.url) {
    // QR code via api.qrserver.com (gratuit, fiable, pas de dépendance JS)
    const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=' + encodeURIComponent(opts.url);
    modal.innerHTML = `
      <div class="insta-qr-box">
        <button type="button" class="insta-qr-close" onclick="closeInstaQRModal()" title="Fermer">✕</button>
        <h2 class="insta-qr-title">📷 Scanne avec ton téléphone</h2>
        <p class="insta-qr-sub">Ouvre l'appareil photo de ton téléphone et vise le QR code ci-dessous.</p>
        <div class="insta-qr-imgwrap"><img src="${qrSrc}" alt="QR code" class="insta-qr-img"></div>
        <p class="insta-qr-hint">Sur la page qui s'ouvre, appuie sur <strong>Partager → Instagram</strong>.</p>
        <div class="insta-qr-url-row">
          <input type="text" class="insta-qr-url" value="${opts.url}" readonly onclick="this.select()">
          <button type="button" class="insta-qr-copy" onclick="navigator.clipboard.writeText('${opts.url}').then(()=>{this.textContent='✓'; setTimeout(()=>this.textContent='📋',1500);})">📋</button>
        </div>
        <p class="insta-qr-expire">⏱️ Lien valide 30 minutes.</p>
      </div>`;
    modal.style.display = 'flex';
  }
}
function closeInstaQRModal() {
  const modal = document.getElementById('instaQRModal');
  if (modal) modal.style.display = 'none';
}
// ── EYEDROPPER (pipette écran) ────────────────────────────────────────────────
function openEyeDropper(inputEl) {
  if (!('EyeDropper' in window)) {
    alert('La pipette nécessite Chrome 95+ ou Edge 95+.');
    return;
  }
  new EyeDropper().open()
    .then(({ sRGBHex }) => {
      inputEl.value = sRGBHex;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    })
    .catch(() => {}); // annulé par l'utilisateur
}

function injectColorExtras() {
  // Injecte un champ hex + bouton pipette après chaque color-pick
  document.querySelectorAll('.color-pick:not([data-hex])').forEach(input => {
    input.setAttribute('data-hex', '1');

    // ── Champ texte hexadécimal ──
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'hex-input';
    hexInput.value = input.value || '#ffffff';
    hexInput.maxLength = 7;
    hexInput.spellcheck = false;
    hexInput.title = 'Code hexadécimal (ex: #ff0000)';

    // Color picker → hex input
    input.addEventListener('input', () => { hexInput.value = input.value; });

    // Hex input → color picker (validation en direct)
    hexInput.addEventListener('input', () => {
      let v = hexInput.value.trim();
      if (v.length && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        hexInput.classList.remove('hex-invalid');
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        hexInput.classList.toggle('hex-invalid', v.length > 1);
      }
    });

    // Blur : normalise ou revient à la valeur du color picker
    hexInput.addEventListener('blur', () => {
      let v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      hexInput.classList.remove('hex-invalid');
      hexInput.value = /^#[0-9a-fA-F]{6}$/.test(v) ? v : input.value;
    });

    input.after(hexInput);

    // ── Bouton pipette (Chrome/Edge 95+) ──
    if ('EyeDropper' in window) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'eyedropper-btn';
      btn.title = "Pipette — prélever une couleur à l'écran";
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.41-1.42-1.42 1.42 1.41 1.41-6.6 6.6A2 2 0 0 0 5 16v3h3a2 2 0 0 0 1.42-.59l6.6-6.6 1.41 1.42 1.42-1.42-1.42-1.41 3.12-3.12a1 1 0 0 0 0-1.65z"/></svg>`;
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openEyeDropper(input); };
      hexInput.after(btn);
    }
  });
}

function initEyeDroppers() {
  injectColorExtras();
  let debounce;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(injectColorExtras, 80);
  }).observe(document.body, { childList: true, subtree: true });
}

function downloadImage() {
  const toLoad = players.filter(p=>p.charId).map(p => new Promise(resolve => {
    const key=`${currentGame}_${p.charId}_${p.costume}`;
    if(imgCache[key]?._loaded){resolve();return;}
    if(!imgCache[key]) imgCache[key]={_loaded:false,_img:null};
    const img=new Image();
    img.onload=()=>{imgCache[key]._loaded=true;imgCache[key]._img=img;resolve();};
    img.onerror=()=>resolve();
    img.src=getMuralArtUrl(p.charId,p.costume,currentGame);
  }));
  Promise.all(toLoad).then(()=>{
    const canvas=document.createElement('canvas');
    renderCanvas(canvas,1400);
    const name=document.getElementById('tournamentName').value||'tournoi';
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=`top8_${currentGame}_${name.replace(/\s/g,'_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// ── DAY/NIGHT SLIDER ─────────────────────────────────────────────────────────
function initDNSlider() {
  const slider = document.getElementById('dnSlider');
  if (!slider) return;

  let _t = 0; // 0 = jour, 1 = nuit

  function setT(v) {
    _t = Math.max(0, Math.min(1, v));
    slider.style.setProperty('--t', _t);
    const night = _t >= 0.5;
    document.body.classList.toggle('night-mode', night);
    slider.setAttribute('aria-checked', String(night));
    const lblDay   = document.getElementById('dnLblDay');
    const lblNight = document.getElementById('dnLblNight');
    if (lblDay)   lblDay.classList.toggle('active',  !night);
    if (lblNight) lblNight.classList.toggle('active',  night);
  }

  // ── Pointer drag / tap ─────────────────────────────────────
  let dragging  = false;
  let dragMoved = false;
  let startX    = 0;
  let startT    = 0;

  function getTravel() {
    // travel = computed width − knob size − 2 × pad
    // knob size = height − 2 × pad  (pad = 4px from CSS --pad)
    const pad  = 4;
    const w    = slider.offsetWidth  || 110;
    const h    = slider.offsetHeight || 46;
    const knob = h - pad * 2;
    return Math.max(1, w - knob - pad * 2);
  }

  slider.addEventListener('pointerdown', e => {
    e.preventDefault();
    slider.setPointerCapture(e.pointerId);
    dragging  = true;
    dragMoved = false;
    startX    = e.clientX;
    startT    = _t;
    slider.style.cursor = 'grabbing';
  });

  slider.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) dragMoved = true;
    if (dragMoved) setT(startT + dx / getTravel());
  });

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    slider.style.cursor = '';
    if (!dragMoved) {
      // Tap → toggle
      setT(_t >= 0.5 ? 0 : 1);
    } else {
      // Snap to nearest extreme
      setT(_t >= 0.5 ? 1 : 0);
    }
  }

  slider.addEventListener('pointerup',     onEnd);
  slider.addEventListener('pointercancel', onEnd);

  // ── Keyboard ───────────────────────────────────────────────
  slider.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setT(1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); setT(0); }
    if (e.key === ' ' || e.key === 'Enter')               { e.preventDefault(); setT(_t >= 0.5 ? 0 : 1); }
  });

  // Initialize to day
  setT(0);
}
