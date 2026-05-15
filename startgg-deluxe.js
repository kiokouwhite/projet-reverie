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
// Zoom du viewport (CSS `zoom` sur le canvas) — persistant. Les coords
// internes du plan restent en pixels canvas ; le facteur sert juste à
// rendre le visuel plus gros/petit + à scroller dans le viewport.
const DLX_ZOOM_LS_KEY = 'top8_deluxe_zoom';
const DLX_ZOOM_MIN = 0.25;
const DLX_ZOOM_MAX = 3;
let _dlxZoom = 1;
let dlxPlan = { version: DLX_PLAN_VERSION, elements: [] };
let dlxMode = 'run'; // 'edit' | 'run' — par défaut on est en mode lecture (Tournoi)
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
  'table':     { icon: '🪑',  label: 'Table',            defaultW: 140, defaultH: 80,  color: '#b89878', z: 6, rotatable: true },
  'station':   { icon: '🎮',  label: 'Setup (station)',  defaultW: 160, defaultH: 70,  color: '#46d18f', z: 7, rotatable: true },
};

// Génère le SVG du symbole architectural d'une porte (battant + arc de
// débattement) dans une box w×h. doorType : 'simple' ou 'double'.
// IMPORTANT : l'ouverture passe par le CENTRE VERTICAL de la box (y = h/2).
// Comme la box est centrée sur le mur et que le trou est découpé au niveau
// de la box, le symbole, le mur et le trou sont ainsi parfaitement alignés
// — quelle que soit la rotation. Le débattement est dessiné dans la moitié
// haute (= la pièce dans laquelle la porte s'ouvre).
function dlxDoorSvg(w, h, doorType, color, flip, flipV) {
  const c = color || '#2a2a2a';
  const sw = 2.5;
  const cy = h / 2; // ligne d'ouverture = centre vertical
  // flip  = miroir horizontal → charnière gauche ↔ droite
  // flipV = miroir vertical   → débattement haut ↔ bas (côté du mur)
  const sx = flip  ? -1 : 1, tx = flip  ? w : 0;
  const sy = flipV ? -1 : 1, ty = flipV ? h : 0;
  const open = (inner) => (flip || flipV)
    ? `<g transform="translate(${tx},${ty}) scale(${sx},${sy})">${inner}</g>`
    : inner;
  if (doorType === 'double') {
    // Chaque battant fait EXACTEMENT la moitié de la largeur → les deux
    // arcs se rejoignent toujours au centre, quelle que soit la taille
    // (plus de "trou" au milieu quand la porte est large).
    const r = w / 2;
    // Battant gauche : charnière en (0, cy), ouvre vers le haut
    const leftLeaf = `<line x1="0" y1="${cy}" x2="0" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
    const leftArc  = `<path d="M 0 ${cy - r} A ${r} ${r} 0 0 1 ${r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    // Battant droit : charnière en (w, cy), miroir
    const rightLeaf = `<line x1="${w}" y1="${cy}" x2="${w}" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
    const rightArc  = `<path d="M ${w} ${cy - r} A ${r} ${r} 0 0 0 ${w - r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
    return `<svg class="dlx-door-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
      ${open(`${leftLeaf}${leftArc}${rightLeaf}${rightArc}`)}</svg>`;
  }
  // Porte simple : charnière en (0, cy), battant vertical vers le haut,
  // arc jusqu'au bord droit du débattement. Rayon = largeur d'ouverture
  // (= largeur de la box) → le battant couvre toujours toute l'ouverture.
  const r = w;
  const leaf = `<line x1="0" y1="${cy}" x2="0" y2="${cy - r}" stroke="${c}" stroke-width="${sw}" />`;
  const arc  = `<path d="M 0 ${cy - r} A ${r} ${r} 0 0 1 ${r} ${cy}" stroke="${c}" stroke-width="${sw}" fill="none" />`;
  return `<svg class="dlx-door-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
    ${open(`${leaf}${arc}`)}</svg>`;
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
  dlxSggInit();
  dlxInstallScrollPersistence();
  dlxInstallPan();
  dlxInstallZoomWheel();
  dlxInstallResizer();
  // Restaure le mode (édition / tournoi) mémorisé. À défaut on reste en
  // Tournoi (lecture seule) — toujours appliquer dlxSetMode pour synchroniser
  // les visuels (FAB, barre d'actions, classes du canvas) avec l'état JS.
  let savedMode = 'run';
  try {
    const m = localStorage.getItem(DLX_MODE_LS_KEY);
    if (m === 'run' || m === 'edit') savedMode = m;
  } catch (e) {}
  dlxSetMode(savedMode);
  // Restaure la vue (plan / bracket) mémorisée
  try {
    const v = localStorage.getItem(DLX_VIEW_LS_KEY);
    if (v === 'bracket') dlxSetView('bracket');
  } catch (e) {}
  // Restaure le zoom mémorisé
  try {
    const z = parseFloat(localStorage.getItem(DLX_ZOOM_LS_KEY));
    if (z && isFinite(z) && z > 0) dlxApplyZoom(z);
    else {
      const lbl = document.getElementById('dlxZoomLabel');
      if (lbl) lbl.textContent = '100%';
    }
  } catch (e) {}
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

// ── REDIMENSIONNEMENT DU PANNEAU MATCHS (splitter) ──────────────────────
// Une poignée verticale entre la zone du plan et le panneau "Matchs" permet
// au TO d'ajuster la largeur des deux pour maximiser son espace de travail.
// La largeur est persistée.
const DLX_PANEL_W_LS_KEY = 'top8_deluxe_panel_w';
function dlxInstallResizer() {
  const resizer = document.getElementById('dlxResizer');
  const panel   = document.getElementById('dlxSggPanel');
  if (!resizer || !panel || resizer._dlxBound) return;
  resizer._dlxBound = true;
  // Restaure la largeur mémorisée
  try {
    const w = parseInt(localStorage.getItem(DLX_PANEL_W_LS_KEY), 10);
    if (w >= 200 && w <= 900) panel.style.width = w + 'px';
  } catch (e) {}
  resizer.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = panel.offsetWidth;
    resizer.classList.add('resizing');
    document.body.classList.add('dlx-resizing');
    const onMove = (e) => {
      let newW = startW - (e.clientX - startX);
      newW = Math.max(200, Math.min(900, newW));
      panel.style.width = newW + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      resizer.classList.remove('resizing');
      document.body.classList.remove('dlx-resizing');
      try { localStorage.setItem(DLX_PANEL_W_LS_KEY, String(panel.offsetWidth)); } catch (e) {}
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

// ── ZOOM ────────────────────────────────────────────────────────────────
// Applique un nouveau zoom CSS au canvas. Si (anchorX, anchorY) est fourni
// (coordonnées écran), on ajuste le scroll pour garder ce point sous le
// curseur. Sinon, on garde le centre du viewport.
function dlxApplyZoom(newZoom, anchorClientX, anchorClientY) {
  const wrap = document.querySelector('.dlx-canvas-wrap');
  const canvas = document.getElementById('dlxCanvas');
  if (!wrap || !canvas) return;
  newZoom = Math.max(DLX_ZOOM_MIN, Math.min(DLX_ZOOM_MAX, newZoom));
  // Si pas d'ancre fournie → centre du viewport
  const rect = wrap.getBoundingClientRect();
  const ax = (anchorClientX == null) ? rect.left + wrap.clientWidth  / 2 : anchorClientX;
  const ay = (anchorClientY == null) ? rect.top  + wrap.clientHeight / 2 : anchorClientY;
  // Point dans le contenu scrollable, avant changement de zoom
  const px = (ax - rect.left) + wrap.scrollLeft;
  const py = (ay - rect.top)  + wrap.scrollTop;
  // Coord canvas correspondante (le canvas commence à l'origine du contenu
  // car on a retiré margin auto)
  const oldZoom = _dlxZoom;
  const cx = px / oldZoom;
  const cy = py / oldZoom;
  // Applique le nouveau zoom
  _dlxZoom = newZoom;
  canvas.style.zoom = String(newZoom);
  try { localStorage.setItem(DLX_ZOOM_LS_KEY, String(newZoom)); } catch (e) {}
  // Met à jour l'indicateur "100%" du contrôle
  const lbl = document.getElementById('dlxZoomLabel');
  if (lbl) lbl.textContent = Math.round(newZoom * 100) + '%';
  // Recale le scroll pour garder l'ancre stable
  wrap.scrollLeft = cx * newZoom - (ax - rect.left);
  wrap.scrollTop  = cy * newZoom - (ay - rect.top);
}

function dlxZoomBy(factor) {
  dlxApplyZoom(_dlxZoom * factor);
}

function dlxZoomReset() {
  dlxApplyZoom(1);
}

// Wheel sur le viewport : zoom autour du curseur (préempte le scroll natif)
function dlxInstallZoomWheel() {
  const wrap = document.querySelector('.dlx-canvas-wrap');
  if (!wrap || wrap._dlxZoomBound) return;
  wrap._dlxZoomBound = true;
  wrap.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : (1 / 1.12);
    dlxApplyZoom(_dlxZoom * factor, ev.clientX, ev.clientY);
  }, { passive: false });
}

// Pan : clic-glissé sur le fond du plan = on déplace le viewport (comme
// Google Maps). Ne s'active QUE si le clic part du fond (ni d'un élément,
// ni d'une poignée), pour ne pas casser les drags d'édition existants.
function dlxInstallPan() {
  const wrap = document.querySelector('.dlx-canvas-wrap');
  if (!wrap || wrap._dlxPanBound) return;
  wrap._dlxPanBound = true;
  let panState = null;
  const interactiveSel = '.dlx-el, .dlx-wall-vertex, .dlx-wall-hitarea,'
    + ' .dlx-room-vertex, .dlx-poly-remove, .dlx-el-handle, .dlx-el-remove,'
    + ' .dlx-el-resize, .dlx-el-match-x';
  wrap.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    // Ne panne pas si le clic part d'un élément interactif (élément, poignée,
    // vertex de mur, etc.) — ces clics ont leur propre handler de drag.
    if (ev.target.closest && ev.target.closest(interactiveSel)) return;
    panState = {
      startX: ev.clientX, startY: ev.clientY,
      sLeft: wrap.scrollLeft, sTop: wrap.scrollTop,
    };
    wrap.classList.add('dlx-panning');
    ev.preventDefault();
    const onMove = (e) => {
      if (!panState) return;
      wrap.scrollLeft = panState.sLeft - (e.clientX - panState.startX);
      wrap.scrollTop  = panState.sTop  - (e.clientY - panState.startY);
    };
    const onUp = () => {
      panState = null;
      wrap.classList.remove('dlx-panning');
      document.removeEventListener('mousemove', onMove);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

// Mémorise la position de scroll du viewport (canvas-wrap) pour la
// restaurer au rechargement → l'utilisateur retrouve la même vue du plan.
const DLX_SCROLL_LS_KEY = 'top8_deluxe_scroll';
let _dlxScrollSaveTimer = null;
function dlxInstallScrollPersistence() {
  const wrap = document.querySelector('.dlx-canvas-wrap');
  if (!wrap || wrap._dlxScrollBound) return;
  wrap._dlxScrollBound = true;
  // Restaure la position au premier passage (après le 1er render qui a
  // fixé la taille du canvas, sinon scrollLeft/Top serait ignoré).
  try {
    const raw = localStorage.getItem(DLX_SCROLL_LS_KEY);
    if (raw) {
      const { x, y } = JSON.parse(raw);
      if (typeof x === 'number') wrap.scrollLeft = x;
      if (typeof y === 'number') wrap.scrollTop  = y;
    }
  } catch (e) {}
  // Sauvegarde (débouncée) à chaque scroll
  wrap.addEventListener('scroll', () => {
    clearTimeout(_dlxScrollSaveTimer);
    _dlxScrollSaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(DLX_SCROLL_LS_KEY,
          JSON.stringify({ x: wrap.scrollLeft, y: wrap.scrollTop }));
      } catch (e) {}
    }, 200);
  }, { passive: true });
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
const DLX_MODE_LS_KEY = 'top8_deluxe_mode';
function dlxSetMode(mode) {
  if (mode !== 'edit' && mode !== 'run') return;
  dlxMode = mode;
  try { localStorage.setItem(DLX_MODE_LS_KEY, mode); } catch (e) {}
  const editBtn = document.getElementById('dlxModeEdit');
  const runBtn  = document.getElementById('dlxModeRun');
  if (editBtn) editBtn.classList.toggle('active', mode === 'edit');
  if (runBtn)  runBtn.classList.toggle('active', mode === 'run');
  // Bouton flottant (FAB) bas-droite : actif en mode édition
  const fab = document.getElementById('dlxModeFab');
  if (fab) {
    fab.classList.toggle('active', mode === 'edit');
    fab.title = mode === 'edit'
      ? 'Mode édition (clic : passer en Tournoi)'
      : 'Mode tournoi (clic : passer en Édition)';
  }
  const actions = document.getElementById('dlxEditorActions');
  if (actions) actions.style.display = mode === 'edit' ? '' : 'none';
  const canvas = document.getElementById('dlxCanvas');
  if (canvas) canvas.classList.toggle('dlx-canvas-edit', mode === 'edit');
  dlxRender();
}

// Bascule le mode via le bouton flottant
function dlxToggleMode() {
  dlxSetMode(dlxMode === 'edit' ? 'run' : 'edit');
}

// ── VUE : PLAN ↔ BRACKET ────────────────────────────────────────────────
let dlxView = 'map'; // 'map' | 'bracket'
const DLX_VIEW_LS_KEY = 'top8_deluxe_view';

function dlxSetView(view) {
  if (view !== 'map' && view !== 'bracket') return;
  dlxView = view;
  try { localStorage.setItem(DLX_VIEW_LS_KEY, view); } catch (e) {}
  const wrap = document.querySelector('.dlx-canvas-wrap');
  const brView = document.getElementById('dlxBracketView');
  const mapBtn = document.getElementById('dlxViewMapBtn');
  const brBtn  = document.getElementById('dlxViewBracketBtn');
  if (mapBtn) mapBtn.classList.toggle('active', view === 'map');
  if (brBtn)  brBtn.classList.toggle('active', view === 'bracket');
  if (wrap)   wrap.style.display = (view === 'map') ? '' : 'none';
  if (brView) brView.style.display = (view === 'bracket') ? '' : 'none';
  // FABs (zoom, mode édition) sont map-specific → on les masque dans le bracket
  document.querySelectorAll('.dlx-zoom-fab, .dlx-mode-fab').forEach(el => {
    el.style.display = (view === 'map') ? '' : 'none';
  });
  // La barre d'actions d'édition ne sert qu'au plan : on la cache dans le
  // bracket (et l'état mode-édition reste mémorisé pour quand on revient).
  const actions = document.getElementById('dlxEditorActions');
  if (actions) {
    if (view !== 'map') actions.style.display = 'none';
    else actions.style.display = (dlxMode === 'edit') ? '' : 'none';
  }
  if (view === 'bracket') {
    // Charge le bracket à la 1re ouverture si pas déjà chargé
    if (dlxSgg.slug && !dlxBracket.loaded) dlxBracketFetch();
    else dlxBracketRender();
  }
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
  // On attache les handlers dans les DEUX modes : en mode Tournoi, seul le
  // mousedown des .dlx-el sert (clic sur un setup → report de score) ; les
  // poignées de resize / vertices de murs ne sont pas rendus donc les
  // querySelectorAll correspondants sont vides → rien d'autre n'est attaché.
  dlxAttachDragHandlers();
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
  // La croix de suppression n'apparaît que sur l'élément sélectionné.
  const isSelected = dlxIsSelected(el.id);
  const removeBtn = (isEdit && isSelected)
    ? `<button class="dlx-el-remove" onclick="dlxRemoveElement('${el.id}')" title="Supprimer">✕</button>`
    : '';
  // 8 handles de resize (4 côtés + 4 coins) — visibles uniquement quand
  // l'élément est le SEUL sélectionné (en multi-sélection on ne redimensionne
  // pas, on ne fait que déplacer le groupe).
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
    case 'room': {
      // Zone POLYGONALE : div au bbox, découpée en forme via clip-path.
      // Les poignées de vertex + le bouton supprimer sont rendus en overlay
      // canvas (NON enfants du div) pour ne pas être rognés par le clip-path.
      if (Array.isArray(el.points) && el.points.length >= 3) {
        const cp = el.points
          .map(p => `${(p.x - el.x).toFixed(1)}px ${(p.y - el.y).toFixed(1)}px`)
          .join(', ');
        const body = `<div class="dlx-el dlx-el-room dlx-el-room-poly" data-id="${el.id}"
          style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}88;clip-path:polygon(${cp});">
          <div class="dlx-el-room-label">${safeLabel}</div></div>`;
        // Contour pointillé : un border CSS serait rogné par le clip-path,
        // donc on dessine un <polygon> SVG qui épouse la forme.
        const localPts = el.points
          .map(p => `${(p.x - el.x).toFixed(1)},${(p.y - el.y).toFixed(1)}`)
          .join(' ');
        let overlay = `<svg class="dlx-poly-outline" width="${el.w}" height="${el.h}"
          viewBox="0 0 ${el.w} ${el.h}" style="left:${el.x}px;top:${el.y}px;">
          <polygon points="${localPts}" /></svg>`;
        if (isEdit && isSelected) {
          overlay += `<button class="dlx-poly-remove" onclick="dlxRemoveElement('${el.id}')"
            style="left:${el.x + el.w}px;top:${el.y}px;" title="Supprimer">✕</button>`;
        }
        if (isEdit && isSelected && dlxSelectedIds.length === 1) {
          overlay += el.points.map((p, i) =>
            `<div class="dlx-room-vertex" data-wall="${el.id}" data-vertex="${i}"
               style="left:${p.x}px;top:${p.y}px;"></div>`).join('');
        }
        return body + overlay;
      }
      return `<div class="dlx-el dlx-el-room" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}88;${rotCss}">
        <div class="dlx-el-room-label">${safeLabel}</div>
        ${removeBtn}${resizeHandle}</div>`;
    }

    case 'door':
      return `<div class="dlx-el dlx-el-door" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;${rotCss}">
        ${dlxDoorSvg(el.w, el.h, el.doorType || 'simple', el.color, !!el.flip, !!el.flipV)}
        ${removeBtn}${resizeHandle}</div>`;

    case 'table':
      return `<div class="dlx-el dlx-el-table" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};${rotCss}">
        <div class="dlx-el-table-label">${safeLabel}</div>
        ${removeBtn}${resizeHandle}</div>`;

    case 'station':
    default: {
      // Un setup peut recevoir un match start.gg par glisser-déposer.
      // S'il en a un (el.match), on affiche les joueurs + un ✕ pour le retirer.
      let inner;
      if (el.match) {
        const esc = dlxSggEsc;
        inner = `<div class="dlx-el-station-num">${safeLabel}</div>
          <div class="dlx-el-match">
            <div class="dlx-el-match-p">${esc(el.match.p1 || 'TBD')}</div>
            <div class="dlx-el-match-vs">vs</div>
            <div class="dlx-el-match-p">${esc(el.match.p2 || 'TBD')}</div>
          </div>
          <button class="dlx-el-match-x" onclick="dlxUnassignMatch('${el.id}')" title="Retirer le match">✕</button>`;
      } else {
        inner = `<div class="dlx-el-station-label">${safeLabel}</div>`;
      }
      return `<div class="dlx-el dlx-el-station${el.match ? ' dlx-el-has-match' : ''}" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}33;border-color:${el.color};${rotCss}"
        ondragover="dlxMatchDragOver(event)" ondragleave="dlxMatchDragLeave(event)" ondrop="dlxMatchDrop(event,'${el.id}')">
        ${inner}
        ${removeBtn}${resizeHandle}</div>`;
    }
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
  // Zones : clic droit = ajoute un point (transforme la zone en polygone)
  canvas.querySelectorAll('.dlx-el-room').forEach(el => {
    el.addEventListener('contextmenu', dlxOnRoomRightClick);
  });
  // Vertices des zones polygonales (réutilise les handlers de vertex de mur)
  canvas.querySelectorAll('.dlx-room-vertex').forEach(el => {
    el.addEventListener('mousedown', dlxOnWallVertexMouseDown);
    el.addEventListener('contextmenu', dlxOnWallVertexRightClick);
  });
}

// Clic droit sur une zone : insère un point au curseur. Si la zone est
// encore un simple rectangle, elle est d'abord convertie en polygone
// (ses 4 coins) — ensuite c'est une forme libre éditable point par point.
function dlxOnRoomRightClick(ev) {
  if (dlxMode !== 'edit') return;
  ev.preventDefault();
  ev.stopPropagation();
  const id = ev.currentTarget.dataset.id;
  const r = dlxPlan.elements.find(x => x.id === id);
  if (!r || r.type !== 'room') return;
  dlxPushHistory();
  const click = dlxScreenToCanvas(ev);
  if (!Array.isArray(r.points) || r.points.length < 3) {
    // Conversion rectangle → polygone (4 coins, sens horaire)
    r.points = [
      { x: r.x,        y: r.y        },
      { x: r.x + r.w,  y: r.y        },
      { x: r.x + r.w,  y: r.y + r.h  },
      { x: r.x,        y: r.y + r.h  },
    ];
  }
  const insertIdx = dlxFindBestInsertIndexClosed(r.points, click);
  r.points.splice(insertIdx, 0, { x: click.x, y: click.y });
  dlxSyncRoomBBox(r);
  dlxSavePlan();
  dlxRender();
  dlxSelect(id);
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
  // Mur : minimum 2 points. Zone polygonale : minimum 3 points.
  const minPts = (w.type === 'room') ? 3 : 2;
  if (w.points.length <= minPts) return;
  dlxPushHistory();
  w.points.splice(vertexIdx, 1);
  if (w.type === 'room') dlxSyncRoomBBox(w);
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

// Variante FERMÉE (polygone) : teste aussi le segment qui relie le dernier
// point au premier. Retourne l'index de splice où insérer le nouveau vertex.
function dlxFindBestInsertIndexClosed(points, click) {
  let bestIdx = points.length;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const d = dlxDistanceToSegment(click, a, b);
    if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
  }
  return bestIdx;
}

// Recalcule la bounding-box (x/y/w/h) d'une zone polygonale depuis ses
// points. La box sert au panneau de propriétés, au magnétisme et au push.
function dlxSyncRoomBBox(r) {
  if (!r || !Array.isArray(r.points) || !r.points.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  r.points.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  r.x = minX; r.y = minY; r.w = maxX - minX; r.h = maxY - minY;
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
  if (ev.button !== 0) return; // clic droit géré par contextmenu
  if (ev.target.classList.contains('dlx-el-remove')) return;
  if (ev.target.classList.contains('dlx-el-resize')) return;
  if (ev.target.classList.contains('dlx-el-handle')) return;
  if (ev.target.classList.contains('dlx-el-match-x')) return;
  const el = ev.currentTarget;
  const id = el.dataset.id;
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;

  // Mode Tournoi (lecture seule) : un clic sur un setup portant un match
  // ouvre directement la modale de report de score.
  if (dlxMode !== 'edit') {
    if (s.type === 'station' && s.match) {
      ev.preventDefault();
      dlxSggOpenReportForElement(id);
    }
    return;
  }
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
    // Pour une zone polygonale : on mémorise les points d'origine pour les
    // translater du même delta que la box pendant le déplacement.
    origPoints: Array.isArray(s.points) ? s.points.map(p => ({ x: p.x, y: p.y })) : null,
  };
  // Setup portant un match : si le mousedown se termine sans déplacement
  // (= un simple clic), on ouvrira la modale de report (cf. dlxOnDragEnd).
  _dlxClickCandidateId = (s.type === 'station' && s.match) ? id : null;
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
  el.classList.add('dragging');
}

// Setup-avec-match cliqué : id retenu tant que le mousedown n'a pas bougé.
// Si le drag dépasse un petit seuil, on l'annule (c'était un déplacement).
let _dlxClickCandidateId = null;

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
        if (el.type === 'room') dlxSyncRoomBBox(el);
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
  // Le mouvement dépasse le seuil → ce n'était pas un simple clic
  if (_dlxClickCandidateId && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    _dlxClickCandidateId = null;
  }
  // Shift maintenu = snap au mouvement axial (horizontal OU vertical seulement,
  // selon la direction dominante du drag). Utile pour étirer un mur sans
  // créer d'angle non voulu, ou aligner une station horizontalement.
  if (ev.shiftKey) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
  }
  // Avec zoom CSS, un pixel écran ≠ un pixel canvas. On convertit ici pour
  // les modes move / resize qui appliquent dx/dy directement en coords plan.
  // (Les modes vertex / wall-translate / move-group ont leur propre scale
  // basé sur getBoundingClientRect qui intègre déjà le zoom.)
  if (_dlxZoom !== 1 && (_dlxDrag.mode === 'move' || _dlxDrag.mode === 'resize')) {
    dx /= _dlxZoom;
    dy /= _dlxZoom;
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
    // Zone polygonale : translate aussi les points du même delta que la box.
    if (_dlxDrag.origPoints && Array.isArray(s.points)) {
      const ddx = s.x - _dlxDrag.origX, ddy = s.y - _dlxDrag.origY;
      s.points = _dlxDrag.origPoints.map(p => ({ x: p.x + ddx, y: p.y + ddy }));
    }
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
        // Deltas BRUTS (le verrouillage d'axe global ne s'applique pas au
        // vertex : on le gère ici, relativement au voisin).
        const rawDx = (ev.clientX - _dlxDrag.startX) * scaleX;
        const rawDy = (ev.clientY - _dlxDrag.startY) * scaleY;
        let nx = _dlxDrag.origX + rawDx;
        let ny = _dlxDrag.origY + rawDy;
        if (ev.shiftKey) {
          // Shift = aligner le vertex sur un VOISIN pour rendre le segment
          // parfaitement horizontal ou vertical (selon l'axe de drag
          // dominant). Le voisin choisi est celui dont la coord est la plus
          // proche → le segment vers ce voisin devient droit.
          const n = s.points.length;
          const wrap = (s.type === 'room'); // polygone fermé
          const neighbors = [];
          if (idx - 1 >= 0)      neighbors.push(s.points[idx - 1]);
          else if (wrap)         neighbors.push(s.points[n - 1]);
          if (idx + 1 < n)       neighbors.push(s.points[idx + 1]);
          else if (wrap)         neighbors.push(s.points[0]);
          if (Math.abs(rawDx) >= Math.abs(rawDy)) {
            // drag horizontal dominant → X libre, Y aligné sur un voisin
            let best = ny, bestD = Infinity;
            neighbors.forEach(nb => {
              const d = Math.abs(ny - nb.y);
              if (d < bestD) { bestD = d; best = nb.y; }
            });
            ny = best;
          } else {
            // drag vertical dominant → Y libre, X aligné sur un voisin
            let best = nx, bestD = Infinity;
            neighbors.forEach(nb => {
              const d = Math.abs(nx - nb.x);
              if (d < bestD) { bestD = d; best = nb.x; }
            });
            nx = best;
          }
        } else {
          // Magnétisme normal : snappe aux bords des autres éléments, aux
          // vertices des autres murs et aux bords du canvas.
          const cand = dlxCollectSnapCandidates(s.id);
          nx += dlxBestSnap([nx], cand.xs);
          ny += dlxBestSnap([ny], cand.ys);
        }
        s.points[idx].x = clampCoord(nx);
        s.points[idx].y = clampCoord(ny);
        // Zone polygonale : la box (x/y/w/h) suit les points.
        if (s.type === 'room') dlxSyncRoomBBox(s);
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
  // Clic simple (sans déplacement) sur un setup portant un match → report
  if (_dlxClickCandidateId) {
    const cid = _dlxClickCandidateId;
    _dlxClickCandidateId = null;
    dlxSggOpenReportForElement(cid);
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
  // Rooms RECTANGULAIRES triées par Y croissant. Les zones polygonales
  // (formes libres) ne sont pas auto-poussées : l'utilisateur les place
  // précisément à la main.
  const rooms = dlxPlan.elements
    .filter(e => e.type === 'room' && !Array.isArray(e.points))
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
  // Rooms RECTANGULAIRES triées par Y DÉCROISSANT : on remonte depuis la
  // room redimensionnée vers le haut. Les zones polygonales sont exclues.
  const rooms = dlxPlan.elements
    .filter(e => e.type === 'room' && !Array.isArray(e.points))
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
    label: type === 'station' ? 'Nouvelle station'
         : type === 'room'    ? 'Nouvelle zone'
         : type === 'table'   ? 'Table'
         : '',
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
  // Boutons "sens d'ouverture" (miroir horizontal / vertical) — portes only
  const flipBtn = document.getElementById('dlxPropsDoorFlip');
  if (flipBtn) flipBtn.style.display = s.type === 'door' ? '' : 'none';
  const flipVBtn = document.getElementById('dlxPropsDoorFlipV');
  if (flipVBtn) flipVBtn.style.display = s.type === 'door' ? '' : 'none';
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

// Inverse le sens d'ouverture d'une porte (miroir horizontal du battant).
function dlxFlipDoor() {
  if (!dlxSelectedId) return;
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s || s.type !== 'door') return;
  dlxPushHistory();
  s.flip = !s.flip;
  dlxSavePlan();
  dlxRender();
  dlxSelect(s.id);
}

// Inverse le débattement d'une porte de haut en bas (miroir vertical).
function dlxFlipDoorV() {
  if (!dlxSelectedId) return;
  const s = dlxPlan.elements.find(x => x.id === dlxSelectedId);
  if (!s || s.type !== 'door') return;
  dlxPushHistory();
  s.flipV = !s.flipV;
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
  // Zones POLYGONALES : le DOM partiel ne gère ni le clip-path ni les
  // poignées de vertex → on traite à part et on fait un full re-render.
  if (s.type === 'room' && Array.isArray(s.points)) {
    if (prop === 'label' || prop === 'color') {
      s[prop] = value;
    } else {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) return;
      if (prop === 'x' || prop === 'y') {
        const d = n - s[prop];
        s.points.forEach(p => { p[prop] += d; });
      } else if (prop === 'w' && s.w > 0) {
        const sc = Math.max(1, n) / s.w;
        s.points.forEach(p => { p.x = s.x + (p.x - s.x) * sc; });
      } else if (prop === 'h' && s.h > 0) {
        const sc = Math.max(1, n) / s.h;
        s.points.forEach(p => { p.y = s.y + (p.y - s.y) * sc; });
      }
      dlxSyncRoomBBox(s);
    }
    dlxSavePlan();
    dlxRender();
    dlxSelect(s.id);
    return;
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
      const labelEl = elNode.querySelector('.dlx-el-station-label, .dlx-el-label-mini, .dlx-el-room-label, .dlx-el-table-label, .dlx-el-outlet-num');
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

// ════════════════════════════════════════════════════════════════════════
// CONNEXION START.GG — charge un tournoi et affiche ses matchs (en cours,
// appelés, à venir) dans le panneau latéral du plan. Phase 2 du Deluxe :
// préparer le terrain pour assigner ensuite les matchs aux setups.
// ════════════════════════════════════════════════════════════════════════
const DLX_SGG_LS_KEY = 'top8_deluxe_sgg_slug';
let dlxSgg = { slug: '', tournamentName: '', sets: [] };

function dlxSggInit() {
  const saved = localStorage.getItem(DLX_SGG_LS_KEY) || '';
  const input = document.getElementById('dlxSggUrl');
  if (input && saved && !input.value) input.value = saved;
  // Auto-charge le dernier tournoi si on a un slug ET un token
  if (saved && dlxSggGetToken()) {
    dlxSgg.slug = saved;
    dlxSggFetch();
  }
}

// Récupère la clé API start.gg (réutilise celle de l'onglet Top 8 / Config)
function dlxSggGetToken() {
  if (typeof sggGetToken === 'function') {
    try { const t = sggGetToken(); if (t) return t; } catch (e) {}
  }
  const apiKey = document.getElementById('apiKey');
  return (apiKey && apiKey.value.trim()) || localStorage.getItem('top8_startgg_key') || '';
}

function dlxSggStatus(type, msg) {
  const el = document.getElementById('dlxSggStatus');
  if (!el) return;
  el.className = 'dlx-sgg-status dlx-sgg-status-' + type;
  el.textContent = msg || '';
}

// Charge le tournoi saisi dans le champ URL
function dlxSggLoad() {
  const input = document.getElementById('dlxSggUrl');
  const raw = (input && input.value || '').trim();
  if (!raw) return dlxSggStatus('error', 'Entre une URL ou un slug start.gg.');
  if (!dlxSggGetToken()) {
    return dlxSggStatus('error', '⚠️ Clé API start.gg manquante (onglet Configuration).');
  }
  const slug = (typeof sggExtractSlug === 'function')
    ? sggExtractSlug(raw)
    : raw.replace(/^.*tournament\//, '').replace(/[\/?#].*$/, '').trim();
  dlxSgg.slug = slug;
  localStorage.setItem(DLX_SGG_LS_KEY, slug);
  // Nouveau tournoi → invalide le bracket pour qu'il se recharge
  dlxBracket.events = [];
  dlxBracket.currentEventId = null;
  dlxBracket.loaded = false;
  dlxSggFetch();
  if (dlxView === 'bracket') dlxBracketFetch();
}

// Recharge les matchs du tournoi déjà chargé
function dlxSggRefresh() {
  if (!dlxSgg.slug) return dlxSggStatus('error', 'Aucun tournoi chargé.');
  dlxSggFetch();
}

const DLX_SGG_QUERY = `
  query DlxTournamentSets($slug: String!) {
    tournament(slug: $slug) {
      id name
      events {
        id name
        videogame { id name images { url type } }
        sets(page: 1, perPage: 60, sortType: CALL_ORDER, filters: { state: [1, 2, 6] }) {
          nodes {
            id identifier fullRoundText state
            station { id number }
            slots { entrant { id name } }
          }
        }
      }
    }
  }`;

async function dlxSggFetch() {
  dlxSggStatus('loading', 'Chargement des matchs…');
  try {
    const data = (typeof sggQuery === 'function')
      ? await sggQuery(DLX_SGG_QUERY, { slug: dlxSgg.slug })
      : await dlxSggRawQuery(DLX_SGG_QUERY, { slug: dlxSgg.slug });
    const t = data && data.tournament;
    if (!t) { dlxSggStatus('error', 'Tournoi introuvable.'); return; }
    dlxSgg.tournamentName = t.name;
    // Aplatit les sets de tous les events en une seule liste
    const sets = [];
    (t.events || []).forEach(ev => {
      const imgs = (ev.videogame && ev.videogame.images) || [];
      const gameImg = (imgs.find(i => i.type === 'profile') || imgs[0] || {}).url || '';
      ((ev.sets && ev.sets.nodes) || []).forEach(s => {
        const e1 = s.slots && s.slots[0] && s.slots[0].entrant;
        const e2 = s.slots && s.slots[1] && s.slots[1].entrant;
        sets.push({
          id: s.id,
          eventName: ev.name || '',
          gameName: (ev.videogame && ev.videogame.name) || '',
          videogameId: (ev.videogame && ev.videogame.id) || null,
          gameImg,
          round: s.fullRoundText || s.identifier || '',
          state: s.state,
          stationNumber: s.station && s.station.number != null ? s.station.number : null,
          p1: (e1 && e1.name) || null,
          p2: (e2 && e2.name) || null,
          p1Id: (e1 && e1.id) || null,
          p2Id: (e2 && e2.id) || null,
        });
      });
    });
    dlxSgg.sets = sets;
    // Rafraîchit les matchs déjà placés sur des setups :
    //  - s'ils sont toujours dans la liste → on met à jour le snapshot
    //  - s'ils n'y sont plus → match TERMINÉ → on le retire du setup
    let assignedChanged = false;
    dlxPlan.elements.forEach(el => {
      if (!el.match) return;
      const fresh = sets.find(s => String(s.id) === String(el.match.setId));
      if (fresh) {
        el.match.p1 = fresh.p1; el.match.p2 = fresh.p2;
        el.match.round = fresh.round; el.match.state = fresh.state;
        el.match.eventName = fresh.eventName;
        assignedChanged = true;
      } else {
        // Plus dans la liste des matchs non terminés → match joué → on libère le setup
        delete el.match;
        assignedChanged = true;
      }
    });
    if (assignedChanged) { dlxSavePlan(); dlxRender(); }
    dlxSggStatus('ok', `${t.name} — ${sets.length} match(s)`);
    dlxSggRenderPanel();
  } catch (e) {
    dlxSggStatus('error', 'Erreur : ' + e.message);
  }
}

// Fallback GraphQL si sggQuery (startgg.js) n'est pas chargé
async function dlxSggRawQuery(query, variables) {
  const token = dlxSggGetToken();
  if (!token) throw new Error('Token API start.gg manquant');
  const res = await fetch('https://api.start.gg/gql/alpha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

// État d'un set start.gg : 1 = à venir, 2 = en cours, 6 = appelé
function dlxSggStateInfo(state) {
  if (state === 2) return { label: 'En cours', cls: 'live' };
  if (state === 6) return { label: 'Appelé',   cls: 'called' };
  return { label: 'À venir', cls: 'upcoming' };
}

function dlxSggRenderPanel() {
  const wrap = document.getElementById('dlxSggMatches');
  if (!wrap) return;
  if (!dlxSgg.sets.length) {
    wrap.innerHTML = '<p class="dlx-sgg-empty">Aucun match en cours ou à venir.</p>';
    return;
  }
  // Tri : en cours (2) puis appelés (6) puis à venir (1)
  const rank = s => (s.state === 2 ? 0 : s.state === 6 ? 1 : 2);
  const ordered = dlxSgg.sets.slice().sort((a, b) => rank(a) - rank(b));
  // Groupe par event (dans l'ordre d'apparition)
  const groups = [];
  const byName = {};
  ordered.forEach(s => {
    if (!byName[s.eventName]) {
      byName[s.eventName] = { name: s.eventName, gameImg: s.gameImg, sets: [] };
      groups.push(byName[s.eventName]);
    }
    byName[s.eventName].sets.push(s);
  });
  wrap.innerHTML = groups.map(g => `
    <div class="dlx-sgg-event-group">
      <div class="dlx-sgg-event-name">
        ${g.gameImg ? `<img src="${dlxSggEsc(g.gameImg)}" alt="" class="dlx-sgg-event-img">` : ''}
        <span>${dlxSggEsc(g.name)}</span>
      </div>
      ${g.sets.map(s => {
        const st = dlxSggStateInfo(s.state);
        // Setup du plan auquel ce match est déjà assigné (glisser-déposer)
        const assignedEl = dlxFindElementByMatchSetId(s.id);
        const assignedCls = assignedEl ? ' dlx-sgg-set-assigned' : '';
        return `<div class="dlx-sgg-set dlx-sgg-set-${st.cls}${assignedCls}"
          draggable="true" data-set-id="${dlxSggEsc(s.id)}"
          ondragstart="dlxSggSetDragStart(event,'${dlxSggEsc(s.id)}')"
          ondragend="dlxSggSetDragEnd(event)"
          onclick="dlxSggOpenReport('${dlxSggEsc(s.id)}')"
          title="Clic : reporter le score · Glisser : placer sur un setup">
          <div class="dlx-sgg-set-head">
            <span class="dlx-sgg-set-round">${dlxSggEsc(s.round)}</span>
            <span class="dlx-sgg-set-state dlx-sgg-set-state-${st.cls}">${st.label}</span>
          </div>
          <div class="dlx-sgg-set-players">
            <span class="dlx-sgg-player">${dlxSggEsc(s.p1 || 'TBD')}</span>
            <span class="dlx-sgg-vs">vs</span>
            <span class="dlx-sgg-player">${dlxSggEsc(s.p2 || 'TBD')}</span>
          </div>
          ${assignedEl
            ? `<div class="dlx-sgg-set-station dlx-sgg-set-assigned-tag">📍 Placé sur « ${dlxSggEsc(assignedEl.label || assignedEl.id)} »</div>`
            : (s.stationNumber != null
                ? `<div class="dlx-sgg-set-station">🎮 Setup ${dlxSggEsc(s.stationNumber)}</div>`
                : '')}
        </div>`;
      }).join('')}
    </div>`).join('');
}

function dlxSggEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ── GLISSER-DÉPOSER : assigner un match start.gg à un setup du plan ──────
let _dlxSggDragSet = null; // set start.gg en cours de drag depuis le panneau

// Retourne l'élément du plan auquel un set est assigné (ou null)
function dlxFindElementByMatchSetId(setId) {
  return dlxPlan.elements.find(e => e.match && String(e.match.setId) === String(setId)) || null;
}

function dlxSggSetDragStart(ev, setId) {
  _dlxSggDragSet = dlxSgg.sets.find(s => String(s.id) === String(setId)) || null;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'copy';
    try { ev.dataTransfer.setData('text/plain', 'dlxset:' + setId); } catch (e) {}
  }
  ev.currentTarget.classList.add('dlx-sgg-set-dragging');
}

function dlxSggSetDragEnd(ev) {
  ev.currentTarget.classList.remove('dlx-sgg-set-dragging');
  document.querySelectorAll('.dlx-el-station.dlx-drop-hover')
    .forEach(el => el.classList.remove('dlx-drop-hover'));
  _dlxSggDragSet = null;
}

function dlxMatchDragOver(ev) {
  if (!_dlxSggDragSet) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  ev.currentTarget.classList.add('dlx-drop-hover');
}

function dlxMatchDragLeave(ev) {
  if (ev.currentTarget.contains(ev.relatedTarget)) return;
  ev.currentTarget.classList.remove('dlx-drop-hover');
}

function dlxMatchDrop(ev, elId) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('dlx-drop-hover');
  const set = _dlxSggDragSet;
  _dlxSggDragSet = null;
  if (!set) return;
  dlxAssignMatch(elId, set);
}

// Assigne un match (set start.gg) à un élément du plan. Un même match ne
// peut être que sur UN seul setup : on le retire d'abord de tout autre.
function dlxAssignMatch(elId, set) {
  const el = dlxPlan.elements.find(x => x.id === elId);
  if (!el) return;
  dlxPushHistory();
  // Retire ce set de tout autre élément qui l'aurait déjà
  dlxPlan.elements.forEach(e => {
    if (e !== el && e.match && String(e.match.setId) === String(set.id)) {
      delete e.match;
    }
  });
  el.match = {
    setId: set.id,
    p1: set.p1, p2: set.p2,
    round: set.round, eventName: set.eventName,
    state: set.state,
  };
  dlxSavePlan();
  dlxRender();
  dlxSggRenderPanel();
}

// Retire le match assigné à un élément
function dlxUnassignMatch(elId) {
  const el = dlxPlan.elements.find(x => x.id === elId);
  if (!el || !el.match) return;
  dlxPushHistory();
  delete el.match;
  dlxSavePlan();
  dlxRender();
  dlxSggRenderPanel();
}

// ── REPORT DE SCORE — modale d'édition du score d'un match start.gg ─────
let _dlxReportSetId = null;
let _dlxCharCache = {};       // videogameId → liste de personnages (cache)
let _dlxReportCharList = [];  // personnages du jeu du match en cours
let _dlxReportChars = {};     // sélection courante : clé "game_player" → characterId
let _dlxReportGameWins = {};  // vainqueur par game : clé game → 1 (p1) ou 2 (p2)

// Récupère (et cache) la liste des personnages d'un jeu start.gg
const DLX_SGG_CHARS_QUERY = `
  query DlxChars($id: ID!) {
    videogame(id: $id) { id characters { id name } }
  }`;
async function dlxSggFetchCharacters(videogameId) {
  if (!videogameId) return [];
  if (_dlxCharCache[videogameId]) return _dlxCharCache[videogameId];
  try {
    const data = (typeof sggQuery === 'function')
      ? await sggQuery(DLX_SGG_CHARS_QUERY, { id: videogameId })
      : await dlxSggRawQuery(DLX_SGG_CHARS_QUERY, { id: videogameId });
    const chars = ((data && data.videogame && data.videogame.characters) || [])
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    _dlxCharCache[videogameId] = chars;
    return chars;
  } catch (e) {
    return [];
  }
}

function dlxReportStatus(type, msg) {
  const el = document.getElementById('dlxReportStatus');
  if (!el) return;
  el.className = 'dlx-report-status dlx-report-status-' + type;
  el.textContent = msg || '';
}

// Ouvre la modale de report pour un set start.gg (depuis le panneau)
function dlxSggOpenReport(setId) {
  const set = dlxSgg.sets.find(s => String(s.id) === String(setId));
  if (!set) return;
  _dlxReportSetId = set.id;
  const modal = document.getElementById('dlxReportModal');
  if (!modal) return;
  const setText = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  setText('dlxReportTitle', set.round || 'Reporter le score');
  setText('dlxReportEvent', set.eventName || '');
  setText('dlxReportP1Name', set.p1 || 'TBD');
  setText('dlxReportP2Name', set.p2 || 'TBD');
  const p1 = document.getElementById('dlxReportP1Score');
  const p2 = document.getElementById('dlxReportP2Score');
  if (p1) p1.value = 0;
  if (p2) p2.value = 0;
  const ready = !!(set.p1Id && set.p2Id);
  const btn = document.getElementById('dlxReportSubmitBtn');
  if (btn) btn.disabled = !ready;
  dlxReportStatus(ready ? '' : 'error',
    ready ? '' : 'Les deux joueurs ne sont pas encore déterminés pour ce match.');
  // Réinitialise la sélection de personnages / vainqueurs et charge la liste
  _dlxReportChars = {};
  _dlxReportGameWins = {};
  _dlxReportCharList = [];
  dlxRenderReportGames();
  if (set.videogameId) {
    dlxSggFetchCharacters(set.videogameId).then(chars => {
      // ne re-render que si la modale est toujours sur ce même match
      if (String(_dlxReportSetId) === String(set.id)) {
        _dlxReportCharList = chars;
        dlxRenderReportGames();
      }
    });
  }
  modal.style.display = 'flex';
}

// Lit le score saisi dans la modale → { sa, sb, total }
function dlxReportReadScore() {
  const elA = document.getElementById('dlxReportP1Score');
  const elB = document.getElementById('dlxReportP2Score');
  const sa = Math.max(0, parseInt(elA && elA.value, 10) || 0);
  const sb = Math.max(0, parseInt(elB && elB.value, 10) || 0);
  return { sa, sb, total: sa + sb };
}

// Le score a été modifié manuellement → on (ré)initialise les vainqueurs
// de games selon un découpage par défaut (les sa premiers à P1, le reste
// à P2), puis on régénère les lignes de games.
function dlxReportScoreChanged() {
  const { sa, sb } = dlxReportReadScore();
  _dlxReportGameWins = {};
  let g = 1;
  for (let i = 0; i < sa; i++) _dlxReportGameWins[g++] = 1;
  for (let i = 0; i < sb; i++) _dlxReportGameWins[g++] = 2;
  dlxRenderReportGames();
}

// Clic sur la case d'un joueur pour un game → ce joueur gagne ce game,
// puis on recalcule le score total à partir des vainqueurs de tous les games.
function dlxReportSetGameWinner(g, player) {
  _dlxReportGameWins[g] = player;
  let sa = 0, sb = 0;
  Object.keys(_dlxReportGameWins).forEach(k => {
    if (_dlxReportGameWins[k] === 1) sa++; else if (_dlxReportGameWins[k] === 2) sb++;
  });
  const elA = document.getElementById('dlxReportP1Score');
  const elB = document.getElementById('dlxReportP2Score');
  if (elA) elA.value = sa;
  if (elB) elB.value = sb;
  dlxRenderReportGames();
}

// (Re)génère la grille des games sous le score : une ligne par game
// (numérotée), deux cases (P1 / P2) alignées sous les joueurs. Cliquer une
// case = ce joueur gagne ce game (la case se surligne). Le <select> dans
// la case sert à choisir le personnage (ne déclenche pas le vainqueur).
function dlxRenderReportGames() {
  const wrap = document.getElementById('dlxReportGames');
  if (!wrap) return;
  const { sa, total } = dlxReportReadScore();
  if (!total) { wrap.innerHTML = ''; return; }
  const set = dlxSgg.sets.find(s => String(s.id) === String(_dlxReportSetId));
  const p1Name = (set && set.p1) || 'Joueur 1';
  const p2Name = (set && set.p2) || 'Joueur 2';
  const chars = _dlxReportCharList;
  const optsHtml = (selectedId) => {
    let h = '<option value="">— personnage —</option>';
    chars.forEach(c => {
      h += `<option value="${dlxSggEsc(c.id)}"${String(c.id) === String(selectedId) ? ' selected' : ''}>${dlxSggEsc(c.name)}</option>`;
    });
    return h;
  };
  const cellHtml = (g, player, cVal, pName) => {
    const isWin = (_dlxReportGameWins[g] || (g <= sa ? 1 : 2)) === player;
    return `<div class="dlx-report-cell${isWin ? ' winner' : ''}"
      onclick="dlxReportSetGameWinner(${g},${player})"
      title="Cliquer : ${dlxSggEsc(pName)} gagne le game ${g}">
      <select class="dlx-report-char" onclick="event.stopPropagation()"
        onchange="dlxReportSetChar(${g},${player},this.value)" ${chars.length ? '' : 'disabled'}>${optsHtml(cVal)}</select>
    </div>`;
  };
  let html = chars.length ? '' : '<p class="dlx-report-games-hint">Chargement des personnages…</p>';
  for (let g = 1; g <= total; g++) {
    html += `<div class="dlx-report-game">
      <div class="dlx-report-game-num">${g}</div>
      ${cellHtml(g, 1, _dlxReportChars[g + '_1'] || '', p1Name)}
      ${cellHtml(g, 2, _dlxReportChars[g + '_2'] || '', p2Name)}
    </div>`;
  }
  wrap.innerHTML = html;
}

// Mémorise le personnage choisi pour un game / un joueur. Propage
// automatiquement le perso aux autres games VIDES du même joueur (les
// games déjà renseignés ne sont pas écrasés, on peut donc surcharger un
// game en particulier).
function dlxReportSetChar(game, player, value) {
  _dlxReportChars[game + '_' + player] = value || '';
  if (!value) return;
  const { total } = dlxReportReadScore();
  let propagated = false;
  for (let g = 1; g <= total; g++) {
    if (g === game) continue;
    const k = g + '_' + player;
    if (!_dlxReportChars[k]) {
      _dlxReportChars[k] = value;
      propagated = true;
    }
  }
  if (propagated) dlxRenderReportGames();
}

function dlxSggCloseReport() {
  _dlxReportSetId = null;
  const modal = document.getElementById('dlxReportModal');
  if (modal) modal.style.display = 'none';
}

// Ouvre la modale de report pour le match assigné à un élément du plan.
// Le set complet (avec les IDs des joueurs) est cherché dans dlxSgg.sets.
function dlxSggOpenReportForElement(elId) {
  const el = dlxPlan.elements.find(x => x.id === elId);
  if (!el || !el.match) return;
  const set = dlxSgg.sets.find(s => String(s.id) === String(el.match.setId));
  if (!set) {
    alert('Recharge le tournoi start.gg (↻ Rafraîchir) pour pouvoir reporter ce match.');
    return;
  }
  dlxSggOpenReport(set.id);
}

// Boutons +/- d'incrément de score
function dlxReportBump(which, delta) {
  const el = document.getElementById(which === 'p1' ? 'dlxReportP1Score' : 'dlxReportP2Score');
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
  dlxReportScoreChanged(); // le nombre de games + les vainqueurs dépendent du score
}

const DLX_SGG_REPORT_MUTATION = `
  mutation DlxReportSet($setId: ID!, $winnerId: ID!, $gameData: [BracketSetGameDataInput]) {
    reportBracketSet(setId: $setId, winnerId: $winnerId, gameData: $gameData) {
      id state
    }
  }`;

// Envoie le score à start.gg via reportBracketSet
async function dlxSggSubmitReport() {
  const set = dlxSgg.sets.find(s => String(s.id) === String(_dlxReportSetId));
  if (!set) return dlxReportStatus('error', 'Match introuvable — recharge le tournoi.');
  if (!set.p1Id || !set.p2Id) {
    return dlxReportStatus('error', 'Joueurs non déterminés — impossible de reporter.');
  }
  const sa = Math.max(0, parseInt(document.getElementById('dlxReportP1Score').value, 10) || 0);
  const sb = Math.max(0, parseInt(document.getElementById('dlxReportP2Score').value, 10) || 0);
  if (sa === 0 && sb === 0) return dlxReportStatus('error', 'Entre un score.');
  if (sa === sb) return dlxReportStatus('error', 'Il faut un gagnant — les scores ne peuvent pas être égaux.');
  if (!dlxSggGetToken()) {
    return dlxReportStatus('error', '⚠️ Clé API start.gg manquante (onglet Configuration).');
  }

  const winnerId = sa > sb ? set.p1Id : set.p2Id;
  // gameData : 1 entrée par game. Le vainqueur de chaque game vient de
  // _dlxReportGameWins (modifiable au clic) ; on y joint les personnages
  // choisis (selections) quand ils sont renseignés.
  const total = sa + sb;
  const gameData = [];
  for (let g = 1; g <= total; g++) {
    const win = _dlxReportGameWins[g] || (g <= sa ? 1 : 2);
    const entry = { gameNum: g, winnerId: win === 1 ? set.p1Id : set.p2Id };
    const sel = [];
    const c1 = _dlxReportChars[g + '_1'];
    const c2 = _dlxReportChars[g + '_2'];
    if (c1) sel.push({ entrantId: set.p1Id, characterId: c1 });
    if (c2) sel.push({ entrantId: set.p2Id, characterId: c2 });
    if (sel.length) entry.selections = sel;
    gameData.push(entry);
  }

  const btn = document.getElementById('dlxReportSubmitBtn');
  if (btn) btn.disabled = true;
  dlxReportStatus('loading', 'Envoi du score à start.gg…');
  try {
    const vars = { setId: set.id, winnerId, gameData };
    if (typeof sggQuery === 'function') await sggQuery(DLX_SGG_REPORT_MUTATION, vars);
    else await dlxSggRawQuery(DLX_SGG_REPORT_MUTATION, vars);
    dlxReportStatus('ok', `✅ Score ${sa}-${sb} envoyé !`);
    // Rafraîchit la liste (le match terminé disparaîtra des "non terminés")
    await dlxSggFetch();
    setTimeout(dlxSggCloseReport, 900);
  } catch (e) {
    dlxReportStatus('error', 'Erreur : ' + e.message);
    if (btn) btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════════════════
// VUE BRACKET — affichage style start.gg de tous les matchs (terminés ou
// non), avec lignes de connexion. Switch d'event en un clic via les chips
// en haut. Réutilise dlxSgg.slug.
// ════════════════════════════════════════════════════════════════════════
const dlxBracket = {
  events: [],        // [{ id, name, videogameImg, sets: [...] }]
  currentEventId: null,
  loaded: false,
};

const DLX_BRACKET_QUERY = `
  query DlxBracket($slug: String!) {
    tournament(slug: $slug) {
      id name
      events {
        id name
        videogame { id name images { url type } }
        sets(page: 1, perPage: 250, sortType: STANDARD) {
          nodes {
            id identifier fullRoundText round state winnerId displayScore
            slots {
              entrant { id name }
              seed { seedNum }
              prereqType prereqId
            }
          }
        }
      }
    }
  }`;

async function dlxBracketFetch() {
  if (!dlxSgg.slug) return;
  if (!dlxSggGetToken()) {
    const c = document.getElementById('dlxBracketCanvas');
    if (c) c.innerHTML = '<div class="dlx-bracket-empty">⚠️ Clé API start.gg manquante.</div>';
    return;
  }
  const canvasEl = document.getElementById('dlxBracketCanvas');
  if (canvasEl) canvasEl.innerHTML = '<div class="dlx-bracket-empty">Chargement du bracket…</div>';
  try {
    const data = (typeof sggQuery === 'function')
      ? await sggQuery(DLX_BRACKET_QUERY, { slug: dlxSgg.slug })
      : await dlxSggRawQuery(DLX_BRACKET_QUERY, { slug: dlxSgg.slug });
    const t = data && data.tournament;
    if (!t) { canvasEl.innerHTML = '<div class="dlx-bracket-empty">Tournoi introuvable.</div>'; return; }
    dlxBracket.events = (t.events || []).map(ev => {
      const imgs = (ev.videogame && ev.videogame.images) || [];
      const img = (imgs.find(i => i.type === 'profile') || imgs[0] || {}).url || '';
      return {
        id: ev.id,
        name: ev.name || '',
        videogameImg: img,
        sets: (ev.sets && ev.sets.nodes) || [],
      };
    });
    dlxBracket.loaded = true;
    if (!dlxBracket.currentEventId && dlxBracket.events.length) {
      dlxBracket.currentEventId = dlxBracket.events[0].id;
    }
    dlxBracketRender();
  } catch (e) {
    if (canvasEl) canvasEl.innerHTML = '<div class="dlx-bracket-empty">Erreur : ' + dlxSggEsc(e.message) + '</div>';
  }
}

function dlxBracketSwitchEvent(id) {
  dlxBracket.currentEventId = id;
  dlxBracketRender();
}

// Clic sur une carte → ouvre le report si le match est encore "live"
function dlxBracketCardClick(setId) {
  const liveSet = dlxSgg.sets.find(s => String(s.id) === String(setId));
  if (liveSet) dlxSggOpenReport(setId);
}

// Génère le placeholder d'un slot encore vide ("winner of A", "Seed 4", …)
function dlxBracketPlaceholder(slot, setById) {
  if (!slot) return 'TBD';
  if (slot.prereqType === 'set' && slot.prereqId) {
    const pre = setById[slot.prereqId];
    if (pre && pre.identifier) return 'winner of ' + pre.identifier;
    return 'winner of ?';
  }
  if (slot.prereqType === 'seed' && slot.seed && slot.seed.seedNum != null) {
    return 'Seed ' + slot.seed.seedNum;
  }
  return 'TBD';
}

// Construit une carte JS pour un set start.gg
function dlxBracketMakeCard(s, setById) {
  const e1 = (s.slots && s.slots[0]) || null;
  const e2 = (s.slots && s.slots[1]) || null;
  const p1Id = e1 && e1.entrant && e1.entrant.id;
  const p2Id = e2 && e2.entrant && e2.entrant.id;
  let s1 = null, s2 = null;
  if (s.displayScore && typeof s.displayScore === 'string') {
    const nums = s.displayScore.match(/-?\d+/g);
    if (nums && nums.length >= 2) {
      s1 = nums[0]; s2 = nums[1];
    }
  }
  const p1Name = (e1 && e1.entrant && e1.entrant.name) || dlxBracketPlaceholder(e1, setById);
  const p2Name = (e2 && e2.entrant && e2.entrant.name) || dlxBracketPlaceholder(e2, setById);
  let winnerSlot = -1;
  if (s.winnerId != null) {
    if (String(s.winnerId) === String(p1Id)) winnerSlot = 0;
    else if (String(s.winnerId) === String(p2Id)) winnerSlot = 1;
  }
  return {
    id: s.id,
    x: 0, y: 0,
    p1: p1Name, p2: p2Name,
    s1, s2,
    winnerSlot,
    round: s.round,
    identifier: s.identifier || '',
    fullRoundText: s.fullRoundText || '',
    state: s.state,
    prereqs: [
      (e1 && e1.prereqType === 'set') ? e1.prereqId : null,
      (e2 && e2.prereqType === 'set') ? e2.prereqId : null,
    ],
  };
}

// Calcule positions des cartes + tracés des lignes pour un set d'un event
function dlxBracketLayout(sets) {
  const CARD_W = 220, CARD_H = 56, COL_GAP = 60, ROW_GAP = 14;
  const setById = {};
  sets.forEach(s => { setById[s.id] = s; });

  function buildSide(sideSets) {
    if (!sideSets.length) return { cards: [], width: 0, height: 0 };
    const byRound = {};
    sideSets.forEach(s => {
      const r = Math.abs(s.round);
      (byRound[r] = byRound[r] || []).push(s);
    });
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    const cards = [];
    const cardById = {};
    let xOffset = 0;
    rounds.forEach(r => {
      const setsInR = byRound[r];
      setsInR.sort((a, b) => {
        const sa = (a.slots && a.slots[0] && a.slots[0].seed && a.slots[0].seed.seedNum) || 999;
        const sb = (b.slots && b.slots[0] && b.slots[0].seed && b.slots[0].seed.seedNum) || 999;
        return sa - sb;
      });
      setsInR.forEach(s => {
        const c = dlxBracketMakeCard(s, setById);
        c.x = xOffset;
        cards.push(c);
        cardById[s.id] = c;
      });
      xOffset += CARD_W + COL_GAP;
    });
    // Y positions : round 1 = stack ; rounds suivants = moyenne des prereqs
    rounds.forEach((r, idx) => {
      const cardsInR = byRound[r].map(s => cardById[s.id]);
      if (idx === 0) {
        cardsInR.forEach((c, i) => { c.y = i * (CARD_H + ROW_GAP); });
      } else {
        cardsInR.forEach(c => {
          const preYs = c.prereqs
            .map(pid => (pid && cardById[pid]) ? cardById[pid].y : null)
            .filter(y => y != null);
          c.y = preYs.length ? preYs.reduce((a, b) => a + b, 0) / preYs.length : 0;
        });
      }
    });
    const height = cards.length ? Math.max(...cards.map(c => c.y + CARD_H)) : 0;
    return { cards, width: xOffset, height };
  }

  const winners = sets.filter(s => s.round > 0);
  const losers  = sets.filter(s => s.round < 0);
  const W = buildSide(winners);
  const L = buildSide(losers);
  // Empile la partie losers en-dessous de la partie winners
  const losersOffsetY = W.height ? W.height + 70 : 0;
  L.cards.forEach(c => { c.y += losersOffsetY; });

  const allCards = [...W.cards, ...L.cards];
  const cardByIdAll = {};
  allCards.forEach(c => { cardByIdAll[c.id] = c; });
  const lines = [];
  allCards.forEach(card => {
    card.prereqs.forEach((preId, slotIdx) => {
      if (!preId) return;
      const pre = cardByIdAll[preId];
      if (!pre) return;
      const x1 = pre.x + CARD_W;
      const y1 = pre.y + CARD_H / 2;
      const x2 = card.x;
      const y2 = card.y + (slotIdx === 0 ? CARD_H * 0.25 : CARD_H * 0.75);
      const xm = x1 + (x2 - x1) / 2;
      lines.push(`M ${x1} ${y1} L ${xm} ${y1} L ${xm} ${y2} L ${x2} ${y2}`);
    });
  });
  const width = allCards.length ? Math.max(...allCards.map(c => c.x + CARD_W)) + 20 : 0;
  const height = allCards.length ? Math.max(...allCards.map(c => c.y + CARD_H)) + 20 : 0;
  return { cards: allCards, lines, width, height, CARD_W, CARD_H };
}

function dlxBracketRender() {
  const chipsEl = document.getElementById('dlxBracketChips');
  const canvasEl = document.getElementById('dlxBracketCanvas');
  if (!chipsEl || !canvasEl) return;
  if (!dlxBracket.events.length) {
    chipsEl.innerHTML = '';
    canvasEl.innerHTML = '<div class="dlx-bracket-empty">Aucun event chargé.</div>';
    return;
  }
  // Chips de switch d'event (le "+ value" du Bracket Deluxe)
  chipsEl.innerHTML = dlxBracket.events.map(ev =>
    `<button class="dlx-bracket-chip${String(ev.id) === String(dlxBracket.currentEventId) ? ' active' : ''}"
       onclick="dlxBracketSwitchEvent('${dlxSggEsc(ev.id)}')">
       ${ev.videogameImg ? `<img src="${dlxSggEsc(ev.videogameImg)}" alt="">` : ''}
       <span>${dlxSggEsc(ev.name)}</span>
     </button>`).join('');

  const event = dlxBracket.events.find(e => String(e.id) === String(dlxBracket.currentEventId))
              || dlxBracket.events[0];
  if (!event.sets.length) {
    canvasEl.innerHTML = '<div class="dlx-bracket-empty">Aucun match dans cet event.</div>';
    return;
  }
  const layout = dlxBracketLayout(event.sets);
  const linesSvg = `<svg class="dlx-bracket-lines" width="${layout.width}" height="${layout.height}">
    ${layout.lines.map(d => `<path d="${d}" />`).join('')}
  </svg>`;
  const cardsHtml = layout.cards.map(c => {
    const stateBadge = c.state === 2 ? '<span class="dlx-br-state live">⏵</span>'
                     : c.state === 6 ? '<span class="dlx-br-state called">📣</span>' : '';
    return `<div class="dlx-br-card${c.state === 3 ? ' completed' : ''}"
       style="left:${c.x}px;top:${c.y}px;width:${layout.CARD_W}px;height:${layout.CARD_H}px;"
       onclick="dlxBracketCardClick('${dlxSggEsc(c.id)}')"
       title="${dlxSggEsc(c.fullRoundText || '')}">
      <div class="dlx-br-id">${dlxSggEsc(c.identifier || '')}${stateBadge}</div>
      <div class="dlx-br-slot${c.winnerSlot === 0 ? ' winner' : ''}">
        <span class="dlx-br-name">${dlxSggEsc(c.p1)}</span>
        <span class="dlx-br-score">${c.s1 == null ? '' : dlxSggEsc(c.s1)}</span>
      </div>
      <div class="dlx-br-slot${c.winnerSlot === 1 ? ' winner' : ''}">
        <span class="dlx-br-name">${dlxSggEsc(c.p2)}</span>
        <span class="dlx-br-score">${c.s2 == null ? '' : dlxSggEsc(c.s2)}</span>
      </div>
    </div>`;
  }).join('');
  canvasEl.style.width  = layout.width  + 'px';
  canvasEl.style.height = layout.height + 'px';
  canvasEl.innerHTML = linesSvg + cardsHtml;
}

// Rebascule sur le bracket à chaque fetch start.gg (pour recharger en cas
// de changement de tournoi)
function dlxBracketInvalidate() {
  dlxBracket.loaded = false;
  if (dlxView === 'bracket' && dlxSgg.slug) dlxBracketFetch();
}
