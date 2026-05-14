// ============================================================
// STARTGG-DELUXE.JS — Outil de gestion live de tournoi
//
// Phase 1 v2 : éditeur de plan complet avec types d'éléments
// (walls, rooms, tables, stations…). Les stations sont les zones
// qui recevront les matchs en drag-and-drop (Phase 4).
//
// Modèle : chaque élément a un type qui détermine son rendu.
//   { id, type, label, x, y, w, h, color? }
//
// Types supportés :
//   - 'wall'    — mur (polyline, vertices draggables)
//   - 'room'    — zone label (background coloré translucide)
//   - 'door'    — porte (simple/double, découpe les murs)
//   - 'station' — slot de match (drop target Phase 4)
//
// Storage : top8_deluxe_plan = { elements: [...] }
// ============================================================

const DLX_LS_KEY = 'top8_deluxe_plan';
// Version du modèle de plan. Bumper quand le default change radicalement
// pour forcer le rechargement automatique chez les users existants.
const DLX_PLAN_VERSION = 7;
// Dimensions du canvas — utilisées pour les clamps de positionnement
// (empêchent les éléments / vertices de sortir du cadre visible).
const DLX_CANVAS_W = 600;
const DLX_CANVAS_H = 1500;
let dlxPlan = { version: DLX_PLAN_VERSION, elements: [] };
let dlxMode = 'edit'; // 'edit' | 'run'
let dlxInitDone = false;
let dlxAddType = 'station'; // type sélectionné pour le bouton "+ Ajouter"
let dlxSelectedId = null;   // élément actuellement sélectionné pour édition fine

// Historique pour Ctrl+Z. On stocke des snapshots JSON du plan AVANT chaque
// modification (move/resize/add/remove/rotate/prop change), puis on pop
// quand l'user fait Ctrl+Z. Cap à 50 entrées pour éviter d'exploser la mémoire.
const dlxHistory = [];
const dlxMaxHistory = 50;

// ── DÉFINITION DES TYPES D'ÉLÉMENTS ─────────────────────────────────────────
// Chaque type a : icône, label menu, taille par défaut, couleur, z-index.
// `rotatable: true` permet la rotation 90° via bouton du panneau props
// Set minimaliste : juste mur / zone / projecteur / station. Les autres
// types (tables, sorties, micro, etc.) ont été retirés à la demande user.
const DLX_TYPES = {
  'wall':      { icon: '🧱',  label: 'Mur',              defaultW: 200, defaultH: 12,  color: '#2a2a2a', z: 3 },
  'room':      { icon: '🏠',  label: 'Zone (label)',     defaultW: 200, defaultH: 120, color: '#f5e6d8', z: 1 },
  'door':      { icon: '🚪',  label: 'Porte',            defaultW: 60,  defaultH: 60,  color: '#2a2a2a', z: 4, rotatable: true },
  'station':   { icon: '🎮',  label: 'Setup (station)',  defaultW: 160, defaultH: 70,  color: '#46d18f', z: 7, rotatable: true },
};

