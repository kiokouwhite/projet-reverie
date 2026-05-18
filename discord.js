// ============================================================
// DISCORD.JS — Générateur d'annonce Discord depuis start.gg
// ============================================================

// Mots-clés pour détecter les side events
const SIDE_KEYWORDS = ['side', 'casual', 'amateur', 'bingo', 'bonus', 'extra', 'fun', 'mini', 'open bracket', 'exhibition'];

// ── STATE ─────────────────────────────────────────────────────────────────────
const DC = {
  tournament: null,   // données brutes start.gg
  events:     [],     // { id, name, game, gameName, isSide, description, roleId, gameImageUrl }
  tourneyEmoji: '',
  customClosing: 'Venez écrire l\'histoire !',
  scheduleLines: [
    'Ouverture à 18h00',
    'Main Events à 19h00',
    'Side Events à 20h00',
    'Plus d\'infos dans le start.gg',
  ],
  presetId: 'lorem_smash', // preset actif
};

// ── PRESETS DE MESSAGE ────────────────────────────────────────────────────────
// Chaque preset configure le rendu du message. Les champs UI (lieu, schedule,
// closing) sont pré-remplis quand on change de preset, et dcGenerate utilise
// les flags pour adapter les labels et la mise en forme.
const DC_PRESETS = [
  {
    id: 'lorem_smash',
    name: "Lorem Ipsum — Smash Strasbourg",
    venue: 'Gallia',
    schedule: [
      'Ouverture 17h30',
      'Main Events FG à 19h00',
      'Smash à 19h30',
      'Side Event à 20h00',
      "plus d'infos dans le startgg",
    ],
    closing: "Venez écrire l'histoire !",
    mainLabel: 'MAIN EVENTS',
    sideLabel: 'SIDE EVENTS',
    titleAsHeading: true,
    showInscription: true,
    datePrefix: '',
    usesEmbeds: true,
    roleServerMatch: 'smash', // filtre les rôles auto-détectés par nom de serveur
    // Met en avant l'event headline (image pleine largeur + accent doré +
    // étoile dans le titre, placé en premier dans MAIN EVENTS).
    featuredGameMatch: 'smash|ultimate|ssbu',
    tournamentEmoji: 'lorem_ipsum', // application emoji du bot (cross-server)
  },
  {
    id: 'lorem_strasfighter',
    name: "Lorem Ipsum — Stras'Fighter",
    venue: 'Gallia',
    schedule: [
      'Ouverture 17h30',
      'Main Events FG à 19h00',
      'Smash à 19h30',
      'Side Event à 20h00',
      "plus d'infos dans le startgg",
    ],
    closing: "Venez écrire l'histoire !",
    mainLabel: 'MAIN EVENTS',
    sideLabel: 'SIDE EVENT',
    titleAsHeading: true,
    showInscription: true,
    datePrefix: '',
    usesEmbeds: true,
    roleServerMatch: 'stras.*fighter',
    tournamentEmoji: 'lorem_ipsum',
  },
  {
    id: 'magna',
    name: "Magna Arena — Stras'Fighters",
    venue: "l'AEA",
    schedule: [
      'Ouverture 18h',
      'tournois à 19h30',
      "plus d'infos dans le startgg",
    ],
    closing: '',
    mainLabel: 'EVENTS',
    sideLabel: 'SIDE EVENT',
    titleAsHeading: true,
    showInscription: true,
    datePrefix: 'Demain soir',
    usesEmbeds: true,
    roleServerMatch: 'stras.*fighter',
    tournamentEmoji: 'magna_arena',
  },
];

function dcGetPreset(id) {
  return DC_PRESETS.find(p => p.id === (id || DC.presetId)) || DC_PRESETS[0];
}

// ── DESCRIPTIONS DE JEUX (pour les embeds Stras'Fighters) ─────────────────────
// Base hardcodée — overridable via UI (stocké en localStorage par nom normalisé).
const DC_GAME_DESCRIPTIONS = {
  // ── Mainline modernes ──
  'tekken 8':                "Le 8e opus de la légendaire saga 3D de Bandai Namco (2024). Heat System, combats viscéraux, roster massif.",
  'street fighter 6':        "Le dernier né de la saga Capcom (2023). Drive System, mode World Tour, et ultra compétitif.",
  'super smash bros ultimate': "Le crossover Nintendo ultime sur Switch (2018). 89 personnages, toujours au top du Smash compétitif.",
  'guilty gear strive':      "Anime fighter d'Arc System Works (2021). Roman Cancels, vitesse élevée, 30+ persos.",
  'guilty gear xrd rev 2':   "Guilty Gear Xrd REV2 d'Arc System Works (2017). Le dernier opus 2.5D avant Strive, apprécié des puristes.",
  '2xko':                    "Tag fighter 2v2 de Riot Games dans l'univers League of Legends. En accès anticipé.",
  'mortal kombat 1':         "Reboot de la saga par NetherRealm (2023). Système Kameo Fighter et fatalities iconiques.",
  'dragon ball fighterz':    "Tag fighter 3v3 d'Arc System Works (2018). Visuels anime stylisés, gameplay nerveux.",
  'granblue fantasy versus rising': "Versus Rising d'Arc System Works (2023). Suite de GBVS avec roster élargi et rollback.",
  'under night in birth ii sys celes': "Sequel d'UNI par French Bread (2023). Fighter 2D anime au roster unique.",
  'melty blood type lumina': "Spin-off Type-Moon par French Bread (2021). Fighter 2D anime, vitesse extrême et combos longs.",
  'the king of fighters xv': "Le dernier KOF de SNK (2022). Format 3v3, roster monumental.",
  'fatal fury city of the wolves': "Suite de Fatal Fury par SNK (2025). Modernisation de la légendaire saga Garou.",
  'invincible vs':           "Tag fighter inspiré de la série Invincible (Maximum Game). Style comic book.",
  // ── BlazBlue ──
  'blazblue central fiction':  "Le climax de la saga BlazBlue par Arc System Works (2015). Fighter 2D anime virtuose, 36 persos, mode story complet.",
  'blazblue cross tag battle': "Crossover 2v2 d'Arc System Works (2018). Réunit BlazBlue, Persona 4 Arena, RWBY, Under Night et plus.",
  // ── Smash & plateforme fighters ──
  'super smash bros melee':  "Le légendaire opus GameCube (2001). Wavedashing, vitesse extrême, scène compétitive culte.",
  'super smash bros brawl':  "Smash sur Wii (2008), avec son extension compétitive Project M.",
  'project m':               "Mod compétitif de Smash Bros Brawl. Mécaniques façon Melee + roster étendu.",
  'rivals of aether':        "Plateforme fighter indé (2017) par Dan Fornace. Hommage à Melee avec mécaniques originales.",
  'rivals 2':                "Rivals of Aether 2 (2024) — gameplay 3D, online rollback, scène compétitive en expansion.",
  'multiversus':             "Plateforme fighter free-to-play de Warner Bros (2024). Crossover DC, Looney Tunes, Game of Thrones…",
  'nickelodeon all star brawl 2': "Plateforme fighter Nickelodeon (2023). SpongeBob, TMNT, Avatar et plus.",
  'brawlhalla':              "Plateforme fighter free-to-play (2017). Roster énorme, accessibilité maximale.",
  // ── Anime / arc system & french bread ──
  'persona 4 arena ultimax': "Anime fighter Atlus × Arc System Works (2014). Suite de Persona 4 Arena.",
  'skullgirls 2nd encore':   "Fighter 2D indé (2013). Hand-drawn, tag system, roster 100% féminin.",
  'them fighting herds':     "Fighter 2D indé inspiré par la communauté MLP (2020).",
  'pocket bravery':          "Fighter 2D pixel art rétro (2023). Inspiré par les classiques arcade SNK/Capcom.",
  // ── Capcom legacy & Marvel ──
  'street fighter v':        "Capcom (2016). 5e opus principal — V-Trigger, V-System, scène encore active.",
  'street fighter iii 3rd strike': "Capcom (1999). Le summit de SF2D — parries, Daigo Moment, sacré culte.",
  'ultra street fighter iv': "Capcom (2014). Édition ultime de SF4, focus attack & FADC.",
  'marvel vs capcom 3':      "Tag fighter Capcom × Marvel (2011). Roster crossover dément.",
  'marvel vs capcom infinite': "Capcom × Marvel (2017). 2v2, Infinity Stones, scène modérément active.",
  'ultimate marvel vs capcom 3': "Capcom (2011). LE Marvel — Vergil, Doom, scène compétitive intemporelle.",
  // ── SNK Legacy ──
  'samurai shodown':         "SNK (2019). Reboot de la saga sabre — combats lents et mortels.",
  'garou mark of the wolves':"SNK (1999). Suite de Fatal Fury — Just Defense, esthétique iconique.",
  // ── 3D fighters ──
  'soulcalibur vi':          "SoulCalibur VI de Bandai Namco (2018). Combats à l'arme blanche, Reversal Edge, roster classique.",
  'virtua fighter 5 ultimate showdown': "VF5US de SEGA (2021). Refonte du king du 3D fighter (1993).",
  'dead or alive 6':         "Koei Tecmo (2019). 3D fighter avec Hold System, suite après DOA5.",
  // ── Smash side / Pokémon / Nintendo ──
  'pokken tournament':       "Bandai Namco × Pokémon (2015). 3D fighter Pokémon avec phases d'arène et de duel.",
  // ── Indé / autres ──
  'fantasy strike':          "Sirlin Games (2019). Fighter accessible, contrôles simplifiés sans inputs complexes.",
  'killer instinct':         "Iron Galaxy / Microsoft (2013). Combo Breakers, Instinct Mode.",
  'omen of sorrow':          "AOne Games (2018). Fighter 2.5D au thème horreur/dark fantasy.",
  // ── Side games tournois ──
  'bomberman':               "Bomberman compétitif. Pose de bombes, explosions, dernier debout gagne.",
  'pikmin':                  "Pikmin de Nintendo. Stratégie en temps réel, mignon et brutal.",
  'mario kart 8 deluxe':     "Mario Kart 8 Deluxe (2017). Le standard du party-race compétitif.",
  'super mario party':       "Mario Party Nintendo. Soirée chaotique au plateau, mini-jeux en chaîne.",
  'tetris':                  "Le puzzle game roi — Tetris compétitif (T-spins, perfect clears, KOs).",
};

// Cache des descriptions auto-fetchées depuis Wikipedia (persisté en
// localStorage pour éviter de re-fetch à chaque chargement).
const _DC_WIKI_CACHE = (() => {
  try { return JSON.parse(localStorage.getItem('dc_game_desc_wiki_cache') || '{}'); }
  catch { return {}; }
})();
const _DC_WIKI_FETCHING = new Set();    // norms en cours de fetch
const _DC_WIKI_FAILED   = new Set();    // norms ayant échoué (on ne retry pas immédiatement)

