// ============================================================
// MULTI.JS — Gestion multi-graphs (un par event)
// ============================================================

// Structure : tableau de graphs générés
// graphs = [{ eventSlug, eventName, game, players, canvasDataUrl }, ...]
let graphs = [];
let currentGraphIdx = 0;

// ── COULEURS D'ACCENT PAR JEU (pour la bulle de navigation) ──────────────────
const GAME_NAV_COLORS = {
  ssbu:    '#6B9FFF', // bleu SSBU
  ggst:    '#FF4E78', // rouge/rose Guilty Gear
  tekken8: '#FF7A45', // orange Tekken
  '2xko':  '#FFD44E', // or 2XKO
  sf6:     '#FF3B30', // rouge SF6
  dbfz:    '#FF8C00', // orange DBZ
};

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function updateMultiNavColor(gameId) {
  const nav = document.getElementById('multiNav');
  if (!nav) return;
  // Priorité : couleur built-in → première couleur du layout custom → défaut lavande
  let accent = GAME_NAV_COLORS[gameId] || null;
  if (!accent) {
    const rc = typeof RANK_COLORS_BY_GAME !== 'undefined' ? RANK_COLORS_BY_GAME[gameId] : null;
    accent = Array.isArray(rc) && rc[0] ? rc[0] : '#a77acc';
  }
  const [r, g, b] = _hexToRgb(accent);
  nav.style.setProperty('--nav-color', `${r}, ${g}, ${b}`);
  nav.style.setProperty('--nav-accent', accent);
}

// ── RECHERCHE D'UN LAYOUT CUSTOM DANS LE COFFRE ───────────────────────────────
function findCoffreLayoutForGame(gameName) {
  const coffre = JSON.parse(localStorage.getItem('top8_coffre') || '[]');
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const target = norm(gameName);
  if (!target) return null;
  const lite = coffre.find(l => norm(l.gameName) === target || norm(l.name) === target);
  if (!lite) return null;
  // Préférer la version en mémoire (images déjà chargées depuis IDB au démarrage)
  return (typeof LAYOUTS !== 'undefined' && LAYOUTS[lite.id]?._lm) || lite;
}