// Génère le SVG du symbole architectural d'une porte (battant + arc de
// débattement) dans une box w×h. doorType : 'simple' ou 'double'.
// La porte est dessinée avec son ouverture sur le bord BAS de la box ;
// utiliser la rotation pour l'orienter sur n'importe quel mur.
function dlxDoorSvg(w, h, doorType, color) {
  const c = color || '#2a2a2a';
  const sw = 2.5;
  if (doorType === 'double') {
    const r = w / 2; // chaque battant fait la moitié de la largeur
    // Battant gauche : charnière en (0,h), ouvre vers le haut
    const leftLeaf = `<line x1="0" y1="${h}" x2="0" y2="${h-r}" stroke="${c}" stroke-width="${sw}" />`;
    const leftArc  = `<path d="M 0 ${h-r} A ${r} ${r} 0 0 1 ${r} ${h}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    // Battant droit : charnière en (w,h), ouvre vers le haut (miroir)
    const rightLeaf = `<line x1="${w}" y1="${h}" x2="${w}" y2="${h-r}" stroke="${c}" stroke-width="${sw}" />`;
    const rightArc  = `<path d="M ${w} ${h-r} A ${r} ${r} 0 0 0 ${w-r} ${h}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    return `<svg class="dlx-door-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
      ${leftLeaf}${leftArc}${rightLeaf}${rightArc}</svg>`;
  }
  // Porte simple : charnière en bas-gauche (0,h), battant vertical, arc
  // jusqu'au bord droit du débattement.
  const r = Math.min(w, h);
  const leaf = `<line x1="0" y1="${h}" x2="0" y2="${h-r}" stroke="${c}" stroke-width="${sw}" />`;
  const arc  = `<path d="M 0 ${h-r} A ${r} ${r} 0 0 1 ${r} ${h}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
  return `<svg class="dlx-door-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
    ${leaf}${arc}</svg>`;
}

// Plan par défaut basé sur le venue de l'asso (Projet Reverie).
// Layout approximatif, asymétrique : alcôve TO FG sur la gauche au milieu,
// stations FG asymétriques en haut, stream au centre, Smash double colonne
// en bas, accueil + TO Smash tout en bas. Chaises et écrans omis.
function dlxDefaultPlan() {
  const e = [];
  const add = (id, type, label, x, y, w, h, color) => e.push({
    id, type, label, x, y, w, h,
    color: color || DLX_TYPES[type]?.color,
  });

  // ═══ ZONES (rooms) ════════════════════════════════════════════════════
  add('room-fg',      'room', 'Coin Fighting Games',         20,  20,  560, 480, '#f7eddf');
  add('room-to-fg',   'room', 'Table TO (FG)',               20, 510,  180, 110, '#ede0d0');
  add('room-stream',  'room', 'Zone de Stream',              20, 630,  560, 250, '#e8dfee');
  add('room-smash',   'room', 'Coin Smash',                  20, 890,  560, 410, '#f7eddf');
  add('room-to-smash','room', 'Tables TO (Smash) / Accueil', 20,1310,  560, 170, '#ede0d0');

  // ═══ MURS (polylines : tableau de points, plus 2 points = mur droit) ══
  // Drag un endpoint pour étirer · Right-click sur le mur pour ajouter un
  // vertex que tu peux ensuite pousser pour créer un angle.
  const addWall = (id, points, thickness, color) => e.push({
    id, type: 'wall', points, thickness: thickness || 4, color: color || '#2a2a2a',
  });
  // Bordures externes (rectangle complet en une seule polyline fermée)
  addWall('w-outline', [
    { x:  20, y:  20 },
    { x: 580, y:  20 },
    { x: 580, y:1480 },
    { x:  20, y:1480 },
    { x:  20, y:  20 },
  ], 4);
  // Cloisons internes
  addWall('w-fg-bot',     [{x:20, y:500}, {x:580, y:500}], 4);
  addWall('w-tofg',       [{x:20, y:620}, {x:200, y:620}, {x:200, y:500}], 4); // L-shape de l'alcôve TO FG
  addWall('w-stream-bot', [{x:20, y:880}, {x:580, y:880}], 4);
  addWall('w-smash-bot',  [{x:20, y:1300}, {x:580, y:1300}], 4);

  // ═══ STATIONS FG (Coin Fighting Games) ════════════════════════════════
  // Setups collés au mur gauche (x=22, juste après le mur de 4px) et au
  // mur droit (x=378 = 600 - 200 - 22). Stackés sans gap pour ressembler
  // à des tables placées bout-à-bout le long du mur.
  // 4 setups par côté, hauteur uniforme. Labels = juste le numéro.
  const FG_STATION_H = 110;
  const FG_TOP = 40;
  for (let i = 0; i < 4; i++) {
    add(`fg-L${i+1}`, 'station', `${i+1}`,  22, FG_TOP + i*FG_STATION_H, 200, FG_STATION_H, '#e85a8a');
    add(`fg-R${i+1}`, 'station', `${i+5}`, 378, FG_TOP + i*FG_STATION_H, 200, FG_STATION_H, '#e85a8a');
  }

  // ═══ ZONE STREAM ══════════════════════════════════════════════════════
  add('stream-1', 'station', 'Stream', 180, 680, 320, 120, '#7c5cff');

  // ═══ COIN SMASH ═══════════════════════════════════════════════════════
  // 5 stations de chaque côté, collées au mur, stackées sans gap.
  // Labels = juste le numéro.
  const SMASH_STATION_H = 82;
  const SMASH_TOP = 900;
  for (let i = 0; i < 5; i++) {
    add(`smash-L${i+1}`, 'station', `${i+1}`,  22, SMASH_TOP + i*SMASH_STATION_H, 200, SMASH_STATION_H, '#46d18f');
    add(`smash-R${i+1}`, 'station', `${i+6}`, 378, SMASH_TOP + i*SMASH_STATION_H, 200, SMASH_STATION_H, '#46d18f');
  }

  return { version: DLX_PLAN_VERSION, elements: e };
}

// ── INIT ────────────────────────────────────────────────────────────────────
function dlxInit() {
  if (dlxInitDone) return;
  dlxInitDone = true;
  dlxLoadPlan();
  dlxBuildAddTypeSelector();
  dlxRender();
  dlxInstallKeyboardShortcuts();
  // Click sur le fond du canvas (pas sur un élément) = désélection.
  // ev.target === canvas signifie qu'on a cliqué sur le fond beige et pas
  // sur un élément enfant (les clics sur éléments ont leur target = l'élément).
  const canvas = document.getElementById('dlxCanvas');
  if (canvas && !canvas._dlxDeselectBound) {
    canvas._dlxDeselectBound = true;
    canvas.addEventListener('mousedown', (ev) => {
      if (dlxMode !== 'edit') return;
      if (ev.target === canvas) dlxDeselect();
    });
  }
  // Désélection globale : tout clic HORS du canvas et HORS du panneau de
  // propriétés désélectionne. Couvre le cas où les rooms couvrent tout le
  // canvas (pas de fond vide cliquable) — un clic sur la toolbar, le mode
  // toggle, ou ailleurs dans la page ferme la sélection.
  if (!dlxInstallKeyboardShortcuts._deselectBound) {
    dlxInstallKeyboardShortcuts._deselectBound = true;
    document.addEventListener('mousedown', (ev) => {
      if (dlxMode !== 'edit' || !dlxSelectedId) return;
      const cv = document.getElementById('dlxCanvas');
      const panel = document.getElementById('dlxPropsPanel');
      // IMPORTANT : on teste par COORDONNÉES, pas par cv.contains(ev.target).
      // Raison : dlxSelect() fait un dlxRender() qui détache ev.target du
      // DOM, donc .contains() renverrait false à tort et désélectionnerait
      // juste après la sélection. Les coordonnées, elles, restent valides.
      if (cv) {
        const r = cv.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top  && ev.clientY <= r.bottom) return;
      }
      // Le panneau de propriétés ne re-render pas → .contains OK ici
      if (panel && panel.contains(ev.target)) return;
      // Clic ailleurs → désélection
      dlxDeselect();
    });
  }
}

// Installe les raccourcis clavier : Ctrl+Z = undo. Listener global mais
// gardé inactif quand l'utilisateur tape dans un input texte (laisse le
// undo natif du navigateur s'occuper du texte).
function dlxInstallKeyboardShortcuts() {
  if (dlxInstallKeyboardShortcuts._done) return;
  dlxInstallKeyboardShortcuts._done = true;
  document.addEventListener('keydown', (ev) => {
    // Vérifie qu'on est bien sur la page Deluxe (sinon le shortcut n'a
    // pas de sens pour les autres onglets).
    const deluxePage = document.getElementById('pageDeluxe');
    if (!deluxePage || deluxePage.style.display === 'none') return;
    // Ignore si on tape dans un input/textarea — laisse le comportement
    // natif faire (undo de texte, suppression de caractère, etc.)
    const tag = (ev.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) return;
    // Ctrl+Z (ou Cmd+Z sur Mac) = undo
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      dlxUndo();
      return;
    }
    // Suppr / Delete / Backspace = supprime l'élément sélectionné (mur inclus).
    // Pas de confirm() : action volontaire + Ctrl+Z pour annuler.
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && dlxSelectedId) {
      ev.preventDefault();
      dlxDeleteSelected();
    }
  });
}

// Supprime l'élément actuellement sélectionné (sans confirm — l'undo
// Ctrl+Z permet de revenir en arrière).
function dlxDeleteSelected() {
  if (!dlxSelectedId) return;
  dlxPushHistory();
  dlxPlan.elements = dlxPlan.elements.filter(s => s.id !== dlxSelectedId);
  dlxSelectedId = null;
  const panel = document.getElementById('dlxPropsPanel');
  if (panel) panel.style.display = 'none';
  dlxSavePlan();
  dlxRender();
}

