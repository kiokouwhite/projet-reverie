// ============================================================
// STARTGG.JS — Création de tournoi start.gg depuis l'app
// ============================================================

const SGG_API = 'https://api.start.gg/gql/alpha';

let SGG = {
  token: '',
  sourceTournament: null,
  targetTournament: null,
  events: [],
  weekA: ['Street Fighter 6', 'Guilty Gear Strive'],
  weekB: ['Tekken 8', '2XKO'],
  passMain: ['Student Pass', 'Standard Pass'],
  passSide: ['Freeplay Pass', 'Student Pass', 'Standard Pass'],
};

let sggInitDone = false;
function sggInit() {
  if (sggInitDone) return;
  sggInitDone = true;
  sggLoadSettings();
  sggInitConsoleSection();
}

// ── SEMAINES A/B ──────────────────────────────────────────────────────────────
function sggSaveWeeks() {
  localStorage.setItem('sgg_week_a', JSON.stringify(SGG.weekA));
  localStorage.setItem('sgg_week_b', JSON.stringify(SGG.weekB));
}
function sggLoadWeeks() {
  try { SGG.weekA = JSON.parse(localStorage.getItem('sgg_week_a')) || SGG.weekA; } catch{}
  try { SGG.weekB = JSON.parse(localStorage.getItem('sgg_week_b')) || SGG.weekB; } catch{}
}

function sggRenderWeekTags() {
  ['A','B'].forEach(w => {
    const el = document.getElementById(`sggWeek${w}Tags`);
    if (!el) return;
    const games = w === 'A' ? SGG.weekA : SGG.weekB;
    el.innerHTML = games.map((g, i) => `
      <span class="sgg-week-tag week-${w.toLowerCase()}">
        ${escSGG(g)}
        <button onclick="sggRemoveWeekGame('${w}',${i})" title="Supprimer">✕</button>
      </span>`).join('');
  });
}

function sggAddWeekGame(week, name) {
  if (!name) return;
  if (week === 'A') SGG.weekA.push(name);
  else              SGG.weekB.push(name);
  sggSaveWeeks();
  sggRenderWeekTags();
}

function sggAddWeekGameFromInput(week, input) {
  const val = input.value.trim();
  if (!val) return;
  sggAddWeekGame(week, val);
  input.value = '';
  sggCloseWeekDropdown(week);
}

let sggWeekSearchTimers = {};

async function sggSearchWeekGame(week, input) {
  const query = input.value.trim();
  const drop = document.getElementById(`sggWeekDrop${week}`);
  if (!drop) return;

  if (!query || query.length < 2) {
    drop.style.display = 'none';
    return;
  }

  clearTimeout(sggWeekSearchTimers[week]);
  sggWeekSearchTimers[week] = setTimeout(async () => {
    drop.style.display = 'block';
    drop.innerHTML = '<div class="sgg-game-drop-loading">Recherche…</div>';

    try {
      const data = await sggQuery(`
        query SearchGame($name: String) {
          videogames(query: { filter: { name: $name }, perPage: 8 }) {
            nodes { id name images { url type } }
          }
        }`, { name: query });

      const games = data?.videogames?.nodes || [];
      if (!games.length) {
        drop.innerHTML = '<div class="sgg-game-drop-empty">Aucun jeu trouvé</div>';
        return;
      }

      drop.innerHTML = games.map(g => {
        const img = g.images?.find(im => im.type === 'profile')?.url || g.images?.[0]?.url || '';
        return `<div class="sgg-game-drop-item"
          onmousedown="sggPickWeekGame('${week}', '${escSGG(g.name)}', this.closest('.sgg-game-search-wrap').querySelector('input'))">
          ${img ? `<img src="${img}" class="sgg-game-drop-img" alt="">` : '<span class="sgg-game-drop-noimg">🎮</span>'}
          <span class="sgg-game-drop-name">${escSGG(g.name)}</span>
        </div>`;
      }).join('');

    } catch(e) {
      drop.innerHTML = `<div class="sgg-game-drop-empty">Erreur : ${e.message}</div>`;
    }
  }, 300);
}

function sggPickWeekGame(week, name, input) {
  sggAddWeekGame(week, name);
  if (input) input.value = '';
  sggCloseWeekDropdown(week);
}

function sggCloseWeekDropdown(week) {
  const drop = document.getElementById(`sggWeekDrop${week}`);
  if (drop) drop.style.display = 'none';
}

function sggRemoveWeekGame(week, idx) {
  if (week === 'A') SGG.weekA.splice(idx, 1);
  else              SGG.weekB.splice(idx, 1);
  sggSaveWeeks();
  sggRenderWeekTags();
}

function sggAutoDetectAndApplyWeek() {
  if (!SGG.sourceTournament) return;

  const mainEvents = SGG.sourceTournament.events
    .filter(ev => !ev.name.toLowerCase().includes('side'))
    .map(ev => (ev.videogame?.name || '').toLowerCase());

  const matches = g => name => name.includes(g) || g.includes(name);

  const scoreA = SGG.weekA.filter(g => mainEvents.some(matches(g.toLowerCase()))).length;
  const scoreB = SGG.weekB.filter(g => mainEvents.some(matches(g.toLowerCase()))).length;

  let detectedWeek = null;
  if (scoreA > scoreB)      detectedWeek = 'A';
  else if (scoreB > scoreA) detectedWeek = 'B';

  if (!detectedWeek) {
    // Impossible de détecter → laisser vide, l'utilisateur choisit
    sggRenderEvents();
    return;
  }

  // Appliquer la semaine opposée
  const nextWeek = detectedWeek === 'A' ? 'B' : 'A';
  sggHighlightWeekBtn(nextWeek);
  sggApplyWeek(nextWeek);

  sggStatus('ok',
    `Semaine précédente détectée : Semaine ${detectedWeek} → Semaine ${nextWeek} appliquée automatiquement`
  );
}

function sggHighlightWeekBtn(week) {
  document.querySelectorAll('.sgg-week-apply-btn').forEach(btn => btn.classList.remove('selected'));
  const btn = document.querySelector(`.sgg-week-apply-btn.week-${week.toLowerCase()}`);
  if (btn) btn.classList.add('selected');
}

