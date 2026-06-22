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
  // Multi-persos : images par zone (souvent des dataURL d'upload manuel) → IDB,
  // pour ne pas saturer le localStorage.
  if (Array.isArray(layout.charUrlsMulti)) {
    for (let i = 0; i < layout.charUrlsMulti.length; i++) {
      const arr = layout.charUrlsMulti[i] || [];
      for (let k = 0; k < arr.length; k++) {
        if (arr[k]) await coffreIdbPut(`${layout.id}:multi:${i}:${k}`, arr[k]);
      }
    }
    delete layout.charUrlsMulti;
  }
  // Images de remplacement des rangs (dataURL) → IDB.
  if (Array.isArray(layout.rankImgUrls)) {
    for (let i = 0; i < layout.rankImgUrls.length; i++) {
      if (layout.rankImgUrls[i]) await coffreIdbPut(`${layout.id}:rankimg:${i}`, layout.rankImgUrls[i]);
    }
    delete layout.rankImgUrls;
  }
  // Images de FOND par carte (dataURL) → IDB.
  if (Array.isArray(layout.slotBgUrls)) {
    for (let i = 0; i < layout.slotBgUrls.length; i++) {
      if (layout.slotBgUrls[i]) await coffreIdbPut(`${layout.id}:slotbg:${i}`, layout.slotBgUrls[i]);
    }
    delete layout.slotBgUrls;
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
  // Multi-persos : restaure les images par zone depuis IDB (max 3 joueurs × 5 zones).
  if (!Array.isArray(layout.charUrlsMulti)) layout.charUrlsMulti = [[],[],[]];
  for (let i = 0; i < 3; i++) {
    layout.charUrlsMulti[i] = layout.charUrlsMulti[i] || [];
    for (let k = 0; k < 5; k++) {
      if (!layout.charUrlsMulti[i][k]) {
        try { const v = await coffreIdbGet(`${layout.id}:multi:${i}:${k}`); if (v) layout.charUrlsMulti[i][k] = v; }
        catch(e) { /* ignore */ }
      }
    }
  }
  // Images de remplacement des rangs : restaure depuis IDB.
  if (!Array.isArray(layout.rankImgUrls)) layout.rankImgUrls = [null,null,null];
  for (let i = 0; i < 3; i++) {
    if (!layout.rankImgUrls[i]) {
      try { const v = await coffreIdbGet(`${layout.id}:rankimg:${i}`); if (v) layout.rankImgUrls[i] = v; }
      catch(e) { /* ignore */ }
    }
  }
  // Images de FOND par carte : restaure depuis IDB.
  if (!Array.isArray(layout.slotBgUrls)) layout.slotBgUrls = [null,null,null];
  for (let i = 0; i < 3; i++) {
    if (!layout.slotBgUrls[i]) {
      try { const v = await coffreIdbGet(`${layout.id}:slotbg:${i}`); if (v) layout.slotBgUrls[i] = v; }
      catch(e) { /* ignore */ }
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
    rotation: 0,   // rotation des classements (degrés)
  },
  rankImgUrls: [null, null, null],  // image remplaçant le texte du rang (dataURL, persisté)
  rankImgImgs: [null, null, null],  // images chargées (runtime)

  // Step 5 — Image de fond PAR CARTE (par slot), avec cadrage zoom/position.
  // Dessinée clippée à la forme, SOUS le personnage. Mirroir du système perso.
  slotBgUrls:  [null, null, null],  // dataURL par slot (persisté → déporté en IDB)
  slotBgImgs:  [null, null, null],  // images chargées (runtime)
  slotBgCrops: [
    {cx:0.5, cy:0.5, zoom:1.0},
    {cx:0.5, cy:0.5, zoom:1.0},
    {cx:0.5, cy:0.5, zoom:1.0},
  ],

  // Step 5 — Personnages
  charImgs:     [null, null, null],
  charDataUrls: [null, null, null],
  charCrops:    [
    {cx:0.5,cy:0.3,zoom:2.0},
    {cx:0.5,cy:0.3,zoom:2.0},
    {cx:0.5,cy:0.3,zoom:2.0},
  ],
  cropEditIdx: null,
  // Multi-personnages (jeux d'équipe ex. DBFZ) : nombre de persos par joueur,
  // détecté auto depuis start.gg (surchargeable). >1 → on compose plusieurs
  // persos CÔTE À CÔTE dans chaque carte.
  charsPerPlayer: 1,
  charImgsMulti: [[], [], []],   // images chargées (runtime) par slot
  charUrlsMulti: [[], [], []],   // URLs/dataURLs par slot (persisté)
  charCropsMulti: [[], [], []],  // cadrage {cx,cy,zoom} par perso et par slot (persisté)
  charSplit: true,               // multi-persos : trait de séparation + n° par perso
  cuts: [],                      // découpe manuelle : lignes {x1,y1,x2,y2} en coords carte 0-1
  cutGap: 0,                     // espacement entre les zones découpées (px réf)

  // Step 6 — Noms
  playerNames: ['','',''],
  nameColors:  ['#ffffff','#ffffff','#ffffff'],
  nameStyle: {
    size:44, weight:'800', color:'#ffffff',
    strokeColor:'#000000', strokeWidth:0,
    spacing:4,
    rotation:0,   // rotation des pseudos (degrés)
  },

  // Step 8
  thumbnail: null,
};

// Instantané (clone profond) des valeurs par défaut de LM, pris à l'état VIERGE
// juste après la définition ci-dessus. Sert à réinitialiser proprement un
// NOUVEAU layout : sans ça, openLayoutMaker héritait de toute la géométrie/du
// style (forme, slots, classements, titres, persos…) du dernier layout créé ou
// édité — d'où le bug « créer un layout RoA2 charge les paramètres SoulCalibur ».
const _LM_DEFAULTS = JSON.parse(JSON.stringify(LM));
function lmResetForNew() {
  const d = JSON.parse(JSON.stringify(_LM_DEFAULTS));
  Object.keys(d).forEach(k => {
    if (k === 'step' || k === 'gameName') return;   // gérés par l'appelant
    LM[k] = d[k];
  });
  // Images (non sérialisables) : on les vide explicitement pour ne pas garder
  // celles du layout précédent ; elles seront rechargées au besoin.
  LM.bgImg = null; LM.gameImgImg = null; LM.overlayImg = null;
  LM.charImgs = [null, null, null];
  LM.charImgsMulti = [[], [], []];
  LM.rankImgImgs = [null, null, null];
  LM.slotBgImgs = [null, null, null];   // fonds par carte : pas de fuite entre layouts
  // Champs des conversions built-in : un nouveau layout ne doit pas en hériter.
  LM.baseGame = null; LM.hideRanks = false; LM.curvedNames = false;
  // Efface les marqueurs d'édition : un nouveau layout ne doit JAMAIS écraser le
  // dernier layout édité au moment de la sauvegarde.
  LM._editIdx = null;
  LM._editId  = null;
  LM._eventSlug = null;   // évite d'interroger un ancien event à l'auto-import
}

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
  { id:"'Tex Gyre Termes'",   label:'Tex Gyre Termes',    sample:'Tournament' },
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
  { id:'circle',        label:'Rond',             icon:'◯',  desc:'Cercle / ovale' },
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
  // NOUVEAU layout : on repart d'un état par défaut propre pour ne pas hériter
  // de la géométrie/du style du layout précédemment créé ou édité (sinon, ex. :
  // créer un layout RoA2 reprend la forme/les positions du layout SoulCalibur).
  // ⚠️ Les noms des joueurs sont remis à vide ici → openLayoutMakerForEvent les
  // re-remplit APRÈS cet appel.
  lmResetForNew();
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
    // Les poignées de manipulation doivent suivre le pan/zoom du canvas
    // (l'overlay se recale sur la bbox transformée du canvas).
    if (typeof lmTextManipRefresh === 'function') lmTextManipRefresh();
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

// Le nouveau layout a-t-il un contenu digne d'être sauvegardé ? (évite de créer
// des entrées vides si on ouvre puis ferme l'éditeur sans rien faire).
function lmLayoutHasContent() {
  const g = (LM.gameName || '').trim();
  return !!(LM.bgDataUrl || LM.gameImgDataUrl
    || (LM.charDataUrls || []).some(Boolean)
    || (g && g !== 'Mon Jeu'));
}

function closeLayoutMaker() {
  document.getElementById('lmModal').style.display = 'none';
  // Reset guard de transition au cas où on aurait fermé en plein milieu
  // d'une transition — sinon la prochaine ouverture serait bloquée.
  LM._isTransitioning = false;
  // Annule un éventuel auto-enregistrement en attente : la sauvegarde de
  // fermeture ci-dessous est la sauvegarde finale.
  if (typeof lmCancelAutoSave === 'function') lmCancelAutoSave();
  // En mode ÉDITION : auto-mettre à jour le layout à la fermeture, pour que
  // l'AFFICHAGE (le snapshot du multi-graph, figé à la dernière sauvegarde)
  // reflète les modifs sans devoir cliquer "Mettre à jour" manuellement.
  // → sauvegarde SILENCIEUSE. lmFinishAndSave réinitialise lui-même
  // _editIdx/_editId et s'en sert pour REMPLACER le layout (pas de doublon),
  // donc on ne les remet PAS à zéro ici avant l'appel.
  if (typeof lmFinishAndSave === 'function' && (LM._editId != null || lmLayoutHasContent())) {
    // Édition OU nouveau layout ayant du contenu → sauvegarde finale silencieuse.
    // Le nom est forcé au nom du jeu ; plus d'étape "Sauvegarder" dédiée.
    Promise.resolve(lmFinishAndSave(true))
      .then(() => { if (typeof lmShowAutoSavedToast === 'function') lmShowAutoSavedToast(); })
      .catch(e => console.warn('[LM] auto-enregistrement à la fermeture:', e));
  } else {
    LM._editIdx = undefined;
    LM._editId  = undefined;
  }
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
  const targetStep = Math.max(1, Math.min(8, step));

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
  // Transitions oniriques DÉSACTIVÉES : elles ralentissaient la navigation
  // (1200-1600ms de blocage + snapshot toDataURL du canvas coûteux à chaque
  // étape). On force le switch instantané. Pour les réactiver, remettre :
  //   !!(fromPanel && toPanel && typeof window.lmPlayTransition === 'function')
  // et ré-inclure lm-transitions.js dans index.html.
  const playTx      = false;

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
  ];
  const el = document.getElementById('lmStepTitle');
  if (el) el.textContent = `Étape ${LM.step}/8 — ${titles[LM.step-1]}`;

  // Nav buttons
  const prev = document.getElementById('lmPrevBtn');
  const next = document.getElementById('lmNextBtn');
  if (prev) prev.disabled = LM.step === 1;
  if (next) {
    next.textContent = LM.step === 8
      ? (LM._editId ? '💾 Mettre à jour le layout' : '🎉 Sauvegarder dans le coffre')
      : 'Suivant →';
    next.classList.toggle('lm-btn-finish', LM.step === 8);
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
  if (LM.step === 8) lmFinishAndSave();
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
  lmFitFontSamples();
}

// Réduit la taille de chaque échantillon "TOURNAMENT" pour qu'il tienne dans sa
// carte (certaines polices larges débordaient la grille, donc le panneau).
// Recalculé après le chargement des polices web (mesure fiable).
function lmFitFontSamples() {
  const grid = document.getElementById('lmFontGrid');
  if (!grid) return;
  const fitAll = () => {
    grid.querySelectorAll('.lm-font-btn').forEach(btn => {
      const s = btn.querySelector('.lm-font-sample');
      if (!s) return;
      s.style.fontSize = '';                 // repart de la taille CSS (18px)
      const avail = btn.clientWidth - 18;    // largeur utile (padding ~8px/côté + marge)
      if (avail <= 0) return;
      let size = 18, guard = 0;
      while (s.scrollWidth > avail && size > 9 && guard < 32) {
        size -= 1; s.style.fontSize = size + 'px'; guard++;
      }
    });
  };
  fitAll();
  requestAnimationFrame(fitAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll).catch(() => {});
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
    // Met aussi à jour l'afficheur voisin (input number .value OU span .textContent)
    // pour que la valeur affichée soit correcte dès l'ouverture (ex. contour).
    const setV = (id, v) => {
      const el = document.getElementById(id); if (!el) return;
      el.value = v;
      const sib = el.nextElementSibling;
      if (sib) {
        if (sib.type === 'number') sib.value = v;
        else if (sib.tagName === 'SPAN') sib.textContent = v;
      }
    };
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
    // Met à jour l'afficheur de valeur voisin : input number (.value) OU
    // span (.textContent). Le contour des titres utilise un <span> → sans ça,
    // la valeur restait bloquée (« ça met pas de chiffres »).
    const sib = el.nextElementSibling;
    if (sib) {
      if (sib.type === 'number') sib.value = el.value;
      else if (sib.tagName === 'SPAN') sib.textContent = el.value;
    }
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
  // Reflète le toggle "découper les persos" à chaque entrée sur l'étape.
  const cs = document.getElementById('lmCharSplit');
  if (cs) cs.checked = LM.charSplit !== false;
  // Re-remplit les contrôles (couleur/épaisseur/fond du contour…) depuis LM à
  // CHAQUE entrée — sinon, au rechargement d'un layout, les inputs gardent les
  // défauts HTML et un lmSyncShape ultérieur écrase la valeur sauvegardée.
  lmShowShapeControls();
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
  show('lmCtrlRadius',   LM.shape === 'rounded');
  show('lmCtrlSkew',     LM.shape === 'parallelogram');
  show('lmCtrlTrap',     LM.shape === 'trapezoid');

  // Re-remplit les inputs depuis LM (couleur/épaisseur du contour, fond de carte,
  // radius/skew/trapèze) + le champ hex injecté à côté des color-pick. Sans ça,
  // au rechargement d'un layout les inputs restaient sur les défauts HTML et la
  // moindre édition de forme écrasait la couleur/épaisseur sauvegardées.
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (!el || v == null) return;
    el.value = v;
    const sib = el.nextElementSibling;
    if (sib) {
      if (sib.type === 'number') sib.value = v;
      else if (sib.classList && sib.classList.contains('hex-input')) sib.value = v;
    }
  };
  setVal('lmRadius',           LM.radius);
  setVal('lmSkew',             LM.skew);
  setVal('lmTrapRatio',        Math.round((LM.trapRatio ?? 0.75) * 100));
  setVal('lmShapeStrokeColor', LM.strokeColor);
  setVal('lmShapeStrokeWidth', LM.strokeWidth);
  setVal('lmShapeFillColor',   LM.fillColor);
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
    // Espacement des zones par carte : repli sur le global (éditeur de découpe).
    setV(`lmSlotGap${i}`, (s.cutGap != null ? s.cutGap : (LM.cutGap || 0)));
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
  s.cutGap   = syncRange(`lmSlotGap${i}`);   // espacement des zones (par carte)
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
  const splitEl = document.getElementById('lmCharSplit');
  if (splitEl) LM.charSplit = splitEl.checked;
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
  // Multi-persos : on masque l'upload simple (1 image/joueur) et on montre une
  // grille d'upload par perso (1 image par zone) — indispensable pour les jeux
  // sans images start.gg (DBFZ, etc.).
  const multi = (LM.charsPerPlayer || 1) > 1;
  document.querySelectorAll('.lm-step-panel[data-step="6"] .lm-char-slot').forEach(el => el.style.display = multi ? 'none' : '');
  const mc = document.getElementById('lmMultiUploads');
  if (mc) { mc.style.display = multi ? 'block' : 'none'; if (multi) lmBuildMultiUploads(mc); }
  lmHighlightCppBtn();
}