// Construit le <select> des types pour le bouton "+ Ajouter"
function dlxBuildAddTypeSelector() {
  const sel = document.getElementById('dlxAddTypeSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(DLX_TYPES)
    .map(([key, def]) => `<option value="${key}">${def.icon} ${def.label}</option>`)
    .join('');
  sel.value = dlxAddType;
  sel.onchange = () => { dlxAddType = sel.value; };
}

// ── PERSISTANCE ─────────────────────────────────────────────────────────────
function dlxLoadPlan() {
  try {
    const raw = localStorage.getItem(DLX_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.elements) && parsed.elements.length
          && parsed.version === DLX_PLAN_VERSION) {
        dlxMigrateWalls(parsed); // sécurité : convertit walls si format mixte
        dlxPlan = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('[DLX] Load plan échec :', e.message);
  }
  dlxPlan = dlxDefaultPlan();
}

function dlxSavePlan() {
  try { localStorage.setItem(DLX_LS_KEY, JSON.stringify(dlxPlan)); } catch {}
}

// Push une copie profonde du plan actuel dans l'historique d'undo.
// À appeler AVANT toute modification (drag start, add, remove, rotate, prop).
function dlxPushHistory() {
  try {
    dlxHistory.push(JSON.stringify(dlxPlan));
    if (dlxHistory.length > dlxMaxHistory) dlxHistory.shift();
  } catch (e) {
    console.warn('[DLX] Push history échec :', e.message);
  }
}

// Restaure le dernier snapshot poppé de l'historique. Appelé sur Ctrl+Z.
function dlxUndo() {
  if (!dlxHistory.length) return;
  try {
    const prev = dlxHistory.pop();
    dlxPlan = JSON.parse(prev);
    dlxSavePlan();
    dlxDeselect();
    dlxRender();
  } catch (e) {
    console.warn('[DLX] Undo échec :', e.message);
  }
}

function dlxResetDefaultPlan() {
  if (!confirm('Restaurer le plan par défaut ? Tu vas perdre tes modifications actuelles.')) return;
  dlxPushHistory();
  dlxPlan = dlxDefaultPlan();
  dlxSavePlan();
  dlxRender();
}

// ── MODE EDIT / RUN ─────────────────────────────────────────────────────────
function dlxSetMode(mode) {
  if (mode !== 'edit' && mode !== 'run') return;
  dlxMode = mode;
  const editBtn = document.getElementById('dlxModeEdit');
  const runBtn  = document.getElementById('dlxModeRun');
  if (editBtn) editBtn.classList.toggle('active', mode === 'edit');
  if (runBtn)  runBtn.classList.toggle('active', mode === 'run');
  const actions = document.getElementById('dlxEditorActions');
  if (actions) actions.style.display = mode === 'edit' ? '' : 'none';
  const canvas = document.getElementById('dlxCanvas');
  if (canvas) canvas.classList.toggle('dlx-canvas-edit', mode === 'edit');
  dlxRender();
}

// ── RENDU DU PLAN ───────────────────────────────────────────────────────────
function dlxRender() {
  const canvas = document.getElementById('dlxCanvas');
  if (!canvas) return;
  // Séparer murs (SVG) du reste (DOM positionné). Walls sont rendus dans
  // un <svg> overlay pour pouvoir avoir des polylines avec angles.
  const walls    = dlxPlan.elements.filter(e => e.type === 'wall');
  const nonWalls = dlxPlan.elements.filter(e => e.type !== 'wall');
  // Trier les non-walls par z-index pour ordre DOM correct
  nonWalls.sort((a, b) => (DLX_TYPES[a.type]?.z || 0) - (DLX_TYPES[b.type]?.z || 0));

  const wallsSvg = `<svg class="dlx-walls-svg" viewBox="0 0 600 1500" preserveAspectRatio="none">
    ${walls.map(dlxWallSvg).join('')}
  </svg>`;
  canvas.innerHTML = wallsSvg + nonWalls.map(dlxElementHTML).join('');
  if (dlxMode === 'edit') dlxAttachDragHandlers();
}

// ── DÉCOUPE DES MURS PAR LES PORTES ────────────────────────────────────────
// Clipping Liang-Barsky : trouve [tEnter, tExit] du segment a→b à l'intérieur
// du rectangle (rx,ry,rw,rh). Renvoie null si pas d'intersection.
function dlxClipSegmentToRect(a, b, rx, ry, rw, rh) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rx, rx + rw - a.x, a.y - ry, ry + rh - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallèle au bord et hors du rect
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else          { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return (t0 < t1) ? [t0, t1] : null;
}

// Découpe une polyline de mur en plusieurs sous-polylines, en retirant
// les portions couvertes par une porte (élément type 'door' dont la box
// chevauche le mur). Retourne un tableau de tableaux de points.
function dlxCutWallByDoors(wall) {
  if (!wall.points || wall.points.length < 2) return [wall.points || []];
  const doors = dlxPlan.elements.filter(e => e.type === 'door');
  if (!doors.length) return [wall.points];

  const pieces = [];
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i], b = wall.points[i + 1];
    // Collecte les portions [t0,t1] du segment couvertes par une porte
    const covered = [];
    for (const d of doors) {
      const clip = dlxClipSegmentToRect(a, b, d.x, d.y, d.w, d.h);
      if (clip) covered.push(clip);
    }
    if (!covered.length) { pieces.push([a, b]); continue; }
    // Fusionne les portions qui se chevauchent
    covered.sort((r1, r2) => r1[0] - r2[0]);
    const merged = [covered[0].slice()];
    for (let j = 1; j < covered.length; j++) {
      const last = merged[merged.length - 1];
      if (covered[j][0] <= last[1]) last[1] = Math.max(last[1], covered[j][1]);
      else merged.push(covered[j].slice());
    }
    // Les portions VISIBLES = complément des portions couvertes dans [0,1]
    const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    let cursor = 0;
    for (const [t0, t1] of merged) {
      if (t0 > cursor) pieces.push([lerp(cursor), lerp(t0)]);
      cursor = Math.max(cursor, t1);
    }
    if (cursor < 1) pieces.push([lerp(cursor), lerp(1)]);
  }
  return pieces;
}

