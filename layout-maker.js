// ============================================================
// LAYOUT-MAKER.JS — Assistant de création de layouts custom
// ============================================================

// ── STOCKAGE COFFRE : IndexedDB pour les images, localStorage pour la config ──
// localStorage est limité à ~5-10 MB. Les images en base64 (background, persos,
// thumbnail) saturent vite ce quota. On les déporte vers IndexedDB qui supporte
// plusieurs gigaoctets, et on garde uniquement la config légère en localStorage.
const COFFRE_DB_NAME = 'top8_coffre_v1';
const COFFRE_STORE = 'images';
const COFFRE_IMAGE_FIELDS = ['bgDataUrl', 'gameImgDataUrl', 'overlayDataUrl', 'thumbnail'];
const COFFRE_CHAR_COUNT = 3;

let _coffreDbPromise = null;
function coffreDbOpen() {
  if (_coffreDbPromise) return _coffreDbPromise;
  _coffreDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB indisponible dans ce navigateur'));
    const req = indexedDB.open(COFFRE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(COFFRE_STORE)) {
        req.result.createObjectStore(COFFRE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _coffreDbPromise;
}

function coffreIdbPut(key, value) {
  return coffreDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(COFFRE_STORE, 'readwrite');
    tx.objectStore(COFFRE_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  }));
}
function coffreIdbGet(key) {
  return coffreDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(COFFRE_STORE, 'readonly');
    const req = tx.objectStore(COFFRE_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}
function coffreIdbDelete(key) {
  return coffreDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(COFFRE_STORE, 'readwrite');
    tx.objectStore(COFFRE_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  }));
}

function coffreHasInlineImages(layout) {
  if (!layout) return false;
  for (const f of COFFRE_IMAGE_FIELDS) if (layout[f]) return true;
  if (Array.isArray(layout.charDataUrls)) {
    for (const u of layout.charDataUrls) if (u) return true;
  }
  return false;
}

// Déplace les images inline vers IndexedDB et retire les champs lourds de l'objet.
async function coffreStripImagesToIDB(layout) {
  for (const f of COFFRE_IMAGE_FIELDS) {
    if (layout[f]) {
      await coffreIdbPut(`${layout.id}:${f}`, layout[f]);
      delete layout[f];
    }
  }
  if (Array.isArray(layout.charDataUrls)) {
    for (let i = 0; i < layout.charDataUrls.length; i++) {
      if (layout.charDataUrls[i]) {
        await coffreIdbPut(`${layout.id}:char:${i}`, layout.charDataUrls[i]);
      }
    }
    delete layout.charDataUrls;
  }
}

// Récupère les images depuis IndexedDB et les ré-attache à l'objet layout.
async function coffreLoadImagesFromIDB(layout) {
  if (!layout?.id) return layout;
  for (const f of COFFRE_IMAGE_FIELDS) {
    if (!layout[f]) {
      try {
        const v = await coffreIdbGet(`${layout.id}:${f}`);
        if (v) layout[f] = v;
      } catch(e) { console.warn(`[IDB] get ${layout.id}:${f}:`, e); }
    }
  }
  if (!Array.isArray(layout.charDataUrls)) {
    layout.charDataUrls = new Array(COFFRE_CHAR_COUNT).fill(null);
  }
  for (let i = 0; i < COFFRE_CHAR_COUNT; i++) {
    if (!layout.charDataUrls[i]) {
      try {
        const v = await coffreIdbGet(`${layout.id}:char:${i}`);
        if (v) layout.charDataUrls[i] = v;
      } catch(e) { console.warn(`[IDB] get ${layout.id}:char:${i}:`, e); }
    }
  }
  return layout;
}

async function coffreDeleteLayoutImages(layoutId) {
  for (const f of COFFRE_IMAGE_FIELDS) {
    try { await coffreIdbDelete(`${layoutId}:${f}`); } catch(e) { console.warn('[IDB delete]', e); }
  }
  for (let i = 0; i < COFFRE_CHAR_COUNT; i++) {
    try { await coffreIdbDelete(`${layoutId}:char:${i}`); } catch(e) { console.warn('[IDB delete]', e); }
  }
}

// Migration : déplace toutes les images inline existantes du localStorage vers IDB.
// Appelée une fois au démarrage. Idempotente (relancer ne fait rien si déjà migré).
async function coffreMigrateExistingLayouts() {
  let coffre;
  try {
    const raw = localStorage.getItem('top8_coffre');
    if (!raw) return;
    coffre = JSON.parse(raw);
    if (!Array.isArray(coffre) || !coffre.length) return;
  } catch { return; }

  let migrated = 0, failed = 0;
  for (const layout of coffre) {
    if (!coffreHasInlineImages(layout)) continue;
    try {
      await coffreStripImagesToIDB(layout);
      migrated++;
    } catch(e) {
      console.error(`[migration] "${layout.name}" :`, e);
      failed++;
    }
  }
  if (migrated > 0) {
    try {
      localStorage.setItem('top8_coffre', JSON.stringify(coffre));
      console.log(`[coffre] ${migrated} layout(s) migré(s) vers IndexedDB ; localStorage allégé.`);
    } catch(e) {
      console.error('[migration] Réécriture localStorage échouée :', e);
    }
  }
  if (failed > 0) console.warn(`[migration] ${failed} layout(s) en échec.`);
}

// ── STATE ─────────────────────────────────────────────────────────────────────
const LM = {
  step: 1,
  gameName: 'Mon Jeu',

  // Step 1 — Image du jeu
  gameImgDataUrl: null, gameImgImg: null,
  gameImgUrl:     null,   // URL start.gg (chargé auto)
  gameImgCx:      179,    // centre X dans canvas 1400×1400
  gameImgCy:      1218,   // centre Y
  gameImgW:       131,    // demi-largeur
  gameImgH:       132,    // demi-hauteur
  gameImgZoom:    1.0,
  gameImgOffsetX: 0.5,
  gameImgOffsetY: 0.5,
  gameImgRadius:  52,
  gameImgVisible: true,

  // Step 2 — Fond
  bgDataUrl: null, bgImg: null,
  bgOffsetX: 0.5,   // 0-1 (centre horizontal)
  bgOffsetY: 0.5,   // 0-1 (centre vertical)
  bgBlur:    0,     // px
  bgDarken:  0,     // 0-1
  bgZoom:    1.0,   // multiplicateur de zoom (1 = cover normal)

  // Calque superposé (PNG frame toujours au-dessus)
  overlayDataUrl: null, overlayImg: null,

  // Polygone custom
  customPolygon: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],

  // Step 2 — Police
  font: 'Montserrat', fontWeight: '800',

  // Step 3 — Titres
  T1: { x:903, y:95,  size:46, spacing:3,   color:'#ffffff', strokeColor:'#000000', strokeWidth:0 },
  T2: { x:901, y:165, size:43, spacing:11.5, color:'#ffffff', strokeColor:'#000000', strokeWidth:0 },
  T3: { x:905, y:229, size:40, spacing:13,  color:'#ffffff', strokeColor:'#000000', strokeWidth:0 },

  // Step 4 — Forme des cartes
  shape:       'rounded',
  radius:      24,
  skew:        0,
  trapRatio:   0.75,
  strokeColor: '#7769DD',
  strokeWidth: 5,
  fillColor:   '#00000050',

  // Positions des slots
  slots: [
    { cx:905,  cy:629,  w:352, h:378, nameY:868,  nameX:900,  rankX:700, rankY:462, rankSize:64 },
    { cx:658,  cy:1124, w:295, h:350, nameY:1340, nameX:655,  rankX:494, rankY:980, rankSize:55 },
    { cx:1155, cy:1130, w:295, h:350, nameY:1340, nameX:1155, rankX:985, rankY:980, rankSize:56 },
  ],
  rankLabels: ['1ER','2ÈME','3ÈME'],
  rankColors:  ['#C87DD4','#F5C842','#F5C842'],
  rankStyle: {
    weight: '900',
    strokeColor: '#000000',
    strokeWidth: 0,
    numbersOnly: false,
  },

  // Step 5 — Personnages
  charImgs:     [null, null, null],
  charDataUrls: [null, null, null],
  charCrops:    [
    {cx:0.5,cy:0.3,zoom:2.0},
    {cx:0.5,cy:0.3,zoom:2.0},
    {cx:0.5,cy:0.3,zoom:2.0},
  ],
  cropEditIdx: null,

  // Step 6 — Noms
  playerNames: ['','',''],
  nameColors:  ['#ffffff','#ffffff','#ffffff'],
  nameStyle: {
    size:44, weight:'800', color:'#ffffff',
    strokeColor:'#000000', strokeWidth:0,
    spacing:4,
  },

  // Step 8
  thumbnail: null,
};

// ── POLICES DISPONIBLES ───────────────────────────────────────────────────────
const LM_FONTS = [
  { id:'Montserrat',          label:'Montserrat',         sample:'TOURNAMENT' },
  { id:'Anton',               label:'Anton',              sample:'TOURNAMENT' },
  { id:"'Bebas Neue'",        label:'Bebas Neue',         sample:'TOURNAMENT' },
  { id:"'Barlow Condensed'",  label:'Barlow Condensed',   sample:'TOURNAMENT' },
  { id:'Oswald',              label:'Oswald',             sample:'TOURNAMENT' },
  { id:'Rajdhani',            label:'Rajdhani',           sample:'TOURNAMENT' },
  { id:"'Russo One'",         label:'Russo One',          sample:'TOURNAMENT' },
  { id:"'Squada One'",        label:'Squada One',         sample:'TOURNAMENT' },
  { id:'Orbitron',            label:'Orbitron',           sample:'TOURN.' },
  { id:"'Press Start 2P'",    label:'Press Start 2P',     sample:'TOP 8' },
  { id:"'Permanent Marker'",  label:'Permanent Marker',   sample:'TOP 8' },
  { id:"'Exo 2'",             label:'Exo 2',              sample:'TOURNAMENT' },
  { id:'Teko',                label:'Teko',               sample:'TOURNAMENT' },
  { id:"'Chakra Petch'",      label:'Chakra Petch',       sample:'TOURNAMENT' },
  { id:"'Black Han Sans'",    label:'Black Han Sans',     sample:'TOURNAMENT' },
];

// ── FORMES DISPONIBLES ────────────────────────────────────────────────────────
const LM_SHAPES = [
  { id:'rounded',       label:'Arrondi',         icon:'⬜', desc:'Coins doux' },
  { id:'square',        label:'Rectangle',        icon:'▪️', desc:'Angles droits' },
  { id:'parallelogram', label:'Parallélogramme',  icon:'▱',  desc:'Penché à droite' },
  { id:'parallelogram_l',label:'Parallélogramme ←',icon:'◁', desc:'Penché à gauche' },
  { id:'diamond',       label:'Losange',          icon:'◇',  desc:'Tournéeà 45°' },
  { id:'trapezoid',     label:'Trapèze',          icon:'⏢',  desc:'Plus large en bas' },
  { id:'trapezoid_inv', label:'Trapèze inv.',     icon:'⏣',  desc:'Plus large en haut' },
  { id:'pentagon',      label:'Pentagone',        icon:'⬠',  desc:'5 côtés' },
  { id:'arch',          label:'Arche',            icon:'⌒',  desc:'Haut arrondi' },
  { id:'hexagon',       label:'Hexagone',         icon:'⬡',  desc:'6 côtés' },
  { id:'custom_polygon', label:'Polygone custom',  icon:'✏️', desc:'Forme libre' },
];

// ── OVERLAY PAR DÉFAUT ────────────────────────────────────────────────────────
// overlay-default.png est chargé une seule fois au démarrage
const LM_DEFAULT_OVERLAY = new Image();
LM_DEFAULT_OVERLAY._loaded = false;
LM_DEFAULT_OVERLAY.onload  = () => { LM_DEFAULT_OVERLAY._loaded = true; };
LM_DEFAULT_OVERLAY.onerror = () => { LM_DEFAULT_OVERLAY._loaded = false; };
LM_DEFAULT_OVERLAY.src = 'overlay-default.png';

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function openLayoutMaker(gameName, gameImgUrl) {
  LM.gameName = gameName || 'Mon Jeu';
  // Reset complet du state pour garantir un démarrage propre sur step 1,
  // même si on a fermé le LM en plein milieu d'une transition (auquel
  // cas _isTransitioning resterait stuck à true et bloquerait lmGoTo).
  LM.step = 1;
  LM.maxStep = 1;
  LM._isTransitioning = false;
  // Installe (une fois) un capteur de dernière position de clic — utilisé
  // par la transition "Onde" pour partir du point où l'utilisateur a cliqué
  // (chiffre, bouton Suivant/Précédent…).
  if (!LM._clickHookInstalled) {
    document.addEventListener('pointerdown', e => {
      LM._lastClick = { x: e.clientX, y: e.clientY };
    }, true);
    LM._clickHookInstalled = true;
  }
  // Installe (une fois) le système pan/zoom sur la preview canvas.
  if (!LM._panZoomInstalled) {
    lmInstallPreviewPanZoom();
    LM._panZoomInstalled = true;
  }
  const input = document.getElementById('lmGameNameInput');
  if (input) input.value = LM.gameName;
  // Charger l'image du jeu depuis start.gg si URL fournie
  if (gameImgUrl && gameImgUrl !== LM.gameImgUrl) {
    LM.gameImgUrl = gameImgUrl;
    LM.gameImgImg = null;
    LM.gameImgDataUrl = null;
    lmLoadGameImgFromUrl(gameImgUrl);
  }
  lmGoTo(1);
  document.getElementById('lmModal').style.display = 'flex';
  // Réinitialise le zoom/pan de la preview (sinon un zoom résiduel d'une
  // session précédente reste appliqué et l'aperçu paraît "trop zoomé"/rogné).
  if (typeof lmResetPreviewZoom === 'function') lmResetPreviewZoom();
  lmRenderPreview();
  // Préchauffage : on force plusieurs re-renders consécutifs sur les
  // prochaines frames pour s'assurer que le canvas est COMPLÈTEMENT
  // dessiné avant la 1ère transition (sinon flash noir au premier clic
  // car certaines images du LM se chargent encore en async).
  requestAnimationFrame(() => {
    lmRenderPreview();
    requestAnimationFrame(() => lmRenderPreview());
  });
  setTimeout(lmRenderPreview, 200);
  setTimeout(lmRenderPreview, 600);
}

