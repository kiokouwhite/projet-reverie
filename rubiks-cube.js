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
  const SCRAMBLE_TO_RESULTS   = [..._palindrome(_MIX_A), ..._wholeY(-90)];
  const SCRAMBLE_TO_QUESTIONS = [..._palindrome(_MIX_B), ..._wholeY( 90)];

  // ── État global du composant ───────────────────────────────
  let cubies = makeCubies();
  let activeMove = null;            // { axis, layer, angle, t } pendant un move
  let runningSeq = null;            // séquence en cours
  let drift = { rx: -8, ry: -58 };  // dérive idle (suit la souris)
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
  function runSequence(seq, onDone) {
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
          setTimeout(runMove, m.gap == null ? 30 : m.gap);
        }
      };
      requestAnimationFrame(tick);
    };
    runMove();
    // permet de cancel si nécessaire (future use)
    return () => { cancelled = true; };
  }

  // ── Navigation : déclenche le mélange + swap vue ───────────
  function navigate(target) {
    if (runningSeq) return;
    if (target === frontView) return;
    frozenView = frontView; // gèle l'ancien front pour le rendu logos pendant le scramble
    const seq = target === 'resultats' ? SCRAMBLE_TO_RESULTS : SCRAMBLE_TO_QUESTIONS;
    runSequence(seq, () => {
      frontView = target;
      frozenView = target;
      renderStickerLogos();
    });
    // Bascule de la vue du site à mi-animation pour synchroniser avec la rotation du cube.
    // HR est déclaré en `const` au top-level de horaires.js → pas sur window
    // mais accessible en bareword identifier (les scripts classiques partagent
    // le même global scope, même si const ne pollue pas window).
    setTimeout(() => {
      if (typeof hrApplyViewMode === 'function' && typeof HR !== 'undefined') {
        HR.viewMode = target === 'resultats' ? 'results' : 'questions';
        hrApplyViewMode();
      }
    }, 350);
  }

  // ── Dérive idle suivant la souris ──────────────────────────
  function onMouseMove(e) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / window.innerWidth;
    const dy = (e.clientY - cy) / window.innerHeight;
    drift.rx = -8 + dy * -8;
    drift.ry = -58 + dx * 14;
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

  // Démarre dès que le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