// ── IMPORT TOUS LES EVENTS ────────────────────────────────────────────────────
async function importAllEvents() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const rawUrl = document.getElementById('startggUrl').value.trim();
  const btn    = document.getElementById('loadEventsBtn');

  if (!apiKey) { showStatus('error', "❌ Entre ta clé API start.gg d'abord."); return; }
  if (!rawUrl) { showStatus('error', '❌ Entre le lien du tournoi.'); return; }

  const url  = rawUrl.startsWith('http') ? rawUrl : 'https://start.gg/tournament/' + rawUrl;
  const slug = parseTournamentSlug(url);
  if (!slug) { showStatus('error', '❌ Lien invalide.'); return; }

  btn.disabled = true; btn.textContent = '⏳';
  showStatus('loading', '⏳ Récupération des events...');

  try {
    // 1. Récupérer tous les events du tournoi
    const td = await gqlFetch(apiKey, `
      query($slug:String!) { tournament(slug:$slug) {
        name
        events {
          id slug name numEntrants
          videogame { name displayName images { url type } }
        }
      }}`, { slug });

    const tournament = td?.data?.tournament;
    if (!tournament) { showStatus('error', '❌ Tournoi introuvable.'); btn.disabled=false; btn.textContent='🔍 Chercher'; return; }

    // Tous les events du tournoi (y compris ceux dont numEntrants peut être null)
    const rawEvents = tournament.events || [];

    // Trier les events : layout built-in, layout custom (coffre), ou sans layout
    const events = [];
    const noLayoutEvents = [];

    rawEvents.forEach(e => {
      const gameName = e.videogame?.displayName || e.videogame?.name || '';
      const builtinId = detectGameFromStartGG(gameName || e.name);

      if (!e.numEntrants) {
        // Pas de participants → toujours dans "sans layout" pour affichage
        noLayoutEvents.push(e);
        return;
      }

      if (builtinId && LAYOUTS[builtinId]?.bgFile) {
        // Layout built-in trouvé
        events.push({ ...e, _resolvedGameId: builtinId });
      } else {
        // Chercher dans le coffre de layouts custom
        const customLayout = findCoffreLayoutForGame(gameName || e.name);
        if (customLayout) {
          // S'assurer que le layout est enregistré dans LAYOUTS/GAMES
          if (typeof lmRegisterLayout === 'function') lmRegisterLayout(customLayout);
          events.push({ ...e, _resolvedGameId: customLayout.id, _customLayout: customLayout });
        } else {
          noLayoutEvents.push(e);
        }
      }
    });

    // Afficher la section "sans layout"
    console.log('[noLayout] rawEvents:', rawEvents.length, '| avec layout:', events.length, '| sans layout:', noLayoutEvents.length, noLayoutEvents.map(e => e.videogame?.displayName || e.name));
    showNoLayoutSection(noLayoutEvents);

    if (!events.length && !noLayoutEvents.length) {
      showStatus('error', '❌ Aucun event trouvé dans ce tournoi.');
      btn.disabled=false; btn.textContent='🔍 Chercher'; return;
    }

    if (!events.length) {
      showStatus('success', `✅ "${tournament.name}" — ${noLayoutEvents.length} jeu(x) sans layout détectés, crée un layout pour les utiliser !`);
      btn.disabled=false; btn.textContent='🔍 Chercher'; return;
    }

    showStatus('loading', `⏳ Import de ${events.length} event(s) avec layout + ${noLayoutEvents.length} sans layout...`);
    graphs = [];

    // 2. Importer chaque event
    for (let ei = 0; ei < events.length; ei++) {
      const ev = events[ei];
      showStatus('loading', `⏳ Import event ${ei+1}/${events.length} : ${ev.name}...`);

      const gameName = ev.videogame?.displayName || ev.videogame?.name || '';
      const gameId   = ev._resolvedGameId || detectGameFromStartGG(gameName || ev.name) || 'ssbu';
      const isCustom = !!ev._customLayout;
      const layout   = LAYOUTS[gameId];
      const playerCount = layout?.playerCount || 8;

      // Standings
      let evPlayers = Array.from({length: playerCount}, () => ({name:'', team:'', charId:null, costume:1, charId2:null, costume2:1, startggId:null}));

      // ── Récupérer les standings ──
      let standingsNodes = [];
      try {
        const sd = await gqlFetch(apiKey, `
          query($slug:String!) { event(slug:$slug) {
            name
            standings(query:{perPage:8,page:1}) { nodes {
              placement
              entrant { id name participants { player { gamerTag prefix } } }
            }}
          }}`, { slug: ev.slug });
        standingsNodes = (sd?.data?.event?.standings?.nodes || []).sort((a,b)=>a.placement-b.placement);
        console.log(`[MULTI] "${ev.name}" : ${standingsNodes.length} standings récupérés`);
      } catch(e) {
        console.warn(`[MULTI] Standings échouées pour "${ev.name}" (${ev.slug}) :`, e.message);
      }

      // ── Fallback entrants si standings vides ──
      if (standingsNodes.length === 0) {
        console.log(`[MULTI] Fallback entrants pour "${ev.name}"...`);
        try {
          const ed = await gqlFetch(apiKey, `
            query($slug:String!) { event(slug:$slug) {
              entrants(query:{perPage:10,page:1}) { nodes {
                name
                participants { player { gamerTag prefix } }
              }}
            }}`, { slug: ev.slug });
          const entNodes = ed?.data?.event?.entrants?.nodes || [];
          console.log(`[MULTI] "${ev.name}" : ${entNodes.length} entrants (fallback)`);
          entNodes.slice(0, playerCount).forEach((ent, i) => {
            const pg = ent.participants?.[0]?.player?.gamerTag;
            evPlayers[i].name = pg || ent.name || `Joueur ${i+1}`;
            evPlayers[i].team = ent.participants?.[0]?.player?.prefix || '';
            if (isCustom) evPlayers[i].charId = `lmchar${i}`;
          });
        } catch(e2) {
          console.warn(`[MULTI] Entrants fallback échoué pour "${ev.name}" :`, e2.message);
        }
      } else {
        // Traitement normal des standings
        standingsNodes.slice(0, playerCount).forEach((s, i) => {
          const p = s.entrant?.participants?.[0];
          evPlayers[i].name       = p?.player?.gamerTag || s.entrant?.name || '???';
          evPlayers[i].team       = p?.player?.prefix || '';
          evPlayers[i].startggId  = s.entrant?.id;
          // Layout custom : les images de perso viennent du layout (lmchar0, lmchar1, lmchar2)
          if (isCustom) {
            evPlayers[i].charId = `lmchar${i}`;
          } else {
            // Appliquer prefs sauvegardées
            const pref = getPlayerPref(s.entrant?.id);
            if (pref) { evPlayers[i].charId = pref.charId; evPlayers[i].costume = pref.costume; }
          }
        });
      }

      console.log(`[MULTI] "${ev.name}" noms :`, evPlayers.slice(0, playerCount).map(p => p.name));

      // Sets → personnages (seulement pour les jeux built-in avec roster)
      if (!isCustom && standingsNodes.length > 0) {
        try {
        const setsData = await gqlFetch(apiKey, `
          query($slug:String!,$page:Int!,$perPage:Int!) { event(slug:$slug) {
            sets(page:$page,perPage:$perPage,sortType:STANDARD) { nodes {
              games { selections { entrant{id} character{name} } }
            }}
          }}`, { slug: ev.slug, page:1, perPage:30 });

        const charCount = {};
        (setsData?.data?.event?.sets?.nodes||[]).forEach(set => {
          (set.games||[]).forEach(game => {
            (game.selections||[]).forEach(sel => {
              const eid = sel?.entrant?.id, cn = sel?.character?.name;
              if (!eid||!cn) return;
              if (!charCount[eid]) charCount[eid] = {};
              charCount[eid][cn] = (charCount[eid][cn]||0)+1;
            });
          });
        });

        standingsNodes.slice(0, playerCount).forEach((s, i) => {
          if (evPlayers[i].charId) return;
          const counts = charCount[s.entrant?.id];
          if (!counts) return;
          const topChar = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
          if (topChar && STARTGG_TO_ID[topChar]) evPlayers[i].charId = STARTGG_TO_ID[topChar];
        });
        } catch(e) { console.warn('[MULTI] Sets fetch error:', e.message); }
      }

      graphs.push({
        eventSlug:  ev.slug,
        eventName:  ev.name,
        game:       gameId,
        gameName:   ev._customLayout ? (ev._customLayout.name || gameName) : (gameName || GAME_LABELS[gameId] || gameId),
        players:    evPlayers,
        tournamentName: tournament.name,
        isCustomLayout: isCustom,
      });
    }

    // 3. Générer les canvas pour chaque graph
    showStatus('loading', '⏳ Génération des images...');
    await generateAllGraphs();

    // 4. Afficher le premier
    currentGraphIdx = 0;
    renderMultiPreview();
    showMultiNav(graphs.length > 1);
    updateMultiTweet();

    showStatus('success', `✅ ${graphs.length} graph(s) générés pour "${tournament.name}" !`);

  } catch(err) {
    showStatus('error', '❌ Erreur : ' + err.message);
  }

  btn.disabled = false; btn.textContent = '🔍 Chercher';
}

