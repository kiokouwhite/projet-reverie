// ============================================================
// LM-TRANSITIONS.JS — 9 transitions oniriques pour le Layout Maker
//
// Source : design pack "Transition layout Maker" (handoff Claude Design,
// chat du 2026-05-16). Le prototype original était en React/JSX ; on
// l'adapte ici en vanilla JS pour matcher la stack du projet.
//
// Les 9 transitions :
//   1. Rêverie    — blur dissolve avec bloom
//   2. Aurore     — ruban gradient diagonal + sparkles
//   3. Voile      — rideaux nuageux SVG qui s'écartent
//   4. Bulles     — cascade de bulles savon
//   5. Liquide    — vague SVG qui monte et redescend
//   6. Iris       — éclosion circulaire depuis le centre + étoiles
//   7. Poussière  — particules diagonales en traînée
//   8. Pli        — pli papier 3D (rotateY hinged)
//   9. Onde       — ripple concentrique depuis le point cliqué
//
// API :
//   lmPlayTransition(containerEl, fromPanelEl, toPanelEl, opts?) → Promise
//     opts.id       — id de la transition (sinon LM.transitionId, sinon random)
//     opts.origin   — {x,y} en % pour Onde (sinon centre)
//
// Le container doit avoir position:relative (sinon on lui ajoute la classe
// `.lm-tx-host` qui le fait).
// ============================================================

