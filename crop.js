// ============================================================
// CROP.JS — Cadrage des personnages
// Sources de données (par ordre de priorité) :
//   1. localStorage (ajustements manuels)
//   2. crops.json   (détection Python automatique)
//   3. Valeur par défaut (cx:0.5, cy:0.22, zoom:2.0)
// ============================================================

let cropsJson = {}; // chargé depuis crops.json au démarrage

// Charger crops.json
async function loadCropsJson() {
  try {
    const res = await fetch('crops.json');
    if (res.ok) {
      cropsJson = await res.json();
      console.log(`crops.json chargé : ${Object.keys(cropsJson).length} entrées`);
    }
  } catch (e) {
    console.log('crops.json non trouvé — utilisation des valeurs par défaut');
  }
}

// ── ACCÈS AUX DONNÉES ────────────────────────────────────────────────────────

function loadManualCrops() {
  try { return JSON.parse(localStorage.getItem('top8_crop_data') || '{}'); }
  catch { return {}; }
}
function saveManualCrop(charId, costume, cx, cy, zoom, flip) {
  const data = loadManualCrops();
  data[`${ICON_BASENAME[charId]}${costume}`] = { cx, cy, zoom, flip: !!flip };
  localStorage.setItem('top8_crop_data', JSON.stringify(data));
}

function getCrop(charId, costume) {
  const key = `${ICON_BASENAME[charId]}${costume}`;
  // 1. Ajustement manuel (priorité absolue)
  const manual = loadManualCrops()[key];
  if (manual) return { ...manual, source: 'manual' };
  // 2. Détection Python (crops.json)
  if (cropsJson[key]) return { ...cropsJson[key], source: 'auto' };
  // 3. Défaut
  const g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  // GGST : les portraits du dossier GGST2 sont des images RONDES déjà cadrées
  // (256², vignette circulaire centrée) → on les mappe 1:1 sur le cercle du
  // slot (centré, zoom 1) au lieu du cadrage tête plein-corps. Les persos hors
  // GGST2 (Venom = ancien mural plein corps) gardent le cadrage standard.
  if (g === 'ggst' && typeof GGST_MURAL_FILE !== 'undefined' && GGST_MURAL_FILE[charId]) {
    return { cx: 0.5, cy: 0.5, zoom: 1.0, source: 'default-ggst2' };
  }
  // zoom réduit pour les jeux non-SSBU (images plus petites, évite l'upscaling)
  const defaultZoom = g === 'ssbu' ? 2.0 : 1.0;
  return { cx: 0.5, cy: 0.22, zoom: defaultZoom, source: 'default' };
}

function hasCropData(charId, costume) {
  const key = `${ICON_BASENAME[charId]}${costume}`;
  return !!(loadManualCrops()[key] || cropsJson[key]);
}

// ── MÉMOIRE DES PRÉFÉRENCES JOUEURS ──────────────────────────────────────────

function loadPlayerPrefs() {
  try { return JSON.parse(localStorage.getItem('top8_player_prefs') || '{}'); }
  catch { return {}; }
}
function savePlayerPref(startggId, charId, costume) {
  if (!startggId) return;
  const prefs = loadPlayerPrefs();
  prefs[`sg_${startggId}`] = { charId, costume };
  localStorage.setItem('top8_player_prefs', JSON.stringify(prefs));
}
function getPlayerPref(startggId) {
  if (!startggId) return null;
  return loadPlayerPrefs()[`sg_${startggId}`] || null;
}

// ── DESSIN AVEC CROP ─────────────────────────────────────────────────────────

