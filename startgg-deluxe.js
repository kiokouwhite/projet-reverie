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
//   - 'wall'           — mur opaque sombre
//   - 'room'           — zone label (background coloré translucide)
//   - 'table-classique'— table rectangulaire gris clair
//   - 'table-ronde'    — table circulaire marron
//   - 'table-grande'   — grande table marron foncé
//   - 'desk'           — bureau à roulette
//   - 'exit'           — sortie de secours (pictogramme vert)
//   - 'microphone'     — micro
//   - 'laptop'         — ordinateur portable
//   - 'whiteboard'     — tableau blanc
//   - 'projector'      — vidéoprojecteur
//   - 'outlet'         — prise / multiprise (label = 1/2/3)
//   - 'station'        — slot de match (drop target Phase 4)
//
// Storage : top8_deluxe_plan = { elements: [...] }
// ============================================================

const DLX_LS_KEY = 'top8_deluxe_plan';
// Version du modèle de plan. Bumper quand le default change radicalement
// pour forcer le rechargement automatique chez les users existants.
const DLX_PLAN_VERSION = 4;
let dlxPlan = { version: DLX_PLAN_VERSION, elements: [] };
let dlxMode = 'edit'; // 'edit' | 'run'
let dlxInitDone = false;
let dlxAddType = 'station'; // type sélectionné pour le bouton "+ Ajouter"

// ── DÉFINITION DES TYPES D'ÉLÉMENTS ─────────────────────────────────────────
// Chaque type a : icône, label menu, taille par défaut, couleur, z-index.
const DLX_TYPES = {
  'wall':            { icon: '🧱',  label: 'Mur',                 defaultW: 200, defaultH: 12,  color: '#2a2a2a', z: 3 },
  'room':            { icon: '🏠',  label: 'Zone (label)',        defaultW: 200, defaultH: 120, color: '#f5e6d8', z: 1 },
  'table-classique': { icon: '▭',   label: 'Table classique',     defaultW: 80,  defaultH: 50,  color: '#d8d8d8', z: 4 },
  'table-ronde':     { icon: '●',   label: 'Table ronde',         defaultW: 50,  defaultH: 50,  color: '#5c3a1f', z: 4 },
  'table-grande':    { icon: '▬',   label: 'Grande table',        defaultW: 120, defaultH: 70,  color: '#7d4a2a', z: 4 },
  'desk':            { icon: '💻',  label: 'Bureau à roulette',   defaultW: 60,  defaultH: 40,  color: '#c8a888', z: 4 },
  'exit':            { icon: '🚪',  label: 'Sortie de secours',   defaultW: 36,  defaultH: 36,  color: '#46d18f', z: 5 },
  'microphone':      { icon: '🎤',  label: 'Microphone',          defaultW: 30,  defaultH: 30,  color: '#7a5fca', z: 5 },
  'laptop':          { icon: '💻',  label: 'Ordinateur portable', defaultW: 40,  defaultH: 28,  color: '#888',    z: 5 },
  'whiteboard':      { icon: '◻',   label: 'Tableau blanc',       defaultW: 90,  defaultH: 12,  color: '#fafafa', z: 4 },
  'projector':       { icon: '📽️', label: 'Vidéoprojecteur',     defaultW: 30,  defaultH: 24,  color: '#444',    z: 5 },
  'outlet':          { icon: '🔌',  label: 'Prise / multiprise',  defaultW: 22,  defaultH: 22,  color: '#222',    z: 6 },
  'station':         { icon: '🎮',  label: 'Setup (station)',     defaultW: 160, defaultH: 70,  color: '#46d18f', z: 7 },
};

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

  // ═══ MURS (externes + cloisons internes) ═════════════════════════════
  // Bordures externes (4 côtés)
  add('w-top',    'wall', '',  18,  18, 564,   4);
  add('w-bottom', 'wall', '',  18,1478, 564,   4);
  add('w-left',   'wall', '',  18,  22,   4, 1460);
  add('w-right',  'wall', '', 578,  22,   4, 1460);
  // Cloisons internes (séparations entre zones)
  add('w-fg-bot',     'wall', '',  18, 500, 564,   4);
  add('w-tofg-bot',   'wall', '',  18, 620, 184,   4);  // Bas de l'alcôve TO FG
  add('w-tofg-right', 'wall', '', 200, 500,   4, 124);  // Côté droit de l'alcôve
  add('w-stream-bot', 'wall', '',  18, 880, 564,   4);
  add('w-smash-bot',  'wall', '',  18,1300, 564,   4);

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

  // ═══ ALCÔVE TO (FG) ═══════════════════════════════════════════════════
  add('table-to-fg', 'table-classique', 'TO FG',  40, 540, 140, 60);

  // ═══ ZONE STREAM ══════════════════════════════════════════════════════
  add('stream-1', 'station',    'Stream',     180, 680, 320, 120, '#7c5cff');
  add('mic-1',    'microphone', 'Micro',      120, 700,  30,  30);
  add('proj-1',   'projector',  'Projo',      510, 700,  30,  24);

  // ═══ COIN SMASH ═══════════════════════════════════════════════════════
  // 5 stations de chaque côté, collées au mur, stackées sans gap.
  // Labels = juste le numéro.
  const SMASH_STATION_H = 82;
  const SMASH_TOP = 900;
  for (let i = 0; i < 5; i++) {
    add(`smash-L${i+1}`, 'station', `${i+1}`,  22, SMASH_TOP + i*SMASH_STATION_H, 200, SMASH_STATION_H, '#46d18f');
    add(`smash-R${i+1}`, 'station', `${i+6}`, 378, SMASH_TOP + i*SMASH_STATION_H, 200, SMASH_STATION_H, '#46d18f');
  }

  // ═══ TABLES TO SMASH + ACCUEIL ════════════════════════════════════════
  add('table-to-smash', 'table-grande', 'TO',       60, 1340, 200, 80);
  add('table-accueil',  'table-grande', 'Accueil', 330, 1340, 200, 80);

  // ═══ SORTIES DE SECOURS ═══════════════════════════════════════════════
  add('exit-top', 'exit', '',  470,  30, 36, 36);
  add('exit-mid', 'exit', '',  470, 890, 36, 36);

  return { version: DLX_PLAN_VERSION, elements: e };
}

