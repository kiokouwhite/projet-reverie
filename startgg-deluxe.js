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
// Dimensions du canvas. DYNAMIQUES : le canvas s'agrandit automatiquement
// pour suivre le contenu (murs/zones qu'on étire au-delà du cadre). Les
// constantes _MIN sont la taille plancher (le canvas ne rétrécit jamais
// en-dessous). DLX_COORD_LIMIT = garde-fou anti-emballement.
const DLX_CANVAS_W_MIN = 600;
const DLX_CANVAS_H_MIN = 1500;
const DLX_COORD_LIMIT  = 50000;
const DLX_FIT_MARGIN   = 150; // marge laissée autour du contenu
let DLX_CANVAS_W = DLX_CANVAS_W_MIN;
let DLX_CANVAS_H = DLX_CANVAS_H_MIN;
let dlxPlan = { version: DLX_PLAN_VERSION, elements: [] };
let dlxMode = 'edit'; // 'edit' | 'run'
let dlxInitDone = false;
let dlxAddType = 'station'; // type sélectionné pour le bouton "+ Ajouter"
let dlxSelectedId = null;   // élément "primaire" sélectionné (pilote le panneau de props)
let dlxSelectedIds = [];    // tous les éléments sélectionnés (multi-sélection Shift+clic)
let dlxClipboard = null;    // snapshot JSON du/des élément(s) copié(s) (Ctrl+C)

// Vrai si l'élément fait partie de la sélection courante
function dlxIsSelected(id) { return dlxSelectedIds.indexOf(id) !== -1; }

// Ré-applique la classe .selected aux noeuds DOM des éléments sélectionnés
// (les murs portent leur état via le re-render, donc seuls les .dlx-el sont
// concernés ici). À appeler après tout dlxRender() qui ne passe pas par
// dlxSelect (ex : pendant un drag de groupe).
function dlxApplySelectionClasses() {
  document.querySelectorAll('.dlx-el.selected').forEach(el => el.classList.remove('selected'));
  dlxSelectedIds.forEach(sid => {
    const node = document.querySelector(`.dlx-el[data-id="${sid}"]`);
    if (node) node.classList.add('selected');
  });
}

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
  'door':      { icon: '🚪',  label: 'Porte',            defaultW: 70,  defaultH: 140, color: '#2a2a2a', z: 4, rotatable: true },
  'station':   { icon: '🎮',  label: 'Setup (station)',  defaultW: 160, defaultH: 70,  color: '#46d18f', z: 7, rotatable: true },
};