// SVG d'un mur (polyline) + handles de vertex en mode édition.
// Si un élément NON-mur est sélectionné (room/station/projector), on
// désactive les interactions des murs (pas de vertex visible, pas de
// hit-area) pour que les clics aillent à l'élément sélectionné sans
// être interceptés par les coins de mur qui se trouvent derrière.
function dlxWallSvg(w) {
  if (!w.points || w.points.length < 2) return '';
  const ptsFull = w.points.map(p => `${p.x},${p.y}`).join(' ');
  const isEdit = dlxMode === 'edit';
  const isSelected = dlxSelectedId === w.id;
  const selectedEl = dlxSelectedId ? dlxPlan.elements.find(x => x.id === dlxSelectedId) : null;
  const wallsInteractive = !selectedEl || selectedEl.type === 'wall';
  const showVertices = isEdit && wallsInteractive;
  const handles = showVertices ? w.points.map((p, i) =>
    `<circle class="dlx-wall-vertex" data-wall="${w.id}" data-vertex="${i}"
             cx="${p.x}" cy="${p.y}" r="7" />`
  ).join('') : '';
  // Le mur VISIBLE est découpé par les portes (trous). On dessine donc N
  // sous-polylines (les morceaux non couverts). La hit-area et les handles,
  // eux, utilisent la polyline COMPLÈTE (on garde le mur cliquable/éditable
  // même là où une porte le traverse).
  const pieces = dlxCutWallByDoors(w);
  const visibleSegs = pieces
    .filter(piece => piece && piece.length >= 2)
    .map(piece => {
      const pp = piece.map(p => `${p.x},${p.y}`).join(' ');
      return `<polyline class="dlx-wall-line" data-id="${w.id}"
              points="${pp}" stroke="${w.color || '#2a2a2a'}"
              stroke-width="${w.thickness || 4}" fill="none"
              stroke-linecap="square" stroke-linejoin="miter" />`;
    }).join('');
  return `<g class="dlx-wall-group ${isSelected ? 'selected' : ''}">
    ${visibleSegs}
    ${(isEdit && wallsInteractive) ? `<polyline class="dlx-wall-hitarea" data-id="${w.id}"
              points="${ptsFull}" stroke="transparent" stroke-width="20"
              fill="none" />` : ''}
    ${handles}
  </g>`;
}