async function generateAllGraphs() {
  for (const graph of graphs) {
    // Sauvegarder le contexte global
    const savedGame    = currentGame;
    const savedPlayers = players;
    const savedBg      = bgImg;

    // Charger les données de ce graph
    currentGame = graph.game;
    players     = graph.players;
    if (typeof loadTitleConfig === 'function') loadTitleConfig(); // config titres du bon jeu

    // Charger le fond du jeu (built-in bgFile OU custom bgDataUrl)
    await new Promise(resolve => {
      const layout = LAYOUTS[graph.game];
      const bgSrc = layout?.bgFile || layout?._lm?.bgDataUrl || null;
      if (bgSrc) {
        const img = new Image();
        img.onload = () => { bgImg = img; resolve(); };
        img.onerror = () => { bgImg = null; resolve(); };
        img.src = bgSrc;
      } else { bgImg = null; resolve(); }
    });

    // Précharger les murals (charId + charId2 pour 2XKO) — pas nécessaire pour layouts custom
    if (!graph.isCustomLayout) await preloadMurals(graph.game, players);

    // Passer le nom du tournoi pour drawTitles
    window._multiTournamentName = graph.tournamentName || '';
    window._multiGameData = GAMES[graph.game] || {sub1: graph.gameName || '', sub2: 'RÉSULTATS'};

    // Générer le canvas — 1400 px pour rester net à l'affichage (cohérent avec
    // le single-mode). Rendre à 700 produit du pixel-aliasing visible.
    const canvas = document.createElement('canvas');
    renderCanvas(canvas, 1400);

    // Nettoyer
    window._multiTournamentName = null;
    window._multiGameData = null;
    try { graph.canvasDataUrl = canvas.toDataURL('image/png'); }
    catch(e) { graph.canvasDataUrl = null; }
    graph.canvas = canvas;

    // Restaurer
    currentGame = savedGame;
    players     = savedPlayers;
    bgImg       = savedBg;
    if (typeof loadTitleConfig === 'function') loadTitleConfig(); // restaurer config jeu principal
  }
}