// ── PAN/ZOOM SUR LA PREVIEW CANVAS ─────────────────────────────────────────
// Permet de zoomer/dézoomer (wheel) et déplacer (drag) la preview pour
// inspecter les détails. Le transform CSS s'applique au canvas, le bitmap
// n'est PAS re-rendu (pas de perte de qualité, mais pas de re-render à
// haute résolution non plus — le scale CSS bave un peu en grand zoom).
function lmInstallPreviewPanZoom(){
  const wrap = document.querySelector('.lm-canvas-wrap');
  const canvas = document.getElementById('lmPreviewCanvas');
  if (!wrap || !canvas) {
    console.warn('[lm-panzoom] wrap or canvas not found, retrying in 200ms');
    setTimeout(lmInstallPreviewPanZoom, 200);
    return;
  }
  // Idempotent : si déjà installé sur cet élément, on ne re-attache pas
  if (wrap._panZoomReady) return;
  wrap._panZoomReady = true;
  console.log('[lm-panzoom] installé');

  // État
  let zoom = 1;
  let panX = 0, panY = 0;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;

  // Indicateur de zoom (cliquer dessus pour reset)
  const indicator = document.createElement('div');
  indicator.className = 'lm-canvas-zoom-indicator';
  indicator.textContent = '100%';
  indicator.title = 'Cliquer pour réinitialiser le zoom';
  indicator.addEventListener('click', e => { e.stopPropagation(); reset(); });
  wrap.appendChild(indicator);

  function applyTransform(){
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    indicator.textContent = Math.round(zoom * 100) + '%';
    indicator.classList.toggle('lm-zoom-visible', zoom > 1.01 || Math.abs(panX) > 1 || Math.abs(panY) > 1);
  }

  function reset(){
    zoom = 1; panX = 0; panY = 0;
    applyTransform();
  }

  // Clamp pan pour éviter de partir trop loin (l'image doit rester
  // partiellement visible dans le wrap).
  function clampPan(){
    const wr = wrap.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect(); // déjà transformée
    // Marge de tolérance : on autorise jusqu'à 60% du canvas hors-écran
    const maxOff = 0.7;
    const maxX = cr.width * maxOff;
    const maxY = cr.height * maxOff;
    panX = Math.max(wr.width - cr.width + (wr.width - cr.width < 0 ? 0 : 0) - maxX, Math.min(maxX, panX));
    panY = Math.max(wr.height - cr.height + (wr.height - cr.height < 0 ? 0 : 0) - maxY, Math.min(maxY, panY));
  }

  // ── WHEEL ZOOM ────────────────────────────────────────────────────────
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    // Position de la souris dans le wrap
    const r = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    // Zoom factor (proportionnel au scroll)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    // Zoom centré sur le pointeur : on ajuste le pan pour que le point
    // sous la souris reste fixe après le zoom.
    const scaleChange = newZoom / zoom;
    panX = mx - (mx - panX) * scaleChange;
    panY = my - (my - panY) * scaleChange;
    zoom = newZoom;
    // Si zoom 1, reset pan pour recadrer parfaitement
    if (zoom <= MIN_ZOOM + 0.001) { panX = 0; panY = 0; }
    applyTransform();
  }, { passive: false });

  // ── DRAG PAN ──────────────────────────────────────────────────────────
  let dragging = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  wrap.addEventListener('pointerdown', e => {
    // Ignore clicks sur l'indicateur (pour qu'il reste cliquable)
    if (e.target === indicator) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startPanX = panX; startPanY = panY;
    wrap.classList.add('lm-canvas-panning');
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', e => {
    if (!dragging) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform();
  });
  function endDrag(e){
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('lm-canvas-panning');
    try { wrap.releasePointerCapture(e.pointerId); } catch{}
  }
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
  wrap.addEventListener('pointerleave', endDrag);

  // ── DOUBLE-CLICK = RESET ──────────────────────────────────────────────
  wrap.addEventListener('dblclick', e => {
    if (e.target === indicator) return;
    reset();
  });

  // Expose reset pour permettre un reset programmatique (ex: changement step)
  window.lmResetPreviewZoom = reset;
}

// Install au boot pour ne pas dépendre de l'ouverture du LM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', lmInstallPreviewPanZoom);
} else {
  lmInstallPreviewPanZoom();
}

function closeLayoutMaker() {
  document.getElementById('lmModal').style.display = 'none';
  // Réinitialiser le mode édition si on ferme sans sauvegarder
  LM._editIdx = undefined;
  LM._editId  = undefined;
  // Reset guard de transition au cas où on aurait fermé en plein milieu
  // d'une transition — sinon la prochaine ouverture serait bloquée.
  LM._isTransitioning = false;
}

// Vérifie qu'un snapshot full-body n'est pas corrompu (canvas tout noir
// ou tout transparent → image broken/non chargée). On sample quelques
// pixels d'un <img> du snapshot (qui remplace le canvas via toDataURL).
// Si toutes les valeurs sont 0 (noir/transparent), on rejette.
function _validateBodySnap(snap) {
  if (!snap) return false;
  const img = snap.querySelector('img');
  if (!img || !img.src || !img.src.startsWith('data:')) return true; // pas de canvas → OK
  // Quick check : data URL de canvas vide PNG ~commencement très court
  // (genre 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...') et
  // se termine vite. Un PNG noir 500x500 fait > 500 chars.
  // Heuristique : si la data URL fait moins de 200 chars → suspect (canvas
  // 1x1 ou vide). Accepte tout le reste.
  return img.src.length > 200;
}

function lmGoTo(step) {
  // Garde-fou : ignore les clics si une transition est déjà en cours.
  // Évite les races (stages empilés, visibility:hidden restoré pendant
  // une 2e tx, etc.) — même logique que le proto Claude Design.
  if (LM._isTransitioning) return;

  const prevStep = LM.step;
  const targetStep = Math.max(1, Math.min(9, step));

  // Snapshot du panel sortant AVANT de toucher au DOM, pour le passer
  // à la transition oniriques (cf. lm-transitions.js). On ne joue la
  // transition que si on change réellement d'étape (pas à l'ouverture).
  // IMPORTANT : on utilise l'INDEX DOM (i+1 === step) et non l'attribut
  // data-step, car le HTML a des data-step buggés (doublon "2" sur les
  // panels FOND et POLICE → décalage de tous les suivants). L'index DOM
  // est la source de vérité — c'est lui qui est utilisé par classList.toggle.
  const allPanels   = document.querySelectorAll('.lm-step-panel');
  const fromPanel   = (prevStep && prevStep !== targetStep)
    ? allPanels[prevStep - 1]
    : null;
  const toPanel     = allPanels[targetStep - 1];
  // Host de transition = parent direct des panels (.lm-controls). C'est
  // l'approche du proto Claude Design : stage compact ancré sur la bbox
  // du panel, où snapshots ET effets décoratifs s'inscrivent dans la
  // même zone. Étendre le stage au viewport casse l'alignement des
  // effets calés sur le centre du stage (Iris, Onde, Liquide, etc.).
  const panelHost   = fromPanel?.parentElement || toPanel?.parentElement;
  const playTx      = !!(fromPanel && toPanel && typeof window.lmPlayTransition === 'function');

  LM.step = targetStep;
  // Mémoriser le step max atteint pour garder visibles les étapes déjà visitées
  LM.maxStep = Math.max(LM.maxStep || 1, LM.step);

  // Progress dots — toutes les étapes déjà visitées (sauf l'active) restent "done"
  document.querySelectorAll('.lm-dot').forEach((dot, i) => {
    const stepIdx = i + 1;
    dot.classList.toggle('lm-dot-active', stepIdx === LM.step);
    dot.classList.toggle('lm-dot-done',   stepIdx !== LM.step && stepIdx <= LM.maxStep);
  });

  // Snapshot du panel sortant AVANT qu'il ne perde sa classe active
  // (le clone garde son contenu DOM tel quel ; lmPlayTransition force
  // display:block dessus pour le réafficher en overlay).
  const fromSnap = playTx ? fromPanel.cloneNode(true) : null;

  // Masque IMMÉDIATEMENT tous les panels pour éviter le flash où le
  // nouveau panel apparaît brièvement (entre le toggle de class et
  // l'append du stage par lmPlayTransition). lmPlayTransition les
  // restaurera à la fin via son cleanup setTimeout.
  if (playTx) {
    allPanels.forEach(p => { p.style.visibility = 'hidden'; });
  }

  // Transitions "bloc unifié" — snapshot du modal-body entier (panel
  // + preview canvas inline-é via toDataURL) pour swipe/fade-blur
  // synchrone des deux colonnes.
  //   1=Rêverie (fade-blur), 2=Aurore (swipe →), 4=Bulles (swipe ↑),
  //   6=Iris (fade-blur "éclosion"), 8=Pli (rotation 3D)
  const FULL_BODY_TX_STEPS = new Set([1, 2, 4, 6, 8]);
  const useFullBody = playTx && FULL_BODY_TX_STEPS.has(targetStep);
  const fromBodySnap = (useFullBody && typeof lmSnapshotModalBody === 'function')
    ? lmSnapshotModalBody() : null;

  // Panels
  allPanels.forEach((el, i) => {
    const active = i + 1 === LM.step;
    el.classList.toggle('lm-step-active', active);
  });

  // Step title
  const titles = [
    '🎮 Image du jeu',
    '🖼️ Fond du layout',
    '🔤 Police de caractère',
    '✏️ Titres & sous-titres',
    '🎴 Forme des cartes',
    '👤 Images des personnages',
    '💬 Noms des joueurs',
    '🏅 Classements & rangs',
    '🎉 Finaliser & sauvegarder',
  ];
  const el = document.getElementById('lmStepTitle');
  if (el) el.textContent = `Étape ${LM.step}/9 — ${titles[LM.step-1]}`;

  // Nav buttons
  const prev = document.getElementById('lmPrevBtn');
  const next = document.getElementById('lmNextBtn');
  if (prev) prev.disabled = LM.step === 1;
  if (next) {
    next.textContent = LM.step === 9
      ? (LM._editId ? '💾 Mettre à jour le layout' : '🎉 Sauvegarder dans le coffre')
      : 'Suivant →';
    next.classList.toggle('lm-btn-finish', LM.step === 9);
  }

  // (Mini dots in footer retirés — redondants avec les icônes du header)

  // Step inits — IMPORTANT : doivent tourner AVANT le snapshot du toPanel
  // par lmPlayTransition, sinon le clone serait vide (sliders non set,
  // grilles de polices non rendues, etc.).
  if (LM.step === 1) lmInitGameImg();
  if (LM.step === 2) lmInitBgStep();
  if (LM.step === 3) lmInitFonts();
  if (LM.step === 4) lmInitTitles();
  if (LM.step === 5) lmInitShapes();
  if (LM.step === 6) lmInitChars();
  if (LM.step === 7) lmInitNames();
  if (LM.step === 8) lmInitRanks();
  if (LM.step === 9) lmFinalStep();

  // Maintenant que le toPanel est peuplé, on lance la transition oniriques.
  // Le fromSnap a été cloné plus haut (avant le retrait de lm-step-active).
  if (playTx) {
    let origin = null;
    if (LM._lastClick) {
      const r = toPanel.getBoundingClientRect();
      origin = {
        x: Math.max(2, Math.min(98, ((LM._lastClick.x - r.left) / r.width) * 100)),
        y: Math.max(2, Math.min(98, ((LM._lastClick.y - r.top)  / r.height) * 100)),
      };
    }
    // Chaque step a SA transition (1=Rêverie … 9=Onde). L'index dans
    // LM_TRANSITIONS suit l'ordre des steps. Override possible via
    // LM.transitionId (force une transition spécifique partout).
    const txId = (window.LM_TRANSITIONS && window.LM_TRANSITIONS[targetStep - 1]?.id) || null;

    // Pour Aurore/Bulles/Rêverie (full-body), on snapshote aussi le
    // modal-body APRÈS le switch. Validation rigoureuse pour éviter le
    // clignotement noir intermittent : on vérifie que le snapshot du
    // canvas n'est pas vide (couleur dominante noire = canvas non rendu).
    // Si le check fail, on fallback au mode panel-only (pas de full-body
    // swipe mais pas de flash noir non plus).
    let fullBodySnaps = null;
    if (useFullBody && fromBodySnap && typeof lmSnapshotModalBody === 'function') {
      if (typeof lmRenderPreview === 'function') lmRenderPreview();
      const toBodySnap = lmSnapshotModalBody();
      // Sanity check : si le snapshot du canvas est tout noir/vide (rendu
      // asynchrone pas terminé), on n'utilise pas le full-body — sinon
      // flash noir visible pendant l'anim. On vérifie aussi fromBodySnap.
      const fromOk = _validateBodySnap(fromBodySnap);
      const toOk   = _validateBodySnap(toBodySnap);
      if (toBodySnap && fromOk && toOk) fullBodySnaps = [fromBodySnap, toBodySnap];
    }

    // Reset bulletproof : try/catch pour les throws sync de lmPlayTransition,
    // .finally pour la Promise, ET un timeout safety net (3s) au cas où
    // tout fail. Sinon un guard stuck bloque toutes les nav suivantes.
    LM._isTransitioning = true;
    const _safetyReset = setTimeout(() => { LM._isTransitioning = false; }, 3000);
    try {
      const _p = window.lmPlayTransition(panelHost, fromPanel, toPanel, {
        origin, fromSnap, id: txId, fullBodySnaps,
        // Cleanup pré-restore :
        // 1) Force re-render du canvas pour éviter un flash noir
        // 2) Re-déclenche l'animation fade-in CSS sur le panel actif
        //    pour qu'elle joue APRÈS la transition (visible) plutôt que
        //    pendant (cachée par visibility:hidden). Démarre d'opacity .5
        //    (pas 0) pour un fade subtil sans saut brutal après le
        //    snapshot qui finit à opacity 1.
        onBeforeRestore: () => {
          if (typeof lmRenderPreview === 'function') lmRenderPreview();
          const activePanel = document.querySelector('.lm-step-panel.lm-step-active');
          if (activePanel) {
            // Hack force-reflow pour relancer l'animation CSS
            activePanel.style.animation = 'none';
            void activePanel.offsetWidth;
            activePanel.style.animation = '';
          }
        },
      });
      if (_p && typeof _p.finally === 'function') {
        _p.finally(() => {
          clearTimeout(_safetyReset);
          LM._isTransitioning = false;
        });
      } else {
        clearTimeout(_safetyReset);
        LM._isTransitioning = false;
      }
    } catch (e) {
      console.error('[lm] transition failed:', e);
      clearTimeout(_safetyReset);
      LM._isTransitioning = false;
    }
  }

  lmRenderPreview();
}

function lmNext() {
  if (LM.step === 9) lmFinishAndSave();
  else lmGoTo(LM.step + 1);
}
function lmPrev() { lmGoTo(LM.step - 1); }

