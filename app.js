// Couleurs des cases (configurées via l'éditeur visuel)
const BLACK_COLORS  = ['#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe','#d69bfe'];
const PURPLE_COLORS = ['#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff','#b8c4ff'];

// ============================================================
// APP.JS — Logique principale
// ============================================================

let currentGame = 'ssbu';
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
const TC_PANELS = [
  { label: 'Import',   roman: 'I',   accent: '#7c5cff', emoji: '🟢', name: 'Import start.gg',       icon: 'import' },
  { label: 'Réglages', roman: 'II',  accent: '#f0a020', emoji: '⚙️', name: 'Paramètres',            icon: 'settings' },
  { label: 'Fond',     roman: 'III', accent: '#e85a8a', emoji: '🖼️', name: 'Fond',                  icon: 'background' },
  { label: 'Joueurs',  roman: 'IV',  accent: '#46d18f', emoji: '👥', name: 'Joueurs & Personnages', icon: 'players' },
  { label: 'Layouts',  roman: 'V',   accent: '#9a7aff', emoji: '🎨', name: 'Layouts Custom',        icon: 'layouts' },
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

function tcInit() {
  const tabs = document.getElementById('tcTabs');
  if (tabs) {
    tabs.innerHTML = TC_PANELS.map((p, i) =>
      `<button class="tc-tab-btn${i===0?' active':''}" data-idx="${i}" onclick="tcGo(${i})" title="${p.name}"
        style="${i===0?`border-color:${p.accent};box-shadow:0 2px 8px ${p.accent}33`:''}"><div style="width:28px;height:28px">${_iconSvgs[p.icon]||p.emoji}</div></button>`
    ).join('');
  }
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

const HR_TC_PANELS = [
  { label: 'Bot',       roman: 'I',   accent: '#46d18f', emoji: '🤖', name: 'Bot Discord',    icon: 'bot' },
  { label: 'Questions', roman: 'II',  accent: '#7c5cff', emoji: '❓', name: 'Questions',      icon: 'questions' },
  { label: 'Programme', roman: 'III', accent: '#f0a020', emoji: '🗓️', name: 'Programme hebdo', icon: 'calendar' },
  { label: 'Actions',   roman: 'IV',  accent: '#e85a8a', emoji: '📨', name: 'Actions',        icon: 'actions' },
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
  await document.fonts.load('800 40px Montserrat');
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

  // Vérifie si l'élément (ou un ancêtre) est lui-même scrollable
  function _insideScrollable(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      const ov = window.getComputedStyle(el).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight) return true;
      el = el.parentElement;
    }
    return false;
  }

  // Scroll vers le haut → afficher, scroll vers le bas → cacher
  // Ignorer si on scrolle à l'intérieur d'une carte ou d'un élément scrollable
  document.addEventListener('wheel', e => {
    if (_insideScrollable(e.target)) return;
    if (e.deltaY < 0) _show();
    else if (e.deltaY > 0) _hide();
  }, { passive: true });

  // Exposer _hide pour que liquidSwitchTab puisse l'appeler
  window._headerHide = _hide;
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

function renderSlots() {
  if (document.getElementById('editorModal')?.style.display !== 'none') renderNameEditor();
  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = '';
  const layout = LAYOUTS[currentGame];
  const rankDisp = layout?.rankDisplay || CONFIG.RANKS_DISPLAY;
  players.forEach((p, i) => {
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
          : `<div class="char-icon">${char ? char.icon : '?'}</div>`
        }
        <span class="char-name">${char ? char.name : 'Aucun personnage'}</span>
        <button class="btn btn-choose" onclick="openModal(${i},1)">${is2xko ? 'Perso 1' : 'Perso'}</button>
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
    const playerCount2 = LAYOUTS[currentGame]?.playerCount || 8;
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
    }

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
  canvas.width=size; canvas.height=size;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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

function generatePreview() {
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

function postToInstagram() {
  // Copier le texte
  const textEl = document.getElementById('tweetText');
  if (textEl && textEl.value) {
    textEl.select();
    textEl.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); } catch(e) {}
  }

  // Télécharger l'image
  const ok = triggerDownload();
  if (ok) {
    const hint = document.getElementById('instaHint');
    if (hint) {
      hint.style.display = 'block';
      setTimeout(function() { hint.style.display = 'none'; }, 10000);
    }
  }
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