// ── NAVIGATION MULTI-GRAPH ────────────────────────────────────────────────────
function renderMultiPreview() {
  if (!graphs.length) return;
  const graph = graphs[currentGraphIdx];

  // Mettre à jour l'aperçu avec le canvas de ce graph
  const preview = document.getElementById('previewCanvas');
  if (preview && graph.canvas) {
    preview.width  = graph.canvas.width;
    preview.height = graph.canvas.height;
    preview.getContext('2d').drawImage(graph.canvas, 0, 0);
  }

  // Mettre à jour le compteur
  const counter = document.getElementById('graphCounter');
  if (counter) counter.textContent = `${currentGraphIdx+1} / ${graphs.length} — ${graph.gameName}`;

  // Synchroniser le panneau gauche avec ce graph
  currentGame = graph.game;
  players     = graph.players;

  // Mettre à jour la couleur de la bulle de navigation
  updateMultiNavColor(graph.game);

  // Mettre à jour le sélecteur de jeu
  const gameSelect = document.getElementById('gameSelect');
  if (gameSelect) gameSelect.value = graph.game;

  // Mettre à jour le nom du tournoi
  const nameEl = document.getElementById('tournamentName');
  if (nameEl) nameEl.value = graph.tournamentName || '';

  // Recharger le bon fond pour ce jeu (built-in bgFile OU custom bgDataUrl)
  const layout = LAYOUTS[graph.game];
  const bgSrc = layout?.bgFile || layout?._lm?.bgDataUrl || null;
  if (bgSrc) {
    const img = new Image();
    img.onload = () => {
      bgImg = img;
      if (layout?.bgFile) updateUploadLabel(layout.bgFile);
    };
    img.onerror = () => { bgImg = null; };
    img.src = bgSrc;
  } else { bgImg = null; }

  // Re-render les slots avec les données de ce graph
  renderSlots();

  updateMultiTweet();
}

function prevGraph() {
  if (currentGraphIdx > 0) { currentGraphIdx--; renderMultiPreview(); }
}
function nextGraph() {
  if (currentGraphIdx < graphs.length-1) { currentGraphIdx++; renderMultiPreview(); }
}