function dcGameDescription(gameName) {
  if (!gameName) return '';
  const norm = dcNormalize(gameName);
  // 1. Override utilisateur (textarea) — priorité absolue
  try {
    const overrides = JSON.parse(localStorage.getItem('dc_game_desc_overrides') || '{}');
    if (overrides[norm]) return overrides[norm];
  } catch {}
  // 2. Hardcoded — match exact, puis contains
  if (DC_GAME_DESCRIPTIONS[norm]) return DC_GAME_DESCRIPTIONS[norm];
  for (const [key, desc] of Object.entries(DC_GAME_DESCRIPTIONS)) {
    if (norm.includes(key) || key.includes(norm)) return desc;
  }
  // 3. Cache Wikipedia (fetch précédent réussi)
  if (_DC_WIKI_CACHE[norm]) return _DC_WIKI_CACHE[norm];
  // 4. Lance fetch async Wikipedia (une seule fois par jeu)
  if (!_DC_WIKI_FETCHING.has(norm) && !_DC_WIKI_FAILED.has(norm)) {
    _DC_WIKI_FETCHING.add(norm);
    _dcFetchWikiDescription(gameName).then(desc => {
      _DC_WIKI_FETCHING.delete(norm);
      if (desc) {
        _DC_WIKI_CACHE[norm] = desc;
        try { localStorage.setItem('dc_game_desc_wiki_cache', JSON.stringify(_DC_WIKI_CACHE)); } catch {}
        // Debounce le re-render : si plusieurs jeux finissent en cascade,
        // on n'appelle dcGenerate() qu'une fois.
        clearTimeout(_dcRerenderTimeout);
        _dcRerenderTimeout = setTimeout(() => {
          if (typeof dcGenerate === 'function') dcGenerate();
          if (typeof dcBuildEventControls === 'function') dcBuildEventControls();
        }, 100);
      } else {
        _DC_WIKI_FAILED.add(norm);
      }
    }).catch(() => {
      _DC_WIKI_FETCHING.delete(norm);
      _DC_WIKI_FAILED.add(norm);
    });
  }
  return ''; // Vide pour l'instant — le re-render arrivera quand fetch terminé
}
let _dcRerenderTimeout = null;

// Fetch async Wikipedia avec plusieurs tentatives (suffixes "jeu vidéo" /
// "video game" pour désambigüer + lang fr puis en).
async function _dcFetchWikiDescription(gameName) {
  const queries = [
    `${gameName} (jeu vidéo)`,
    `${gameName} (video game)`,
    gameName,
  ];
  for (const q of queries) {
    for (const lang of ['fr', 'en']) {
      try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        // Skip les pages de désambiguïsation (homonymes)
        if (data.type === 'disambiguation') continue;
        if (!data.extract) continue;
        // Limite à ~2 phrases / 200 chars pour rester compact dans Discord
        let text = data.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
        if (text.length > 220) text = text.slice(0, 217).trim() + '…';
        return text;
      } catch (e) { /* try next */ }
    }
  }
  return null;
}

// Permet de purger le cache wiki si le user veut forcer des re-fetches
window.dcClearWikiCache = function(){
  for (const k of Object.keys(_DC_WIKI_CACHE)) delete _DC_WIKI_CACHE[k];
  _DC_WIKI_FAILED.clear();
  try { localStorage.removeItem('dc_game_desc_wiki_cache'); } catch {}
  console.log('[dc] Wikipedia cache purgé');
};

function dcSaveGameDescription(gameName, text) {
  if (!gameName) return;
  const norm = dcNormalize(gameName);
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem('dc_game_desc_overrides') || '{}'); } catch {}
  if (text && text.trim()) overrides[norm] = text.trim();
  else delete overrides[norm];
  try { localStorage.setItem('dc_game_desc_overrides', JSON.stringify(overrides)); } catch {}
}

// ── Persistance par jeu : rôle (ping) et flag isSide ──
// Stocké dans localStorage par version normalisée du nom du jeu, comme
// dcSaveGameDescription. Permet de retrouver les réglages d'un jeu d'un
// tournoi à l'autre (ex: Street Fighter 6 → toujours le même rôle pingué).
function dcSaveGameRole(gameName, roleId) {
  if (!gameName) return;
  const norm = dcNormalize(gameName);
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem('dc_game_role_overrides') || '{}'); } catch {}
  if (roleId && roleId.trim()) overrides[norm] = roleId.trim();
  else delete overrides[norm];
  try { localStorage.setItem('dc_game_role_overrides', JSON.stringify(overrides)); } catch {}
}
function dcLoadGameRole(gameName) {
  if (!gameName) return '';
  const norm = dcNormalize(gameName);
  try {
    const overrides = JSON.parse(localStorage.getItem('dc_game_role_overrides') || '{}');
    return overrides[norm] || '';
  } catch { return ''; }
}
function dcSaveGameIsSide(gameName, isSide) {
  if (!gameName) return;
  const norm = dcNormalize(gameName);
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem('dc_game_side_overrides') || '{}'); } catch {}
  // On stocke true ET false (explicite, pour respecter le choix user
  // même quand il marque un event comme MAIN alors que dcIsSide() le
  // détectait comme side). null/undefined = pas d'override.
  overrides[norm] = !!isSide;
  try { localStorage.setItem('dc_game_side_overrides', JSON.stringify(overrides)); } catch {}
}
function dcLoadGameIsSide(gameName) {
  if (!gameName) return null;
  const norm = dcNormalize(gameName);
  try {
    const overrides = JSON.parse(localStorage.getItem('dc_game_side_overrides') || '{}');
    if (norm in overrides) return overrides[norm] === true;
    return null; // pas d'override → laisser l'auto-détection
  } catch { return null; }
}

// ── UTILITAIRES ───────────────────────────────────────────────────────────────
const DAYS_FR   = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function dcFormatDate(timestamp) {
  if (!timestamp) return '?';
  const d = new Date(timestamp * 1000);
  const day   = DAYS_FR[d.getDay()];
  const num   = d.getDate();
  const month = MONTHS_FR[d.getMonth()];
  return `Ce ${day} ${num} ${month}`;
}