function dlxElementHTML(el) {
  const def = DLX_TYPES[el.type] || DLX_TYPES['station'];
  const isEdit = dlxMode === 'edit';
  const safeLabel = String(el.label || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const removeBtn = isEdit
    ? `<button class="dlx-el-remove" onclick="dlxRemoveElement('${el.id}')" title="Supprimer">✕</button>`
    : '';
  // 8 handles de resize (4 côtés + 4 coins) — visibles uniquement quand
  // l'élément est sélectionné (sinon le canvas serait sur-chargé).
  const isSelected = dlxSelectedId === el.id;
  const resizeHandle = (isEdit && isSelected)
    ? ['nw','n','ne','e','se','s','sw','w'].map(dir =>
        `<div class="dlx-el-handle dlx-el-handle-${dir}" data-resize="${el.id}" data-dir="${dir}"></div>`
      ).join('')
    : '';
  // Rotation 0/90/180/270 — appliquée via CSS transform (transform-origin center)
  const rot = el.rotation || 0;
  const rotCss = rot ? `transform:rotate(${rot}deg);` : '';

  // Rendu spécifique par type. Walls passent par dlxWallSvg (SVG overlay),
  // pas par ce switch.
  switch (el.type) {
    case 'room':
      return `<div class="dlx-el dlx-el-room" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}88;${rotCss}">
        <div class="dlx-el-room-label">${safeLabel}</div>
        ${removeBtn}${resizeHandle}</div>`;

    case 'door':
      return `<div class="dlx-el dlx-el-door" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;${rotCss}">
        ${dlxDoorSvg(el.w, el.h, el.doorType || 'simple', el.color)}
        ${removeBtn}${resizeHandle}</div>`;

    case 'station':
    default:
      return `<div class="dlx-el dlx-el-station" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}33;border-color:${el.color};${rotCss}">
        <div class="dlx-el-station-label">${safeLabel}</div>
        ${removeBtn}${resizeHandle}</div>`;
  }
}

// ── DRAG / RESIZE HANDLERS ──────────────────────────────────────────────────
let _dlxDrag = null;

function dlxAttachDragHandlers() {
  const canvas = document.getElementById('dlxCanvas');
  if (!canvas) return;
  canvas.querySelectorAll('.dlx-el').forEach(el => {
    el.addEventListener('mousedown', dlxOnElMouseDown);
    el.addEventListener('dblclick',  dlxOnElDblClick);
  });
  canvas.querySelectorAll('.dlx-el-resize').forEach(el => {
    el.addEventListener('mousedown', dlxOnResizeMouseDown);
  });
  // 8 handles directionnels (n/s/e/w/ne/nw/se/sw) sur l'élément sélectionné
  canvas.querySelectorAll('.dlx-el-handle').forEach(el => {
    el.addEventListener('mousedown', dlxOnResizeMouseDown);
  });
  // Handlers spécifiques aux murs (SVG)
  canvas.querySelectorAll('.dlx-wall-vertex').forEach(el => {
    el.addEventListener('mousedown', dlxOnWallVertexMouseDown);
    el.addEventListener('contextmenu', dlxOnWallVertexRightClick);
  });
  canvas.querySelectorAll('.dlx-wall-hitarea').forEach(el => {
    // Click sur le mur (pas un vertex) : sélectionne + permet right-click
    el.addEventListener('mousedown', dlxOnWallLineMouseDown);
    el.addEventListener('contextmenu', dlxOnWallRightClick);
  });
}

// Convertit les coords screen (event.clientX/Y) en coords SVG/canvas
function dlxScreenToCanvas(ev) {
  const canvas = document.getElementById('dlxCanvas');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  // Le canvas est en pixels réels (600×1500) sans transform, donc le
  // mapping est direct via les bounding rects.
  const scaleX = 600 / rect.width;
  const scaleY = 1500 / rect.height;
  return {
    x: (ev.clientX - rect.left) * scaleX,
    y: (ev.clientY - rect.top)  * scaleY,
  };
}

// Drag d'un vertex de mur
function dlxOnWallVertexMouseDown(ev) {
  if (dlxMode !== 'edit') return;
  if (ev.button !== 0) return; // ignore le clic droit (géré par contextmenu)
  ev.preventDefault();
  ev.stopPropagation();
  const wallId = ev.currentTarget.dataset.wall;
  const vertexIdx = parseInt(ev.currentTarget.dataset.vertex, 10);
  const w = dlxPlan.elements.find(x => x.id === wallId);
  if (!w || !w.points || !w.points[vertexIdx]) return;
  dlxPushHistory();
  dlxSelect(wallId);
  _dlxDrag = {
    id: wallId,
    mode: 'vertex',
    vertexIdx,
    startX: ev.clientX,
    startY: ev.clientY,
    origX: w.points[vertexIdx].x,
    origY: w.points[vertexIdx].y,
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
}

// Click sur la zone hit-area d'un mur (mais pas sur un vertex) →
// translate ALL vertices par le même delta. Permet de déplacer le mur
// entier pour redimensionner les pièces (le sens du drag est libre,
// l'user peut bouger un mur horizontal verticalement pour étendre la
// salle vers le bas par exemple).
function dlxOnWallLineMouseDown(ev) {
  if (dlxMode !== 'edit') return;
  if (ev.button !== 0) return; // right-click géré par contextmenu
  ev.preventDefault();
  const wallId = ev.currentTarget.dataset.id;
  const w = dlxPlan.elements.find(x => x.id === wallId);
  if (!w || !w.points) return;
  dlxPushHistory();
  dlxSelect(wallId);
  _dlxDrag = {
    id: wallId,
    mode: 'wall-translate',
    startX: ev.clientX,
    startY: ev.clientY,
    origPoints: w.points.map(p => ({ x: p.x, y: p.y })),
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
}

// Right-click sur un VERTEX : le supprime (si le mur garde ≥ 2 points).
// Symétrique du right-click sur la ligne du mur qui, lui, AJOUTE un vertex.
function dlxOnWallVertexRightClick(ev) {
  if (dlxMode !== 'edit') return;
  ev.preventDefault();
  ev.stopPropagation();
  const wallId = ev.currentTarget.dataset.wall;
  const vertexIdx = parseInt(ev.currentTarget.dataset.vertex, 10);
  const w = dlxPlan.elements.find(x => x.id === wallId);
  if (!w || !w.points) return;
  // Un mur doit garder au moins 2 points (sinon ce n'est plus un segment)
  if (w.points.length <= 2) return;
  dlxPushHistory();
  w.points.splice(vertexIdx, 1);
  dlxSavePlan();
  dlxRender();
  dlxSelect(wallId);
}

// Right-click sur un mur : insère un nouveau vertex au point cliqué
function dlxOnWallRightClick(ev) {
  if (dlxMode !== 'edit') return;
  ev.preventDefault();
  const wallId = ev.currentTarget.dataset.id;
  const w = dlxPlan.elements.find(x => x.id === wallId);
  if (!w || !w.points || w.points.length < 2) return;
  dlxPushHistory();
  const click = dlxScreenToCanvas(ev);
  // Trouve le segment le plus proche du clic et y insère le vertex
  const insertIdx = dlxFindBestInsertIndex(w.points, click);
  w.points.splice(insertIdx, 0, click);
  dlxSavePlan();
  dlxRender();
  // Re-sélectionner le mur pour garder le panneau ouvert
  dlxSelect(wallId);
}

// Trouve l'index où insérer un nouveau vertex pour qu'il s'intègre
// naturellement à la polyline (entre les 2 points du segment le plus proche).
function dlxFindBestInsertIndex(points, click) {
  let bestIdx = 1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i+1];
    const d = dlxDistanceToSegment(click, a, b);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}

// Distance d'un point à un segment [a, b]
function dlxDistanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

function dlxOnElMouseDown(ev) {
  if (ev.target.classList.contains('dlx-el-remove')) return;
  if (ev.target.classList.contains('dlx-el-resize')) return;
  if (ev.target.classList.contains('dlx-el-handle')) return;
  if (dlxMode !== 'edit') return;
  const el = ev.currentTarget;
  const id = el.dataset.id;
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;
  ev.preventDefault();
  dlxPushHistory(); // snapshot pour Ctrl+Z
  // Sélectionne l'élément (ouvre le panneau de propriétés)
  dlxSelect(id);
  _dlxDrag = {
    id, mode: 'move',
    startX: ev.clientX, startY: ev.clientY,
    origX: s.x, origY: s.y,
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
  el.classList.add('dragging');
}

function dlxOnResizeMouseDown(ev) {
  if (dlxMode !== 'edit') return;
  ev.preventDefault();
  ev.stopPropagation();
  const id = ev.currentTarget.dataset.resize;
  const dir = ev.currentTarget.dataset.dir || 'se'; // fallback bottom-right
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;
  dlxPushHistory();
  _dlxDrag = {
    id, mode: 'resize',
    dir,
    startX: ev.clientX, startY: ev.clientY,
    origX: s.x, origY: s.y, origW: s.w, origH: s.h,
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
}

function dlxOnDragMove(ev) {
  if (!_dlxDrag) return;
  const s = dlxPlan.elements.find(x => x.id === _dlxDrag.id);
  if (!s) return;
  let dx = ev.clientX - _dlxDrag.startX;
  let dy = ev.clientY - _dlxDrag.startY;
  // Shift maintenu = snap au mouvement axial (horizontal OU vertical seulement,
  // selon la direction dominante du drag). Utile pour étirer un mur sans
  // créer d'angle non voulu, ou aligner une station horizontalement.
  if (ev.shiftKey) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
  }
  if (_dlxDrag.mode === 'move') {
    let nx = _dlxDrag.origX + dx;
    let ny = _dlxDrag.origY + dy;
    // Magnétisme : snap aux bords des autres éléments / au canvas (Shift désactive)
    if (!ev.shiftKey) {
      const snap = dlxComputeSnapForMove(s, nx, ny);
      nx += snap.dx;
      ny += snap.dy;
    }
    s.x = Math.max(0, Math.min(DLX_CANVAS_W - s.w, nx));
    s.y = Math.max(0, Math.min(DLX_CANVAS_H - s.h, ny));
  } else if (_dlxDrag.mode === 'resize') {
    // Resize multi-directionnel selon _dlxDrag.dir (n/s/e/w/ne/nw/se/sw)
    const dir = _dlxDrag.dir || 'se';
    let { origX, origY, origW, origH } = _dlxDrag;
    let nx = origX, ny = origY, nw = origW, nh = origH;
    if (dir.includes('e')) nw = origW + dx;
    if (dir.includes('w')) { nx = origX + dx; nw = origW - dx; }
    if (dir.includes('s')) nh = origH + dy;
    if (dir.includes('n')) { ny = origY + dy; nh = origH - dy; }
    // Magnétisme sur les bords actifs (Shift désactive)
    if (!ev.shiftKey) {
      const snap = dlxComputeSnapForResize(s, dir, nx, ny, nw, nh);
      nx += snap.dx; ny += snap.dy; nw += snap.dw; nh += snap.dh;
    }
    // Min size 4px et empêche d'inverser (w h restent positifs)
    if (nw < 4) { if (dir.includes('w')) nx = origX + origW - 4; nw = 4; }
    if (nh < 4) { if (dir.includes('n')) ny = origY + origH - 4; nh = 4; }
    // Clamp dans le canvas
    nx = Math.max(0, nx);
    ny = Math.max(0, ny);
    nw = Math.min(DLX_CANVAS_W - nx, nw);
    nh = Math.min(DLX_CANVAS_H - ny, nh);
    s.x = nx; s.y = ny; s.w = nw; s.h = nh;
  } else if (_dlxDrag.mode === 'vertex' || _dlxDrag.mode === 'wall-translate') {
    // Drag de vertex OU translate du mur entier. Convertir delta screen → canvas
    const canvas = document.getElementById('dlxCanvas');
    let scaleX = 1, scaleY = 1;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      scaleX = 600 / rect.width;
      scaleY = 1500 / rect.height;
    }
    const cdx = dx * scaleX;
    const cdy = dy * scaleY;
    if (_dlxDrag.mode === 'vertex') {
      const idx = _dlxDrag.vertexIdx;
      if (s.points && s.points[idx]) {
        // Clamp dans les bornes du canvas
        s.points[idx].x = Math.max(0, Math.min(DLX_CANVAS_W, _dlxDrag.origX + cdx));
        s.points[idx].y = Math.max(0, Math.min(DLX_CANVAS_H, _dlxDrag.origY + cdy));
      }
    } else {
      // wall-translate : applique le même delta à TOUS les vertices, clampé
      if (s.points && _dlxDrag.origPoints) {
        s.points = _dlxDrag.origPoints.map(p => ({
          x: Math.max(0, Math.min(DLX_CANVAS_W, p.x + cdx)),
          y: Math.max(0, Math.min(DLX_CANVAS_H, p.y + cdy)),
        }));
      }
    }
    // Live update du SVG : on remet à jour les polylines et tous les circles
    const ptsStr = s.points.map(p => `${p.x},${p.y}`).join(' ');
    const polylines = canvas.querySelectorAll(`polyline[data-id="${s.id}"]`);
    polylines.forEach(pl => pl.setAttribute('points', ptsStr));
    s.points.forEach((p, i) => {
      const circle = canvas.querySelector(`.dlx-wall-vertex[data-wall="${s.id}"][data-vertex="${i}"]`);
      if (circle) {
        circle.setAttribute('cx', p.x);
        circle.setAttribute('cy', p.y);
      }
    });
    return;
  }
  const elNode = document.querySelector(`.dlx-el[data-id="${s.id}"]`);
  if (elNode) {
    elNode.style.left   = s.x + 'px';
    elNode.style.top    = s.y + 'px';
    elNode.style.width  = s.w + 'px';
    elNode.style.height = s.h + 'px';
  }
  // Push des rooms : si on bouge/redimensionne une room, les rooms en-dessous
  // qui se chevauchent horizontalement sont poussées (et rétrécissent si
  // elles dépasseraient le canvas). MAJ DOM ciblée des rooms modifiées.
  if (s.type === 'room' && (_dlxDrag.mode === 'move' || _dlxDrag.mode === 'resize')) {
    const moved = dlxPushRoomsBelow(s);
    moved.forEach(dlxUpdateElDom);
  }
  // Sync les champs du panneau de propriétés si cet élément est sélectionné
  if (dlxSelectedId === s.id) dlxSyncPropsInputs(s);
}

function dlxOnDragEnd() {
  if (!_dlxDrag) return;
  document.removeEventListener('mousemove', dlxOnDragMove);
  const draggedId = _dlxDrag.id;
  const el = document.querySelector(`.dlx-el[data-id="${draggedId}"]`);
  if (el) el.classList.remove('dragging');
  _dlxDrag = null;
  dlxSavePlan();
  const s = dlxPlan.elements.find(x => x.id === draggedId);
  // Re-render complet après tout drag de porte :
  //  - resize : régénère le SVG (viewBox basé sur w/h)
  //  - move/resize : recalcule la découpe des murs traversés par la porte
  if (s && s.type === 'door') {
    dlxRender();
    dlxSelect(draggedId);
  }
}

// ── PUSH DES ZONES (rooms) ─────────────────────────────────────────────────
// Quand une room est agrandie ou déplacée, les rooms situées EN-DESSOUS et
// qui se chevauchent horizontalement avec elle sont poussées vers le bas
// pour ne pas se superposer. La dernière room poussée rétrécit si elle
// dépasserait le bas du canvas. Retourne la liste des rooms modifiées
// (pour MAJ DOM ciblée sans full re-render).
const DLX_MIN_ROOM_H = 30;
function dlxPushRoomsBelow(resizedRoom) {
  if (!resizedRoom || resizedRoom.type !== 'room') return [];
  const modified = [];
  // Toutes les rooms triées par Y croissant
  const rooms = dlxPlan.elements
    .filter(e => e.type === 'room')
    .sort((a, b) => a.y - b.y);
  // Frontier = la coord Y minimale que la prochaine room peut avoir.
  // Initialisée au bas de la room redimensionnée.
  let frontier = resizedRoom.y + resizedRoom.h;
  for (const r of rooms) {
    if (r.id === resizedRoom.id) continue;
    if (r.y < resizedRoom.y) continue; // ignore les rooms au-dessus
    // Chevauchement horizontal avec la room redimensionnée ?
    const overlapX = !(r.x + r.w <= resizedRoom.x || r.x >= resizedRoom.x + resizedRoom.w);
    if (!overlapX) continue;
    let changed = false;
    // Pousse vers le bas si elle empiète sur la frontier
    if (r.y < frontier) {
      r.y = frontier;
      changed = true;
    }
    // Rétrécit si elle dépasserait le bas du canvas
    if (r.y + r.h > DLX_CANVAS_H) {
      r.h = Math.max(DLX_MIN_ROOM_H, DLX_CANVAS_H - r.y);
      changed = true;
    }
    if (changed) modified.push(r);
    frontier = r.y + r.h;
  }
  return modified;
}

// Met à jour le DOM d'une room sans full re-render (utilisé pendant le drag)
function dlxUpdateElDom(r) {
  const node = document.querySelector(`.dlx-el[data-id="${r.id}"]`);
  if (node) {
    node.style.left   = r.x + 'px';
    node.style.top    = r.y + 'px';
    node.style.width  = r.w + 'px';
    node.style.height = r.h + 'px';
  }
}

// ── MAGNÉTISME (snap aux bords / vertices) ─────────────────────────────────
const DLX_SNAP_THRESHOLD = 8; // px de tolérance pour le snap

// Collecte tous les "candidats" de snap en X et en Y (bords des autres
// éléments, vertices des murs, bords du canvas). Exclut l'élément
// actuellement draggé (par id).
function dlxCollectSnapCandidates(excludeId) {
  const xs = [0, DLX_CANVAS_W]; // bords du canvas
  const ys = [0, DLX_CANVAS_H];
  dlxPlan.elements.forEach(o => {
    if (o.id === excludeId) return;
    if (o.type === 'wall') {
      (o.points || []).forEach(p => { xs.push(p.x); ys.push(p.y); });
    } else if (typeof o.x === 'number') {
      xs.push(o.x, o.x + (o.w || 0));
      ys.push(o.y, o.y + (o.h || 0));
    }
  });
  return { xs, ys };
}

// Trouve le meilleur snap : pour chaque "valeur" à snapper (ex. left edge),
// cherche le candidat le plus proche < threshold. Retourne le delta à
// ajouter pour atteindre le candidat (ou 0 si aucun snap).
function dlxBestSnap(values, candidates) {
  let bestDelta = 0;
  let bestDist = DLX_SNAP_THRESHOLD;
  for (const v of values) {
    for (const c of candidates) {
      const d = Math.abs(v - c);
      if (d < bestDist) { bestDist = d; bestDelta = c - v; }
    }
  }
  return bestDelta;
}

// Magnétisme pour un MOVE : snap left/right/center edges de l'élément
// aux bords des autres éléments / vertices murs / bords canvas.
function dlxComputeSnapForMove(s, nx, ny) {
  const cand = dlxCollectSnapCandidates(s.id);
  const w = s.w || 0, h = s.h || 0;
  const dx = dlxBestSnap([nx, nx + w/2, nx + w], cand.xs);
  const dy = dlxBestSnap([ny, ny + h/2, ny + h], cand.ys);
  return { dx, dy };
}

// Magnétisme pour un RESIZE : ne snap que les BORDS qui bougent selon dir.
function dlxComputeSnapForResize(s, dir, nx, ny, nw, nh) {
  const cand = dlxCollectSnapCandidates(s.id);
  let dx = 0, dy = 0, dw = 0, dh = 0;
  // Bord droit (e) : snap (x + w) aux candidats x → delta s'applique à w
  if (dir.includes('e')) {
    const delta = dlxBestSnap([nx + nw], cand.xs);
    dw = delta;
  }
  // Bord gauche (w) : snap x aux candidats x → delta s'applique à x ET inverse à w
  if (dir.includes('w')) {
    const delta = dlxBestSnap([nx], cand.xs);
    dx = delta;
    dw = -delta;
  }
  // Bord bas (s) : snap (y + h) aux candidats y → delta s'applique à h
  if (dir.includes('s')) {
    const delta = dlxBestSnap([ny + nh], cand.ys);
    dh = delta;
  }
  // Bord haut (n) : snap y aux candidats y → delta s'applique à y ET inverse à h
  if (dir.includes('n')) {
    const delta = dlxBestSnap([ny], cand.ys);
    dy = delta;
    dh = -delta;
  }
  return { dx, dy, dw, dh };
}

// Conversion auto des walls ancien format (x,y,w,h rectangle) vers nouveau
// format polyline. Appelé après load pour migrer les plans sauvegardés.
function dlxMigrateWalls(plan) {
  if (!plan || !Array.isArray(plan.elements)) return plan;
  plan.elements.forEach(el => {
    if (el.type === 'wall' && !el.points && typeof el.x === 'number') {
      // Rectangle d'origine : on en fait un segment (axe le plus long)
      const isHorizontal = (el.w || 0) >= (el.h || 0);
      el.points = isHorizontal
        ? [{ x: el.x, y: el.y + el.h/2 }, { x: el.x + el.w, y: el.y + el.h/2 }]
        : [{ x: el.x + el.w/2, y: el.y }, { x: el.x + el.w/2, y: el.y + el.h }];
      el.thickness = Math.max(el.w, el.h) > 0 ? Math.min(el.w, el.h) : 4;
      delete el.x; delete el.y; delete el.w; delete el.h;
    }
  });
  return plan;
}

function dlxOnElDblClick(ev) {
  if (dlxMode !== 'edit') return;
  if (ev.target.classList.contains('dlx-el-remove')) return;
  const id = ev.currentTarget.dataset.id;
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;
  const newLabel = prompt(`Nom de l'élément (${s.type}) :`, s.label);
  if (newLabel == null) return;
  s.label = newLabel.trim();
  dlxSavePlan();
  dlxRender();
}

// ── AJOUT / SUPPRESSION ─────────────────────────────────────────────────────
function dlxAddElement() {
  const type = dlxAddType;
  const def = DLX_TYPES[type];
  if (!def) return;
  dlxPushHistory();
  const id = `${type}-${Date.now()}`;
  dlxPlan.elements.push({
    id,
    type,
    label: type === 'station' ? 'Nouvelle station' : (type === 'room' ? 'Nouvelle zone' : ''),
    x: 30, y: 30,
    w: def.defaultW,
    h: def.defaultH,
    color: def.color,
  });
  dlxSavePlan();
  dlxRender();
}

// Wrapper backward-compat (l'ancien bouton du HTML appelle dlxAddStation)
function dlxAddStation() { dlxAddType = 'station'; dlxAddElement(); }

function dlxRemoveElement(id) {
  if (!confirm('Supprimer cet élément ?')) return;
  dlxPushHistory();
  dlxPlan.elements = dlxPlan.elements.filter(s => s.id !== id);
  dlxSavePlan();
  dlxRender();
}

// Backward-compat
function dlxRemoveStation(id) { dlxRemoveElement(id); }

// ── PANNEAU DE PROPRIÉTÉS (sélection + édition fine) ───────────────────────
function dlxSelect(id) {
  const wasSelected = dlxSelectedId;
  dlxSelectedId = id;
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) {
    dlxSelectedId = wasSelected;
    return;
  }
  // Full re-render quand on change de sélection : il faut MAJ les handles
  // de resize (8 handles n'apparaissent que sur l'élément sélectionné), et
  // bascule mur ↔ non-mur pour afficher/cacher les vertices SVG.
  if (wasSelected !== id) {
    dlxRender();
  }
  // Highlight visuel : retire ancien, ajoute nouveau
  document.querySelectorAll('.dlx-el.selected').forEach(el => el.classList.remove('selected'));
  const elNode = document.querySelector(`.dlx-el[data-id="${id}"]`);
  if (elNode) elNode.classList.add('selected');
  const panel = document.getElementById('dlxPropsPanel');
  if (!panel) return;
  panel.style.display = '';
  const title = document.getElementById('dlxPropsTitle');
  if (title) {
    const def = DLX_TYPES[s.type] || {};
    title.textContent = `${def.icon || ''} ${def.label || s.type} — ${s.id}`;
  }
  // Affiche le bouton "↻ 90°" si le type supporte la rotation
  const rotBtn = document.getElementById('dlxPropsRotate');
  if (rotBtn) {
    const def = DLX_TYPES[s.type] || {};
    rotBtn.style.display = def.rotatable ? '' : 'none';
  }
  // Affiche le bouton simple/double porte uniquement pour les portes
  const doorBtn = document.getElementById('dlxPropsDoorType');
  if (doorBtn) {
    doorBtn.style.display = s.type === 'door' ? '' : 'none';
    if (s.type === 'door') {
      const dt = s.doorType || 'simple';
      doorBtn.textContent = dt === 'simple' ? '🚪 → Double' : '🚪 → Simple';
    }
  }
  dlxSyncPropsInputs(s);
}

// Bascule le type d'une porte sélectionnée entre 'simple' et 'double'
function dlxToggleDoorType() {
  if (!dlxSelectedId) return;
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s || s.type !== 'door') return;
  dlxPushHistory();
  s.doorType = (s.doorType === 'double') ? 'simple' : 'double';
  dlxSavePlan();
  dlxRender();
  dlxSelect(s.id);
}

