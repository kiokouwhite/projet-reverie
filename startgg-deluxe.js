// ============================================================
// STARTGG-DELUXE.JS — Outil de gestion live de tournoi
//
// Phase 1 : éditeur de plan custom (drag/drop des stations sur un
// canvas, persistance localStorage). Les phases suivantes ajouteront
// le fetch start.gg, le drag-and-drop des matchs, le report de scores.
//
// Storage : top8_deluxe_plan = { stations: [{id, label, x, y, w, h, color}] }
// ============================================================

// État global
const DLX_LS_KEY = 'top8_deluxe_plan';
let dlxPlan = { stations: [] };
let dlxMode = 'edit'; // 'edit' | 'run'
let dlxInitDone = false;

// Plan par défaut basé sur le venue de l'asso (cf. capture utilisateur) :
// - "Zone de Stream" en haut (large rectangle)
// - 2 colonnes de 5 setups Smash au centre
// - "TO / Accueil" en bas
function dlxDefaultPlan() {
  const stations = [];
  // Zone de Stream (haut, full-width)
  stations.push({ id: 'stream',  label: 'Zone de Stream', x:  40, y:  20, w: 520, h: 130, color: '#7c5cff' });
  // Colonne gauche : 5 setups Smash
  for (let i = 0; i < 5; i++) {
    stations.push({
      id: `smash-L${i+1}`,
      label: `Setup ${i+1}`,
      x: 40, y: 180 + i * 100,
      w: 220, h: 80,
      color: '#46d18f',
    });
  }
  // Colonne droite : 5 setups Smash
  for (let i = 0; i < 5; i++) {
    stations.push({
      id: `smash-R${i+1}`,
      label: `Setup ${i+6}`,
      x: 340, y: 180 + i * 100,
      w: 220, h: 80,
      color: '#46d18f',
    });
  }
  // TO / Accueil en bas (full-width)
  stations.push({ id: 'to', label: 'Tables TO / Accueil', x: 40, y: 700, w: 520, h: 80, color: '#f0a020' });
  return { stations };
}

// ── INIT ────────────────────────────────────────────────────────────────────
function dlxInit() {
  if (dlxInitDone) return;
  dlxInitDone = true;
  dlxLoadPlan();
  dlxRender();
}

// ── PERSISTANCE ─────────────────────────────────────────────────────────────
function dlxLoadPlan() {
  try {
    const raw = localStorage.getItem(DLX_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.stations) && parsed.stations.length) {
        dlxPlan = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('[DLX] Load plan échec :', e.message);
  }
  // Fallback : plan par défaut
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
  canvas.innerHTML = dlxPlan.stations.map(s => dlxStationHTML(s)).join('');
  // Attacher les listeners drag aux stations (mode edit uniquement)
  if (dlxMode === 'edit') dlxAttachDragHandlers();
}

function dlxStationHTML(s) {
  const safeLabel = String(s.label || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const isEdit = dlxMode === 'edit';
  const removeBtn = isEdit
    ? `<button class="dlx-station-remove" onclick="dlxRemoveStation('${s.id}')" title="Supprimer">✕</button>`
    : '';
  return `
    <div class="dlx-station" data-id="${s.id}"
         style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;background:${s.color}33;border-color:${s.color};">
      <div class="dlx-station-label">${safeLabel}</div>
      ${isEdit ? `<div class="dlx-station-resize" data-resize="${s.id}"></div>` : ''}
      ${removeBtn}
    </div>`;
}

// ── DRAG / RESIZE HANDLERS ──────────────────────────────────────────────────
let _dlxDrag = null; // { id, mode:'move'|'resize', startX, startY, origX, origY, origW, origH }

function dlxAttachDragHandlers() {
  const canvas = document.getElementById('dlxCanvas');
  if (!canvas) return;
  // Délégation : un seul listener sur le canvas
  // (les listeners spécifiques sont attachés ci-dessous)
  canvas.querySelectorAll('.dlx-station').forEach(el => {
    el.addEventListener('mousedown', dlxOnStationMouseDown);
    el.addEventListener('dblclick',  dlxOnStationDblClick);
  });
  canvas.querySelectorAll('.dlx-station-resize').forEach(el => {
    el.addEventListener('mousedown', dlxOnResizeMouseDown);
  });
}

function dlxOnStationMouseDown(ev) {
  // Ignorer si on a cliqué sur le bouton remove ou le handle resize
  if (ev.target.classList.contains('dlx-station-remove')) return;
  if (ev.target.classList.contains('dlx-station-resize')) return;
  if (dlxMode !== 'edit') return;
  const el = ev.currentTarget;
  const id = el.dataset.id;
  const s = dlxPlan.stations.find(x => x.id === id);
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
  const s = dlxPlan.stations.find(x => x.id === id);
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
  const s = dlxPlan.stations.find(x => x.id === _dlxDrag.id);
  if (!s) return;
  const dx = ev.clientX - _dlxDrag.startX;
  const dy = ev.clientY - _dlxDrag.startY;
  if (_dlxDrag.mode === 'move') {
    s.x = Math.max(0, _dlxDrag.origX + dx);
    s.y = Math.max(0, _dlxDrag.origY + dy);
  } else if (_dlxDrag.mode === 'resize') {
    s.w = Math.max(60, _dlxDrag.origW + dx);
    s.h = Math.max(40, _dlxDrag.origH + dy);
  }
  // Mise à jour DOM directe (évite un re-render complet à chaque pixel)
  const el = document.querySelector(`.dlx-station[data-id="${s.id}"]`);
  if (el) {
    el.style.left   = s.x + 'px';
    el.style.top    = s.y + 'px';
    el.style.width  = s.w + 'px';
    el.style.height = s.h + 'px';
  }
}

function dlxOnDragEnd() {
  if (!_dlxDrag) return;
  document.removeEventListener('mousemove', dlxOnDragMove);
  const el = document.querySelector(`.dlx-station[data-id="${_dlxDrag.id}"]`);
  if (el) el.classList.remove('dragging');
  _dlxDrag = null;
  dlxSavePlan();
}

function dlxOnStationDblClick(ev) {
  if (dlxMode !== 'edit') return;
  if (ev.target.classList.contains('dlx-station-remove')) return;
  const id = ev.currentTarget.dataset.id;
  const s = dlxPlan.stations.find(x => x.id === id);
  if (!s) return;
  const newLabel = prompt('Nom de la station :', s.label);
  if (newLabel == null) return;
  s.label = newLabel.trim() || s.label;
  dlxSavePlan();
  dlxRender();
}

// ── AJOUT / SUPPRESSION DE STATIONS ─────────────────────────────────────────
function dlxAddStation() {
  // Place la nouvelle station en haut-gauche du canvas avec une couleur par défaut
  const id = 'station-' + Date.now();
  const colors = ['#7c5cff', '#46d18f', '#e85a8a', '#f0a020', '#06b6d4', '#d946ef'];
  const color = colors[dlxPlan.stations.length % colors.length];
  dlxPlan.stations.push({
    id,
    label: 'Nouvelle station',
    x: 20, y: 20,
    w: 180, h: 80,
    color,
  });
  dlxSavePlan();
  dlxRender();
}

function dlxRemoveStation(id) {
  if (!confirm('Supprimer cette station ?')) return;
  dlxPlan.stations = dlxPlan.stations.filter(s => s.id !== id);
  dlxSavePlan();
  dlxRender();
}