// Ajoute un layout custom comme nouveau graphe dans la nav multi (haut-droite).
// Appelé après création/màj d'un layout depuis le Layout Maker.
async function addCustomLayoutGraph(layout) {
  if (typeof graphs === 'undefined') return;
  if (!layout?.id) return;

  // Joueurs placeholder à partir des noms saisis dans le layout maker
  const evPlayers = (layout.playerNames || ['', '', '']).slice(0, 3).map((rawName, i) => ({
    name: rawName || `Joueur ${i+1}`,
    team: '',
    charId: `lmchar${i}`,
    costume: 1,
    charId2: null, costume2: 1,
    startggId: null,
  }));

  // Si le layout existe déjà comme graphe (édition), le remplacer ; sinon ajouter
  const existingIdx = graphs.findIndex(g => g.game === layout.id && g.isCustomLayout);

  const newGraph = {
    eventSlug:      null,
    eventName:      layout.name,
    game:           layout.id,
    gameName:       layout.name,
    players:        evPlayers,
    tournamentName: graphs[0]?.tournamentName || '',
    isCustomLayout: true,
  };

  // Sauvegarder le contexte global puis basculer sur le nouveau graphe pour rendre le canvas
  const savedGame    = (typeof currentGame !== 'undefined') ? currentGame : null;
  const savedPlayers = (typeof players !== 'undefined') ? players : null;
  const savedBg      = (typeof bgImg !== 'undefined') ? bgImg : null;

  currentGame = newGraph.game;
  players     = newGraph.players;
  if (typeof loadTitleConfig === 'function') loadTitleConfig();

  // Charger le fond du layout (custom_lm → bgDataUrl)
  await new Promise(resolve => {
    const lay = LAYOUTS[newGraph.game];
    const bgSrc = lay?.bgFile || lay?._lm?.bgDataUrl || null;
    if (bgSrc) {
      const img = new Image();
      img.onload  = () => { bgImg = img; resolve(); };
      img.onerror = () => { bgImg = null; resolve(); };
      img.src = bgSrc;
    } else { bgImg = null; resolve(); }
  });

  window._multiTournamentName = newGraph.tournamentName || '';
  window._multiGameData = GAMES[newGraph.game] || { sub1: newGraph.gameName, sub2: 'RÉSULTATS' };

  const canvas = document.createElement('canvas');
  if (typeof renderCanvas === 'function') renderCanvas(canvas, 1400);

  window._multiTournamentName = null;
  window._multiGameData = null;
  try { newGraph.canvasDataUrl = canvas.toDataURL('image/png'); } catch(e) { newGraph.canvasDataUrl = null; }
  newGraph.canvas = canvas;

  // Restaurer le contexte global
  currentGame = savedGame;
  players     = savedPlayers;
  bgImg       = savedBg;
  if (typeof loadTitleConfig === 'function') loadTitleConfig();

  // Insérer dans graphs[] : remplacer si édition, ajouter sinon
  if (existingIdx >= 0) {
    graphs[existingIdx] = newGraph;
    currentGraphIdx = existingIdx;
  } else {
    graphs.push(newGraph);
    currentGraphIdx = graphs.length - 1;
  }

  // Rafraîchir l'UI multi-graphes
  renderMultiPreview();
  showMultiNav(graphs.length > 1);
  if (typeof updateMultiTweet === 'function') updateMultiTweet();
}

function showMultiNav(show) {
  const nav = document.getElementById('multiNav');
  if (nav) nav.style.display = show ? 'flex' : 'none';
}

function updateMultiTweet() {
  const graph = graphs[currentGraphIdx];
  if (!graph) return;
  const name = graph.tournamentName || 'Lorem Ipsum';
  const game = graph.gameName;
  const top3 = graph.players.slice(0,3)
    .map((p,i) => `${['🥇','🥈','🥉'][i]} ${p.name||'???'}`)
    .join('  ');
  const tag = game.replace(/[^a-zA-Z0-9]/g,'');
  const tweetEl = document.getElementById('tweetText');
  if (tweetEl) tweetEl.value = `🏆 Résultats du tournoi ${name} — ${game} !\n\n${top3}\n\nMerci à tous les participants ! 🎮 #FGC #${tag}`;
}

