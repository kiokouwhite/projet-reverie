// ═══════════════════════════════════════════════════════════════════════════════
// PANNEAU « Options & Joueurs » — gestion MULTI-PERSOS (charger + cadrer)
// Quand un layout custom multi-persos (DBFZ, découpes…) est appliqué dans l'app
// principale, on remplace le slot joueur standard par une grille de persos :
// chaque perso peut être (re)chargé et cadré individuellement.
// (Dépend de globales définies dans layout-maker.js / app.js, résolues au runtime.)
// ═══════════════════════════════════════════════════════════════════════════════

// Renvoie {layout, N} si le layout custom ACTIF est multi-persos, sinon null.
function lmActiveMultiLayout() {
  if (typeof LAYOUTS === 'undefined' || typeof currentGame === 'undefined') return null;
  const reg = LAYOUTS[currentGame];
  if (!reg || reg.slotType !== 'custom_lm' || !reg._lm) return null;
  const L = reg._lm;
  const cuts = Array.isArray(L.cuts) ? L.cuts.filter(Boolean).length : 0;
  const N = Math.max((L.charsPerPlayer || 1), cuts ? cuts + 1 : 0);
  return N > 1 ? { layout: L, N } : null;
}
window.lmActiveMultiLayout = lmActiveMultiLayout;

// HTML du slot joueur i pour un layout custom multi-persos (sinon null → standard).
function lmPanelSlotHTML(p, i) {
  const m = lmActiveMultiLayout(); if (!m) return null;
  const { layout, N } = m;
  const esc = (typeof escHtml === 'function') ? escHtml : (s => s || '');
  const rc  = (typeof rankClass === 'function') ? rankClass(i) : 'rank-badge';
  const rankDisp = layout.rankDisplay || ['1er','2e','3e'];
  let cells = '';
  for (let k = 0; k < N; k++) {
    const url = (layout.charUrlsMulti && layout.charUrlsMulti[i] && layout.charUrlsMulti[i][k]) || '';
    const thumb = url
      ? `<div class="lm-pchar-thumb has-img" style="background-image:url('${url}')" onclick="lmPanelUploadChar(${i},${k})" title="Changer l'image"><span class="lm-pchar-num">${k+1}</span></div>`
      : `<div class="lm-pchar-thumb" onclick="lmPanelUploadChar(${i},${k})" title="Charger une image"><span class="lm-pchar-num">${k+1}</span><span class="lm-pchar-add">＋</span></div>`;
    cells += `<div class="lm-pchar">${thumb}<button class="btn lm-pchar-crop" onclick="lmOpenMultiCrop(${i},${k})" ${url?'':'disabled'} title="Cadrer ce perso">✏️ Cadrer</button></div>`;
  }
  return `
    <div class="slot-header">
      <div class="${rc}">${rankDisp[i] || (i+1)}</div>
      <input type="text" placeholder="Pseudo" value="${esc(p.name)}"
             oninput="players[${i}].name=this.value; if(typeof generatePreview==='function')generatePreview();" style="flex:1;">
    </div>
    <div class="lm-pchars-label">🎭 ${N} persos — clique une vignette pour charger, ✏️ pour cadrer</div>
    <div class="lm-pchars">${cells}</div>`;
}
window.lmPanelSlotHTML = lmPanelSlotHTML;

// Upload d'une image pour le perso (slot i, zone k) du layout custom actif.
function lmPanelUploadChar(i, k) {
  const m = lmActiveMultiLayout(); if (!m) return;
  const { layout } = m;
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const url = r.result;
      layout.charUrlsMulti = layout.charUrlsMulti || [[],[],[]];
      layout.charUrlsMulti[i] = layout.charUrlsMulti[i] || [];
      layout.charUrlsMulti[i][k] = url;
      const img = new Image();
      img.onload = () => {
        layout.charImgsMulti = layout.charImgsMulti || [[],[],[]];
        layout.charImgsMulti[i] = layout.charImgsMulti[i] || [];
        layout.charImgsMulti[i][k] = img;
        if (typeof generatePreview === 'function') generatePreview();
        if (typeof renderSlots === 'function') renderSlots();
        lmPersistActiveLayout();
      };
      img.src = url;
    };
    r.readAsDataURL(file);
  };
  inp.click();
}
window.lmPanelUploadChar = lmPanelUploadChar;