// ── INIT ────────────────────────────────────────────────────────────────────
function dlxInit() {
  if (dlxInitDone) return;
  dlxInitDone = true;
  dlxLoadPlan();
  dlxBuildAddTypeSelector();
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
      // Skip si version obsolète (force le rechargement du nouveau default)
      if (parsed && Array.isArray(parsed.elements) && parsed.elements.length
          && parsed.version === DLX_PLAN_VERSION) {
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

function dlxResetDefaultPlan() {
  if (!confirm('Restaurer le plan par défaut ? Tu vas perdre tes modifications actuelles.')) return;
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
  // Trier les éléments par z-index croissant pour que le DOM soit dans l'ordre
  const sorted = [...dlxPlan.elements].sort(
    (a, b) => (DLX_TYPES[a.type]?.z || 0) - (DLX_TYPES[b.type]?.z || 0)
  );
  canvas.innerHTML = sorted.map(dlxElementHTML).join('');
  if (dlxMode === 'edit') dlxAttachDragHandlers();
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
  const resizeHandle = isEdit
    ? `<div class="dlx-el-resize" data-resize="${el.id}"></div>`
    : '';

  // Rendu spécifique par type
  switch (el.type) {
    case 'wall':
      return `<div class="dlx-el dlx-el-wall" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};">
        ${removeBtn}${resizeHandle}</div>`;

    case 'room':
      return `<div class="dlx-el dlx-el-room" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}88;">
        <div class="dlx-el-room-label">${safeLabel}</div>
        ${removeBtn}${resizeHandle}</div>`;

    case 'table-ronde':
      return `<div class="dlx-el dlx-el-table-ronde" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};">
        ${safeLabel ? `<div class="dlx-el-label-mini">${safeLabel}</div>` : ''}
        ${removeBtn}${resizeHandle}</div>`;

    case 'table-classique':
    case 'table-grande':
      return `<div class="dlx-el dlx-el-table" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};color:${el.type==='table-grande' ? '#fff' : '#333'};">
        ${safeLabel ? `<div class="dlx-el-label-mini">${safeLabel}</div>` : ''}
        ${removeBtn}${resizeHandle}</div>`;

    case 'desk':
    case 'whiteboard':
    case 'projector':
    case 'laptop':
    case 'microphone':
    case 'exit':
      return `<div class="dlx-el dlx-el-icon" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};color:#fff;">
        <span class="dlx-el-icon-glyph">${def.icon}</span>
        ${removeBtn}${resizeHandle}</div>`;

    case 'outlet':
      return `<div class="dlx-el dlx-el-outlet" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color};">
        <span class="dlx-el-outlet-num">${safeLabel || '🔌'}</span>
        ${removeBtn}${resizeHandle}</div>`;

    case 'station':
    default:
      return `<div class="dlx-el dlx-el-station" data-id="${el.id}"
        style="left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;background:${el.color}33;border-color:${el.color};">
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
}

function dlxOnElMouseDown(ev) {
  if (ev.target.classList.contains('dlx-el-remove')) return;
  if (ev.target.classList.contains('dlx-el-resize')) return;
  if (dlxMode !== 'edit') return;
  const el = ev.currentTarget;
  const id = el.dataset.id;
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;
  ev.preventDefault();
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
  const s = dlxPlan.elements.find(x => x.id === id);
  if (!s) return;
  _dlxDrag = {
    id, mode: 'resize',
    startX: ev.clientX, startY: ev.clientY,
    origW: s.w, origH: s.h,
  };
  document.addEventListener('mousemove', dlxOnDragMove);
  document.addEventListener('mouseup',   dlxOnDragEnd, { once: true });
}

function dlxOnDragMove(ev) {
  if (!_dlxDrag) return;
  const s = dlxPlan.elements.find(x => x.id === _dlxDrag.id);
  if (!s) return;
  const dx = ev.clientX - _dlxDrag.startX;
  const dy = ev.clientY - _dlxDrag.startY;
  if (_dlxDrag.mode === 'move') {
    s.x = Math.max(0, _dlxDrag.origX + dx);
    s.y = Math.max(0, _dlxDrag.origY + dy);
  } else {
    s.w = Math.max(20, _dlxDrag.origW + dx);
    s.h = Math.max(20, _dlxDrag.origH + dy);
  }
  const elNode = document.querySelector(`.dlx-el[data-id="${s.id}"]`);
  if (elNode) {
    elNode.style.left   = s.x + 'px';
    elNode.style.top    = s.y + 'px';
    elNode.style.width  = s.w + 'px';
    elNode.style.height = s.h + 'px';
  }
}

function dlxOnDragEnd() {
  if (!_dlxDrag) return;
  document.removeEventListener('mousemove', dlxOnDragMove);
  const el = document.querySelector(`.dlx-el[data-id="${_dlxDrag.id}"]`);
  if (el) el.classList.remove('dragging');
  _dlxDrag = null;
  dlxSavePlan();
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
  dlxPlan.elements = dlxPlan.elements.filter(s => s.id !== id);
  dlxSavePlan();
  dlxRender();
}

// Backward-compat
function dlxRemoveStation(id) { dlxRemoveElement(id); }