function dcSlugFromUrl(url) {
  const m = url.match(/start\.gg\/tournament\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

// Construit l'URL canonique d'un tournoi. Le `slug` retourné par l'API
// start.gg inclut le préfixe "tournament/" — on le strip pour éviter
// "tournament/tournament/..." dans l'URL.
function dcTournamentUrl(slug) {
  const clean = String(slug || '').replace(/^(?:tournament\/)+/, '');
  return `https://www.start.gg/tournament/${clean}/details`;
}

function dcIsSide(eventName) {
  const low = (eventName || '').toLowerCase();
  return SIDE_KEYWORDS.some(k => low.includes(k));
}

function escDC(str) {
  return (str || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── FETCH TOURNAMENT ──────────────────────────────────────────────────────────
async function dcFetch() {
  const urlInput = document.getElementById('dcUrl').value.trim();
  const apiKey   = document.getElementById('apiKey')?.value?.trim();

  if (!urlInput) { dcStatus('error','❌ Colle d\'abord l\'URL du start.gg'); return; }
  if (!apiKey)   { dcStatus('error','❌ Entre ta clé API start.gg dans l\'onglet Top 8'); return; }

  const slug = dcSlugFromUrl(urlInput);
  if (!slug) { dcStatus('error','❌ URL invalide — exemple : https://start.gg/tournament/mon-tournoi/details'); return; }

  dcStatus('loading','⏳ Récupération du tournoi…');
  document.getElementById('dcFetchBtn').disabled = true;

  // Lance l'animation typewriter onirique EN PARALLÈLE du fetch start.gg.
  // L'overlay couvre l'écran pendant que la requête tourne — wow factor.
  // On attend la fin de l'animation ET la fin du fetch (Promise.all).
  const animPromise = (typeof dcPlayTypewriterAnim === 'function' && !window._dcTwActive)
    ? dcPlayTypewriterAnim()
    : Promise.resolve();

  try {
    const data = await gqlFetch(apiKey, `
      query($slug:String!) {
        tournament(slug:$slug) {
          name
          startAt
          endAt
          venueName
          venueAddress
          city
          slug
          events {
            id
            name
            numEntrants
            videogame { name displayName images { url type } }
          }
        }
      }`, { slug });

    const t = data?.data?.tournament;
    if (!t) { dcStatus('error','❌ Tournoi introuvable — vérifie l\'URL et la clé API'); return; }

    DC.tournament = t;
    DC.events = (t.events || []).map(ev => {
      const gameName = ev.videogame?.displayName || ev.videogame?.name || ev.name;
      // Image du jeu : préférer "primary" (logo carré), sinon la 1ère
      const images   = ev.videogame?.images || [];
      const gameImg  = (images.find(i => i.type === 'primary') || images[0])?.url || '';
      // Restaure les overrides persistés par jeu (rôle pingué + flag isSide)
      // → un jeu garde ses réglages d'un tournoi à l'autre.
      const savedRole   = dcLoadGameRole(gameName);
      const savedIsSide = dcLoadGameIsSide(gameName);
      return {
        id:            ev.id,
        name:          ev.name,
        gameName,
        numEntrants:   ev.numEntrants || 0,
        isSide:        savedIsSide !== null ? savedIsSide : dcIsSide(ev.name),
        description:   '',
        roleId:        savedRole || '',
        gameImageUrl:  gameImg,
      };
    });

    // Auto-détecter l'emoji tournoi depuis le nom
    DC.tourneyEmoji = '';

    dcStatus('ok', `✅ ${t.name} — ${DC.events.length} event(s) chargé(s)`);
    // Pré-remplir le lieu depuis start.gg (venueName en priorité, sinon city, sinon adresse)
    const venueEl = document.getElementById('dcVenue');
    if (venueEl && !venueEl.value) {
      const lieu = t.venueName || t.city || (t.venueAddress ? t.venueAddress.split(',')[0].trim() : '');
      if (lieu) venueEl.value = lieu;
    }
    // Afficher le bloc events
    const evBlock = document.getElementById('dcEventsBlock');
    if (evBlock) evBlock.style.display = 'block';
    dcBuildEventControls();
    // Auto-détection des rôles si preset Stras'Fighters/Magna et rôles chargés
    dcAutoAssignRoles(false);
    // On rend la page Discord IMMÉDIATEMENT (derrière l'overlay typewriter
    // toujours en cours d'animation). Comme ça, quand la feuille disparaît
    // à la fin de l'anim, la page est DÉJÀ chargée → bascule fluide,
    // pas de flash de l'ancienne empty state.
    dcGenerate();
    if (typeof _toggleDcEmptyState === 'function') _toggleDcEmptyState();
    // On attend quand même la fin de l'anim pour que le status soit
    // affiché au bon moment (et pour synchroniser le reset _isTransitioning).
    await animPromise;

  } catch(e) {
    dcStatus('error','❌ Erreur API : ' + (e.message || e));
    // Si erreur, on attend quand même la fin de l'anim avant de re-afficher
    // le formulaire pour éviter le mismatch visuel.
    try { await animPromise; } catch{}
  } finally {
    document.getElementById('dcFetchBtn').disabled = false;
  }
}

// État vide : tant qu'aucun tournoi n'a été fetché, on cache la preview
// Discord à droite + les autres slides du tarot (Réglages, Horaires, Bot),
// et on centre la carte "URL start.gg" au milieu de la page.
function _dcHasTournament() {
  return !!(typeof DC !== 'undefined' && DC && DC.tournament);
}
function _toggleDcEmptyState() {
  const isEmpty = !_dcHasTournament();
  document.body.classList.toggle('dc-no-tournament', isEmpty);
}
window._toggleDcEmptyState = _toggleDcEmptyState;
// Toggle initial au boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _toggleDcEmptyState);
} else {
  _toggleDcEmptyState();
}

function dcStatus(type, msg) {
  const el = document.getElementById('dcStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

// ── CONSTRUIRE LES CONTRÔLES D'EVENTS ─────────────────────────────────────────
function dcBuildEventControls() {
  const wrap = document.getElementById('dcEventsWrap');
  if (!wrap) return;

  // Tri d'affichage : mains d'abord, sides en bas. On itère sur des indices
  // triés (sort stable) pour garder les handlers (dcToggleSide(i)…) pointant
  // sur le bon élément de DC.events sans muter l'ordre du tableau.
  const order = DC.events
    .map((_, i) => i)
    .sort((a, b) => Number(DC.events[a].isSide) - Number(DC.events[b].isSide));

  wrap.innerHTML = order.map(i => {
    const ev = DC.events[i];
    return `
    <div class="dc-event-card" id="dcEvCard${i}">
      <div class="dc-event-card-top">
        <label class="dc-toggle-side">
          <input type="checkbox" ${ev.isSide ? 'checked' : ''} onchange="dcToggleSide(${i}, this.checked)">
          <span class="dc-side-label">Side Event</span>
        </label>
        <span class="dc-event-name">${escDC(ev.name)}</span>
        <span class="dc-event-game">${escDC(ev.gameName)}</span>
        <button class="dc-event-del-btn" onclick="dcDeleteEvent(${i})"
          title="Retirer cet event de l'annonce">✕</button>
      </div>
      <div class="dc-event-fields">
        <div class="dc-field-row">
          <label>Pinger un rôle</label>
          ${renderDcRolePickerBtn(i, ev.roleId)}
        </div>
        <div class="dc-field-row dc-game-desc-row" style="${dcUsesGameEmbeds() ? '' : 'display:none'}">
          <label>Description (embed)</label>
          <textarea class="dc-desc-input" placeholder="Description du jeu pour l'embed Discord…"
            rows="3" oninput="dcSaveGameDescription('${escDC(ev.gameName)}', this.value); dcGenerate();">${escDC(dcGameDescription(ev.gameName))}</textarea>
        </div>
        <div class="dc-field-row dc-side-desc-row" style="${ev.isSide ? '' : 'display:none'}">
          <label>Description (side)</label>
          <textarea class="dc-desc-input" placeholder="Description optionnelle du side event…"
            rows="3" oninput="dcSetDesc(${i}, this.value)">${escDC(ev.description)}</textarea>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// ── NOUVEAU : picker de rôle custom "à la Discord" ─────────────────────────
// Bouton custom (au lieu de <select> natif illisible) qui ouvre une modale
// avec navigation 2 étapes : 1) choisir le serveur, 2) chercher/cliquer le
// rôle (avec barre de recherche).
function renderDcRolePickerBtn(eventIdx, selectedId) {
  const roles = window._dcRoles || [];
  const role = roles.find(r => r.id === selectedId);
  let label;
  if (role) {
    const color = role.color && role.color !== '#000000' ? role.color : '#9b7fb8';
    label = `<span class="dc-rp-dot" style="background:${escDC(color)}"></span>
             <span class="dc-rp-srv">${escDC(role.guildName || '')}</span>
             <span class="dc-rp-sep">·</span>
             <span class="dc-rp-role">${escDC(role.name)}</span>`;
  } else {
    label = `<span class="dc-rp-placeholder">— Aucun rôle (pas de ping) —</span>`;
  }
  return `<button type="button" class="dc-role-picker-btn"
            onclick="openDcRolePicker(${eventIdx})">
            ${label}
            <span class="dc-rp-arrow">▾</span>
          </button>`;
}

const _dcRolePickerState = { eventIdx: -1, serverFilter: null };

function openDcRolePicker(eventIdx) {
  _dcRolePickerState.eventIdx = eventIdx;
  _dcRolePickerState.serverFilter = null;
  let overlay = document.getElementById('dcRolePickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dcRolePickerOverlay';
    overlay.className = 'dc-role-picker-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDcRolePicker(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closeDcRolePicker();
    });
    document.body.appendChild(overlay);
  }
  // Si un seul serveur, on saute direct à la liste des rôles
  const roles = window._dcRoles || [];
  const guilds = [...new Set(roles.map(r => r.guildName || 'Serveur'))];
  if (guilds.length === 1) _dcRolePickerState.serverFilter = guilds[0];
  _renderDcRolePicker();
  overlay.style.display = 'flex';
}

function closeDcRolePicker() {
  const overlay = document.getElementById('dcRolePickerOverlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderDcRolePicker() {
  const overlay = document.getElementById('dcRolePickerOverlay');
  if (!overlay) return;
  const roles = window._dcRoles || [];
  if (!roles.length) {
    overlay.innerHTML = `
      <div class="dc-rp-modal">
        <div class="dc-rp-header">
          <span>Pinger un rôle</span>
          <button class="dc-rp-close" onclick="closeDcRolePicker()">✕</button>
        </div>
        <div class="dc-rp-empty">Aucun rôle chargé. Va dans la section Bot Discord et clique 🔄 pour charger les rôles.</div>
      </div>`;
    return;
  }
  const guilds = [...new Set(roles.map(r => r.guildName || 'Serveur'))].sort();
  const guildFilter = _dcRolePickerState.serverFilter;

  // ── ÉTAPE 1 : choix du serveur ──
  if (!guildFilter) {
    const icons = window._dcGuildIcons || {};
    const guildHTML = guilds.map(g => {
      const count = roles.filter(r => (r.guildName || 'Serveur') === g).length;
      const iconUrl = icons[g];
      const initials = g.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      // Avatar : si logo Discord dispo → image, sinon fallback initiales
      const avatarHTML = iconUrl
        ? `<img class="dc-rp-guild-icon" src="${escDC(iconUrl)}" alt="" onerror="this.outerHTML='<span class=\\'dc-rp-guild-init\\'>${escDC(initials)}</span>'">`
        : `<span class="dc-rp-guild-init">${escDC(initials)}</span>`;
      return `<button class="dc-rp-guild-btn" onclick="_dcRolePickerSelectGuild('${escDC(g.replace(/'/g, "\\'"))}')">
        ${avatarHTML}
        <span class="dc-rp-guild-name">${escDC(g)}</span>
        <span class="dc-rp-guild-count">${count} rôle${count > 1 ? 's' : ''}</span>
        <span class="dc-rp-chevron">›</span>
      </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="dc-rp-modal">
        <div class="dc-rp-header">
          <span>Choisir un serveur</span>
          <button class="dc-rp-close" onclick="closeDcRolePicker()">✕</button>
        </div>
        <div class="dc-rp-action-row">
          <button class="dc-rp-noselect" onclick="_dcRolePickerSelectRole('')">— Aucun rôle (pas de ping) —</button>
        </div>
        <div class="dc-rp-guild-list">${guildHTML}</div>
      </div>`;
    return;
  }

  // ── ÉTAPE 2 : liste des rôles du serveur (avec search) ──
  const filtered = roles.filter(r => (r.guildName || 'Serveur') === guildFilter);
  const showBack = guilds.length > 1;
  const rolesHTML = filtered.map(r => {
    const color = r.color && r.color !== '#000000' ? r.color : '#9b7fb8';
    return `<button class="dc-rp-role-btn" data-name="${escDC(r.name.toLowerCase())}"
              onclick="_dcRolePickerSelectRole('${escDC(r.id)}')">
      <span class="dc-rp-role-dot" style="background:${escDC(color)}"></span>
      <span class="dc-rp-role-name">${escDC(r.name)}</span>
    </button>`;
  }).join('');
  const headerIconUrl = (window._dcGuildIcons || {})[guildFilter];
  const headerIcon = headerIconUrl
    ? `<img class="dc-rp-header-icon" src="${escDC(headerIconUrl)}" alt="">`
    : '';
  overlay.innerHTML = `
    <div class="dc-rp-modal">
      <div class="dc-rp-header">
        ${showBack ? `<button class="dc-rp-back" onclick="_dcRolePickerSelectGuild(null)">←</button>` : ''}
        ${headerIcon}
        <span class="dc-rp-current-guild">${escDC(guildFilter)}</span>
        <button class="dc-rp-close" onclick="closeDcRolePicker()">✕</button>
      </div>
      <div class="dc-rp-search-wrap">
        <input type="text" class="dc-rp-search" placeholder="🔍 Rechercher un rôle…"
          oninput="_dcRolePickerSearch(this.value)" autofocus>
      </div>
      <div class="dc-rp-action-row">
        <button class="dc-rp-noselect" onclick="_dcRolePickerSelectRole('')">— Aucun rôle (pas de ping) —</button>
      </div>
      <div class="dc-rp-role-list" id="dcRolePickerList">${rolesHTML}</div>
    </div>`;
  // Focus search input
  setTimeout(() => {
    const inp = overlay.querySelector('.dc-rp-search');
    if (inp) inp.focus();
  }, 50);
}

function _dcRolePickerSelectGuild(guild) {
  _dcRolePickerState.serverFilter = guild;
  _renderDcRolePicker();
}

function _dcRolePickerSelectRole(roleId) {
  const i = _dcRolePickerState.eventIdx;
  if (i < 0 || !DC.events?.[i]) { closeDcRolePicker(); return; }
  dcSetRole(i, roleId);
  if (typeof dcBuildEventControls === 'function') dcBuildEventControls();
  closeDcRolePicker();
}

function _dcRolePickerSearch(query) {
  const list = document.getElementById('dcRolePickerList');
  if (!list) return;
  const q = (query || '').trim().toLowerCase();
  list.querySelectorAll('.dc-rp-role-btn').forEach(btn => {
    const name = btn.getAttribute('data-name') || '';
    btn.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

// Expose globalement
window.openDcRolePicker = openDcRolePicker;
window.closeDcRolePicker = closeDcRolePicker;
window._dcRolePickerSelectGuild = _dcRolePickerSelectGuild;
window._dcRolePickerSelectRole = _dcRolePickerSelectRole;
window._dcRolePickerSearch = _dcRolePickerSearch;

// (Ancienne fonction <select> conservée pour compat — peut être supprimée)
function dcRolesOptionsHTML(selectedId) {
  const roles = window._dcRoles || [];
  let html = `<option value="">— Aucun —</option>`;
  if (!roles.length) {
    html += `<option value="" disabled>(clique 🔄 ci-dessous pour charger)</option>`;
    return html;
  }
  // Grouper par guildName
  const byGuild = new Map(); // guildName → role[]
  roles.forEach(r => {
    const g = r.guildName || 'Serveur';
    if (!byGuild.has(g)) byGuild.set(g, []);
    byGuild.get(g).push(r);
  });
  // Si un seul serveur, pas besoin d'optgroup
  if (byGuild.size === 1) {
    html += roles.map(r =>
      `<option value="${escDC(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${escDC(r.name)}</option>`
    ).join('');
    return html;
  }
  // Sinon : un <optgroup> par serveur
  for (const [guildName, list] of byGuild) {
    html += `<optgroup label="${escDC(guildName)}">`;
    html += list.map(r =>
      `<option value="${escDC(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${escDC(r.name)}</option>`
    ).join('');
    html += `</optgroup>`;
  }
  return html;
}

// Charge les rôles du serveur via le bot. Cache en window._dcRoles.
// Mode "silent" : pas de status d'erreur si bot pas configuré (utile pour
// l'auto-load au démarrage de l'onglet quand le user n'a peut-être pas
// encore fait sa config).
async function dcLoadRoles(silent = false) {
  const botUrl = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
  if (!botUrl || !secret) {
    if (!silent) dcStatus('error', '⚠️ Configure l\'URL bot et le secret dans ⚙️ Configuration d\'abord');
    return;
  }
  try {
    const res  = await fetch(`${botUrl}/roles`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    window._dcRoles = data.roles || [];
    // Tentative de chargement des icônes de serveurs (en parallèle, silencieux)
    dcLoadGuildIcons(botUrl, secret);
    // Re-render des events pour peupler les dropdowns
    if (typeof dcRenderEvents === 'function') dcRenderEvents();
    // Auto-détection des rôles maintenant qu'on a la liste (presets ciblés)
    dcAutoAssignRoles(false);
    if (!silent) dcStatus('ok', `✅ ${window._dcRoles.length} rôle(s) chargé(s)`);
  } catch(e) {
    if (!silent) dcStatus('error', `❌ ${e.message}`);
  }
}

// Récupère les icônes des serveurs Discord via endpoint /guilds du bot.
// Cache dans window._dcGuildIcons (map guildName → iconUrl). Silencieux si
// l'endpoint n'existe pas (le picker fallback aux initiales).
async function dcLoadGuildIcons(botUrl, secret) {
  try {
    const res = await fetch(`${botUrl}/guilds`, { headers: { 'x-secret': secret } });
    if (!res.ok) return; // endpoint pas dispo
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.guilds)) return;
    const map = {};
    data.guilds.forEach(g => {
      // Cherche un champ iconUrl, icon (hash Discord), ou rien
      let url = g.iconUrl || g.icon_url || null;
      if (!url && g.icon && g.id) {
        // Construit l'URL CDN Discord depuis le hash
        const ext = g.icon.startsWith('a_') ? 'gif' : 'png';
        url = `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}?size=64`;
      }
      if (url && g.name) map[g.name] = url;
    });
    window._dcGuildIcons = map;
    // Re-render le picker si actuellement ouvert
    const overlay = document.getElementById('dcRolePickerOverlay');
    if (overlay && overlay.style.display === 'flex' && typeof _renderDcRolePicker === 'function') {
      _renderDcRolePicker();
    }
  } catch(e) { /* silent, fallback aux initiales */ }
}

function dcToggleSide(i, val) {
  const ev = DC.events[i];
  if (!ev) return;
  ev.isSide = val;
  // Persiste par jeu pour qu'un même jeu garde son statut side/main d'un
  // tournoi à l'autre.
  dcSaveGameIsSide(ev.gameName, val);
  dcBuildEventControls();
  dcGenerate();
}
function dcSetDesc(i, val)  { DC.events[i].description   = val;         dcGenerate(); }
function dcSetRole(i, val)  {
  const ev = DC.events[i];
  if (!ev) return;
  const roleId = (val || '').trim();
  ev.roleId = roleId;
  // Persiste par jeu (le même jeu pingera toujours le même rôle).
  dcSaveGameRole(ev.gameName, roleId);
  dcGenerate();
}
// Retire un event de l'annonce (uniquement de DC.events — n'affecte pas start.gg).
// Re-render des cartes (indices décalent) + régénération du message/embeds.
function dcDeleteEvent(i) {
  if (!DC.events?.[i]) return;
  DC.events.splice(i, 1);
  if (typeof dcBuildEventControls === 'function') dcBuildEventControls();
  dcGenerate();
}

// ── EMBEDS PAR JEU (presets Stras'Fighters) ──────────────────────────────────
// Pour chaque event, génère un embed Discord avec :
//   - title  = nom du jeu
//   - description = description hardcodée (avec override localStorage)
//   - image  = image du jeu start.gg
//   - color  = violet thème (ou couleur du rôle si dispo)
//
// Discord limite à 10 embeds par message → on tronque si nécessaire.
function dcBuildGameEmbeds() {
  const preset = dcGetPreset();
  if (!preset.usesEmbeds) return [];

  // Helper : construit un embed pour un event (ne pousse rien si pas de contenu).
  // featured=true → hero treatment : titre étoilé, accent doré, image pleine
  // largeur (via embed.image) au lieu de la mini thumbnail.
  const buildEventEmbed = (ev, { featured = false } = {}) => {
    const desc = dcGameDescription(ev.gameName);
    const img  = ev.gameImageUrl;
    if (!desc && !img && !ev.roleId) return null;
    let color = featured ? 0xf1c40f : 0x9b7fb8; // doré pour featured, violet sinon
    if (!featured && ev.roleId && window._dcRoles?.length) {
      const role = window._dcRoles.find(r => r.id === ev.roleId);
      if (role?.color && role.color !== '#000000') {
        color = parseInt(role.color.replace('#', ''), 16);
      }
    }
    const title = featured ? `⭐ ${ev.gameName}` : ev.gameName;
    const embed = { title, color };
    // Mention de rôle EN HAUT de la description (visible comme chip dans Discord).
    // Note : les mentions dans les embeds ne pinguent PAS — le ping est conservé
    // via la mention en bas du message texte (cf dcBuildHeaderForEmbeds).
    const lines = [];
    if (ev.roleId) lines.push(`<@&${ev.roleId}>`);
    if (desc)      lines.push(desc);
    if (lines.length) embed.description = lines.join('\n\n');
    if (img) {
      // Featured → image pleine largeur sous la description.
      // Standard → mini thumbnail sur la droite.
      if (featured) embed.image     = { url: img };
      else          embed.thumbnail = { url: img };
    }
    return embed;
  };

  const mains = DC.events.filter(e => !e.isSide);
  const sides = DC.events.filter(e =>  e.isSide);

  // Identifie un éventuel event "featured" parmi les mains (le headline du
  // tournoi). Le matching se fait sur le nom de jeu normalisé. On le retire
  // de la liste des mains pour le rendre en premier en hero.
  let featured = null;
  let mainsRest = mains;
  if (preset.featuredGameMatch && mains.length) {
    const re = new RegExp(preset.featuredGameMatch, 'i');
    const idx = mains.findIndex(ev => re.test(dcNormalize(ev.gameName)));
    if (idx >= 0) {
      featured = mains[idx];
      mainsRest = mains.filter((_, i) => i !== idx);
    }
  }

  const embeds = [];

  // Section MAIN EVENTS — featured d'abord (en hero), puis les autres.
  if (featured || mainsRest.length) {
    embeds.push({
      title: '⚔️ MAIN EVENTS',
      color: 0x9b7fb8,
    });
    if (featured) {
      const e = buildEventEmbed(featured, { featured: true });
      if (e) embeds.push(e);
      if (embeds.length >= 10) return embeds;
    }
    for (const ev of mainsRest) {
      const e = buildEventEmbed(ev);
      if (e) embeds.push(e);
      if (embeds.length >= 10) return embeds;
    }
  }

  // Section SIDE EVENTS
  if (sides.length) {
    embeds.push({
      title: '🎲 SIDE EVENTS',
      color: 0x4a4a55, // gris violacé sombre
    });
    for (const ev of sides) {
      const e = buildEventEmbed(ev);
      if (e) embeds.push(e);
      if (embeds.length >= 10) return embeds;
    }
  }

  return embeds;
}

// Génère le texte court (header) à afficher AU-DESSUS des embeds par-jeu.
// Inclut UNIQUEMENT titre + date + lieu + schedule. Closing/Inscriptions/URL
// sont déplacés dans le 2e message (cf dcBuildTrailingContent) pour apparaître
// après les embeds, juste avant les mentions qui pinguent.
function dcBuildHeaderForEmbeds() {
  const preset = dcGetPreset();
  const t      = DC.tournament;
  if (!t) return '';
  const emoji  = (document.getElementById('dcTourneyEmoji')?.value || '').trim();
  const venue  = (document.getElementById('dcVenue')?.value || t.venueName || '').trim();
  const schedLines = dcGetScheduleLines();

  const emojiPart = emoji ? `:${emoji}: ` : '';
  const emojiEnd  = emoji ? ` :${emoji}:` : '';
  let msg = preset.titleAsHeading
    ? `# ${emojiPart}${t.name}${emojiEnd}\n\n`
    : `${emojiPart}**${t.name}**${emojiEnd}\n\n`;

  const dateStr = preset.datePrefix || dcFormatDate(t.startAt);
  msg += `${dateStr}${venue ? ' à ' + venue : ''}\n`;
  if (schedLines.length) msg += `(${schedLines.join(', ')})`;
  return msg;
}

// Construit le 2e message (posté APRÈS les embeds) : closing + inscriptions
// + URL + mentions de rôle. Les mentions sont seules en bas pour pinger.
function dcBuildTrailingContent() {
  const preset = dcGetPreset();
  const t      = DC.tournament;
  if (!t) return '';
  // Lecture brute du champ : une chaîne vide est volontaire (preset Magna)
  // et ne doit PAS retomber sur DC.customClosing.
  const el = document.getElementById('dcClosing');
  const closing = (el ? el.value : DC.customClosing).trim();
  const url     = dcTournamentUrl(t.slug);

  const parts = [];
  if (closing) parts.push(`*${closing}*`);
  if (preset.showInscription) parts.push('👇 Inscriptions 👇');
  parts.push(url);

  const mentions = dcGetTrailingMentions();
  if (mentions) parts.push(mentions);

  return parts.join('\n\n');
}

function dcUsesGameEmbeds() {
  const preset = dcGetPreset();
  return !!preset.usesEmbeds;
}

// Liste des mentions de rôle uniques (pour le 2e message qui ping après les embeds)
function dcGetTrailingMentions() {
  if (!dcUsesGameEmbeds()) return '';
  const mentions = (DC.events || [])
    .filter(ev => ev.roleId)
    .map(ev => `<@&${ev.roleId}>`)
    .filter((m, i, a) => a.indexOf(m) === i);
  return mentions.join(' ');
}

// ── AUTO-DÉTECTION DES RÔLES (presets Stras'Fighters) ────────────────────────
// Pour chaque event, cherche un rôle du serveur Stras'Fighters dont le nom
// correspond au nom du jeu start.gg. Algo de matching :
//   1. Normaliser (lowercase + sans accents + sans ponctuation)
//   2. Exact match → score max
//   3. Sinon "contient" : score = longueur du chevauchement (le plus spécifique gagne)
function dcNormalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dcMatchRoleForGame(gameName, roles) {
  const game = dcNormalize(gameName);
  if (!game || !roles?.length) return null;
  let best = null, bestScore = 0;
  for (const r of roles) {
    const rn = dcNormalize(r.name);
    if (!rn) continue;
    let score = 0;
    if (rn === game)             score = 10000;
    else if (game.includes(rn))  score = rn.length;
    else if (rn.includes(game))  score = game.length;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  // Score minimum pour éviter les faux-positifs (un rôle 2 lettres qui matche "go" partout)
  return bestScore >= 3 ? best : null;
}

// Applique l'auto-détection. force=true → écrase même les rôles déjà définis
// (utile au changement de preset). force=false → ne remplit que les vides.
// Ne s'applique qu'aux presets qui déclarent `usesEmbeds` + `roleServerMatch`.
function dcAutoAssignRoles(force = false) {
  const preset = dcGetPreset();
  if (!preset.usesEmbeds || !preset.roleServerMatch) return;
  if (!DC.events?.length) return;
  if (!window._dcRoles?.length) return;

  // Cible le serveur dont le nom matche `roleServerMatch` (regex i)
  const serverRe = new RegExp(preset.roleServerMatch, 'i');
  const sfRoles = window._dcRoles.filter(r => serverRe.test(r.guildName || ''));
  if (!sfRoles.length) return;

  let changed = false;
  DC.events.forEach(ev => {
    if (ev.roleId && !force) return;
    const match = dcMatchRoleForGame(ev.gameName, sfRoles);
    const newId = match?.id || (force ? '' : ev.roleId);
    if (newId !== ev.roleId) { ev.roleId = newId; changed = true; }
  });

  if (changed) {
    if (typeof dcRenderEvents === 'function') dcRenderEvents();
    if (typeof dcGenerate    === 'function') dcGenerate();
  }
}

// ── GÉNÉRER LE MESSAGE ────────────────────────────────────────────────────────
function dcGenerate() {
  if (!DC.tournament) return;

  const preset    = dcGetPreset();
  const t         = DC.tournament;
  const emoji     = (document.getElementById('dcTourneyEmoji')?.value || '').trim();
  const venue     = (document.getElementById('dcVenue')?.value || t.venueName || '').trim();
  // Champ vide = volontaire (preset Magna n'a pas de phrase de clôture) — pas de fallback
  const _closingEl = document.getElementById('dcClosing');
  const closing   = (_closingEl ? _closingEl.value : DC.customClosing).trim();
  const schedLines = dcGetScheduleLines();
  const url       = dcTournamentUrl(t.slug);

  // Titre — heading "# " ou texte gras selon preset
  const emojiPart = emoji ? `:${emoji}: ` : '';
  const emojiEnd  = emoji ? ` :${emoji}:` : '';
  let msg = preset.titleAsHeading
    ? `# ${emojiPart}${t.name}${emojiEnd}\n\n`
    : `${emojiPart}**${t.name}**${emojiEnd}\n\n`;

  // Date + lieu (datePrefix override possible : "Demain soir" au lieu de "Ce <jour>")
  const dateStr = preset.datePrefix || dcFormatDate(t.startAt);
  msg += `${dateStr}${venue ? ' à ' + venue : ''}\n`;
  if (schedLines.length) msg += `(${schedLines.join(', ')})\n`;
  msg += '\n';

  // MAIN/EVENTS — label depuis preset
  const mainEvents = DC.events.filter(e => !e.isSide);
  if (mainEvents.length) {
    msg += `## **:crossed_swords: ${preset.mainLabel}** \n\n`;
    mainEvents.forEach((ev, idx) => {
      msg += `**${ev.gameName.toUpperCase()}**\n`;
      // Ligne de mention de rôle (si configurée)
      if (ev.roleId) {
        const prefix = preset.id === 'lorem_strasfighter'
          ? (idx === 0 ? 'Cette semaine retrouvez ' : 'Mais aussi ')
          : '';
        msg += `${prefix}<@&${ev.roleId}>\n`;
      }
      msg += '\n';
    });
  }

  // SIDE EVENT(S) — label depuis preset (singulier ou pluriel)
  const sideEvents = DC.events.filter(e => e.isSide);
  if (sideEvents.length) {
    msg += `\n## :game_die:  **${preset.sideLabel}** \n\n`;
    sideEvents.forEach(ev => {
      msg += ` **${ev.gameName.toUpperCase()}**\n`;
      if (ev.description.trim()) msg += `${ev.description.trim()}\n`;
      if (ev.roleId)              msg += `<@&${ev.roleId}>\n`;
      msg += '\n';
    });
  }

  // Closing
  if (closing) msg += `\n*${closing}*\n`;

  // Inscriptions (avant le lien) selon preset
  if (preset.showInscription) {
    msg += `\n👇 Inscriptions 👇\n`;
  }
  msg += `\n${url}`;

  // Pour les presets Stras'Fighters, on remplace le message texte par
  // un header court + des embeds par-jeu (générés au moment de poster).
  if (dcUsesGameEmbeds()) {
    msg = dcBuildHeaderForEmbeds();
    window._dcEmbeds = dcBuildGameEmbeds();
  } else {
    window._dcEmbeds = null;
  }

  // Afficher
  const preview = document.getElementById('dcPreview');
  if (preview) preview.textContent = msg;
  window._dcMessage = msg;

  // L'aperçu Discord est désormais le seul mode → on le re-render à chaque
  // changement, peu importe sa visibilité.
  dcRenderDiscordPreview();
}

// ── PRÉVISUALISATION STYLE DISCORD ───────────────────────────────────────────
function dcToggleView() {
  const pre = document.getElementById('dcPreview');
  const ddp = document.getElementById('dcDiscordPreview');
  const btn = document.getElementById('dcViewToggleBtn');
  if (!pre || !ddp) return;
  const showingDiscord = ddp.style.display !== 'none';
  if (showingDiscord) {
    ddp.style.display = 'none';
    pre.style.display = '';
    if (btn) btn.textContent = '👁️ Aperçu Discord';
  } else {
    pre.style.display = 'none';
    ddp.style.display = 'block';
    if (btn) btn.textContent = '📝 Markdown brut';
    dcRenderDiscordPreview();
  }
}

// Construit le rendu Discord-like : message texte + embeds (cards avec barre
// colorée à gauche, titre, description, thumbnail).
function dcRenderDiscordPreview() {
  const target = document.getElementById('dcDiscordPreview');
  if (!target) return;
  const msg = window._dcMessage || '';
  const embeds = window._dcEmbeds || [];

  let html = '';
  if (msg) {
    html += `<div class="dc-dp-message">${dcFormatTextForDiscord(msg)}</div>`;
  }
  if (embeds.length) {
    html += embeds.map(e => {
      const hex = '#' + (e.color || 0x9b7fb8).toString(16).padStart(6, '0');
      const thumb = e.thumbnail?.url ? `<img class="dc-dp-thumb" src="${escDC(e.thumbnail.url)}" alt="">` : '';
      // image = bannière pleine largeur (utilisée pour les events "featured")
      const banner = e.image?.url ? `<img class="dc-dp-image" src="${escDC(e.image.url)}" alt="">` : '';
      const featuredCls = e.image?.url ? ' dc-dp-embed-featured' : '';
      return `<div class="dc-dp-embed${featuredCls}" style="border-left-color:${hex};">
        <div class="dc-dp-embed-body">
          ${e.title       ? `<div class="dc-dp-embed-title">${escDC(e.title)}</div>` : ''}
          ${e.description ? `<div class="dc-dp-embed-desc">${dcFormatTextForDiscord(e.description)}</div>` : ''}
          ${banner}
          ${e.footer?.text ? `<div class="dc-dp-embed-footer">${escDC(e.footer.text)}</div>` : ''}
        </div>
        ${thumb}
      </div>`;
    }).join('');
  }

  // 2e "message" trailing : closing + inscriptions + URL + mentions
  const trailing = dcUsesGameEmbeds() ? dcBuildTrailingContent() : '';
  if (trailing) {
    html += `<div class="dc-dp-trailing">${dcFormatTextForDiscord(trailing)}</div>`;
  }

  if (!html) html = '<div class="dc-dp-empty">Aucun message à prévisualiser</div>';
  target.innerHTML = html;
}

// Échappe + transforme les codes Discord (mentions, gras, italique) en HTML lisible
function dcFormatTextForDiscord(text) {
  let s = escDC(text || '');
  // escDC échappe seulement < et > → après escape, "<@&123>" devient "&lt;@&123&gt;"
  // (le & reste bare). Mentions de rôle puis user :
  s = s.replace(/&lt;@&(\d+)&gt;/g, (_, id) => {
    const role = (window._dcRoles || []).find(r => r.id === id);
    const name = role?.name || 'role';
    return `<span class="dc-dp-mention">@${escDC(name)}</span>`;
  });
  s = s.replace(/&lt;@(\d+)&gt;/g, (_, id) => `<span class="dc-dp-mention">@user</span>`);
  // Custom emojis : `<:name:id>` (déjà résolu) → image directe via CDN.
  // L'ID nous donne l'URL même si l'emoji n'est pas dans notre cache local.
  s = s.replace(/&lt;(a?):([a-zA-Z0-9_]+):(\d+)&gt;/g, (_, anim, name, id) => {
    const ext = anim ? 'gif' : 'png';
    return `<img class="dc-dp-emoji" src="https://cdn.discordapp.com/emojis/${id}.${ext}" alt=":${escDC(name)}:" title=":${escDC(name)}:">`;
  });
  // `:name:` shortcut — résolu via le cache des Application Emojis chargé
  // depuis le bot. Si pas de match (ou cache vide), on laisse le texte brut.
  const appEmojis = window._dcAppEmojis || [];
  if (appEmojis.length) {
    s = s.replace(/:([a-zA-Z0-9_]+):/g, (full, name) => {
      const e = appEmojis.find(x => x.name === name);
      if (!e || !e.url) return full;
      return `<img class="dc-dp-emoji" src="${escDC(e.url)}" alt=":${escDC(name)}:" title=":${escDC(name)}:">`;
    });
  }
  // Markdown : titres "# " "## " (en début de ligne)
  s = s.replace(/^(#{1,3}) (.*)$/gm, (_, hashes, content) => {
    const sz = ['1.4em','1.2em','1em'][hashes.length - 1] || '1em';
    return `<div style="font-size:${sz};font-weight:700;color:#fff;margin:6px 0 2px;">${content}</div>`;
  });
  // **gras**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // *italique*
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Newlines → <br>
  s = s.replace(/\n/g, '<br>');
  return s;
}

// Scope la lecture des inputs à #dcScheduleWrap UNIQUEMENT.
// Le carousel tarot Discord (dcTcGo dans app.js) clone le HTML de la slide
// cible dans un overlay d'animation caché (#dcTcInContent). Sans scope,
// querySelectorAll('.dc-schedule-row input') retournerait les deux sets
// d'inputs (visible + clone), ce qui doublait l'état à chaque add/del.
function dcGetScheduleLines() {
  const wrap = document.getElementById('dcScheduleWrap');
  if (!wrap) return [];
  const rows = wrap.querySelectorAll('.dc-schedule-row input');
  return Array.from(rows).map(i => i.value.trim()).filter(Boolean);
}

// ── PERSISTANCE PAR PRESET ───────────────────────────────────────────────────
// Le schedule est sauvegardé par preset (Lorem vs Magna ont des défauts
// différents, donc les éditions de l'un ne doivent pas affecter l'autre).
// Clé : `dc_schedule_<presetId>`.
function dcScheduleStorageKey(presetId) {
  return `dc_schedule_${presetId || (DC.presetId || 'default')}`;
}
function dcLoadScheduleForPreset(presetId) {
  try {
    const raw = localStorage.getItem(dcScheduleStorageKey(presetId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}
function dcSaveScheduleForPreset(presetId, lines) {
  try {
    localStorage.setItem(dcScheduleStorageKey(presetId), JSON.stringify(lines || []));
  } catch {}
}

// ── HORAIRES ─────────────────────────────────────────────────────────────────
function dcBuildSchedule() {
  const wrap = document.getElementById('dcScheduleWrap');
  if (!wrap) return;
  wrap.innerHTML = DC.scheduleLines.map((line, i) => `
    <div class="dc-schedule-row">
      <input type="text" value="${escDC(line)}" placeholder="ex: Ouverture à 18h00"
        oninput="dcUpdateScheduleLine(${i}, this.value); dcGenerate()">
      <button class="dc-sched-del" onclick="dcDelSchedule(${i})">✕</button>
    </div>
  `).join('');
}

// Mise à jour d'une ligne pendant la frappe : sync DOM → DC.scheduleLines +
// persistance localStorage. Pas de re-render (préserve le focus).
function dcUpdateScheduleLine(i, val) {
  if (i < 0 || i >= DC.scheduleLines.length) return;
  DC.scheduleLines[i] = val;
  dcSaveScheduleForPreset(DC.presetId, DC.scheduleLines);
}

function dcDelSchedule(i) {
  const wrap = document.getElementById('dcScheduleWrap');
  if (!wrap) return;
  const rows = wrap.querySelectorAll('.dc-schedule-row input');
  DC.scheduleLines = Array.from(rows).map(r => r.value).filter((_, j) => j !== i);
  dcSaveScheduleForPreset(DC.presetId, DC.scheduleLines);
  dcBuildSchedule();
  dcGenerate();
}

function dcAddSchedule() {
  const wrap = document.getElementById('dcScheduleWrap');
  if (!wrap) return;
  const rows = wrap.querySelectorAll('.dc-schedule-row input');
  DC.scheduleLines = Array.from(rows).map(r => r.value);
  DC.scheduleLines.push('');
  dcSaveScheduleForPreset(DC.presetId, DC.scheduleLines);
  dcBuildSchedule();
  dcGenerate();
}

// ── POSTER VIA BOT ───────────────────────────────────────────────────────────
async function dcPost() {
  const msg      = window._dcMessage || '';
  const botUrl   = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
  const secret   = (document.getElementById('dcBotSecret')?.value || '').trim();
  const chanId   = (document.getElementById('dcChannelId')?.value || '').trim();

  if (!msg)    { dcPostStatus('error', '❌ Génère d\'abord le message'); return; }
  if (!botUrl) { dcPostStatus('error', '❌ Entre l\'URL du bot Railway'); return; }
  if (!secret) { dcPostStatus('error', '❌ Entre le secret');             return; }
  if (!chanId) { dcPostStatus('error', '❌ Entre l\'ID du salon Discord'); return; }

  if (msg.length > 2000) {
    dcPostStatus('error', `❌ Message trop long (${msg.length}/2000 caractères) — raccourcis les descriptions`);
    return;
  }

  const btn = document.getElementById('dcPostBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
  dcPostStatus('loading', '⏳ Envoi en cours…');

  try {
    const body = { channelId: chanId, message: msg };
    // Embeds par-jeu pour les presets Stras'Fighters
    if (window._dcEmbeds && window._dcEmbeds.length) {
      body.embeds = window._dcEmbeds;
    }
    const res = await fetch(`${botUrl}/post-announce`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret':     secret,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.ok) {
      // Si preset Stras'Fighters, envoyer un 2e message contenant closing +
      // inscriptions + URL + mentions (apparaît APRÈS les embeds → ping).
      const trailing = dcUsesGameEmbeds() ? dcBuildTrailingContent() : '';
      if (trailing) {
        try {
          await fetch(`${botUrl}/post-announce`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-secret': secret },
            body:    JSON.stringify({ channelId: chanId, message: trailing }),
          });
        } catch(e) { console.warn('trailing post:', e.message); }
      }
      dcPostStatus('ok', `✅ Posté dans #${data.channel} !`);
    } else {
      dcPostStatus('error', `❌ Erreur : ${data.error}`);
    }
  } catch (e) {
    dcPostStatus('error', `❌ Impossible de joindre le bot — vérifie l'URL (${e.message})`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Poster sur Discord'; }
  }
}

function dcPostStatus(type, msg) {
  const el = document.getElementById('dcPostStatus');
  if (!el) return;
  el.textContent   = msg;
  el.className     = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

// Charger les salons disponibles depuis le bot
async function dcLoadChannels(silent = false) {
  const botUrl = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
  if (!botUrl || !secret) {
    if (!silent) dcPostStatus('error', '⚠️ Configure l\'URL bot et le secret dans ⚙️ Configuration');
    return;
  }

  if (!silent) dcPostStatus('loading', '⏳ Chargement des salons…');
  try {
    const res  = await fetch(`${botUrl}/channels`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) {
      if (!silent) dcPostStatus('error', `❌ ${data.error}`);
      return;
    }
    // Stocke globalement pour le picker custom
    window._dcChannels = data.channels || [];
    // Tente aussi de charger les icônes des serveurs (si pas déjà chargées)
    if (!window._dcGuildIcons) dcLoadGuildIcons(botUrl, secret);
    // Re-render le bouton du picker (label = salon courant)
    const inp = document.getElementById('dcChannelId');
    const wrap = document.getElementById('dcChannelPickerWrap');
    if (wrap) wrap.innerHTML = renderDcChannelPickerBtn(inp?.value || '');
    if (!silent) dcPostStatus('ok', `✅ ${data.channels.length} salons chargés`);
  } catch(e) {
    if (!silent) dcPostStatus('error', `❌ ${e.message}`);
  }
}

// ── PICKER DE SALON custom (2 étapes : serveur → salon avec search) ──
// Paramétrable : peut cibler n'importe quel input/wrap (par défaut
// dcChannelId/dcChannelPickerWrap pour l'envoi Discord, mais on peut
// l'utiliser pour le channel de log Rêverie ou autres usages).
const _dcChannelPickerState = { serverFilter: null, targetInputId: 'dcChannelId', targetWrapId: 'dcChannelPickerWrap' };

function renderDcChannelPickerBtn(selectedId, targetInputId, targetWrapId) {
  const channels = window._dcChannels || [];
  const ch = channels.find(c => c.id === selectedId);
  let label;
  if (ch) {
    label = `<span class="dc-rp-srv">${escDC(ch.guildName || '')}</span>
             <span class="dc-rp-sep">·</span>
             <span class="dc-rp-role">#${escDC(ch.name)}</span>`;
  } else {
    label = `<span class="dc-rp-placeholder">— Choisir un salon —</span>`;
  }
  const args = targetInputId ? `'${escDC(targetInputId)}','${escDC(targetWrapId || '')}'` : '';
  return `<button type="button" class="dc-role-picker-btn" onclick="openDcChannelPicker(${args})">
            ${label}
            <span class="dc-rp-arrow">▾</span>
          </button>`;
}

function openDcChannelPicker(targetInputId, targetWrapId) {
  _dcChannelPickerState.serverFilter = null;
  _dcChannelPickerState.targetInputId = targetInputId || 'dcChannelId';
  _dcChannelPickerState.targetWrapId = targetWrapId || 'dcChannelPickerWrap';
  let overlay = document.getElementById('dcChannelPickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dcChannelPickerOverlay';
    overlay.className = 'dc-role-picker-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDcChannelPicker(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closeDcChannelPicker();
    });
    document.body.appendChild(overlay);
  }
  const channels = window._dcChannels || [];
  const guilds = [...new Set(channels.map(c => c.guildName || 'Serveur'))];
  if (guilds.length === 1) _dcChannelPickerState.serverFilter = guilds[0];
  _renderDcChannelPicker();
  overlay.style.display = 'flex';
}

function closeDcChannelPicker() {
  const overlay = document.getElementById('dcChannelPickerOverlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderDcChannelPicker() {
  const overlay = document.getElementById('dcChannelPickerOverlay');
  if (!overlay) return;
  const channels = window._dcChannels || [];
  if (!channels.length) {
    overlay.innerHTML = `
      <div class="dc-rp-modal">
        <div class="dc-rp-header">
          <span>Choisir un salon</span>
          <button class="dc-rp-close" onclick="closeDcChannelPicker()">✕</button>
        </div>
        <div class="dc-rp-empty">Aucun salon chargé. Clique 🔄 sous le sélecteur pour charger.</div>
      </div>`;
    return;
  }
  const guilds = [...new Set(channels.map(c => c.guildName || 'Serveur'))].sort();
  const guildFilter = _dcChannelPickerState.serverFilter;
  const icons = window._dcGuildIcons || {};

  // ── ÉTAPE 1 : choix du serveur ──
  if (!guildFilter) {
    const guildHTML = guilds.map(g => {
      const count = channels.filter(c => (c.guildName || 'Serveur') === g).length;
      const iconUrl = icons[g];
      const initials = g.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarHTML = iconUrl
        ? `<img class="dc-rp-guild-icon" src="${escDC(iconUrl)}" alt="" onerror="this.outerHTML='<span class=\\'dc-rp-guild-init\\'>${escDC(initials)}</span>'">`
        : `<span class="dc-rp-guild-init">${escDC(initials)}</span>`;
      return `<button class="dc-rp-guild-btn" onclick="_dcChannelPickerSelectGuild('${escDC(g.replace(/'/g, "\\'"))}')">
        ${avatarHTML}
        <span class="dc-rp-guild-name">${escDC(g)}</span>
        <span class="dc-rp-guild-count">${count} salon${count > 1 ? 's' : ''}</span>
        <span class="dc-rp-chevron">›</span>
      </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="dc-rp-modal">
        <div class="dc-rp-header">
          <span>Choisir un serveur</span>
          <button class="dc-rp-close" onclick="closeDcChannelPicker()">✕</button>
        </div>
        <div class="dc-rp-guild-list">${guildHTML}</div>
      </div>`;
    return;
  }

  // ── ÉTAPE 2 : liste des salons du serveur, groupés par catégorie ──
  const filtered = channels.filter(c => (c.guildName || 'Serveur') === guildFilter);
  const byCat = {};
  filtered.forEach(c => {
    const cat = c.category || '—';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(c);
  });
  const catNames = Object.keys(byCat).sort((a, b) => {
    if (a === '—') return 1; if (b === '—') return -1;
    return a.localeCompare(b);
  });
  const channelsHTML = catNames.map(cat => {
    const itemsHTML = byCat[cat].map(c => `
      <button class="dc-rp-role-btn dc-cp-channel-btn" data-name="${escDC(c.name.toLowerCase())}"
        onclick="_dcChannelPickerSelectChannel('${escDC(c.id)}')">
        <span class="dc-cp-channel-hash">#</span>
        <span class="dc-rp-role-name">${escDC(c.name)}</span>
      </button>
    `).join('');
    return `<div class="dc-cp-category">
      ${cat !== '—' ? `<div class="dc-cp-category-name">${escDC(cat)}</div>` : ''}
      ${itemsHTML}
    </div>`;
  }).join('');
  const showBack = guilds.length > 1;
  const headerIconUrl = (window._dcGuildIcons || {})[guildFilter];
  const headerIcon = headerIconUrl
    ? `<img class="dc-rp-header-icon" src="${escDC(headerIconUrl)}" alt="">`
    : '';
  overlay.innerHTML = `
    <div class="dc-rp-modal">
      <div class="dc-rp-header">
        ${showBack ? `<button class="dc-rp-back" onclick="_dcChannelPickerSelectGuild(null)">←</button>` : ''}
        ${headerIcon}
        <span class="dc-rp-current-guild">${escDC(guildFilter)}</span>
        <button class="dc-rp-close" onclick="closeDcChannelPicker()">✕</button>
      </div>
      <div class="dc-rp-search-wrap">
        <input type="text" class="dc-rp-search" placeholder="🔍 Rechercher un salon…"
          oninput="_dcChannelPickerSearch(this.value)" autofocus>
      </div>
      <div class="dc-rp-role-list" id="dcChannelPickerList">${channelsHTML}</div>
    </div>`;
  setTimeout(() => {
    const inp = overlay.querySelector('.dc-rp-search');
    if (inp) inp.focus();
  }, 50);
}

function _dcChannelPickerSelectGuild(guild) {
  _dcChannelPickerState.serverFilter = guild;
  _renderDcChannelPicker();
}

function _dcChannelPickerSelectChannel(channelId) {
  const targetInputId = _dcChannelPickerState.targetInputId;
  const targetWrapId  = _dcChannelPickerState.targetWrapId;
  const inp = document.getElementById(targetInputId);
  if (inp) {
    inp.value = channelId;
    // Trigger onchange/input handler si défini (ex: cfgSaveAll)
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Update aussi l'ancien select pour compat (uniquement pour l'envoi Discord)
  if (targetInputId === 'dcChannelId') {
    const sel = document.getElementById('dcChannelSelect');
    if (sel) sel.value = channelId;
  }
  // Update label du bouton
  const wrap = document.getElementById(targetWrapId);
  if (wrap) wrap.innerHTML = renderDcChannelPickerBtn(channelId, targetInputId, targetWrapId);
  closeDcChannelPicker();
}

function _dcChannelPickerSearch(query) {
  const list = document.getElementById('dcChannelPickerList');
  if (!list) return;
  const q = (query || '').trim().toLowerCase();
  list.querySelectorAll('.dc-cp-channel-btn').forEach(btn => {
    const name = btn.getAttribute('data-name') || '';
    btn.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
  // Cache les catégories vides
  list.querySelectorAll('.dc-cp-category').forEach(cat => {
    const visible = Array.from(cat.querySelectorAll('.dc-cp-channel-btn')).some(b => b.style.display !== 'none');
    cat.style.display = visible ? '' : 'none';
  });
}

window.openDcChannelPicker = openDcChannelPicker;
window.closeDcChannelPicker = closeDcChannelPicker;
window._dcChannelPickerSelectGuild = _dcChannelPickerSelectGuild;
window._dcChannelPickerSelectChannel = _dcChannelPickerSelectChannel;
window._dcChannelPickerSearch = _dcChannelPickerSearch;
window.renderDcChannelPickerBtn = renderDcChannelPickerBtn;

// ── PROGRAMMER L'ENVOI ───────────────────────────────────────────────────────
async function dcSchedule() {
  const msg      = window._dcMessage || '';
  const botUrl   = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
  const secret   = (document.getElementById('dcBotSecret')?.value || '').trim();
  const chanId   = (document.getElementById('dcChannelId')?.value || '').trim();
  const dtInput  = document.getElementById('dcScheduleAt');

  if (!msg)    { dcPostStatus('error', '❌ Génère d\'abord le message'); return; }
  if (!botUrl) { dcPostStatus('error', '❌ Entre l\'URL du bot Railway'); return; }
  if (!secret) { dcPostStatus('error', '❌ Entre le secret');             return; }
  if (!chanId) { dcPostStatus('error', '❌ Sélectionne un salon Discord'); return; }
  if (!dtInput?.value) { dcPostStatus('error', '❌ Choisis une date/heure d\'envoi'); return; }

  const scheduledAt = new Date(dtInput.value).getTime();
  if (isNaN(scheduledAt) || scheduledAt <= Date.now()) {
    dcPostStatus('error', '❌ La date doit être dans le futur'); return;
  }

  if (msg.length > 2000) {
    dcPostStatus('error', `❌ Message trop long (${msg.length}/2000 caractères)`); return;
  }

  const btn = document.getElementById('dcScheduleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Programmation…'; }
  dcPostStatus('loading', '⏳ Programmation en cours…');

  try {
    // Construit le même payload que dcPost : message + embeds + trailing.
    // Sans embeds/trailing, le post planifié serait amputé (header sans
    // les cartes de jeu et sans les mentions qui pinguent).
    const body = { channelId: chanId, message: msg, scheduledAt };
    if (window._dcEmbeds && window._dcEmbeds.length) {
      body.embeds = window._dcEmbeds;
    }
    if (dcUsesGameEmbeds()) {
      const trailing = dcBuildTrailingContent();
      if (trailing) body.trailing = trailing;
    }
    const res = await fetch(`${botUrl}/schedule-announce`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret':     secret,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.ok) {
      const dt = new Date(scheduledAt);
      const fmt = dt.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      dcPostStatus('ok', `✅ Envoi programmé le ${fmt} (ID #${data.id})`);
      dcLoadScheduled();
      // ── Envoi du log Rêverie dans le salon configuré (si défini) ──
      // Notification "événement enregistré" avec date prévue + preview
      // des 200 premiers chars du message. Silencieux si pas configuré.
      // Lit l'input ET localStorage (au cas où la page Config pas encore
      // ouverte dans la session → cfgInit pas exécuté).
      const logChanId = (
        (document.getElementById('dcLogChannelId')?.value || '').trim() ||
        (localStorage.getItem('dc_log_channel_id') || '').trim()
      );
      if (logChanId) {
        const targetCh = (window._dcChannels || []).find(c => c.id === chanId);
        const targetLabel = targetCh ? `#${targetCh.name}` : `<#${chanId}>`;
        const preview = (msg || '').slice(0, 200).replace(/\n/g, ' ') + ((msg || '').length > 200 ? '…' : '');
        const logMsg = `📅 **Envoi programmé** par Rêverie\n` +
                       `🎯 Salon cible : ${targetLabel}\n` +
                       `🕐 Date prévue : **${fmt}**\n` +
                       `🆔 ID de planification : \`#${data.id}\`\n` +
                       (preview ? `\n> ${preview}` : '');
        try {
          await fetch(`${botUrl}/post-announce`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-secret': secret },
            body:    JSON.stringify({ channelId: logChanId, message: logMsg }),
          });
        } catch (e) {
          // Silencieux : si le log fail, on n'embête pas le user, l'envoi
          // principal est OK et c'est ce qui compte.
          console.warn('[dc] log channel post failed:', e);
        }
      }
    } else {
      dcPostStatus('error', `❌ Erreur : ${data.error}`);
    }
  } catch (e) {
    dcPostStatus('error', `❌ Impossible de joindre le bot — vérifie l'URL (${e.message})`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🕐 Programmer l\'envoi'; }
  }
}

// Charger la liste des envois planifiés
async function dcLoadScheduled() {
  const botUrl = (document.getElementById('dcBotUrl')?.value || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
  if (!botUrl || !secret) return;

  try {
    const res  = await fetch(`${botUrl}/scheduled`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) return;

    const wrap = document.getElementById('dcScheduledList');
    if (!wrap) return;

    if (!data.scheduled.length) {
      wrap.innerHTML = '<p class="dc-scheduled-empty">Aucun envoi programmé</p>';
      return;
    }

    wrap.innerHTML = data.scheduled.map(s => {
      const dt  = new Date(s.scheduledAt);
      const fmt = dt.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="dc-scheduled-item">
          <span class="dc-scheduled-time">🕐 ${fmt}</span>
          <span class="dc-scheduled-preview">${s.messagePreview}</span>
          <button class="dc-scheduled-cancel" onclick="dcCancelScheduled(${s.id})">✕ Annuler</button>
        </div>`;
    }).join('');
  } catch(e) { /* silently ignore */ }
}

// Annuler un envoi planifié
async function dcCancelScheduled(id) {
  const botUrl = (document.getElementById('dcBotUrl')?.value || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
  if (!botUrl || !secret) return;

  try {
    const res  = await fetch(`${botUrl}/scheduled/${id}`, { method: 'DELETE', headers: { 'x-secret': secret } });
    const data = await res.json();
    if (data.ok) dcLoadScheduled();
  } catch(e) { /* ignore */ }
}

// ── COPIER ────────────────────────────────────────────────────────────────────
function dcCopy() {
  const msg = window._dcMessage || '';
  if (!msg) return;
  navigator.clipboard.writeText(msg).then(() => {
    const btn = document.getElementById('dcCopyBtn');
    if (btn) {
      btn.textContent = '✅ Copié !';
      btn.classList.add('dc-copy-done');
      setTimeout(() => { btn.textContent = '📋 Copier le message'; btn.classList.remove('dc-copy-done'); }, 2500);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = msg; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });
}

// ── SAUVEGARDE BOT SETTINGS ───────────────────────────────────────────────────
function dcSaveBotSettings() {
  const url    = document.getElementById('dcBotUrl')?.value.trim();
  const secret = document.getElementById('dcBotSecret')?.value.trim();
  if (url)    localStorage.setItem('dc_bot_url',    url);
  if (secret) localStorage.setItem('dc_bot_secret', secret);
}

function dcLoadBotSettings() {
  const url    = localStorage.getItem('dc_bot_url');
  const secret = localStorage.getItem('dc_bot_secret');
  const urlEl    = document.getElementById('dcBotUrl');
  const secretEl = document.getElementById('dcBotSecret');
  if (url    && urlEl)    urlEl.value    = url;
  if (secret && secretEl) secretEl.value = secret;
}

// ── PRESETS : application + persistance ───────────────────────────────────────
// Applique un preset : remplit les champs UI (lieu, schedule, closing) avec
// les valeurs par défaut du preset, sauvegarde en localStorage, regénère.
function dcApplyPreset(presetId) {
  const preset = dcGetPreset(presetId);
  DC.presetId = preset.id;
  try { localStorage.setItem('dc_preset', preset.id); } catch {}

  // Remplir le lieu si l'utilisateur n'a pas mis quelque chose de personnalisé
  const venueEl = document.getElementById('dcVenue');
  if (venueEl) venueEl.value = preset.venue || '';

  // Schedule lines : restaurer la version sauvegardée pour ce preset si elle
  // existe, sinon retomber sur le défaut du preset. Comme ça les éditions
  // utilisateur survivent aux reloads ET aux changements de preset (chaque
  // preset garde son propre schedule édité).
  const savedSched = dcLoadScheduleForPreset(preset.id);
  DC.scheduleLines = savedSched || [...preset.schedule];
  if (typeof dcBuildSchedule === 'function') dcBuildSchedule();

  // Closing
  const closingEl = document.getElementById('dcClosing');
  if (closingEl) closingEl.value = preset.closing || '';

  // Emoji tournoi (application emoji du bot, cross-server)
  const emojiEl = document.getElementById('dcTourneyEmoji');
  if (emojiEl) emojiEl.value = preset.tournamentEmoji || '';

  // Mettre à jour le sélecteur visuel
  const sel = document.getElementById('dcPresetSelect');
  if (sel && sel.value !== preset.id) sel.value = preset.id;

  // Re-déclencher l'auto-détection des rôles avec écrasement (le preset change
  // potentiellement la cible de matching → on force).
  dcAutoAssignRoles(true);

  if (typeof dcGenerate === 'function') dcGenerate();
}

function dcLoadPreset() {
  let saved = '';
  try { saved = localStorage.getItem('dc_preset') || ''; } catch {}
  if (saved && DC_PRESETS.find(p => p.id === saved)) {
    DC.presetId = saved;
  }
  // Synchroniser le dropdown sans réécraser les champs (l'utilisateur peut
  // avoir déjà rempli des trucs personnalisés depuis la dernière session)
  const sel = document.getElementById('dcPresetSelect');
  if (sel) sel.value = DC.presetId;
  // Emoji tournoi : restaurer la valeur sauvegardée par l'utilisateur, sinon
  // tomber sur le défaut du preset.
  const preset = dcGetPreset();
  const emojiEl = document.getElementById('dcTourneyEmoji');
  if (emojiEl) {
    let savedEmoji = '';
    try { savedEmoji = localStorage.getItem('dc_tourney_emoji') || ''; } catch {}
    if (savedEmoji) emojiEl.value = savedEmoji;
    else if (!emojiEl.value && preset.tournamentEmoji) emojiEl.value = preset.tournamentEmoji;
  }
  // Restaurer le schedule sauvegardé pour le preset actif s'il existe,
  // sinon garder le défaut codé dans le preset.
  const savedSched = dcLoadScheduleForPreset(DC.presetId);
  if (savedSched) DC.scheduleLines = savedSched;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function dcInit() {
  dcLoadBotSettings();
  // Load AVANT build — sinon dcBuildSchedule rend les valeurs default
  // alors que dcLoadPreset() vient juste de restaurer DC.scheduleLines
  // depuis localStorage (les éditions de l'utilisateur sont perdues à
  // l'affichage même si elles persistaient bien en stockage).
  dcLoadPreset();
  dcBuildSchedule();

  // Charger automatiquement les rôles du serveur (silent : pas d'erreur si
  // bot pas encore configuré — l'utilisateur peut cliquer 🔄 plus tard).
  if (!window._dcRoles || !window._dcRoles.length) {
    dcLoadRoles(true);
  }
  // Idem pour les salons
  const dcSel = document.getElementById('dcChannelSelect');
  if (dcSel && dcSel.options.length <= 1) {
    dcLoadChannels(true);
  }
  // Charger les Application Emojis pour pouvoir les rendre dans la preview
  if (!window._dcAppEmojis || !window._dcAppEmojis.length) {
    dcLoadAppEmojis(true);
  }

  // Pré-remplir la date/heure à "maintenant + 1h" (arrondi à la minute)
  const dtInput = document.getElementById('dcScheduleAt');
  if (dtInput && !dtInput.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    // Format: "YYYY-MM-DDTHH:MM" (requis par datetime-local)
    const pad = n => String(n).padStart(2, '0');
    dtInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Charger les envois déjà planifiés (si bot configuré)
  dcLoadScheduled();
}

// ── PICKER EMOJIS APPLICATION (cross-server) ─────────────────────────────────
window._dcAppEmojis = [];

function dcOpenAppEmojis() {
  const modal = document.getElementById('appEmojisModal');
  if (!modal) return;
  modal.style.display = 'flex';
  // Charger automatiquement la 1ère fois
  if (!window._dcAppEmojis.length) dcLoadAppEmojis();
}
function dcCloseAppEmojis() {
  const modal = document.getElementById('appEmojisModal');
  if (modal) modal.style.display = 'none';
}

async function dcLoadAppEmojis(silent = false) {
  const status = document.getElementById('appEmojisStatus');
  const grid   = document.getElementById('appEmojisGrid');
  const botUrl = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
  const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
  if (!botUrl || !secret) {
    if (!silent && status) status.textContent = '⚠️ URL bot ou secret manquant — configure-les dans cet onglet d\'abord.';
    return;
  }
  if (!silent && status) status.textContent = '⏳ Chargement…';
  try {
    const res = await fetch(`${botUrl}/app-emojis`, { headers: { 'x-secret': secret } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    window._dcAppEmojis = data.emojis || [];
    if (grid) dcRenderAppEmojis(window._dcAppEmojis);
    if (!silent && status) {
      status.textContent = window._dcAppEmojis.length
        ? `${window._dcAppEmojis.length} emoji(s) — clique pour copier le code.`
        : 'Aucun emoji trouvé. Ajoute-en via Discord Developer Portal → ton app → Emojis.';
    }
    // Re-render la preview pour que les `:name:` deviennent des images
    if (typeof dcRenderDiscordPreview === 'function') dcRenderDiscordPreview();
  } catch(e) {
    if (!silent && status) status.textContent = `❌ Erreur : ${e.message}`;
  }
}

function dcRenderAppEmojis(list) {
  const grid = document.getElementById('appEmojisGrid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = list.map(e => `
    <button class="dc-emoji-tile" onclick="dcCopyAppEmoji('${escSGG(e.markdown)}', '${escSGG(e.name)}')"
      title="${escSGG(e.name)}\n${escSGG(e.markdown)}"
      style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;background:#fff;border:1px solid #e8d5f8;border-radius:8px;cursor:pointer;font-size:10px;color:#666;">
      <img src="${escSGG(e.url)}" alt="${escSGG(e.name)}" style="width:32px;height:32px;object-fit:contain;">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${escSGG(e.name)}</span>
    </button>
  `).join('');
}

function dcFilterAppEmojis(query) {
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? window._dcAppEmojis.filter(e => e.name.toLowerCase().includes(q))
    : window._dcAppEmojis;
  dcRenderAppEmojis(filtered);
}

async function dcCopyAppEmoji(markdown, name) {
  try {
    await navigator.clipboard.writeText(markdown);
    const status = document.getElementById('appEmojisStatus');
    if (status) {
      const prev = status.textContent;
      status.textContent = `✅ Code de "${name}" copié dans le presse-papier (${markdown})`;
      setTimeout(() => { status.textContent = prev; }, 2000);
    }
  } catch(e) {
    alert('Copie impossible : ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────
// EMOJI PICKER pour "Emoji du tournoi"
// ─────────────────────────────────────────────────────────
function openDcEmojiPicker() {
  let overlay = document.getElementById('dcEmojiPickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dcEmojiPickerOverlay';
    overlay.className = 'dc-role-picker-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDcEmojiPicker(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closeDcEmojiPicker();
    });
    document.body.appendChild(overlay);
  }
  _renderDcEmojiPicker('');
  overlay.style.display = 'flex';
  if (!window._dcAppEmojis || !window._dcAppEmojis.length) {
    dcLoadAppEmojis(true).then(() => _renderDcEmojiPicker(''));
  }
  setTimeout(() => {
    const s = document.getElementById('dcEmojiPickerSearch');
    if (s) s.focus();
  }, 50);
}

function closeDcEmojiPicker() {
  const overlay = document.getElementById('dcEmojiPickerOverlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderDcEmojiPicker(query) {
  const overlay = document.getElementById('dcEmojiPickerOverlay');
  if (!overlay) return;
  const all = window._dcAppEmojis || [];
  const q = (query || '').trim().toLowerCase();
  const filtered = q ? all.filter(e => e.name.toLowerCase().includes(q)) : all;

  const importTileHTML = `
    <button class="dc-ep-tile dc-ep-tile-import" onclick="_dcEmojiPickerImportClick()" title="Importer un nouvel emoji au bot">
      <span class="dc-ep-import-plus">+</span>
      <span>Importer</span>
    </button>`;

  const gridHTML = !all.length
    ? `<div class="dc-ep-grid">${importTileHTML}</div>
       <div class="dc-rp-empty">Aucun emoji chargé.<br>Va dans la section Bot Discord pour configurer URL + secret, puis ré-essaie.</div>`
    : !filtered.length
      ? `<div class="dc-ep-grid">${importTileHTML}</div>
         <div class="dc-rp-empty">Aucun emoji ne correspond à « ${escDC(query)} ».</div>`
      : `<div class="dc-ep-grid">${filtered.map(e => `
          <button class="dc-ep-tile" onclick="_dcEmojiPickerSelect('${escDC(e.name.replace(/'/g,"\\'"))}')" title="${escDC(e.name)}">
            <img src="${escDC(e.url)}" alt="${escDC(e.name)}">
            <span>${escDC(e.name)}</span>
          </button>`).join('')}${importTileHTML}</div>`;

  overlay.innerHTML = `
    <div class="dc-rp-modal">
      <div class="dc-rp-header">
        <span>Emoji du tournoi</span>
        <button class="dc-rp-close" onclick="closeDcEmojiPicker()">✕</button>
      </div>
      <div class="dc-rp-action-row">
        <button class="dc-rp-noselect" onclick="_dcEmojiPickerSelect('')">— Aucun emoji —</button>
      </div>
      <input type="file" id="dcEmojiPickerFile" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" onchange="_dcEmojiPickerFileChosen(this.files[0])">
      <div id="dcEmojiPickerImportStatus" class="dc-ep-import-status" style="display:none;"></div>
      <div class="dc-rp-search-wrap">
        <input id="dcEmojiPickerSearch" class="dc-rp-search" type="text" placeholder="Rechercher un emoji…"
          value="${escDC(query)}" oninput="_dcEmojiPickerSearch(this.value)">
      </div>
      <div class="dc-ep-scroll">${gridHTML}</div>
    </div>`;
}

function _dcEmojiPickerImportClick() {
  const f = document.getElementById('dcEmojiPickerFile');
  if (f) f.click();
}

async function _dcEmojiPickerFileChosen(file) {
  if (!file) return;
  const status = document.getElementById('dcEmojiPickerImportStatus');
  const setStatus = (msg, isError = false) => {
    if (!status) return;
    status.style.display = 'block';
    status.textContent = msg;
    status.style.color = isError ? '#c62828' : '#5d3fa3';
  };
  if (file.size > 256 * 1024) {
    setStatus(`❌ Fichier trop gros (${Math.round(file.size/1024)} KiB). Max 256 KiB.`, true);
    return;
  }
  const defaultName = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  const name = prompt('Nom de l\'emoji (2-32 chars, a-z 0-9 _) :', defaultName);
  if (!name) return;
  setStatus('⏳ Conversion + upload…');
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lecture impossible'));
      r.readAsDataURL(file);
    });
    const botUrl = (document.getElementById('dcBotUrl')?.value   || '').trim().replace(/\/$/, '');
    const secret = (document.getElementById('dcBotSecret')?.value || '').trim();
    if (!botUrl || !secret) { setStatus('❌ URL bot / secret manquant.', true); return; }
    const res = await fetch(`${botUrl}/app-emojis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: JSON.stringify({ name, imageBase64: dataUrl }),
    });
    // Tenter de parser en JSON ; si ça rate, c'est probablement une 404/500 HTML
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); }
    catch {
      if (res.status === 404) throw new Error('Route POST /app-emojis introuvable — redémarre le bot pour activer la nouvelle route.');
      throw new Error(`Réponse non-JSON du bot (HTTP ${res.status}). Vérifie que le bot est à jour et redémarré.`);
    }
    if (!data.ok) throw new Error(data.error || `Upload échoué (HTTP ${res.status})`);
    setStatus(`✅ "${data.emoji.name}" importé.`);
    // Rafraîchir la liste et re-render le picker
    await dcLoadAppEmojis(true);
    _renderDcEmojiPicker('');
  } catch(e) {
    setStatus(`❌ ${e.message}`, true);
  }
}

function _dcEmojiPickerSearch(query) {
  _renderDcEmojiPicker(query);
  setTimeout(() => {
    const s = document.getElementById('dcEmojiPickerSearch');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }, 0);
}

function _dcEmojiPickerSelect(name) {
  const input = document.getElementById('dcTourneyEmoji');
  if (input) {
    input.value = name ? `:${name}:` : '';
    try { localStorage.setItem('dc_tourney_emoji', input.value); } catch {}
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  closeDcEmojiPicker();
}
