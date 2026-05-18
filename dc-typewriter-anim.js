// ============================================================
// DC-TYPEWRITER-ANIM.JS — Animation onirique lors du clic "Générer"
// sur la page Discord.
//
// Source : design pack Claude Design "typewriter-animation" (chat 2026-05-16).
// Le prototype était en React/JSX → adapté ici en vanilla JS.
//
// Choréographie (≈3.4s) :
//   1. Machine monte du bas (650ms, easing élastique)
//   2. Frappe lettre par lettre + papier grandit en hauteur
//   3. À ~55% de la frappe, la machine commence à descendre
//   4. Quand la frappe est finie, machine + papier descendent ensemble
//      (1.6s, courbe douce) — tous deux solidaires
//
// API : window.dcPlayTypewriterAnim() → Promise<void>
// ============================================================

(function(){

  const LOREM_BASE = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. ";
  const LOREM = (LOREM_BASE.repeat(20)).trim();

  // ── SVG typewriter (clone fidèle du proto, layout 1400×380) ──
  function buildTypewriterSVG(){
    const keyR = 16, step = 50;
    const row1 = ['Q','W','E','R','T','Y','U','I','O','P','¨'];
    const row2 = ['A','S','D','F','G','H','J','K','L','M'];
    const row3 = ['Z','X','C','V','B','N',',',';',':','?'];
    const centerRow = (letters, offset=0) => {
      const total = (letters.length - 1) * step;
      const startX = 700 - total/2 + offset;
      return letters.map((ch, i) => ({ ch, x: startX + i * step }));
    };
    const r1 = centerRow(row1);
    const r2 = centerRow(row2);
    const r3 = centerRow(row3);
    const keyHTML = (x, y, ch) => `
      <g>
        <circle cx="${x}" cy="${y+2}" r="${keyR+1.4}" fill="#7c5be8" opacity="0.35"/>
        <circle cx="${x}" cy="${y}" r="${keyR+1.2}" fill="url(#tw-collarG)"/>
        <circle cx="${x}" cy="${y}" r="${keyR}" fill="url(#tw-keyG)" stroke="#0f0826" stroke-width="0.8"/>
        <circle cx="${x}" cy="${y}" r="${keyR}" fill="url(#tw-keyHi)"/>
        <text x="${x}" y="${y+5}" text-anchor="middle" font-family="'Special Elite', serif" font-size="14" fill="#f0d999" style="letter-spacing:.5px">${ch}</text>
      </g>`;
    // Stries des knobs gauche/droite (8 lignes radiales)
    let knobLines = '';
    for (let i=0;i<8;i++){
      const a = (i/8)*Math.PI*2;
      const x1L = 40 + Math.cos(a)*12,  y1L = 68 + Math.sin(a)*12;
      const x2L = 40 + Math.cos(a)*16,  y2L = 68 + Math.sin(a)*16;
      const x1R = 1360 + Math.cos(a)*12, y1R = 68 + Math.sin(a)*12;
      const x2R = 1360 + Math.cos(a)*16, y2R = 68 + Math.sin(a)*16;
      knobLines += `<line x1="${x1L}" y1="${y1L}" x2="${x2L}" y2="${y2L}" stroke="#8a6d2c" stroke-width="1"/>`;
      knobLines += `<line x1="${x1R}" y1="${y1R}" x2="${x2R}" y2="${y2R}" stroke="#8a6d2c" stroke-width="1"/>`;
    }
    return `
      <svg viewBox="0 0 1400 380" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="typewriter">
        <defs>
          <linearGradient id="tw-bodyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#efe5ff"/>
            <stop offset="55%" stop-color="#cdb8f3"/>
            <stop offset="100%" stop-color="#9a7be8"/>
          </linearGradient>
          <linearGradient id="tw-bodyTopG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2d4ff"/>
            <stop offset="100%" stop-color="#a78bfa"/>
          </linearGradient>
          <linearGradient id="tw-bodyDeckG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b39bff"/>
            <stop offset="100%" stop-color="#8b6df0"/>
          </linearGradient>
          <linearGradient id="tw-platenG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5a4a8a"/>
            <stop offset="45%" stop-color="#3a2c63"/>
            <stop offset="100%" stop-color="#1c1335"/>
          </linearGradient>
          <linearGradient id="tw-goldG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f4e0a8"/>
            <stop offset="50%" stop-color="#d8b86a"/>
            <stop offset="100%" stop-color="#a48340"/>
          </linearGradient>
          <linearGradient id="tw-keyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3a2c63"/>
            <stop offset="100%" stop-color="#15102e"/>
          </linearGradient>
          <linearGradient id="tw-collarG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2d4ff"/>
            <stop offset="100%" stop-color="#8b6df0"/>
          </linearGradient>
          <radialGradient id="tw-keyHi" cx="0.35" cy="0.28" r="0.55">
            <stop offset="0%" stop-color="rgba(255,255,255,.45)"/>
            <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
          </radialGradient>
          <linearGradient id="tw-ribbonG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7c5be8"/>
            <stop offset="100%" stop-color="#3a2c63"/>
          </linearGradient>
        </defs>
        <g>
          <!-- body -->
          <path d="M 60 100 L 1340 100 Q 1360 100 1366 120 L 1390 332 Q 1394 354 1372 354 L 28 354 Q 6 354 10 332 L 34 120 Q 40 100 60 100 Z" fill="url(#tw-bodyG)" stroke="#7c5be8" stroke-width="1.4"/>
          <!-- top deck -->
          <path d="M 50 100 L 1350 100 Q 1358 100 1358 108 L 1358 124 Q 1358 132 1350 132 L 50 132 Q 42 132 42 124 L 42 108 Q 42 100 50 100 Z" fill="url(#tw-bodyDeckG)" stroke="#5a4ab0" stroke-width="1"/>
          <line x1="50" y1="129" x2="1350" y2="129" stroke="url(#tw-goldG)" stroke-width="1.2" opacity="0.9"/>
          <!-- carriage caps -->
          <path d="M 30 50 Q 30 38 42 38 L 90 38 Q 102 38 102 50 L 102 100 L 30 100 Z" fill="url(#tw-bodyTopG)" stroke="#7c5be8" stroke-width="1.2"/>
          <path d="M 1298 50 Q 1298 38 1310 38 L 1358 38 Q 1370 38 1370 50 L 1370 100 L 1298 100 Z" fill="url(#tw-bodyTopG)" stroke="#7c5be8" stroke-width="1.2"/>
          <!-- knobs gold -->
          <ellipse cx="40" cy="68" rx="10" ry="24" fill="#1c1335"/>
          <ellipse cx="1360" cy="68" rx="10" ry="24" fill="#1c1335"/>
          <circle cx="40" cy="68" r="18" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="1"/>
          <circle cx="1360" cy="68" r="18" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="1"/>
          <circle cx="40" cy="68" r="6" fill="#3a2c63"/>
          <circle cx="1360" cy="68" r="6" fill="#3a2c63"/>
          ${knobLines}
          <!-- platen -->
          <rect x="100" y="48" width="1200" height="44" rx="22" fill="url(#tw-platenG)"/>
          <rect x="106" y="52" width="1188" height="5" rx="2.5" fill="rgba(255,255,255,.18)"/>
          <rect x="106" y="84" width="1188" height="2" rx="1" fill="rgba(255,255,255,.06)"/>
          <!-- paper bail -->
          <rect x="130" y="58" width="1140" height="3" rx="1.5" fill="#d8b86a" opacity="0.85"/>
          <circle cx="130" cy="60" r="4" fill="#a48340"/>
          <circle cx="1270" cy="60" r="4" fill="#a48340"/>
          <!-- exit slot -->
          <rect x="200" y="44" width="1000" height="5" rx="2.5" fill="#15102e" opacity="0.55"/>
          <!-- brand -->
          <rect x="630" y="107" width="140" height="20" rx="3" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="0.8"/>
          <text x="700" y="121" text-anchor="middle" font-family="'Special Elite', serif" font-size="12" fill="#3a2c63" style="letter-spacing:3px">LOREM</text>
          <!-- ribbon spools -->
          <circle cx="320" cy="170" r="22" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="1"/>
          <circle cx="320" cy="170" r="14" fill="url(#tw-ribbonG)"/>
          <circle cx="320" cy="170" r="4" fill="#f4e0a8"/>
          <circle cx="1080" cy="170" r="22" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="1"/>
          <circle cx="1080" cy="170" r="14" fill="url(#tw-ribbonG)"/>
          <circle cx="1080" cy="170" r="4" fill="#f4e0a8"/>
          <text x="700" y="176" text-anchor="middle" font-family="'Special Elite', serif" font-size="18" fill="#d8b86a" opacity="0.85">◆     ◆     ◆     ◆     ◆</text>
          <!-- keyboard rows -->
          ${r1.map(k => keyHTML(k.x, 210, k.ch)).join('')}
          ${r2.map(k => keyHTML(k.x, 252, k.ch)).join('')}
          ${r3.map(k => keyHTML(k.x, 294, k.ch)).join('')}
          <!-- spacebar -->
          <rect x="540" y="328" width="320" height="22" rx="11" fill="url(#tw-keyG)" stroke="#0f0826" stroke-width="0.8"/>
          <rect x="540" y="328" width="320" height="22" rx="11" fill="url(#tw-keyHi)"/>
          <rect x="548" y="332" width="304" height="3" rx="1.5" fill="rgba(255,255,255,.15)"/>
          <!-- shift keys -->
          <rect x="160" y="328" width="80" height="22" rx="11" fill="url(#tw-keyG)" stroke="#0f0826" stroke-width="0.8"/>
          <rect x="160" y="328" width="80" height="22" rx="11" fill="url(#tw-keyHi)"/>
          <text x="200" y="343" text-anchor="middle" font-family="'Special Elite',serif" font-size="10" fill="#f0d999" letter-spacing="1">SHIFT</text>
          <rect x="1160" y="328" width="80" height="22" rx="11" fill="url(#tw-keyG)" stroke="#0f0826" stroke-width="0.8"/>
          <rect x="1160" y="328" width="80" height="22" rx="11" fill="url(#tw-keyHi)"/>
          <text x="1200" y="343" text-anchor="middle" font-family="'Special Elite',serif" font-size="10" fill="#f0d999" letter-spacing="1">SHIFT</text>
          <!-- rivets -->
          <circle cx="30" cy="345" r="3.5" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="0.5"/>
          <circle cx="1370" cy="345" r="3.5" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="0.5"/>
          <circle cx="30" cy="115" r="3" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="0.4"/>
          <circle cx="1370" cy="115" r="3" fill="url(#tw-goldG)" stroke="#a48340" stroke-width="0.4"/>
          <rect x="10" y="346" width="1380" height="10" rx="4" fill="url(#tw-bodyDeckG)" opacity="0.7"/>
          <path d="M 36 105 L 30 130 L 12 335" stroke="rgba(255,255,255,.35)" stroke-width="1.2" fill="none"/>
        </g>
      </svg>`;
  }

  // ── Inject styles ──
  const STYLE_ID = 'dc-tw-anim-styles';
  function injectStyles(){
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .dc-tw-overlay {
        position: fixed; inset: 0;
        z-index: 100000;
        /* Même dégradé pastel que le body du site → effet "clean",
           pas de transparence brutale qui laisse voir tout ce qu'il
           y a derrière. */
        background: linear-gradient(135deg, #f5e9ff 0%, #fff0fa 50%, #e8f0ff 100%);
        overflow: hidden;
        pointer-events: auto;
      }
      /* L'overlay glisse vers le bas en même temps que la machine au lieu
         de faire un fade out → effet "rideau qui descend", machine et
         décor sortent ensemble par le bas de l'écran. */
      .dc-tw-overlay.dc-tw-slidedown {
        animation: dcTwSlideDown 700ms cubic-bezier(.55,.05,.3,1) forwards;
      }
      @keyframes dcTwSlideDown {
        from { transform: translateY(0); }
        to   { transform: translateY(100vh); }
      }
      .dc-tw-paper {
        position: absolute;
        left: 50%;
        bottom: 0;
        transform: translateX(-50%) translateY(110vh);
        /* Feuille XXL — couvre quasi toute la largeur, beaucoup de texte
           pour effet "machine qui tape abondamment". */
        width: 92vw;
        max-width: 1600px;
        min-width: 600px;
        background: linear-gradient(180deg, #fbf5e0 0%, #f5ecd0 100%);
        border-radius: 3px 3px 0 0;
        box-shadow: 0 0 50px rgba(0,0,0,0.35), inset 0 0 8px rgba(180,150,80,0.18);
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 15px;
        line-height: 1.6;
        color: #2a2230;
        padding: 36px 48px 50px;
        text-align: justify;
        overflow: hidden;
        word-break: break-word;
        will-change: transform, height;
      }
      .dc-tw-paper.dc-tw-paper-in {
        transform: translateX(-50%) translateY(0);
        transition: transform 0s, height 80ms linear;
      }
      .dc-tw-paper.dc-tw-paper-exit {
        transition: transform 1.6s cubic-bezier(.55,.05,.3,1);
        transform: translateX(-50%) translateY(110vh);
      }
      .dc-tw-paper::after {
        content: '▌';
        animation: dcTwBlink 0.6s infinite;
        color: #6e5a8e;
        margin-left: 1px;
      }
      .dc-tw-paper.dc-tw-paper-exit::after { display: none; }
      @keyframes dcTwBlink { 50% { opacity: 0; } }

      .dc-tw-machine {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        width: 100%;
        /* Animation CSS qui joue dès le mount (pas besoin de classList.add
           via requestAnimationFrame, qui peut être throttled). La machine
           monte de 110vh → 140px (translateY positif = décalée vers le
           bas, le clavier dépasse → plus de place pour le papier). */
        transform: translateY(140px);
        animation: dcTwMachineRise 650ms cubic-bezier(.4, 1.5, .55, 1) backwards;
        will-change: transform;
        pointer-events: none;
        filter: drop-shadow(0 -8px 30px rgba(0,0,0,0.4));
      }
      @keyframes dcTwMachineRise {
        0%   { transform: translateY(110vh); }
        100% { transform: translateY(140px); }
      }
      .dc-tw-machine.dc-tw-machine-shake {
        /* Override l'animation rise par shake (loops) — la rise est déjà
           terminée à ce stade (650ms écoulés). */
        animation: dcTwShake 80ms ease-in-out infinite;
      }
      @keyframes dcTwShake {
        0%, 100% { transform: translateY(140px); }
        50% { transform: translateY(142px); }
      }
      .dc-tw-machine.dc-tw-machine-exit {
        /* Coupe l'animation shake, applique une transition vers 110vh. */
        animation: none;
        transition: transform 1.6s cubic-bezier(.55,.05,.3,1);
        transform: translateY(110vh);
      }
      .dc-tw-machine svg {
        display: block;
        width: 100%;
        height: auto;
      }

      /* Skip button (Esc) */
      .dc-tw-skip {
        position: absolute;
        top: 20px; right: 24px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.18);
        color: rgba(255,255,255,0.75);
        font-size: 12px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: 999px;
        cursor: pointer;
        backdrop-filter: blur(8px);
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      .dc-tw-skip:hover {
        background: rgba(255,255,255,0.16);
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Main : crée l'overlay et joue la séquence complète ──
  function dcPlayTypewriterAnim(){
    injectStyles();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'dc-tw-overlay';
      const paper = document.createElement('div');
      paper.className = 'dc-tw-paper';
      paper.style.height = '0px';
      paper.textContent = '';

      const machine = document.createElement('div');
      machine.className = 'dc-tw-machine';
      machine.innerHTML = buildTypewriterSVG();

      const skipBtn = document.createElement('button');
      skipBtn.className = 'dc-tw-skip';
      skipBtn.textContent = 'Passer ⏭';

      overlay.appendChild(paper);
      overlay.appendChild(machine);
      overlay.appendChild(skipBtn);
      document.body.appendChild(overlay);

      // Flag pour signaler que l'anim est en cours (utile pour debug ou
      // pour empêcher les doubles déclenchements)
      window._dcTwActive = true;

      let cancelled = false;
      const cleanup = () => {
        // Au lieu d'un fade-out, l'overlay glisse vers le bas — la machine
        // (déjà à translateY 110vh à la fin) et le décor descendent ensemble
        // hors-écran, puis on retire le DOM. Transition CSS inline pour
        // contourner les throttling éventuels sur les @keyframes.
        overlay.style.transition = 'transform 700ms cubic-bezier(.55,.05,.3,1)';
        // Force un reflow pour que la transition prenne effet
        void overlay.offsetWidth;
        overlay.style.transform = 'translateY(100vh)';
        setTimeout(() => {
          overlay.remove();
          window._dcTwActive = false;
          resolve();
        }, 720);
      };
      skipBtn.addEventListener('click', () => { cancelled = true; cleanup(); });
      const escHandler = e => { if (e.key === 'Escape') { cancelled = true; cleanup(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);

      // Phase 1 (machine monte de 110vh → 140px) gérée par la CSS
      // animation dcTwMachineRise déclarée directement sur .dc-tw-machine
      // — démarre dès le mount du DOM, pas besoin de classe.

      // ── Phase 2 : la machine est en place → frappe ──
      setTimeout(() => {
        if (cancelled) return;
        // Place le paper immédiatement (sans transition de transform)
        paper.classList.add('dc-tw-paper-in');
        machine.classList.add('dc-tw-machine-shake');
        // Le papier doit dépasser DERRIÈRE/AU-DESSUS de la machine. Pour ça,
        // on calcule la hauteur visible de la machine et on offset le paper
        // pour qu'il sorte de la fente (entre paper-bail et top du body).
        // En pratique : on place le paper en bottom (de l'overlay), avec une
        // hauteur initiale 0, puis on grandit. Le paper passe naturellement
        // par-dessus la machine (z-index plus haut), donc on doit ajuster.

        // Réorganiser le z-index : machine au-dessus du paper, mais le paper
        // doit dépasser au-dessus de la machine (effet "papier qui sort").
        // Solution : on positionne le paper avec un offset bottom = hauteur
        // visible de la zone "fente" de la machine (env. 18% de la hauteur
        // machine visible).
        // Position du paper exactement au niveau du carriage du SVG.
        // Le carriage commence à y=38 du viewBox (0-380), soit 10% du top.
        // Multiplier 0.10 → paper bottom colle au top des knobs/caps,
        // pas de zone transparente entre paper et machine.
        const machineRect = machine.getBoundingClientRect();
        const fenteY = machineRect.top + machineRect.height * 0.10;
        const slotOffset = Math.max(0, window.innerHeight - fenteY);
        paper.style.bottom = slotOffset + 'px';

        // Typing ultra-rapide (×5) + feuille géante qui dépasse hors-écran
        // par le haut → effet "machine qui crache des pages d'un seul coup".
        const totalChars = Math.min(LOREM.length, 12000);
        const charsPerTick = 180;      // bursts énormes
        const tickInterval = 12;       // → ~15 000 chars/sec (5× plus rapide)
        let typedCount = 0;
        // Feuille de 2× la hauteur du viewport → dépasse largement au-dessus
        const maxPaperHeight = window.innerHeight * 2;
        const minPaperHeight = 100;

        const typingStart = Date.now();
        const typingTotalDur = Math.ceil(totalChars / charsPerTick) * tickInterval;
        let machineDescendStarted = false;
        let machineDescendStart = 0; // timestamp pour calculer remaining

        const typingInterval = setInterval(() => {
          if (cancelled) { clearInterval(typingInterval); return; }
          typedCount = Math.min(totalChars, typedCount + charsPerTick);
          paper.textContent = LOREM.slice(0, typedCount);
          // Hauteur croît proportionnellement au texte tapé
          const progress = typedCount / totalChars;
          paper.style.height = (minPaperHeight + progress * (maxPaperHeight - minPaperHeight)) + 'px';

          // À ~55% du typing, la machine commence à descendre — et le
          // paper descend EN MÊME TEMPS, sync (même delta Y, même
          // durée, même easing) pour rester collé à la machine.
          const elapsed = Date.now() - typingStart;
          if (!machineDescendStarted && elapsed > typingTotalDur * 0.55) {
            machineDescendStarted = true;
            machineDescendStart = Date.now();
            // Stop shake, fige machine puis lance transition vers 110vh
            machine.classList.remove('dc-tw-machine-shake');
            machine.style.animation = 'none';
            machine.style.transform = 'translateY(140px)';
            void machine.offsetWidth;
            machine.style.transition = 'transform 1.6s cubic-bezier(.55,.05,.3,1)';
            machine.style.transform = 'translateY(110vh)';
            // SYNC PAPER : descend de la même quantité (110vh - 140px)
            // pour rester collé à la machine pendant toute la descente
            paper.style.transition = 'transform 1.6s cubic-bezier(.55,.05,.3,1)';
            paper.style.transform = 'translateX(-50%) translateY(calc(110vh - 140px))';
          }

          if (typedCount >= totalChars) {
            clearInterval(typingInterval);
            // À ce stade, machine + paper sont déjà en train de descendre
            // ensemble (sync depuis 55% du typing, 1.6s). On attend que la
            // descente conjointe soit complète, puis le paper INVERSE
            // direction et REMONTE par le haut tandis que l'overlay fade
            // out → la page Discord apparaît derrière le papier qui s'envole.
            const descendRemaining = Math.max(0, 1600 - (Date.now() - machineDescendStart));
            setTimeout(() => {
              if (cancelled) return;
              // Paper remonte par le haut depuis sa position actuelle
              // (translateY ~110vh - 140px) vers translateY(-110vh)
              paper.style.transition = 'transform 800ms cubic-bezier(.55,.05,.3,1)';
              paper.style.transform = 'translateX(-50%) translateY(-110vh)';
              // Overlay fade pour révéler la page chargée
              overlay.style.transition = 'opacity 700ms ease-out';
              overlay.style.opacity = '0';
            }, descendRemaining);

            // Cleanup final : descente restante + remontée 800ms + buffer
            setTimeout(() => {
              if (cancelled) return;
              cleanup();
              document.removeEventListener('keydown', escHandler);
            }, descendRemaining + 900);
          }
        }, tickInterval);
      }, 650);
    });
  }

  window.dcPlayTypewriterAnim = dcPlayTypewriterAnim;

})();
