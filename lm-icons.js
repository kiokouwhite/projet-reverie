// ============================================================
// LM-ICONS.JS — 9 icônes SVG personnalisées pour le Layout Maker
//
// Source : design pack Claude Design "Card button" (chat du 2026-05-07).
// Style : pastel à outlines multicolores, dans l'esprit cartes de tarot.
// Les icônes remplacent les emojis dans les .lm-dot (header du LM modal).
//
// Mapping step → icon :
//   1 = IconGame         (Image du jeu — manette pastel)
//   2 = IconLayoutBg     (Fond — vagues colorées sur tuile lilas)
//   3 = IconFont         (Police — Aa serif + sans-serif)
//   4 = IconTitles       (Titres — pinceau violet + trait peint corail)
//   5 = IconCardShape    (Forme cartes — 3 cartes empilées de rayons différents)
//   6 = IconCharacters   (Personnages — portrait encadré + étoile dorée)
//   7 = IconPlayerNames  (Noms — banderole + plaque à 3 lignes)
//   8 = IconRanks        (Rangs — trophée doré avec étoile)
//   9 = IconSave         (Finaliser — palette d'artiste + check menthe)
// ============================================================

(function(){
  // Palette de référence (mêmes valeurs que le design pack)
  const ST = {
    purple: '#7a5fc0', pink: '#e07ea0', coral: '#e88f6b',
    mint:   '#4fb37a', sky:  '#5a8fc8', gold: '#c9a14a', plum: '#5a3f8c',
  };
  const FI = {
    purple: '#e9def7', pink: '#fde0ea', coral: '#ffe1cf',
    mint:   '#dcf3e3', sky:  '#dceaf8', gold: '#fbecc4',
    cream:  '#fbeaf2', lilac: '#f1e7fb', white: '#ffffff',
  };

  // Wrapper SVG + props communs aux lignes (fill:none, stroke arrondi)
  const SVG_OPEN  = '<svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">';
  const SVG_CLOSE = '</svg>';
  const LP = 'fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

  // Étincelle décorative
  function sp(x, y, s, c) {
    return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -5 L0 5 M-5 0 L5 0"/></g>`;
  }

  // ─ 1. Image du jeu — manette pastel ─
  const iconGame = SVG_OPEN + `
    <g ${LP}>
      <path d="M28 56 Q 28 42 42 42 L 78 42 Q 92 42 92 56 L 92 76 Q 92 90 80 90 Q 72 90 68 82 L 52 82 Q 48 90 40 90 Q 28 90 28 76 Z" fill="${FI.purple}" stroke="${ST.purple}"/>
      <path d="M38 60 L 46 60 M 42 56 L 42 64" stroke="${ST.plum}" stroke-width="3"/>
      <circle cx="76" cy="56" r="3.5" fill="${FI.coral}" stroke="${ST.coral}"/>
      <circle cx="84" cy="64" r="3.5" fill="${FI.mint}"  stroke="${ST.mint}"/>
      <circle cx="76" cy="72" r="3.5" fill="${FI.sky}"   stroke="${ST.sky}"/>
      <circle cx="68" cy="64" r="3.5" fill="${FI.pink}"  stroke="${ST.pink}"/>
      <circle cx="60" cy="68" r="2.5" fill="${FI.lilac}" stroke="${ST.plum}"/>
    </g>
    ${sp(26,30,0.6,ST.mint)}${sp(96,32,0.5,ST.coral)}${sp(28,102,0.5,ST.sky)}
  ` + SVG_CLOSE;

  // ─ 2. Fond du layout — vagues colorées ─
  const iconLayoutBg = SVG_OPEN + `
    <g ${LP}>
      <rect x="22" y="22" width="76" height="76" rx="12" fill="${FI.lilac}" stroke="${ST.purple}"/>
      <path d="M22 50 Q 40 38 60 50 T 98 50" stroke="${ST.pink}"  fill="none" stroke-width="2.5"/>
      <path d="M22 66 Q 40 54 60 66 T 98 66" stroke="${ST.coral}" fill="none" stroke-width="2.5"/>
      <path d="M22 82 Q 40 70 60 82 T 98 82" stroke="${ST.mint}"  fill="none" stroke-width="2.5"/>
      <circle cx="36" cy="34" r="2.5" fill="${FI.coral}" stroke="${ST.coral}"/>
      <circle cx="82" cy="36" r="2"   fill="${FI.sky}"   stroke="${ST.sky}"/>
      <circle cx="62" cy="32" r="1.5" fill="${FI.gold}"  stroke="${ST.gold}"/>
    </g>
    ${sp(104,24,0.5,ST.purple)}${sp(16,104,0.5,ST.pink)}
  ` + SVG_CLOSE;

  // ─ 3. Police — Aa serif + sans ─
  const iconFont = SVG_OPEN + `
    <g ${LP}>
      <rect x="22" y="24" width="76" height="72" rx="10" fill="${FI.sky}" stroke="${ST.sky}"/>
      <rect x="22" y="24" width="76" height="18" rx="10" fill="${FI.purple}" stroke="${ST.sky}"/>
      <line x1="22" y1="42" x2="98" y2="42" stroke="${ST.sky}"/>
    </g>
    <text x="42" y="82" font-family="'Cormorant Garamond', Georgia, serif" font-weight="700" font-size="42" fill="${ST.plum}" stroke="${ST.pink}" stroke-width="1" text-anchor="middle">A</text>
    <text x="74" y="82" font-family="'Quicksand', sans-serif" font-weight="700" font-size="32" fill="${ST.coral}" text-anchor="middle">a</text>
    <line x1="34" y1="86" x2="84" y2="86" stroke="${ST.pink}" stroke-width="1.5" stroke-dasharray="2 3" ${LP}/>
    ${sp(28,20,0.5,ST.mint)}${sp(102,106,0.5,ST.coral)}
  ` + SVG_CLOSE;

  // ─ 4. Titres — pinceau & trait corail ─
  const iconTitles = SVG_OPEN + `
    <g ${LP}>
      <path d="M22 86 Q 40 78 60 84 Q 80 90 98 80" stroke="${ST.coral}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M28 96 Q 50 90 78 94" stroke="${ST.pink}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>
      <path d="M72 26 L86 40 L 56 70 L 44 56 Z" fill="${FI.purple}" stroke="${ST.purple}"/>
      <path d="M50 62 L 60 72 L 50 82 L 40 72 Z" fill="${FI.gold}" stroke="${ST.gold}"/>
      <path d="M38 76 Q 32 84 36 92 L 48 86 Z" fill="${FI.coral}" stroke="${ST.coral}"/>
      <line x1="76" y1="32" x2="80" y2="36" stroke="${FI.white}" stroke-width="2" opacity="0.7"/>
    </g>
    ${sp(94,28,0.6,ST.mint)}${sp(24,36,0.5,ST.sky)}
  ` + SVG_CLOSE;

  // ─ 5. Forme des cartes — 3 cartes empilées ─
  const iconCardShape = SVG_OPEN + `
    <g ${LP}>
      <rect x="36" y="28" width="44" height="60" rx="2"  fill="${FI.sky}"    stroke="${ST.sky}"    transform="rotate(-8 58 58)"/>
      <rect x="40" y="32" width="44" height="60" rx="10" fill="${FI.pink}"   stroke="${ST.pink}"/>
      <rect x="44" y="38" width="44" height="60" rx="20" fill="${FI.purple}" stroke="${ST.purple}" transform="rotate(6 66 68)"/>
      <text x="56" y="56" font-family="'Cormorant Garamond', Georgia, serif" font-style="italic" font-size="14" fill="${ST.gold}" font-weight="700">I</text>
    </g>
    ${sp(28,24,0.6,ST.coral)}${sp(100,32,0.5,ST.mint)}${sp(104,100,0.5,ST.gold)}
  ` + SVG_CLOSE;

  // ─ 6. Personnages — portrait encadré ─
  const iconCharacters = SVG_OPEN + `
    <g ${LP}>
      <rect x="28" y="22" width="64" height="80" rx="32" fill="${FI.cream}" stroke="${ST.pink}"/>
      <rect x="34" y="28" width="52" height="68" rx="26" fill="${FI.lilac}" stroke="${ST.purple}"/>
      <circle cx="60" cy="54" r="11" fill="${FI.pink}" stroke="${ST.pink}"/>
      <path d="M40 96 Q 40 74 60 74 Q 80 74 80 96" fill="${FI.pink}" stroke="${ST.pink}"/>
      <path d="M60 18 L 62 24 L 68 24 L 63 28 L 65 34 L 60 30 L 55 34 L 57 28 L 52 24 L 58 24 Z" fill="${FI.gold}" stroke="${ST.gold}"/>
    </g>
    ${sp(24,32,0.5,ST.mint)}${sp(96,36,0.5,ST.sky)}${sp(100,100,0.5,ST.coral)}
  ` + SVG_CLOSE;

  // ─ 7. Noms des joueurs — banderole + plaque ─
  const iconPlayerNames = SVG_OPEN + `
    <g ${LP}>
      <path d="M22 36 L 36 30 L 84 30 L 98 36 L 84 42 L 36 42 Z" fill="${FI.pink}" stroke="${ST.pink}"/>
      <rect x="26" y="48" width="68" height="44" rx="6" fill="${FI.lilac}" stroke="${ST.purple}"/>
      <line x1="36" y1="60" x2="84" y2="60" stroke="${ST.coral}" stroke-width="2.5"/>
      <line x1="36" y1="70" x2="74" y2="70" stroke="${ST.mint}"  stroke-width="2"/>
      <line x1="36" y1="80" x2="80" y2="80" stroke="${ST.sky}"   stroke-width="2"/>
      <circle cx="60" cy="36" r="3" fill="${FI.gold}" stroke="${ST.gold}"/>
    </g>
    ${sp(26,94,0.5,ST.mint)}${sp(100,96,0.5,ST.coral)}${sp(20,20,0.5,ST.sky)}
  ` + SVG_CLOSE;

  // ─ 8. Classements & rangs — trophée doré ─
  const iconRanks = SVG_OPEN + `
    <g ${LP}>
      <path d="M38 44 Q 22 44 22 56 Q 22 66 36 68" fill="none" stroke="${ST.purple}"/>
      <path d="M82 44 Q 98 44 98 56 Q 98 66 84 68" fill="none" stroke="${ST.purple}"/>
      <path d="M38 32 L 82 32 L 80 64 Q 80 80 60 80 Q 40 80 40 64 Z" fill="${FI.gold}" stroke="${ST.gold}"/>
      <path d="M60 44 L 63 52 L 71 52 L 64 56 L 67 64 L 60 58 L 53 64 L 56 56 L 49 52 L 57 52 Z" fill="${FI.cream}" stroke="${ST.coral}"/>
      <rect x="54" y="80" width="12" height="8" fill="${FI.gold}" stroke="${ST.gold}"/>
      <rect x="44" y="88" width="32" height="8" rx="3" fill="${FI.pink}" stroke="${ST.pink}"/>
    </g>
    ${sp(26,30,0.6,ST.mint)}${sp(94,28,0.6,ST.coral)}${sp(94,94,0.5,ST.sky)}
  ` + SVG_CLOSE;

  // ─ 9. Finaliser & sauvegarder — palette + check ─
  const iconSave = SVG_OPEN + `
    <g ${LP}>
      <path d="M60 24 Q 92 24 96 56 Q 100 80 78 84 Q 70 86 70 78 Q 70 70 62 70 Q 50 70 46 80 Q 38 96 24 84 Q 16 74 22 56 Q 28 24 60 24 Z" fill="${FI.lilac}" stroke="${ST.purple}"/>
      <circle cx="46" cy="42" r="5" fill="${FI.coral}" stroke="${ST.coral}"/>
      <circle cx="68" cy="40" r="5" fill="${FI.mint}"  stroke="${ST.mint}"/>
      <circle cx="82" cy="54" r="5" fill="${FI.sky}"   stroke="${ST.sky}"/>
      <circle cx="34" cy="58" r="5" fill="${FI.pink}"  stroke="${ST.pink}"/>
      <circle cx="56" cy="56" r="4" fill="${FI.gold}"  stroke="${ST.gold}"/>
      <path d="M50 88 L 56 94 L 68 80" stroke="${ST.mint}" stroke-width="3.5" fill="none"/>
    </g>
    ${sp(26,28,0.6,ST.coral)}${sp(100,32,0.5,ST.mint)}${sp(102,94,0.5,ST.gold)}
  ` + SVG_CLOSE;

  // Registre indexé par step (1-9)
  const LM_ICONS = {
    1: iconGame,
    2: iconLayoutBg,
    3: iconFont,
    4: iconTitles,
    5: iconCardShape,
    6: iconCharacters,
    7: iconPlayerNames,
    8: iconSave,    // FIX : step 8 = Classements, mais design pack a IconRanks pour ça
    9: iconSave,
  };
  // Fix : remettre correctement Ranks=8, Save=9
  LM_ICONS[8] = iconRanks;
  LM_ICONS[9] = iconSave;
  window.LM_ICONS = LM_ICONS;

  // ── Injection dans les .lm-dot au boot ──
  function injectLmDotIcons(){
    const dots = document.querySelectorAll('.lm-dot');
    dots.forEach((dot, i) => {
      const step = i + 1;
      const svg = LM_ICONS[step];
      if (svg) {
        dot.innerHTML = svg;
        dot.classList.add('lm-dot-iconified');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectLmDotIcons);
  } else {
    injectLmDotIcons();
  }

  // Re-injecte si la modale est rouverte (au cas où des panels seraient
  // recréés). Idempotent grâce à innerHTML qui replace tout.
  window.lmReinjectDotIcons = injectLmDotIcons;

})();