function sggApplyWeek(week) {
  sggHighlightWeekBtn(week);
  const games = week === 'A' ? SGG.weekA : SGG.weekB;

  SGG.events = games.map(g => {
    const ev = {
      id: null,
      name: `MAIN EVENT - ${g}`,
      gameName: g,
      gameId: null,
      gameImage: '',
      type: 1,
      isMain: true,
      numEntrants: null,
      keep: true,
    };
    ev.cap = sggDefaultCap(ev); // Smash → 40, autres → 16
    ev.description = sggDefaultDescription(ev); // override par-jeu (Discord) ou hardcoded
    return ev;
  });

  sggRenderEvents();

  // Récupérer les gameIds automatiquement depuis l'API
  if (sggGetToken()) sggFetchWeekGameIds();
}

async function sggFetchWeekGameIds() {
  let updated = false;
  for (let i = 0; i < SGG.events.length; i++) {
    const ev = SGG.events[i];
    if (ev.gameId || !ev.gameName) continue;
    try {
      const data = await sggQuery(`
        query SearchGame($name: String) {
          videogames(query: { filter: { name: $name }, perPage: 5 }) {
            nodes { id name images { url type } }
          }
        }`, { name: ev.gameName });
      const games = data?.videogames?.nodes || [];
      // Chercher correspondance exacte d'abord, sinon prendre le premier résultat
      const match = games.find(g => g.name.toLowerCase() === ev.gameName.toLowerCase()) || games[0];
      if (match) {
        SGG.events[i].gameId    = match.id;
        SGG.events[i].gameImage = match.images?.find(im => im.type === 'profile')?.url
                                || match.images?.[0]?.url || '';
        updated = true;
      }
    } catch(e) {
      console.warn(`gameId introuvable pour "${ev.gameName}" :`, e.message);
    }
  }
  if (updated) {
    sggRenderEvents(); // Mettre à jour les images dans la liste
    sggGenerateAutoScript(); // Regénérer le script avec les gameIds
  }
}

// ── PASSES ───────────────────────────────────────────────────────────────────
const SGG_PASS_IDS = ['Freeplay', 'Student', 'Standard'];

// Le champ "Option ID passes" a été retiré : depuis la refacto, le script
// console récupère option/value de chaque event directement depuis la
// réponse de POST /event/create, donc plus besoin de saisir d'ID manuellement.
// On nettoie un éventuel reliquat localStorage de l'ancienne version.
try { localStorage.removeItem('sgg_pass_option_id'); } catch(e) {}

function sggSavePassConfig() {
  const cfg = {};
  ['Main', 'Side'].forEach(type => {
    cfg[type] = SGG_PASS_IDS.filter(p => {
      const el = document.getElementById(`sggPass${type}${p}`);
      return el && el.checked;
    });
  });
  localStorage.setItem('sgg_pass_config', JSON.stringify(cfg));
  // Mettre à jour état SGG
  SGG.passMain = cfg.Main.map(p => `${p} Pass`);
  SGG.passSide  = cfg.Side.map(p => `${p} Pass`);
}

function sggLoadPassConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem('sgg_pass_config'));
    if (!cfg) return;
    ['Main', 'Side'].forEach(type => {
      SGG_PASS_IDS.forEach(p => {
        const el = document.getElementById(`sggPass${type}${p}`);
        if (el) el.checked = (cfg[type] || []).includes(p);
      });
    });
    SGG.passMain = (cfg.Main || []).map(p => `${p} Pass`);
    SGG.passSide  = (cfg.Side  || []).map(p => `${p} Pass`);
  } catch {}
}

