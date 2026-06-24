/* ============================================================
   RUBIKS-CUBE.JS — Bouton de navigation Horaires
   Remplace le toggle "Voir les questions ↔ Voir les résultats"
   par un Rubik's Cube cliquable en bas à gauche. Cliquer sur une
   face déclenche un mélange palindromique + rotation entière qui
   amène le logo de l'autre vue à l'avant. Le site bascule en
   parallèle via hrApplyViewMode().
   Port vanilla JS du prototype design (Rubiks Cube Button.html).
   ============================================================ */

(function () {
  // ── Constantes géométriques ────────────────────────────────
  const STEP  = 39;          // espacement cubie à cubie (px)
  const HALF  = 19.5;        // CUBIE/2 (px)
  const TILE  = 38;          // taille sticker visible (px)

  const COL = {
    U: '#fbf6ff', D: '#fff5fa',
    F: '#f3ecff', B: '#ffe8f0',
    L: '#e8e0ff', R: '#ffd8e8',
  };

  // ── Helpers matriciels (col-major 4x4) ─────────────────────
  function mIdent() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function mMul(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++)
          r[i + j*4] += a[i + k*4] * b[k + j*4];
    return r;
  }
  function mRotX(a) { const c=Math.cos(a), s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; }
  function mRotY(a) { const c=Math.cos(a), s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
  function mRotZ(a) { const c=Math.cos(a), s=Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; }
  function mStr(m) { return 'matrix3d(' + m.map(v => +v.toFixed(6)).join(',') + ')'; }
  function vRot(v, axis, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let [x, y, z] = v;
    if (axis === 'x') { const ny = y*c - z*s, nz = y*s + z*c; y=ny; z=nz; }
    if (axis === 'y') { const nx = x*c + z*s, nz = -x*s + z*c; x=nx; z=nz; }
    if (axis === 'z') { const nx = x*c - y*s, ny = x*s + y*c; x=nx; y=ny; }
    return [Math.round(x), Math.round(y), Math.round(z)];
  }

  // ── Cubies (27 - 1 noyau = 26) ─────────────────────────────
  function makeCubies() {
    const out = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (Math.abs(x) + Math.abs(y) + Math.abs(z) === 0) continue;
          out.push({ id: `${x},${y},${z}`, pos: [x, y, z], ori: mIdent() });
        }
    return out;
  }

  // ── Sticker mapping : position originale → face (U/D/F/B/L/R) + (col,row) tile
  function stickerInfo(origPos, localDir) {
    const [ox, oy, oz] = origPos;
    if (localDir[2] ===  1) return { face:'F', col: ox+1, row: oy+1 };
    if (localDir[2] === -1) return { face:'B', col: 1-ox, row: oy+1 };
    if (localDir[1] === -1) return { face:'U', col: ox+1, row: oz+1 };
    if (localDir[1] ===  1) return { face:'D', col: ox+1, row: 1-oz };
    if (localDir[0] ===  1) return { face:'R', col: 1-oz, row: oy+1 };
    if (localDir[0] === -1) return { face:'L', col: oz+1, row: oy+1 };
    return null;
  }
  function originalStickers(origPos) {
    const [ox, oy, oz] = origPos;
    const s = [];
    if (oy === -1) s.push({ localDir:[0,-1, 0], color: COL.U });
    if (oy ===  1) s.push({ localDir:[0, 1, 0], color: COL.D });
    if (oz ===  1) s.push({ localDir:[0, 0, 1], color: COL.F });
    if (oz === -1) s.push({ localDir:[0, 0,-1], color: COL.B });
    if (ox ===  1) s.push({ localDir:[1, 0, 0], color: COL.R });
    if (ox === -1) s.push({ localDir:[-1,0, 0], color: COL.L });
    return s;
  }
  function stickerCSS(localDir) {
    const [lx, ly, lz] = localDir;
    if (lz ===  1) return `translateZ(${HALF}px)`;
    if (lz === -1) return `rotateY(180deg) translateZ(${HALF}px)`;
    if (lx ===  1) return `rotateY(90deg) translateZ(${HALF}px)`;
    if (lx === -1) return `rotateY(-90deg) translateZ(${HALF}px)`;
    if (ly === -1) return `rotateX(90deg) translateZ(${HALF}px)`;
    if (ly ===  1) return `rotateX(-90deg) translateZ(${HALF}px)`;
    return '';
  }
  function cubieFaceCSS(localDir) {
    const [lx, ly, lz] = localDir;
    const Z = HALF - 0.4;
    if (lz ===  1) return `translateZ(${Z}px)`;
    if (lz === -1) return `rotateY(180deg) translateZ(${Z}px)`;
    if (lx ===  1) return `rotateY(90deg) translateZ(${Z}px)`;
    if (lx === -1) return `rotateY(-90deg) translateZ(${Z}px)`;
    if (ly === -1) return `rotateX(90deg) translateZ(${Z}px)`;
    if (ly ===  1) return `rotateX(-90deg) translateZ(${Z}px)`;
    return '';
  }

  // ── Logos SVG plein cadre (96×96) ──────────────────────────
  const SVG_QUESTIONS = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <rect width="96" height="96" fill="#fff5fa"/>
      <text x="48" y="68" text-anchor="middle" font-family="Nunito,sans-serif"
            font-size="58" font-weight="800" fill="#f4b8d4"
            stroke="#c83b78" stroke-width="1.6" paint-order="stroke">?</text>
      <g fill="#a8d8c8" opacity="0.85">
        <path d="M18 22 L20 24 L18 26 L16 24 Z"/>
        <path d="M80 72 L82 74 L80 76 L78 74 Z"/>
      </g>
      <g fill="#c8a8e8" opacity="0.75">
        <path d="M78 22 L80 24 L78 26 L76 24 Z"/>
      </g>
      <circle cx="16" cy="74" r="1.6" fill="#fde2c4"/>
      <circle cx="84" cy="48" r="1.4" fill="#d8e4fb"/>
    </svg>`;
  const SVG_RESULTS = `
    <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <rect width="96" height="96" fill="#fbf6ff"/>
      <rect x="22" y="54" width="10" height="24" rx="3" fill="#fbd5e8" stroke="#c83b78" stroke-width="1.4"/>
      <rect x="36" y="42" width="10" height="36" rx="3" fill="#c8e6d8" stroke="#3d9b6b" stroke-width="1.4"/>
      <rect x="50" y="30" width="10" height="48" rx="3" fill="#d8e4fb" stroke="#3460c8" stroke-width="1.4"/>
      <rect x="64" y="46" width="10" height="32" rx="3" fill="#fde2c4" stroke="#c87a28" stroke-width="1.4"/>
      <g fill="#c8a8e8" opacity="0.85">
        <path d="M16 20 L18 22 L16 24 L14 22 Z"/>
        <path d="M82 24 L84 26 L82 28 L80 26 Z"/>
        <path d="M80 70 L82 72 L80 74 L78 72 Z"/>
      </g>
      <circle cx="14" cy="50" r="1.5" fill="#f4b8d4"/>
      <circle cx="82" cy="54" r="1.5" fill="#a8d8c8"/>
    </svg>`;

  // ── Séquences de mouvements ────────────────────────────────
  // Palindrome de mélange (mélange puis inverse) + rotation Y entière
  // → la nouvelle face apparaît GRÂCE au mélange, pas par un pop.
  function _palindrome(mix, dur = 120) {
    const fwd = mix.map(m => ({ ...m, duration: dur, gap: 0 }));
    const rev = [...mix].reverse().map(m => ({ ...m, angle: -m.angle, duration: dur, gap: 0 }));
    return [...fwd, ...rev];
  }
  function _wholeY(angle, dur = 180) {
    return [-1, 0, 1].map(L => ({ axis:'y', layer:L, angle, duration:dur, gap:0 }));
  }
  const _MIX_A = [
    { axis:'x', layer: 1, angle:-90 },
    { axis:'z', layer: 1, angle:-90 },
    { axis:'y', layer: 1, angle: 90 },
  ];
  const _MIX_B = [
    { axis:'z', layer: 1, angle: 90 },
    { axis:'x', layer:-1, angle: 90 },
    { axis:'y', layer:-1, angle:-90 },
  ];
  // Palindrome SEUL (plus de rotation entière wholeY). Le palindrome revient
  // EXACTEMENT à l'état résolu → le cube garde TOUJOURS son orientation canonique
  // (face avant F au front). La nouvelle vue est repeinte au MILIEU du mélange
  // (cf. navigate → onStep) : elle s'assemble pendant le « dé-mélange ».
  // Avant, wholeY(±90) laissait le cube tourné selon l'historique de navigation
  // → la face gauche/droite n'était plus déterministe (d'où le bug « mauvaise
  // face »). _wholeY est conservé (non utilisé) au cas où.
  const SCRAMBLE_TO_RESULTS   = _palindrome(_MIX_A);
  const SCRAMBLE_TO_QUESTIONS = _palindrome(_MIX_B);

  // ── État global du composant ───────────────────────────────
  let cubies = makeCubies();
  let activeMove = null;            // { axis, layer, angle, t } pendant un move
  let runningSeq = null;            // séquence en cours
  // dérive idle (suit la souris). Vue « coin » (yaw -45°) : on voit DEUX faces
  // côte à côte. Avec rotateY(-45), la face AVANT (= vue courante, logo F) a sa
  // normale en x = sin(-45) < 0 → elle est à GAUCHE ; la face DROITE (R) porte
  // l'autre vue (= destination cliquable). D'où : gauche = page actuelle,
  // droite = page où l'on peut aller (cf. demande utilisateur).
  let drift = { rx: -8, ry: -45 };
  let frontView = 'questions';      // vue actuellement en face (synchronisée)
  let frozenView = 'questions';     // vue gelée pendant l'animation
  let hoverFace = null;             // face actuellement survolée

  // DOM refs
  let stage = null;
  let flipEl = null;     // .cube-flip-y → reçoit la dérive
  let rootEl = null;     // .cube-root   → contient les cubies
  const cubieEls = new Map(); // id → { el, stickers: [{ stickerEl, faceEl, originalDir }] }

  function applyMoveToCubie(cubie, move) {
    const { axis, layer, angle } = move;
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    if (cubie.pos[idx] !== layer) return cubie;
    const rad = angle * Math.PI / 180;
    const newPos = vRot(cubie.pos, axis, rad);
    let rotMat;
    if (axis === 'x') rotMat = mRotX(rad);
    else if (axis === 'y') rotMat = mRotY(rad);
    else rotMat = mRotZ(rad);
    return { ...cubie, pos: newPos, ori: mMul(rotMat, cubie.ori) };
  }

  // ── Build DOM des 26 cubies + stickers (une seule fois) ────
  function buildCubieDOM() {
    cubieEls.clear();
    rootEl.innerHTML = '';
    cubies.forEach(c => {
      const [ox, oy, oz] = c.id.split(',').map(Number);
      const cubieEl = document.createElement('div');
      cubieEl.className = 'rk-cubie';

      // Shell : 6 faces sombres opaques pour effet "plein"
      const shell = document.createElement('div');
      shell.className = 'rk-cubie-shell';
      shell.setAttribute('aria-hidden', 'true');
      const shellTransforms = [
        `translateZ(${HALF-0.5}px)`,
        `rotateY(180deg) translateZ(${HALF-0.5}px)`,
        `rotateY(90deg) translateZ(${HALF-0.5}px)`,
        `rotateY(-90deg) translateZ(${HALF-0.5}px)`,
        `rotateX(90deg) translateZ(${HALF-0.5}px)`,
        `rotateX(-90deg) translateZ(${HALF-0.5}px)`,
      ];
      shellTransforms.forEach(t => {
        const sf = document.createElement('div');
        sf.className = 'rk-cs-face';
        sf.style.transform = t;
        shell.appendChild(sf);
      });
      cubieEl.appendChild(shell);

      // Stickers visibles selon position originale
      const stickerData = [];
      originalStickers([ox, oy, oz]).forEach(s => {
        // Face plastique sombre derrière (effet anneau sans-stickerless)
        const faceEl = document.createElement('div');
        faceEl.className = 'rk-cubie-face';
        faceEl.style.transform = cubieFaceCSS(s.localDir);
        faceEl.setAttribute('aria-hidden', 'true');
        cubieEl.appendChild(faceEl);

        // Sticker (couleur ou logo selon la face originale)
        const stickerEl = document.createElement('div');
        stickerEl.className = 'rk-sticker';
        stickerEl.style.transform = stickerCSS(s.localDir);
        stickerEl.style.background = s.color;
        cubieEl.appendChild(stickerEl);

        stickerData.push({
          stickerEl, faceEl,
          localDir: s.localDir,
          color: s.color,
          origPos: [ox, oy, oz],
        });
      });

      rootEl.appendChild(cubieEl);
      cubieEls.set(c.id, { el: cubieEl, stickers: stickerData });
    });
  }

  // ── Met à jour la transform de chaque cubie selon son état + activeMove ─
  function renderCubieTransforms() {
    let rotorTransform = null;
    let rotorIds = new Set();
    if (activeMove) {
      const { axis, layer, angle, t } = activeMove;
      const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      rotorIds = new Set(cubies.filter(c => c.pos[idx] === layer).map(c => c.id));
      const ang = (angle * t) * Math.PI / 180;
      let m;
      if (axis === 'x') m = mRotX(ang);
      else if (axis === 'y') m = mRotY(ang);
      else m = mRotZ(ang);
      rotorTransform = mStr(m);
    }
    cubies.forEach(c => {
      const ref = cubieEls.get(c.id);
      if (!ref) return;
      const baseT = `translate3d(${c.pos[0]*STEP}px, ${c.pos[1]*STEP}px, ${c.pos[2]*STEP}px) ${mStr(c.ori)}`;
      const fullT = rotorIds.has(c.id) ? `${rotorTransform} ${baseT}` : baseT;
      ref.el.style.transform = fullT;
    });
  }

  // ── Logos : décide quelle face originale porte quel logo ──
  // Face F (front) = vue gelée. Autres faces (U/D/L/R/B) = vue de destination.
  function renderStickerLogos() {
    const otherView = frozenView === 'questions' ? 'resultats' : 'questions';
    const faceLogo = {
      F: frozenView, B: frozenView,
      U: otherView,  D: otherView,
      R: otherView,  L: otherView,
    };
    const settled = !activeMove && !runningSeq;
    cubieEls.forEach((ref, id) => {
      ref.stickers.forEach(sd => {
        const info = stickerInfo(sd.origPos, sd.localDir);
        const logoFor = info ? faceLogo[info.face] : null;
        const isHovered = hoverFace && info && hoverFace === info.face;
        const clickFor = (settled && logoFor && logoFor !== frontView) ? logoFor : null;

        sd.stickerEl.classList.toggle('rk-clickable', !!clickFor);
        sd.stickerEl.classList.toggle('rk-has-logo', !!logoFor);
        sd.stickerEl.classList.toggle('rk-face-hover', !!(clickFor && isHovered));
        sd.stickerEl.dataset.clickFor = clickFor || '';
        sd.stickerEl.dataset.face = info ? info.face : '';

        if (logoFor) {
          sd.stickerEl.style.background = '#fff';
          if (!sd.logoWindow || sd.logoFor !== logoFor || sd.logoCol !== info.col || sd.logoRow !== info.row) {
            // Re-build logo tile (rare; only when face mapping changes)
            sd.stickerEl.innerHTML = '';
            const win = document.createElement('div');
            win.className = 'rk-logo-window';
            const inner = document.createElement('div');
            inner.className = 'rk-logo-inner';
            const total = TILE * 3;
            inner.style.width = total + 'px';
            inner.style.height = total + 'px';
            inner.style.transform = `translate(${-info.col*TILE}px, ${-info.row*TILE}px)`;
            const scaleWrap = document.createElement('div');
            scaleWrap.style.width = total + 'px';
            scaleWrap.style.height = total + 'px';
            scaleWrap.style.transformOrigin = '0 0';
            scaleWrap.style.transform = `scale(${total/96})`;
            scaleWrap.innerHTML = logoFor === 'questions' ? SVG_QUESTIONS : SVG_RESULTS;
            inner.appendChild(scaleWrap);
            win.appendChild(inner);
            sd.stickerEl.appendChild(win);
            sd.logoWindow = win;
            sd.logoFor = logoFor;
            sd.logoCol = info.col;
            sd.logoRow = info.row;
          }
        } else {
          // Pas de logo : restore couleur d'origine, vider contenu
          sd.stickerEl.style.background = sd.color;
          if (sd.logoWindow) {
            sd.stickerEl.innerHTML = '';
            sd.logoWindow = null;
            sd.logoFor = null;
          }
        }
      });
    });
  }

  // ── Animation : exécute une séquence de moves ──────────────
  function runSequence(seq, onDone, onStep) {
    if (!seq || !seq.length) { onDone && onDone(); return; }
    runningSeq = seq;
    let cancelled = false;
    let i = 0;
    const runMove = () => {
      if (cancelled) return;
      if (i >= seq.length) {
        runningSeq = null;
        activeMove = null;
        renderCubieTransforms();
        renderStickerLogos();
        setTimeout(() => { if (!cancelled) onDone && onDone(); }, 150);
        return;
      }
      const m = seq[i];
      const dur = m.duration || 320;
      const startT = performance.now();
      const tick = (now) => {
        if (cancelled) return;
        const tt = Math.min(1, (now - startT) / dur);
        const e = tt < 0.5 ? 2*tt*tt : 1 - Math.pow(-2*tt + 2, 2) / 2;
        activeMove = { axis: m.axis, layer: m.layer, angle: m.angle, t: e };
        renderCubieTransforms();
        if (tt < 1) requestAnimationFrame(tick);
        else {
          // commit du move : on applique la rotation aux cubies de la couche
          cubies = cubies.map(c => applyMoveToCubie(c, m));
          activeMove = null;
          renderCubieTransforms();
          i++;
          if (onStep) onStep(i);
          setTimeout(runMove, m.gap == null ? 30 : m.gap);
        }
      };
      requestAnimationFrame(tick);
    };
    runMove();
    // permet de cancel si nécessaire (future use)
    return () => { cancelled = true; };
  }

  // ── Animation « héro » : le cube va au centre, grandit, se met de face,
  //    se mélange, pendant que l'arrière-plan transitionne vers l'autre menu,
  //    puis il revient se ranger dans son coin. ────────────────────────────
  let heroActive = false;
  const HERO_SCALE = 1.6;          // grossissement au centre (boîte 240 → 384px)
  const HALF_BOX   = 120;          // demi-largeur de la boîte .rk-stage (240/2)
  const CORNER_GAP = 16;           // right/bottom de .rk-stage (cf. CSS)
  const BG_SWAP_AT = 520;          // ms : bascule du menu (pendant la révélation)

  // Centre la boîte (origin 100% 100%, épinglée right/bottom:16) au milieu de
  // l'écran et l'agrandit : tx = -vw/2 + gap + HALF_BOX·S (idem pour ty).
  function enterHero() {
    if (!stage) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const S  = HERO_SCALE;
    const tx = -vw / 2 + CORNER_GAP + HALF_BOX * S;
    const ty = -vh / 2 + CORNER_GAP + HALF_BOX * S;
    stage.style.zIndex = '140';                       // au-dessus de tout le temps de l'anim
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${S})`;
    if (flipEl) flipEl.style.transform = 'rotateX(-14deg) rotateY(0deg)';  // « de face »
  }

  function exitHero() {
    if (!stage) return;
    stage.style.transform = 'scale(0.8)';             // retour dans le coin (= valeur CSS)
    if (flipEl) flipEl.style.transform = `rotateX(${drift.rx}deg) rotateY(${drift.ry}deg)`;
    setTimeout(() => { heroActive = false; if (stage) stage.style.zIndex = ''; }, 620);
  }

  // Fond : fond actuel → 0, swap du menu à mi-parcours, nouveau menu 0 → 1.
  function bgTransition(target) {
    const qEl = document.getElementById('hrQuestionsRightHome');
    const rEl = document.querySelector('.hr-results-section');
    const outEl = (frozenView === 'questions') ? qEl : rEl;
    const inEl  = (target     === 'questions') ? qEl : rEl;
    if (outEl) { outEl.style.transition = 'opacity .32s ease'; outEl.style.opacity = '0'; }
    setTimeout(() => {
      if (typeof hrApplyViewMode === 'function' && typeof HR !== 'undefined') {
        HR.viewMode = (target === 'resultats') ? 'results' : 'questions';
        hrApplyViewMode();                            // swap display questions ↔ résultats
      }
      if (outEl && outEl !== inEl) { outEl.style.opacity = ''; outEl.style.transition = ''; }
      if (inEl) {
        inEl.style.opacity = '0';
        inEl.style.transition = 'opacity .42s ease';
        void inEl.offsetHeight;                       // reflow → la transition part bien de 0
        requestAnimationFrame(() => { if (inEl) inEl.style.opacity = '1'; });
        setTimeout(() => { if (inEl) { inEl.style.opacity = ''; inEl.style.transition = ''; } }, 520);
      }
    }, BG_SWAP_AT);
  }

  // ── Navigation : déclenche le mélange + l'anim héro + swap vue ─────────────
  // HR est déclaré en `const` au top-level de horaires.js → pas sur window mais
  // accessible en bareword (les scripts classiques partagent le global scope).
  function navigate(target) {
    if (runningSeq || heroActive) return;
    if (target === frontView) return;
    frozenView = frontView;   // gèle l'ancien front pour le rendu logos pendant le scramble
    heroActive = true;
    enterHero();              // 1. au centre, grandit, de face
    const seq = target === 'resultats' ? SCRAMBLE_TO_RESULTS : SCRAMBLE_TO_QUESTIONS;
    const mid = Math.floor(seq.length / 2);   // fin de l'aller du palindrome (jumble max)
    runSequence(seq, () => {  // 2. se mélange (concurrent), revient à l'état résolu
      frontView = target;
      frozenView = target;
      renderStickerLogos();
      exitHero();             // 4. revient se ranger dans le coin (orientation canonique)
    }, (i) => {
      // Au milieu du mélange (cube le plus brouillé), on bascule sur la nouvelle
      // vue : ses logos s'assemblent pendant le « dé-mélange » de la 2e moitié.
      if (i === mid) { frozenView = target; frontView = target; renderStickerLogos(); }
    });
    bgTransition(target);     // 3. l'arrière-plan transitionne vers l'autre menu
  }

  // ── Dérive idle suivant la souris ──────────────────────────
  function onMouseMove(e) {
    if (heroActive) return;   // pendant l'animation « héro », on ne touche pas à flipEl
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / window.innerWidth;
    const dy = (e.clientY - cy) / window.innerHeight;
    drift.rx = -8 + dy * -8;
    drift.ry = -45 - dx * 14;  // vue « coin » : gauche = vue courante, droite = destination
    if (flipEl) flipEl.style.transform = `rotateX(${drift.rx}deg) rotateY(${drift.ry}deg)`;
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    stage = document.getElementById('hrCubeStage');
    if (!stage) return;
    stage.innerHTML = `
      <div class="rk-perspective">
        <div class="rk-flip-y">
          <div class="rk-root"></div>
        </div>
      </div>`;
    flipEl = stage.querySelector('.rk-flip-y');
    rootEl = stage.querySelector('.rk-root');
    flipEl.style.transform = `rotateX(${drift.rx}deg) rotateY(${drift.ry}deg)`;

    buildCubieDOM();
    renderCubieTransforms();
    renderStickerLogos();

    // Mouse drift
    window.addEventListener('mousemove', onMouseMove);

    // Click delegation : un click sur n'importe quel sticker cliquable
    // déclenche la nav vers la vue inscrite en data-click-for.
    stage.addEventListener('click', (ev) => {
      const st = ev.target.closest('.rk-sticker.rk-clickable');
      if (!st) return;
      const target = st.dataset.clickFor;
      if (target) navigate(target);
    });
    // Hover : illumine les 9 stickers de la face survolée
    stage.addEventListener('mouseover', (ev) => {
      const st = ev.target.closest('.rk-sticker.rk-clickable');
      if (!st) { hoverFace = null; renderStickerLogos(); return; }
      hoverFace = st.dataset.face || null;
      renderStickerLogos();
    });
    stage.addEventListener('mouseout', (ev) => {
      // Reset uniquement si on sort de la zone du cube
      if (!stage.contains(ev.relatedTarget)) {
        hoverFace = null;
        renderStickerLogos();
      }
    });
  }

  // ── API publique ───────────────────────────────────────────
  // Sync : appelé par hrApplyViewMode pour aligner le cube sur HR.viewMode
  // sans déclencher d'animation (cas où l'utilisateur switch depuis une
  // autre source — page reload, hrRenderResults qui force results, etc.).
  window.rubiksCubeSyncView = function (mode) {
    const target = mode === 'results' ? 'resultats' : 'questions';
    if (target === frontView || runningSeq) return;
    frontView = target;
    frozenView = target;
    if (stage) renderStickerLogos();
  };

  // Show/hide : appelé par hrApplyViewMode selon la présence de résultats
  window.rubiksCubeSetVisible = function (visible) {
    if (!stage) return;
    stage.style.display = visible ? '' : 'none';
  };

  // Debug/test : renvoie les logos RÉELLEMENT visibles à gauche et à droite, en
  // tenant compte de l'orientation physique des cubies (matrice ori) ET de la
  // dérive (flipEl). Sert à vérifier que « gauche = vue courante, droite =
  // destination » quel que soit l'historique de navigation.
  window.rubiksCubeDebugFaces = function () {
    if (!flipEl) return null;
    const mm = /rotateX\((-?[\d.]+)deg\)\s*rotateY\((-?[\d.]+)deg\)/.exec(flipEl.style.transform || '');
    const rx = (mm ? +mm[1] : 0) * Math.PI / 180, ry = (mm ? +mm[2] : 0) * Math.PI / 180;
    const Ry = v => [v[0]*Math.cos(ry)+v[2]*Math.sin(ry), v[1], -v[0]*Math.sin(ry)+v[2]*Math.cos(ry)];
    const Rx = v => [v[0], v[1]*Math.cos(rx)-v[2]*Math.sin(rx), v[1]*Math.sin(rx)+v[2]*Math.cos(rx)];
    const oriById = new Map(cubies.map(c => [c.id, c.ori]));
    let left = null, right = null;
    cubieEls.forEach((ref, id) => {
      const ori = oriById.get(id); if (!ori) return;
      ref.stickers.forEach(sd => {
        if (!sd.logoFor) return;
        const v = sd.localDir;
        // ori (4x4 col-major) appliquée à la normale locale, puis dérive Rx·Ry.
        const ox = ori[0]*v[0]+ori[4]*v[1]+ori[8]*v[2];
        const oy = ori[1]*v[0]+ori[5]*v[1]+ori[9]*v[2];
        const oz = ori[2]*v[0]+ori[6]*v[1]+ori[10]*v[2];
        const w = Rx(Ry([ox, oy, oz]));
        if (w[2] < 0.3) return;                 // garde seulement les faces bien en face
        if (!left  || w[0] < left.x)  left  = { x: w[0], logo: sd.logoFor };
        if (!right || w[0] > right.x) right = { x: w[0], logo: sd.logoFor };
      });
    });
    return {
      left:  left  && left.logo,
      right: right && right.logo,
      leftX:  left  && +left.x.toFixed(2),
      rightX: right && +right.x.toFixed(2),
      frontView, frozenView, running: !!runningSeq, hero: heroActive,
    };
  };

  // Debug/test : applique INSTANTANÉMENT (sans animation) toute la séquence d'une
  // navigation (mêmes moves, même bascule de vue au milieu que navigate), puis
  // renvoie l'état des faces. Permet de vérifier l'état FINAL (cube résolu,
  // gauche/droite corrects) sur de nombreuses navigations sans dépendre du timing
  // rAF/setTimeout (throttlé en onglet d'arrière-plan).
  window.rubiksCubeDebugNavigateInstant = function (target) {
    if (target === frontView) return window.rubiksCubeDebugFaces();
    frozenView = frontView;
    const seq = target === 'resultats' ? SCRAMBLE_TO_RESULTS : SCRAMBLE_TO_QUESTIONS;
    const mid = Math.floor(seq.length / 2);
    seq.forEach((m, idx) => {
      cubies = cubies.map(c => applyMoveToCubie(c, m));
      if (idx + 1 === mid) { frozenView = target; frontView = target; }
    });
    frontView = target; frozenView = target;
    renderCubieTransforms();
    renderStickerLogos();
    return window.rubiksCubeDebugFaces();
  };

  // Debug/test : true si tous les cubies sont à leur position d'origine (résolu).
  window.rubiksCubeDebugIsSolved = function () {
    return cubies.every(c => {
      const [x, y, z] = c.id.split(',').map(Number);
      return c.pos[0] === x && c.pos[1] === y && c.pos[2] === z;
    });
  };

  // Démarre dès que le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