// Rotation 90° de l'élément sélectionné (incrément circulaire 0→90→180→270→0)
function dlxRotateSelected() {
  if (!dlxSelectedId) return;
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s) return;
  const def = DLX_TYPES[s.type] || {};
  if (!def.rotatable) return;
  dlxPushHistory();
  s.rotation = ((s.rotation || 0) + 90) % 360;
  dlxSavePlan();
  // Re-render pour appliquer le transform (et re-sélection pour garder
  // le panneau ouvert)
  dlxRender();
  dlxSelect(s.id);
}

function dlxDeselect() {
  const hadSelection = dlxSelectedId !== null;
  dlxSelectedId = null;
  document.querySelectorAll('.dlx-el.selected').forEach(el => el.classList.remove('selected'));
  const panel = document.getElementById('dlxPropsPanel');
  if (panel) panel.style.display = 'none';
  // Si on désélectionne un non-mur, on doit ré-afficher les vertices des murs
  if (hadSelection) dlxRender();
}

function dlxSyncPropsInputs(s) {
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.value !== String(v)) el.value = v; };
  set('dlxPropsLabel', s.label || '');
  set('dlxPropsX', s.x);
  set('dlxPropsY', s.y);
  set('dlxPropsW', s.w);
  set('dlxPropsH', s.h);
  const c = document.getElementById('dlxPropsColor');
  if (c) c.value = s.color || '#888888';
}