function sggPassSummaryHtml(events) {
  // Génère un résumé lisible des restrictions à appliquer manuellement
  const lines = events.map(ev => {
    const passes = ev.isMain ? SGG.passMain : SGG.passSide;
    const icon   = ev.isMain ? '⭐' : '🔸';
    const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
    return `<li>${icon} <strong>${escSGG(baseName)}</strong> → ${passes.map(escSGG).join(', ')}</li>`;
  });
  return `<ul class="sgg-pass-summary-list">${lines.join('')}</ul>`;
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
// Réutilise la clé API start.gg déjà saisie dans l'onglet Top 8
function sggGetToken() {
  return document.getElementById('apiKey')?.value.trim()
      || localStorage.getItem('top8_startgg_key')
      || '';
}
function sggLoadSettings() {
  const token = sggGetToken();
  const warn = document.getElementById('sggNoTokenWarn');
  if (warn) warn.style.display = token ? 'none' : 'block';
  sggLoadWeeks();
  sggRenderWeekTags();
  sggLoadPassConfig();
}
function sggSaveSettings() {} // no-op, géré par l'onglet Top 8

// ── API HELPER ────────────────────────────────────────────────────────────────
async function sggQuery(query, variables = {}) {
  const token = sggGetToken();
  if (!token) throw new Error('Token API start.gg manquant');
  const res = await fetch(SGG_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

// ── EXTRAIRE LE SLUG DEPUIS UNE URL ───────────────────────────────────────────
function sggExtractSlug(input) {
  // Accepte : https://www.start.gg/tournament/mon-tournoi ou juste "mon-tournoi"
  const match = input.match(/tournament\/([^\/\?#]+)/);
  return match ? match[1] : input.trim().replace(/\/$/, '');
}

// ── QUERY TOURNOI GÉNÉRIQUE ───────────────────────────────────────────────────
const SGG_TOURNAMENT_QUERY = `
  query TournamentQuery($slug: String) {
    tournament(slug: $slug) {
      id name slug startAt endAt timezone city countryCode venueAddress
      events {
        id name slug type numEntrants
        videogame { id name images { url type } }
      }
    }
  }`;

// ── CHARGER LE TOURNOI SOURCE (référence semaine précédente) ──────────────────
async function sggLoad() {
  const url = document.getElementById('sggSourceUrl').value.trim();
  if (!url) return sggStatus('error', 'Entrez une URL start.gg');
  if (!sggGetToken()) return sggStatus('error', '⚠️ Clé API manquante — saisis-la dans l\'onglet 🏆 Générateur de Top 8.');

  const slug = sggExtractSlug(url);
  sggStatus('loading', `Chargement de la source "${slug}"…`);
  try {
    const data = await sggQuery(SGG_TOURNAMENT_QUERY, { slug });
    if (!data.tournament) return sggStatus('error', 'Tournoi source introuvable.');
    SGG.sourceTournament = data.tournament;
    SGG.events = [];
    sggStatus('ok', `Source chargée : ${data.tournament.name} (${data.tournament.events.length} events)`);
    sggRenderPreviousWeek();
    sggAutoDetectAndApplyWeek();
  } catch(e) {
    sggStatus('error', e.message);
  }
}

// ── CHARGER LE TOURNOI CIBLE (déjà dupliqué sur start.gg) ────────────────────
async function sggLoadTarget() {
  const url = document.getElementById('sggTargetUrl').value.trim();
  if (!url) return sggStatus('error', 'Entrez l\'URL du tournoi cible');
  if (!sggGetToken()) return sggStatus('error', '⚠️ Clé API manquante — saisis-la dans l\'onglet 🏆 Générateur de Top 8.');

  const slug = sggExtractSlug(url);
  sggStatus('loading', `Chargement de la cible "${slug}"…`);
  try {
    const data = await sggQuery(SGG_TOURNAMENT_QUERY, { slug });
    if (!data.tournament) return sggStatus('error', 'Tournoi cible introuvable.');
    SGG.targetTournament = data.tournament;
    sggStatus('ok', `Cible chargée : ${data.tournament.name} — prête à configurer !`);
    sggRenderForm();
  } catch(e) {
    sggStatus('error', e.message);
  }
}

// ── AFFICHER LE FORMULAIRE (basé sur la cible) ────────────────────────────────
function sggRenderForm() {
  const t = SGG.targetTournament;
  if (!t) return;

  document.getElementById('sggForm').style.display = 'block';

  // Afficher les events actuels de la cible dans sggTargetInfo
  const info = document.getElementById('sggTargetInfo');
  if (info) {
    const evList = (t.events || []).map(ev =>
      `<span class="sgg-target-ev-pill">${escSGG(ev.name)}</span>`
    ).join('');
    info.style.display = 'block';
    info.innerHTML = `
      <div class="sgg-target-info-title">Events actuels sur la cible (seront supprimés&nbsp;→ remplacés) :</div>
      <div class="sgg-target-ev-pills">${evList || '<em>Aucun event</em>'}</div>`;
  }

  // Si la source est déjà chargée, relancer l'auto-détection
  if (SGG.sourceTournament) {
    sggRenderPreviousWeek();
    sggAutoDetectAndApplyWeek();
  }
}

// ── BANDEAU SEMAINE PRÉCÉDENTE ────────────────────────────────────────────────
function sggRenderPreviousWeek() {
  const wrap = document.getElementById('sggPreviousWeek');
  if (!wrap || !SGG.sourceTournament) return;

  const events = [...(SGG.sourceTournament.events || [])].sort((a, b) => {
    const aMain = !a.name.toLowerCase().includes('side');
    const bMain = !b.name.toLowerCase().includes('side');
    return bMain - aMain; // Main d'abord
  });
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="sgg-prevweek-header">
      📋 Semaine précédente — <span class="sgg-prevweek-name">${escSGG(SGG.sourceTournament.name)}</span>
    </div>
    <div class="sgg-prevweek-list">
      ${events.map(ev => {
        const isMain = !ev.name.toLowerCase().includes('side');
        const img = ev.videogame?.images?.find(i => i.type === 'profile')?.url || ev.videogame?.images?.[0]?.url || '';
        const gameName = ev.videogame?.name || '';
        const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
        return `<div class="sgg-prevweek-item"
          draggable="true"
          data-game-id="${ev.videogame?.id || ''}"
          data-game-name="${escSGG(gameName)}"
          data-game-image="${escSGG(img)}"
          data-base-name="${escSGG(baseName)}"
          ondragstart="sggPrevWeekDragStart(event)"
          ondragend="sggPrevWeekDragEnd(event)">
          ${img
            ? `<img src="${img}" class="sgg-prevweek-img" alt="">`
            : `<div class="sgg-prevweek-noimg">🎮</div>`}
          <span class="sgg-prevweek-game">${escSGG(baseName)}</span>
          <span class="sgg-prevweek-badge ${isMain ? 'main' : 'side'}">${isMain ? 'MAIN' : 'SIDE'}</span>
        </div>`;
      }).join('')}
    </div>`;
}

// ── RENDER EVENTS + PREVIEW ───────────────────────────────────────────────────
function sggRenderEvents() {
  sggRenderPreview();
  sggGenerateAutoScript(); // mettre à jour le script console si déjà analysé
  const wrap = document.getElementById('sggEventsList');
  wrap.innerHTML = SGG.events.map((ev, i) => `
    <div class="sgg-event-row ${ev.keep ? '' : 'sgg-event-disabled'}" id="sggEv${i}">
      <div class="sgg-event-left">
        <label class="sgg-checkbox-wrap">
          <input type="checkbox" ${ev.keep ? 'checked' : ''}
            onchange="sggToggleEvent(${i}, this.checked)">
          <span class="sgg-checkbox-label">Inclure</span>
        </label>
        ${ev.gameImage ? `<img src="${ev.gameImage}" class="sgg-game-img" alt="${ev.gameName}">` : `<div class="sgg-game-img-placeholder">🎮</div>`}
      </div>

      <div class="sgg-event-center">
        <div class="sgg-event-type-toggle">
          <button class="sgg-type-btn ${ev.isMain ? 'active main' : ''}"
            onclick="sggSetMain(${i}, true)">⭐ Main Event</button>
          <button class="sgg-type-btn ${!ev.isMain ? 'active side' : ''}"
            onclick="sggSetMain(${i}, false)">🔸 Side Event</button>
        </div>
        <input type="text" class="sgg-event-name-input" value="${escSGG(ev.name)}"
          placeholder="Nom de l'event" oninput="sggSetEventName(${i}, this.value)">
        <div class="sgg-game-row">
          <span class="sgg-game-label">Jeu :</span>
          <div class="sgg-game-search-wrap" id="sggGameWrap${i}">
            <input type="text" class="sgg-game-input" value="${escSGG(ev.gameName)}"
              placeholder="Rechercher un jeu…" autocomplete="off"
              oninput="sggSearchGame(${i}, this.value)"
              onfocus="sggSearchGame(${i}, this.value)"
              onblur="setTimeout(()=>sggCloseGameDropdown(${i}), 150)">
            <div class="sgg-game-dropdown" id="sggGameDrop${i}" style="display:none;"></div>
          </div>
        </div>
      </div>

      <div class="sgg-event-right">
        <span class="sgg-entrants-badge">${ev.numEntrants ?? '?'} participants</span>
        <label class="sgg-cap-wrap" title="Cap d'inscriptions (0 = pas de limite)">
          <span class="sgg-cap-label">🎟️ Cap</span>
          <input type="number" min="0" step="1" class="sgg-cap-input" value="${ev.cap || 0}"
            oninput="sggSetCap(${i}, this.value)">
        </label>
        <button class="sgg-del-btn" onclick="sggDeleteEvent(${i})" title="Supprimer">✕</button>
      </div>
      <div class="sgg-event-desc-row">
        <label class="sgg-desc-label">📝 Description (Markdown)</label>
        <textarea class="sgg-desc-input" rows="2" placeholder="Description optionnelle de l'event (affichée sur la page d'inscription start.gg)"
          oninput="sggSetDescription(${i}, this.value)">${escSGG(ev.description || '')}</textarea>
      </div>
    </div>
  `).join('');
}

// ── ACTIONS EVENTS ────────────────────────────────────────────────────────────
function sggToggleEvent(i, val)    { SGG.events[i].keep = val; sggRenderEvents(); }
function sggSetMain(i, val)        { SGG.events[i].isMain = val; sggRenderEvents(); }
function sggSetEventName(i, val)   { SGG.events[i].name = val; }
function sggSetGameName(i, val)    { SGG.events[i].gameName = val; }
function sggDeleteEvent(i)         { SGG.events.splice(i, 1); sggRenderEvents(); }
// Setter cap : update + regénération du script seulement (pas de re-render pour
// ne pas perdre le focus pendant qu'on tape).
// Marque aussi `capManual = true` pour que sggPickGame ne réécrase plus le cap
// avec le default-jeu après une saisie manuelle.
function sggSetCap(i, val) {
  SGG.events[i].cap = Math.max(0, parseInt(val, 10) || 0);
  SGG.events[i].capManual = true;
  if (typeof sggGenerateAutoScript === 'function') sggGenerateAutoScript();
}

// Setter description : update + persist en override par-jeu (partagé avec
// l'onglet Discord via dcSaveGameDescription → localStorage). Pas de re-render
// pour préserver le focus pendant la frappe.
function sggSetDescription(i, val) {
  const ev = SGG.events[i];
  ev.description = val || '';
  // Persister l'override par-jeu si on a un nom de jeu (sinon ça ne se stocke
  // nulle part et l'édit reste juste sur l'event courant le temps de la session).
  if (typeof dcSaveGameDescription === 'function' && ev.gameName) {
    dcSaveGameDescription(ev.gameName, ev.description);
  }
  if (typeof sggGenerateAutoScript === 'function') sggGenerateAutoScript();
}

// Cap par défaut selon le jeu :
//   - Smash Ultimate / SSBU → 40 joueurs
//   - tout le reste (Main et Side confondus) → 16 joueurs
// Le matching est fait sur gameName puis name pour couvrir les cas où le jeu
// n'est pas (encore) résolu côté autocomplete.
function sggDefaultCap(ev) {
  const txt = ((ev.gameName || '') + ' ' + (ev.name || '')).toLowerCase();
  if (/\b(smash|ultimate|ssbu)\b/.test(txt)) return 40;
  return 16;
}

// Description par défaut depuis la base partagée avec l'onglet Discord
// (DC_GAME_DESCRIPTIONS + overrides localStorage `dc_game_desc_overrides`).
// On utilise dcGameDescription() s'il est dispo, sinon fallback vide.
function sggDefaultDescription(ev) {
  if (typeof dcGameDescription !== 'function') return '';
  return dcGameDescription(ev.gameName || ev.name || '') || '';
}

// ── RECHERCHE DE JEU ─────────────────────────────────────────────────────────
let sggGameSearchTimers = {};

async function sggSearchGame(i, query) {
  const drop = document.getElementById(`sggGameDrop${i}`);
  if (!drop) return;

  // Mettre à jour le nom en temps réel
  SGG.events[i].gameName = query;

  if (!query || query.length < 2) {
    drop.style.display = 'none';
    return;
  }

  // Debounce 300ms
  clearTimeout(sggGameSearchTimers[i]);
  sggGameSearchTimers[i] = setTimeout(async () => {
    drop.style.display = 'block';
    drop.innerHTML = '<div class="sgg-game-drop-loading">Recherche…</div>';

    try {
      const data = await sggQuery(`
        query SearchGame($name: String) {
          videogames(query: { filter: { name: $name }, perPage: 8 }) {
            nodes { id name images { url type } }
          }
        }`, { name: query });

      const games = data?.videogames?.nodes || [];
      if (!games.length) {
        drop.innerHTML = '<div class="sgg-game-drop-empty">Aucun jeu trouvé</div>';
        return;
      }

      drop.innerHTML = games.map(g => {
        const img = g.images?.find(im => im.type === 'profile')?.url || g.images?.[0]?.url || '';
        return `<div class="sgg-game-drop-item" onmousedown="sggPickGame(${i}, '${escSGG(g.name)}', '${escSGG(img)}', ${g.id})">
          ${img ? `<img src="${img}" class="sgg-game-drop-img" alt="">` : '<span class="sgg-game-drop-noimg">🎮</span>'}
          <span class="sgg-game-drop-name">${escSGG(g.name)}</span>
        </div>`;
      }).join('');

    } catch(e) {
      drop.innerHTML = `<div class="sgg-game-drop-empty">Erreur : ${e.message}</div>`;
    }
  }, 300);
}

function sggPickGame(i, name, imageUrl, gameId) {
  const ev = SGG.events[i];
  ev.gameName  = name;
  ev.gameImage = imageUrl;
  ev.gameId    = gameId;

  // Cap auto recalculé selon le nouveau jeu, SAUF si l'utilisateur a saisi
  // une valeur manuelle (capManual=true). Permet à un event Tekken (16)
  // qu'on transforme en Smash de devenir 40 automatiquement.
  if (!ev.capManual) {
    const newCap = sggDefaultCap(ev);
    if (ev.cap !== newCap) {
      ev.cap = newCap;
      const capInput = document.querySelector(`#sggEv${i} .sgg-cap-input`);
      if (capInput) capInput.value = String(newCap);
    }
  }

  // Description auto-mise à jour avec celle du nouveau jeu (override par-jeu
  // ou hardcoded depuis discord.js). Pas de garde "manual" : la description
  // est par-jeu donc l'ancien texte de l'ancien jeu n'a plus de sens — et
  // les éditions de l'utilisateur sont déjà persistées par-jeu dans le
  // localStorage `dc_game_desc_overrides`, donc rien n'est perdu.
  const newDesc = sggDefaultDescription(ev);
  if (ev.description !== newDesc) {
    ev.description = newDesc;
    const descInput = document.querySelector(`#sggEv${i} .sgg-desc-input`);
    if (descInput) descInput.value = newDesc;
  }

  // Mettre à jour le champ input sans re-render complet
  const wrap = document.getElementById(`sggGameWrap${i}`);
  if (wrap) {
    const input = wrap.querySelector('.sgg-game-input');
    if (input) input.value = name;
  }
  // Mettre à jour l'image dans la colonne gauche
  const imgEl = document.querySelector(`#sggEv${i} .sgg-game-img`);
  if (imgEl && imageUrl) { imgEl.src = imageUrl; imgEl.style.display = ''; }
  const placeholder = document.querySelector(`#sggEv${i} .sgg-game-img-placeholder`);
  if (placeholder && imageUrl) {
    placeholder.outerHTML = `<img src="${imageUrl}" class="sgg-game-img" alt="${escSGG(name)}">`;
  }

  sggCloseGameDropdown(i);
  sggRenderPreview();
  // Régénérer le script auto pour refléter le nouveau cap si applicable
  if (typeof sggGenerateAutoScript === 'function') sggGenerateAutoScript();
}

function sggCloseGameDropdown(i) {
  const drop = document.getElementById(`sggGameDrop${i}`);
  if (drop) drop.style.display = 'none';
}

function sggAddEvent() {
  const ev = { name: 'Nouvel Event', gameName: '', gameId: null, gameImage: '', isMain: false, type: 1, keep: true, numEntrants: null };
  ev.cap = sggDefaultCap(ev); // 16 par défaut tant que le jeu n'est pas choisi
  ev.description = sggDefaultDescription(ev); // vide tant que pas de jeu
  SGG.events.push(ev);
  sggRenderEvents();
  // Scroll vers le bas
  document.getElementById('sggEventsList').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
}

// ── CONFIGURER LE TOURNOI CIBLE ───────────────────────────────────────────────
async function sggCreate() {
  if (!SGG.targetTournament) return sggStatus('error', 'Charge d\'abord le tournoi cible (étape ②)');

  const keptEvents = SGG.events.filter(ev => ev.keep);
  if (!keptEvents.length) return sggStatus('error', 'Aucun event à créer — applique une semaine A ou B');

  const target    = SGG.targetTournament;
  const targetUrl = `https://www.start.gg/tournament/${target.slug}/admin`;

  // ── Étape 1 : supprimer les events existants de la cible ──────────────────
  sggStatus('loading', 'Suppression des anciens events…');
  let deleted = 0;
  for (const ev of (target.events || [])) {
    try {
      await sggQuery(`
        mutation DeleteEvent($eventId: ID!) {
          deleteEvent(eventId: $eventId) { id }
        }`, { eventId: ev.id });
      deleted++;
    } catch(e) {
      console.warn(`Event "${ev.name}" non supprimé :`, e.message);
    }
  }

  // ── Étape 3 : créer les nouveaux events ───────────────────────────────────
  sggStatus('loading', `${deleted} anciens events supprimés. Création des nouveaux…`);
  let created = 0, errors = [];
  for (const ev of keptEvents) {
    const prefix   = ev.isMain ? 'MAIN EVENT' : 'SIDE EVENT';
    const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
    const fullName = `${prefix} - ${baseName}`;
    try {
      await sggQuery(`
        mutation CreateEvent($tournamentId: ID!, $input: EventInput) {
          createEvent(tournamentId: $tournamentId, event: $input) { id name }
        }`, {
        tournamentId: target.id,
        input: { name: fullName, type: ev.type || 1, videogameId: ev.gameId || undefined },
      });
      created++;
    } catch(e) {
      errors.push(`"${fullName}" : ${e.message}`);
      console.warn(`Event "${fullName}" non créé :`, e.message);
    }
  }

  // ── Résultat ───────────────────────────────────────────────────────────────
  const statusMsg = [
    `✅ ${created}/${keptEvents.length} events créés`,
    deleted ? `${deleted} anciens supprimés` : null,
    errors.length ? `⚠️ ${errors.length} erreur(s)` : null,
  ].filter(Boolean).join(' — ');

  sggStatus(errors.length && !created ? 'error' : 'ok', statusMsg);
  sggShowPassReminder(targetUrl, keptEvents, { errors });
}

function sggShowPassReminder(url, keptEvents, extra = {}) {
  const passHtml = sggPassSummaryHtml(keptEvents);

  const errHtml = extra.errors?.length ? `
    <div class="sgg-pass-reminder" style="background:#fdecea;border-color:#ef9a9a;">
      <div class="sgg-pass-reminder-title" style="color:#7a0000;">❌ Events non créés :</div>
      <ul class="sgg-pass-summary-list">${extra.errors.map(e => `<li>${escSGG(e)}</li>`).join('')}</ul>
    </div>` : '';

  document.getElementById('sggResultLink').innerHTML = `
    <a href="${url}" target="_blank" class="sgg-open-btn">🔗 Ouvrir l'admin du tournoi →</a>
    ${errHtml}
    <div class="sgg-pass-reminder">
      <div class="sgg-pass-reminder-title">🎫 Restrictions passes à appliquer :</div>
      ${passHtml}
      <p class="sgg-hint">Pour chaque event → <em>Paramètres → Tickets / Passes autorisés</em></p>
    </div>`;
}

// ── APERÇU COLONNE DROITE ────────────────────────────────────────────────────
// Deux sections drag-and-droppables (Main / Side). Glisser-déposer un event
// d'une section à l'autre bascule son `isMain` + déclenche un re-render +
// régénération du script auto. L'index d'origine dans SGG.events est conservé
// via data-event-idx, parce que la liste affichée est filtrée (kept only).
function sggRenderPreview() {
  const preview = document.getElementById('sggPreview');
  if (!preview) return;
  const kept = SGG.events
    .map((ev, i) => ({ ev, i }))
    .filter(({ ev }) => ev.keep);

  if (!kept.length) {
    preview.innerHTML = '<p class="sgg-hint" style="text-align:center;padding:20px 0">Aucun event sélectionné</p>';
    return;
  }

  const renderItem = ({ ev, i }) => {
    const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
    const img = ev.gameImage
      ? `<img src="${ev.gameImage}" class="sgg-preview-item-img" alt="">`
      : `<div class="sgg-preview-item-icon">🎮</div>`;
    return `
      <div class="sgg-preview-item ${ev.isMain ? 'main' : 'side'}"
           draggable="true"
           data-event-idx="${i}"
           ondragstart="sggPreviewDragStart(event, ${i})"
           ondragend="sggPreviewDragEnd(event)">
        ${img}
        <div class="sgg-preview-item-info">
          <div class="sgg-preview-item-name">${escSGG(baseName)}</div>
          <div class="sgg-preview-item-game">${escSGG(ev.gameName) || '—'}</div>
        </div>
        <span class="sgg-preview-badge ${ev.isMain ? 'main' : 'side'}">${ev.isMain ? 'MAIN' : 'SIDE'}</span>
      </div>`;
  };

  const mains = kept.filter(({ ev }) => ev.isMain);
  const sides = kept.filter(({ ev }) => !ev.isMain);

  const emptyHint = '<p class="sgg-preview-empty-hint">Glisse un event ici</p>';

  preview.innerHTML = `
    <div class="sgg-preview-section sgg-preview-section-main"
         ondragover="sggPreviewDragOver(event)"
         ondragleave="sggPreviewDragLeave(event)"
         ondrop="sggPreviewDrop(event, true)">
      <div class="sgg-preview-section-title">⚔️ MAIN EVENTS</div>
      <div class="sgg-preview-section-list">
        ${mains.length ? mains.map(renderItem).join('') : emptyHint}
      </div>
    </div>
    <div class="sgg-preview-section sgg-preview-section-side"
         ondragover="sggPreviewDragOver(event)"
         ondragleave="sggPreviewDragLeave(event)"
         ondrop="sggPreviewDrop(event, false)">
      <div class="sgg-preview-section-title">🎲 SIDE EVENTS</div>
      <div class="sgg-preview-section-list">
        ${sides.length ? sides.map(renderItem).join('') : emptyHint}
      </div>
    </div>`;
}

// ── DRAG & DROP ──────────────────────────────────────────────────────────────
// Deux sources possibles :
//   - 'preview'  : on déplace un event existant entre les sections Main/Side
//   - 'prevweek' : on tire un jeu depuis la carte "Semaine précédente" pour
//                  l'ajouter (ou le re-classer) dans la liste d'events
// Le dispatch se fait dans sggPreviewDrop selon `sggDragSource.kind`.
let sggDragSource = null;

function sggPreviewDragStart(e, idx) {
  sggDragSource = { kind: 'preview', idx };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', 'preview:' + idx); } catch(_) {}
  e.currentTarget.classList.add('sgg-preview-item-dragging');
}

function sggPreviewDragEnd(e) {
  e.currentTarget.classList.remove('sgg-preview-item-dragging');
  document.querySelectorAll('.sgg-preview-section.sgg-preview-section-active')
    .forEach(s => s.classList.remove('sgg-preview-section-active'));
  sggDragSource = null;
}

function sggPrevWeekDragStart(e) {
  const el = e.currentTarget;
  sggDragSource = {
    kind: 'prevweek',
    gameId:    el.dataset.gameId    ? Number(el.dataset.gameId) : null,
    gameName:  el.dataset.gameName  || '',
    gameImage: el.dataset.gameImage || '',
    baseName:  el.dataset.baseName  || ''
  };
  e.dataTransfer.effectAllowed = 'copy';
  try { e.dataTransfer.setData('text/plain', 'prevweek:' + (sggDragSource.gameId || '')); } catch(_) {}
  el.classList.add('sgg-prevweek-item-dragging');
}

function sggPrevWeekDragEnd(e) {
  e.currentTarget.classList.remove('sgg-prevweek-item-dragging');
  document.querySelectorAll('.sgg-preview-section.sgg-preview-section-active')
    .forEach(s => s.classList.remove('sgg-preview-section-active'));
  sggDragSource = null;
}

function sggPreviewDragOver(e) {
  if (!sggDragSource) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = sggDragSource.kind === 'prevweek' ? 'copy' : 'move';
  e.currentTarget.classList.add('sgg-preview-section-active');
}

function sggPreviewDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('sgg-preview-section-active');
}

function sggPreviewDrop(e, asMain) {
  e.preventDefault();
  e.currentTarget.classList.remove('sgg-preview-section-active');
  const src = sggDragSource;
  sggDragSource = null;
  if (!src) return;

  if (src.kind === 'preview') {
    // Déplacement Main ↔ Side d'un event déjà dans SGG.events
    const ev = SGG.events[src.idx];
    if (!ev) return;
    if (ev.isMain === !!asMain) return; // déjà au bon endroit
    ev.isMain = !!asMain;
    // Met à jour le préfixe du nom si nécessaire (ex: "MAIN EVENT - X" → "SIDE EVENT - X")
    const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
    ev.name = (asMain ? 'MAIN EVENT' : 'SIDE EVENT') + ' - ' + baseName;
    sggRenderEvents();
    return;
  }

  if (src.kind === 'prevweek') {
    // Ajout depuis la semaine précédente — on cherche d'abord un event existant
    // (par gameId, fallback par baseName insensible à la casse) pour le ré-activer
    // au lieu d'en créer un doublon.
    const baseName = src.baseName || src.gameName || '';
    const fullName = (asMain ? 'MAIN EVENT' : 'SIDE EVENT') + ' - ' + baseName;
    const norm = s => (s || '').toLowerCase().replace(/^(main event|side event)\s*[-–]\s*/i, '').trim();
    let existing = null;
    if (src.gameId) {
      existing = SGG.events.find(ev => ev.gameId === src.gameId);
    }
    if (!existing) {
      existing = SGG.events.find(ev => norm(ev.name) === norm(baseName));
    }
    if (existing) {
      existing.keep   = true;
      existing.isMain = !!asMain;
      existing.name   = fullName;
      // Ne touche PAS aux valeurs déjà saisies par l'utilisateur — sauf si
      // l'event n'en avait pas du tout (ex: créé avant introduction du champ)
      if (existing.cap == null) existing.cap = sggDefaultCap(existing);
      if (existing.description == null) existing.description = sggDefaultDescription(existing);
    } else {
      const newEv = {
        name:      fullName,
        gameId:    src.gameId || null,
        gameName:  src.gameName,
        gameImage: src.gameImage,
        keep:      true,
        isMain:    !!asMain
      };
      newEv.cap = sggDefaultCap(newEv); // Smash → 40, autres → 16
      newEv.description = sggDefaultDescription(newEv); // override par-jeu ou hardcoded
      SGG.events.push(newEv);
    }
    sggRenderEvents();
  }
}

// ── CONSOLE SCRIPT (REST API interne start.gg) ───────────────────────────────
// Endpoint découvert via Network tab : POST https://www.start.gg/api/-/rest/event/create

function sggInitConsoleSection() {
  sggGenerateAutoScript();
}

function sggCopyScript(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.closest('.sgg-script-wrap')?.querySelector('.sgg-script-copy-btn');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = '✅ Copié !';
      setTimeout(() => { btn.textContent = prev; }, 1500);
    }
  });
}