// ── STEP 1 — IMAGE DU JEU ─────────────────────────────────────────────────────
function lmInitGameImg() {
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('lmGICx',      LM.gameImgCx);
  setV('lmGICy',      LM.gameImgCy);
  setV('lmGIW',       LM.gameImgW);
  setV('lmGIH',       LM.gameImgH);
  setV('lmGIZoom',    Math.round(LM.gameImgZoom    * 100));
  setV('lmGIPanX',    Math.round(LM.gameImgOffsetX * 100));
  setV('lmGIPanY',    Math.round(LM.gameImgOffsetY * 100));
  setV('lmGIRadius',  LM.gameImgRadius);
  // Sync adjacent number inputs
  ['lmGICx','lmGICy','lmGIW','lmGIH','lmGIZoom','lmGIPanX','lmGIPanY','lmGIRadius'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const num = el.nextElementSibling; if (num?.type === 'number') num.value = el.value; }
  });
  // Toggle checkbox
  const cb = document.getElementById('lmGIVisible');
  if (cb) cb.checked = LM.gameImgVisible;
  // Status label
  lmUpdateGameImgStatus();
}

function lmSyncGameImg() {
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  LM.gameImgCx      = syncRange('lmGICx');
  LM.gameImgCy      = syncRange('lmGICy');
  LM.gameImgW       = syncRange('lmGIW');
  LM.gameImgH       = syncRange('lmGIH');
  LM.gameImgZoom    = syncRange('lmGIZoom')  / 100;
  LM.gameImgOffsetX = syncRange('lmGIPanX') / 100;
  LM.gameImgOffsetY = syncRange('lmGIPanY') / 100;
  LM.gameImgRadius  = syncRange('lmGIRadius');
  lmRenderPreview();
}

function lmToggleGameImgVisible(cb) {
  LM.gameImgVisible = cb.checked;
  lmRenderPreview();
}

function lmUpdateGameImgStatus() {
  const statusEl = document.getElementById('lmGIStatus');
  if (!statusEl) return;
  if (LM.gameImgImg) {
    statusEl.textContent = LM.gameImgDataUrl ? '✅ Image personnalisée chargée' : '✅ Image start.gg chargée';
    statusEl.style.color = '#7ecb7e';
  } else if (LM.gameImgUrl) {
    statusEl.textContent = '⏳ Chargement…';
    statusEl.style.color = '#c8b8ff';
  } else {
    statusEl.textContent = '📂 Aucune image — charge depuis start.gg ou importe la tienne';
    statusEl.style.color = '#9b7fb8';
  }
}

function lmLoadGameImgFromUrl(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    LM.gameImgImg = img;
    lmUpdateGameImgStatus();
    lmRenderPreview();
  };
  img.onerror = () => {
    // CORS bloqué → essai sans crossOrigin (pas exportable mais visible)
    const img2 = new Image();
    img2.onload = () => {
      LM.gameImgImg = img2;
      lmUpdateGameImgStatus();
      lmRenderPreview();
    };
    img2.onerror = () => { lmUpdateGameImgStatus(); };
    img2.src = url;
  };
  img.src = url;
}

function lmLoadGameImg(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    LM.gameImgDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      LM.gameImgImg = img;
      lmUpdateGameImgStatus();
      lmRenderPreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── STEP 2 — FOND ─────────────────────────────────────────────────────────────
function lmInitBgStep() {
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('lmBgPanX',   Math.round(LM.bgOffsetX * 100));
  setV('lmBgPanY',   Math.round(LM.bgOffsetY * 100));
  setV('lmBgBlur',   LM.bgBlur);
  setV('lmBgDarken', Math.round(LM.bgDarken * 100));
  setV('lmBgZoom',   Math.round(LM.bgZoom   * 100));
  // Sync number inputs
  ['lmBgPanX','lmBgPanY','lmBgBlur','lmBgDarken','lmBgZoom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const num = el.nextElementSibling; if (num?.type === 'number') num.value = el.value; }
  });
  // Restore overlay thumb if already loaded
  if (LM.overlayImg) {
    const t = document.getElementById('lmOverlayThumb');
    if (t) { t.src = LM.overlayDataUrl; t.style.display = 'block'; }
    const h = document.getElementById('lmOverlayHint'); if (h) h.style.display = 'none';
    const ok = document.getElementById('lmOverlayOk'); if (ok) ok.style.display = 'flex';
  }
}

function lmSyncBg() {
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  LM.bgOffsetX = syncRange('lmBgPanX')   / 100;
  LM.bgOffsetY = syncRange('lmBgPanY')   / 100;
  LM.bgBlur    = syncRange('lmBgBlur');
  LM.bgDarken  = syncRange('lmBgDarken') / 100;
  LM.bgZoom    = syncRange('lmBgZoom')   / 100;
  lmRenderPreview();
}

function lmLoadBg(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    LM.bgDataUrl = ev.target.result;
    const img = new Image();
    img.onload = () => {
      LM.bgImg = img;
      const thumb = document.getElementById('lmBgThumb');
      if (thumb) { thumb.src = LM.bgDataUrl; thumb.style.display = 'block'; }
      const dropHint = document.getElementById('lmBgDropHint');
      if (dropHint) dropHint.style.display = 'none';
      const bgOk = document.getElementById('lmBgOk');
      if (bgOk) bgOk.style.display = 'flex';
      const quickLabel = document.getElementById('lmBgQuickLabel');
      if (quickLabel) quickLabel.textContent = file.name;
      lmRenderPreview();
    };
    img.src = LM.bgDataUrl;
  };
  reader.readAsDataURL(file);
}

function lmLoadOverlay(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    LM.overlayDataUrl = ev.target.result;
    const img = new Image();
    img.onload = () => {
      LM.overlayImg = img;
      const thumb = document.getElementById('lmOverlayThumb');
      if (thumb) { thumb.src = LM.overlayDataUrl; thumb.style.display = 'block'; }
      const hint = document.getElementById('lmOverlayHint'); if (hint) hint.style.display = 'none';
      const ok   = document.getElementById('lmOverlayOk');   if (ok)   ok.style.display   = 'flex';
      lmRenderPreview();
    };
    img.src = LM.overlayDataUrl;
  };
  reader.readAsDataURL(file);
}

function lmRemoveOverlay() {
  LM.overlayDataUrl = null; LM.overlayImg = null;
  const thumb = document.getElementById('lmOverlayThumb'); if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
  const hint = document.getElementById('lmOverlayHint'); if (hint) hint.style.display = 'block';
  const ok   = document.getElementById('lmOverlayOk');   if (ok)   ok.style.display   = 'none';
  lmRenderPreview();
}

// ── STEP 2 — POLICE ────────────────────────────────────────────────────────────
function lmInitFonts() {
  const grid = document.getElementById('lmFontGrid');
  if (!grid || grid.dataset.ready) return;
  grid.dataset.ready = '1';
  grid.innerHTML = LM_FONTS.map(f => `
    <button class="lm-font-btn${LM.font === f.id ? ' lm-selected' : ''}"
            style="font-family:${f.id};font-weight:800;"
            onclick="lmSelectFont('${f.id.replace(/'/g,"\\'")}','${f.label}')">
      <span class="lm-font-sample">${f.sample}</span>
      <span class="lm-font-name">${f.label}</span>
    </button>
  `).join('');
}

function lmSelectFont(fontId) {
  LM.font = fontId;
  document.querySelectorAll('.lm-font-btn').forEach(b => {
    const fam = b.style.fontFamily;
    const match = fam === fontId || fam.includes(fontId.replace(/'/g,''));
    b.classList.toggle('lm-selected', match);
  });
  lmRenderPreview();
}

function lmSetFontWeight(w) {
  LM.fontWeight = w;
  document.querySelectorAll('.lm-weight-btn').forEach(b =>
    b.classList.toggle('lm-selected', b.dataset.w === w));
  lmRenderPreview();
}

// ── STEP 3 — TITRES ────────────────────────────────────────────────────────────
function lmInitTitles() {
  ['T1','T2','T3'].forEach(t => {
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const cfg = LM[t];
    setV(`lm${t}x`,    cfg.x);
    setV(`lm${t}y`,    cfg.y);
    setV(`lm${t}size`, cfg.size);
    setV(`lm${t}sp`,   cfg.spacing);
    setV(`lm${t}col`,  cfg.color);
    setV(`lm${t}sc`,   cfg.strokeColor);
    setV(`lm${t}sw`,   cfg.strokeWidth);
  });
}

function lmSyncTitle(t) {
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return null;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value);
  };
  const g = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const cfg = LM[t];
  cfg.x           = syncRange(`lm${t}x`)    ?? cfg.x;
  cfg.y           = syncRange(`lm${t}y`)    ?? cfg.y;
  cfg.size        = syncRange(`lm${t}size`) ?? cfg.size;
  cfg.spacing     = syncRange(`lm${t}sp`)   ?? 0;
  cfg.color       = g(`lm${t}col`)           || '#ffffff';
  cfg.strokeColor = g(`lm${t}sc`)            || '#000000';
  cfg.strokeWidth = syncRange(`lm${t}sw`)   ?? 0;
  lmRenderPreview();
}

// ── STEP 4 — FORME ─────────────────────────────────────────────────────────────
function lmInitShapes() {
  lmInitSlotPositions();
  const grid = document.getElementById('lmShapeGrid');
  if (!grid || grid.dataset.ready) return;
  grid.dataset.ready = '1';
  grid.innerHTML = LM_SHAPES.map(s => `
    <button class="lm-shape-btn${s.id === LM.shape ? ' lm-selected' : ''}"
            onclick="lmSelectShape('${s.id}')">
      <span class="lm-shape-icon">${s.icon}</span>
      <span class="lm-shape-label">${s.label}</span>
      <span class="lm-shape-desc">${s.desc}</span>
    </button>
  `).join('');
  lmAppendPolyShapes(grid);
  lmShowShapeControls();
}