// Génère le SVG du symbole architectural d'une porte (battant + arc de
// débattement) dans une box w×h. doorType : 'simple' ou 'double'.
// IMPORTANT : l'ouverture passe par le CENTRE VERTICAL de la box (y = h/2).
// Comme la box est centrée sur le mur et que le trou est découpé au niveau
// de la box, le symbole, le mur et le trou sont ainsi parfaitement alignés
// — quelle que soit la rotation. Le débattement est dessiné dans la moitié
// haute (= la pièce dans laquelle la porte s'ouvre).
function dlxDoorSvg(w, h, doorType, color) {
  const c = color || '#2a2a2a';
  const sw = 2.5;
  const cy = h / 2; // ligne d'ouverture = centre vertical
  if (doorType === 'double') {
    const r = Math.min(w / 2, cy); // chaque battant = moitié de la largeur
    // Battant gauche : charnière en (0, cy), ouvre vers le haut
    const leftLeaf = `<line x1="0" y1="${cy}" x2="0" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
    const leftArc  = `<path d="M 0 ${cy - r} A ${r} ${r} 0 0 1 ${r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    // Battant droit : charnière en (w, cy), miroir
    const rightLeaf = `<line x1="${w}" y1="${cy}" x2="${w}" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
    const rightArc  = `<path d="M ${w} ${cy - r} A ${r} ${r} 0 0 0 ${w - r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    return `<svg class="dlx-door-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
      ${leftLeaf}${leftArc}${rightLeaf}${rightArc}</svg>`;
  }
  // Porte simple : charnière en (0, cy), battant vertical vers le haut,
  // arc jusqu'au bord droit du débattement.
  const r = Math.min(w, cy);
  const leaf = `<line x1="0" y1="${cy}" x2="0" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
  const arc  = `<path d="M 0 ${cy - r} A ${r} ${r} 0 0 1 ${r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
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
      if (dlxMode !== 'edit' || !dlxSelectedIds.length) return;
      // Shift+clic ailleurs : ne pas casser la multi-sélection en cours
      if (ev.shiftKey) return;
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
    // Ctrl+C = copie le(s) élément(s) sélectionné(s) dans le presse-papier interne
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') {
      if (dlxSelectedIds.length) {
        ev.preventDefault();
        dlxCopySelected();
      }
      return;
    }
    // Ctrl+V = colle une copie décalée de l'élément copié
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v') {
      if (dlxClipboard) {
        ev.preventDefault();
        dlxPasteClipboard();
      }
      return;
    }
    // Suppr / Delete / Backspace = supprime l'élément sélectionné (mur inclus).
    // Pas de confirm() : action volontaire + Ctrl+Z pour annuler.
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && dlxSelectedIds.length) {
      ev.preventDefault();
      dlxDeleteSelected();
    }
  });
}

// Copie le/les élément(s) sélectionné(s) (snapshots JSON) dans le
// presse-papier interne. Gère la multi-sélection.
function dlxCopySelected() {
  if (!dlxSelectedIds.length) return;
  const els = dlxSelectedIds
    .map(id => dlxPlan.elements.find(x => x.id === id))
    .filter(Boolean);
  if (!els.length) return;
  dlxClipboard = JSON.stringify(els);
}

// Colle une copie de chaque élément du presse-papier, décalée de 24px, et
// sélectionne le(s) nouvel(aux) élément(s). Gère murs (points) et rects.
function dlxPasteClipboard() {
  if (!dlxClipboard) return;
  let src;
  try { src = JSON.parse(dlxClipboard); } catch { return; }
  if (!src) return;
  // Rétro-compat : ancien format = un seul objet
  const list = Array.isArray(src) ? src : [src];
  if (!list.length) return;
  dlxPushHistory();
  const OFF = 24;
  const newIds = [];
  list.forEach((item, i) => {
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = `${copy.type || 'el'}-${Date.now()}-${i}`;
    if (Array.isArray(copy.points)) {
      let dx = OFF, dy = OFF;
      const maxX = Math.max(...copy.points.map(p => p.x));
      const maxY = Math.max(...copy.points.map(p => p.y));
      if (maxX + dx > DLX_CANVAS_W) dx = -OFF;
      if (maxY + dy > DLX_CANVAS_H) dy = -OFF;
      copy.points = copy.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      copy.x = Math.max(0, Math.min(DLX_CANVAS_W - (copy.w || 0), (copy.x || 0) + OFF));
      copy.y = Math.max(0, Math.min(DLX_CANVAS_H - (copy.h || 0), (copy.y || 0) + OFF));
    }
    dlxPlan.elements.push(copy);
    newIds.push(copy.id);
  });
  dlxSavePlan();
  dlxRender();
  // Sélectionne la copie : simple si 1 élément, multi sinon
  dlxSelectedIds = [];
  dlxSelectedId = null;
  newIds.forEach(id => dlxSelect(id, true));
}

// Supprime l'élément actuellement sélectionné (sans confirm — l'undo
// Ctrl+Z permet de revenir en arrière).
function dlxDeleteSelected() {
  if (!dlxSelectedIds.length) return;
  dlxPushHistory();
  const toDelete = new Set(dlxSelectedIds);
  dlxPlan.elements = dlxPlan.elements.filter(s => !toDelete.has(s.id));
  dlxSelectedId = null;
  dlxSelectedIds = [];
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
        dlxSyncCanvasSize();
        return;
      }
    }
  } catch (e) {
    console.warn('[DLX] Load plan échec :', e.message);
  }
  dlxPlan = dlxDefaultPlan();
  dlxSyncCanvasSize();
}

function dlxSavePlan() {
  try { localStorage.setItem(DLX_LS_KEY, JSON.stringify(dlxPlan)); } catch {}
}

// Synchronise les dimensions courantes du canvas depuis le plan chargé
// (fallback sur le plancher si le plan ne contient pas encore ces champs).
function dlxSyncCanvasSize() {
  DLX_CANVAS_W = Math.max(DLX_CANVAS_W_MIN, dlxPlan.canvasW || 0);
  DLX_CANVAS_H = Math.max(DLX_CANVAS_H_MIN, dlxPlan.canvasH || 0);
}

// Recalcule la taille du canvas pour qu'il englobe tout le contenu + une
// marge. Si du contenu est passé en coordonnées négatives (mur tiré vers
// le haut/gauche), TOUT est décalé pour rester dans le cadre. Retourne le
// décalage appliqué { dx, dy } (utile pour recaler un drag en cours).
function dlxFitCanvasToContent() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  dlxPlan.elements.forEach(e => {
    if (Array.isArray(e.points)) {
      e.points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
    } else if (typeof e.x === 'number') {
      minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x + (e.w || 0));
      minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y + (e.h || 0));
    }
  });
  if (!isFinite(minX)) return { dx: 0, dy: 0 }; // plan vide

  // Décalage si du contenu déborde en haut/à gauche (coords négatives ou
  // trop proches du bord) → on pousse tout pour garder une marge.
  let dx = 0, dy = 0;
  if (minX < DLX_FIT_MARGIN) dx = DLX_FIT_MARGIN - minX;
  if (minY < DLX_FIT_MARGIN) dy = DLX_FIT_MARGIN - minY;
  if (dx || dy) {
    dlxPlan.elements.forEach(e => {
      if (Array.isArray(e.points)) {
        e.points.forEach(p => { p.x += dx; p.y += dy; });
      } else if (typeof e.x === 'number') {
        e.x += dx; e.y += dy;
      }
    });
    maxX += dx; maxY += dy;
  }
  // Le canvas englobe le contenu décalé + marge, jamais sous le plancher.
  DLX_CANVAS_W = Math.max(DLX_CANVAS_W_MIN, Math.ceil((maxX + DLX_FIT_MARGIN) / 50) * 50);
  DLX_CANVAS_H = Math.max(DLX_CANVAS_H_MIN, Math.ceil((maxY + DLX_FIT_MARGIN) / 50) * 50);
  dlxPlan.canvasW = DLX_CANVAS_W;
  dlxPlan.canvasH = DLX_CANVAS_H;
  return { dx, dy };
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
    dlxSyncCanvasSize();
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
  dlxSyncCanvasSize();
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
  // Le canvas s'adapte au contenu : on recalcule ses dimensions (et on
  // recale le contenu s'il a débordé en haut/à gauche) avant de dessiner.
  dlxFitCanvasToContent();
  canvas.style.width  = DLX_CANVAS_W + 'px';
  canvas.style.height = DLX_CANVAS_H + 'px';
  // Séparer murs (SVG) du reste (DOM positionné). Walls sont rendus dans
  // un <svg> overlay pour pouvoir avoir des polylines avec angles.
  const walls    = dlxPlan.elements.filter(e => e.type === 'wall');
  const nonWalls = dlxPlan.elements.filter(e => e.type !== 'wall');
  // Trier les non-walls par z-index pour ordre DOM correct
  nonWalls.sort((a, b) => (DLX_TYPES[a.type]?.z || 0) - (DLX_TYPES[b.type]?.z || 0));

  const wallsSvg = `<svg class="dlx-walls-svg" viewBox="0 0 ${DLX_CANVAS_W} ${DLX_CANVAS_H}" preserveAspectRatio="none">
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

// Rectangle EFFECTIF d'une porte une fois sa rotation appliquée. Pour une
// porte tournée à 90°/270°, la box visible a sa largeur et sa hauteur
// échangées (autour du même centre). Indispensable pour que la découpe du
// mur corresponde à la porte telle qu'elle est affichée — sinon les portes
// "sur le côté" (murs verticaux) ne créent pas de trou correct.
function dlxDoorEffectiveRect(d) {
  const rot = (((d.rotation || 0) % 360) + 360) % 360;
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  let w = d.w, h = d.h;
  if (rot === 90 || rot === 270) { w = d.h; h = d.w; }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
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
      const r = dlxDoorEffectiveRect(d);
      const clip = dlxClipSegmentToRect(a, b, r.x, r.y, r.w, r.h);
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
  const isSelected = dlxIsSelected(w.id);
  // Les murs restent interactifs tant qu'aucun élément NON-mur n'est
  // sélectionné (sinon les vertices/hit-areas captureraient les clics
  // destinés à l'élément sélectionné qui est derrière).
  const selectedEls = dlxSelectedIds
    .map(id => dlxPlan.elements.find(x => x.id === id))
    .filter(Boolean);
  const wallsInteractive = selectedEls.length === 0
    || selectedEls.every(e => e.type === 'wall');
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
  // l'élément est le SEUL sélectionné (en multi-sélection on ne redimensionne
  // pas, on ne fait que déplacer le groupe).
  const isSelected = dlxIsSelected(el.id);
  const resizeHandle = (isEdit && isSelected && dlxSelectedIds.length === 1)
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
  // Le canvas est en pixels réels (taille dynamique) sans transform, donc
  // le mapping est direct via les bounding rects.
  const scaleX = DLX_CANVAS_W / rect.width;
  const scaleY = DLX_CANVAS_H / rect.height;
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

// Click sur la zone hit-area d'un mur (mais pas sur un vertex) → déplace
// UNIQUEMENT le segment cliqué (ses 2 extrémités). Les segments adjacents
// suivent en s'étirant, ce qui permet d'agrandir/rétrécir une pièce en
// poussant un seul pan de mur — sans déplacer toute la polyline.
function dlxOnWallLineMouseDown(ev) {
  if (dlxMode !== 'edit') return;
  if (ev.button !== 0) return; // right-click géré par contextmenu
  ev.preventDefault();
  const wallId = ev.currentTarget.dataset.id;
  const w = dlxPlan.elements.find(x => x.id === wallId);
  if (!w || !w.points) return;
  // Shift+clic = ajoute/retire le mur de la multi-sélection (pas de drag)
  if (ev.shiftKey) {
    dlxSelect(wallId, true);
    return;
  }
  // Si "Porte" est le type sélectionné dans le dropdown → poser une porte
  // directement sur le mur au point cliqué (au lieu de drag le mur).
  if (dlxAddType === 'door') {
    dlxPlaceDoorOnWall(w, ev);
    return;
  }
  dlxPushHistory();
  // Si le mur fait partie d'une multi-sélection → déplace tout le groupe
  if (dlxSelectedIds.length > 1 && dlxIsSelected(wallId)) {
    _dlxDrag = {
      mode: 'move-group',
      startX: ev.clientX, startY: ev.clientY,
      group: dlxBuildGroupDragState(),
    };
    document.addEventListener('mousemove', dlxOnDragMove);
    document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
    return;
  }
  dlxSelect(wallId);
  // Trouve le segment cliqué : ses 2 extrémités sont les seuls vertices
  // qui bougeront. On ne déplace donc QUE ce pan de mur, pas la polyline
  // entière (les segments voisins s'étirent pour rester connectés).
  const click = dlxScreenToCanvas(ev);
  let segIdx = dlxFindBestInsertIndex(w.points, click) - 1;
  segIdx = Math.max(0, Math.min(w.points.length - 2, segIdx));
  const moveSet = new Set([segIdx, segIdx + 1]);
  // Polyline fermée (1er point ≈ dernier) : inclure les vertices coïncidant
  // avec une des 2 extrémités pour ne pas créer de trou dans le contour.
  const pa = w.points[segIdx], pb = w.points[segIdx + 1];
  w.points.forEach((p, i) => {
    if ((Math.abs(p.x - pa.x) < 1 && Math.abs(p.y - pa.y) < 1) ||
        (Math.abs(p.x - pb.x) < 1 && Math.abs(p.y - pb.y) < 1)) moveSet.add(i);
  });
  // Vecteur perpendiculaire au segment cliqué : le déplacement est
  // contraint à cette direction. Pour une pièce rectangulaire, pousser un
  // pan de mur perpendiculairement à lui-même fait coulisser ses
  // extrémités le long des murs voisins → ceux-ci restent droits, la
  // pièce s'agrandit/rétrécit proprement sans créer de diagonale.
  let perp = null;
  const segLen = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  if (segLen > 0.001) {
    perp = { x: -(pb.y - pa.y) / segLen, y: (pb.x - pa.x) / segLen };
  }
  _dlxDrag = {
    id: wallId,
    mode: 'wall-translate',
    startX: ev.clientX,
    startY: ev.clientY,
    origPoints: w.points.map(p => ({ x: p.x, y: p.y })),
    moveIndices: Array.from(moveSet),
    perp,
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
}

// Pose une porte directement sur le mur cliqué, au point cliqué, en la
// projetant sur le segment le plus proche et en l'orientant selon ce segment.
function dlxPlaceDoorOnWall(wall, ev) {
  if (!wall || !wall.points || wall.points.length < 2) return;
  dlxPushHistory();
  const click = dlxScreenToCanvas(ev);
  const def = DLX_TYPES['door'];
  const w = def.defaultW, h = def.defaultH;

  // Cherche le segment le plus proche + le point projeté sur ce segment
  let bestDist = Infinity, bestProj = null, bestSeg = null;
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i], b = wall.points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((click.x - a.x) * dx + (click.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(click.x - proj.x, click.y - proj.y);
    if (d < bestDist) { bestDist = d; bestProj = proj; bestSeg = [a, b]; }
  }
  const center = bestProj || click;

  // Orientation : segment plutôt vertical → porte tournée à 90°
  let rotation = 0;
  if (bestSeg) {
    const sdx = Math.abs(bestSeg[1].x - bestSeg[0].x);
    const sdy = Math.abs(bestSeg[1].y - bestSeg[0].y);
    rotation = (sdy > sdx) ? 90 : 0;
  }

  let x = center.x - w / 2;
  let y = center.y - h / 2;
  x = Math.max(0, Math.min(DLX_CANVAS_W - w, x));
  y = Math.max(0, Math.min(DLX_CANVAS_H - h, y));

  const id = `door-${Date.now()}`;
  dlxPlan.elements.push({
    id, type: 'door', label: '',
    x, y, w, h,
    color: def.color, doorType: 'simple', rotation,
  });
  dlxSavePlan();
  dlxRender();
  dlxSelect(id);
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

  // Shift+clic = ajoute/retire l'élément de la multi-sélection (pas de drag)
  if (ev.shiftKey) {
    dlxSelect(id, true);
    return;
  }

  dlxPushHistory(); // snapshot pour Ctrl+Z

  // Si l'élément fait déjà partie d'une multi-sélection → on déplace
  // tout le groupe ensemble, sans toucher à la sélection.
  if (dlxSelectedIds.length > 1 && dlxIsSelected(id)) {
    _dlxDrag = {
      mode: 'move-group',
      startX: ev.clientX, startY: ev.clientY,
      group: dlxBuildGroupDragState(),
    };
    document.addEventListener('mousemove', dlxOnDragMove);
    document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
    return;
  }

  // Sélection simple : ouvre le panneau de propriétés et déplace l'élément
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

// Construit l'état de départ d'un drag de groupe : positions d'origine de
// chaque élément sélectionné + bornes de décalage (dx/dy) pour que tout le
// groupe reste dans le cadre.
function dlxBuildGroupDragState() {
  const items = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  dlxSelectedIds.forEach(id => {
    const s = dlxPlan.elements.find(x => x.id === id);
    if (!s) return;
    if (Array.isArray(s.points)) {
      items.push({ id, points: s.points.map(p => ({ x: p.x, y: p.y })) });
      s.points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
    } else {
      items.push({ id, x: s.x, y: s.y });
      minX = Math.min(minX, s.x);          maxX = Math.max(maxX, s.x + (s.w || 0));
      minY = Math.min(minY, s.y);          maxY = Math.max(maxY, s.y + (s.h || 0));
    }
  });
  return {
    items,
    bbox: { minX, minY, maxX, maxY },
    minDx: -minX, maxDx: DLX_CANVAS_W - maxX,
    minDy: -minY, maxDy: DLX_CANVAS_H - maxY,
  };
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

  // Déplacement de groupe (multi-sélection) : applique le même delta, en
  // pixels-canvas, à tous les éléments du groupe, borné au cadre.
  if (_dlxDrag.mode === 'move-group') {
    const canvas = document.getElementById('dlxCanvas');
    let scaleX = 1, scaleY = 1;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      scaleX = DLX_CANVAS_W / rect.width;
      scaleY = DLX_CANVAS_H / rect.height;
    }
    const g = _dlxDrag.group;
    let cdx = (ev.clientX - _dlxDrag.startX) * scaleX;
    let cdy = (ev.clientY - _dlxDrag.startY) * scaleY;
    if (ev.shiftKey) { if (Math.abs(cdx) > Math.abs(cdy)) cdy = 0; else cdx = 0; }
    cdx = Math.max(g.minDx, Math.min(g.maxDx, cdx));
    cdy = Math.max(g.minDy, Math.min(g.maxDy, cdy));
    // Magnétisme : snap la bounding-box du groupe aux autres éléments / au
    // canvas (Shift désactive le snap, comme pour un déplacement simple).
    if (!ev.shiftKey) {
      const snap = dlxComputeSnapForGroup(g.bbox, cdx, cdy);
      cdx = Math.max(g.minDx, Math.min(g.maxDx, cdx + snap.dx));
      cdy = Math.max(g.minDy, Math.min(g.maxDy, cdy + snap.dy));
    }
    g.items.forEach(it => {
      const el = dlxPlan.elements.find(x => x.id === it.id);
      if (!el) return;
      if (it.points) {
        el.points = it.points.map(p => ({ x: p.x + cdx, y: p.y + cdy }));
      } else {
        el.x = it.x + cdx;
        el.y = it.y + cdy;
      }
    });
    dlxRender();
    dlxApplySelectionClasses();
    return;
  }

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
    // Pas de clamp au cadre : le canvas s'agrandira pour suivre l'élément.
    s.x = Math.max(-DLX_COORD_LIMIT, Math.min(DLX_COORD_LIMIT, nx));
    s.y = Math.max(-DLX_COORD_LIMIT, Math.min(DLX_COORD_LIMIT, ny));
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
    // Pas de clamp au cadre : le canvas s'agrandit pour suivre. On borne
    // juste à un garde-fou large pour éviter tout emballement.
    nx = Math.max(-DLX_COORD_LIMIT, nx);
    ny = Math.max(-DLX_COORD_LIMIT, ny);
    nw = Math.min(DLX_COORD_LIMIT, nw);
    nh = Math.min(DLX_COORD_LIMIT, nh);
    s.x = nx; s.y = ny; s.w = nw; s.h = nh;
  } else if (_dlxDrag.mode === 'vertex' || _dlxDrag.mode === 'wall-translate') {
    // Drag de vertex OU translate du mur entier. Convertir delta screen → canvas
    const canvas = document.getElementById('dlxCanvas');
    let scaleX = 1, scaleY = 1;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      scaleX = DLX_CANVAS_W / rect.width;
      scaleY = DLX_CANVAS_H / rect.height;
    }
    const cdx = dx * scaleX;
    const cdy = dy * scaleY;
    // Pendant un drag de mur on NE clampe PAS au cadre courant : on borne
    // juste à un garde-fou large. Le canvas s'agrandira pour suivre (refit
    // au render / à la fin du drag) → on peut étirer une pièce sans limite.
    const clampCoord = (v) => Math.max(-DLX_COORD_LIMIT, Math.min(DLX_COORD_LIMIT, v));
    if (_dlxDrag.mode === 'vertex') {
      const idx = _dlxDrag.vertexIdx;
      if (s.points && s.points[idx]) {
        let nx = _dlxDrag.origX + cdx;
        let ny = _dlxDrag.origY + cdy;
        // Magnétisme : le vertex snappe aux bords des autres éléments,
        // aux vertices des autres murs et aux bords du canvas (Shift désactive).
        if (!ev.shiftKey) {
          const cand = dlxCollectSnapCandidates(s.id);
          nx += dlxBestSnap([nx], cand.xs);
          ny += dlxBestSnap([ny], cand.ys);
        }
        s.points[idx].x = clampCoord(nx);
        s.points[idx].y = clampCoord(ny);
      }
    } else {
      // wall-translate : applique le delta UNIQUEMENT aux vertices du
      // segment cliqué (moveIndices), et contraint le déplacement à la
      // perpendiculaire du segment → les murs voisins restent droits.
      if (s.points && _dlxDrag.origPoints) {
        const moveIdx = _dlxDrag.moveIndices;
        let mdx = cdx, mdy = cdy;
        if (_dlxDrag.perp && !ev.shiftKey) {
          // Projection du delta sur la perpendiculaire du segment
          const proj = cdx * _dlxDrag.perp.x + cdy * _dlxDrag.perp.y;
          mdx = proj * _dlxDrag.perp.x;
          mdy = proj * _dlxDrag.perp.y;
        }
        // Magnétisme : le pan de mur déplacé snappe aux bords des autres
        // éléments / vertices de murs / bords du canvas. Le snap est
        // reprojeté sur la perpendiculaire pour ne pas casser la contrainte.
        if (!ev.shiftKey && moveIdx) {
          const cand = dlxCollectSnapCandidates(s.id);
          const movedXs = [], movedYs = [];
          moveIdx.forEach(i => {
            const op = _dlxDrag.origPoints[i];
            if (op) { movedXs.push(op.x + mdx); movedYs.push(op.y + mdy); }
          });
          let sdx = dlxBestSnap(movedXs, cand.xs);
          let sdy = dlxBestSnap(movedYs, cand.ys);
          if (_dlxDrag.perp) {
            const projS = sdx * _dlxDrag.perp.x + sdy * _dlxDrag.perp.y;
            sdx = projS * _dlxDrag.perp.x;
            sdy = projS * _dlxDrag.perp.y;
          }
          mdx += sdx; mdy += sdy;
        }
        s.points = _dlxDrag.origPoints.map((p, i) => {
          if (moveIdx && moveIdx.indexOf(i) === -1) return { x: p.x, y: p.y };
          return {
            x: clampCoord(p.x + mdx),
            y: clampCoord(p.y + mdy),
          };
        });
      }
    }
    // Le canvas s'adapte au mur qu'on étire : refit (agrandit + recale le
    // contenu s'il déborde en haut/à gauche), puis re-render complet. Si un
    // recalage a eu lieu, on décale aussi les références du drag en cours
    // pour que le calcul du delta reste cohérent à la frame suivante.
    const shift = dlxFitCanvasToContent();
    if (shift.dx || shift.dy) {
      if (_dlxDrag.origPoints) {
        _dlxDrag.origPoints.forEach(p => { p.x += shift.dx; p.y += shift.dy; });
      }
      if (typeof _dlxDrag.origX === 'number') {
        _dlxDrag.origX += shift.dx;
        _dlxDrag.origY += shift.dy;
      }
    }
    dlxRender();
    dlxApplySelectionClasses();
    return;
  }
  // Push des rooms : si on bouge/redimensionne une room, les rooms qui se
  // chevauchent horizontalement sont poussées (vers le bas ET vers le haut).
  if (s.type === 'room' && (_dlxDrag.mode === 'move' || _dlxDrag.mode === 'resize')) {
    dlxPushRoomsBelow(s);
    dlxPushRoomsAbove(s);
  }
  // Le canvas s'adapte à l'élément déplacé/redimensionné : refit (agrandit
  // + recale si débordement haut/gauche) puis re-render complet. Le shift
  // éventuel est répercuté sur les références du drag en cours.
  const shift = dlxFitCanvasToContent();
  if (shift.dx || shift.dy) {
    if (typeof _dlxDrag.origX === 'number') {
      _dlxDrag.origX += shift.dx;
      _dlxDrag.origY += shift.dy;
    }
  }
  dlxRender();
  dlxApplySelectionClasses();
  // Sync les champs du panneau de propriétés si cet élément est sélectionné
  if (dlxSelectedId === s.id) dlxSyncPropsInputs(s);
}

function dlxOnDragEnd() {
  if (!_dlxDrag) return;
  document.removeEventListener('mousemove', dlxOnDragMove);

  // Fin de déplacement de groupe : sauve + re-render + ré-applique le highlight
  if (_dlxDrag.mode === 'move-group') {
    _dlxDrag = null;
    dlxSavePlan();
    dlxRender();
    dlxApplySelectionClasses();
    return;
  }

  const draggedId = _dlxDrag.id;
  const el = document.querySelector(`.dlx-el[data-id="${draggedId}"]`);
  if (el) el.classList.remove('dragging');
  _dlxDrag = null;
  dlxSavePlan();
  // Re-render final : recale le canvas sur le contenu, régénère les SVG
  // (portes, découpe des murs) et ré-applique le highlight de sélection.
  dlxRender();
  dlxApplySelectionClasses();
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

// Symétrique de dlxPushRoomsBelow : quand une room est agrandie/déplacée
// VERS LE HAUT, les rooms situées AU-DESSUS qui se chevauchent
// horizontalement sont poussées vers le haut. Pas de clamp à 0 : le canvas
// s'agrandit/recale automatiquement si ça déborde en haut.
function dlxPushRoomsAbove(resizedRoom) {
  if (!resizedRoom || resizedRoom.type !== 'room') return [];
  const modified = [];
  // Rooms triées par Y DÉCROISSANT : on remonte depuis la room
  // redimensionnée vers le haut.
  const rooms = dlxPlan.elements
    .filter(e => e.type === 'room')
    .sort((a, b) => b.y - a.y);
  // Frontier = coord Y MAX que le BAS de la prochaine room (au-dessus) peut
  // atteindre. Initialisée au haut de la room redimensionnée.
  let frontier = resizedRoom.y;
  for (const r of rooms) {
    if (r.id === resizedRoom.id) continue;
    if (r.y >= resizedRoom.y) continue; // ignore les rooms en dessous / même niveau
    const overlapX = !(r.x + r.w <= resizedRoom.x || r.x >= resizedRoom.x + resizedRoom.w);
    if (!overlapX) continue;
    let changed = false;
    if (r.y + r.h > frontier) {
      r.y = frontier - r.h;
      changed = true;
    }
    if (changed) modified.push(r);
    frontier = r.y;
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
// éléments, vertices des murs, bords du canvas). Exclut l'élément (ou les
// éléments) actuellement draggé(s) : excludeId peut être un id ou un Set d'ids.
function dlxCollectSnapCandidates(excludeId) {
  const isSet = excludeId && typeof excludeId.has === 'function';
  const xs = [0, DLX_CANVAS_W]; // bords du canvas
  const ys = [0, DLX_CANVAS_H];
  dlxPlan.elements.forEach(o => {
    if (isSet ? excludeId.has(o.id) : o.id === excludeId) return;
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

// Magnétisme pour un MOVE de GROUPE : snap les bords (left/center/right,
// top/middle/bottom) de la bounding-box du groupe aux candidats des AUTRES
// éléments. Retourne le delta supplémentaire à ajouter à (cdx, cdy).
function dlxComputeSnapForGroup(bbox, cdx, cdy) {
  const excludeSet = new Set(dlxSelectedIds);
  const cand = dlxCollectSnapCandidates(excludeSet);
  const left   = bbox.minX + cdx;
  const right  = bbox.maxX + cdx;
  const top    = bbox.minY + cdy;
  const bottom = bbox.maxY + cdy;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = dlxBestSnap([left, cx, right], cand.xs);
  const dy = dlxBestSnap([top, cy, bottom], cand.ys);
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
// dlxSelect(id)            → sélection simple : remplace toute la sélection
// dlxSelect(id, true)      → mode additif (Shift+clic) : bascule l'élément
//                            dans/hors de la multi-sélection
function dlxSelect(id, additive) {
  const exists = dlxPlan.elements.some(x => x.id === id);
  if (!exists) return;
  const prevKey = dlxSelectedIds.join(',');

  if (additive) {
    const idx = dlxSelectedIds.indexOf(id);
    if (idx !== -1) {
      // Déjà sélectionné → on le retire de la sélection
      dlxSelectedIds.splice(idx, 1);
      dlxSelectedId = dlxSelectedIds[dlxSelectedIds.length - 1] || null;
    } else {
      dlxSelectedIds.push(id);
      dlxSelectedId = id;
    }
  } else {
    dlxSelectedIds = [id];
    dlxSelectedId = id;
  }

  // Full re-render quand la sélection change : MAJ des handles de resize et
  // bascule mur ↔ non-mur pour afficher/cacher les vertices SVG.
  if (prevKey !== dlxSelectedIds.join(',')) {
    dlxRender();
  }
  // Highlight visuel : retire tous les anciens, applique aux sélectionnés
  dlxApplySelectionClasses();

  const panel = document.getElementById('dlxPropsPanel');
  if (!panel) return;
  // Le panneau de propriétés n'a de sens que pour UN seul élément
  if (dlxSelectedIds.length !== 1) {
    panel.style.display = 'none';
    return;
  }
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s) { panel.style.display = 'none'; return; }
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
  const hadSelection = dlxSelectedId !== null || dlxSelectedIds.length > 0;
  dlxSelectedId = null;
  dlxSelectedIds = [];
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
    const moved = dlxPushRoomsBelow(s).concat(dlxPushRoomsAbove(s));
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