// Construit la grille d'upload manuel par perso (joueur × zone).
function lmBuildMultiUploads(container) {
  const N = LM.charsPerPlayer || 1, ranks = ['🥇','🥈','🥉'];
  container.innerHTML = [0,1,2].map(i => `
    <div class="lm-multiup-row">
      <span class="lm-name-rank lm-rank-${i+1}" style="font-size:18px;">${ranks[i]}</span>
      <div class="lm-multiup-cells">
        ${Array.from({length:N},(_,k)=>`
          <div class="lm-multiup-cell" onclick="document.getElementById('lmMU_${i}_${k}').click()" title="Joueur ${i+1} — perso ${k+1}">
            <input type="file" id="lmMU_${i}_${k}" accept="image/*" style="display:none" onchange="lmLoadCharMulti(event,${i},${k})">
            <img id="lmMUthumb_${i}_${k}" alt="">
            <span class="lm-multiup-num">${k+1}</span>
          </div>`).join('')}
      </div>
    </div>`).join('');
  [0,1,2].forEach(i => { for (let k=0;k<N;k++){ const url=(LM.charUrlsMulti[i]||[])[k]; const im=document.getElementById(`lmMUthumb_${i}_${k}`); if (im && url){ im.src=url; im.style.display='block'; } } });
}
function lmLoadCharMulti(e, i, k) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const url = ev.target.result;
    LM.charUrlsMulti[i] = LM.charUrlsMulti[i] || [];
    LM.charImgsMulti[i] = LM.charImgsMulti[i] || [];
    LM.charUrlsMulti[i][k] = url;
    const img = new Image();
    img.onload = () => { LM.charImgsMulti[i][k] = img; lmRenderPreview(); };
    img.src = url;
    const thumb = document.getElementById(`lmMUthumb_${i}_${k}`); if (thumb){ thumb.src=url; thumb.style.display='block'; }
  };
  reader.readAsDataURL(file);
}
window.lmLoadCharMulti = lmLoadCharMulti;

// Nombre de persos par joueur (jeux d'équipe). Met à jour le mode + ré-importe
// les persos depuis start.gg avec ce nombre, rafraîchit l'UI d'upload, puis re-rend.
function lmSetCharsPerPlayer(n) {
  LM.charsPerPlayer = Math.max(1, Math.min(3, n | 0));
  lmHighlightCppBtn();
  if (typeof lmAutoImportChars === 'function') lmAutoImportChars();
  lmInitChars();
  lmRenderPreview();
}
window.lmSetCharsPerPlayer = lmSetCharsPerPlayer;
function lmHighlightCppBtn() {
  document.querySelectorAll('.lm-cpp-btn').forEach(b =>
    b.classList.toggle('lm-selected', (+b.dataset.cpp) === (LM.charsPerPlayer || 1)));
}

// Auto-importe les images de personnages depuis les données start.gg déjà
// chargées (global `players`). Pour chaque joueur du Top, on résout son
// personnage (players[i].charId) en image d'art via getMuralArtUrl() et on
// la place dans le slot correspondant.
// Détecte le nombre de persos par joueur d'après le Top start.gg chargé
// (players[i].chars rempli à l'import). 1..3. Sert à passer en multi-persos auto.
function lmDetectCharsPerPlayer() {
  if (typeof players === 'undefined' || !Array.isArray(players)) return 1;
  let max = 1;
  players.slice(0, 3).forEach(p => {
    const n = (p && Array.isArray(p.chars)) ? p.chars.length : 0;
    if (n > max) max = n;
  });
  return Math.max(1, Math.min(3, max));
}
window.lmDetectCharsPerPlayer = lmDetectCharsPerPlayer;

// Interroge start.gg pour le Top 3 d'un event + leurs persos (avec image).
// Renvoie [[{name,url}...], ...] dans l'ordre du classement. Sert de repli quand
// les persos ne sont pas pré-chargés (flux "jeux sans layout").
async function lmFetchEventChars(slug, apiKey) {
  const sd = await gqlFetch(apiKey, `query($slug:String!){ event(slug:$slug){
    standings(query:{perPage:3,page:1}){ nodes { placement entrant{id} } } } }`, { slug });
  const nodes = (sd?.data?.event?.standings?.nodes || []).sort((a,b)=>a.placement-b.placement).slice(0,3);
  const entrantIds = nodes.map(s => s.entrant?.id);
  const setsData = await gqlFetch(apiKey, `query($slug:String!){ event(slug:$slug){
    sets(page:1,perPage:50,sortType:STANDARD){ nodes { games { selections { entrant{id} character{id name images{url type}} } } } } } }`, { slug });
  const charCount = {}, charImage = {};
  (setsData?.data?.event?.sets?.nodes || []).forEach(set => (set.games||[]).forEach(game => (game.selections||[]).forEach(sel => {
    const eid = sel?.entrant?.id, ch = sel?.character, cn = ch?.name; if (!eid || !cn) return;
    charCount[eid] = charCount[eid] || {}; charCount[eid][cn] = (charCount[eid][cn]||0)+1;
    if (!charImage[cn] && Array.isArray(ch.images) && ch.images.length) {
      const pr = ch.images.find(im=>im.type==='primary') || ch.images[0]; if (pr?.url) charImage[cn] = pr.url;
    }
  })));
  return entrantIds.map(eid => {
    const counts = eid ? charCount[eid] : null; if (!counts) return [];
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([cn])=>({ name:cn, url:charImage[cn]||null })).filter(c=>c.url);
  });
}
window.lmFetchEventChars = lmFetchEventChars;

async function lmAutoImportChars() {
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
      if (typeof lmInitChars === 'function') lmInitChars();   // rafraîchit les vignettes
    }
  };

  const N = Math.max(1, Math.min(3, LM.charsPerPlayer || 1));

  // ── Jeu d'ÉQUIPE (plusieurs persos par joueur) ──
  if (N > 1) {
    // chars par joueur : depuis players[i].chars si dispo ; SINON on interroge
    // start.gg directement (flux "jeux sans layout" où les persos ne sont pas
    // pré-chargés). cbp = [[{name,url}...], ...] dans l'ordre du Top.
    let cbp = players.slice(0, 3).map(p => (p && Array.isArray(p.chars) && p.chars.length) ? p.chars : null);
    const apiKey = (document.getElementById('apiKey')?.value || '').trim();
    const gi = (typeof currentGraphIdx !== 'undefined') ? currentGraphIdx : 0;
    const slug = LM._eventSlug || (typeof graphs !== 'undefined' && graphs[gi]?.eventSlug) || null;
    // On interroge start.gg si aucune donnée pré-chargée OU si on connaît l'event
    // précis (flux "jeux sans layout") → données fiables pour CET event. On ne
    // remplace cbp que si le fetch ramène effectivement des persos.
    if (slug && apiKey && typeof gqlFetch === 'function' && (!cbp.some(Boolean) || LM._eventSlug)) {
      setStatus('⏳ Recherche des personnages sur start.gg…');
      try { const fetched = await lmFetchEventChars(slug, apiKey); if (fetched.some(c => c && c.length)) cbp = fetched; }
      catch(e) { console.warn('[LM] fetch chars :', e); }
    }
    // Si on a des persos à importer, on repart de slots PROPRES pour ne pas garder
    // ceux d'un ancien layout/event (ex. RoA2 restant sur une carte DBFZ).
    const _hasData = cbp.some(c => c && c.length);
    [0,1,2].forEach(i => {
      const chars = (cbp[i] || []).slice(0, N);
      if (_hasData) { LM.charImgsMulti[i] = []; LM.charUrlsMulti[i] = []; }
      else { LM.charImgsMulti[i] = LM.charImgsMulti[i] || []; LM.charUrlsMulti[i] = LM.charUrlsMulti[i] || []; }
      chars.forEach((c, k) => {
        const url = c && c.url; if (!url) return;
        attempted++; pending++;
        const apply = (img) => { LM.charImgsMulti[i][k] = img; LM.charUrlsMulti[i][k] = url; loaded++; lmRenderPreview(); pending--; finish(); };
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload  = () => apply(img);
        img.onerror = () => { const img2 = new Image(); img2.onload = () => apply(img2); img2.onerror = () => { pending--; finish(); }; img2.src = url; };
        img.src = url;
      });
    });
    if (attempted === 0) setStatus('ℹ️ Aucun perso trouvé sur start.gg (non reportés, ou sans image côté start.gg). Utilise l\'upload manuel ci-dessous.', false);
    return;
  }

  // ── Jeu MONO-perso (comportement historique) ──
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

// ── STEP 5 — IMAGE DE FOND PAR CARTE (upload + cadrage zoom/position) ──────────
// Upload d'une image de fond pour la carte du slot idx (1er=0, 2e=1, 3e=2).
function lmLoadSlotBg(event, idx) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const url = ev.target.result;
    LM.slotBgUrls[idx] = url;
    if (!LM.slotBgCrops[idx]) LM.slotBgCrops[idx] = { cx:0.5, cy:0.5, zoom:1 };
    const img = new Image();
    img.onload = () => { LM.slotBgImgs[idx] = img; lmShowSlotBgUI(idx); lmRenderPreview(); };
    img.src = url;
  };
  reader.readAsDataURL(file);
}

// Retire l'image de fond d'une carte.
function lmClearSlotBg(idx) {
  LM.slotBgUrls[idx] = null;
  LM.slotBgImgs[idx] = null;
  const ctrls = document.getElementById(`lmSlotBgCtrls${idx}`);
  if (ctrls) ctrls.style.display = 'none';
  const fileInput = document.getElementById(`lmSlotBgFile${idx}`);
  if (fileInput) fileInput.value = '';
  lmRenderPreview();
}

// Lit les sliders (zoom / X / Y) et applique le cadrage du fond du slot idx.
function lmUpdateSlotBg(idx) {
  const gv = id => parseFloat(document.getElementById(id)?.value);
  const z = gv(`lmSlotBgZoom${idx}`); const x = gv(`lmSlotBgX${idx}`); const y = gv(`lmSlotBgY${idx}`);
  LM.slotBgCrops[idx] = { cx: isNaN(x)?0.5:x, cy: isNaN(y)?0.5:y, zoom: isNaN(z)?1:z };
  lmRenderSlotBgMini(idx);
  lmRenderPreview();
}

// Affiche/masque les contrôles + recale les sliders sur le cadrage courant.
function lmShowSlotBgUI(idx) {
  const ctrls = document.getElementById(`lmSlotBgCtrls${idx}`);
  if (ctrls) ctrls.style.display = LM.slotBgImgs[idx] ? 'block' : 'none';
  const c = LM.slotBgCrops[idx] || { cx:0.5, cy:0.5, zoom:1 };
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set(`lmSlotBgZoom${idx}`, c.zoom); set(`lmSlotBgX${idx}`, c.cx); set(`lmSlotBgY${idx}`, c.cy);
  lmRenderSlotBgMini(idx);
}