// drawImage qui gère src dépassant les bords de l'image (zones hors-PNG = transparent)
function drawImageClampedSrc(ctx, img, srcX, srcY, srcSize, dX, dY, dSize, flip) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const ix0 = Math.max(0, srcX);
  const iy0 = Math.max(0, srcY);
  const ix1 = Math.min(iw, srcX + srcSize);
  const iy1 = Math.min(ih, srcY + srcSize);
  if (ix1 <= ix0 || iy1 <= iy0) return;

  const scale = dSize / srcSize;
  const subDX = dX + (ix0 - srcX) * scale;
  const subDY = dY + (iy0 - srcY) * scale;
  const subDW = (ix1 - ix0) * scale;
  const subDH = (iy1 - iy0) * scale;

  if (flip) {
    ctx.save();
    ctx.translate(dX + dSize, dY);
    ctx.scale(-1, 1);
    const flippedX = dSize - (subDX - dX) - subDW;
    ctx.drawImage(img, ix0, iy0, ix1 - ix0, iy1 - iy0, flippedX, subDY - dY, subDW, subDH);
    ctx.restore();
  } else {
    ctx.drawImage(img, ix0, iy0, ix1 - ix0, iy1 - iy0, subDX, subDY, subDW, subDH);
  }
}

// fallbackCharImgUrl : URL d'image start.gg préchargée (clé imgCache
// `__sg__${url}`), utilisée quand le mural local n'existe pas (ex. Alex
// pas encore dans le repo SF6). Permet d'afficher quand même un visuel
// du perso plutôt que juste l'emoji icon.
function drawCharWithCrop(ctx, char, costume, black, sc, fallbackCharImgUrl) {
  const g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  const key = `${g}_${char.id}_${costume}`;
  let cached = imgCache[key];
  // Fallback start.gg si le mural local n'est pas chargé (404) mais qu'on a
  // une URL alternative préchargée.
  if (!cached?._loaded && fallbackCharImgUrl) {
    const fbKey = `__sg__${fallbackCharImgUrl}`;
    if (imgCache[fbKey]?._loaded) cached = imgCache[fbKey];
  }
  if (!cached?._loaded) {
    ctx.font = `${Math.round(70*sc)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char.icon, black.cx, black.cy);
    return;
  }

  const img = cached._img;
  const crop = getCrop(char.id, costume);
  const { cx, cy, zoom, flip } = crop;

  // Découper un carré centré sur la tête (peut dépasser les bords de l'image)
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  const srcX = img.naturalWidth  * cx - srcSize/2;
  const srcY = img.naturalHeight * cy - srcSize/2;

  // Bounding box réelle de la forme (parallélogramme, trapèze, etc.)
  const pts = black.pts;
  const allX = pts.map(p => p[0]);
  const allY = pts.map(p => p[1]);
  const bboxW = Math.max(...allX) - Math.min(...allX);
  const bboxH = Math.max(...allY) - Math.min(...allY);

  // Cover centré : l'image doit couvrir toute la bounding box sans laisser de coin vide
  const caseRatio = bboxW / bboxH;
  const dSize = caseRatio >= 1 ? bboxW : bboxH;
  const dX = black.cx - dSize/2;
  const dY = black.cy - dSize/2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawImageClampedSrc(ctx, img, srcX, srcY, srcSize, dX, dY, dSize, flip);
}

// ── OUTIL D'AJUSTEMENT MANUEL ────────────────────────────────────────────────

let cropAdjust = { charId:null, costume:null, slotIdx:null, cx:0.5, cy:0.22, zoom:2.0, flip:false, dragging:false, startX:0, startY:0, previewPolygon:null };

// Calcule la forme du slot dans les coordonnées du canvas d'aperçu (260×260)
// pour qu'on voie ce qui sera réellement visible dans le Top 8.
function computeCropPreviewShape(slotIdx) {
  if (slotIdx == null) return null;
  const SIZE = 260;
  const layout = (typeof LAYOUTS !== 'undefined') ? LAYOUTS[currentGame] : null;

  let pts = null; // points de la forme en coords canvas REF_SIZE
  let cxC, cyC;   // centre utilisé pour positionner la cover bbox

  // Layout custom_lm : non géré (forme variable)
  if (layout?.slotType === 'custom_lm') return null;

  // Layouts non-SSBU (cercle, trapèze tekken8, etc.)
  if (layout && !layout.useParallelogram && layout.slots && layout.slots[slotIdx]) {
    const slot = layout.slots[slotIdx];
    const type = layout.slotType;

    if (type === 'circle') {
      const r = slot.r;
      cxC = slot.cx; cyC = slot.cy;
      const N = 64;
      pts = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;
        pts.push([cxC + r * Math.cos(a), cyC + r * Math.sin(a)]);
      }
    } else if (type === 'tekken8') {
      const sc2 = (typeof getSlotCfg !== 'undefined') ? getSlotCfg(slotIdx) : null;
      if (!sc2) return null;
      const tx = sc2.cx - sc2.w/2;
      const ty = sc2.cy - sc2.h/2;
      const tw = sc2.w, th = sc2.h, tsk = sc2.skewTop;
      pts = [
        [tx,      ty + th],
        [tx + tw, ty + th],
        [tx + tw, ty],
        [tx,      ty + tsk],
      ];
      cxC = tx + tw/2;
      cyC = ty + tsk/2 + th/2;
    } else {
      return null;
    }
  } else {
    // SSBU parallélogramme par défaut
    const slotCfg = (typeof getSlotCfg !== 'undefined') ? getSlotCfg(slotIdx) : null;
    if (!slotCfg || typeof CONFIG === 'undefined') return null;
    const ox = CONFIG.OFFSET_X, oy = CONFIG.OFFSET_Y;
    const xBL = slotCfg.xBL + ox;
    const yT  = slotCfg.yT  + oy;
    const yB  = slotCfg.yT + slotCfg.h + oy;
    const w   = slotCfg.w;
    const sk  = CONFIG.SKEW;
    pts = [[xBL,yB],[xBL+w,yB],[xBL+w-sk,yT],[xBL-sk,yT]];
    cxC = xBL + w/2 - sk/2;
    cyC = (yT + yB) / 2;
  }

  // Cover bbox (carré qui contient toute la forme, centré sur cxC/cyC)
  const allX = pts.map(p => p[0]);
  const allY = pts.map(p => p[1]);
  const bboxW = Math.max(...allX) - Math.min(...allX);
  const bboxH = Math.max(...allY) - Math.min(...allY);
  const dim = Math.max(bboxW, bboxH);
  const dX = cxC - dim/2;
  const dY = cyC - dim/2;

  // Mapper vers coords aperçu
  return pts.map(([x,y]) => [
    (x - dX) / dim * SIZE,
    (y - dY) / dim * SIZE
  ]);
}

function toggleCropFlip() {
  cropAdjust.flip = !cropAdjust.flip;
  const btn = document.getElementById('flipBtn');
  if (btn) btn.classList.toggle('active', cropAdjust.flip);
  const canvas = document.getElementById('cropCanvas');
  const _g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  let img = imgCache[`${_g}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
  // Même fallback start.gg que dans openCropAdjuster
  if (!img && typeof players !== 'undefined') {
    const pWithUrl = players.find(p => p && p.charId === cropAdjust.charId && p.charImgUrl);
    if (pWithUrl) img = imgCache[`__sg__${pWithUrl.charImgUrl}`]?._img;
  }
  if (img) renderCropPreview(canvas, img);
}

function openCropAdjuster(charId, costume, slotIdx) {
  const existing = getCrop(charId, costume);
  // Charge le masque existant si dispo, sinon par défaut un cercle (24 pts).
  const savedMask = (typeof loadSlotMaskPolygon === 'function') ? loadSlotMaskPolygon(slotIdx) : null;
  cropAdjust = { charId, costume, slotIdx: slotIdx ?? null, dragging:false, startX:0, startY:0,
    cx: existing.cx, cy: existing.cy, zoom: existing.zoom, flip: !!existing.flip,
    previewPolygon: computeCropPreviewShape(slotIdx ?? null),
    mode: 'crop',
    maskPolygon: savedMask || _defaultCirclePolygon(20) };

  const modal  = document.getElementById('cropModal');
  const canvas = document.getElementById('cropCanvas');
  const _g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  let img    = imgCache[`${_g}_${charId}_${costume}`]?._img;
  // Fallback : image start.gg préchargée si le mural local manque
  // (Alex SF6 par ex.). On cherche dans players[] le charImgUrl associé
  // à ce charId pour récupérer la clé du cache fallback.
  if (!img && typeof players !== 'undefined') {
    const pWithUrl = players.find(p => p && p.charId === charId && p.charImgUrl);
    if (pWithUrl) {
      img = imgCache[`__sg__${pWithUrl.charImgUrl}`]?._img;
    }
  }
  if (!img) { alert("Génère d'abord l'aperçu pour charger l'image."); return; }

  // Source indicator
  const src = existing.source;
  document.getElementById('cropSource').textContent =
    src==='manual' ? '✏️ Ajustement manuel' :
    src==='auto'   ? '🤖 Détection automatique' : '⚙️ Valeur par défaut';

  modal.style.display = 'flex';
  document.getElementById('zoomSlider').value   = cropAdjust.zoom;
  document.getElementById('zoomVal').textContent = parseFloat(cropAdjust.zoom).toFixed(1);
  const flipBtn = document.getElementById('flipBtn');
  if (flipBtn) flipBtn.classList.toggle('active', cropAdjust.flip);
  // Active le mode crop par défaut (re-bind events + render selon mode)
  switchCropMode('crop');
}

function renderCropPreview(canvas, img) {
  const SIZE = 260;
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0819'; ctx.fillRect(0,0,SIZE,SIZE);

  const { cx, cy, zoom, flip } = cropAdjust;
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  // Pas de clamp : l'image peut sortir des bords (zones hors-PNG = fond)
  const srcX = img.naturalWidth  * cx - srcSize/2;
  const srcY = img.naturalHeight * cy - srcSize/2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawImageClampedSrc(ctx, img, srcX, srcY, srcSize, 0, 0, SIZE, flip);

  // Overlay : forme du slot en pointillés (ce qui sera visible dans le Top 8)
  const poly = cropAdjust.previewPolygon;
  if (poly && poly.length > 1) {
    const drawPts = flip ? poly.map(([x,y]) => [SIZE - x, y]) : poly;

    // Voile sombre sur la zone qui sera coupée (hors polygone)
    ctx.save();
    ctx.fillStyle = 'rgba(12, 8, 25, 0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.moveTo(drawPts[0][0], drawPts[0][1]);
    for (let i = drawPts.length - 1; i >= 1; i--) ctx.lineTo(drawPts[i][0], drawPts[i][1]);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();

    // Trait pointillé blanc sur le contour de la forme
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(drawPts[0][0], drawPts[0][1]);
    for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i][0], drawPts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Réticule au centre
  ctx.strokeStyle = 'rgba(127,119,221,0.7)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SIZE/2-12,SIZE/2); ctx.lineTo(SIZE/2+12,SIZE/2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SIZE/2,SIZE/2-12); ctx.lineTo(SIZE/2,SIZE/2+12); ctx.stroke();
}

function updateCropZoom(val) {
  cropAdjust.zoom = parseFloat(val);
  document.getElementById('zoomVal').textContent = parseFloat(val).toFixed(1);
  const canvas = document.getElementById('cropCanvas');
  const _g2 = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  const img = imgCache[`${_g2}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
  if (img) renderCropPreview(canvas, img);
}

function resetCropToAuto() {
  const key = `${ICON_BASENAME[cropAdjust.charId]}${cropAdjust.costume}`;
  // Supprimer l'ajustement manuel pour revenir à l'auto
  const data = loadManualCrops();
  delete data[key];
  localStorage.setItem('top8_crop_data', JSON.stringify(data));
  // Recharger depuis auto
  const auto = cropsJson[key] || { cx:0.5, cy:0.22, zoom:2.0 };
  cropAdjust.cx = auto.cx; cropAdjust.cy = auto.cy; cropAdjust.zoom = auto.zoom;
  document.getElementById('zoomSlider').value = cropAdjust.zoom;
  document.getElementById('zoomVal').textContent = parseFloat(cropAdjust.zoom).toFixed(1);
  document.getElementById('cropSource').textContent = cropsJson[key] ? '🤖 Détection automatique' : '⚙️ Valeur par défaut';
  const canvas = document.getElementById('cropCanvas');
  const _g2 = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  const img = imgCache[`${_g2}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
  if (img) renderCropPreview(canvas, img);
}

function saveCropAdjust() {
  saveManualCrop(cropAdjust.charId, cropAdjust.costume, cropAdjust.cx, cropAdjust.cy, cropAdjust.zoom, cropAdjust.flip);
  // Si on a édité un masque, on le sauve aussi sur le slot courant
  if (cropAdjust.maskPolygon && cropAdjust.slotIdx != null) {
    saveSlotMaskPolygon(cropAdjust.slotIdx, cropAdjust.maskPolygon);
  }
  document.getElementById('cropModal').style.display = 'none';
  renderSlots();
  generatePreview();
}

function closeCropModal() {
  document.getElementById('cropModal').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════════════
// ÉDITEUR DE MASQUE POLYGONE
// Permet de redéfinir la forme du clip d'un slot (par ex. transformer le
// cercle GGST en un polygone qui évite les zones du fond avec numéros).
// Stockage : _slotCfgsMem[game].slots[i].maskPolygon = [{x,y}] en coords
// normalisées 0-1 relatives à la bbox du slot.
// ════════════════════════════════════════════════════════════════════════

// Charge le masque polygone du slot courant (depuis storage) ou retourne
// un cercle par défaut (32 points sur le rayon du slot circle).
function loadSlotMaskPolygon(slotIdx) {
  if (slotIdx == null) return null;
  try {
    const sc = (typeof _slotCfgsMem !== 'undefined') && _slotCfgsMem[currentGame]?.slots?.[slotIdx];
    if (sc?.maskPolygon && Array.isArray(sc.maskPolygon) && sc.maskPolygon.length >= 3) {
      return sc.maskPolygon.map(p => ({ x: p.x, y: p.y, rounded: !!p.rounded }));
    }
  } catch (e) {}
  return null;
}

function saveSlotMaskPolygon(slotIdx, polygon) {
  if (typeof _slotCfgsMem === 'undefined') return;
  if (!_slotCfgsMem[currentGame]) _slotCfgsMem[currentGame] = { slots: [] };
  if (!_slotCfgsMem[currentGame].slots) _slotCfgsMem[currentGame].slots = [];
  while (_slotCfgsMem[currentGame].slots.length <= slotIdx) {
    _slotCfgsMem[currentGame].slots.push(null);
  }
  const existing = _slotCfgsMem[currentGame].slots[slotIdx] || {};
  existing.maskPolygon = polygon.map(p => {
    const o = { x: +p.x.toFixed(4), y: +p.y.toFixed(4) };
    if (p.rounded) o.rounded = true;
    return o;
  });
  _slotCfgsMem[currentGame].slots[slotIdx] = existing;
  if (typeof _saveSlotCfgsToStorage === 'function') _saveSlotCfgsToStorage();
}

// Génère un polygone de cercle par défaut (en coords normalisées 0-1
// relatives au bbox du slot, centré sur 0.5/0.5).
function _defaultCirclePolygon(nPoints) {
  const n = nPoints || 24;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;  // démarre en haut
    pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
  }
  return pts;
}

function switchCropMode(mode) {
  cropAdjust.mode = mode;
  // Met à jour visuellement les onglets
  document.querySelectorAll('.crop-mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  // Affiche/cache les contrôles
  document.getElementById('cropModeCrop').style.display = mode === 'crop' ? '' : 'none';
  document.getElementById('cropModeMask').style.display = mode === 'mask' ? 'block' : 'none';
  // Hide le bouton "Reset auto" en mode masque (pas pertinent)
  const resetBtn = document.getElementById('cropResetBtn');
  if (resetBtn) resetBtn.style.display = mode === 'crop' ? '' : 'none';
  // Met à jour le hint en haut
  const hint = document.getElementById('cropHint');
  if (hint) hint.textContent = mode === 'mask'
    ? 'Clic bord = ajouter · Glisse = bouger · Clic droit = supprimer · Double-clic = arrondir · Molette = zoom'
    : "Glisse l'image pour repositionner · Ajuste le zoom";
  // Re-bind les events souris selon le mode
  _bindCropCanvasEvents();
  // Re-render
  _renderCropOrMask();
}

function _renderCropOrMask() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  if (cropAdjust.mode === 'mask') {
    renderMaskEditor(canvas);
  } else {
    const _g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
    let img = imgCache[`${_g}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
    if (!img && typeof players !== 'undefined') {
      const pWithUrl = players.find(p => p && p.charId === cropAdjust.charId && p.charImgUrl);
      if (pWithUrl) img = imgCache[`__sg__${pWithUrl.charImgUrl}`]?._img;
    }
    if (img) renderCropPreview(canvas, img);
  }
}

// Récupère la bbox du slot dans les coords du canvas 1400×1400 source.
// Pour les cercles : carré inscrit dans le cercle (cx-r, cy-r, 2r, 2r).
function _getSlotBbox(slotIdx) {
  const layout = LAYOUTS[currentGame];
  if (!layout || !layout.slots || !layout.slots[slotIdx]) return null;
  const s = layout.slots[slotIdx];
  if (s.r != null) {
    return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
  }
  if (s.w != null && s.h != null) {
    return { x: s.cx - s.w/2, y: s.cy - s.h/2, w: s.w, h: s.h };
  }
  return null;
}

function resetMaskPolygon() {
  cropAdjust.maskPolygon = _defaultCirclePolygon(20);
  _renderCropOrMask();
}

// Fonction utilitaire exposée — dessine un chemin de polygone avec coins
// arrondis pour les points qui ont `p.rounded === true`. Utilisée par
// l'éditeur de masque ET par le rendu final dans app.js.
// pts : tableau de points en COORDS PIXEL CANVAS (déjà multipliés par taille).
// defaultR : rayon par défaut pour les coins arrondis (capé par la moitié
// des segments adjacents pour éviter les overlaps).
function drawMaskPolygonPath(ctx, pts, defaultR) {
  if (!pts || pts.length < 3) return;
  // Commence au milieu du segment 0→1 (évite les soucis de moveTo sur
  // un coin arrondi qui aurait besoin d'arcTo en partant d'avant le sommet)
  const startX = (pts[0].x + pts[1].x) / 2;
  const startY = (pts[0].y + pts[1].y) / 2;
  ctx.moveTo(startX, startY);
  for (let i = 1; i <= pts.length; i++) {
    const curr = pts[i % pts.length];
    const next = pts[(i+1) % pts.length];
    if (curr.rounded) {
      const prev = pts[(i-1+pts.length) % pts.length];
      const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dNext = Math.hypot(curr.x - next.x, curr.y - next.y);
      const r = Math.min(defaultR, dPrev/2.2, dNext/2.2);
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  ctx.closePath();
}
window.drawMaskPolygonPath = drawMaskPolygonPath;

function renderMaskEditor(canvas) {
  const SIZE = 280;
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a0a2e'; ctx.fillRect(0, 0, SIZE, SIZE);

  // Charge le bg du jeu (en source 1400×1400) et crope la zone du slot
  const bbox = _getSlotBbox(cropAdjust.slotIdx);
  const layout = LAYOUTS[currentGame];
  if (bbox && typeof bgImg !== 'undefined' && bgImg && layout?.bgFile) {
    // bgImg est l'image complète chargée. On dessine la zone du slot
    // (bbox source) dans le canvas 280×280, légèrement assombrie pour
    // que les points soient bien visibles.
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Calcul ratio entre l'image source réelle et le canvas 1400 de ref
      const srcSc = bgImg.naturalWidth / 1400;
      ctx.drawImage(bgImg,
        bbox.x * srcSc, bbox.y * srcSc, bbox.w * srcSc, bbox.h * srcSc,
        0, 0, SIZE, SIZE);
      // Voile sombre pour mieux voir les points
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, SIZE, SIZE);
    } catch (e) { /* CORS ou autre */ }
  }

  // Dessine le polygone courant
  const poly = cropAdjust.maskPolygon;
  if (!poly || !poly.length) return;
  const drawPts = poly.map(p => ({ x: p.x * SIZE, y: p.y * SIZE, rounded: !!p.rounded }));
  // Rayon par défaut des coins arrondis : 15% de la taille canvas
  const cornerR = SIZE * 0.15;

  // Zone clippée (à l'intérieur du polygone) : effet voile sombre AUTOUR
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.rect(0, 0, SIZE, SIZE);
  // Sub-path inverse pour evenodd (utilise le path arrondi)
  drawMaskPolygonPath(ctx, drawPts.slice().reverse(), cornerR);
  ctx.fill('evenodd');
  ctx.restore();

  // Trait du polygone (avec coins arrondis)
  ctx.save();
  ctx.strokeStyle = 'rgba(168, 132, 240, 0.95)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
  ctx.beginPath();
  drawMaskPolygonPath(ctx, drawPts, cornerR);
  ctx.stroke();
  ctx.restore();

  // Points draggables — losange pour les points "arrondis", cercle blanc
  // pour les points "anguleux" (visuel pour distinguer les deux modes)
  drawPts.forEach((p, i) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    if (p.rounded) {
      // Pastille jaune dorée = coin arrondi
      ctx.fillStyle = '#ffd86b';
      ctx.strokeStyle = '#c98900';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#7c5cff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ── Manipulation du polygone ──
function _findClosestPointIdx(px, py, threshold) {
  const poly = cropAdjust.maskPolygon || [];
  const SIZE = 280;
  let best = -1, bestDist = (threshold || 14);
  for (let i = 0; i < poly.length; i++) {
    const dx = poly[i].x * SIZE - px;
    const dy = poly[i].y * SIZE - py;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

// Insère un point sur le segment le plus proche du clic. Retourne l'index inséré.
function _insertPointAt(px, py) {
  const poly = cropAdjust.maskPolygon;
  if (!poly || poly.length < 2) return -1;
  const SIZE = 280;
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i+1) % poly.length];
    // distance du point au segment a-b (en coords canvas)
    const ax = a.x * SIZE, ay = a.y * SIZE;
    const bx = b.x * SIZE, by = b.y * SIZE;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx*dx + dy*dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt((px - cx)*(px - cx) + (py - cy)*(py - cy));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // Insère le nouveau point après bestIdx
  poly.splice(bestIdx + 1, 0, { x: px / SIZE, y: py / SIZE });
  return bestIdx + 1;
}

// État du drag (mode masque)
let _maskDrag = { active: false, pointIdx: -1 };

function _bindCropCanvasEvents() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas) return;
  // Reset tout
  canvas.onmousedown = canvas.onmousemove = canvas.onmouseup = canvas.onmouseleave = null;
  canvas.oncontextmenu = null;
  canvas.ondblclick = null;
  // Cleanup ancien wheel listener (idempotent)
  if (canvas._maskWheelListener) {
    canvas.removeEventListener('wheel', canvas._maskWheelListener);
    canvas._maskWheelListener = null;
  }
  // Reset zoom CSS au switch de mode
  canvas.style.transform = '';
  canvas.style.transformOrigin = '0 0';

  if (cropAdjust.mode === 'mask') {
    canvas.style.cursor = 'crosshair';
    canvas.oncontextmenu = (e) => { e.preventDefault(); return false; };

    // ── ZOOM AU SCROLL ────────────────────────────────────────────────
    // Zoom CSS du canvas. Les clicks/drags continuent à fonctionner car
    // on calcule les coords via canvas.width / rect.width qui prend en
    // compte le scale CSS automatiquement.
    let _maskZoom = 1;
    const wheelFn = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      _maskZoom = Math.max(1, Math.min(5, _maskZoom * factor));
      if (_maskZoom <= 1.01) {
        canvas.style.transform = '';
        _maskZoom = 1;
      } else {
        // Zoom centré sur le pointeur
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;   // 0-1
        const my = (e.clientY - rect.top)  / rect.height;
        canvas.style.transformOrigin = `${mx * 100}% ${my * 100}%`;
        canvas.style.transform = `scale(${_maskZoom})`;
      }
    };
    canvas.addEventListener('wheel', wheelFn, { passive: false });
    canvas._maskWheelListener = wheelFn;

    // ── DOUBLE-CLICK : toggle "rounded" sur un point ──────────────────
    canvas.ondblclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * sx;
      const py = (e.clientY - rect.top)  * sy;
      const idx = _findClosestPointIdx(px, py, 14);
      if (idx >= 0) {
        const p = cropAdjust.maskPolygon[idx];
        p.rounded = !p.rounded;
        renderMaskEditor(canvas);
      }
    };
    canvas.onmousedown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * sx;
      const py = (e.clientY - rect.top)  * sy;
      // Clic droit → supprime le point le plus proche
      if (e.button === 2) {
        const idx = _findClosestPointIdx(px, py, 14);
        if (idx >= 0 && cropAdjust.maskPolygon.length > 3) {
          cropAdjust.maskPolygon.splice(idx, 1);
          renderMaskEditor(canvas);
        }
        e.preventDefault();
        return;
      }
      // Clic gauche : sur un point existant → drag ; sinon → ajoute un point
      const existingIdx = _findClosestPointIdx(px, py, 14);
      if (existingIdx >= 0) {
        _maskDrag = { active: true, pointIdx: existingIdx };
      } else {
        const newIdx = _insertPointAt(px, py);
        if (newIdx >= 0) {
          _maskDrag = { active: true, pointIdx: newIdx };
          renderMaskEditor(canvas);
        }
      }
    };
    canvas.onmousemove = (e) => {
      if (!_maskDrag.active) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const px = Math.max(0, Math.min(canvas.width,  (e.clientX - rect.left) * sx));
      const py = Math.max(0, Math.min(canvas.height, (e.clientY - rect.top)  * sy));
      const p = cropAdjust.maskPolygon[_maskDrag.pointIdx];
      if (p) {
        p.x = px / canvas.width;
        p.y = py / canvas.height;
        renderMaskEditor(canvas);
      }
    };
    canvas.onmouseup = canvas.onmouseleave = () => { _maskDrag.active = false; };
  } else {
    // Mode crop : restore le drag d'image
    canvas.style.cursor = 'grab';
    const _g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
    let img = imgCache[`${_g}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
    if (!img && typeof players !== 'undefined') {
      const pWithUrl = players.find(p => p && p.charId === cropAdjust.charId && p.charImgUrl);
      if (pWithUrl) img = imgCache[`__sg__${pWithUrl.charImgUrl}`]?._img;
    }
    canvas.onmousedown = e => {
      cropAdjust.dragging = true;
      cropAdjust.startX = e.clientX; cropAdjust.startY = e.clientY;
      e.preventDefault();
    };
    canvas.onmousemove = e => {
      if (!cropAdjust.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - cropAdjust.startX) / (rect.width  * cropAdjust.zoom);
      const dy = (e.clientY - cropAdjust.startY) / (rect.height * cropAdjust.zoom);
      cropAdjust.cx = Math.max(-1, Math.min(2, cropAdjust.cx - dx));
      cropAdjust.cy = Math.max(-1, Math.min(2, cropAdjust.cy - dy));
      cropAdjust.startX = e.clientX; cropAdjust.startY = e.clientY;
      if (img) renderCropPreview(canvas, img);
    };
    canvas.onmouseup = canvas.onmouseleave = () => { cropAdjust.dragging = false; };
  }
}

window.switchCropMode      = switchCropMode;
window.resetMaskPolygon    = resetMaskPolygon;
window.loadSlotMaskPolygon = loadSlotMaskPolygon;
