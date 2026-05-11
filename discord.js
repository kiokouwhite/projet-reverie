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
  'bomberman':               "Bomberman compétitif. Pose de bombes, explosions, dernier debout gagne.",
  'pikmin':                  "Pikmin de Nintendo. Stratégie en temps réel, mignon et brutal.",
};

function dcGameDescription(gameName) {
  if (!gameName) return '';
  const norm = dcNormalize(gameName);
  // Override utilisateur en priorité
  try {
    const overrides = JSON.parse(localStorage.getItem('dc_game_desc_overrides') || '{}');
    if (overrides[norm]) return overrides[norm];
  } catch {}
  // Match hardcodé : exact d'abord, sinon contains
  if (DC_GAME_DESCRIPTIONS[norm]) return DC_GAME_DESCRIPTIONS[norm];
  for (const [key, desc] of Object.entries(DC_GAME_DESCRIPTIONS)) {
    if (norm.includes(key) || key.includes(norm)) return desc;
  }
  return '';
}

function dcSaveGameDescription(gameName, text) {
  if (!gameName) return;
  const norm = dcNormalize(gameName);
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem('dc_game_desc_overrides') || '{}'); } catch {}
  if (text && text.trim()) overrides[norm] = text.trim();
  else delete overrides[norm];
  try { localStorage.setItem('dc_game_desc_overrides', JSON.stringify(overrides)); } catch {}
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
      return {
        id:            ev.id,
        name:          ev.name,
        gameName,
        numEntrants:   ev.numEntrants || 0,
        isSide:        dcIsSide(ev.name),
        description:   '',
        roleId:        '', // ID du rôle Discord à pinguer pour cet event (vide = aucun)
        gameImageUrl:  gameImg, // utilisé dans les embeds par-jeu (presets Stras'Fighters)
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
    dcGenerate();

  } catch(e) {
    dcStatus('error','❌ Erreur API : ' + (e.message || e));
  } finally {
    document.getElementById('dcFetchBtn').disabled = false;
  }
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
          <select class="dc-text-input" onchange="dcSetRole(${i}, this.value)">
            ${dcRolesOptionsHTML(ev.roleId)}
          </select>
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

// Génère les <option> pour le picker de rôle d'un event, groupés par serveur
// via <optgroup> quand le bot est sur plusieurs serveurs.
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
    // Re-render des events pour peupler les dropdowns
    if (typeof dcRenderEvents === 'function') dcRenderEvents();
    // Auto-détection des rôles maintenant qu'on a la liste (presets ciblés)
    dcAutoAssignRoles(false);
    if (!silent) dcStatus('ok', `✅ ${window._dcRoles.length} rôle(s) chargé(s)`);
  } catch(e) {
    if (!silent) dcStatus('error', `❌ ${e.message}`);
  }
}

function dcToggleSide(i, val) {
  DC.events[i].isSide = val;
  // Re-render pour que la carte glisse en bas (side) ou remonte (main)
  // selon le tri stable mains-d'abord/sides-ensuite.
  dcBuildEventControls();
  dcGenerate();
}
function dcSetDesc(i, val)  { DC.events[i].description   = val;         dcGenerate(); }
function dcSetRole(i, val)  { DC.events[i].roleId        = val.trim(); dcGenerate(); }
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

    const sel = document.getElementById('dcChannelSelect');
    const inp = document.getElementById('dcChannelId');
    if (sel) {
      // Grouper par serveur (puis par catégorie au sein du serveur)
      const byGuild = new Map(); // guildName → { catName → [channels] }
      data.channels.forEach(c => {
        const g = c.guildName || 'Serveur';
        const cat = c.category || '—';
        if (!byGuild.has(g)) byGuild.set(g, {});
        const cats = byGuild.get(g);
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(c);
      });

      const opts = ['<option value="">— Choisir un salon —</option>'];
      const multiGuild = byGuild.size > 1;
      for (const [guildName, cats] of byGuild) {
        const catNames = Object.keys(cats).sort((a, b) => {
          if (a === '—') return 1; if (b === '—') return -1;
          return a.localeCompare(b);
        });
        // Préfixer les catégories avec le nom du serveur si plusieurs guildes
        for (const cat of catNames) {
          const label = multiGuild ? `${guildName} › ${cat}` : cat;
          opts.push(`<optgroup label="${escDC(label)}">`);
          opts.push(...cats[cat].map(c => `<option value="${c.id}">#${escDC(c.name)}</option>`));
          opts.push(`</optgroup>`);
        }
      }
      sel.innerHTML = opts.join('');
      sel.style.display = 'block';
      sel.onchange = () => { if (inp) inp.value = sel.value; };
    }
    if (!silent) dcPostStatus('ok', `✅ ${data.channels.length} salons chargés`);
  } catch(e) {
    if (!silent) dcPostStatus('error', `❌ ${e.message}`);
  }
}

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
  // Pré-remplir l'emoji tournoi UNIQUEMENT s'il est vide (préserver la valeur
  // perso de la session précédente).
  const preset = dcGetPreset();
  const emojiEl = document.getElementById('dcTourneyEmoji');
  if (emojiEl && !emojiEl.value && preset.tournamentEmoji) {
    emojiEl.value = preset.tournamentEmoji;
  }
  // Restaurer le schedule sauvegardé pour le preset actif s'il existe,
  // sinon garder le défaut codé dans le preset.
  const savedSched = dcLoadScheduleForPreset(DC.presetId);
  if (savedSched) DC.scheduleLines = savedSched;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function dcInit() {
  dcBuildSchedule();
  dcLoadBotSettings();
  dcLoadPreset();

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