// Persiste (best-effort) les retouches multi-persos du layout actif dans le coffre.
async function lmPersistActiveLayout() {
  try {
    const layout = window._activeCustomLayout; if (!layout || !layout.id) return;
    const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
    const idx = coffre.findIndex(l => l && l.id === layout.id);
    if (idx < 0) return;  // layout pas dans le coffre → édition live uniquement
    const light = coffre[idx];
    light.charsPerPlayer = layout.charsPerPlayer || 1;
    light.charCropsMulti = (layout.charCropsMulti || [[],[],[]]).map(a => (a||[]).map(c => c ? {...c} : null));
    // Images multi → IDB (sur une COPIE : coffreStripImagesToIDB SUPPRIME charUrlsMulti).
    if (typeof coffreStripImagesToIDB === 'function') {
      const tmp = { id: layout.id, charUrlsMulti: (layout.charUrlsMulti || [[],[],[]]).map(a => [...(a||[])]) };
      await coffreStripImagesToIDB(tmp);
      delete light.charUrlsMulti;
    }
    coffre[idx] = light;
    localStorage.setItem('top8_coffre', JSON.stringify(coffre));
  } catch(e) { console.warn('[LM] persist active layout :', e); }
}
window.lmPersistActiveLayout = lmPersistActiveLayout;

// ── Cadrage individuel d'un perso (modal) ──────────────────────────────────────
let _lmMC = { i:0, k:0, layout:null, poly:null, bbox:null, ar:1, dragging:false, sx:0, sy:0 };

// Forme (polygone normalisé 0-1) + ratio de la ZONE du perso k dans le slot i.
function lmZoneShape(layout, slotIdx, k) {
  const slot = (layout.slots && layout.slots[slotIdx]) || { w:300, h:400 };
  const cuts = Array.isArray(layout.cuts) ? layout.cuts.filter(Boolean) : [];
  let poly;
  if (cuts.length && typeof lmComputeCutRegions === 'function') {
    const regions = lmComputeCutRegions(cuts);
    poly = regions[Math.min(k, regions.length - 1)] || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  } else {
    const N = Math.max(1, layout.charsPerPlayer || 1);
    const x0 = k / N, x1 = (k + 1) / N;
    poly = [{x:x0,y:0},{x:x1,y:0},{x:x1,y:1},{x:x0,y:1}];
  }
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const bx0 = Math.min(...xs), by0 = Math.min(...ys), bx1 = Math.max(...xs), by1 = Math.max(...ys);
  const bw = (bx1 - bx0) * Math.abs(slot.w || 300), bh = (by1 - by0) * Math.abs(slot.h || 400);
  return { poly, bbox:{x0:bx0,y0:by0,x1:bx1,y1:by1}, ar:(bw / bh) || 1 };
}

function lmOpenMultiCrop(i, k) {
  const m = lmActiveMultiLayout(); if (!m) return;
  const { layout } = m;
  layout.charCropsMulti = layout.charCropsMulti || [[],[],[]];
  layout.charCropsMulti[i] = layout.charCropsMulti[i] || [];
  if (!layout.charCropsMulti[i][k]) layout.charCropsMulti[i][k] = { cx:0.5, cy:0.28, zoom:1 };
  let img = (layout.charImgsMulti && layout.charImgsMulti[i] && layout.charImgsMulti[i][k]) || null;
  const url = (layout.charUrlsMulti && layout.charUrlsMulti[i] && layout.charUrlsMulti[i][k]) || null;
  if (!img && url) {
    img = new Image();
    img.onload = () => { layout.charImgsMulti = layout.charImgsMulti||[[],[],[]]; layout.charImgsMulti[i]=layout.charImgsMulti[i]||[]; layout.charImgsMulti[i][k]=img; lmMCdraw(); };
    img.src = url;
  }
  const shape = lmZoneShape(layout, i, k);
  _lmMC = { i, k, layout, poly: shape.poly, bbox: shape.bbox, ar: shape.ar, dragging:false, sx:0, sy:0 };
  const modal = document.getElementById('lmMultiCropModal'); if (!modal) return;
  modal.style.display = 'flex';
  const crop = layout.charCropsMulti[i][k];
  const zs = document.getElementById('lmMCzoom'); if (zs) zs.value = crop.zoom;
  const zv = document.getElementById('lmMCzoomVal'); if (zv) zv.textContent = parseFloat(crop.zoom).toFixed(1);
  const title = document.getElementById('lmMCtitle');
  if (title) title.textContent = `Cadrer — ${(layout.rankDisplay||['1er','2e','3e'])[i]||('#'+(i+1))} · perso ${k+1}`;
  lmMCbind();
  lmMCdraw();
}
window.lmOpenMultiCrop = lmOpenMultiCrop;

function lmMCimg() { return (_lmMC.layout && _lmMC.layout.charImgsMulti && _lmMC.layout.charImgsMulti[_lmMC.i] && _lmMC.layout.charImgsMulti[_lmMC.i][_lmMC.k]) || null; }
function lmMCcrop() {
  const L = _lmMC.layout; if (!L) return { cx:0.5, cy:0.28, zoom:1 };
  L.charCropsMulti = L.charCropsMulti || [[],[],[]];
  L.charCropsMulti[_lmMC.i] = L.charCropsMulti[_lmMC.i] || [];
  return (L.charCropsMulti[_lmMC.i][_lmMC.k] = L.charCropsMulti[_lmMC.i][_lmMC.k] || { cx:0.5, cy:0.28, zoom:1 });
}