// ── THREAD TWITTER ────────────────────────────────────────────────────────────
async function postThreadToTwitter() {
  if (!graphs.length) {
    postToTwitter();
    return;
  }

  openThreadModal();
  const total = graphs.length;

  // Sauvegarder le contexte courant
  const savedGame    = currentGame;
  const savedPlayers = players;
  const savedBg      = bgImg;

  const items = [];

  for (let i = 0; i < graphs.length; i++) {
    const graph = graphs[i];
    document.getElementById('threadLoadingMsg').textContent =
      `Génération ${i+1}/${total} — ${graph.gameName}…`;

    // Charger le contexte de ce graph
    currentGame = graph.game;
    players     = graph.players;

    // Charger le fond (built-in bgFile OU custom bgDataUrl)
    await new Promise(resolve => {
      const layout = LAYOUTS[graph.game];
      const bgSrc = layout?.bgFile || layout?._lm?.bgDataUrl || null;
      if (bgSrc) {
        const img = new Image();
        img.onload = () => { bgImg = img; resolve(); };
        img.onerror = () => { bgImg = null; resolve(); };
        img.src = bgSrc;
      } else { bgImg = null; resolve(); }
    });

    // Précharger les murals (pas nécessaire pour layouts custom)
    if (!graph.isCustomLayout) await preloadMurals(graph.game, graph.players);

    // Générer le canvas 1400px
    const canvas = document.createElement('canvas');
    renderCanvas(canvas, 1400);

    const tournamentName = graph.tournamentName || 'Lorem Ipsum';
    const filename = `${i+1}_top8_${graph.game}_${tournamentName.replace(/\s/g,'_')}.png`;
    let dataUrl = null;
    try { dataUrl = canvas.toDataURL('image/png'); } catch(e) {}

    // Pas de téléchargement automatique : l'utilisateur copie l'image
    // (bouton "🖼️ Copier image") et la colle dans X avec Ctrl+V.
    const photoFilenames = [];

    const text = buildTweetText(tournamentName, graph.gameName, graph.players, i, total);
    const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    items.push({
      game: graph.gameName, text, filename, tweetUrl, num: i+1, dataUrl,
      photoFilenames,
      src: { tournamentName, gameName: graph.gameName, players: graph.players, idx: i, total },
    });
  }

  // Restaurer le contexte
  currentGame = savedGame;
  players     = savedPlayers;
  bgImg       = savedBg;

  // Afficher le panneau prêt
  document.getElementById('threadLoading').style.display = 'none';
  document.getElementById('threadReady').style.display = 'block';

  // Stocker les items pour le mode pas-à-pas
  window._threadItems = items;
  window._threadStep  = 0;

  renderThreadList();
}

function threadOpen(idx) {
  const items = window._threadItems || [];
  if (!items[idx]) return;
  window.open(items[idx].tweetUrl, '_blank');
  // Marquer comme ouvert
  const el = document.getElementById(`threadItem${idx}`);
  if (el) el.classList.add('thread-item-done');
}

function threadCopy(idx) {
  const items = window._threadItems || [];
  if (!items[idx]) return;
  navigator.clipboard.writeText(items[idx].text).then(() => {
    const btn = document.getElementById(`threadCopyBtn${idx}`);
    if (btn) { btn.textContent = '✅ Copié !'; setTimeout(() => { btn.textContent = '📋 Copier le texte'; }, 2000); }
  }).catch(() => {
    // Fallback : sélection manuelle
    const ta = document.createElement('textarea');
    ta.value = items[idx].text;
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    const btn = document.getElementById(`threadCopyBtn${idx}`);
    if (btn) { btn.textContent = '✅ Copié !'; setTimeout(() => { btn.textContent = '📋 Copier le texte'; }, 2000); }
  });
}

function threadOpenAll() {
  const items = window._threadItems || [];
  items.forEach((it, idx) => {
    window.open(it.tweetUrl, '_blank');
    const el = document.getElementById(`threadItem${idx}`);
    if (el) el.classList.add('thread-item-done');
  });
}

