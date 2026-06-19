// ════════════════════════════════════════════════════════════════════════
//  import-game-menu.js
//  Menu de présélection des jeux AVANT l'import multi-events.
//  Affiché APRÈS la récupération de la liste des events sur start.gg, mais
//  AVANT l'animation des nuages : l'utilisateur peut décocher les jeux qu'il
//  ne veut pas importer. Tout est coché par défaut.
//
//  API :
//    showImportGameMenu(games, tournamentName) → Promise<Set<vgKey> | null>
//      games : [{ vgKey, name, imgUrl, entrants }]
//      résout avec un Set des vgKey COCHÉS, ou null si l'utilisateur annule.
//
//  Le menu se construit dynamiquement (aucune édition d'index.html requise) et
//  réutilise les variables CSS du thème (--purple, --bg2, --panel…) → il
//  s'adapte automatiquement au mode jour comme au mode nuit (body.night-mode).
// ════════════════════════════════════════════════════════════════════════

function _igmEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _igmInjectStyles() {
  if (document.getElementById('igmStyles')) return;
  const st = document.createElement('style');
  st.id = 'igmStyles';
  st.textContent = `
  .igm-overlay { position:fixed; inset:0; z-index:99999; display:flex;
    align-items:center; justify-content:center; padding:20px;
    background:rgba(74,48,96,0.34); backdrop-filter:blur(6px);
    -webkit-backdrop-filter:blur(6px); opacity:0; transition:opacity .25s ease; }
  .igm-overlay.show { opacity:1; }
  .igm-modal { width:min(440px,94vw); max-height:88vh; display:flex; flex-direction:column;
    background:var(--bg2,#fff0fa); border:1.5px solid var(--border,#e2c8f5);
    border-radius:var(--radius,18px); box-shadow:0 12px 48px rgba(120,80,200,0.30);
    overflow:hidden; transform:translateY(12px) scale(.98); transition:transform .25s ease; }
  .igm-overlay.show .igm-modal { transform:none; }
  .igm-head { padding:18px 22px 10px; text-align:center; }
  .igm-title { font-weight:800; font-size:1.12rem; color:var(--purple-deep,#7654c4); margin:0; }
  .igm-sub { font-size:.82rem; color:var(--text-soft,#9b7fb8); margin-top:4px; line-height:1.3; }
  .igm-toolbar { display:flex; gap:8px; justify-content:center; padding:0 22px 8px; }
  .igm-tool { font-size:.78rem; font-weight:600; color:var(--purple,#9b7fe8);
    background:transparent; border:1px solid var(--border,#e2c8f5); border-radius:999px;
    padding:5px 13px; cursor:pointer; transition:.15s; }
  .igm-tool:hover { background:var(--panel,#fff); }
  .igm-list { overflow-y:auto; padding:4px 14px 6px; flex:1 1 auto; }
  .igm-row { display:flex; align-items:center; gap:12px; padding:9px 12px; margin:5px 0;
    border-radius:14px; border:1.5px solid transparent; cursor:pointer;
    background:var(--panel,#ffffffcc); transition:.15s; user-select:none; }
  .igm-row:hover { border-color:var(--border,#e2c8f5); }
  .igm-row.off { opacity:.45; filter:grayscale(.7); }
  .igm-check { width:22px; height:22px; flex:0 0 auto; border-radius:7px;
    border:2px solid var(--purple,#9b7fe8); display:flex; align-items:center;
    justify-content:center; color:#fff; font-size:13px; font-weight:900;
    background:var(--purple,#9b7fe8); transition:.15s; }
  .igm-row.off .igm-check { background:transparent; color:transparent; }
  .igm-thumb { width:42px; height:42px; flex:0 0 auto; border-radius:10px; object-fit:cover;
    background:var(--bg,#f5e9ff); border:1px solid var(--border,#e2c8f5); }
  .igm-info { flex:1 1 auto; min-width:0; }
  .igm-name { font-weight:700; font-size:.92rem; color:var(--text,#4a3060);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .igm-ent { font-size:.76rem; color:var(--text-soft,#9b7fb8); margin-top:1px; }
  .igm-foot { display:flex; gap:10px; padding:14px 22px 18px; }
  .igm-btn { flex:1; padding:11px 0; border-radius:999px; font-weight:700; font-size:.92rem;
    cursor:pointer; border:none; transition:.15s; }
  .igm-cancel { background:var(--panel,#fff); color:var(--text-soft,#9b7fb8);
    border:1.5px solid var(--border,#e2c8f5); }
  .igm-cancel:hover { color:var(--text,#4a3060); }
  .igm-go { background:linear-gradient(135deg,var(--purple,#9b7fe8),var(--pink,#ffb8de));
    color:#fff; box-shadow:0 4px 16px rgba(155,127,232,0.4); }
  .igm-go:hover { filter:brightness(1.05); }
  .igm-go:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; }
  `;
  document.head.appendChild(st);
}