function sggGenerateAutoScript() {
  const box = document.getElementById('sggAutoScriptBox');
  const warnBox = document.getElementById('sggScriptWarnings');
  if (!box) return;

  if (!SGG.targetTournament) {
    box.textContent = '// Charge le tournoi cible (étape ②) et applique une semaine A ou B d\'abord';
    return;
  }
  const keptEvents = SGG.events.filter(ev => ev.keep);
  if (!keptEvents.length) {
    box.textContent = '// Applique une semaine A ou B d\'abord';
    return;
  }

  const target = SGG.targetTournament;
  const oldIds = (target.events || []).map(e => String(e.id));

  // Construire la liste d'events avec warnings si gameId manquant
  const warnings = [];
  const eventsData = keptEvents.map(ev => {
    const prefix   = ev.isMain ? 'MAIN EVENT' : 'SIDE EVENT';
    const baseName = ev.name.replace(/^(MAIN EVENT|SIDE EVENT)\s*[-–]\s*/i, '');
    const fullName = `${prefix} - ${baseName}`;
    if (!ev.gameId) warnings.push(fullName);
    // isMain = bool, utilisé côté script généré pour choisir PASS_MAIN ou PASS_SIDE
    // cap = nombre d'inscriptions max (0 = pas de limite). Propagé en `optionLimit` dans la PUT.
    // description = texte affiché sur la page d'inscription start.gg, propagé dans
    // une PUT séparée avec validationKey='event-registration-settings'.
    return {
      name: fullName,
      gameId: ev.gameId || null,
      isMain: !!ev.isMain,
      cap: Math.max(0, parseInt(ev.cap, 10) || 0),
      description: String(ev.description || '')
    };
  });

  // Afficher warnings
  if (warnBox) {
    if (warnings.length) {
      warnBox.style.display = 'block';
      warnBox.innerHTML = `⚠️ Ces events n'ont pas de jeu sélectionné via l'autocomplete (gameId manquant — cherche et sélectionne le jeu dans la liste déroulante) :<br>` +
        warnings.map(w => `<strong>${escSGG(w)}</strong>`).join(', ');
    } else {
      warnBox.style.display = 'none';
    }
  }

  // Récupérer la config passes depuis l'app
  const passMainIds = SGG.passMain.map(p => {
    if (p.toLowerCase().includes('freeplay')) return '6242743';
    if (p.toLowerCase().includes('student'))  return '6242744';
    if (p.toLowerCase().includes('standard')) return '6242745';
    return null;
  }).filter(Boolean);
  const passSideIds = SGG.passSide.map(p => {
    if (p.toLowerCase().includes('freeplay')) return '6242743';
    if (p.toLowerCase().includes('student'))  return '6242744';
    if (p.toLowerCase().includes('standard')) return '6242745';
    return null;
  }).filter(Boolean);

  const slug = String(target.slug || '').replace(/^tournament\//, '');

  const script =
`// ══ Script Projet Reverie — ${target.name} ══
// Colle dans la console F12 sur la page admin start.gg de ce tournoi.
// Plus aucun ID hardcodé : à chaque event créé, on récupère son optionId/valueId
// directement depuis la réponse /event/create, puis on applique les restrictions
// passes en PUT individuel sur SON option (le modèle actuel start.gg = 1 option
// par event, pas un master "Events" partagé).
(async function() {
  const REST      = 'https://www.start.gg/api/-/rest';
  const TID       = ${target.id};
  const SLUG      = ${JSON.stringify(slug)};
  const TSTART    = ${target.startAt || 0};
  const OLD       = ${JSON.stringify(oldIds)};
  const EVENTS    = ${JSON.stringify(eventsData, null, 2)};
  const PASS_MAIN = ${JSON.stringify(passMainIds)}; // passes autorisées Main Event
  const PASS_SIDE = ${JSON.stringify(passSideIds)}; // passes autorisées Side Event

  const H = {
    'Content-Type': 'application/json',
    'x-web-source': 'gg-web-rest',
    'Client-Version': '20'
  };

  // ── 1. Supprimer les anciens events ──────────────────────────────────────
  console.log('%c🗑️ Suppression des anciens events...', 'color:#ff9800;font-weight:bold');
  for (const id of OLD) {
    try {
      let r = await fetch(\`\${REST}/event/\${id}\`, { method: 'DELETE', headers: H });
      if (!r.ok) r = await fetch(\`\${REST}/event/\${id}/delete\`, { method: 'POST', headers: H });
      console.log(r.ok ? '%c✅ Supprimé ' + id : '%c❌ Erreur ' + id + ' (' + r.status + ')',
        r.ok ? 'color:green' : 'color:red');
    } catch(e) { console.log('%c❌ ' + id, 'color:red', e.message); }
  }

  // ── 2. Créer les events + capturer leur option/value depuis la réponse ───
  // La réponse /event/create renvoie cD.entities.registrationOption (l'option
  // checkbox de l'event) et cD.entities.registrationValue (sa value unique).
  // On les extrait pour chaque event afin d'éviter une étape de discovery.
  console.log('%c🚀 Création des events...', 'color:#2196f3;font-weight:bold');
  const created = [];
  for (const ev of EVENTS) {
    try {
      const body = {
        name: ev.name, gameId: ev.gameId, tournamentId: TID, startAt: TSTART,
        eventType: 1, published: true, isOnline: false, entryFee: 0,
        checkInCount: 1, visible: true, validationKey: 'registration-format2',
        platformIds: [],
        additionalParams: { eventRegistrationEndAt: null, eventRegistrationStartAt: null,
          ffaAutoBracketGenerationConfig: null, offlineNetworks: false, optionLimit: 0 },
        rulesetSettings: { gameMode: 1 }
      };
      const r = await fetch(\`\${REST}/event/create\`, { method: 'POST', headers: H, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d?.error) {
        console.log('%c❌ ' + ev.name, 'color:red;font-weight:bold', d?.message || d?.error || r.status);
        continue;
      }
      // Localise l'option (fieldType:checkbox, optionType:event) et sa value
      const optMap = d?.entities?.registrationOption || {};
      const valMap = d?.entities?.registrationValue || d?.entities?.registrationOptionValue || {};
      let option = null, value = null;
      for (const o of Object.values(optMap)) {
        if (o?.optionType === 'event' && o?.fieldType === 'checkbox') { option = o; break; }
      }
      for (const v of Object.values(valMap)) {
        if (v?.optionType === 'event' && (option ? v.optionId === option.id : true)) { value = v; break; }
      }
      if (!option || !value) {
        console.log('%c⚠️ ' + ev.name + ' créé mais option/value introuvable dans la réponse (skip restrictions)', 'color:#ff9800');
        console.log('   Réponse :', d);
        created.push({ ...ev });
        continue;
      }
      console.log('%c✅ ' + ev.name + ' (event:' + value.optionTypeId + ', opt:' + option.id + ', val:' + value.id + ')', 'color:green;font-weight:bold');
      created.push({ ...ev, option, value });
    } catch(e) { console.log('%c❌ ' + ev.name, 'color:red', e.message); }
  }

  // ── 3. Restrictions passes + cap d'inscriptions ────────────────────────────
  // PUT par event sur SON option pour appliquer (a) optionLimit = cap d'inscriptions
  // au top-level, (b) values[id].additional.passValueIds = passes autorisées.
  // La PUT est skippée seulement si l'event n'a NI cap NI passes à appliquer.
  const hasAnyConfig =
    PASS_MAIN.length || PASS_SIDE.length || EVENTS.some(ev => ev.cap > 0);
  if (!hasAnyConfig) {
    console.log('%c⏭️  Aucun cap ni restriction passe configuré — étape ignorée', 'color:#888');
  } else {
    console.log('%c🎫 Application des restrictions (passes + cap)...', 'color:#9c27b0;font-weight:bold');
    for (const ev of created) {
      if (!ev.option || !ev.value) {
        console.log('%c  ⚠️ ' + ev.name + ' : pas d\\'option/value capturé, skip', 'color:#ff9800');
        continue;
      }
      const passIds = (ev.isMain ? PASS_MAIN : PASS_SIDE).map(Number);
      const cap = Math.max(0, parseInt(ev.cap, 10) || 0);
      if (!passIds.length && cap <= 0) {
        // rien à appliquer pour cet event
        continue;
      }

      // Body construit par-dessus la value capturée (préserve createdAt, updatedAt,
      // et tout champ qu'on n'aurait pas anticipé). On modifie additional.passValueIds
      // (ou null si pas de restriction) et optionLimit au top-level pour le cap.
      const valueBody = {
        ...ev.value,
        additional: {
          ...(ev.value.additional || {}),
          passValueIds: passIds.length ? passIds : null,
          phaseIds: ev.value.additional?.phaseIds ?? null,
          fullTeamRegistrationOnly: ev.value.additional?.fullTeamRegistrationOnly ?? false,
          allowSkipTeam: ev.value.additional?.allowSkipTeam ?? false,
          forceSkipTeam: ev.value.additional?.forceSkipTeam ?? false
        },
        expand: ['entityObjects']
      };
      const body = {
        validationKey: 'event-registration-additional-settings',
        tournamentId: TID,
        optionId: ev.option.id,
        optionType: 'event',
        fieldType: 'checkbox',
        // start.gg envoie le cap en string ("8") quand > 0, en number 0 sinon.
        // On s'aligne sur ce qu'on a capturé pour éviter toute surprise.
        optionLimit: cap > 0 ? String(cap) : 0,
        required: false,
        values: { [ev.value.id]: valueBody }
      };
      try {
        const headers = {
          ...H,
          'x-embed-referer': 'https://www.start.gg/admin/tournament/' + SLUG + '/event-reg/' + ev.value.optionTypeId
        };
        const r = await fetch(\`\${REST}/tournament/\${TID}/registrationoption/\${ev.option.id}\`,
          { method: 'PUT', headers, body: JSON.stringify(body) });
        if (r.ok) {
          const parts = [];
          if (passIds.length) parts.push('passes ' + (ev.isMain ? 'Main' : 'Side'));
          if (cap > 0) parts.push('cap ' + cap);
          console.log('%c  ✅ ' + parts.join(' + ') + ' → ' + ev.name, 'color:green');
        } else {
          const errData = await r.json().catch(() => null);
          console.log('%c  ❌ ' + ev.name + ' (' + r.status + ')', 'color:red', errData);
        }
      } catch(e) { console.log('%c  ❌ ' + ev.name, 'color:red', e.message); }
    }
  }

  // ── 4. Descriptions ────────────────────────────────────────────────────────
  // Endpoint identique mais validationKey = 'event-registration-settings'
  // (différent de la PUT précédente qui était 'event-registration-additional-settings').
  // On envoie le bloc values en passthrough (préserve l'état) et la description
  // au top-level. Skippé si l'event n'a pas de description saisie.
  const hasAnyDesc = EVENTS.some(ev => ev.description && ev.description.trim());
  if (!hasAnyDesc) {
    console.log('%c⏭️  Aucune description configurée — étape ignorée', 'color:#888');
  } else {
    console.log('%c📝 Application des descriptions...', 'color:#2196f3;font-weight:bold');
    for (const ev of created) {
      if (!ev.option || !ev.value) continue;
      const desc = String(ev.description || '').trim();
      if (!desc) continue;

      const body = {
        validationKey: 'event-registration-settings',
        tournamentId: TID,
        optionId: ev.option.id,
        optionType: 'event',
        fieldType: 'checkbox',
        visible: true,
        values: { [ev.value.id]: { ...ev.value, expand: ['entityObjects'] } },
        description: desc
      };
      try {
        const headers = {
          ...H,
          'x-embed-referer': 'https://www.start.gg/admin/tournament/' + SLUG + '/event-reg/' + ev.value.optionTypeId
        };
        const r = await fetch(\`\${REST}/tournament/\${TID}/registrationoption/\${ev.option.id}\`,
          { method: 'PUT', headers, body: JSON.stringify(body) });
        if (r.ok) {
          console.log('%c  ✅ description → ' + ev.name, 'color:green');
        } else {
          const errData = await r.json().catch(() => null);
          console.log('%c  ❌ description ' + ev.name + ' (' + r.status + ')', 'color:red', errData);
        }
      } catch(e) { console.log('%c  ❌ description ' + ev.name, 'color:red', e.message); }
    }
  }

  console.log('%c🎉 Terminé !', 'color:#4caf50;font-size:20px;font-weight:bold');
})();`;

  box.textContent = script;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function sggStatus(type, msg) {
  const el = document.getElementById('sggStatus');
  if (!el) return;
  el.className = `sgg-status sgg-status-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  if (type !== 'loading') {
    document.getElementById('sggResultLink').innerHTML = '';
  }
}

function sggTsToInput(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escSGG(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