// ── OUVRIR LAYOUT MAKER AVEC TOP 3 DE L'EVENT ────────────────────────────────
async function openLayoutMakerForEvent(slug, gameName, gameImgUrl) {
  const apiKey = document.getElementById('apiKey')?.value?.trim();

  // Reset les noms dans LM
  if (typeof LM !== 'undefined') LM.playerNames = ['', '', ''];

  // Pré-remplir depuis players[] si c'est le bon event (fallback)
  if (typeof players !== 'undefined') {
    LM.playerNames = [0,1,2].map(i => players[i]?.name || '');
  }

  // Fetch le vrai top 3 de cet event
  if (apiKey && slug) {
    try {
      const sd = await gqlFetch(apiKey, `
        query($slug:String!) { event(slug:$slug) {
          standings(query:{perPage:3,page:1}) { nodes {
            placement
            entrant { name participants { player { gamerTag prefix } } }
          }}
        }}`, { slug });

      const nodes = (sd?.data?.event?.standings?.nodes || [])
        .sort((a, b) => a.placement - b.placement);

      LM.playerNames = [0,1,2].map(i => {
        const s = nodes[i];
        if (!s) return '';
        const p = s.entrant?.participants?.[0];
        return p?.player?.gamerTag || s.entrant?.name || '';
      });
    } catch(e) {
      console.warn('[LM] Impossible de récupérer le top 3 :', e);
    }
  }

  openLayoutMaker(gameName, gameImgUrl || null);
}

// ── SECTION JEUX SANS LAYOUT ──────────────────────────────────────────────────
function showNoLayoutSection(events) {
  console.log('[showNoLayoutSection] called, events:', events?.length);
  const wrap = document.getElementById('noLayoutSection');
  const list = document.getElementById('noLayoutList');
  console.log('[showNoLayoutSection] wrap found:', !!wrap, '| list found:', !!list);

  if (!wrap || !list) return;

  if (!events || events.length === 0) {
    wrap.style.cssText = 'display:none !important';
    return;
  }

  list.innerHTML = events.map(ev => {
    const gameName = ev.videogame?.displayName || ev.videogame?.name || ev.name || 'Jeu inconnu';
    const safeGame = gameName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeSlug = (ev.slug || '').replace(/'/g, "\\'");
    // Get best game image from start.gg (prefer square/icon images)
    const images = ev.videogame?.images || [];
    const gameImg = images.find(i => i.type === 'primary') || images[0] || null;
    const imgHtml = gameImg
      ? `<img src="${gameImg.url}" class="tv-game-img" alt="${gameName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const fallbackStyle = gameImg ? 'display:none;' : '';
    return `
      <div class="nolayout-item">
        <button class="btn-tv-create" onclick="openLayoutMakerForEvent('${safeSlug}','${safeGame}','${gameImg ? gameImg.url.replace(/'/g,"\\'") : ''}')">
          <div class="tv-antenna">
            <span class="tv-ant tv-ant-l"></span>
            <span class="tv-ant tv-ant-r"></span>
          </div>
          <div class="tv-body">
            <div class="tv-screen tv-screen-game">
              ${imgHtml}
              <div class="tv-screen-fallback" style="${fallbackStyle}">
                <span class="tv-screen-icon">🎮</span>
                <span class="tv-screen-text">Créer layout</span>
              </div>
              <div class="tv-screen-overlay">✨ Créer</div>
            </div>
            <div class="tv-side-btns">
              <span class="tv-side-btn"></span>
              <span class="tv-side-btn"></span>
              <span class="tv-side-btn"></span>
            </div>
          </div>
          <div class="tv-legs">
            <span class="tv-leg"></span>
            <span class="tv-leg"></span>
          </div>
          <div class="tv-game-label">${gameName}</div>
        </button>
      </div>
    `;
  }).join('');

  // Force visible
  wrap.removeAttribute('style');
  wrap.style.display = 'block';
  console.log('[showNoLayoutSection] section shown, display:', wrap.style.display);
}