function showImportGameMenu(games, tournamentName) {
  return new Promise(resolve => {
    _igmInjectStyles();
    // Tout coché par défaut.
    const sel = new Set(games.map(g => g.vgKey));

    const ov = document.createElement('div');
    ov.className = 'igm-overlay';
    ov.innerHTML = `
      <div class="igm-modal" role="dialog" aria-modal="true" aria-label="Choisir les jeux à importer">
        <div class="igm-head">
          <p class="igm-title">🎮 Jeux à importer</p>
          <div class="igm-sub">${tournamentName ? _igmEsc(tournamentName) + '<br>' : ''}Décoche ceux que tu ne veux pas importer.</div>
        </div>
        <div class="igm-toolbar">
          <button class="igm-tool" data-act="all">Tout cocher</button>
          <button class="igm-tool" data-act="none">Tout décocher</button>
        </div>
        <div class="igm-list"></div>
        <div class="igm-foot">
          <button class="igm-btn igm-cancel" data-act="cancel">Annuler</button>
          <button class="igm-btn igm-go" data-act="go">Importer</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const listEl = ov.querySelector('.igm-list');
    const goBtn  = ov.querySelector('.igm-go');

    games.forEach(g => {
      const row = document.createElement('div');
      row.className = 'igm-row';
      row.dataset.key = g.vgKey;
      const ent = g.entrants ? `${g.entrants} entrant${g.entrants > 1 ? 's' : ''}` : '';
      row.innerHTML = `
        <div class="igm-check">✓</div>
        ${g.imgUrl
          ? `<img class="igm-thumb" src="${_igmEsc(g.imgUrl)}" alt="" onerror="this.style.visibility='hidden'">`
          : `<div class="igm-thumb"></div>`}
        <div class="igm-info">
          <div class="igm-name">${_igmEsc(g.name)}</div>
          ${ent ? `<div class="igm-ent">${ent}</div>` : ''}
        </div>`;
      row.addEventListener('click', () => {
        if (sel.has(g.vgKey)) { sel.delete(g.vgKey); row.classList.add('off'); }
        else { sel.add(g.vgKey); row.classList.remove('off'); }
        updateGo();
      });
      listEl.appendChild(row);
    });

    function updateGo() {
      const n = sel.size;
      goBtn.textContent = n ? `Importer (${n})` : 'Importer';
      goBtn.disabled = n === 0;
    }
    updateGo();

    function close(result) {
      ov.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => ov.remove(), 250);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter' && sel.size) close(new Set(sel));
    }

    ov.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') return close(null);
      if (act === 'go')     return sel.size ? close(new Set(sel)) : undefined;
      if (act === 'all') {
        sel.clear(); games.forEach(g => sel.add(g.vgKey));
        listEl.querySelectorAll('.igm-row').forEach(r => r.classList.remove('off'));
        return updateGo();
      }
      if (act === 'none') {
        sel.clear();
        listEl.querySelectorAll('.igm-row').forEach(r => r.classList.add('off'));
        return updateGo();
      }
      if (e.target === ov) close(null); // clic en dehors du panneau = annuler
    });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => ov.classList.add('show'));
    // Filet anti-throttle : si rAF est ralenti (onglet en arrière-plan), on
    // garantit quand même l'apparition du panneau.
    setTimeout(() => ov.classList.add('show'), 60);
  });
}