function lmAppendPolyShapes(grid) {
  if (!grid) grid = document.getElementById('lmShapeGrid');
  if (!grid) return;
  const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
  // Remove old poly buttons
  grid.querySelectorAll('.lm-shape-btn-poly').forEach(b => b.remove());
  if (!shapes.length) return;
  // Divider
  const div = document.createElement('div');
  div.className = 'lm-poly-divider lm-shape-btn-poly';
  div.textContent = '— Mes formes —';
  grid.appendChild(div);
  shapes.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'lm-shape-btn lm-shape-btn-poly' + (LM.shape === 'custom_polygon' ? '' : '');
    btn.setAttribute('onclick', `lmSelectShape('${s.id}')`);
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 1 1" style="overflow:visible;display:block;margin:0 auto 2px;">
        <polygon points="${s.points.map(p=>`${p.x},${p.y}`).join(' ')}"
          fill="rgba(119,105,221,0.35)" stroke="#9b7fe8" stroke-width="0.06"/>
      </svg>
      <span class="lm-shape-label" style="font-size:9px;">${s.name}</span>
    `;
    grid.appendChild(btn);
  });
}

function lmSelectShape(id) {
  // Open the polygon editor
  if (id === 'custom_polygon') {
    lmOpenPolyEditor();
    return;
  }
  // Apply a saved polygon shape by ID
  if (id.startsWith('poly_')) {
    const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
    const s = shapes.find(sh => sh.id === id);
    if (s) {
      LM.customPolygon = s.points.map(p => ({...p}));
      LM.shape = 'custom_polygon';
      lmHighlightShapeBtn(id);
      lmShowShapeControls();
      lmRenderPreview();
    }
    return;
  }

  LM.shape = id;
  if (id === 'parallelogram_l') {
    LM.shape = 'parallelogram';
    LM.skew = -Math.abs(LM.skew || 30);
  } else if (id === 'parallelogram') {
    LM.skew = Math.abs(LM.skew || 30);
  } else if (id === 'trapezoid_inv') {
    LM.shape = 'trapezoid';
    LM.trapRatio = LM.trapRatio > 1 ? LM.trapRatio : 1.3;
  }
  lmHighlightShapeBtn(id);
  lmShowShapeControls();
  lmRenderPreview();
}

function lmHighlightShapeBtn(id) {
  document.querySelectorAll('.lm-shape-btn').forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    b.classList.toggle('lm-selected', onclick.includes(`'${id}'`));
  });
}

function lmShowShapeControls() {
  const show = (id, vis) => {
    const el = document.getElementById(id);
    if (el) el.style.display = vis ? 'flex' : 'none';
  };
  show('lmCtrlRadius',   ['rounded','arch'].includes(LM.shape));
  show('lmCtrlSkew',     LM.shape === 'parallelogram');
  show('lmCtrlTrap',     LM.shape === 'trapezoid');
}

function lmInitSlotPositions() {
  [0,1,2].forEach(i => {
    const s = LM.slots[i];
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV(`lmSlotCx${i}`, s.cx);
    setV(`lmSlotCy${i}`, s.cy);
    setV(`lmSlotW${i}`,  s.w);
    setV(`lmSlotH${i}`,  s.h);
    setV(`lmSlotNameY${i}`, s.nameY);
    setV(`lmSlotRankX${i}`, s.rankX);
    setV(`lmSlotRankY${i}`, s.rankY);
    setV(`lmSlotRankS${i}`, s.rankSize);
  });
}

function lmSyncSlot(i) {
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  const s = LM.slots[i];
  s.cx       = syncRange(`lmSlotCx${i}`);
  s.cy       = syncRange(`lmSlotCy${i}`);
  s.w        = syncRange(`lmSlotW${i}`);
  s.h        = syncRange(`lmSlotH${i}`);
  s.nameY    = syncRange(`lmSlotNameY${i}`);
  s.rankX    = syncRange(`lmSlotRankX${i}`);
  s.rankY    = syncRange(`lmSlotRankY${i}`);
  s.rankSize = syncRange(`lmSlotRankS${i}`);
  lmRenderPreview();
}

function lmSyncShape() {
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  const getStr = id => { const el = document.getElementById(id); return el ? el.value : null; };
  LM.radius    = syncRange('lmRadius');
  LM.skew      = syncRange('lmSkew');
  LM.trapRatio = syncRange('lmTrapRatio') / 100;
  LM.strokeColor = getStr('lmShapeStrokeColor') || '#7769DD';
  LM.strokeWidth = syncRange('lmShapeStrokeWidth');
  LM.fillColor   = getStr('lmShapeFillColor') || 'transparent';
  lmRenderPreview();
}

// ── STEP 5 — PERSONNAGES ────────────────────────────────────────────────────────
function lmInitChars() {
  [0,1,2].forEach(i => {
    const thumb = document.getElementById(`lmCharThumb${i}`);
    if (thumb && LM.charImgs[i]) {
      thumb.src = LM.charDataUrls[i];
      thumb.style.display = 'block';
      document.getElementById(`lmCharHint${i}`).style.display = 'none';
    }
  });
}

// Auto-importe les images de personnages depuis les données start.gg déjà
// chargées (global `players`). Pour chaque joueur du Top, on résout son
// personnage (players[i].charId) en image d'art via getMuralArtUrl() et on
// la place dans le slot correspondant.
function lmAutoImportChars() {
  const statusEl = document.getElementById('lmAutoImportStatus');
  const setStatus = (msg, ok = true) => {
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#3a9d6a' : '#c0392b';
  };

  if (typeof players === 'undefined' || !Array.isArray(players) || !players.length) {
    setStatus('❌ Aucun Top start.gg chargé — importe d\'abord un tournoi.', false);
    return;
  }

  let attempted = 0, loaded = 0, pending = 0;
  const finish = () => {
    if (pending === 0) {
      setStatus(loaded > 0
        ? `✅ ${loaded} personnage(s) importé(s) depuis start.gg.`
        : 'ℹ️ Aucune image de personnage trouvée. Vérifie que les persos sont bien reportés sur start.gg, puis ré-importe le tournoi.', loaded > 0);
    }
  };

  // On ne traite que les 3 premiers slots (le layout a 3 emplacements).
  players.slice(0, 3).forEach((p, i) => {
    if (!p) return;
    // 1) Art local haute-qualité via le roster interne (jeux supportés).
    // 2) Fallback : image hébergée par start.gg (jeux custom / persos non mappés).
    let url = (p.charId && typeof getMuralArtUrl === 'function')
      ? getMuralArtUrl(p.charId, p.costume || 1) : null;
    if (!url && p.charImgUrl) url = p.charImgUrl;
    if (!url) return;
    attempted++; pending++;
    const apply = (img) => {
      LM.charImgs[i] = img;
      LM.charDataUrls[i] = null; // image distante/locale, pas un dataURL
      const thumb = document.getElementById(`lmCharThumb${i}`);
      if (thumb) { thumb.src = url; thumb.style.display = 'block'; }
      const hint = document.getElementById(`lmCharHint${i}`);
      if (hint) hint.style.display = 'none';
      loaded++;
      lmRenderPreview();
      pending--; finish();
    };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => apply(img);
    img.onerror = () => {
      // Retry sans crossOrigin (visible mais non exportable si CORS bloque)
      const img2 = new Image();
      img2.onload  = () => apply(img2);
      img2.onerror = () => { pending--; finish(); };
      img2.src = url;
    };
    img.src = url;
  });

  if (attempted === 0) {
    setStatus('ℹ️ Aucun personnage à importer (pas de perso associé aux joueurs).', false);
  }
}

function lmLoadChar(event, idx) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    LM.charDataUrls[idx] = ev.target.result;
    const img = new Image();
    img.onload = () => {
      LM.charImgs[idx] = img;
      const thumb = document.getElementById(`lmCharThumb${idx}`);
      if (thumb) { thumb.src = ev.target.result; thumb.style.display = 'block'; }
      const hint = document.getElementById(`lmCharHint${idx}`);
      if (hint) hint.style.display = 'none';
      lmRenderPreview();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// Crop inline dans step 5
let _lmCropDrag = { active:false, startX:0, startY:0, idx:0 };

function lmOpenCrop(idx) {
  LM.cropEditIdx = idx;
  const canvas = document.getElementById(`lmCropCanvas${idx}`);
  if (!canvas || !LM.charImgs[idx]) return;
  lmRenderCropPreview(idx);
  canvas.onmousedown = e => {
    _lmCropDrag = { active:true, startX:e.clientX, startY:e.clientY, idx };
    e.preventDefault();
  };
  canvas.onmousemove = e => {
    if (!_lmCropDrag.active) return;
    const rect = canvas.getBoundingClientRect();
    const crop = LM.charCrops[idx];
    crop.cx -= (e.clientX - _lmCropDrag.startX) / (rect.width  * crop.zoom);
    crop.cy -= (e.clientY - _lmCropDrag.startY) / (rect.height * crop.zoom);
    crop.cx = Math.max(0.02, Math.min(0.98, crop.cx));
    crop.cy = Math.max(0.02, Math.min(0.98, crop.cy));
    _lmCropDrag.startX = e.clientX;
    _lmCropDrag.startY = e.clientY;
    lmRenderCropPreview(idx);
    lmRenderPreview();
  };
  canvas.onmouseup = canvas.onmouseleave = () => { _lmCropDrag.active = false; };
  canvas.onwheel = e => {
    e.preventDefault();
    const crop = LM.charCrops[idx];
    crop.zoom = Math.max(0.5, Math.min(5, crop.zoom + (e.deltaY > 0 ? 0.1 : -0.1)));
    lmRenderCropPreview(idx);
    lmRenderPreview();
  };
}

function lmRenderCropPreview(idx) {
  const canvas = document.getElementById(`lmCropCanvas${idx}`);
  const img = LM.charImgs[idx];
  if (!canvas || !img) return;
  const SIZE = canvas.width || 160;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const crop = LM.charCrops[idx];
  ctx.fillStyle = '#1a1040';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight) / crop.zoom;
  const srcX = Math.max(0, Math.min(img.naturalWidth - srcSize,  img.naturalWidth  * crop.cx - srcSize/2));
  const srcY = Math.max(0, Math.min(img.naturalHeight - srcSize, img.naturalHeight * crop.cy - srcSize/2));
  ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, SIZE, SIZE);
  // Reticule
  ctx.strokeStyle = 'rgba(119,105,221,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SIZE/2-10,SIZE/2); ctx.lineTo(SIZE/2+10,SIZE/2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SIZE/2,SIZE/2-10); ctx.lineTo(SIZE/2,SIZE/2+10); ctx.stroke();
}

function lmUpdateCropZoom(idx, val) {
  LM.charCrops[idx].zoom = parseFloat(val);
  const el = document.getElementById(`lmCropZoomVal${idx}`);
  if (el) el.textContent = parseFloat(val).toFixed(1);
  lmRenderCropPreview(idx);
  lmRenderPreview();
}

// ── STEP 6 — NOMS ──────────────────────────────────────────────────────────────
function lmInitNames() {
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  [0,1,2].forEach(i => {
    const el = document.getElementById(`lmPlayerName${i}`);
    if (el) {
      const realPlayer = (typeof players !== 'undefined') ? players[i] : null;
      el.value = LM.playerNames[i] || lmFormatPlayerName(realPlayer, '');
    }
    // Individual color
    setV(`lmNameColor${i}`, LM.nameColors[i] || '#ffffff');
    // Individual position (nameX, nameY from slot)
    setV(`lmNameX${i}`, LM.slots[i].nameX != null ? LM.slots[i].nameX : LM.slots[i].cx);
    setV(`lmNameY${i}`, LM.slots[i].nameY);
  });
  // Global style
  const ns = LM.nameStyle;
  setV('lmNsSize', ns.size);
  setV('lmNsColor', ns.color);
  setV('lmNsSc', ns.strokeColor);
  setV('lmNsSw', ns.strokeWidth);
  setV('lmNsSp', ns.spacing);
}

function lmSyncNames() {
  // Helper: read slider value and mirror it to the adjacent number input
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  const g = id => { const el = document.getElementById(id); return el ? el.value : null; };

  [0,1,2].forEach(i => {
    const el = document.getElementById(`lmPlayerName${i}`);
    if (el) LM.playerNames[i] = el.value;
    LM.nameColors[i]     = g(`lmNameColor${i}`) || '#ffffff';
    LM.slots[i].nameX    = syncRange(`lmNameX${i}`) || LM.slots[i].cx;
    LM.slots[i].nameY    = syncRange(`lmNameY${i}`) || LM.slots[i].nameY;
  });
  const ns = LM.nameStyle;
  ns.size        = syncRange('lmNsSize') || 34;
  ns.color       = g('lmNsColor')        || '#ffffff';
  ns.strokeColor = g('lmNsSc')           || '#000000';
  ns.strokeWidth = syncRange('lmNsSw');
  ns.spacing     = syncRange('lmNsSp');
  lmRenderPreview();
}

function lmSetNameWeight(w) {
  LM.nameStyle.weight = w;
  document.querySelectorAll('.lm-nw-btn').forEach(b =>
    b.classList.toggle('lm-selected', b.dataset.w === w));
  lmRenderPreview();
}

// ── STEP 7 — RANGS ─────────────────────────────────────────────────────────────
function lmInitRanks() {
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  // Global rank style
  const rs = LM.rankStyle;
  setC('lmRankNumbersOnly', rs.numbersOnly);
  setV('lmRankSc', rs.strokeColor);
  setV('lmRankSw', rs.strokeWidth);
  // Per-rank (per-slot)
  [0,1,2].forEach(i => {
    setV(`lmRankLabel${i}`,  LM.rankLabels[i]);
    setV(`lmRankColor${i}`,  LM.rankColors[i]);
    setV(`lmRankSize${i}`,   LM.slots[i].rankSize);
    setV(`lmRankX${i}`,      LM.slots[i].rankX);
    setV(`lmRankY${i}`,      LM.slots[i].rankY);
  });
  // Highlight active weight button
  document.querySelectorAll('.lm-rw-btn').forEach(b =>
    b.classList.toggle('lm-selected', b.dataset.w === (rs.weight || '900')));
  // Update label preview based on numbersOnly
  lmUpdateRankLabelPreviews();
}

function lmSyncRanks() {
  // Helper: read slider value and mirror it to the adjacent number input
  const syncRange = id => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const num = el.nextElementSibling;
    if (num && num.type === 'number') num.value = el.value;
    return parseFloat(el.value) || 0;
  };
  const g  = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const gc = id => { const el = document.getElementById(id); return el ? el.checked : false; };

  const rs = LM.rankStyle;
  rs.numbersOnly = gc('lmRankNumbersOnly');
  rs.strokeColor = g('lmRankSc') || '#000000';
  rs.strokeWidth = syncRange('lmRankSw');
  [0,1,2].forEach(i => {
    LM.rankLabels[i]     = g(`lmRankLabel${i}`)  || String(i+1);
    LM.rankColors[i]     = g(`lmRankColor${i}`)  || '#ffffff';
    LM.slots[i].rankSize = syncRange(`lmRankSize${i}`) || 80;
    LM.slots[i].rankX    = syncRange(`lmRankX${i}`);
    LM.slots[i].rankY    = syncRange(`lmRankY${i}`);
  });
  lmUpdateRankLabelPreviews();
  lmRenderPreview();
}

function lmSetRankWeight(w) {
  LM.rankStyle.weight = w;
  document.querySelectorAll('.lm-rw-btn').forEach(b =>
    b.classList.toggle('lm-selected', b.dataset.w === w));
  lmRenderPreview();
}

function lmUpdateRankLabelPreviews() {
  const numbersOnly = LM.rankStyle.numbersOnly;
  [0,1,2].forEach(i => {
    const el = document.getElementById(`lmRankLabelPreview${i}`);
    if (!el) return;
    el.textContent = numbersOnly ? String(i+1) : (LM.rankLabels[i] || String(i+1));
  });
  // Toggle label input disabled state
  [0,1,2].forEach(i => {
    const inp = document.getElementById(`lmRankLabel${i}`);
    if (inp) inp.disabled = LM.rankStyle.numbersOnly;
  });
}

// ── STEP 7 — FINALISER ─────────────────────────────────────────────────────────
function lmFinalStep() {
  // Generate thumbnail
  const c = document.createElement('canvas');
  c.width = c.height = 300;
  lmRenderToCanvas(c);
  LM.thumbnail = c.toDataURL('image/jpeg', 0.7);
  const img = document.getElementById('lmFinalThumb');
  if (img) { img.src = LM.thumbnail; img.style.display = 'block'; }
  // Prefill name (en mode édition, le nom est déjà rempli par lmOpenForEdit)
  const inp = document.getElementById('lmLayoutNameInput');
  if (inp && !inp.value) inp.value = LM.gameName;
  // Adapte le label du bouton sauvegarder selon le mode (création vs édition)
  const saveBtn = document.getElementById('lmFinalSaveBtn');
  if (saveBtn) {
    saveBtn.textContent = LM._editId
      ? '💾 Mettre à jour le layout'
      : '🎉 Sauvegarder dans le coffre';
  }
}

// ── ÉDITION D'UN LAYOUT EXISTANT ─────────────────────────────────────────────
async function lmOpenForEdit(layoutId) {
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const idx = coffre.findIndex(l => l.id === layoutId);
  if (idx === -1) { alert('Layout introuvable dans le coffre.'); return; }
  const layout = coffre[idx];
  await coffreLoadImagesFromIDB(layout);

  // Restaurer tout l'état LM depuis le layout sauvegardé
  LM.gameName      = layout.gameName || layout.name || 'Mon Jeu';
  LM.font          = layout.font || 'Montserrat';
  LM.fontWeight    = layout.fontWeight || '800';
  LM.bgDataUrl     = layout.bgDataUrl || null;  LM.bgImg = null;
  LM.bgOffsetX     = layout.bgOffsetX     ?? 0.5;
  LM.bgOffsetY     = layout.bgOffsetY     ?? 0.5;
  LM.bgBlur        = layout.bgBlur        ?? 0;
  LM.bgDarken      = layout.bgDarken      ?? 0;
  LM.bgZoom        = layout.bgZoom        ?? 1.0;
  LM.overlayDataUrl = layout.overlayDataUrl || null; LM.overlayImg = null;
  LM.shape         = layout.shape         || 'rounded';
  LM.radius        = layout.radius        ?? 24;
  LM.skew          = layout.skew          ?? 0;
  LM.trapRatio     = layout.trapRatio     ?? 0.75;
  LM.strokeColor   = layout.strokeColor   || '#7769DD';
  LM.strokeWidth   = layout.strokeWidth   ?? 5;
  LM.fillColor     = layout.fillColor     || '#00000050';
  LM.T1            = {...(layout.T1 || {})};
  LM.T2            = {...(layout.T2 || {})};
  LM.T3            = {...(layout.T3 || {})};
  LM.slots         = (layout.slots || []).map(s => ({...s}));
  LM.rankLabels    = [...(layout.rankLabels || ['1ER','2ÈME','3ÈME'])];
  LM.rankColors    = [...(layout.rankColors || [])];
  LM.rankStyle     = {...(layout.rankStyle  || {})};
  LM.charDataUrls  = [...(layout.charDataUrls || [null,null,null])];
  LM.charImgs      = [null, null, null];
  LM.charCrops     = (layout.charCrops || [{cx:0.5,cy:0.3,zoom:2},{cx:0.5,cy:0.3,zoom:2},{cx:0.5,cy:0.3,zoom:2}]).map(c => ({...c}));
  LM.nameStyle     = {...(layout.nameStyle  || {})};
  LM.nameColors    = [...(layout.nameColors || [])];
  LM.playerNames   = [...(layout.playerNames || ['','',''])];
  // Synchroniser les inputs DOM tout de suite : en édition on saute à l'étape 9,
  // donc lmInitNames (étape 7) ne tourne pas et les inputs resteraient vides.
  // Au save, lmFinishAndSave lit ces inputs et écraserait LM.playerNames sinon.
  [0,1,2].forEach(i => {
    const el = document.getElementById(`lmPlayerName${i}`);
    if (el) el.value = LM.playerNames[i] || '';
  });
  LM.customPolygon = (layout.customPolygon || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]).map(p => ({...p}));
  LM.gameImgDataUrl  = layout.gameImgDataUrl  || null;
  LM.gameImgUrl      = layout.gameImgUrl      || null; LM.gameImgImg = null;
  LM.gameImgCx       = layout.gameImgCx       ?? 179;
  LM.gameImgCy       = layout.gameImgCy       ?? 1218;
  LM.gameImgW        = layout.gameImgW        ?? 131;
  LM.gameImgH        = layout.gameImgH        ?? 132;
  LM.gameImgZoom     = layout.gameImgZoom     ?? 1.0;
  LM.gameImgOffsetX  = layout.gameImgOffsetX  ?? 0.5;
  LM.gameImgOffsetY  = layout.gameImgOffsetY  ?? 0.5;
  LM.gameImgRadius   = layout.gameImgRadius   ?? 52;
  LM.gameImgVisible  = layout.gameImgVisible  ?? true;
  LM.thumbnail       = layout.thumbnail || null; // miniature existante en attendant le rechargement

  // ── Utiliser les images DÉJÀ CHARGÉES dans l'app principale ──────────────────
  // (évite le délai async et garantit que la preview correspond au rendu normal)

  // Fond : bgImg global est déjà chargé par le flux multi-graph
  LM.bgImg = (typeof bgImg !== 'undefined' && bgImg) ? bgImg : null;

  // Persos : déjà dans imgCache depuis lmRegisterLayout
  const _layoutEntry = LAYOUTS[layoutId];
  if (_layoutEntry?.slotType === 'custom_lm') {
    [0, 1, 2].forEach(i => {
      const key = `${layoutId}_lmchar${i}_1`;
      if (typeof imgCache !== 'undefined' && imgCache[key]?._loaded) {
        LM.charImgs[i] = imgCache[key]._img;
      }
    });
    // Overlay et image du jeu : déjà chargés dans LAYOUTS._lm par lmRegisterLayout
    if (_layoutEntry._lm.overlayImg) LM.overlayImg = _layoutEntry._lm.overlayImg;
    if (_layoutEntry._lm.gameImgImg) LM.gameImgImg = _layoutEntry._lm.gameImgImg;
  }

  // Vrais noms des joueurs du tournoi (priorité sur les placeholders du coffre)
  // On combine team + name pour cohérence avec le rendu principal.
  if (typeof players !== 'undefined' && players.length > 0) {
    players.slice(0, 3).forEach((p, i) => {
      if (p?.name) LM.playerNames[i] = lmFormatPlayerName(p, '');
    });
  }

  // Marqueurs du mode édition
  LM._editIdx = idx;
  LM._editId  = layout.id;

  // Lancer aussi le chargement async depuis les data URLs
  // (nécessaire si l'utilisateur navigue aux étapes bg/persos pour modifier)
  if (layout.bgDataUrl && !LM.bgImg) {
    const img = new Image();
    img.onload = () => { LM.bgImg = img; lmRenderPreview(); };
    img.src = layout.bgDataUrl;
  }
  if (layout.overlayDataUrl && !LM.overlayImg) {
    const img = new Image();
    img.onload = () => { LM.overlayImg = img; lmRenderPreview(); };
    img.src = layout.overlayDataUrl;
  }
  const gameImgSrc = layout.gameImgDataUrl || layout.gameImgUrl;
  if (gameImgSrc && !LM.gameImgImg) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { LM.gameImgImg = img; lmRenderPreview(); };
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => { LM.gameImgImg = img2; lmRenderPreview(); };
      img2.src = gameImgSrc;
    };
    img.src = gameImgSrc;
  }
  layout.charDataUrls?.forEach((url, i) => {
    if (!url || LM.charImgs[i]) return;
    const img = new Image();
    img.onload = () => { LM.charImgs[i] = img; lmRenderPreview(); };
    img.src = url;
  });

  // Pré-remplir les champs texte
  const nameInput = document.getElementById('lmLayoutNameInput');
  if (nameInput) nameInput.value = layout.name || layout.gameName || '';
  const gameNameInput = document.getElementById('lmGameNameInput');
  if (gameNameInput) gameNameInput.value = LM.gameName;

  // Démarrer systématiquement sur l'étape 1 (cohérence UX avec
  // openLayoutMaker — le user peut ensuite naviguer vers step 9 via
  // les dots ou Suivant si édition rapide). On reset aussi _isTransitioning
  // au cas où on aurait fermé en plein milieu d'une transition précédente.
  LM.step = 1;
  LM.maxStep = 9; // mode édition : tous les steps déjà visités
  LM._isTransitioning = false;
  lmGoTo(1);
  document.getElementById('lmModal').style.display = 'flex';
  // Réinitialise le zoom/pan de la preview (sinon un zoom résiduel d'une
  // session précédente reste appliqué et l'aperçu paraît "trop zoomé"/rogné).
  if (typeof lmResetPreviewZoom === 'function') lmResetPreviewZoom();
  lmRenderPreview();
}

async function lmFinishAndSave() {
  const name = document.getElementById('lmLayoutNameInput')?.value.trim() || LM.gameName;
  // Mode édition : réutiliser le même id ; sinon, créer un nouvel id
  const id   = LM._editId || ('custom_' + Date.now());

  // Sync player names from inputs one last time
  [0,1,2].forEach(i => {
    const el = document.getElementById(`lmPlayerName${i}`);
    if (el) LM.playerNames[i] = el.value;
  });

  const layout = {
    id, name,
    gameName: LM.gameName,
    font: LM.font, fontWeight: LM.fontWeight,
    bgDataUrl:      LM.bgDataUrl,
    gameImgDataUrl:  LM.gameImgDataUrl,
    gameImgUrl:      LM.gameImgUrl,
    gameImgCx:       LM.gameImgCx,
    gameImgCy:       LM.gameImgCy,
    gameImgW:        LM.gameImgW,
    gameImgH:        LM.gameImgH,
    gameImgZoom:     LM.gameImgZoom,
    gameImgOffsetX:  LM.gameImgOffsetX,
    gameImgOffsetY:  LM.gameImgOffsetY,
    gameImgRadius:   LM.gameImgRadius,
    gameImgVisible:  LM.gameImgVisible,
    bgOffsetX:      LM.bgOffsetX,
    bgOffsetY:      LM.bgOffsetY,
    bgBlur:         LM.bgBlur,
    bgDarken:       LM.bgDarken,
    bgZoom:         LM.bgZoom,
    overlayDataUrl: LM.overlayDataUrl,
    shape: LM.shape,
    radius: LM.radius, skew: LM.skew, trapRatio: LM.trapRatio,
    strokeColor: LM.strokeColor, strokeWidth: LM.strokeWidth, fillColor: LM.fillColor,
    T1: {...LM.T1}, T2: {...LM.T2}, T3: {...LM.T3},
    slots: LM.slots.map(s => ({...s})),
    rankLabels: [...LM.rankLabels],
    rankColors:  [...LM.rankColors],
    rankStyle:   {...LM.rankStyle},
    charDataUrls: [...LM.charDataUrls],
    charCrops:   LM.charCrops.map(c => ({...c})),
    nameStyle: {...LM.nameStyle},
    nameColors: [...LM.nameColors],
    playerNames: [...LM.playerNames],
    customPolygon: LM.customPolygon.map(p => ({...p})),
    thumbnail: LM.thumbnail,
    createdAt: Date.now(),
  };

  // Construire une version "légère" pour localStorage : images déportées vers IDB
  const lightLayout = JSON.parse(JSON.stringify(layout));
  try {
    await coffreStripImagesToIDB(lightLayout);
  } catch(e) {
    console.error('[lmFinishAndSave] Stockage IndexedDB échoué :', e);
    alert(`❌ Échec stockage des images (IndexedDB) : ${e.message || e.name}`);
    return;
  }

  let coffre;
  try {
    coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  } catch(e) {
    console.error('[lmFinishAndSave] coffre corrompu :', e);
    coffre = [];
  }
  const editIdx = LM._editIdx;
  if (editIdx !== undefined && editIdx >= 0 && coffre[editIdx]?.id === id) {
    coffre[editIdx] = lightLayout;
  } else {
    coffre.push(lightLayout);
  }
  try {
    const serialized = JSON.stringify(coffre);
    localStorage.setItem('top8_coffre', serialized);
    const sizeKb = (serialized.length / 1024).toFixed(1);
    console.log(`[coffre] Layout "${layout.name}" sauvegardé (${sizeKb} KB en localStorage, images en IDB).`);
  } catch(e) {
    console.error('[lmFinishAndSave] Écriture localStorage échouée :', e);
    alert(`❌ Échec écriture coffre : ${e.message || e.name}`);
    return;
  }

  // Forcer la re-registration du layout (les données ont changé)
  delete LAYOUTS[layout.id];
  lmRegisterLayout(layout);

  // Si ce layout est actuellement affiché, rafraîchir
  if (typeof currentGame !== 'undefined' && currentGame === layout.id) {
    if (layout.bgDataUrl) {
      const img = new Image();
      img.onload = () => { bgImg = img; if (typeof generatePreview === 'function') generatePreview(); };
      img.src = layout.bgDataUrl;
    } else {
      bgImg = null;
      if (typeof generatePreview === 'function') generatePreview();
    }
  }

  // Réinitialiser les marqueurs d'édition
  LM._editIdx = undefined;
  LM._editId  = undefined;

  // Update game selector
  lmAddToSelector(layout);

  // Ajouter le layout comme nouveau graphe dans la nav multi (haut-droite)
  try {
    if (typeof addCustomLayoutGraph === 'function') {
      await addCustomLayoutGraph(layout);
    }
  } catch(e) { console.warn('[multi-nav] ajout layout custom :', e); }

  // Show celebration
  lmShowCelebration(layout);
}

function lmAddToSelector(layout) {
  const og = document.getElementById('lmCustomOptGroup');
  if (!og) return;
  // Check if already there
  for (const o of og.options || og.querySelectorAll('option')) {
    if (o.value === layout.id) return;
  }
  const opt = document.createElement('option');
  opt.value = layout.id;
  opt.textContent = layout.name;
  og.appendChild(opt);
}

// ── CELEBRATION ────────────────────────────────────────────────────────────────
function lmShowCelebration(layout) {
  const modal = document.getElementById('lmCelebModal');
  if (!modal) return;
  document.getElementById('lmCelebName').textContent = layout.name;
  const thumb = document.getElementById('lmCelebThumb');
  if (thumb && layout.thumbnail) { thumb.src = layout.thumbnail; }
  modal.style.display = 'flex';
  // Close wizard
  document.getElementById('lmModal').style.display = 'none';
  // Confetti
  lmFireConfetti();
}

function lmCloseCelebration() {
  document.getElementById('lmCelebModal').style.display = 'none';
  // Plus de modale coffre : on s'assure juste que la liste inline est à jour
  // et on bascule sur le slide 4 (Layouts Custom) si possible.
  if (typeof lmRenderCoffreGrid === 'function') lmRenderCoffreGrid();
  if (typeof tcGo === 'function') {
    // Slide Layouts Custom = index 3 (anciennement 4 avant retrait de "Fond")
    try { tcGo(3); } catch(e) {}
  }
}

function lmFireConfetti() {
  const c = document.getElementById('lmConfettiWrap');
  if (!c) return;
  c.innerHTML = '';
  const colors = ['#7769DD','#C87DD4','#F5C842','#FF6B6B','#4ECDC4','#FFD700','#96CEB4','#DDA0DD'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 12;
    p.style.cssText = `
      position:absolute;
      left:${Math.random()*100}%;
      top:-20px;
      width:${size}px;
      height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.4 ? '50%' : '2px'};
      animation: lmConfettiFall ${1.5+Math.random()*2}s ${Math.random()*1}s ease-in forwards;
      transform: rotate(${Math.random()*360}deg);
    `;
    c.appendChild(p);
  }
}

// ── COFFRE ─────────────────────────────────────────────────────────────────────
function openCoffre() {
  lmRenderCoffreGrid();
  document.getElementById('coffreModal').style.display = 'flex';
}

function closeCoffre() {
  document.getElementById('coffreModal').style.display = 'none';
}

async function lmRenderCoffreGrid() {
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const grid       = document.getElementById('coffreGrid');
  const inlineGrid = document.getElementById('lmInlineLayoutsGrid');
  if (!grid && !inlineGrid) return;

  // Cas vide : message + bouton "Créer un layout"
  if (!coffre.length) {
    const emptyModalHtml = `
      <div class="coffre-empty">
        <div class="coffre-empty-icon">📦</div>
        <div>Aucun layout custom</div>
        <div style="font-size:13px;color:#888;margin-top:8px;">Crée ton premier layout custom !</div>
        <button class="btn btn-primary" style="margin-top:16px;" onclick="closeCoffre();openLayoutMaker()">✨ Créer un layout</button>
      </div>`;
    const emptyInlineHtml = `
      <div class="lm-inline-empty">
        <div class="lm-inline-empty-icon">🎴</div>
        <div>Aucun layout pour l'instant</div>
        <div class="lm-inline-empty-sub">Clique sur « Nouveau layout » pour commencer.</div>
      </div>`;
    if (grid)       grid.innerHTML       = emptyModalHtml;
    if (inlineGrid) inlineGrid.innerHTML = emptyInlineHtml;
    return;
  }

  // Charger les thumbnails depuis IDB en parallèle (fallback sur l.thumbnail si déjà attaché)
  const thumbs = await Promise.all(coffre.map(async l => {
    if (l.thumbnail) return l.thumbnail;
    try { return await coffreIdbGet(`${l.id}:thumbnail`); }
    catch { return null; }
  }));

  // Modal : cartes pleine taille (fallback retro-compat — appelée depuis la
  // popup de célébration et openCoffre).
  if (grid) {
    grid.innerHTML = coffre.map((l, idx) => `
      <div class="coffre-card" tabindex="0">
        <div class="coffre-thumb">
          ${thumbs[idx]
            ? `<img src="${thumbs[idx]}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`
            : '<div class="coffre-thumb-placeholder">🎴</div>'}
        </div>
        <div class="coffre-info">
          <div class="coffre-name">${escHtml(l.name)}</div>
          <div class="coffre-date">${new Date(l.createdAt).toLocaleDateString('fr-FR')}</div>
        </div>
        <div class="coffre-actions">
          <button class="btn btn-primary" style="flex:1;" onclick="lmApplyLayout(${idx})">✅ Utiliser</button>
          <button class="btn" onclick="closeCoffre();lmOpenForEdit('${escHtml(l.id)}')" title="Modifier">✏️</button>
          <button class="btn" onclick="lmDownloadLayout(${idx})">⬇️</button>
          <button class="btn btn-danger" onclick="lmDeleteLayout(${idx})">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // Inline slide 4 : cartes compactes (une colonne, hauteur réduite)
  // Affichage type "vignette" qui rentre dans la largeur étroite du slide.
  if (inlineGrid) {
    inlineGrid.innerHTML = coffre.map((l, idx) => `
      <div class="lm-inline-card">
        <div class="lm-inline-thumb">
          ${thumbs[idx]
            ? `<img src="${thumbs[idx]}" alt="${escHtml(l.name)}">`
            : '<div class="lm-inline-thumb-placeholder">🎴</div>'}
        </div>
        <div class="lm-inline-body">
          <div class="lm-inline-name" title="${escHtml(l.name)}">${escHtml(l.name)}</div>
          <div class="lm-inline-date">${new Date(l.createdAt).toLocaleDateString('fr-FR')}</div>
          <div class="lm-inline-actions">
            <button class="btn btn-primary lm-inline-act-use" onclick="lmApplyLayout(${idx})" title="Utiliser ce layout">✅</button>
            <button class="btn lm-inline-act-icon" onclick="lmOpenForEdit('${escHtml(l.id)}')" title="Modifier">✏️</button>
            <button class="btn lm-inline-act-icon" onclick="lmDownloadLayout(${idx})" title="Télécharger">⬇️</button>
            <button class="btn btn-danger lm-inline-act-icon" onclick="lmDeleteLayout(${idx})" title="Supprimer">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ── ENREGISTREMENT D'UN LAYOUT CUSTOM DANS LAYOUTS/GAMES (sans changer l'état global) ──
function lmRegisterLayout(layout) {
  if (!layout?.id) return;
  // Déjà enregistré (ex: par lmInitCoffreSelector au démarrage) → ne pas écraser
  // (évite de perdre les images préchargées comme overlayImg, gameImgImg)
  if (LAYOUTS[layout.id]?.slotType === 'custom_lm') return;
  LAYOUTS[layout.id] = {
    bgFile: null,
    playerCount: 3,
    rankLabels:  layout.rankLabels,
    rankDisplay: ['1er','2e','3e'],
    slots:       layout.slots,
    slotType:    'custom_lm',
    _lm:         layout,
    nameColors:    layout.nameColors    || ['#ffffff','#ffffff','#ffffff'],
    rankStyle:     layout.rankStyle     || { weight:'900', strokeColor:'#000', strokeWidth:0, numbersOnly:false },
    customPolygon:  layout.customPolygon  || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
    gameImgDataUrl:  layout.gameImgDataUrl  || null,
    gameImgUrl:      layout.gameImgUrl      || null,
    gameImgCx:       layout.gameImgCx       ?? 179,
    gameImgCy:       layout.gameImgCy       ?? 1218,
    gameImgW:        layout.gameImgW        ?? 131,
    gameImgH:        layout.gameImgH        ?? 132,
    gameImgZoom:     layout.gameImgZoom     ?? 1.0,
    gameImgOffsetX:  layout.gameImgOffsetX  ?? 0.5,
    gameImgOffsetY:  layout.gameImgOffsetY  ?? 0.5,
    gameImgRadius:   layout.gameImgRadius   ?? 52,
    gameImgVisible:  layout.gameImgVisible  ?? true,
    bgOffsetX:      layout.bgOffsetX      ?? 0.5,
    bgOffsetY:      layout.bgOffsetY      ?? 0.5,
    bgBlur:         layout.bgBlur         ?? 0,
    bgDarken:       layout.bgDarken       ?? 0,
    bgZoom:         layout.bgZoom         ?? 1.0,
    overlayDataUrl: layout.overlayDataUrl || null,
  };
  if (layout.overlayDataUrl) {
    const img = new Image();
    img.onload = () => { if (LAYOUTS[layout.id]) LAYOUTS[layout.id]._lm.overlayImg = img; };
    img.src = layout.overlayDataUrl;
  }
  GAMES[layout.id] = {
    name: layout.name,
    short: layout.name,
    sub1: (layout.gameName || layout.name).toUpperCase(),
    sub2: 'RÉSULTATS',
    chars: [],
  };
  RANK_COLORS_BY_GAME[layout.id] = layout.rankColors;
  // Précharger les images de persos dans le cache
  layout.charDataUrls?.forEach((url, i) => {
    if (!url) return;
    const key = `${layout.id}_lmchar${i}_1`;
    if (imgCache[key]?._loaded) return;
    imgCache[key] = {_loaded:false, _img:null};
    const img = new Image();
    img.onload = () => { imgCache[key]._loaded = true; imgCache[key]._img = img; };
    img.src = url;
  });

  // Précharger l'image du jeu (logo)
  const gameImgSrc = layout.gameImgDataUrl || layout.gameImgUrl;
  if (gameImgSrc && layout.gameImgVisible !== false) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { layout.gameImgImg = img; };
    img.onerror = () => {
      // Retry sans CORS (pour les URLs externes comme start.gg)
      const img2 = new Image();
      img2.onload = () => { layout.gameImgImg = img2; };
      img2.onerror = () => {};
      img2.src = gameImgSrc;
    };
    img.src = gameImgSrc;
  }
}

async function lmApplyLayout(idx) {
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const layout = coffre[idx];
  if (!layout) return;
  await coffreLoadImagesFromIDB(layout);

  // Load bg
  if (layout.bgDataUrl) {
    const img = new Image();
    img.onload = () => { bgImg = img; };
    img.src = layout.bgDataUrl;
  } else {
    bgImg = null;
  }

  // Store as active custom layout
  window._activeCustomLayout = layout;

  // Register in LAYOUTS and GAMES dynamically
  lmRegisterLayout(layout);

  // Apply player names
  const count = 3;
  players = Array.from({length:count}, (_,i) => ({
    name: layout.playerNames?.[i] || '',
    team: '',
    charId: `lmchar${i}`,
    costume: 1,
    charId2: null, costume2: 1,
    startggId: null,
  }));

  currentGame = layout.id;
  const sel = document.getElementById('gameSelect');
  if (sel) {
    lmAddToSelector(layout);
    sel.value = layout.id;
  }

  closeCoffre();
  renderSlots();
  generatePreview();
}

async function lmDownloadLayout(idx) {
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const layout = coffre[idx];
  if (!layout) return;
  await coffreLoadImagesFromIDB(layout);

  // Render full 1400px canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1400;
  lmRenderLayoutToCanvas(canvas, layout, () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `top8_${(layout.name||'custom').replace(/\s/g,'_')}.png`;
    a.click();
  });
}

async function lmDeleteLayout(idx) {
  if (!confirm('Supprimer ce layout du coffre ?')) return;
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const [removed] = coffre.splice(idx, 1);
  localStorage.setItem('top8_coffre', JSON.stringify(coffre));
  if (removed?.id) {
    try { await coffreDeleteLayoutImages(removed.id); }
    catch(e) { console.warn('[IDB] suppression images:', e); }
  }
  lmRenderCoffreGrid();
}

// ── RENDU CANVAS ──────────────────────────────────────────────────────────────
function lmRenderPreview() {
  const canvas = document.getElementById('lmPreviewCanvas');
  if (!canvas) return;
  lmRenderToCanvas(canvas);
}

function lmRenderToCanvas(canvas) {
  const SIZE = canvas.width || 500;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const sc = SIZE / 1400;

  // Background (cover + pan + blur + darken)
  lmDrawBg(ctx, SIZE, LM.bgImg, LM);

  // Une fois qu'une étape a été atteinte, son rendu reste visible même si on revient en arrière.
  const reached = Math.max(LM.step, LM.maxStep || LM.step);

  // Titres (étape 3 atteinte)
  if (reached >= 3) lmDrawTitlesFrom(ctx, sc, LM);

  // Slots (étape 5 atteinte)
  if (reached >= 5) {
    LM.slots.forEach((slot, i) => {
      const realPlayer = (typeof players !== 'undefined') ? players[i] : null;
      const name = reached >= 7
        ? (LM.playerNames[i] || lmFormatPlayerName(realPlayer, `Joueur ${i+1}`))
        : null;
      lmDrawOneSlot(ctx, slot, i, sc,
        LM.charImgs[i], LM.charCrops[i],
        name,
        LM);
    });
  }

  // Overlay PNG — par-dessus le fond et les slots
  const overlayToDraw = LM.overlayImg || (LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
  if (overlayToDraw) ctx.drawImage(overlayToDraw, 0, 0, SIZE, SIZE);

  // Image du jeu — par-dessus l'overlay (step 1+)
  lmDrawGameImg(ctx, SIZE, LM);
}

function lmRenderLayoutToCanvas(canvas, layout, cb) {
  const SIZE = canvas.width;
  const sc = SIZE / 1400;
  const ctx = canvas.getContext('2d');

  function doRender(bgImg, gameI, overlayImg, charImgs) {
    lmDrawBg(ctx, SIZE, bgImg, layout);
    lmDrawTitlesFrom(ctx, sc, layout);
    layout.slots.forEach((slot, i) => {
      lmDrawOneSlot(ctx, slot, i, sc, charImgs[i], layout.charCrops[i], layout.playerNames?.[i]||`Joueur ${i+1}`, layout);
    });
    // Overlay par-dessus le fond et les slots
    const ov = overlayImg || (LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
    if (ov) ctx.drawImage(ov, 0, 0, SIZE, SIZE);
    // Image du jeu par-dessus l'overlay
    const gCfg = Object.assign({}, layout, { gameImgImg: gameI });
    lmDrawGameImg(ctx, SIZE, gCfg);
    if (cb) cb();
  }

  // Count all pending async loads
  const charUrls = layout.charDataUrls?.filter(u=>u) || [];
  const hasGameImg = !!(layout.gameImgDataUrl || layout.gameImgUrl);
  let pending = 1 + charUrls.length + (layout.overlayDataUrl ? 1 : 0) + (hasGameImg ? 1 : 0);
  const charImgs = [null, null, null];
  let bgI = null, overlayI = null, gameI = null;
  function tick() { if (--pending <= 0) doRender(bgI, gameI, overlayI, charImgs); }

  // Load bg
  if (layout.bgDataUrl) {
    const img = new Image();
    img.onload  = () => { bgI = img; tick(); };
    img.onerror = () => tick();
    img.src = layout.bgDataUrl;
  } else { tick(); }

  // Load game image (data URL priority, then start.gg URL)
  if (hasGameImg) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const src = layout.gameImgDataUrl || layout.gameImgUrl;
    img.onload  = () => { gameI = img; tick(); };
    img.onerror = () => {
      // Retry without CORS for display-only
      const img2 = new Image();
      img2.onload  = () => { gameI = img2; tick(); };
      img2.onerror = () => tick();
      img2.src = src;
    };
    img.src = src;
  }

  // Load overlay
  if (layout.overlayDataUrl) {
    const img = new Image();
    img.onload  = () => { overlayI = img; tick(); };
    img.onerror = () => tick();
    img.src = layout.overlayDataUrl;
  }

  // Load characters
  layout.charDataUrls?.forEach((url, i) => {
    if (!url) return;
    const img = new Image();
    img.onload  = () => { charImgs[i] = img; tick(); };
    img.onerror = () => tick();
    img.src = url;
  });
}

// ── DESSIN DU FOND (cover + pan + zoom + flou + assombrir) ───────────────────
function lmDrawBg(ctx, SIZE, bgImg, cfg) {
  const offsetX = cfg.bgOffsetX ?? 0.5;
  const offsetY = cfg.bgOffsetY ?? 0.5;
  const blur    = cfg.bgBlur    ?? 0;
  const darken  = cfg.bgDarken  ?? 0;
  const zoom    = Math.max(0.1, cfg.bgZoom ?? 1.0);

  if (bgImg) {
    const iw = bgImg.naturalWidth  || bgImg.width;
    const ih = bgImg.naturalHeight || bgImg.height;
    // Scale to cover the full canvas (object-fit: cover) puis appliquer le zoom
    const scale = Math.max(SIZE / iw, SIZE / ih) * zoom;
    const sw = iw * scale, sh = ih * scale;
    // Pan: offsetX/Y 0-1 maps excess to translation
    const dx = -(sw - SIZE) * offsetX;
    const dy = -(sh - SIZE) * offsetY;

    ctx.save();
    // Clip to canvas bounds (important for blur)
    ctx.beginPath(); ctx.rect(0, 0, SIZE, SIZE); ctx.clip();
    if (blur > 0) {
      ctx.filter = `blur(${blur}px)`;
      // Draw slightly oversized to avoid blurred edges
      const ext = blur * 2.5;
      ctx.drawImage(bgImg, dx - ext, dy - ext, sw + ext*2, sh + ext*2);
    } else {
      ctx.drawImage(bgImg, dx, dy, sw, sh);
    }
    ctx.filter = 'none';
    ctx.restore();
  } else if (cfg.gameImgImg) {
    // Pas de fond explicite mais une image de jeu dispo (cas d'un jeu qu'on
    // vient de créer) → on l'utilise comme fond (cover, flouté + assombri)
    // pour que la carte soit complète par défaut au lieu d'avoir une moitié
    // droite vide. L'utilisateur peut toujours définir un vrai fond via
    // "Changer le fond".
    const img = cfg.gameImgImg;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (iw && ih) {
      const scale = Math.max(SIZE / iw, SIZE / ih);
      const sw = iw * scale, sh = ih * scale;
      const dx = -(sw - SIZE) / 2, dy = -(sh - SIZE) / 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, SIZE, SIZE); ctx.clip();
      const ext = SIZE * 0.03;
      ctx.filter = `blur(${(SIZE * 0.018).toFixed(1)}px)`;
      try { ctx.drawImage(img, dx - ext, dy - ext, sw + ext * 2, sh + ext * 2); } catch(e) {}
      ctx.filter = 'none';
      // Voile sombre pour la lisibilité du texte/slots par-dessus
      ctx.fillStyle = 'rgba(12,7,28,0.55)';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.restore();
    }
  } else {
    // Default gradient
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#1a1040'); g.addColorStop(1, '#0d0720');
    ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(119,105,221,0.12)';
    ctx.fillRect(0, 0, SIZE * 0.28, SIZE);
  }

  // Darkening overlay
  if (darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${darken})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

// ── DESSIN IMAGE DU JEU (masque arrondi, cover + pan + zoom) ─────────────────
function lmDrawGameImg(ctx, SIZE, cfg) {
  if (!cfg.gameImgVisible) return;
  const img = cfg.gameImgImg;
  if (!img) return;

  const sc      = SIZE / 1400;
  const cx      = cfg.gameImgCx      * sc;
  const cy      = cfg.gameImgCy      * sc;
  const hw      = cfg.gameImgW       * sc;   // demi-largeur
  const hh      = cfg.gameImgH       * sc;   // demi-hauteur
  const r       = Math.min((cfg.gameImgRadius ?? 18) * sc, hw, hh);
  const zoom    = Math.max(0.05, cfg.gameImgZoom    ?? 1.0);
  const offsetX = cfg.gameImgOffsetX ?? 0.5;
  const offsetY = cfg.gameImgOffsetY ?? 0.5;

  const iw = img.naturalWidth  || img.width  || 1;
  const ih = img.naturalHeight || img.height || 1;
  const bw = hw * 2, bh = hh * 2;

  // Scale to cover the box, then apply zoom
  const scale = Math.max(bw / iw, bh / ih) * zoom;
  const sw = iw * scale, sh = ih * scale;
  const dx = (cx - hw) - (sw - bw) * offsetX;
  const dy = (cy - hh) - (sh - bh) * offsetY;

  ctx.save();
  // Rounded-rect clip
  ctx.beginPath();
  ctx.moveTo(cx - hw + r, cy - hh);
  ctx.lineTo(cx + hw - r, cy - hh);
  ctx.arcTo( cx + hw, cy - hh, cx + hw, cy - hh + r, r);
  ctx.lineTo(cx + hw, cy + hh - r);
  ctx.arcTo( cx + hw, cy + hh, cx + hw - r, cy + hh, r);
  ctx.lineTo(cx - hw + r, cy + hh);
  ctx.arcTo( cx - hw, cy + hh, cx - hw, cy + hh - r, r);
  ctx.lineTo(cx - hw, cy - hh + r);
  ctx.arcTo( cx - hw, cy - hh, cx - hw + r, cy - hh, r);
  ctx.closePath();
  ctx.clip();
  try { ctx.drawImage(img, dx, dy, sw, sh); } catch(e) { /* image cross-origin tainted */ }
  ctx.restore();
}

// ── FONCTIONS DE DESSIN PARTAGÉES ──────────────────────────────────────────────

function lmDrawTitlesFrom(ctx, sc, cfg) {
  const tournamentName = document.getElementById('tournamentName')?.value || 'Lorem Ipsum';
  const lines = [tournamentName.toUpperCase(), (cfg.gameName||'').toUpperCase(), 'RÉSULTATS'];
  const tCfgs = [cfg.T1, cfg.T2, cfg.T3];
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  lines.forEach((text, i) => {
    const tc = tCfgs[i];
    if (!tc) return;
    ctx.font = `${cfg.fontWeight||'800'} ${Math.round(tc.size*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
    ctx.letterSpacing = `${(tc.spacing||0)*sc}px`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8*sc;
    ctx.shadowOffsetX = 2*sc; ctx.shadowOffsetY = 2*sc;
    if ((tc.strokeWidth||0) > 0) {
      ctx.strokeStyle = tc.strokeColor || '#000';
      ctx.lineWidth = tc.strokeWidth * sc;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, tc.x*sc, tc.y*sc, 900*sc);
    }
    ctx.fillStyle = tc.color || '#ffffff';
    ctx.fillText(text, tc.x*sc, tc.y*sc, 900*sc);
  });
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
  ctx.letterSpacing='0px';
  ctx.restore();
}

