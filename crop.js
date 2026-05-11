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
  // 3. Défaut — zoom réduit pour les jeux non-SSBU (images plus petites, évite l'upscaling)
  const g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
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

function drawCharWithCrop(ctx, char, costume, black, sc) {
  const g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  const key = `${g}_${char.id}_${costume}`;
  const cached = imgCache[key];
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
  const img = imgCache[`${_g}_${cropAdjust.charId}_${cropAdjust.costume}`]?._img;
  if (img) renderCropPreview(canvas, img);
}

function openCropAdjuster(charId, costume, slotIdx) {
  const existing = getCrop(charId, costume);
  cropAdjust = { charId, costume, slotIdx: slotIdx ?? null, dragging:false, startX:0, startY:0,
    cx: existing.cx, cy: existing.cy, zoom: existing.zoom, flip: !!existing.flip,
    previewPolygon: computeCropPreviewShape(slotIdx ?? null) };

  const modal  = document.getElementById('cropModal');
  const canvas = document.getElementById('cropCanvas');
  const _g = typeof currentGame !== 'undefined' ? currentGame : 'ssbu';
  const img    = imgCache[`${_g}_${charId}_${costume}`]?._img;
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
  renderCropPreview(canvas, img);

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
    // Autorise le pan au-delà des bords du PNG (zones hors-image visibles dans l'aperçu)
    cropAdjust.cx = Math.max(-1, Math.min(2, cropAdjust.cx - dx));
    cropAdjust.cy = Math.max(-1, Math.min(2, cropAdjust.cy - dy));
    cropAdjust.startX = e.clientX; cropAdjust.startY = e.clientY;
    renderCropPreview(canvas, img);
  };
  canvas.onmouseup = canvas.onmouseleave = () => { cropAdjust.dragging = false; };
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
  document.getElementById('cropModal').style.display = 'none';
  renderSlots();
  generatePreview();
}

function closeCropModal() {
  document.getElementById('cropModal').style.display = 'none';
}