// Mini-aperçu carré du cadrage (aide visuelle ; le rendu exact est dans l'aperçu principal).
function lmRenderSlotBgMini(idx) {
  const canvas = document.getElementById(`lmSlotBgCanvas${idx}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width || 56, H = canvas.height || 56;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1040'; ctx.fillRect(0, 0, W, H);
  const img = LM.slotBgImgs[idx];
  if (!img || !img.naturalWidth) return;
  const c = LM.slotBgCrops[idx] || { cx:0.5, cy:0.5, zoom:1 };
  const z = Math.max(0.2, c.zoom || 1);
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight) / z;
  const sx = Math.max(0, Math.min(img.naturalWidth  - srcSize, img.naturalWidth  * (c.cx ?? 0.5) - srcSize/2));
  const sy = Math.max(0, Math.min(img.naturalHeight - srcSize, img.naturalHeight * (c.cy ?? 0.5) - srcSize/2));
  ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, W, H);
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
    // Taille individuelle (slot.nameSize) ; sinon on affiche la taille globale.
    setV(`lmNameSize${i}`, LM.slots[i].nameSize != null ? LM.slots[i].nameSize : (LM.nameStyle.size || 34));
  });
  // Global style
  const ns = LM.nameStyle;
  setV('lmNsSize', ns.size);
  setV('lmNsColor', ns.color);
  setV('lmNsSc', ns.strokeColor);
  setV('lmNsSw', ns.strokeWidth);
  setV('lmNsSp', ns.spacing);
  setV('lmNsRot', ns.rotation || 0);
  setV('lmNsArc', ns.arc || 0);
  // Ombre portée (défauts = ancien comportement codé en dur : noir, 90%, flou 8, décalage 2)
  setV('lmNsShadowColor',   ns.shadowColor || '#000000');
  setV('lmNsShadowOpacity', ns.shadowOpacity != null ? Math.round(ns.shadowOpacity * 100) : 90);
  setV('lmNsShadowBlur',    ns.shadowBlur    != null ? ns.shadowBlur   : 8);
  setV('lmNsShadowOffset',  ns.shadowOffset  != null ? ns.shadowOffset : 2);
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
  ns.rotation    = syncRange('lmNsRot');
  ns.arc         = syncRange('lmNsArc');
  // Ombre portée du pseudo
  ns.shadowColor   = g('lmNsShadowColor') || '#000000';
  ns.shadowOpacity = syncRange('lmNsShadowOpacity') / 100;
  ns.shadowBlur    = syncRange('lmNsShadowBlur');
  ns.shadowOffset  = syncRange('lmNsShadowOffset');
  // Les pseudos SANS taille individuelle suivent la taille globale : on reflète
  // la nouvelle taille globale dans leurs sliders (ceux qui ont une taille
  // individuelle conservent la leur).
  [0,1,2].forEach(i => {
    if (LM.slots[i] && LM.slots[i].nameSize == null) {
      const el = document.getElementById(`lmNameSize${i}`);
      if (el) { el.value = ns.size; const n = el.nextElementSibling; if (n && n.type === 'number') n.value = ns.size; }
    }
  });
  lmRenderPreview();
}

// Taille INDIVIDUELLE d'un pseudo (override de la taille globale). Réglée
// seulement quand l'utilisateur bouge le slider "Taille" de CE pseudo → ni les
// autres pseudos ni la taille globale ne sont touchés (non destructif).
function lmSetNameSize(i, v) {
  if (!LM.slots[i]) return;
  const size = parseFloat(v) || (LM.nameStyle.size || 34);
  LM.slots[i].nameSize = size;
  const el = document.getElementById(`lmNameSize${i}`);
  if (el) { el.value = size; const n = el.nextElementSibling; if (n && n.type === 'number') n.value = size; }
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
  setV('lmRsRot', rs.rotation || 0);
  // Per-rank (per-slot)
  [0,1,2].forEach(i => {
    setV(`lmRankLabel${i}`,  LM.rankLabels[i]);
    setV(`lmRankColor${i}`,  LM.rankColors[i]);
    setV(`lmRankSize${i}`,   LM.slots[i].rankSize);
    setV(`lmRankX${i}`,      LM.slots[i].rankX);
    setV(`lmRankY${i}`,      LM.slots[i].rankY);
    // Espacement par rang. Migration : si un ancien réglage global (rs.spacing)
    // existe et que le rang n'a pas encore le sien, on le reprend.
    const _rsp = (LM.slots[i].rankSpacing != null) ? LM.slots[i].rankSpacing : (rs.spacing || 0);
    setV(`lmRankSp${i}`,     _rsp);
    setV(`lmRankArc${i}`,    LM.slots[i].rankArc || 0);
    // Rotation par rang : repli sur la rotation globale (rs.rotation).
    setV(`lmRankRot${i}`,    (LM.slots[i].rankRot != null) ? LM.slots[i].rankRot : (rs.rotation || 0));
    lmRefreshRankImgUI(i);
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
  rs.rotation    = syncRange('lmRsRot');
  [0,1,2].forEach(i => {
    LM.rankLabels[i]        = g(`lmRankLabel${i}`)  || String(i+1);
    LM.rankColors[i]        = g(`lmRankColor${i}`)  || '#ffffff';
    LM.slots[i].rankSize    = syncRange(`lmRankSize${i}`) || 80;
    LM.slots[i].rankX       = syncRange(`lmRankX${i}`);
    LM.slots[i].rankY       = syncRange(`lmRankY${i}`);
    LM.slots[i].rankSpacing = syncRange(`lmRankSp${i}`);
    LM.slots[i].rankArc     = syncRange(`lmRankArc${i}`);
    LM.slots[i].rankRot     = syncRange(`lmRankRot${i}`);
  });
  lmUpdateRankLabelPreviews();
  lmRenderPreview();
}

// Rotation GLOBALE des classements = « tout faire pivoter » : on propage la
// valeur à chaque rang (curseurs + slot.rankRot), puis lmSyncRanks rend. Ainsi
// le curseur global et les curseurs par rang restent cohérents.
function lmSetAllRankRot(v) {
  v = parseFloat(v) || 0;
  const put = (id) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = v;
    const n = el.nextElementSibling;
    if (n && n.type === 'number') n.value = v;
  };
  put('lmRsRot');
  [0,1,2].forEach(i => put(`lmRankRot${i}`));
  lmSyncRanks();
}
window.lmSetAllRankRot = lmSetAllRankRot;

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

// ── Image de remplacement d'un rang (1ER/2ÈME/3ÈME → image) ──────────────────
function lmRankUploadImg(i) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      LM.rankImgUrls = LM.rankImgUrls || [null,null,null];
      LM.rankImgUrls[i] = r.result;
      const img = new Image();
      img.onload = () => {
        LM.rankImgImgs = LM.rankImgImgs || [null,null,null];
        LM.rankImgImgs[i] = img;
        lmRefreshRankImgUI(i);
        lmRenderPreview();
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  inp.click();
}
window.lmRankUploadImg = lmRankUploadImg;

function lmRankClearImg(i) {
  if (LM.rankImgUrls) LM.rankImgUrls[i] = null;
  if (LM.rankImgImgs) LM.rankImgImgs[i] = null;
  lmRefreshRankImgUI(i);
  lmRenderPreview();
}
window.lmRankClearImg = lmRankClearImg;

// Reflète l'état (image présente ou non) sur le bouton + le bouton "retirer".
function lmRefreshRankImgUI(i) {
  const url = (LM.rankImgUrls && LM.rankImgUrls[i]) || '';
  const btn = document.getElementById(`lmRankImgBtn${i}`);
  const clr = document.getElementById(`lmRankImgClear${i}`);
  if (btn) {
    if (url) {
      btn.style.backgroundImage = `url('${url}')`;
      btn.classList.add('has-img');
      btn.textContent = '';
      btn.title = "Changer l'image du rang";
    } else {
      btn.style.backgroundImage = '';
      btn.classList.remove('has-img');
      btn.textContent = '🖼️';
      btn.title = "Remplacer le rang par une image";
    }
  }
  if (clr) clr.style.display = url ? 'inline-flex' : 'none';
  // Grise les réglages de texte (couleur, espacement, courbure) quand une image
  // est active — ils n'ont plus d'effet sur un rang en image.
  ['lmRankColor','lmRankSp','lmRankArc'].forEach(p => {
    const el = document.getElementById(`${p}${i}`); if (el) el.disabled = !!url;
  });
  const lbl = document.getElementById(`lmRankLabel${i}`);
  if (lbl) lbl.disabled = !!url || LM.rankStyle.numbersOnly;
}
window.lmRefreshRankImgUI = lmRefreshRankImgUI;

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
  // Champs des conversions built-in → LM (pour la parité dans l'aperçu éditeur).
  LM.baseGame      = layout.baseGame      || null;
  LM.hideRanks     = !!layout.hideRanks;
  LM.curvedNames   = !!layout.curvedNames;
  LM.T1            = {...(layout.T1 || {})};
  LM.T2            = {...(layout.T2 || {})};
  LM.T3            = {...(layout.T3 || {})};
  LM.slots         = (layout.slots || []).map(s => ({...s}));
  LM.rankLabels    = [...(layout.rankLabels || ['1ER','2ÈME','3ÈME'])];
  LM.rankColors    = [...(layout.rankColors || [])];
  LM.rankStyle     = {...(layout.rankStyle  || {})};
  // Images de remplacement des rangs : restaure les URLs puis recharge les images.
  LM.rankImgUrls   = [...(layout.rankImgUrls || [null,null,null])];
  LM.rankImgImgs   = [null,null,null];
  LM.rankImgUrls.forEach((url, i) => {
    if (!url) return;
    const im = new Image();
    im.onload = () => { LM.rankImgImgs[i] = im; lmRenderPreview(); };
    im.src = url;
  });
  LM.charDataUrls  = [...(layout.charDataUrls || [null,null,null])];
  LM.charImgs      = [null, null, null];
  LM.charCrops     = (layout.charCrops || [{cx:0.5,cy:0.3,zoom:2},{cx:0.5,cy:0.3,zoom:2},{cx:0.5,cy:0.3,zoom:2}]).map(c => ({...c}));
  // Multi-personnages : restaure le nombre + les URLs, puis recharge les images.
  LM.charsPerPlayer = layout.charsPerPlayer || 1;
  LM.charSplit      = layout.charSplit !== false;
  LM.cuts           = (layout.cuts || []).map(c => ({...c}));
  LM.cutGap         = layout.cutGap || 0;
  LM.charUrlsMulti  = (layout.charUrlsMulti || [[],[],[]]).map(a => [...(a||[])]);
  LM.charCropsMulti = (layout.charCropsMulti || [[],[],[]]).map(a => (a||[]).map(c => c ? {...c} : null));
  LM.charImgsMulti  = [[], [], []];
  LM.charUrlsMulti.forEach((arr, i) => (arr || []).forEach((url, k) => {
    if (!url) return;
    const im = new Image(); im.crossOrigin = 'anonymous';
    const put = (x) => { LM.charImgsMulti[i] = LM.charImgsMulti[i] || []; LM.charImgsMulti[i][k] = x; lmRenderPreview(); };
    im.onload = () => put(im);
    im.onerror = () => { const im2 = new Image(); im2.onload = () => put(im2); im2.src = url; };
    im.src = url;
  }));
  // Image de fond par carte : restaure les URLs + cadrages, puis recharge les images.
  LM.slotBgUrls    = [...(layout.slotBgUrls || [null,null,null])];
  LM.slotBgImgs    = [null, null, null];
  LM.slotBgCrops   = (layout.slotBgCrops || [{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1}]).map(c => ({...c}));
  LM.slotBgUrls.forEach((url, i) => {
    if (!url) return;
    const im = new Image();
    im.onload = () => { LM.slotBgImgs[i] = im; lmShowSlotBgUI(i); lmRenderPreview(); };
    im.src = url;
  });
  // Restaure l'event start.gg associé pour que l'auto-import des persos puisse
  // ré-interroger CET event. Layouts sauvegardés avant cette version : pas de
  // eventSlug → on tente de retrouver le graph par nom de jeu (fallback).
  LM._eventSlug = layout.eventSlug || null;
  if (!LM._eventSlug && typeof graphs !== 'undefined' && Array.isArray(graphs)) {
    const gn = (layout.gameName || layout.name || '').trim().toLowerCase();
    const g = gn && graphs.find(gr => gr && gr.eventSlug &&
      ((gr.game || '').trim().toLowerCase() === gn || (gr.eventName || '').trim().toLowerCase() === gn));
    if (g) LM._eventSlug = g.eventSlug;
  }
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
      // Conversion built-in (baseGame) : pas d'image baked → on récupère le
      // mural local du perso (ex. GGST2) via baseGame + le charId du joueur réel,
      // pour que l'aperçu de l'éditeur montre les bons persos.
      if (!LM.charImgs[i] && layout.baseGame && typeof players !== 'undefined' && players[i]?.charId) {
        const mkey = `${layout.baseGame}_${players[i].charId}_${players[i].costume || 1}`;
        if (imgCache[mkey]?._loaded) LM.charImgs[i] = imgCache[mkey]._img;
        else if (typeof preloadMural === 'function') {
          preloadMural(players[i].charId, players[i].costume || 1, layout.baseGame);
          const im = imgCache[mkey];
          if (im) { const _i = i; const _src = im; const t = setInterval(() => { if (_src._loaded) { LM.charImgs[_i] = _src._img; lmRenderPreview(); clearInterval(t); } }, 120); setTimeout(() => clearInterval(t), 4000); }
        }
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
  LM.maxStep = 8; // mode édition : tous les steps déjà visités
  LM._isTransitioning = false;
  lmGoTo(1);
  document.getElementById('lmModal').style.display = 'flex';
  // Réinitialise le zoom/pan de la preview (sinon un zoom résiduel d'une
  // session précédente reste appliqué et l'aperçu paraît "trop zoomé"/rogné).
  if (typeof lmResetPreviewZoom === 'function') lmResetPreviewZoom();
  lmRenderPreview();
}

async function lmFinishAndSave(silent, keepEdit) {
  // Le nom du layout est TOUJOURS le nom du jeu (plus d'étape de nommage manuel).
  const name = (LM.gameName || '').trim() || 'Layout custom';
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
    // Champs des conversions built-in → LM (rétro-compatibles : absents sinon).
    baseGame:    LM.baseGame || null,
    hideRanks:   !!LM.hideRanks,
    curvedNames: !!LM.curvedNames,
    T1: {...LM.T1}, T2: {...LM.T2}, T3: {...LM.T3},
    slots: LM.slots.map(s => ({...s})),
    rankLabels: [...LM.rankLabels],
    rankColors:  [...LM.rankColors],
    rankStyle:   {...LM.rankStyle},
    rankImgUrls: [...(LM.rankImgUrls || [null,null,null])],
    charDataUrls: [...LM.charDataUrls],
    charCrops:   LM.charCrops.map(c => ({...c})),
    charsPerPlayer: LM.charsPerPlayer || 1,
    charUrlsMulti:  (LM.charUrlsMulti || [[],[],[]]).map(a => [...(a||[])]),
    charCropsMulti: (LM.charCropsMulti || [[],[],[]]).map(a => (a||[]).map(c => c ? {...c} : null)),
    slotBgUrls:     [...(LM.slotBgUrls || [null,null,null])],
    slotBgCrops:    (LM.slotBgCrops || []).map(c => c ? {...c} : {cx:0.5,cy:0.5,zoom:1}),
    charSplit:      LM.charSplit !== false,
    cuts:           (LM.cuts || []).map(c => ({...c})),
    cutGap:         LM.cutGap || 0,
    // Event start.gg associé (flux "jeux sans layout") : permet de ré-interroger
    // start.gg pour CET event à la ré-édition (auto-import des persos fiable).
    eventSlug:      LM._eventSlug || null,
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
  // Index où écrire : on tente l'index d'édition, sinon on retrouve par id
  // (robuste pour les auto-enregistrements répétés → jamais de doublon).
  const editIdx = LM._editIdx;
  let saveIdx = (editIdx !== undefined && editIdx >= 0 && coffre[editIdx]?.id === id)
    ? editIdx
    : coffre.findIndex(l => l && l.id === id);
  if (saveIdx >= 0) coffre[saveIdx] = lightLayout;
  else saveIdx = coffre.push(lightLayout) - 1;
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

  // Réinitialiser les marqueurs d'édition — SAUF en auto-enregistrement (keepEdit),
  // où l'on reste en mode édition pour les sauvegardes suivantes. On garde alors
  // un index valide (saveIdx) pour pointer la bonne entrée du coffre.
  if (keepEdit) {
    LM._editIdx = saveIdx;
    LM._editId  = id;   // garde le MÊME id pour les sauvegardes suivantes (pas de doublon, même pour un layout neuf)
  } else {
    LM._editIdx = undefined;
    LM._editId  = undefined;
  }

  // Update game selector
  lmAddToSelector(layout);

  // Ajouter le layout comme nouveau graphe dans la nav multi (haut-droite)
  try {
    if (typeof addCustomLayoutGraph === 'function') {
      await addCustomLayoutGraph(layout);
    }
  } catch(e) { console.warn('[multi-nav] ajout layout custom :', e); }

  // Show celebration — sauf en sauvegarde SILENCIEUSE (ex. auto-mise à jour à la
  // fermeture de l'éditeur en mode édition : le modal est déjà fermé, on ne veut
  // pas rouvrir un écran de célébration).
  if (!silent) lmShowCelebration(layout);
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
    // Slide Layouts Custom = index 2 (après fusion Paramètres dans Joueurs)
    try { tcGo(2); } catch(e) {}
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
  // popup de célébration).
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
// ── Conversion d'un jeu BUILT-IN en layout Layout Maker ───────────────────────
// Produit un objet layout LM fidèle au jeu built-in (GGST/SF6/Tekken 8) pour
// qu'il puisse être édité dans l'éditeur complet. Le champ `baseGame` permet au
// rendu (drawCustomLMLayout) de retrouver les murals locaux (ex. portraits
// GGST2) via getMuralArtUrl. Le fond reste celui du jeu (bgFile → bgDataUrl).
// Retourne null si le jeu n'est pas (encore) convertible.
function lmBuildLayoutFromBuiltin(gameId) {
  const bl = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[gameId] : null;
  if (!bl || bl.slotType === 'custom_lm') return null;
  const gmeta = (typeof GAMES !== 'undefined' && GAMES[gameId]) ? GAMES[gameId] : {};
  const C = (typeof CONFIG !== 'undefined') ? CONFIG : {};
  // Titres depuis l'éditeur de titres standard (CONFIG.T1/T2/T3 ; repère 1400).
  const mkT = (t) => {
    const s = C[t] || {};
    return {
      x: s.x ?? 900, y: s.y ?? 120, size: s.s ?? 44, spacing: s.l ?? 0,
      color: s.color || '#ffffff', strokeColor: s.strokeColor || '#000000',
      strokeWidth: s.strokeWidth ?? 0,
    };
  };
  // Police : titre choisi → police globale des pseudos → Montserrat.
  const globalNameFont = (typeof _nameCfgsMem !== 'undefined' && _nameCfgsMem[gameId]?.globalFont) || '';
  const font = (C.T1 && C.T1.font) || globalNameFont || 'Montserrat';
  const nameSize = (typeof NAME_SIZE_DEFAULTS !== 'undefined' && NAME_SIZE_DEFAULTS[gameId]) || 40;

  const layout = {
    id: `${gameId}__lm`,        // id dérivé : n'écrase PAS le built-in
    baseGame: gameId,           // → murals locaux (getMuralArtUrl) au rendu
    name: (gmeta.name || gameId) + ' (perso)',
    gameName: gmeta.name || gameId,
    createdAt: 0,
    font, fontWeight: '800',
    T1: mkT('T1'), T2: mkT('T2'), T3: mkT('T3'),
    // Fond built-in : URL CDN complète (assetUrl) → se charge partout, comme le
    // rendu natif (le rendu custom_lm lit _lm.bgDataUrl pour charger bgImg).
    bgDataUrl: bl.bgFile ? ((typeof assetUrl === 'function') ? assetUrl(bl.bgFile) : bl.bgFile) : null,
    bgOffsetX: 0.5, bgOffsetY: 0.5, bgBlur: 0, bgDarken: 0, bgZoom: 1.0,
    overlayDataUrl: null,
    gameImgVisible: false,          // les jeux built-in n'ont pas de logo placé
    gameImgDataUrl: null, gameImgUrl: null,
    shape: 'rounded', radius: 24, skew: 0, trapRatio: 0.75,
    strokeColor: '#7769DD', strokeWidth: 0, fillColor: 'transparent',
    slots: [],
    rankLabels: ['1ER', '2ÈME', '3ÈME'],
    rankColors: (typeof RANK_COLORS_BY_GAME !== 'undefined' && RANK_COLORS_BY_GAME[gameId]) || ['#C87DD4', '#F5C842', '#F5C842'],
    rankStyle: { weight: '900', strokeColor: '#000', strokeWidth: 0, numbersOnly: false, rotation: 0 },
    hideRanks: !!bl.hideRanks,
    curvedNames: !!bl.curvedNames,
    rankImgUrls: [null, null, null],
    charDataUrls: [null, null, null],
    charCrops: [{ cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: 1 }],
    charsPerPlayer: 1, charSplit: true, cuts: [], cutGap: 0,
    charUrlsMulti: [[], [], []], charCropsMulti: [[], [], []],
    slotBgUrls: [null, null, null],
    slotBgCrops: [{ cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: 1 }],
    playerNames: ['', '', ''],
    nameColors: ['#ffffff', '#ffffff', '#ffffff'],
    nameStyle: { size: nameSize, weight: '700', color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, spacing: 4, rotation: 0, arc: 0 },
    thumbnail: null, eventSlug: null,
  };

  // ── Géométrie spécifique au jeu ──
  if (bl.slotType === 'circle') {
    // GGST : 3 cercles. r → w=h=2r. Fond noir par cercle (slotBgColor).
    layout.shape = 'circle';
    layout.fillColor = bl.slotBgColor || 'transparent';
    layout.slots = (bl.slots || []).map(s => ({
      cx: s.cx, cy: s.cy, w: s.r * 2, h: s.r * 2,
      nameX: s.cx, nameY: s.nameY,
      rankX: s.rankX, rankY: s.rankY, rankSize: 64,
    }));
  } else {
    // SF6 (torn / polygone), Tekken 8 (trapèze) : à venir.
    return null;
  }
  return layout;
}

// Convertit un jeu built-in en layout LM, l'enregistre dans le coffre, bascule
// le graph courant dessus, et ouvre l'éditeur complet du Layout Maker. Idempotent :
// si la conversion existe déjà dans le coffre, on la réutilise. Retourne false si
// le jeu n'est pas (encore) convertible → l'appelant garde l'éditeur standard.
async function lmConvertBuiltinAndEdit(gameId) {
  const newId = `${gameId}__lm`;
  let coffre = [];
  try { coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]'); } catch (e) {}
  const entry = coffre.find(l => l.id === newId);

  if (!entry) {
    const layout = lmBuildLayoutFromBuiltin(gameId);
    if (!layout) return false;
    layout.id = newId;
    // Enregistre en mémoire (l'objet _lm garde bgDataUrl pour le rendu immédiat).
    lmRegisterLayout(layout);
    // Persiste une COPIE strippée dans le coffre (sans muter l'objet enregistré).
    const copy = JSON.parse(JSON.stringify(layout));
    try { if (typeof coffreStripImagesToIDB === 'function') await coffreStripImagesToIDB(copy); }
    catch (e) { console.warn('[convert] strip', e); }
    coffre.push(copy);
    localStorage.setItem('top8_coffre', JSON.stringify(coffre));
  } else if (!(typeof LAYOUTS !== 'undefined' && LAYOUTS[newId])) {
    // Déjà dans le coffre mais pas encore enregistré pour le rendu.
    const full = JSON.parse(JSON.stringify(entry));
    if (typeof coffreLoadImagesFromIDB === 'function') await coffreLoadImagesFromIDB(full);
    lmRegisterLayout(full);
  }

  // Bascule le contexte courant sur le layout converti + régénère.
  if (typeof graphs !== 'undefined' && Array.isArray(graphs) && graphs.length) {
    const g = graphs[currentGraphIdx];
    if (g) {
      g.game = newId; g.isCustomLayout = true;
      try { await preloadMurals(gameId, g.players || []); } catch (e) {}
    }
    currentGame = newId;
    if (typeof generateAllGraphs === 'function') await generateAllGraphs();
    if (typeof renderMultiPreview === 'function') renderMultiPreview();
    if (typeof gameSelectorMultiRefresh === 'function') gameSelectorMultiRefresh();
  } else {
    try { await preloadMurals(gameId, (typeof players !== 'undefined' ? players : [])); } catch (e) {}
    currentGame = newId;
    if (typeof generatePreview === 'function') generatePreview();
  }

  // Ouvre l'éditeur Layout Maker sur le layout converti.
  if (typeof lmOpenForEdit === 'function') await lmOpenForEdit(newId);
  return true;
}

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
  // Multi-personnages : charge les images CÔTE À CÔTE dans layout.charImgsMulti
  // (utilisé par drawCustomLMLayout pour le rendu final).
  if (!Array.isArray(layout.charCropsMulti)) layout.charCropsMulti = [[],[],[]];
  // Images de remplacement des rangs → chargées pour le rendu de l'app principale.
  if (Array.isArray(layout.rankImgUrls)) {
    layout.rankImgImgs = layout.rankImgImgs || [null,null,null];
    layout.rankImgUrls.forEach((url, i) => {
      if (!url) return;
      const im = new Image();
      im.onload = () => { layout.rankImgImgs[i] = im; };
      im.src = url;
    });
  }
  // Images de FOND par carte → chargées pour le rendu de l'app principale
  // (sinon le fond n'apparaît que dans l'éditeur, pas sur le Top 8 généré).
  if (!Array.isArray(layout.slotBgCrops)) layout.slotBgCrops = [{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1},{cx:0.5,cy:0.5,zoom:1}];
  if (Array.isArray(layout.slotBgUrls)) {
    layout.slotBgImgs = layout.slotBgImgs || [null,null,null];
    layout.slotBgUrls.forEach((url, i) => {
      if (!url) return;
      const im = new Image();
      im.onload = () => { layout.slotBgImgs[i] = im; };
      im.src = url;
    });
  }
  if ((layout.charsPerPlayer || 1) > 1 && Array.isArray(layout.charUrlsMulti)) {
    layout.charImgsMulti = [[], [], []];
    layout.charUrlsMulti.forEach((arr, i) => (arr || []).forEach((url, k) => {
      if (!url) return;
      const im = new Image(); im.crossOrigin = 'anonymous';
      const put = (x) => { layout.charImgsMulti[i] = layout.charImgsMulti[i] || []; layout.charImgsMulti[i][k] = x; };
      im.onload = () => put(im);
      im.onerror = () => { const im2 = new Image(); im2.onload = () => put(im2); im2.src = url; };
      im.src = url;
    }));
  }

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
  // Capture des zones (titres + pseudos) pendant CE rendu, pour les poignées
  // de manipulation directe. Gardé par window._lmtmCapture → aucun effet sur
  // le rendu de la carte finale / du téléchargement.
  window._lmtmRegions = [];
  window._lmtmCapture = true;
  window._lmShowZoneNums = true;   // numéros 1/2/3 visibles SEULEMENT dans l'aperçu d'édition
  lmRenderToCanvas(canvas);
  window._lmtmCapture = false;
  window._lmShowZoneNums = false;
  if (typeof lmTextManipRefresh === 'function') lmTextManipRefresh();
  // Tout changement passe par un re-rendu de l'aperçu → on planifie un
  // auto-enregistrement (en mode édition uniquement, débounce).
  lmScheduleAutoSave();
}

// ── AUTO-ENREGISTREMENT (mode édition) ─────────────────────────────────────────
// À chaque modification (qui re-rend l'aperçu), on planifie une sauvegarde
// SILENCIEUSE débounce ~1,4 s après le dernier changement. On reste en mode
// édition (keepEdit) pour que les sauvegardes suivantes remplacent la même
// entrée (jamais de doublon). N'agit QUE sur un layout déjà existant (en cours
// d'édition) et quand le modal est ouvert.
let _lmAutoSaveTimer = null;
let _lmAutoSaving = false;
let _lmAutoSaveDirty = false;
function lmScheduleAutoSave() {
  if (LM._editId == null && !lmLayoutHasContent()) return; // rien à sauver encore
  const modal = document.getElementById('lmModal');
  if (!modal || modal.style.display === 'none') return;   // modal fermé → rien
  _lmAutoSaveDirty = true;
  if (_lmAutoSaveTimer) clearTimeout(_lmAutoSaveTimer);
  _lmAutoSaveTimer = setTimeout(lmRunAutoSave, 1400);
}
window.lmScheduleAutoSave = lmScheduleAutoSave;
function lmCancelAutoSave() {
  if (_lmAutoSaveTimer) { clearTimeout(_lmAutoSaveTimer); _lmAutoSaveTimer = null; }
  _lmAutoSaveDirty = false;
}
window.lmCancelAutoSave = lmCancelAutoSave;
async function lmRunAutoSave() {
  _lmAutoSaveTimer = null;
  if (LM._editId == null && !lmLayoutHasContent()) return;
  if (_lmAutoSaving) { _lmAutoSaveDirty = true; return; }  // déjà en cours → replanifié à la fin
  _lmAutoSaving = true;
  _lmAutoSaveDirty = false;
  try {
    await lmFinishAndSave(true, true);    // silencieux + garde le mode édition
    lmShowAutoSavedToast();
  } catch (e) { console.warn('[LM] auto-enregistrement :', e); }
  _lmAutoSaving = false;
  if (_lmAutoSaveDirty) lmScheduleAutoSave();   // une modif est arrivée pendant la sauvegarde
}
function lmShowAutoSavedToast() {
  let el = document.getElementById('lmAutoSaveToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lmAutoSaveToast';
    el.className = 'lm-autosave-toast';
    el.textContent = '✓ Enregistré';
    document.body.appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(el._hideT);
  el._hideT = setTimeout(() => el.classList.remove('show'), 1300);
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
  // Pas d'overlay par défaut pour un jeu CONVERTI (baseGame) : son fond contient
  // déjà toute la déco (la pochette, etc.) → l'overlay y mettrait un cadre noir.
  const overlayToDraw = LM.overlayImg || (!LM.baseGame && LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
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
    const ov = overlayImg || (!layout.baseGame && LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
    if (ov) ctx.drawImage(ov, 0, 0, SIZE, SIZE);
    // Image du jeu par-dessus l'overlay
    const gCfg = Object.assign({}, layout, { gameImgImg: gameI });
    lmDrawGameImg(ctx, SIZE, gCfg);
    if (cb) cb();
  }

  // Count all pending async loads
  const charUrls = layout.charDataUrls?.filter(u=>u) || [];
  const slotBgUrls = layout.slotBgUrls || [null,null,null];
  const slotBgCount = slotBgUrls.filter(u=>u).length;
  const hasGameImg = !!(layout.gameImgDataUrl || layout.gameImgUrl);
  let pending = 1 + charUrls.length + slotBgCount + (layout.overlayDataUrl ? 1 : 0) + (hasGameImg ? 1 : 0);
  const charImgs = [null, null, null];
  layout.slotBgImgs = [null, null, null];
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

  // Load slot background images (image de fond par carte)
  slotBgUrls.forEach((url, i) => {
    if (!url) return;
    const img = new Image();
    img.onload  = () => { layout.slotBgImgs[i] = img; tick(); };
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
  // En mode multi-graph, le nom du tournoi du graph est passé via
  // window._multiTournamentName (comme pour drawTitles des layouts intégrés) ;
  // sinon on lit le champ. SANS ça, le snapshot d'un layout custom figeait la
  // valeur du DOM au moment du rendu (souvent le défaut "Lorem Ipsum").
  const tournamentName = (typeof window !== 'undefined' && window._multiTournamentName)
    || document.getElementById('tournamentName')?.value || 'Lorem Ipsum';
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
    const _mw = tc.maxW || 900;   // zone de texte (largeur dispo)
    if ((tc.strokeWidth||0) > 0) {
      ctx.strokeStyle = tc.strokeColor || '#000';
      ctx.lineWidth = tc.strokeWidth * sc;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, tc.x*sc, tc.y*sc, _mw*sc);
    }
    ctx.fillStyle = tc.color || '#ffffff';
    ctx.fillText(text, tc.x*sc, tc.y*sc, _mw*sc);
    if (window._lmtmCapture) (window._lmtmRegions = window._lmtmRegions || [])
      .push({ kind:'title', id:'T'+(i+1), cx:tc.x, y:tc.y, size:tc.size, maxW:_mw });
  });
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
  ctx.letterSpacing='0px';
  ctx.restore();
}

function lmMakeShapePath(ctx, slot, sc, cfg) {
  const cx = slot.cx*sc, cy = slot.cy*sc;
  const w = slot.w*sc/2, h = slot.h*sc/2;
  // Masque PAR CARTE : si ce slot a son propre polygone de découpe (édité via le
  // bouton « Masque »), il PRIME sur la forme globale. Points en coords [0,1]
  // relatives à la boîte du slot ; supporte les coins arrondis (drawMaskPolygonPath).
  if (Array.isArray(slot.maskPolygon) && slot.maskPolygon.length >= 3) {
    const pix = slot.maskPolygon.map(p => ({ x:(cx-w)+p.x*w*2, y:(cy-h)+p.y*h*2, rounded:!!p.rounded }));
    ctx.beginPath();
    if (typeof drawMaskPolygonPath === 'function' && pix.some(p=>p.rounded)) {
      drawMaskPolygonPath(ctx, pix, Math.min(w,h)*0.30);
    } else {
      pix.forEach((p,k)=> k===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath();
    }
    return;
  }
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
      // Voûte = demi-ellipse au sommet de la carte, posée sur des côtés droits,
      // BORNÉE à la boîte du slot. (L'ancienne version utilisait arcTo avec un
      // rayon = largeur → la voûte débordait largement, d'où les arches géantes.)
      const archH   = Math.min(h, w);    // hauteur de la voûte (≤ demi-hauteur)
      const sideTop = cy - h + archH;    // y où la voûte démarre
      ctx.moveTo(cx - w, cy + h);                         // bas-gauche
      ctx.lineTo(cx - w, sideTop);                        // côté gauche
      ctx.ellipse(cx, sideTop, w, archH, 0, Math.PI, 0, false); // sommet bombé (gauche→haut→droite)
      ctx.lineTo(cx + w, cy + h);                         // côté droit
      break;
    }
    case 'circle': {
      // Cercle (ou ovale si la carte n'est pas carrée), rempli sur toute la boîte.
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
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

// ── DÉCOUPE EN RÉGIONS (subdivision récursive) ───────────────────────────────
// Chaque coupe DIVISE la région qui contient son milieu (la ligne s'arrête donc
// aux coupes précédentes au lieu de traverser toute la carte). Coords carte 0-1.
function lmPointInPoly(p, poly) {
  let c = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    if (((yi>p.y) !== (yj>p.y)) && (p.x < (xj-xi)*(p.y-yi)/((yj-yi)||1e-9) + xi)) c = !c;
  }
  return c;
}
function lmClipPolyHalf(poly, cut, keepPos) {
  const cr = (p) => (cut.x2-cut.x1)*(p.y-cut.y1) - (cut.y2-cut.y1)*(p.x-cut.x1);
  const out = [];
  for (let i=0; i<poly.length; i++) {
    const A=poly[i], B=poly[(i+1)%poly.length], ca=cr(A), cb=cr(B);
    const inA = keepPos ? ca>=0 : ca<=0, inB = keepPos ? cb>=0 : cb<=0;
    if (inA) out.push(A);
    if (inA !== inB) { const t = ca/((ca-cb)||1e-9); out.push({ x:A.x+t*(B.x-A.x), y:A.y+t*(B.y-A.y) }); }
  }
  return out;
}
function lmComputeCutRegions(cuts) {
  let regions = [[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]];
  (cuts||[]).forEach(cut => {
    if (!cut) return;
    const mid = { x:(cut.x1+cut.x2)/2, y:(cut.y1+cut.y2)/2 };
    let ri = regions.findIndex(pl => lmPointInPoly(mid, pl));
    if (ri < 0) ri = regions.length - 1;
    const neg = lmClipPolyHalf(regions[ri], cut, false), pos = lmClipPolyHalf(regions[ri], cut, true);
    if (neg.length >= 3 && pos.length >= 3) regions.splice(ri, 1, neg, pos);
  });
  return regions;
}
function lmPolyCentroid(poly) { let x=0, y=0; poly.forEach(p => { x+=p.x; y+=p.y; }); return { x:x/poly.length, y:y/poly.length }; }
function lmEdgeOnBox(A, B) {
  return (Math.abs(A.x)<1e-4&&Math.abs(B.x)<1e-4) || (Math.abs(A.x-1)<1e-4&&Math.abs(B.x-1)<1e-4)
      || (Math.abs(A.y)<1e-4&&Math.abs(B.y)<1e-4) || (Math.abs(A.y-1)<1e-4&&Math.abs(B.y-1)<1e-4);
}
// Polygone (en PX) d'une zone, dont les arêtes de COUPE sont rentrées de g2px vers
// l'intérieur (les bords de carte ne bougent pas). Sert à tracer le contour de
// CHAQUE zone séparée (et non plus seulement le tour de la carte).
function lmInsetRegionPx(regN, left, top, w, h, g2px) {
  let poly = regN.map(p => ({ x: left + p.x*w, y: top + p.y*h }));
  const cN = lmPolyCentroid(regN);
  const ctr = { x: left + cN.x*w, y: top + cN.y*h };
  const LN = regN.length;
  for (let i = 0; i < LN; i++) {
    const A = regN[i], B = regN[(i+1)%LN];
    if (lmEdgeOnBox(A, B)) continue;   // bord de carte : pas d'inset
    const Apx = { x: left+A.x*w, y: top+A.y*h }, Bpx = { x: left+B.x*w, y: top+B.y*h };
    const dx = Bpx.x-Apx.x, dy = Bpx.y-Apx.y, len = Math.hypot(dx,dy)||1, ux = dx/len, uy = dy/len;
    let nx = -uy, ny = ux; if ((ctr.x-Apx.x)*nx + (ctr.y-Apx.y)*ny < 0) { nx = -nx; ny = -ny; }
    const ox = Apx.x + nx*g2px, oy = Apx.y + ny*g2px;
    // Clip du polygone par le demi-plan intérieur { P : (P-O)·n >= 0 }
    const out = [], n2 = poly.length;
    for (let k = 0; k < n2; k++) {
      const C = poly[k], D = poly[(k+1)%n2];
      const dC = (C.x-ox)*nx + (C.y-oy)*ny, dD = (D.x-ox)*nx + (D.y-oy)*ny;
      if (dC >= 0) out.push(C);
      if ((dC >= 0) !== (dD >= 0)) { const t = dC/((dC-dD)||1e-9); out.push({ x: C.x+t*(D.x-C.x), y: C.y+t*(D.y-C.y) }); }
    }
    poly = out;
  }
  return poly;
}

// Dessine un texte centré en (x,y) [px canvas], éventuellement COURBÉ en arc
// et/ou tourné. bendDeg : 0 = droit ; >0 = voûte vers le HAUT (arc-en-ciel) ;
// <0 = vers le BAS. rotDeg : rotation d'ensemble autour de (x,y). Le ctx doit
// déjà avoir font / textBaseline / shadow configurés. Trace le contour (stroke)
// puis le remplissage (fill). Utilisé pour les pseudos ET les classements.
function lmDrawArcableText(ctx, text, x, y, o) {
  const bendDeg   = o.bendDeg || 0;
  const rotDeg    = o.rotDeg  || 0;
  const ls        = o.letterSpacing || 0;
  const hasStroke = !!(o.stroke && o.stroke.width > 0);
  const chars = Array.from(text);
  ctx.save();
  if (rotDeg) { ctx.translate(x, y); ctx.rotate(rotDeg * Math.PI / 180); x = 0; y = 0; }
  ctx.textAlign = 'center';

  // ── Texte DROIT (comportement historique, inchangé quand bendDeg = 0) ──
  if (!bendDeg || chars.length < 2) {
    ctx.letterSpacing = `${ls}px`;
    const mw = o.maxWidth > 0 ? o.maxWidth : 0;
    if (hasStroke) {
      ctx.strokeStyle = o.stroke.color; ctx.lineWidth = o.stroke.width; ctx.lineJoin = 'round';
      mw ? ctx.strokeText(text, x, y, mw) : ctx.strokeText(text, x, y);
    }
    if (o.fill) { ctx.fillStyle = o.fill; mw ? ctx.fillText(text, x, y, mw) : ctx.fillText(text, x, y); }
    ctx.letterSpacing = '0px';
    ctx.restore();
    return;
  }

  // ── Texte en ARC : chaque caractère est posé le long d'un cercle ──
  ctx.letterSpacing = '0px';                       // espacement géré manuellement
  const widths = chars.map(c => ctx.measureText(c).width);
  let totalW = widths.reduce((a, b) => a + b, 0) + ls * (chars.length - 1);
  let squeeze = 1;                                  // condensation si on dépasse la zone
  if (o.maxWidth > 0 && totalW > o.maxWidth) { squeeze = o.maxWidth / totalW; totalW = o.maxWidth; }
  const bend   = bendDeg * Math.PI / 180;
  const absB   = Math.abs(bend);
  const radius = totalW / absB;                     // longueur d'arc = largeur du texte
  const up     = bend > 0;
  const ccy    = up ? y + radius : y - radius;       // centre du cercle
  if (hasStroke) { ctx.strokeStyle = o.stroke.color; ctx.lineWidth = o.stroke.width; ctx.lineJoin = 'round'; }
  let acc = 0;
  for (let i = 0; i < chars.length; i++) {
    const w   = widths[i] * squeeze;
    const ang = ((acc + w / 2) / totalW - 0.5) * absB;   // angle du centre du glyphe depuis l'apex
    acc += w + ls * squeeze;
    const px = x + radius * Math.sin(ang);
    const py = up ? ccy - radius * Math.cos(ang) : ccy + radius * Math.cos(ang);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(up ? ang : -ang);
    if (squeeze !== 1) ctx.scale(squeeze, 1);
    if (hasStroke) ctx.strokeText(chars[i], 0, 0);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fillText(chars[i], 0, 0); }
    ctx.restore();
  }
  ctx.restore();
}

// Dessine une image de perso recadrée pour REMPLIR le rectangle dest (dx,dy,dw,dh),
// piloté par crop={cx,cy,zoom} (cx/cy ∈ [0,1] = point visé, zoom≥1). zoom=1 → "cover".
// Utilisé pour le cadrage individuel des persos en mode multi (DBFZ, etc.).
function lmDrawCharInRect(ctx, im, dx, dy, dw, dh, crop) {
  if (!im || !im.naturalWidth) return;
  const c = crop || { cx:0.5, cy:0.28, zoom:1 };
  const iw = im.naturalWidth, ih = im.naturalHeight;
  const z = Math.max(0.2, c.zoom || 1);
  const destAR = Math.abs(dw / dh) || 1;
  // rectangle source de base = plus grand rect au ratio dest tenant dans l'image
  let sW, sH;
  if (iw / ih > destAR) { sH = ih; sW = ih * destAR; } else { sW = iw; sH = iw / destAR; }
  sW /= z; sH /= z;
  let sx = iw * (c.cx ?? 0.5) - sW / 2;
  let sy = ih * (c.cy ?? 0.28) - sH / 2;
  sx = Math.max(0, Math.min(iw - sW, sx));
  sy = Math.max(0, Math.min(ih - sH, sy));
  ctx.drawImage(im, sx, sy, sW, sH, dx, dy, dw, dh);
}
window.lmDrawCharInRect = lmDrawCharInRect;

function lmDrawOneSlot(ctx, slot, idx, sc, img, crop, name, cfg) {
  const cx = slot.cx*sc, cy = slot.cy*sc;
  const w = slot.w*sc, h = slot.h*sc;
  const rankColors = cfg.rankColors || ['#C87DD4','#F5C842','#F5C842'];

  ctx.save();

  // Mode "découpe avec espacement" : on NE remplit PAS toute la carte (sinon
  // l'écart entre zones prendrait la couleur de fond — c'était le "noir" gênant) ;
  // on remplit chaque zone individuellement (plus bas), l'écart laisse voir le
  // FOND derrière la carte.
  // Espacement entre zones : par CARTE (slot.cutGap) avec repli sur le global
  // (cfg.cutGap, réglé dans l'éditeur de découpe) → chaque carte peut avoir le sien.
  const _slotGap = (slot.cutGap != null) ? slot.cutGap : (cfg.cutGap || 0);
  const _gapMode = (Array.isArray(cfg.cuts) ? cfg.cuts.filter(Boolean).length : 0) > 0 && _slotGap > 0;

  // Clip + fill
  lmMakeShapePath(ctx, slot, sc, cfg);
  if (cfg.fillColor && cfg.fillColor !== 'transparent' && !_gapMode) {
    ctx.fillStyle = cfg.fillColor;
    ctx.fill();
  }

  // Image de fond PAR CARTE : clippée à la forme, dessinée SOUS le personnage,
  // avec cadrage zoom/position (slotBgCrops). Pas en mode espacement (gaps).
  const _bgImg = cfg.slotBgImgs && cfg.slotBgImgs[idx];
  if (_bgImg && _bgImg.naturalWidth && !_gapMode) {
    ctx.save();
    lmMakeShapePath(ctx, slot, sc, cfg);
    ctx.clip();
    lmDrawCharInRect(ctx, _bgImg, cx - w/2, cy - h/2, w, h, cfg.slotBgCrops && cfg.slotBgCrops[idx]);
    ctx.restore();
  }

  // Personnage(s)
  const _cuts = (Array.isArray(cfg.cuts) ? cfg.cuts.filter(Boolean) : []);
  const _imgsArr = (Array.isArray(cfg.charImgsMulti) ? (cfg.charImgsMulti[idx] || []) : []);
  // Mode multi actif si plusieurs persos OU au moins une découpe. Les ZONES sont
  // définies par les coupes (coupes+1) ; sinon bandes auto selon les images.
  const _multiActive = (cfg.charsPerPlayer > 1 || _cuts.length > 0) && (_imgsArr.some(Boolean) || _cuts.length > 0);
  if (_multiActive) {
    const left = cx - w/2, top = cy - h/2;
    if (_cuts.length) {
      // ── Découpe MANUELLE : SUBDIVISION RÉCURSIVE — chaque coupe divise la zone
      // qui contient son milieu, donc sa ligne s'ARRÊTE aux coupes précédentes
      // (pas de croisements parasites). Zones = coupes + 1.
      const regions = lmComputeCutRegions(_cuts);
      const n = regions.length;
      const toPx = (p) => ({ x: left + p.x*w, y: top + p.y*h });
      const g2 = (_slotGap * sc) / 2;   // demi-espacement entre zones (px, par carte)
      // clip au demi-plan intérieur (côté centroïde) de l'arête A→B, décalé vers
      // l'intérieur de `off` px (0 pour les bords de carte, g2 pour les coupes).
      const clipEdgeHalf = (A, B, ctr, off) => {
        const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy)||1, ux=dx/len, uy=dy/len;
        let nx=-uy, ny=ux; if ((ctr.x-A.x)*nx+(ctr.y-A.y)*ny < 0) { nx=-nx; ny=-ny; }
        const L=(Math.abs(w)+Math.abs(h))*4;
        const ax=A.x+nx*off-ux*L, ay=A.y+ny*off-uy*L, bx=B.x+nx*off+ux*L, by=B.y+ny*off+uy*L;
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(bx+nx*L,by+ny*L); ctx.lineTo(ax+nx*L,ay+ny*L); ctx.closePath(); ctx.clip();
      };
      for (let k=0;k<n;k++){
        const ptsN=regions[k], LN=ptsN.length, pts=ptsN.map(toPx), ctr=toPx(lmPolyCentroid(ptsN));
        ctx.save();
        lmMakeShapePath(ctx, slot, sc, cfg); ctx.clip();
        for (let i=0;i<LN;i++){ const off = lmEdgeOnBox(ptsN[i], ptsN[(i+1)%LN]) ? 0 : g2; clipEdgeHalf(pts[i], pts[(i+1)%LN], ctr, off); }
        // En mode espacement, on remplit CHAQUE zone (sous le perso / zones vides)
        // ici — pas toute la carte — pour que l'écart reste transparent (fond visible).
        if (_gapMode && cfg.fillColor && cfg.fillColor !== 'transparent') { ctx.fillStyle = cfg.fillColor; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height); }
        const im=_imgsArr[k];
        if (im) {
          // Cadrage par perso : on remplit la bounding-box de la ZONE (le clip
          // polygonal au-dessus garde la forme exacte), pilotée par charCropsMulti.
          const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
          const bx=Math.min(...xs), byy=Math.min(...ys), bw=Math.max(...xs)-bx, bh=Math.max(...ys)-byy;
          lmDrawCharInRect(ctx, im, bx, byy, bw, bh, cfg.charCropsMulti?.[idx]?.[k]);
        }
        ctx.restore();
      }
      if (cfg.charSplit !== false) {
        ctx.save(); lmMakeShapePath(ctx, slot, sc, cfg); ctx.clip();
        ctx.strokeStyle = cfg.strokeColor || '#7769DD';
        ctx.lineWidth = Math.max(2, (cfg.strokeWidth||4)*sc); ctx.lineCap='round'; ctx.lineJoin='round';
        // Traits de coupe SEULEMENT quand il n'y a pas d'espacement : avec un
        // écart, c'est l'écart (fond visible) qui sépare → on ne trace pas de
        // ligne (sinon "ligne | écart | ligne", pas net).
        if (g2 <= 0.5) {
          regions.forEach(pl => { const ctr=toPx(lmPolyCentroid(pl)), L=pl.length;
            for (let i=0;i<L;i++){ const A=pl[i], B=pl[(i+1)%L]; if (lmEdgeOnBox(A,B)) continue;
              const a=toPx(A), b=toPx(B); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } });
        }
        // Numéros 1/2/3 : repère d'ÉDITION uniquement (window._lmShowZoneNums),
        // jamais dans le visuel final / l'export / la vignette.
        if (window._lmShowZoneNums) {
          const numSize=Math.min(w,h)*0.2;
          ctx.font=`900 ${Math.round(numSize)}px ${cfg.font||'Montserrat'}, sans-serif`;
          ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
          for (let k=0;k<n;k++){ const c=toPx(lmPolyCentroid(regions[k])); const mx=c.x, my=c.y;
            ctx.lineWidth=numSize*0.18; ctx.strokeStyle='rgba(0,0,0,0.82)'; ctx.strokeText(String(k+1),mx,my);
            ctx.fillStyle='#ffffff'; ctx.fillText(String(k+1),mx,my); }
        }
        ctx.restore();
      }
    } else {
      // ── Découpe AUTO : N bandes verticales égales (N = persos/joueur) ──
      // Indexées par k pour rester alignées avec charCropsMulti/charImgsMulti.
      const n = Math.max(1, cfg.charsPerPlayer || _imgsArr.filter(Boolean).length || 1);
      const stripW = w / n;
      for (let k=0;k<n;k++) {
        const im = _imgsArr[k];
        if (!im) continue;
        ctx.save();
        lmMakeShapePath(ctx, slot, sc, cfg); ctx.clip();
        ctx.beginPath(); ctx.rect(left + k*stripW, top, stripW, h); ctx.clip();
        lmDrawCharInRect(ctx, im, left + k*stripW, top, stripW, h, cfg.charCropsMulti?.[idx]?.[k]);
        ctx.restore();
      }
      if (n > 1 && cfg.charSplit !== false) {
        ctx.save();
        lmMakeShapePath(ctx, slot, sc, cfg); ctx.clip();
        ctx.strokeStyle = cfg.strokeColor || '#7769DD';
        ctx.lineWidth = Math.max(2, (cfg.strokeWidth || 4) * sc); ctx.lineCap = 'round';
        for (let k = 1; k < n; k++) { const xd = left + k*stripW; ctx.beginPath(); ctx.moveTo(xd, top); ctx.lineTo(xd, top + h); ctx.stroke(); }
        // Numéros 1/2/3 : repère d'ÉDITION uniquement, pas dans le visuel final.
        if (window._lmShowZoneNums) {
          const numSize = Math.min(stripW * 0.5, h * 0.3);
          ctx.font = `900 ${Math.round(numSize)}px ${cfg.font || 'Montserrat'}, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
          for (let k = 0; k < n; k++) {
            const xc = left + k*stripW + stripW/2, yc = top + h*0.93;
            ctx.lineWidth = numSize * 0.18; ctx.strokeStyle = 'rgba(0,0,0,0.82)';
            ctx.strokeText(String(k+1), xc, yc);
            ctx.fillStyle = '#ffffff'; ctx.fillText(String(k+1), xc, yc);
          }
        }
        ctx.restore();
      }
    }
  } else if (img) {
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

  // Stroke (contour)
  if ((cfg.strokeWidth||0) > 0) {
    ctx.strokeStyle = cfg.strokeColor || '#7769DD';
    ctx.lineWidth   = cfg.strokeWidth * sc;
    ctx.lineJoin    = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = (cfg.strokeColor||'#7769DD') + '88';
    const _cutsS = (Array.isArray(cfg.cuts) ? cfg.cuts.filter(Boolean) : []);
    const _slotGapS = (slot.cutGap != null) ? slot.cutGap : (cfg.cutGap || 0);
    const _g2S = (_slotGapS * sc) / 2;
    if (_cutsS.length && _g2S > 0.5) {
      // Zones SÉPARÉES (espacement > 0) : un contour autour de CHAQUE zone, pas
      // seulement le tour de la carte. Arêtes de coupe rentrées du gap (g2).
      // Halo réduit (borné au demi-écart) pour ne pas "remplir" l'écart.
      ctx.shadowBlur = Math.min(8*sc, _g2S);
      const left = cx - w/2, top = cy - h/2;
      lmComputeCutRegions(_cutsS).forEach(regN => {
        const poly = lmInsetRegionPx(regN, left, top, w, h, _g2S);
        if (poly.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.stroke();
      });
    } else {
      ctx.shadowBlur = 14*sc;
      lmMakeShapePath(ctx, slot, sc, cfg);
      ctx.stroke();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Rank : IMAGE de remplacement (si fournie) OU texte/numéro.
  // hideRanks : layouts dérivés d'un jeu built-in dont les numéros 1/2/3 sont
  // déjà baked dans le fond (ex. GGST) → on ne dessine aucun rang par-dessus.
  if (!cfg.hideRanks) {
  const rs = cfg.rankStyle || {};
  // Rotation PAR RANG (slot.rankRot) avec repli sur la rotation globale (rs.rotation).
  const _rankRot = (slot.rankRot != null) ? slot.rankRot : (rs.rotation || 0);
  const _rankImg = (cfg.rankImgImgs && cfg.rankImgImgs[idx]) || null;
  if (_rankImg && _rankImg.naturalWidth) {
    // ── Image remplaçant le classement ── Taille = HAUTEUR de l'image ; même
    // ancrage que le texte (centrée horizontalement dans la zone, bas calé sur la
    // « baseline » Y) → basculer texte↔image ne déplace pas le rang.
    const hImg = (slot.rankSize || 80) * sc;
    const wImg = hImg * (_rankImg.naturalWidth / _rankImg.naturalHeight);
    ctx.font = `900 ${Math.round((slot.rankSize||80)*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
    ctx.textAlign = 'center';
    const _lbl  = (cfg.rankLabels || ['1ER','2ÈME','3ÈME'])[idx] || String(idx + 1);
    const _rnat = ctx.measureText(_lbl).width / sc;
    const _rmw  = slot.rankMaxW || Math.max(40, _rnat);
    const _rcx  = slot.rankX + _rmw / 2;
    ctx.save();
    ctx.translate(_rcx * sc, slot.rankY * sc - hImg / 2);
    const _rot = _rankRot * Math.PI / 180; if (_rot) ctx.rotate(_rot);
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8 * sc; ctx.shadowOffsetY = 2 * sc;
    ctx.drawImage(_rankImg, -wImg / 2, -hImg / 2, wImg, hImg);
    ctx.restore();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (window._lmtmCapture) (window._lmtmRegions = window._lmtmRegions || []).push({
      kind: 'rank', idx, cx: slot.rankX, y: slot.rankY, size: (slot.rankSize || 80),
      maxW: _rmw, rot: _rankRot, align: 'left',
    });
  } else {
  // Rank number/label
  const numColor = rankColors[idx] || '#ffffff';
  const rankWeight = rs.weight || '900';
  const rankLabel = rs.numbersOnly
    ? String(idx + 1)
    : ((cfg.rankLabels || ['1ER','2ÈME','3ÈME'])[idx] || String(idx + 1));
  ctx.font = `${rankWeight} ${Math.round((slot.rankSize||80)*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // Espacement par rang (slot.rankSpacing) ; repli sur l'ancien global rs.spacing.
  const _rsp = (slot.rankSpacing != null) ? slot.rankSpacing : (rs.spacing || 0);
  ctx.letterSpacing = `${_rsp*sc}px`;
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6*sc;
  // Zone de texte : rankX = bord GAUCHE de la zone, largeur = rankMaxW (par défaut
  // = largeur naturelle du label → place inchangée par rapport à l'ancien rendu
  // aligné à gauche). Le texte est CENTRÉ dans la zone (centre = rankX+zone/2),
  // donc en étirant la zone le classement se recentre au lieu de rester collé à
  // gauche. La largeur est passée en maxWidth → le texte se condense s'il dépasse.
  const _rnat = ctx.measureText(rankLabel).width / sc;   // largeur naturelle (REF, espacement inclus)
  const _rmw  = slot.rankMaxW || Math.max(40, _rnat);    // zone (REF)
  const _rcx  = slot.rankX + _rmw / 2;                   // centre de la zone (REF)
  // Dessin du classement : droit, tourné (rs.rotation) et/ou courbé en arc
  // (slot.rankArc), centré sur (_rcx, rankY).
  lmDrawArcableText(ctx, rankLabel, _rcx*sc, slot.rankY*sc, {
    bendDeg: slot.rankArc || 0,
    rotDeg:  _rankRot,
    letterSpacing: _rsp * sc,
    fill:   numColor,
    stroke: { color: rs.strokeColor || '#000', width: (rs.strokeWidth || 0) * sc },
    maxWidth: _rmw * sc,
  });
  // Capture pour la poignée : boîte = [rankX, rankX+zone] (bord gauche = rankX) ;
  // le texte y est centré (l'overlay tourne autour du centre de la boîte).
  if (window._lmtmCapture) (window._lmtmRegions = window._lmtmRegions || []).push({
    kind: 'rank', idx, cx: slot.rankX, y: slot.rankY, size: (slot.rankSize || 80),
    maxW: _rmw, rot: _rankRot, align: 'left',
  });
  ctx.letterSpacing = '0px';
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }
  } // fin if (!cfg.hideRanks)

  // Name
  if (name) {
    const ns = cfg.nameStyle || {size:34,weight:'800',color:'#fff',strokeWidth:0,spacing:4};
    const nameColors = cfg.nameColors || null;
    const nameColor = (nameColors && nameColors[idx]) ? nameColors[idx] : (ns.color || '#ffffff');
    const nameX = (slot.nameX != null) ? slot.nameX * sc : cx;
    const _refNameX = (slot.nameX != null) ? slot.nameX : slot.cx; // coord REF
    const _nmw = slot.nameMaxW || 0;                                // zone de texte
    // Taille par pseudo (slot.nameSize) ; repli sur la taille globale (ns.size).
    const _nsz = (slot.nameSize != null) ? slot.nameSize : (ns.size || 34);
    ctx.font = `${ns.weight||'800'} ${Math.round(_nsz*sc)}px ${cfg.font||'Montserrat'}, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = `${(ns.spacing||4)*sc}px`;
    // Dessin du pseudo : droit, tourné (ns.rotation) et/ou courbé en arc (ns.arc).
    const drawName = () => {
      if (cfg.curvedNames && typeof drawCurvedText === 'function') {
        // Parité GGST : pseudo courbé autour du cercle (centre à -π/4, rayon = bord
        // + 22px). ROTATION tourne le texte autour du cercle, COURBURE ajuste le
        // rayon, et couleur / contour / espacement sont respectés.
        const _r = (slot.w / 2);
        const centerA = -Math.PI / 4 + ((ns.rotation || 0) * Math.PI / 180);
        const radius  = Math.max(12, ((_r + 22) - (ns.arc || 0)) * sc);
        ctx.fillStyle = nameColor;
        drawCurvedText(ctx, name.toUpperCase(), cx, cy, radius, centerA, {
          letterSpacing: (ns.spacing || 4) * sc,
          strokeColor:   ns.strokeColor || '#000',
          strokeWidth:   (ns.strokeWidth || 0) * sc,
        });
      } else {
        lmDrawArcableText(ctx, name.toUpperCase(), nameX, slot.nameY*sc, {
          bendDeg: ns.arc || 0,
          rotDeg:  ns.rotation || 0,
          letterSpacing: (ns.spacing || 4) * sc,
          fill:   nameColor,
          stroke: { color: ns.strokeColor || '#000', width: (ns.strokeWidth || 0) * sc },
          maxWidth: _nmw > 0 ? _nmw * sc : 0,
        });
      }
    };
    // Ombre portée CONTRÔLABLE (couleur/opacité/flou/décalage) et dessinée
    // DERRIÈRE : on rend le pseudo une 1ʳᵉ fois AVEC l'ombre (qui se projette en
    // décalé), puis une 2ᵉ fois SANS ombre par-dessus → l'ombre ne passe plus sur
    // le contour.
    const _shOp = (ns.shadowOpacity != null ? ns.shadowOpacity : 0.9);
    const _shBl = (ns.shadowBlur    != null ? ns.shadowBlur    : 8);
    const _shOf = (ns.shadowOffset  != null ? ns.shadowOffset  : 2);
    if (_shOp > 0 && (_shBl > 0 || _shOf > 0)) {
      const _h  = (ns.shadowColor || '#000000').replace('#','');
      const _hh = _h.length === 3 ? _h.split('').map(c=>c+c).join('') : _h;
      const _sr = parseInt(_hh.slice(0,2),16)||0, _sg = parseInt(_hh.slice(2,4),16)||0, _sb = parseInt(_hh.slice(4,6),16)||0;
      ctx.save();
      ctx.shadowColor   = `rgba(${_sr},${_sg},${_sb},${_shOp})`;
      ctx.shadowBlur    = _shBl * sc;
      ctx.shadowOffsetX = _shOf * sc;
      ctx.shadowOffsetY = _shOf * sc;
      drawName();
      ctx.restore();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    drawName();
    if (window._lmtmCapture) (window._lmtmRegions = window._lmtmRegions || [])
      .push({ kind:'name', idx, cx:_refNameX, y:slot.nameY, size:_nsz, maxW: slot.nameMaxW || 360, rot: ns.rotation || 0 });
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
    // Layout dérivé d'un jeu built-in (champ baseGame) : on résout D'ABORD le
    // mural local du perso via son charId (ex. portraits GGST2), exactement comme
    // le rendu natif — sinon l'image start.gg (charImgUrl) primerait et on
    // perdrait le mural. La clé cache est `${baseGame}_${charId}_${costume}`.
    if (!img && layout.baseGame && pl?.charId && typeof getMuralArtUrl === 'function') {
      const mkey = `${layout.baseGame}_${pl.charId}_${pl.costume || 1}`;
      if (!imgCache[mkey] && typeof preloadMural === 'function') preloadMural(pl.charId, pl.costume || 1, layout.baseGame);
      if (imgCache[mkey]?._loaded) img = imgCache[mkey]._img;
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
  const ov = layout.overlayImg || (!layout.baseGame && LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
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

// ── ÉDITEUR DE DÉCOUPE (multi-persos : tracer les lignes de coupe) ───────────
// L'utilisateur clique 2 points pour tracer une ligne de coupe entre 2 persos.
// N persos → N-1 coupes. Stocké dans LM.cuts (coords carte 0-1) ; appliqué à
// chaque carte (rendu en couches, cf. lmDrawOneSlot).
const LM_CE = { pending: null, selected: -1, drag: null, MAX_CUTS: 4, SIZE: 360, MARGIN: 22, get DRAW() { return this.SIZE - 2*this.MARGIN; } };

// Distance (coords carte 0-1) d'un point au SEGMENT d'une découpe.
function lmCEDistSeg(px, py, c) {
  const dx=c.x2-c.x1, dy=c.y2-c.y1, l2=dx*dx+dy*dy;
  let t = l2 ? ((px-c.x1)*dx + (py-c.y1)*dy)/l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px-(c.x1+t*dx), py-(c.y1+t*dy));
}
// Index de la découpe la plus proche du clic (sous le seuil), sinon -1.
function lmCEHitCut(nx, ny) {
  const cuts = LM.cuts || []; let best = -1, bestD = 0.05;
  for (let i=0;i<cuts.length;i++){ const d = lmCEDistSeg(nx, ny, cuts[i]); if (d < bestD) { bestD = d; best = i; } }
  return best;
}

function lmOpenCutEditor() {
  const modal = document.getElementById('lmCutModal');
  if (!modal) return;
  if (!Array.isArray(LM.cuts)) LM.cuts = [];
  LM_CE.pending = null; LM_CE.selected = -1; LM_CE.drag = null;
  modal.style.display = 'flex';
  const cv = document.getElementById('lmCutCanvas');
  if (cv) {
    cv.width = LM_CE.SIZE; cv.height = LM_CE.SIZE;
    cv.onmousedown   = lmCEClick;
    cv.oncontextmenu = (e) => { e.preventDefault(); lmCEDeleteAt(e); };  // clic droit = supprimer la découpe
    cv.ontouchstart  = (e) => { e.preventDefault(); const t = e.touches[0]; lmCEClick({ clientX: t.clientX, clientY: t.clientY }); };
  }
  const gapEl = document.getElementById('lmCutGap');
  if (gapEl) { gapEl.value = LM.cutGap || 0; const num = gapEl.nextElementSibling; if (num && num.type === 'number') num.value = LM.cutGap || 0; }
  lmCEUpdateHint(); lmCEDraw();
}
function lmCutClose() { const m = document.getElementById('lmCutModal'); if (m) m.style.display = 'none'; LM_CE.pending = null; lmRenderPreview(); }
function lmCutClear() { LM.cuts = []; LM_CE.pending = null; lmCEUpdateHint(); lmCEDraw(); lmRenderPreview(); }
function lmCutSetGap(v) {
  LM.cutGap = Math.max(0, Math.min(60, parseFloat(v) || 0));
  const el = document.getElementById('lmCutGap'); if (el) { el.value = LM.cutGap; const num = el.nextElementSibling; if (num && num.type === 'number') num.value = LM.cutGap; }
  lmCEDraw(); lmRenderPreview();
}
window.lmOpenCutEditor = lmOpenCutEditor; window.lmCutClose = lmCutClose; window.lmCutClear = lmCutClear; window.lmCutSetGap = lmCutSetGap;

function lmCEUpdateHint() {
  const h = document.getElementById('lmCutHint'); if (!h) return;
  const cur = (LM.cuts || []).length;
  const edit = cur ? '<br><span style="opacity:.8">↔️ Glisse une ligne pour la déplacer • clic droit dessus pour la supprimer.</span>' : '';
  if (LM_CE.pending) { h.innerHTML = '🖱️ Clique le <strong>2e point</strong> de la découpe.'; return; }
  if (cur >= LM_CE.MAX_CUTS) { h.innerHTML = `✅ ${cur} découpes → ${cur+1} zones (max).` + edit; return; }
  if (cur === 0) h.innerHTML = '🖱️ Clique <strong>2 points</strong> pour tracer une découpe (→ 2 zones).';
  else h.innerHTML = `✅ ${cur} découpe(s) → ${cur+1} zones. Clique <strong>2 points</strong> pour en ajouter.` + edit;
}
function lmCEPos(e) {
  const cv = document.getElementById('lmCutCanvas'); const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
  return { nx: (x - LM_CE.MARGIN) / LM_CE.DRAW, ny: (y - LM_CE.MARGIN) / LM_CE.DRAW };
}
function lmCEClick(e) {
  const p = lmCEPos(e);
  const nx = Math.max(0, Math.min(1, p.nx)), ny = Math.max(0, Math.min(1, p.ny));
  // Clic SUR une découpe existante (et pas en train de poser un point) → on la
  // sélectionne et on démarre son déplacement (glisser).
  if (!LM_CE.pending) {
    const hit = lmCEHitCut(nx, ny);
    if (hit >= 0) {
      LM_CE.selected = hit;
      LM_CE.drag = { idx: hit, startX: nx, startY: ny, cut0: { ...LM.cuts[hit] } };
      window.addEventListener('mousemove', lmCEDragMove);
      window.addEventListener('mouseup', lmCEDragUp, { once: true });
      lmCEUpdateHint(); lmCEDraw();
      return;
    }
  }
  // Sinon : ajout d'une découpe (2 points).
  if ((LM.cuts || []).length >= LM_CE.MAX_CUTS && !LM_CE.pending) return;
  if (!LM_CE.pending) { LM_CE.pending = { x: nx, y: ny }; }
  else {
    LM.cuts.push({ x1: LM_CE.pending.x, y1: LM_CE.pending.y, x2: nx, y2: ny });
    LM_CE.pending = null; LM_CE.selected = LM.cuts.length - 1;
    LM.charsPerPlayer = Math.max(LM.charsPerPlayer || 1, LM.cuts.length + 1);
    if (typeof lmAutoImportChars === 'function') lmAutoImportChars();
    lmRenderPreview();
  }
  lmCEUpdateHint(); lmCEDraw();
}
function lmCEDragMove(e) {
  if (!LM_CE.drag) return;
  const p = lmCEPos(e);
  const c0 = LM_CE.drag.cut0;
  // translation rigide, bornée pour garder les 2 extrémités dans la carte
  let dx = (Math.max(0,Math.min(1,p.nx))) - LM_CE.drag.startX;
  let dy = (Math.max(0,Math.min(1,p.ny))) - LM_CE.drag.startY;
  dx = Math.max(-Math.min(c0.x1,c0.x2), Math.min(1-Math.max(c0.x1,c0.x2), dx));
  dy = Math.max(-Math.min(c0.y1,c0.y2), Math.min(1-Math.max(c0.y1,c0.y2), dy));
  LM.cuts[LM_CE.drag.idx] = { x1:c0.x1+dx, y1:c0.y1+dy, x2:c0.x2+dx, y2:c0.y2+dy };
  lmCEDraw(); lmRenderPreview();
}
function lmCEDragUp() { window.removeEventListener('mousemove', lmCEDragMove); LM_CE.drag = null; lmCEUpdateHint(); }
function lmCEDeleteAt(e) {
  const p = lmCEPos(e);
  const hit = lmCEHitCut(Math.max(0,Math.min(1,p.nx)), Math.max(0,Math.min(1,p.ny)));
  if (hit < 0) return;
  LM.cuts.splice(hit, 1);
  LM_CE.selected = -1; LM_CE.pending = null;
  LM.charsPerPlayer = Math.max(1, LM.cuts.length + 1);
  lmCEUpdateHint(); lmCEDraw(); lmRenderPreview();
}
function lmCEDraw() {
  const cv = document.getElementById('lmCutCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d'); const S = LM_CE.SIZE, M = LM_CE.MARGIN, D = LM_CE.DRAW;
  ctx.clearRect(0, 0, S, S);
  const slot = { cx: S/2, cy: S/2, w: D, h: D };
  const cuts = (LM.cuts || []).filter(Boolean);
  const left = M, top = M, w = D, h = D;
  const TINTS = ['rgba(255,90,90,0.5)','rgba(90,200,120,0.5)','rgba(90,150,255,0.5)','rgba(240,200,80,0.5)','rgba(200,120,255,0.5)'];
  const toPx = (p) => ({ x: left + p.x*w, y: top + p.y*h });
  const regions = lmComputeCutRegions(cuts);   // subdivision récursive (coupes s'arrêtent)
  const n = regions.length;
  // demi-espacement, ramené à l'échelle de l'aperçu (cutGap est en px réf / largeur slot)
  const g2 = ((LM.cutGap || 0) * (D / (LM.slots?.[0]?.w || 352))) / 2;
  const clipEdgeHalf = (A, B, ctr, off) => {
    const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy)||1, ux=dx/len, uy=dy/len;
    let nx=-uy, ny=ux; if ((ctr.x-A.x)*nx+(ctr.y-A.y)*ny < 0) { nx=-nx; ny=-ny; }
    const L=(w+h)*4, ax=A.x+nx*off-ux*L, ay=A.y+ny*off-uy*L, bx=B.x+nx*off+ux*L, by=B.y+ny*off+uy*L;
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(bx+nx*L,by+ny*L); ctx.lineTo(ax+nx*L,ay+ny*L); ctx.closePath(); ctx.clip();
  };
  // fond de la forme
  ctx.save(); lmMakeShapePath(ctx, slot, 1, LM); ctx.fillStyle = '#241640'; ctx.fill(); ctx.restore();
  // régions teintées (polygones, rétrécis de g2 le long des coupes → espacement)
  for (let k=0;k<n;k++){ const ptsN=regions[k], LN=ptsN.length, pts=ptsN.map(toPx), ctr=toPx(lmPolyCentroid(ptsN));
    ctx.save(); lmMakeShapePath(ctx,slot,1,LM); ctx.clip();
    for(let i=0;i<LN;i++){ const off=lmEdgeOnBox(ptsN[i],ptsN[(i+1)%LN])?0:g2; clipEdgeHalf(pts[i],pts[(i+1)%LN],ctr,off); }
    ctx.fillStyle=TINTS[k%TINTS.length]; ctx.fillRect(0,0,S,S); ctx.restore(); }
  // traits de coupe seulement SANS espacement (sinon l'écart suffit à séparer)
  if (g2 <= 0.5) {
    ctx.save(); lmMakeShapePath(ctx,slot,1,LM); ctx.clip(); ctx.strokeStyle='#ffffff'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.lineJoin='round';
    regions.forEach(pl=>{ for(let i=0;i<pl.length;i++){ const A=pl[i],B=pl[(i+1)%pl.length]; if(lmEdgeOnBox(A,B))continue;
      const a=toPx(A),b=toPx(B); ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke(); } });
    ctx.restore();
  }
  // contour de la forme
  ctx.save(); lmMakeShapePath(ctx,slot,1,LM); ctx.strokeStyle='#7c5cff'; ctx.lineWidth=2.5; ctx.stroke(); ctx.restore();
  // numéros aux centroïdes des régions
  ctx.font='900 26px Montserrat, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
  for(let k=0;k<n;k++){const c=toPx(lmPolyCentroid(regions[k]));ctx.lineWidth=5;ctx.strokeStyle='rgba(0,0,0,0.85)';ctx.strokeText(String(k+1),c.x,c.y);ctx.fillStyle='#fff';ctx.fillText(String(k+1),c.x,c.y);}
  // découpe SÉLECTIONNÉE : segment surligné + poignées (déplaçable / clic droit = supprimer)
  if (LM_CE.selected>=0 && cuts[LM_CE.selected]) {
    const c=cuts[LM_CE.selected], a=toPx({x:c.x1,y:c.y1}), b=toPx({x:c.x2,y:c.y2});
    ctx.save(); ctx.strokeStyle='#ffd34d'; ctx.lineWidth=3; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.setLineDash([]);
    [a,b].forEach(pt=>{ ctx.beginPath(); ctx.arc(pt.x,pt.y,5,0,Math.PI*2); ctx.fillStyle='#ffd34d'; ctx.fill(); ctx.strokeStyle='#000'; ctx.lineWidth=1.5; ctx.stroke(); });
    ctx.restore();
  }
  // point en attente
  if(LM_CE.pending){const px=left+LM_CE.pending.x*w,py=top+LM_CE.pending.y*h;ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fillStyle='#ffd34d';ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.stroke();}
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
  const lmOv = lm.overlayImg || (!lm.baseGame && LM_DEFAULT_OVERLAY._loaded ? LM_DEFAULT_OVERLAY : null);
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
  POINT_R:     4,
  EDGE_THRESH: 14,
};

// Polygone circulaire par défaut (20 points) pour le masque d'une carte ronde.
function _lmDefaultMaskPolygon() {
  if (typeof _defaultCirclePolygon === 'function') {
    try { const p = _defaultCirclePolygon(20); if (Array.isArray(p) && p.length >= 3) return p.map(q => ({...q})); } catch (e) {}
  }
  const n = 20, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) }); }
  return pts;
}

// Écrit les points de l'éditeur vers la bonne cible : masque PAR CARTE
// (LM_PE.targetSlot défini) ou forme globale custom_polygon (sinon).
function _lmPEWritePoints() {
  const t = LM_PE.targetSlot;
  if (t != null && LM.slots && LM.slots[t]) {
    LM.slots[t].maskPolygon = LM_PE.points.map(p => ({...p}));
  } else {
    LM.customPolygon = LM_PE.points.map(p => ({...p}));
    LM.shape = 'custom_polygon';
  }
}

// Retire le masque d'une carte → retour à la forme globale.
function lmClearSlotMask(i) {
  if (LM.slots && LM.slots[i] && LM.slots[i].maskPolygon) {
    delete LM.slots[i].maskPolygon;
    if (typeof lmRenderPreview === 'function') lmRenderPreview();
  }
}
window.lmClearSlotMask = lmClearSlotMask;

// slotIdx (number) → édite le masque de CETTE carte ; sinon → forme globale.
function lmOpenPolyEditor(slotIdx) {
  LM_PE.targetSlot = (typeof slotIdx === 'number') ? slotIdx : null;
  // Snapshot du polygone à éditer
  if (LM_PE.targetSlot != null) {
    const ex = LM.slots?.[LM_PE.targetSlot]?.maskPolygon;
    LM_PE.points = (Array.isArray(ex) && ex.length >= 3) ? ex.map(p => ({...p})) : _lmDefaultMaskPolygon();
  } else {
    LM_PE.points = LM.customPolygon.map(p => ({...p}));
  }
  LM_PE.dragging = null;
  LM_PE.hovering = null;

  const modal = document.getElementById('lmPolyModal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Titre : « Masque de la carte N » en mode masque, sinon « Éditeur de forme ».
  const titleEl = document.getElementById('lmPolyTitle');
  if (titleEl) titleEl.textContent = (LM_PE.targetSlot != null)
    ? `🎭 Masque de la carte ${LM_PE.targetSlot + 1}`
    : 'Éditeur de forme';

  // Prefill name input
  const nameInp = document.getElementById('lmPolyNameInput');
  if (nameInp && !nameInp.value) nameInp.value = 'Ma forme';

  lmPEInitCanvas();
  lmPELoadSavedList();
  lmPEBuildGraphBackdrop();   // fond = aperçu du graph (pour les masques de carte)
  lmPEDraw();
}

// Construit (en cache) un rendu du GRAPH complet, centré sur la carte éditée,
// servant de fond à l'éditeur de masque → on modèle le masque dans le contexte
// réel du Top 8. Le slot ciblé est rendu SANS son masque (perso entier visible).
function lmPEBuildGraphBackdrop() {
  LM_PE._graphCache = null;
  LM_PE._graphCacheBg = null;
  LM_PE._view = null;
  const si = LM_PE.targetSlot;
  if (si == null || typeof LM === 'undefined' || !LM.slots || !LM.slots[si]) return;
  const s = LM.slots[si];
  // Vue carrée centrée sur la carte : la carte occupe ~56% de la vue (du contexte
  // graph autour, tout en gardant la carte assez grande pour éditer les points).
  const frac = 0.56;
  const vsize = Math.max(40, Math.max(s.w, s.h) / frac);
  const gRes = 820;
  // On rend DEUX versions (le masque du slot est désactivé le temps du rendu pour
  // avoir le perso entier) :
  //  - _graphCache   : graph AVEC le perso (montré À L'INTÉRIEUR du masque)
  //  - _graphCacheBg : graph SANS le perso de cette carte (ce qui apparaît À
  //    L'EXTÉRIEUR du masque). lmPEDraw clippe le 1er au polygone en direct.
  try {
    const savedMask = s.maskPolygon;
    if (savedMask) delete s.maskPolygon;
    const savedNums = window._lmShowZoneNums;
    window._lmShowZoneNums = false;

    const off = document.createElement('canvas'); off.width = off.height = gRes;
    if (typeof lmRenderToCanvas === 'function') lmRenderToCanvas(off);
    LM_PE._graphCache = off;

    const savedImg = (LM.charImgs && si < LM.charImgs.length) ? LM.charImgs[si] : undefined;
    const savedFill = LM.fillColor;
    const savedStroke = LM.strokeWidth;
    if (LM.charImgs) LM.charImgs[si] = null;            // cache le perso de la carte
    LM.fillColor = 'transparent';                       // …ET son fond → carte TOTALEMENT
                                                        // absente, on voit le vrai fond derrière.
    LM.strokeWidth = 0;                                 // …ET pas de contour FIGÉ : lmPEDraw
                                                        // le retrace en direct le long du masque.
    const offBg = document.createElement('canvas'); offBg.width = offBg.height = gRes;
    if (typeof lmRenderToCanvas === 'function') lmRenderToCanvas(offBg);
    LM_PE._graphCacheBg = offBg;
    LM.fillColor = savedFill;
    LM.strokeWidth = savedStroke;
    if (LM.charImgs && savedImg !== undefined) LM.charImgs[si] = savedImg;

    window._lmShowZoneNums = savedNums;
    if (savedMask) s.maskPolygon = savedMask;
  } catch (e) { console.warn('[mask] backdrop graph :', e); }
  LM_PE._view = { vx: s.cx - vsize / 2, vy: s.cy - vsize / 2, vsize, gRes };
}

function lmPolyClose() {
  // Plus de bouton "Appliquer sans sauver" : fermer (✕) applique le masque.
  // Les édits sont déjà écrits en direct (lmPELivePreview) ; on sécurise l'état
  // final puis on rafraîchit l'aperçu.
  if (typeof _lmPEWritePoints === 'function') _lmPEWritePoints();
  document.getElementById('lmPolyModal').style.display = 'none';
  if (typeof lmRenderPreview === 'function') lmRenderPreview();
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
  canvas.onwheel       = lmPEWheel;   // molette = zoom de l'aperçu (mode masque)

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
// Boîte (en pixels canvas) où le polygone [0,1] est dessiné/édité.
//  - Édition d'un MASQUE de carte avec aperçu du graph (LM_PE._view défini) :
//    c'est la boîte du SLOT dans la vue zoomée du graph.
//  - Sinon (forme globale) : toute la zone de dessin [M, M+DS].
function _lmPECardBox() {
  const { MARGIN: M, DRAW_SIZE: DS } = LM_PE;
  const si = LM_PE.targetSlot, v = LM_PE._view;
  if (si == null || !v || typeof LM === 'undefined' || !LM.slots || !LM.slots[si]) {
    return { x: M, y: M, w: DS, h: DS };
  }
  const s = LM.slots[si];
  const toX = (rx) => M + ((rx - v.vx) / v.vsize) * DS;
  const toY = (ry) => M + ((ry - v.vy) / v.vsize) * DS;
  return {
    x: toX(s.cx - s.w / 2), y: toY(s.cy - s.h / 2),
    w: (s.w / v.vsize) * DS, h: (s.h / v.vsize) * DS,
  };
}
function lmPENorm(cx, cy) {
  const b = _lmPECardBox();
  return { x: Math.max(0, Math.min(1, (cx - b.x) / b.w)), y: Math.max(0, Math.min(1, (cy - b.y) / b.h)) };
}
function lmPEPixel(p) {
  const b = _lmPECardBox();
  return { x: b.x + p.x * b.w, y: b.y + p.y * b.h };
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

// Zoom de l'aperçu à la molette (mode masque, où il y a une vue du graph).
// On ajuste LM_PE._view.vsize en gardant le point sous le curseur fixe → l'image
// ET les points zooment ensemble (tout se mappe via _view / _lmPECardBox).
function lmPEWheel(e) {
  if (LM_PE.targetSlot == null || !LM_PE._view || typeof LM === 'undefined'
      || !LM.slots || !LM.slots[LM_PE.targetSlot]) return;
  e.preventDefault();
  const v = LM_PE._view;
  const { MARGIN: M, DRAW_SIZE: DS } = LM_PE;
  const pos = lmPEGetPos(e);
  // Point (repère graph) sous le curseur AVANT zoom.
  const fx = (pos.x - M) / DS, fy = (pos.y - M) / DS;
  const refX = v.vx + fx * v.vsize, refY = v.vy + fy * v.vsize;
  // Molette vers le haut (deltaY<0) → zoom IN (vue plus petite).
  const factor = e.deltaY < 0 ? 0.86 : 1.16;
  const base = Math.max(LM.slots[LM_PE.targetSlot].w, LM.slots[LM_PE.targetSlot].h);
  const newVsize = Math.max(base * 0.4, Math.min(base * 4.5, v.vsize * factor));
  // On garde le point sous le curseur fixe.
  v.vx = refX - fx * newVsize;
  v.vy = refY - fy * newVsize;
  v.vsize = newVsize;
  lmPEDraw();
}

function lmPEDblClick(e) {
  // Double-clic sur un point = bascule son angle entre ANGULEUX (carré) et
  // ARRONDI (rond). La suppression d'un point se fait au CLIC DROIT (lmPERemoveAt).
  const pos = lmPEGetPos(e);
  const ptIdx = lmPEFindPoint(pos.x, pos.y);
  if (ptIdx >= 0) {
    LM_PE.points[ptIdx].rounded = !LM_PE.points[ptIdx].rounded;
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
  _lmPEWritePoints();
  lmRenderPreview();
}

// Trace le chemin du polygone d'édition (en pixels canvas), avec coins ARRONDIS
// pour les points marqués `rounded` — cohérent avec le rendu réel du masque
// (drawMaskPolygonPath). L'appelant gère beginPath / clip / fill.
function _lmPEPolyPath(ctx) {
  const pix = LM_PE.points.map(p => ({ ...lmPEPixel(p), rounded: !!p.rounded }));
  if (typeof drawMaskPolygonPath === 'function' && pix.some(p => p.rounded)) {
    const xs = pix.map(p => p.x), ys = pix.map(p => p.y);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    drawMaskPolygonPath(ctx, pix, Math.min(bw, bh) * 0.15);
  } else {
    pix.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
  }
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

  // Aperçu du GRAPH complet en fond (masque par carte) : on dessine le rendu du
  // Top 8, ZOOMÉ et centré sur la carte éditée → on modèle le masque dans le vrai
  // contexte. Le polygone est mappé sur la boîte du slot via _lmPECardBox.
  let hasBackdrop = false;
  if (LM_PE.targetSlot != null && LM_PE._graphCache && LM_PE._view) {
    const v = LM_PE._view, k = v.gRes / 1400;
    const drawGraph = (cv) => ctx.drawImage(cv, v.vx * k, v.vy * k, v.vsize * k, v.vsize * k, M, M, DS, DS);
    ctx.save();
    ctx.beginPath(); ctx.rect(M, M, DS, DS); ctx.clip();
    ctx.fillStyle = '#0c0720'; ctx.fillRect(M, M, DS, DS);  // hors-graph éventuel
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // 1) base : graph SANS la carte ciblée (ni fond ni perso) → le VRAI fond qui
    //    apparaît HORS du masque.
    drawGraph(LM_PE._graphCacheBg || LM_PE._graphCache);
    // 2) contenu de la carte (FOND + perso) clippé AU POLYGONE (en direct) → la
    //    FORME de la carte suit le masque, pas seulement l'image. Hors masque, on
    //    voit donc le fond derrière (le cercle de la carte n'apparaît plus).
    if (pts && pts.length >= 3) {
      ctx.save();
      ctx.beginPath();
      _lmPEPolyPath(ctx);
      ctx.clip();
      const cb = _lmPECardBox();
      if (LM.fillColor && LM.fillColor !== 'transparent') { ctx.fillStyle = LM.fillColor; ctx.fillRect(cb.x, cb.y, cb.w, cb.h); }
      const si = LM_PE.targetSlot, cimg = (LM.charImgs && LM.charImgs[si]);
      if (cimg && cimg.naturalWidth) {
        const c = (LM.charCrops && LM.charCrops[si]) || { cx:0.5, cy:0.5, zoom:1 };
        const ss = Math.min(cimg.naturalWidth, cimg.naturalHeight) / (c.zoom || 1);
        const sx = Math.max(0, Math.min(cimg.naturalWidth  - ss, cimg.naturalWidth  * c.cx - ss/2));
        const sy = Math.max(0, Math.min(cimg.naturalHeight - ss, cimg.naturalHeight * c.cy - ss/2));
        const dS = Math.max(cb.w, cb.h);
        ctx.drawImage(cimg, sx, sy, ss, ss, cb.x + cb.w/2 - dS/2, cb.y + cb.h/2 - dS/2, dS, dS);
      }
      ctx.restore();
    }
    ctx.restore();
    hasBackdrop = true;
  }

  // Grille + bbox : seulement SANS aperçu de graph (sinon ça parasite le rendu).
  if (!hasBackdrop) {
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
  } // fin if (!hasBackdrop) : grille + bbox masquées sous l'aperçu de graph

  if (pts.length < 2) return;

  // Find closest edge for highlight
  const { dist: eDist, edgeIdx: eIdx } = lmPEFindEdge(LM_PE._mx, LM_PE._my);
  const showEdge = eDist < LM_PE.EDGE_THRESH && LM_PE.dragging === null && LM_PE.hovering === null;

  // Voile : on assombrit TOUT ce qui est HORS du polygone (toute la zone de
  // dessin) → la zone gardée (le masque) ressort nettement, et au glissement
  // d'un point la frontière clair/sombre bouge en direct (édition bien visible).
  if (hasBackdrop) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(M, M, DS, DS);
    _lmPEPolyPath(ctx);
    ctx.fillStyle = 'rgba(6,3,16,0.5)';
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Contour LIVE de la carte : on retrace son bord le long du polygone (le fond
  // pré-rendu n'a plus de contour figé) → la bordure suit l'édition en direct,
  // coins arrondis compris. Dessiné APRÈS le voile pour ne pas être assombri.
  if (hasBackdrop && (LM.strokeWidth || 0) > 0 && typeof _lmPECardBox === 'function') {
    const cbC = _lmPECardBox();
    const slotEd = LM.slots && LM.slots[LM_PE.targetSlot];
    if (cbC && slotEd) {
      ctx.save();
      ctx.beginPath();
      _lmPEPolyPath(ctx);
      ctx.strokeStyle = LM.strokeColor || '#7769DD';
      ctx.lineWidth   = Math.max(1, LM.strokeWidth * cbC.w / (slotEd.w || cbC.w));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }

  // Polygon fill (léger quand un aperçu de carte est dessous, pour le laisser voir)
  ctx.beginPath();
  _lmPEPolyPath(ctx);
  ctx.fillStyle = hasBackdrop ? 'rgba(119,105,221,0.08)' : 'rgba(119,105,221,0.22)';
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

  // Points : ROND = coin arrondi, CARRÉ = coin anguleux (double-clic pour basculer).
  pts.forEach((p, i) => {
    const px = lmPEPixel(p);
    const isHover = LM_PE.hovering === i;
    const isDrag  = LM_PE.dragging === i;
    const r = isDrag ? R+3 : isHover ? R+2 : R;

    ctx.shadowColor = isDrag ? '#F5C842' : isHover ? '#C87DD4' : 'rgba(119,105,221,0.8)';
    ctx.shadowBlur  = isDrag ? 18 : 10;
    ctx.fillStyle   = isDrag ? '#F5C842' : isHover ? '#C87DD4' : '#7769DD';
    ctx.beginPath();
    if (p.rounded) ctx.arc(px.x, px.y, r, 0, Math.PI*2);
    else           ctx.rect(px.x - r, px.y - r, r*2, r*2);
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent';
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
  ctx.fillText(`${pts.length} points  ·  Clic droit = supprimer · Dbl-clic = arrondir · Molette = zoom`, S/2, S-4);
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

  // Apply (carte ciblée via le masque OU forme globale)
  _lmPEWritePoints();

  // Rebuild shape grid saved section
  const grid = document.getElementById('lmShapeGrid');
  if (grid) lmAppendPolyShapes(grid);

  lmPolyClose();
  lmRenderPreview();
}

function lmPolyApply() {
  // Apply without saving (carte ciblée OU forme globale)
  _lmPEWritePoints();
  lmPolyClose();
  lmRenderPreview();
}

function lmPolyReset() {
  // Masque de carte → cercle par défaut ; forme globale → carré.
  LM_PE.points = (LM_PE.targetSlot != null)
    ? _lmDefaultMaskPolygon()
    : [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
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