// Mise à jour live d'une propriété depuis un champ input.
// On push à l'historique uniquement à la PREMIÈRE édition d'une propriété
// (pas à chaque keystroke), via _dlxPropEditingKey qui se reset au blur.
let _dlxPropEditingKey = null;
function dlxUpdateProp(prop, value) {
  if (!dlxSelectedId) return;
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s) return;
  // Une seule entrée d'historique par "rafale" d'édition sur une même prop
  const editKey = `${s.id}:${prop}`;
  if (_dlxPropEditingKey !== editKey) {
    dlxPushHistory();
    _dlxPropEditingKey = editKey;
    // Reset le flag au prochain blur ou changement de prop
    setTimeout(() => {
      const reset = () => { _dlxPropEditingKey = null; };
      document.addEventListener('blur', reset, { once: true, capture: true });
    }, 0);
  }
  if (prop === 'label' || prop === 'color') {
    s[prop] = value;
  } else {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    // Clamp dans les bornes du canvas (l'élément doit rester visible)
    if (prop === 'x') s.x = Math.max(0, Math.min(DLX_CANVAS_W - (s.w || 1), n));
    else if (prop === 'y') s.y = Math.max(0, Math.min(DLX_CANVAS_H - (s.h || 1), n));
    else if (prop === 'w') s.w = Math.max(1, Math.min(DLX_CANVAS_W - (s.x || 0), n));
    else if (prop === 'h') s.h = Math.max(1, Math.min(DLX_CANVAS_H - (s.y || 0), n));
  }
  // Mise à jour DOM directe sans full re-render (préserve la sélection
  // et évite le flicker des champs en cours d'édition)
  const elNode = document.querySelector(`.dlx-el[data-id="${s.id}"]`);
  if (elNode) {
    elNode.style.left   = s.x + 'px';
    elNode.style.top    = s.y + 'px';
    elNode.style.width  = s.w + 'px';
    elNode.style.height = s.h + 'px';
    if (prop === 'color') {
      // Re-render uniquement cet élément pour appliquer la couleur
      const html = dlxElementHTML(s);
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const replacement = wrap.firstElementChild;
      if (replacement) {
        replacement.classList.add('selected');
        elNode.replaceWith(replacement);
        // Réattacher les listeners au nouveau noeud
        replacement.addEventListener('mousedown', dlxOnStationMouseDown_or_El);
        replacement.addEventListener('dblclick',  dlxOnElDblClick);
        replacement.querySelectorAll('.dlx-el-resize').forEach(rh => rh.addEventListener('mousedown', dlxOnResizeMouseDown));
      }
    }
    if (prop === 'label') {
      const labelEl = elNode.querySelector('.dlx-el-station-label, .dlx-el-label-mini, .dlx-el-room-label, .dlx-el-outlet-num');
      if (labelEl) labelEl.textContent = s.label || '';
    }
  }
  // Push des rooms si on a changé une dimension/position d'une room
  if (s.type === 'room' && ['x','y','w','h'].includes(prop)) {
    const moved = dlxPushRoomsBelow(s);
    moved.forEach(dlxUpdateElDom);
  }
  // Si on a resize une porte, le SVG doit se régénérer (viewBox = w/h)
  if (s.type === 'door' && (prop === 'w' || prop === 'h')) {
    dlxRender();
    dlxSelect(s.id);
  }
  dlxSavePlan();
}

// Alias pour compatibilité (dlxOnElMouseDown est le vrai nom dans le code,
// l'alias est juste pour la ré-attachement après replaceWith ci-dessus).
const dlxOnStationMouseDown_or_El = dlxOnElMouseDown;