(function(){

  // ── Registre des 9 transitions ──────────────────────────────────────────
  const LM_TRANSITIONS = [
    { id:'reverie',   name:'Rêverie',    sub:'Dissolve onirique',  duration:1300, render: txReverie  },
    { id:'aurore',    name:'Aurore',     sub:'Ruban de lumière',   duration:1400, render: txAurore   },
    { id:'voile',     name:'Voile',      sub:'Rideaux nuageux',    duration:1500, render: txVoile    },
    { id:'bulles',    name:'Bulles',     sub:'Cascade de savon',   duration:1600, render: txBulles   },
    { id:'liquide',   name:'Liquide',    sub:'Vague pastel',       duration:1500, render: txLiquide  },
    { id:'iris',      name:'Iris',       sub:'Éclosion stellaire', duration:1200, render: txIris     },
    { id:'poussiere', name:'Poussière',  sub:'Traînée stardust',   duration:1300, render: txPoussiere},
    { id:'pli',       name:'Pli',        sub:'Page de rêve',       duration:1300, render: txPli      },
    { id:'onde',      name:'Onde',       sub:'Ripple cosmique',    duration:1200, render: txOnde     },
  ];
  window.LM_TRANSITIONS = LM_TRANSITIONS;

  // ── Helpers DOM ────────────────────────────────────────────────────────
  function el(tag, cls, css){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (css) Object.assign(e.style, css);
    return e;
  }
  // Snapshot complet d'un nœud (ex. .lm-modal-body) en inline-ant tous les
  // <canvas> en <img data:…> — car cloneNode ne copie pas le bitmap d'un
  // canvas (le clone serait blanc). Retourne null si toDataURL échoue
  // (canvas tainted CORS) → caller doit gérer fallback.
  function snapshotWithCanvases(srcEl){
    let clone;
    try {
      clone = srcEl.cloneNode(true);
      const realCanvases  = srcEl.querySelectorAll('canvas');
      const cloneCanvases = clone.querySelectorAll('canvas');
      realCanvases.forEach((c, i) => {
        if (!cloneCanvases[i]) return;
        if (!c.width || !c.height) return;
        const dataUrl = c.toDataURL('image/png');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.width  = c.width;
        img.height = c.height;
        // Recopie les styles inline et les classes
        img.style.cssText = c.getAttribute('style') || '';
        img.className = c.className;
        cloneCanvases[i].replaceWith(img);
      });
    } catch(e) {
      console.warn('[lm-tx] snapshotWithCanvases failed:', e);
      return null;
    }
    // Désactive interactions sur le clone
    clone.querySelectorAll('input,button,select,textarea').forEach(n => {
      n.setAttribute('tabindex', '-1');
      n.disabled = true;
    });
    clone.style.pointerEvents = 'none';
    return clone;
  }
  window.lmSnapshotModalBody = function(){
    const mb = document.querySelector('.lm-modal-body');
    return mb ? snapshotWithCanvases(mb) : null;
  };

  function snapshot(panelElOrClone){
    // Accepte soit un panel live (qu'on clone), soit un clone déjà préparé
    // (cas où le caller veut snapshoter à un moment précis du cycle de vie,
    // ex. avant que le panel sortant ne soit dépouillé par les inits suivants).
    const clone = (panelElOrClone && panelElOrClone.cloneNode)
      ? panelElOrClone.cloneNode(true)
      : panelElOrClone;
    clone.removeAttribute('id');
    clone.style.display = 'block';
    clone.style.position = 'absolute';
    clone.style.inset = '0';
    clone.style.pointerEvents = 'none';
    // Empêche les inputs du clone de capturer le focus / submit
    clone.querySelectorAll('input,button,select,textarea').forEach(n => {
      n.setAttribute('tabindex', '-1');
      n.disabled = true;
    });
    // Force l'apparence "active" même si le clone vient d'un panel sans la classe
    clone.classList.add('lm-step-active');
    return clone;
  }

  // ── Renderers ───────────────────────────────────────────────────────────
  // Signature : (stageC, stageA, fromClone, toClone, opts)
  //   stageC = stage compact, positionné sur la bbox du panel (snapshots)
  //   stageA = stage ambient, étendu sur tout le modal-body (décoration)
  // Chaque transition place ses éléments dans le bon stage selon que
  // l'élément doit s'aligner pixel-perfect avec le snapshot (→ stageC) ou
  // peut "déborder" librement sur tout le modal (→ stageA).

  function wrap(fromClone, toClone, fromCls, toCls){
    const fL = el('div', 't-layer ' + (fromCls||''));
    const tL = el('div', 't-layer ' + (toCls||''));
    fL.appendChild(fromClone);
    tL.appendChild(toClone);
    return [fL, tL];
  }

  function txReverie(stageC, stageA, f, t, opts){
    // Mode "bloc unifié" : floute TOUT le modal-body (panel + preview)
    // avec une montée puis descente du blur, plutôt que de flouter
    // seulement le snapshot du panel à gauche.
    const fb = opts?.fullBodySnaps;
    if (fb && fb[0] && fb[1]) {
      const fromBlock = fb[0];
      const toBlock   = fb[1];
      [fromBlock, toBlock].forEach(b => {
        Object.assign(b.style, {
          position:'absolute', inset:'0', pointerEvents:'none',
          background: 'linear-gradient(145deg, #fef9ff 0%, #fff4fc 50%, #f5f0ff 100%)',
        });
      });
      fromBlock.classList.add('rv-fb-out');
      toBlock.classList.add('rv-fb-in');
      // Ordre crucial : toBlock D'ABORD (dessous, défloute), fromBlock
      // ENSUITE (au-dessus, fade out). Sinon le fromBlock cache le
      // toBlock pendant tout le fondu et on ne voit pas le défloutage.
      stageA.append(toBlock, fromBlock);
    } else {
      const [a,b] = wrap(f,t,'rv-out','rv-in');
      stageC.append(a, b);
    }
    stageA.append(el('div','rv-bloom'));  // bloom = ambient (rayonne)
  }

  function txAurore(stageC, stageA, f, t, opts){
    // Si on a deux snapshots full-body (caller les a préparés AVANT et
    // APRÈS le switch), on swipe TOUT le modal-body comme un seul bloc
    // — c'est le mode "bloc unifié" demandé par le user.
    // Sinon fallback : snapshot du panel seul comme les autres transitions.
    const fb = opts?.fullBodySnaps;
    if (fb && fb[0] && fb[1]) {
      const fromBlock = fb[0];
      const toBlock   = fb[1];
      // Background OPAQUE (même dégradé que .lm-modal) pour éviter qu'on
      // voie le modal-bg noir derrière à travers le snapshot transparent.
      [fromBlock, toBlock].forEach(b => {
        Object.assign(b.style, {
          position:'absolute', inset:'0', pointerEvents:'none',
          background: 'linear-gradient(145deg, #fef9ff 0%, #fff4fc 50%, #f5f0ff 100%)',
        });
      });
      fromBlock.classList.add('au-fb-out');
      toBlock.classList.add('au-fb-in');
      stageA.append(fromBlock, toBlock);
    } else {
      const [a,b] = wrap(f,t,'au-out','au-in');
      stageC.append(a, b);
    }
    // Ruban d'aurore traverse tout le modal en diagonale
    const ribbon = el('div','au-ribbon');
    ribbon.appendChild(el('div','au-ribbon-inner'));
    stageA.appendChild(ribbon);
    // Étincelles partout sur le modal
    for (let i=0; i<24; i++){
      const s = el('div','au-sparkle');
      const size = 4 + Math.random()*5;
      Object.assign(s.style, {
        top: (Math.random()*100)+'%',
        left:(Math.random()*100)+'%',
        width:size+'px', height:size+'px',
        animationDelay:(200+Math.random()*800)+'ms',
      });
      stageA.appendChild(s);
    }
  }

  function txVoile(stageC, stageA, f, t){
    const [a,b] = wrap(f,t,'vo-out','vo-in');
    stageC.append(a,b);
    // Rideaux nuageux confinés au modal (stage A = modal-body). Ils sont
    // dimensionnés à 80% de largeur (au lieu de 60% du proto) ET vont
    // jusqu'à translateX(0) au milieu de l'anim (au lieu de -10%/+10%),
    // pour garantir 60% de chevauchement et masquer COMPLÈTEMENT le modal
    // au moment du switch — pas de gap visible au centre.
    // IDs uniques par instance (évite collision avec un résidu DOM).
    const uid = 'vo-' + Math.random().toString(36).slice(2, 8);
    // Création explicite via createElementNS — garantit le namespace SVG
    // pour TOUS les enfants (gradient, stops, path). Plus fiable que
    // innerHTML qui peut casser selon le browser/contexte.
    const NS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs){
      const e = document.createElementNS(NS, tag);
      if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    function makeCurtain(side, gradId, stops, pathD){
      const svg = svgEl('svg', {
        'class': 'vo-curtain vo-' + side,
        viewBox: '0 0 200 400',
        preserveAspectRatio: 'none',
      });
      const defs = svgEl('defs');
      const grad = svgEl('radialGradient', {
        id: gradId,
        cx: side === 'left' ? '60%' : '40%',
        cy: '50%', r: '80%',
      });
      stops.forEach(([off, col]) => {
        grad.appendChild(svgEl('stop', {
          offset: off, 'stop-color': col, 'stop-opacity': '1',
        }));
      });
      defs.appendChild(grad);
      svg.appendChild(defs);
      svg.appendChild(svgEl('path', { d: pathD, fill: 'url(#' + gradId + ')' }));
      return svg;
    }
    const leftSvg = makeCurtain('left', uid + '-g1', [
      ['0%',  '#ffffff'],
      ['60%', '#e9def8'],
      ['100%','#d4c0f0'],
    ], 'M0,0 L160,0 Q180,40 165,80 Q200,120 170,160 Q200,200 165,240 Q190,290 160,330 Q175,370 150,400 L0,400 Z');
    const rightSvg = makeCurtain('right', uid + '-g2', [
      ['0%',  '#ffffff'],
      ['60%', '#ffe3f0'],
      ['100%','#f5c8e0'],
    ], 'M200,0 L40,0 Q20,40 35,80 Q0,120 30,160 Q0,200 35,240 Q10,290 40,330 Q25,370 50,400 L200,400 Z');
    stageA.appendChild(leftSvg);
    stageA.appendChild(rightSvg);
  }

  function txBulles(stageC, stageA, f, t, opts){
    // Mode "bloc unifié" : swipe VERTICAL HAUT de TOUT le modal-body,
    // synchronisé avec la montée des bulles. Le panel sortant monte
    // hors-écran, le nouveau arrive depuis le bas (effet "tiré par les
    // bulles vers le haut"). Si pas de fullBodySnaps, fallback sur le
    // crossfade panel-only des autres bulles.
    const fb = opts?.fullBodySnaps;
    if (fb && fb[0] && fb[1]) {
      const fromBlock = fb[0];
      const toBlock   = fb[1];
      [fromBlock, toBlock].forEach(b => {
        Object.assign(b.style, {
          position:'absolute', inset:'0', pointerEvents:'none',
          background: 'linear-gradient(145deg, #fef9ff 0%, #fff4fc 50%, #f5f0ff 100%)',
        });
      });
      fromBlock.classList.add('bu-fb-out');
      toBlock.classList.add('bu-fb-in');
      stageA.append(fromBlock, toBlock);
    } else {
      const [a,b] = wrap(f,t,'bu-out','bu-in');
      stageC.append(a,b);
    }
    // Bulles à travers tout le modal — densité MAX pour vraiment tout
    // recouvrir, avec des bulles XL (jusqu'à 680px) qui font effet
    // "bain moussant" : impossible de voir à travers.
    const hues = ['rose','lav','sky'];
    const N = 240;
    for (let i=0; i<N; i++){
      // Mix : 25% petites (50-130), 30% moyennes (130-260),
      //       25% grandes (260-420), 20% XXL (420-680)
      const r = Math.random();
      let size;
      if (r < 0.25)      size = 50  + Math.random()*80;   // 50-130
      else if (r < 0.55) size = 130 + Math.random()*130;  // 130-260
      else if (r < 0.80) size = 260 + Math.random()*160;  // 260-420
      else               size = 420 + Math.random()*260;  // 420-680
      const hue  = hues[Math.floor(Math.random()*3)];
      const bub = el('div', 'bu-bubble bu-'+hue);
      Object.assign(bub.style, {
        width:size+'px', height:size+'px',
        left:(-15 + Math.random()*130)+'%',
        animationDelay:(Math.random()*1100)+'ms',
      });
      bub.style.setProperty('--drift', ((Math.random()-.5)*120)+'px');
      stageA.appendChild(bub);
    }
  }

  function txLiquide(stageC, stageA, f, t){
    const [a,b] = wrap(f,t,'lq-out','lq-in');
    stageC.append(a,b);
    // Vague à l'échelle du modal entier
    const wrapEl = el('div','lq-wave-wrap');
    wrapEl.innerHTML = `
      <svg class="lq-wave" viewBox="0 0 1200 600" preserveAspectRatio="none">
        <defs><linearGradient id="lq-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d8c4ff" stop-opacity=".95"/>
          <stop offset="50%" stop-color="#e9c4ff" stop-opacity=".95"/>
          <stop offset="100%" stop-color="#ffc8e0"/>
        </linearGradient></defs>
        <path d="M0,80 C200,20 400,140 600,80 C800,20 1000,140 1200,80 L1200,600 L0,600 Z" fill="url(#lq-g)"/>
      </svg>
      <svg class="lq-wave lq-wave-2" viewBox="0 0 1200 600" preserveAspectRatio="none">
        <path d="M0,120 C200,60 400,180 600,120 C800,60 1000,180 1200,120 L1200,600 L0,600 Z" fill="#ffffff" opacity=".4"/>
      </svg>`;
    stageA.appendChild(wrapEl);
  }

  function txIris(stageC, stageA, f, t, opts){
    // Mode "bloc unifié" : fade-blur sur TOUT le modal-body (panel +
    // preview) → effet "éclosion onirique" sans ring iris qui serait
    // décalé sur un fond aussi large. fromBlock fade-out, toBlock
    // défloute en dessous. Quelques étoiles ambient pour le côté magique.
    const fb = opts?.fullBodySnaps;
    if (fb && fb[0] && fb[1]) {
      const fromBlock = fb[0];
      const toBlock   = fb[1];
      [fromBlock, toBlock].forEach(b => {
        Object.assign(b.style, {
          position:'absolute', inset:'0', pointerEvents:'none',
          background: 'linear-gradient(145deg, #fef9ff 0%, #fff4fc 50%, #f5f0ff 100%)',
        });
      });
      fromBlock.classList.add('ir-fb-out');
      toBlock.classList.add('ir-fb-in');
      stageA.append(toBlock, fromBlock); // toBlock dessous, fromBlock dessus
      // Étoiles décoratives autour du modal (sans ring central)
      for (let i=0;i<10;i++){
        const angle = (i/10)*Math.PI*2;
        const s = el('div','ir-star');
        Object.assign(s.style, {
          left: (Math.cos(angle)*42 + 50)+'%',
          top:  (Math.sin(angle)*42 + 50)+'%',
          animationDelay:(200 + i*40)+'ms',
        });
        s.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14"><path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#fff"/></svg>`;
        stageA.appendChild(s);
      }
    } else {
      // Fallback panel-only : iris original (clip-path circle + ring)
      const fL = el('div','t-layer ir-out');   fL.appendChild(f);
      const tWrap = el('div','t-layer ir-in-wrap');
      const tIn = el('div','ir-in');           tIn.appendChild(t);
      tWrap.appendChild(tIn);
      stageC.append(fL, tWrap);
      stageA.append(el('div','ir-ring'));
      for (let i=0;i<14;i++){
        const angle = (i/14)*Math.PI*2;
        const s = el('div','ir-star');
        Object.assign(s.style, {
          left: (Math.cos(angle)*45 + 50)+'%',
          top:  (Math.sin(angle)*45 + 50)+'%',
          animationDelay:(300 + i*30)+'ms',
        });
        s.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14"><path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#fff"/></svg>`;
        stageA.appendChild(s);
      }
    }
  }

  function txPoussiere(stageC, stageA, f, t){
    const [a,b] = wrap(f,t,'po-out','po-in');
    stageC.append(a,b);
    // Particules diagonales traversent tout le modal — densité MAX
    // (600 particules, tailles 12-80px) pour effet "tempête de stardust"
    // qui recouvre largement la zone preview.
    const colors = ['#c4b5ff','#ffc8e0','#ffd6c9','#c9e3ff','#ffffff'];
    const N = 600;
    for (let i=0; i<N; i++){
      // Mix de tailles : 50% small (12-25), 30% medium (25-50),
      //                  15% large (50-65), 5% XL (65-80)
      const r = Math.random();
      let size;
      if (r < 0.50)      size = 12 + Math.random()*13;
      else if (r < 0.80) size = 25 + Math.random()*25;
      else if (r < 0.95) size = 50 + Math.random()*15;
      else               size = 65 + Math.random()*15;
      const speed = 800 + Math.random()*500;
      const color = colors[Math.floor(Math.random()*5)];
      const p = el('div','po-particle');
      Object.assign(p.style, {
        top: (-10 + Math.random()*120)+'%',
        width:size+'px', height:size+'px',
        background: color,
        animationDelay:(Math.random()*500)+'ms',
        animationDuration: speed+'ms',
        boxShadow: `0 0 ${size*1.5}px ${color}`,
        willChange: 'transform, opacity',
      });
      stageA.appendChild(p);
    }
  }

  function txPli(stageC, stageA, f, t, opts){
    // Mode "bloc unifié" : rotation 3D sur TOUT le modal-body (panel +
    // preview). Effet "page qui se tourne" sur le modal entier.
    const fb = opts?.fullBodySnaps;
    if (fb && fb[0] && fb[1]) {
      const fromBlock = fb[0];
      const toBlock   = fb[1];
      [fromBlock, toBlock].forEach(b => {
        Object.assign(b.style, {
          position:'absolute', inset:'0', pointerEvents:'none',
          background: 'linear-gradient(145deg, #fef9ff 0%, #fff4fc 50%, #f5f0ff 100%)',
        });
      });
      // Pli sur stage A pour que la perspective englobe tout le modal-body
      const persp = el('div','pli-perspective');
      const cardOut = el('div','pli-card pli-out');
      cardOut.appendChild(fromBlock);
      cardOut.appendChild(el('div','pli-shade'));
      const cardIn = el('div','pli-card pli-in');
      cardIn.appendChild(toBlock);
      cardIn.appendChild(el('div','pli-shade pli-shade-in'));
      persp.append(cardOut, cardIn);
      stageA.appendChild(persp);
    } else {
      // Fallback panel-only (rotation 3D sur le panel uniquement)
      const persp = el('div','pli-perspective');
      const cardOut = el('div','pli-card pli-out');
      cardOut.appendChild(f);
      cardOut.appendChild(el('div','pli-shade'));
      const cardIn = el('div','pli-card pli-in');
      cardIn.appendChild(t);
      cardIn.appendChild(el('div','pli-shade pli-shade-in'));
      persp.append(cardOut, cardIn);
      stageC.appendChild(persp);
    }
  }

  function txOnde(stageC, stageA, f, t, opts){
    const [a,b] = wrap(f,t,'on-out','on-in');
    stageC.append(a,b);
    // Ripple = ambient (rayonne sur tout le modal depuis le point cliqué)
    const ox = opts?.origin?.x ?? 50;
    const oy = opts?.origin?.y ?? 50;
    [0,180,360].forEach(d => {
      const r = el('div','on-ripple');
      r.style.left = ox+'%'; r.style.top = oy+'%';
      r.style.animationDelay = d+'ms';
      stageA.appendChild(r);
    });
    const flash = el('div','on-flash');
    flash.style.left = ox+'%'; flash.style.top = oy+'%';
    stageA.appendChild(flash);
  }

  // ── API publique ────────────────────────────────────────────────────────
  // Joue une transition entre `fromPanelEl` et `toPanelEl` à l'intérieur de
  // `containerEl`. Le from est snapshoté avant le switch, le to après.
  // Le caller est responsable de switcher l'état `display` des vrais panels
  // (typiquement via les classes existantes du layout-maker) AVANT d'appeler
  // cette fonction.
  function lmPlayTransition(containerEl, fromPanelEl, toPanelEl, opts){
    opts = opts || {};
    // Choisir la transition
    let tr;
    if (opts.id) tr = LM_TRANSITIONS.find(x => x.id === opts.id);
    if (!tr && typeof window.LM !== 'undefined' && window.LM.transitionId) {
      tr = LM_TRANSITIONS.find(x => x.id === window.LM.transitionId);
    }
    if (!tr) tr = LM_TRANSITIONS[Math.floor(Math.random()*LM_TRANSITIONS.length)];

    // Host unique = .lm-modal-body (couvre controls + preview). On y place
    // les DEUX stages : ambient (inset:0 = tout le modal-body) et content
    // (compact = bbox du toPanel relative au modal-body). Même stacking
    // context, donc l'ordre DOM décide (content après ambient → au-dessus).
    const host = (opts.ambientHost)
      || document.querySelector('.lm-modal-body')
      || containerEl.closest('.lm-modal')
      || containerEl;

    const _origPos = getComputedStyle(host).position;
    let _addedRel = false;
    if (_origPos === 'static') {
      host.style.position = 'relative';
      _addedRel = true;
    }
    host.classList.add('lm-tx-host');

    // Snapshots
    const fSnap = opts.fromSnap
      ? snapshot(opts.fromSnap)
      : (fromPanelEl ? snapshot(fromPanelEl) : el('div'));
    const tSnap = toPanelEl ? snapshot(toPanelEl) : el('div');

    // Bbox du toPanel relative au host (modal-body)
    const crH  = host.getBoundingClientRect();
    const tr2  = toPanelEl.getBoundingClientRect();
    const panelTop  = (tr2.top  - crH.top);
    const panelLeft = (tr2.left - crH.left);
    const panelW    = tr2.width;
    const panelH    = tr2.height;

    // Stage A — ambient (inset:0 du modal-body)
    const stageA = el('div','t-stage lm-tx-stage lm-tx-ambient ' + tr.id);
    Object.assign(stageA.style, { position:'absolute', inset:'0' });

    // Stage C — content (bbox panel)
    const stageC = el('div','t-stage lm-tx-stage lm-tx-content ' + tr.id);
    Object.assign(stageC.style, {
      position:'absolute',
      top:    panelTop  + 'px',
      left:   panelLeft + 'px',
      width:  panelW    + 'px',
      height: panelH    + 'px',
      inset:  'auto',
    });

    tr.render(stageC, stageA, fSnap, tSnap, opts);

    // Note : les vrais panels sont déjà masqués (visibility:hidden) par
    // le caller (lmGoTo) AVANT le toggle de class, pour éviter tout
    // flash où le nouveau panel serait brièvement visible. On les
    // récupère ici pour les restaurer dans le cleanup.
    const realPanels = containerEl.querySelectorAll('.lm-step-panel');

    // Ordre DOM crucial : stage C (snapshots) D'ABORD, stage A (effets
    // décoratifs : nuages, bulles, particules, ring iris, ripples…)
    // EN DERNIER pour qu'ils passent au-dessus des snapshots.
    host.appendChild(stageC);
    host.appendChild(stageA);

    return new Promise(resolve => {
      setTimeout(() => {
        // Callback du caller AVANT de restaurer la visibility — typiquement
        // un lmRenderPreview() forcé pour s'assurer que le canvas preview
        // est dans son état final avant qu'on le révèle (sinon on voit
        // un canvas noir pendant qu'il re-rend).
        if (typeof opts.onBeforeRestore === 'function') {
          try { opts.onBeforeRestore(); } catch(e) {}
        }
        // Ordre crucial : restore la visibility des vrais panels D'ABORD,
        // puis retire les stages. Sinon il y a un micro-frame où les
        // stages sont retirés mais les panels pas encore visibles →
        // zone vide momentanée → flash noir/sombre du modal-bg derrière.
        realPanels.forEach(p => { p.style.visibility = ''; });
        stageC.remove();
        stageA.remove();
        host.classList.remove('lm-tx-host');
        if (_addedRel) host.style.position = '';
        resolve(tr);
      }, tr.duration + 50);
    });
  }
  window.lmPlayTransition = lmPlayTransition;

  // ── Stylesheet des keyframes (clone du prototype React) ─────────────────
  const STYLE_ID = 'lm-transition-keyframes';
  if (!document.getElementById(STYLE_ID)){
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    /* Host container : position gérée en JS (cf. _addedRelative).
       overflow pendant la transition pour clipper les effets aux bords. */
    .lm-tx-host > .lm-tx-stage { overflow: hidden; }

    .t-stage { position:absolute; inset:0; border-radius: inherit; overflow:hidden; z-index: 50; pointer-events: none; }
    /* Snapshots & effets : inset:0 du stage (qui est ancré sur la bbox
       exacte du toPanel par lmPlayTransition). Reproduit fidèlement le
       proto Claude Design où stage = zone preview compacte. */
    .t-stage .t-layer { position:absolute; inset:0; overflow:hidden; }

    /* ===== 1. Rêverie ===== */
    .rv-out { animation: rvOut 1300ms cubic-bezier(.65,0,.35,1) forwards; }
    .rv-in  { animation: rvIn  1300ms cubic-bezier(.65,0,.35,1) forwards; }
    .rv-bloom { position:absolute; inset:-10%; pointer-events:none;
      background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.55), transparent 60%);
      opacity:0; animation: rvBloom 1300ms ease-in-out forwards;
    }
    @keyframes rvOut {
      0%   { opacity:1; filter: blur(0px) brightness(1); transform: scale(1); }
      100% { opacity:0; filter: blur(18px) brightness(1.15); transform: scale(.94); }
    }
    @keyframes rvIn {
      0%   { opacity:0; filter: blur(22px) brightness(1.15); transform: scale(1.06); }
      100% { opacity:1; filter: blur(0px) brightness(1); transform: scale(1); }
    }
    @keyframes rvBloom { 0%,100%{opacity:0} 50%{opacity:1} }
    /* Mode "bloc unifié" Rêverie — toBlock reste OPAQUE tout du long
       en dessous (défloute progressivement), fromBlock fade out par
       au-dessus. Évite le crossfade transparent qui laisserait voir le
       modal-bg sombre entre les deux blocks. */
    .rv-fb-out { animation: rvFbOut 1300ms cubic-bezier(.65,0,.35,1) forwards; }
    .rv-fb-in  { animation: rvFbIn  1300ms cubic-bezier(.65,0,.35,1) forwards; }
    @keyframes rvFbOut {
      0%   { opacity:1; filter: blur(0) brightness(1); transform: scale(1); }
      100% { opacity:0; filter: blur(18px) brightness(1.15); transform: scale(.94); }
    }
    @keyframes rvFbIn {
      0%   { opacity:1; filter: blur(22px) brightness(1.15); transform: scale(1.06); }
      100% { opacity:1; filter: blur(0) brightness(1); transform: scale(1); }
    }

    /* ===== 2. Aurore — swipe horizontal synchronisé avec le ruban ===== */
    .au-out { animation: auOut 1400ms cubic-bezier(.65,.02,.35,1) forwards; }
    .au-in  { animation: auIn  1400ms cubic-bezier(.65,.02,.35,1) forwards; }
    .au-ribbon {
      position:absolute; top:-50%; bottom:-50%; left:-60%; width:80%;
      transform: rotate(18deg) translateX(-50%);
      filter: blur(2px);
      animation: auRibbon 1400ms cubic-bezier(.5,0,.5,1) forwards;
      pointer-events:none;
    }
    .au-ribbon-inner {
      position:absolute; inset:0;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(255,200,224,.0) 5%,
        rgba(196,181,255,.6) 30%,
        rgba(255,255,255,.95) 50%,
        rgba(156,220,255,.6) 70%,
        transparent 100%);
      box-shadow: 0 0 80px 30px rgba(196,181,255,.6);
    }
    @keyframes auRibbon {
      0%   { transform: rotate(18deg) translateX(-100%); }
      100% { transform: rotate(18deg) translateX(280%); }
    }
    /* Le panel sortant glisse hors-écran à gauche, l'entrant arrive depuis
       la droite. Les deux gardent opacité 1 (vrai swipe, pas crossfade). */
    @keyframes auOut {
      0%   { opacity:1; transform: translateX(0); }
      100% { opacity:1; transform: translateX(-110%); }
    }
    @keyframes auIn {
      0%   { opacity:1; transform: translateX(110%); }
      100% { opacity:1; transform: translateX(0); }
    }
    /* Mode "bloc unifié" — swipe tout le modal-body (panel + preview)
       comme un seul bloc. Utilisé quand opts.fullBodySnaps est fourni. */
    .au-fb-out { animation: auFbOut 1400ms cubic-bezier(.65,.02,.35,1) forwards; }
    .au-fb-in  { animation: auFbIn  1400ms cubic-bezier(.65,.02,.35,1) forwards; }
    @keyframes auFbOut {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
    @keyframes auFbIn {
      0%   { transform: translateX(100%); }
      100% { transform: translateX(0); }
    }
    .au-sparkle {
      position:absolute; border-radius:50%; background:#fff;
      box-shadow:0 0 12px 3px rgba(255,255,255,.9), 0 0 24px 6px rgba(196,181,255,.6);
      opacity:0;
      animation: auSparkle 700ms ease-out forwards;
      pointer-events:none;
    }
    @keyframes auSparkle {
      0%   { opacity:0; transform: scale(.3); }
      40%  { opacity:1; transform: scale(1.2); }
      100% { opacity:0; transform: scale(.6); }
    }

    /* ===== 3. Voile ===== */
    .vo-out { animation: voOut 1500ms ease-in-out forwards; }
    .vo-in  { animation: voIn  1500ms ease-in-out forwards; }
    /* width:80% du stage A (modal-body) → chaque rideau couvre 80% de la
       largeur. Avec translateX(0) au milieu, chevauchement de 60% au
       centre, garantissant un masquage complet de la zone. */
    .vo-curtain { position:absolute; top:0; bottom:0; width:80%; filter:blur(1px) drop-shadow(0 8px 30px rgba(139,109,240,.18)); pointer-events:none; }
    .vo-left { left:0; transform: translateX(-100%); animation: voLeft 1500ms cubic-bezier(.5,.0,.3,1) forwards; }
    .vo-right { right:0; transform: translateX(100%); animation: voRight 1500ms cubic-bezier(.5,.0,.3,1) forwards; }
    /* Rideaux : arrivent vite (0-35%), couvrent 35-65%, repartent 65-85%.
       Les nuages doivent ARRIVER AVANT que vo-in ne devienne visible,
       sinon on voit le nouveau menu sans nuages → impression de switch. */
    @keyframes voLeft {
      0%   {transform:translateX(-100%)}
      35%  {transform:translateX(0)}
      65%  {transform:translateX(0)}
      85%  {transform:translateX(-100%)}
      100% {transform:translateX(-100%)}
    }
    @keyframes voRight {
      0%   {transform:translateX(100%)}
      35%  {transform:translateX(0)}
      65%  {transform:translateX(0)}
      85%  {transform:translateX(100%)}
      100% {transform:translateX(100%)}
    }
    /* vo-out : flou MONTE PROGRESSIVEMENT dès le début, en sync avec
       l'arrivée des nuages — évite la désync où on voit un panel net
       avec un nuage qui rampe par-dessus. À 35% (nuages au centre)
       le panel est déjà bien flou. Fade-out à partir de 45%.
       vo-in : reste invisible jusqu'à 60%, puis apparaît flou et se
       défloute progressivement jusqu'à 100%. */
    @keyframes voOut {
      0%   { opacity:1; filter: blur(0); }
      20%  { opacity:1; filter: blur(6px); }
      35%  { opacity:1; filter: blur(14px); }
      45%  { opacity:.85; filter: blur(20px); }
      55%,100% { opacity:0; filter: blur(22px); }
    }
    @keyframes voIn {
      0%,60% { opacity:0; filter: blur(22px); }
      70%  { opacity:1; filter: blur(20px); }
      85%  { opacity:1; filter: blur(10px); }
      100% { opacity:1; filter: blur(0); }
    }

    /* ===== 4. Bulles ===== */
    .bu-out { animation: buOut 1600ms ease-in-out forwards; }
    .bu-in  { animation: buIn  1600ms ease-in-out forwards; }
    .bu-bubble {
      position:absolute; bottom:-200px;
      border-radius:50%;
      pointer-events:none;
      opacity:0;
      animation: buFloat 1600ms cubic-bezier(.4,.05,.4,1) forwards;
    }
    /* Bulles opaques (couleurs pastel franches) avec un reflet blanc bien
       marqué en haut-gauche. Plus de zone transparente → masquent vraiment
       le contenu derrière au pic. */
    .bu-rose { background: radial-gradient(circle at 32% 28%, #ffffff 0%, #ffe1ee 18%, #ffb5d4 55%, #ff8cb8 100%); box-shadow: inset 0 0 35px rgba(255,255,255,.85), 0 8px 35px rgba(255,140,184,.5); }
    .bu-lav  { background: radial-gradient(circle at 32% 28%, #ffffff 0%, #f0e6ff 18%, #b8a4ff 55%, #9277ff 100%); box-shadow: inset 0 0 35px rgba(255,255,255,.85), 0 8px 35px rgba(146,119,255,.5); }
    .bu-sky  { background: radial-gradient(circle at 32% 28%, #ffffff 0%, #e2f0ff 18%, #b8d8ff 55%, #82b8ff 100%); box-shadow: inset 0 0 35px rgba(255,255,255,.85), 0 8px 35px rgba(130,184,255,.5); }
    @keyframes buFloat {
      0%   { transform: translate(0,0) scale(.4); opacity:0; }
      15%  { opacity:1; }
      85%  { opacity:1; }
      100% { transform: translate(var(--drift), -160vh) scale(1.1); opacity:0; }
    }
    @keyframes buOut { 0%,30%{opacity:1} 50%,60%{opacity:0} 100%{opacity:0} }
    @keyframes buIn  { 0%,55%{opacity:0} 75%,100%{opacity:1} }
    /* Mode "bloc unifié" — swipe VERTICAL HAUT de tout le modal-body,
       synchronisé avec la cascade de bulles qui monte. */
    .bu-fb-out { animation: buFbOut 1600ms cubic-bezier(.55,.05,.3,1) forwards; }
    .bu-fb-in  { animation: buFbIn  1600ms cubic-bezier(.55,.05,.3,1) forwards; }
    @keyframes buFbOut {
      0%   { transform: translateY(0); }
      100% { transform: translateY(-100%); }
    }
    @keyframes buFbIn {
      0%   { transform: translateY(100%); }
      100% { transform: translateY(0); }
    }

    /* ===== 5. Liquide ===== */
    .lq-out { animation: lqOut 1500ms ease-in-out forwards; }
    .lq-in  { animation: lqIn  1500ms ease-in-out forwards; }
    .lq-wave-wrap { position:absolute; left:-5%; right:-5%; top:0; bottom:0; pointer-events:none; }
    .lq-wave { position:absolute; left:0; right:0; bottom:0; width:110%; height:130%; filter: drop-shadow(0 -8px 25px rgba(139,109,240,.25)); animation: lqRise 1500ms cubic-bezier(.45,0,.35,1) forwards; }
    .lq-wave-2 { animation: lqRise2 1500ms cubic-bezier(.45,0,.35,1) forwards; }
    @keyframes lqRise {
      0%{transform:translateY(100%)} 45%{transform:translateY(-15%)}
      55%{transform:translateY(-15%)} 100%{transform:translateY(-115%)}
    }
    @keyframes lqRise2 {
      0%{transform:translateY(115%)} 45%{transform:translateY(-5%)}
      55%{transform:translateY(-5%)} 100%{transform:translateY(-105%)}
    }
    @keyframes lqOut {
      0%   { opacity:1; }
      25%  { opacity:.9; }
      45%  { opacity:.4; }
      60%,100% { opacity:0; }
    }
    @keyframes lqIn  {
      0%,45% { opacity:0; }
      60%  { opacity:.5; }
      80%  { opacity:1; }
      100% { opacity:1; }
    }

    /* ===== 6. Iris ===== */
    .ir-out { animation: irOut 1200ms ease-in-out forwards; }
    .ir-in-wrap { animation: irInWrap 1200ms ease-out forwards; }
    .ir-in { position:absolute; inset:0; clip-path: circle(0% at 50% 50%); animation: irClip 1200ms cubic-bezier(.5,0,.3,1) forwards; }
    .ir-ring { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:0; height:0; border-radius:50%;
      border: 4px solid rgba(255,255,255,.9);
      box-shadow: 0 0 30px 6px rgba(196,181,255,.6), inset 0 0 20px rgba(255,255,255,.5);
      animation: irRing 1200ms cubic-bezier(.5,0,.3,1) forwards;
      pointer-events:none;
    }
    .ir-star { position:absolute; transform: translate(-50%,-50%); opacity:0; filter: drop-shadow(0 0 8px rgba(255,255,255,.9));
      animation: irStar 800ms ease-out forwards;
    }
    @keyframes irClip { 0%{clip-path:circle(0% at 50% 50%)} 100%{clip-path:circle(150% at 50% 50%)} }
    @keyframes irRing {
      0%   { width:0; height:0; opacity:1; }
      60%  { width:140%; height:140%; opacity:.5; }
      100% { width:180%; height:180%; opacity:0; }
    }
    @keyframes irOut {
      0%{opacity:1; transform:scale(1)}
      60%{opacity:.6; transform:scale(.96)}
      100%{opacity:0; transform:scale(.94)}
    }
    @keyframes irInWrap { 0%{opacity:1} 100%{opacity:1} }
    @keyframes irStar {
      0%{opacity:0; transform:translate(-50%,-50%) scale(.2) rotate(0deg)}
      50%{opacity:1; transform:translate(-50%,-50%) scale(1.2) rotate(60deg)}
      100%{opacity:0; transform:translate(-50%,-50%) scale(.4) rotate(120deg)}
    }
    /* Mode "bloc unifié" Iris — fade-blur sur tout le modal-body, avec
       léger boost de brightness pour l'effet "lumineux/onirique". */
    .ir-fb-out { animation: irFbOut 1200ms cubic-bezier(.5,0,.3,1) forwards; }
    .ir-fb-in  { animation: irFbIn  1200ms cubic-bezier(.5,0,.3,1) forwards; }
    @keyframes irFbOut {
      0%   { opacity:1; filter: blur(0) brightness(1); transform: scale(1); }
      100% { opacity:0; filter: blur(16px) brightness(1.2); transform: scale(.95); }
    }
    @keyframes irFbIn {
      0%   { opacity:1; filter: blur(18px) brightness(1.15); transform: scale(1.05); }
      100% { opacity:1; filter: blur(0) brightness(1); transform: scale(1); }
    }

    /* ===== 7. Poussière ===== */
    .po-out { animation: poOut 1300ms ease-in-out forwards; }
    .po-in  { animation: poIn  1300ms ease-in-out forwards; }
    .po-particle {
      position:absolute; left:-10%;
      border-radius:50%;
      pointer-events:none;
      opacity:0;
      animation-name: poFly;
      animation-timing-function: cubic-bezier(.45,.05,.55,1);
      animation-fill-mode: forwards;
    }
    @keyframes poFly {
      0%{transform:translateX(0) translateY(0); opacity:0}
      15%{opacity:1} 85%{opacity:1}
      100%{transform:translateX(130vw) translateY(-40px); opacity:0}
    }
    @keyframes poOut {
      0%   { opacity:1; filter:blur(0); }
      20%  { opacity:.95; filter:blur(2px); }
      40%  { opacity:.7; filter:blur(5px); }
      55%  { opacity:.3; filter:blur(7px); }
      65%,100% { opacity:0; filter:blur(8px); }
    }
    @keyframes poIn {
      0%,50% { opacity:0; filter:blur(8px); }
      65%  { opacity:.3; filter:blur(6px); }
      80%  { opacity:.7; filter:blur(3px); }
      100% { opacity:1; filter:blur(0); }
    }

    /* ===== 8. Pli ===== */
    .pli-perspective {
      position:absolute; inset:0;
      perspective: 1600px;
      perspective-origin: 50% 50%;
    }
    .pli-card { position:absolute; inset:0; transform-style: preserve-3d; backface-visibility:hidden; border-radius:inherit; overflow:hidden; }
    .pli-out { transform-origin: left center; animation: pliOut 1300ms cubic-bezier(.65,0,.35,1) forwards; }
    .pli-in  { transform-origin: right center; transform: rotateY(90deg); animation: pliIn 1300ms cubic-bezier(.65,0,.35,1) forwards; }
    .pli-shade { position:absolute; inset:0; pointer-events:none;
      background: linear-gradient(90deg, transparent 0%, rgba(60,40,100,0) 50%, rgba(60,40,100,.45) 100%);
      opacity:0; animation: pliShade 1300ms ease-in-out forwards;
    }
    .pli-shade-in { background: linear-gradient(90deg, rgba(60,40,100,.45) 0%, rgba(60,40,100,0) 50%, transparent 100%);
      animation: pliShadeIn 1300ms ease-in-out forwards;
    }
    @keyframes pliOut { 0%{transform:rotateY(0)} 50%{transform:rotateY(-90deg)} 100%{transform:rotateY(-90deg)} }
    @keyframes pliIn  { 0%{transform:rotateY(90deg)} 50%{transform:rotateY(90deg)} 100%{transform:rotateY(0)} }
    @keyframes pliShade   { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
    @keyframes pliShadeIn { 0%{opacity:1} 50%{opacity:1} 100%{opacity:0} }

    /* ===== 9. Onde ===== */
    .on-out { animation: onOut 1200ms ease-in-out forwards; }
    .on-in  { animation: onIn  1200ms ease-in-out forwards; }
    .on-ripple {
      position:absolute; width:0; height:0; border-radius:50%;
      transform: translate(-50%,-50%);
      border: 2px solid rgba(196,181,255,.75);
      box-shadow: 0 0 25px rgba(196,181,255,.6), inset 0 0 25px rgba(255,200,224,.5);
      animation: onRipple 1200ms cubic-bezier(.2,.6,.3,1) forwards;
      pointer-events:none;
    }
    .on-flash {
      position:absolute; width:30px; height:30px; border-radius:50%;
      transform: translate(-50%,-50%);
      background: radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 70%);
      animation: onFlash 600ms ease-out forwards;
      pointer-events:none;
    }
    @keyframes onRipple {
      0%   { width:0; height:0; opacity:1; border-width:3px; }
      100% { width:220%; height:220%; opacity:0; border-width:1px; }
    }
    @keyframes onFlash {
      0%{width:0; height:0; opacity:1}
      100%{width:600px; height:600px; opacity:0}
    }
    @keyframes onOut {
      0%{opacity:1; transform:scale(1); filter:blur(0)}
      50%{opacity:.4; transform:scale(.98); filter:blur(4px)}
      100%{opacity:0; transform:scale(.96); filter:blur(8px)}
    }
    @keyframes onIn {
      0%,30%{opacity:0; transform:scale(1.04); filter:blur(8px)}
      100%{opacity:1; transform:scale(1); filter:blur(0)}
    }
    `;
    document.head.appendChild(s);
  }

})();