function lmMakeShapePath(ctx, slot, sc, cfg) {
  const cx = slot.cx*sc, cy = slot.cy*sc;
  const w = slot.w*sc/2, h = slot.h*sc/2;
  const shape = cfg.shape || 'rounded';
  ctx.beginPath();
  switch(shape) {
    case 'square':
      ctx.rect(cx-w, cy-h, w*2, h*2);
      break;
    case 'rounded': {
      const r = Math.min((cfg.radius||24)*sc, Math.min(w,h));
      ctx.moveTo(cx-w+r, cy-h);
      ctx.lineTo(cx+w-r, cy-h);
      ctx.quadraticCurveTo(cx+w, cy-h, cx+w, cy-h+r);
      ctx.lineTo(cx+w, cy+h-r);
      ctx.quadraticCurveTo(cx+w, cy+h, cx+w-r, cy+h);
      ctx.lineTo(cx-w+r, cy+h);
      ctx.quadraticCurveTo(cx-w, cy+h, cx-w, cy+h-r);
      ctx.lineTo(cx-w, cy-h+r);
      ctx.quadraticCurveTo(cx-w, cy-h, cx-w+r, cy-h);
      break;
    }
    case 'parallelogram': {
      const sk = (cfg.skew||30)*sc;
      ctx.moveTo(cx-w+sk, cy-h);
      ctx.lineTo(cx+w+sk, cy-h);
      ctx.lineTo(cx+w-sk, cy+h);  // Correction: was cx+w, now cx+w-sk
      ctx.lineTo(cx-w-sk, cy+h);
      break;
    }
    case 'diamond':
      ctx.moveTo(cx, cy-h); ctx.lineTo(cx+w, cy);
      ctx.lineTo(cx, cy+h); ctx.lineTo(cx-w, cy);
      break;
    case 'trapezoid': {
      const tr = (cfg.trapRatio||0.75);
      ctx.moveTo(cx-w*tr, cy-h);
      ctx.lineTo(cx+w*tr, cy-h);
      ctx.lineTo(cx+w, cy+h);
      ctx.lineTo(cx-w, cy+h);
      break;
    }
    case 'pentagon': {
      for (let k=0; k<5; k++) {
        const angle = -Math.PI/2 + (2*Math.PI/5)*k;
        const px = cx + w*Math.cos(angle);
        const py = cy + h*Math.sin(angle);
        k===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      break;
    }
    case 'hexagon': {
      for (let k=0; k<6; k++) {
        const angle = -Math.PI/2 + (Math.PI/3)*k;
        const px = cx + w*Math.cos(angle);
        const py = cy + h*Math.sin(angle);
        k===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      break;
    }
    case 'arch': {
      const r = Math.min(w, h)*0.95;
      ctx.moveTo(cx-w, cy+h);
      ctx.lineTo(cx-w, cy-h+r);
      ctx.quadraticCurveTo(cx-w, cy-h, cx-w+r, cy-h);
      ctx.arcTo(cx, cy-h-r*0.4, cx+w-r, cy-h, w);
      ctx.lineTo(cx+w-r, cy-h);
      ctx.quadraticCurveTo(cx+w, cy-h, cx+w, cy-h+r);
      ctx.lineTo(cx+w, cy+h);
      break;
    }
    case 'custom_polygon': {
      const pts = cfg.customPolygon;
      if (!pts || pts.length < 3) { ctx.rect(cx-w, cy-h, w*2, h*2); break; }
      pts.forEach((p, k) => {
        const px = (cx - w) + p.x * w * 2;
        const py = (cy - h) + p.y * h * 2;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      break;
    }
    default:
      ctx.rect(cx-w, cy-h, w*2, h*2);
  }
  ctx.closePath();
}

// Compose le nom d'affichage à partir d'un objet player (team + name)
// ou d'un fallback string. Mirror du comportement de l'app principale.
function lmFormatPlayerName(playerOrName, fallback) {
  if (playerOrName && typeof playerOrName === 'object') {
    const n = playerOrName.name;
    if (!n) return fallback;
    return playerOrName.team ? `${playerOrName.team} | ${n}` : n;
  }
  return playerOrName || fallback;
}

function lmDrawOneSlot(ctx, slot, idx, sc, img, crop, name, cfg) {
  const cx = slot.cx*sc, cy = slot.cy*sc;
  const w = slot.w*sc, h = slot.h*sc;
  const rankColors = cfg.rankColors || ['#C87DD4','#F5C842','#F5C842'];

  ctx.save();

  // Clip + fill
  lmMakeShapePath(ctx, slot, sc, cfg);
  if (cfg.fillColor && cfg.fillColor !== 'transparent') {
    ctx.fillStyle = cfg.fillColor;
    ctx.fill();
  }

  // Character image
  if (img) {
    ctx.save();
    lmMakeShapePath(ctx, slot, sc, cfg);
    ctx.clip();
    const c = crop || {cx:0.5, cy:0.3, zoom:2.0};
    const srcSize = Math.min(img.naturalWidth, img.naturalHeight) / c.zoom;
    const srcX = Math.max(0, Math.min(img.naturalWidth  - srcSize, img.naturalWidth  * c.cx - srcSize/2));
    const srcY = Math.max(0, Math.min(img.naturalHeight - srcSize, img.naturalHeight * c.cy - srcSize/2));
    const dS = Math.max(w, h);
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, cx-dS/2, cy-dS/2, dS, dS);
    ctx.restore();
  }

  // Stroke
  if ((cfg.strokeWidth||0) > 0) {
    lmMakeShapePath(ctx, slot, sc, cfg);
    ctx.strokeStyle = cfg.strokeColor || '#7769DD';
    ctx.lineWidth   = cfg.strokeWidth * sc;
    ctx.lineJoin    = 'round';
    ctx.shadowColor = (cfg.strokeColor||'#7769DD') + '88';
    ctx.shadowBlur  = 14*sc;
    ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Rank number/label
  const numColor = rankColors[idx] || '#ffffff';
  const rs = cfg.rankStyle || {};
  const rankWeight = rs.weight || '900';
  const rankLabel = rs.numbersOnly
    ? String(idx + 1)
    : ((cfg.rankLabels || ['1ER','2ÈME','3ÈME'])[idx] || String(idx + 1));
  ctx.font = `${rankWeight} ${Math.round((slot.rankSize||80)*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6*sc;
  if ((rs.strokeWidth||0) > 0) {
    ctx.strokeStyle = rs.strokeColor || '#000';
    ctx.lineWidth = rs.strokeWidth * sc;
    ctx.lineJoin = 'round';
    ctx.strokeText(rankLabel, slot.rankX*sc, slot.rankY*sc);
  }
  ctx.fillStyle = numColor;
  ctx.fillText(rankLabel, slot.rankX*sc, slot.rankY*sc);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // Name
  if (name) {
    const ns = cfg.nameStyle || {size:34,weight:'800',color:'#fff',strokeWidth:0,spacing:4};
    const nameColors = cfg.nameColors || null;
    const nameColor = (nameColors && nameColors[idx]) ? nameColors[idx] : (ns.color || '#ffffff');
    const nameX = (slot.nameX != null) ? slot.nameX * sc : cx;
    ctx.font = `${ns.weight||'800'} ${Math.round((ns.size||34)*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = `${(ns.spacing||4)*sc}px`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8*sc;
    ctx.shadowOffsetX = 2*sc; ctx.shadowOffsetY = 2*sc;
    if ((ns.strokeWidth||0) > 0) {
      ctx.strokeStyle = ns.strokeColor || '#000';
      ctx.lineWidth = ns.strokeWidth * sc;
      ctx.lineJoin = 'round';
      ctx.strokeText(name.toUpperCase(), nameX, slot.nameY*sc);
    }
    ctx.fillStyle = nameColor;
    ctx.fillText(name.toUpperCase(), nameX, slot.nameY*sc);
    ctx.letterSpacing = '0px';
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  }
}

// ── RENDU CUSTOM DANS L'APP PRINCIPALE ────────────────────────────────────────
// Appelé depuis renderCanvas quand slotType === 'custom_lm'
// playersParam : tableau de joueurs explicite (priorité sur la globale players)
function drawCustomLMLayout(ctx, layout, sc, playersParam) {
  const SIZE = ctx.canvas.width;
  // Utiliser playersParam si fourni, sinon la globale players
  const _players = (playersParam && playersParam.length > 0)
    ? playersParam
    : (typeof players !== 'undefined' ? players : []);

  // 1. Titres
  lmDrawTitlesFrom(ctx, sc, layout);

  // 2. Slots (personnages + noms)
  layout.slots.forEach((slot, i) => {
    // Résolution de l'image du perso, par ordre de priorité (identique au
    // rendu standard, cf. drawSlot) :
    //   1. Image uploadée manuellement pour ce slot (customImgKey) — data URL,
    //      toujours exportable. Indispensable pour les jeux sans roster
    //      start.gg (ex. Vampire Savior) où l'auto-import ne trouve rien.
    //   2. Perso réel importé depuis start.gg (charImgUrl).
    //   3. Échantillon baked dans le layout (${layout.id}_lmchar${i}_1).
    let img = null;
    const pl = _players[i];
    if (pl?.customImgKey) {
      const cObj = imgCache[pl.customImgKey];
      if (cObj?._loaded) img = cObj._img;
    }
    if (!img && pl?.charImgUrl) {
      const sgObj = imgCache[`__sg__${pl.charImgUrl}`];
      if (sgObj?._loaded) img = sgObj._img;
    }
    if (!img) {
      const key = `${layout.id}_lmchar${i}_1`;
      const imgObj = imgCache[key];
      img = imgObj?._loaded ? imgObj._img : null;
    }
    const name = (_players[i]?.name)
      ? lmFormatPlayerName(_players[i], '')
      : (layout.playerNames?.[i] || `Joueur ${i+1}`);
    lmDrawOneSlot(ctx, slot, i, sc, img, layout.charCrops?.[i], name, layout);
  });

  // 3. Overlay PNG par-dessus les slots (bandeau décoratif, etc.)
  const ov = layout.overlayImg || (LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
  if (ov) ctx.drawImage(ov, 0, 0, SIZE, SIZE);

  // 4. Image du jeu (logo) par-dessus l'overlay
  if (layout.gameImgVisible !== false && layout.gameImgImg) {
    lmDrawGameImg(ctx, SIZE, layout);
  }
}

// ── INIT: charger les layouts du coffre dans le selector ──────────────────────
async function lmInitCoffreSelector() {
  // Migration unique : déporte les images existantes du localStorage vers IndexedDB
  try { await coffreMigrateExistingLayouts(); } catch(e) { console.warn('[migration]', e); }

  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const og = document.getElementById('lmCustomOptGroup');
  for (const l of coffre) {
    // Recharger les images depuis IndexedDB avant d'enregistrer le layout
    try { await coffreLoadImagesFromIDB(l); } catch(e) { console.warn('[IDB load]', l.id, e); }
    // Enregistrer dans LAYOUTS/GAMES dès le démarrage (pour l'import auto multi-graph)
    lmRegisterLayout(l);
    if (!og) continue;
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name;
    og.appendChild(opt);
  }
  // Rendu inline du slide 4 (remplace l'ancien coffre) — les images IDB
  // sont maintenant chargées, donc les thumbnails s'afficheront tout de suite.
  if (typeof lmRenderCoffreGrid === 'function') lmRenderCoffreGrid();
}

// Download current LM preview at 1400px
function lmDownloadCurrent() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1400;
  lmRenderToCanvasWithLM(canvas, LM);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `top8_${(LM.gameName||'custom').replace(/\s/g,'_')}.png`;
  a.click();
}

function lmRenderToCanvasWithLM(canvas, lm) {
  const SIZE = canvas.width;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const sc = SIZE/1400;
  lmDrawBg(ctx, SIZE, lm.bgImg, lm);
  lmDrawTitlesFrom(ctx, sc, lm);
  lm.slots.forEach((slot,i) => {
    lmDrawOneSlot(ctx, slot, i, sc, lm.charImgs[i], lm.charCrops[i],
      lm.playerNames[i] || lmFormatPlayerName(typeof players!=='undefined'?players[i]:null, `Joueur ${i+1}`), lm);
  });
  const lmOv = lm.overlayImg || (LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
  if (lmOv) ctx.drawImage(lmOv, 0, 0, SIZE, SIZE);
  lmDrawGameImg(ctx, SIZE, lm);
}

// ══════════════════════════════════════════════════════════════════════════════
// ÉDITEUR DE POLYGONE
// ══════════════════════════════════════════════════════════════════════════════

const LM_PE = {
  points:    [],
  dragging:  null,
  hovering:  null,
  _mx: -999, _my: -999,
  SIZE:        380,
  MARGIN:       30,
  get DRAW_SIZE() { return this.SIZE - 2 * this.MARGIN; },
  POINT_R:     9,
  EDGE_THRESH: 14,
};

function lmOpenPolyEditor() {
  // Snapshot current polygon into editor
  LM_PE.points   = LM.customPolygon.map(p => ({...p}));
  LM_PE.dragging = null;
  LM_PE.hovering = null;

  const modal = document.getElementById('lmPolyModal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Prefill name input
  const nameInp = document.getElementById('lmPolyNameInput');
  if (nameInp && !nameInp.value) nameInp.value = 'Ma forme';

  lmPEInitCanvas();
  lmPELoadSavedList();
  lmPEDraw();
}

function lmPolyClose() {
  document.getElementById('lmPolyModal').style.display = 'none';
}

function lmPEInitCanvas() {
  const canvas = document.getElementById('lmPolyCanvas');
  if (!canvas) return;
  canvas.width  = LM_PE.SIZE;
  canvas.height = LM_PE.SIZE;
  canvas.style.cursor = 'crosshair';

  // Bind events (replace each time to avoid duplicates)
  canvas.onmousedown   = lmPEMouseDown;
  canvas.onmousemove   = lmPEMouseMove;
  canvas.onmouseup     = lmPEMouseUp;
  canvas.onmouseleave  = () => { LM_PE._mx = -999; LM_PE._my = -999; LM_PE.dragging = null; lmPEDraw(); };
  canvas.ondblclick    = lmPEDblClick;
  canvas.oncontextmenu = e => { e.preventDefault(); lmPERemoveAt(e); };

  // Touch
  canvas.ontouchstart = e => { e.preventDefault(); lmPEMouseDown(lmPETouchEvt(e)); };
  canvas.ontouchmove  = e => { e.preventDefault(); lmPEMouseMove(lmPETouchEvt(e)); };
  canvas.ontouchend   = e => { e.preventDefault(); LM_PE.dragging = null; };
}

function lmPETouchEvt(e) {
  const t = e.touches[0] || e.changedTouches[0];
  return { clientX: t.clientX, clientY: t.clientY, target: e.target };
}

// ── Coordinate helpers ─────────────────────────────────────────────────────
function lmPEGetPos(e) {
  const canvas = document.getElementById('lmPolyCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}
function lmPENorm(cx, cy) {
  const { MARGIN: M, DRAW_SIZE: DS } = LM_PE;
  return { x: Math.max(0,Math.min(1,(cx-M)/DS)), y: Math.max(0,Math.min(1,(cy-M)/DS)) };
}
function lmPEPixel(p) {
  const { MARGIN: M, DRAW_SIZE: DS } = LM_PE;
  return { x: M + p.x*DS, y: M + p.y*DS };
}

// ── Hit testing ────────────────────────────────────────────────────────────
function lmPEFindPoint(cx, cy) {
  const R = LM_PE.POINT_R + 5;
  for (let i = 0; i < LM_PE.points.length; i++) {
    const p = lmPEPixel(LM_PE.points[i]);
    if (Math.hypot(cx - p.x, cy - p.y) < R) return i;
  }
  return -1;
}

function lmPEFindEdge(cx, cy) {
  const pts = LM_PE.points;
  let best = { dist: Infinity, edgeIdx: -1, t: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = lmPEPixel(pts[i]);
    const b = lmPEPixel(pts[(i+1) % pts.length]);
    const dx = b.x-a.x, dy = b.y-a.y;
    const lenSq = dx*dx + dy*dy;
    const t = lenSq > 0 ? Math.max(0,Math.min(1,((cx-a.x)*dx+(cy-a.y)*dy)/lenSq)) : 0;
    const dist = Math.hypot(cx-(a.x+t*dx), cy-(a.y+t*dy));
    if (dist < best.dist) best = { dist, edgeIdx: i, t };
  }
  return best;
}

// ── Mouse handlers ─────────────────────────────────────────────────────────
function lmPEMouseDown(e) {
  const pos = lmPEGetPos(e);
  const ptIdx = lmPEFindPoint(pos.x, pos.y);
  if (ptIdx >= 0) { LM_PE.dragging = ptIdx; return; }

  // Click near edge → insert point
  const { dist, edgeIdx, t } = lmPEFindEdge(pos.x, pos.y);
  if (dist < LM_PE.EDGE_THRESH && edgeIdx >= 0) {
    const a = LM_PE.points[edgeIdx];
    const b = LM_PE.points[(edgeIdx+1) % LM_PE.points.length];
    const newPt = { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t };
    LM_PE.points.splice(edgeIdx+1, 0, newPt);
    LM_PE.dragging = edgeIdx+1;
    lmPEDraw();
    lmPELivePreview();
  }
}

function lmPEMouseMove(e) {
  const pos = lmPEGetPos(e);
  LM_PE._mx = pos.x; LM_PE._my = pos.y;

  if (LM_PE.dragging !== null) {
    LM_PE.points[LM_PE.dragging] = lmPENorm(pos.x, pos.y);
    lmPEDraw();
    lmPELivePreview();
    return;
  }

  const ptIdx = lmPEFindPoint(pos.x, pos.y);
  const wasHover = LM_PE.hovering;
  LM_PE.hovering = ptIdx >= 0 ? ptIdx : null;

  const canvas = document.getElementById('lmPolyCanvas');
  if (canvas) {
    if (LM_PE.hovering !== null) canvas.style.cursor = 'grab';
    else {
      const { dist } = lmPEFindEdge(pos.x, pos.y);
      canvas.style.cursor = dist < LM_PE.EDGE_THRESH ? 'cell' : 'crosshair';
    }
  }
  if (LM_PE.hovering !== wasHover) lmPEDraw();
  else lmPEDraw(); // always redraw for edge highlight
}

function lmPEMouseUp() { LM_PE.dragging = null; }

function lmPEDblClick(e) {
  if (LM_PE.points.length <= 3) return;
  const pos = lmPEGetPos(e);
  const ptIdx = lmPEFindPoint(pos.x, pos.y);
  if (ptIdx >= 0) {
    LM_PE.points.splice(ptIdx, 1);
    LM_PE.dragging = null;
    lmPEDraw(); lmPELivePreview();
  }
}

function lmPERemoveAt(e) {
  if (LM_PE.points.length <= 3) return;
  const pos = lmPEGetPos(e);
  const ptIdx = lmPEFindPoint(pos.x, pos.y);
  if (ptIdx >= 0) { LM_PE.points.splice(ptIdx, 1); lmPEDraw(); lmPELivePreview(); }
}

function lmPELivePreview() {
  LM.customPolygon = LM_PE.points.map(p => ({...p}));
  LM.shape = 'custom_polygon';
  lmRenderPreview();
}

// ── Drawing ────────────────────────────────────────────────────────────────
function lmPEDraw() {
  const canvas = document.getElementById('lmPolyCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { SIZE: S, MARGIN: M, DRAW_SIZE: DS, POINT_R: R } = LM_PE;
  const pts = LM_PE.points;

  // Background
  ctx.fillStyle = '#120830';
  ctx.fillRect(0, 0, S, S);

  // Grid
  const GRID = 8;
  ctx.strokeStyle = 'rgba(119,105,221,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
    const x = M + (i/GRID)*DS, y = M + (i/GRID)*DS;
    ctx.beginPath(); ctx.moveTo(x,M);    ctx.lineTo(x,M+DS); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M,y);    ctx.lineTo(M+DS,y);  ctx.stroke();
  }

  // Bounding box
  ctx.strokeStyle = 'rgba(119,105,221,0.3)';
  ctx.setLineDash([5,5]);
  ctx.lineWidth = 1;
  ctx.strokeRect(M, M, DS, DS);
  ctx.setLineDash([]);

  if (pts.length < 2) return;

  // Find closest edge for highlight
  const { dist: eDist, edgeIdx: eIdx } = lmPEFindEdge(LM_PE._mx, LM_PE._my);
  const showEdge = eDist < LM_PE.EDGE_THRESH && LM_PE.dragging === null && LM_PE.hovering === null;

  // Polygon fill
  ctx.beginPath();
  pts.forEach((p, k) => {
    const px = lmPEPixel(p);
    k === 0 ? ctx.moveTo(px.x, px.y) : ctx.lineTo(px.x, px.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(119,105,221,0.22)';
  ctx.fill();

  // Edges
  for (let i = 0; i < pts.length; i++) {
    const a = lmPEPixel(pts[i]);
    const b = lmPEPixel(pts[(i+1) % pts.length]);
    const isHover = showEdge && i === eIdx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isHover ? '#C87DD4' : '#9b7fe8';
    ctx.lineWidth   = isHover ? 4 : 2;
    if (isHover) {
      ctx.shadowColor = '#C87DD4'; ctx.shadowBlur = 12;
    }
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

    // + hint on hovered edge midpoint
    if (isHover) {
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI*2);
      ctx.fillStyle = '#C87DD4';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', mx, my);
    }
  }

  // Points
  pts.forEach((p, i) => {
    const px = lmPEPixel(p);
    const isHover = LM_PE.hovering === i;
    const isDrag  = LM_PE.dragging === i;
    const r = isDrag ? R+3 : isHover ? R+2 : R;

    ctx.shadowColor = isDrag ? '#F5C842' : isHover ? '#C87DD4' : 'rgba(119,105,221,0.8)';
    ctx.shadowBlur  = isDrag ? 18 : 10;
    ctx.beginPath(); ctx.arc(px.x, px.y, r, 0, Math.PI*2);
    ctx.fillStyle   = isDrag ? '#F5C842' : isHover ? '#C87DD4' : '#7769DD';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${R-1}px Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i+1), px.x, px.y);
  });

  // Corner labels
  ctx.fillStyle = 'rgba(119,105,221,0.35)';
  ctx.font = '9px Nunito, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('(0,0)', M+2, M+2);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('(1,1)', M+DS-2, M+DS-2);

  // Help text
  ctx.fillStyle = 'rgba(200,180,255,0.35)';
  ctx.font = '10px Nunito, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${pts.length} points  ·  Glisse · Clic sur côté = +point · Dbl-clic = -point`, S/2, S-4);
}

// ── Saved shapes ───────────────────────────────────────────────────────────
function lmPELoadSavedList() {
  const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
  const list = document.getElementById('lmPeSavedList');
  if (!list) return;
  if (!shapes.length) {
    list.innerHTML = '<div class="lm-pe-empty">Aucune forme sauvegardée</div>';
    return;
  }
  list.innerHTML = shapes.map((s, i) => `
    <div class="lm-pe-saved-item">
      <button class="lm-pe-saved-btn" onclick="lmPELoadShape(${i})" title="Charger">
        <svg viewBox="0 0 1 1" width="32" height="32">
          <polygon points="${s.points.map(p=>`${p.x},${p.y}`).join(' ')}"
            fill="rgba(119,105,221,0.4)" stroke="#9b7fe8" stroke-width="0.06"/>
        </svg>
        <span>${s.name}</span>
      </button>
      <button class="lm-pe-del-btn" onclick="lmPEDeleteShape(${i})" title="Supprimer">🗑️</button>
    </div>
  `).join('');
}

function lmPELoadShape(idx) {
  const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
  const s = shapes[idx];
  if (!s) return;
  LM_PE.points = s.points.map(p => ({...p}));
  const inp = document.getElementById('lmPolyNameInput');
  if (inp) inp.value = s.name;
  lmPEDraw();
  lmPELivePreview();
}

function lmPEDeleteShape(idx) {
  if (!confirm('Supprimer cette forme ?')) return;
  const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
  shapes.splice(idx, 1);
  localStorage.setItem('top8_poly_shapes', JSON.stringify(shapes));
  lmPELoadSavedList();
  // Rebuild shape grid
  const grid = document.getElementById('lmShapeGrid');
  if (grid) lmAppendPolyShapes(grid);
}

function lmPolySave() {
  const name = document.getElementById('lmPolyNameInput')?.value.trim() || 'Ma forme';
  const shapes = JSON.parse(localStorage.getItem('top8_poly_shapes') || '[]');
  const id = 'poly_' + Date.now();
  shapes.push({ id, name, points: LM_PE.points.map(p => ({...p})) });
  localStorage.setItem('top8_poly_shapes', JSON.stringify(shapes));

  // Apply to LM
  LM.customPolygon = LM_PE.points.map(p => ({...p}));
  LM.shape = 'custom_polygon';

  // Rebuild shape grid saved section
  const grid = document.getElementById('lmShapeGrid');
  if (grid) lmAppendPolyShapes(grid);

  lmPolyClose();
  lmRenderPreview();
}

function lmPolyApply() {
  // Apply without saving
  LM.customPolygon = LM_PE.points.map(p => ({...p}));
  LM.shape = 'custom_polygon';
  lmPolyClose();
  lmRenderPreview();
}

function lmPolyReset() {
  LM_PE.points = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  lmPEDraw();
  lmPELivePreview();
}

function lmPolyPreset(preset) {
  const presets = {
    square:   [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
    triangle: [{x:.5,y:0},{x:1,y:1},{x:0,y:1}],
    diamond:  [{x:.5,y:0},{x:1,y:.5},{x:.5,y:1},{x:0,y:.5}],
    hexagon:  Array.from({length:6},(_,i)=>{ const a=-Math.PI/2+(Math.PI/3)*i; return {x:.5+.5*Math.cos(a),y:.5+.5*Math.sin(a)}; }),
    arrow:    [{x:0,y:.25},{x:.6,y:.25},{x:.6,y:0},{x:1,y:.5},{x:.6,y:1},{x:.6,y:.75},{x:0,y:.75}],
    star:     Array.from({length:10},(_,i)=>{ const a=-Math.PI/2+(Math.PI/5)*i; const r=i%2===0?.5:.22; return {x:.5+r*Math.cos(a),y:.5+r*Math.sin(a)}; }),
  };
  if (presets[preset]) {
    LM_PE.points = presets[preset].map(p => ({...p}));
    lmPEDraw();
    lmPELivePreview();
  }
}