function lmMCdraw() {
  const canvas = document.getElementById('lmMCcanvas'); if (!canvas) return;
  const maxW = 300, ar = _lmMC.ar || 1;
  let cw, ch;
  if (ar >= 1) { cw = maxW; ch = Math.round(maxW / ar); } else { ch = maxW; cw = Math.round(maxW * ar); }
  cw = Math.max(120, Math.min(380, cw)); ch = Math.max(120, Math.min(380, ch));
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#140d28'; ctx.fillRect(0, 0, cw, ch);
  const img = lmMCimg();
  if (img && img.naturalWidth && typeof lmDrawCharInRect === 'function') {
    lmDrawCharInRect(ctx, img, 0, 0, cw, ch, lmMCcrop());
  } else {
    ctx.fillStyle = '#6a4f8f'; ctx.font = '13px Montserrat, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Image en cours de chargement…', cw/2, ch/2);
  }
  const bb = _lmMC.bbox, poly = _lmMC.poly;
  if (poly && bb) {
    const mapX = x => ((x - bb.x0) / ((bb.x1 - bb.x0) || 1)) * cw;
    const mapY = y => ((y - bb.y0) / ((bb.y1 - bb.y0) || 1)) * ch;
    ctx.save();
    ctx.fillStyle = 'rgba(15,9,30,0.55)';
    ctx.beginPath(); ctx.rect(0, 0, cw, ch);
    ctx.moveTo(mapX(poly[0].x), mapY(poly[0].y));
    for (let j = poly.length - 1; j >= 1; j--) ctx.lineTo(mapX(poly[j].x), mapY(poly[j].y));
    ctx.closePath(); ctx.fill('evenodd');
    ctx.restore();
    ctx.save();
    ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(mapX(poly[0].x), mapY(poly[0].y));
    for (let j = 1; j < poly.length; j++) ctx.lineTo(mapX(poly[j].x), mapY(poly[j].y));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
}

function lmMCbind() {
  const canvas = document.getElementById('lmMCcanvas'); if (!canvas) return;
  canvas.onmousedown = (e) => { _lmMC.dragging = true; _lmMC.sx = e.clientX; _lmMC.sy = e.clientY; };
  canvas.onmousemove = (e) => {
    if (!_lmMC.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const crop = lmMCcrop();
    const z = Math.max(0.2, crop.zoom || 1);
    crop.cx = Math.max(0, Math.min(1, crop.cx - (e.clientX - _lmMC.sx) / (rect.width  * z)));
    crop.cy = Math.max(0, Math.min(1, crop.cy - (e.clientY - _lmMC.sy) / (rect.height * z)));
    _lmMC.sx = e.clientX; _lmMC.sy = e.clientY;
    lmMCdraw();
  };
  canvas.onmouseup = canvas.onmouseleave = () => {
    if (_lmMC.dragging) { _lmMC.dragging = false; if (typeof generatePreview === 'function') generatePreview(); }
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const crop = lmMCcrop();
    crop.zoom = Math.max(0.5, Math.min(5, (crop.zoom || 1) * (e.deltaY < 0 ? 1.08 : 0.93)));
    const zs = document.getElementById('lmMCzoom'); if (zs) zs.value = crop.zoom;
    const zv = document.getElementById('lmMCzoomVal'); if (zv) zv.textContent = parseFloat(crop.zoom).toFixed(1);
    lmMCdraw();
  };
}

function lmMCsetZoom(v) {
  const crop = lmMCcrop(); crop.zoom = parseFloat(v);
  const zv = document.getElementById('lmMCzoomVal'); if (zv) zv.textContent = parseFloat(v).toFixed(1);
  lmMCdraw();
}
window.lmMCsetZoom = lmMCsetZoom;

function lmMCreset() {
  const L = _lmMC.layout; if (!L) return;
  L.charCropsMulti[_lmMC.i][_lmMC.k] = { cx:0.5, cy:0.28, zoom:1 };
  const zs = document.getElementById('lmMCzoom'); if (zs) zs.value = 1;
  const zv = document.getElementById('lmMCzoomVal'); if (zv) zv.textContent = '1.0';
  lmMCdraw(); if (typeof generatePreview === 'function') generatePreview();
}
window.lmMCreset = lmMCreset;

function lmMCclose() {
  const modal = document.getElementById('lmMultiCropModal'); if (modal) modal.style.display = 'none';
  if (typeof generatePreview === 'function') generatePreview();
  lmPersistActiveLayout();
}
window.lmMCclose = lmMCclose;
