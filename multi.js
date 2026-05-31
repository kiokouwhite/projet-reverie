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

  // ── Animation nuages : enclenchée DÈS le clic, avant la requête réseau ──
  // (cloud-animation.js définit ces helpers globalement)
  if (typeof cloudAnimStart === 'function') cloudAnimStart();

  try {
    // 1. Récupérer tous les events du tournoi
    // On demande à la fois numEntrants (champ cached) ET entrants.pageInfo.totalCount
    // (compte réel via la table entrants). Le second est plus fiable :
    // numEntrants peut être stale ou ne refléter que les participants en bracket.
    const td = await gqlFetch(apiKey, `
      query($slug:String!) { tournament(slug:$slug) {
        name
        events {
          id slug name numEntrants
          entrants(query:{perPage:1,page:1}) { pageInfo { total } }
          videogame { id name displayName images { url type } }
        }
      }}`, { slug });

    const tournament = td?.data?.tournament;
    if (!tournament) {
      showStatus('error', '❌ Tournoi introuvable.');
      if (typeof cloudAnimCancel === 'function') cloudAnimCancel();
      btn.disabled=false; btn.textContent='🔍 Chercher'; return;
    }

    // ── Update des cartes-nuages avec les vrais jeux du tournoi ──
    // Groupage par videogame : un tournoi peut avoir plusieurs events pour
    // le même jeu (Singles + Doubles + Squad Strike…). On affiche 1 carte
    // par jeu avec le TOTAL des entrants tous events confondus, sinon le
    // nombre affiché correspondait à un event arbitraire et n'avait pas
    // de sens visuel.
    if (typeof cloudAnimSetGames === 'function') {
      const gameMap = new Map(); // videogameId → { name, imgUrl, entrants }
      // DEBUG : log brut de ce que start.gg renvoie pour chaque event
      // (pour qu'on diagnostique facilement quand le compte semble faux)
      console.log('[CLOUD] events raw :', (tournament.events || []).map(e => ({
        name: e.name,
        videogame: e.videogame?.displayName || e.videogame?.name,
        numEntrants: e.numEntrants,
        entrantsTotal: e.entrants?.pageInfo?.total,
      })));
      (tournament.events || []).forEach(e => {
        if (!e.videogame) return;
        const vgId = e.videogame.id || e.videogame.name;
        if (!vgId) return;
        // On prend le MAX entre numEntrants (champ cached) et
        // entrants.pageInfo.total (interroge la table). L'un ou l'autre
        // peut être stale ou nul selon les events.
        const num = e.numEntrants || 0;
        const real = e.entrants?.pageInfo?.total || 0;
        const cnt = Math.max(num, real);
        const existing = gameMap.get(vgId);
        const imgs = e.videogame.images || [];
        const img  = imgs.find(i => i.type === 'profile')
                  || imgs.find(i => i.type === 'primary')
                  || imgs[0];
        if (existing) {
          existing.entrants += cnt;
        } else {
          gameMap.set(vgId, {
            name:     e.videogame.displayName || e.videogame.name || e.name,
            imgUrl:   img?.url || null,
            entrants: cnt,
          });
        }
        // ── Wire fond start.gg vers le pill game-selector ──
        // Trois chemins pour identifier le bon gameId interne :
        //  1. Jeu built-in (Smash, SF6...) → detectGameFromStartGG()
        //  2. Layout custom du coffre → findCoffreLayoutForGame() (= layout.id)
        //  3. Sinon on saute (rien à wirer dans le <select>)
        if (img?.url && typeof gameSelectorSetStartggImage === 'function') {
          const gameName = e.videogame.displayName || e.videogame.name || '';
          let internalId = (typeof detectGameFromStartGG === 'function')
            ? detectGameFromStartGG(gameName)
            : null;
          if (!internalId && typeof findCoffreLayoutForGame === 'function') {
            const customMatch = findCoffreLayoutForGame(gameName || e.name);
            if (customMatch?.id) internalId = customMatch.id;
          }
          if (internalId) gameSelectorSetStartggImage(internalId, img.url);
        }
      });
      const cloudGames = Array.from(gameMap.values())
        .sort((a, b) => b.entrants - a.entrants)   // les plus gros jeux d'abord
        // (plus de limite : on affiche TOUS les jeux du tournoi)
        .map(g => ({
          name:     g.name,
          imgUrl:   g.imgUrl,
          entrants: g.entrants ? g.entrants + ' entrants' : '',
        }));
      cloudAnimSetGames(cloudGames);
    }

    // Auto-détecte le format Magna depuis le nom du tournoi AVANT le
    // filtrage des events — comme ça si on est en Magna, on peut inclure
    // tous les events (même sans layout per-game), Magna les rendant tous
    // via son template universel.
    if (typeof autoDetectFormat === 'function') autoDetectFormat(tournament.name);
    const isMagnaFormat = (typeof currentFormat !== 'undefined' && currentFormat === 'magna');

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

      // Mémorise l'ID videogame + le slug start.gg → roster perso récupérable
      // dans le picker (full roster ou dérivé des sélections de sets).
      const _storeSgg = (internalId) => {
        if (!internalId) return;
        if (e.videogame?.id) {
          window._sggVideogameId = window._sggVideogameId || {};
          window._sggVideogameId[internalId] = e.videogame.id;
        }
        if (e.slug) {
          window._sggEventSlug = window._sggEventSlug || {};
          window._sggEventSlug[internalId] = e.slug;
        }
        if (typeof sggSaveGameMeta === 'function')
          sggSaveGameMeta(internalId, { vgId: e.videogame?.id || undefined, slug: e.slug || undefined });
      };

      if (builtinId && LAYOUTS[builtinId]?.bgFile) {
        // Layout built-in trouvé
        _storeSgg(builtinId);
        events.push({ ...e, _resolvedGameId: builtinId });
      } else {
        // Chercher dans le coffre de layouts custom
        const customLayout = findCoffreLayoutForGame(gameName || e.name);
        if (customLayout) {
          // S'assurer que le layout est enregistré dans LAYOUTS/GAMES
          if (typeof lmRegisterLayout === 'function') lmRegisterLayout(customLayout);
          _storeSgg(customLayout.id);
          events.push({ ...e, _resolvedGameId: customLayout.id, _customLayout: customLayout });
        } else if (isMagnaFormat) {
          // En Magna : on inclut quand même cet event sans layout, avec un
          // gameId fallback générique ('ssbu'). Magna ne dépend pas du layout
          // per-game, et les personnages seront résolus via les images
          // start.gg (preloadMurals charge automatiquement charImgUrl).
          events.push({ ...e, _resolvedGameId: builtinId || 'ssbu', _magnaUnknownGame: true });
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
      if (typeof cloudAnimCancel === 'function') cloudAnimCancel();
      btn.disabled=false; btn.textContent='🔍 Chercher'; return;
    }

    if (!events.length) {
      showStatus('success', `✅ "${tournament.name}" — ${noLayoutEvents.length} jeu(x) sans layout détectés, crée un layout pour les utiliser !`);
      if (typeof cloudAnimEnd === 'function') cloudAnimEnd();
      btn.disabled=false; btn.textContent='🔍 Chercher'; return;
    }

    showStatus('loading', `⏳ Import de ${events.length} event(s) avec layout + ${noLayoutEvents.length} sans layout...`);
    graphs = [];

    // 2. Importer chaque event — EN PARALLÈLE pour gagner du temps.
    // Sur de gros tournois multi-events (ex. Magna Arena), faire un import
    // séquentiel multiplie la latence par N. Avec Promise.all on est limité
    // par la requête la plus lente. start.gg rate-limit: 80 req/60s donc
    // ~3-10 events en parallèle = OK.
    // Au sein d'un event, on lance aussi standings + sets en parallèle
    // (sets a ses propres entrant IDs, indépendants des standings).
    let _completed = 0;
    const importOneEvent = async (ev) => {
      const gameName = ev.videogame?.displayName || ev.videogame?.name || '';
      const gameId   = ev._resolvedGameId || detectGameFromStartGG(gameName || ev.name) || 'ssbu';
      const isCustom = !!ev._customLayout;
      const layout   = LAYOUTS[gameId];
      // En Lorem, certains layouts ne montrent que 3 joueurs (SF6, GGST,
      // T8, 2XKO) — mais en Magna on veut TOUS les standings (jusqu'à 8).
      // On collecte donc toujours max(layout.playerCount, 8) standings ;
      // le rendu Lorem clippe naturellement à layout.playerCount via ses
      // slots définis dans LAYOUTS.
      const playerCount = Math.max(layout?.playerCount || 8, 8);

      const evPlayers = Array.from({length: playerCount}, () => ({name:'', team:'', charId:null, costume:1, charId2:null, costume2:1, startggId:null}));

      // ── Lancer standings + sets en parallèle ──
      const standingsP = gqlFetch(apiKey, `
        query($slug:String!) { event(slug:$slug) {
          name
          standings(query:{perPage:8,page:1}) { nodes {
            placement
            entrant { id name participants { player { gamerTag prefix } } }
          }}
        }}`, { slug: ev.slug }).catch(e => {
          console.warn(`[MULTI] Standings échouées pour "${ev.name}" (${ev.slug}) :`, e.message);
          return null;
        });

      // On récupère les sets même pour les jeux custom : on ne mappe pas le
      // charId (pas de roster local) mais on capture l'image start.gg du perso
      // (charImgUrl) pour permettre l'auto-import dans le Layout Maker.
      const setsP = gqlFetch(apiKey, `
        query($slug:String!,$page:Int!,$perPage:Int!) { event(slug:$slug) {
          sets(page:$page,perPage:$perPage,sortType:STANDARD) { nodes {
            games { selections { entrant{id} character{id name images{url type}} } }
          }}
        }}`, { slug: ev.slug, page:1, perPage:30 }).catch(e => {
          console.warn(`[MULTI] Sets fetch error pour "${ev.name}" :`, e.message);
          return null;
        });

      const [sd, setsData] = await Promise.all([standingsP, setsP]);

      // ── Traiter standings ──
      let standingsNodes = (sd?.data?.event?.standings?.nodes || []).sort((a,b)=>a.placement-b.placement);
      console.log(`[MULTI] "${ev.name}" : ${standingsNodes.length} standings récupérés`);

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
        const isMagna = (typeof currentFormat !== 'undefined' && currentFormat === 'magna');
        standingsNodes.slice(0, playerCount).forEach((s, i) => {
          const p = s.entrant?.participants?.[0];
          evPlayers[i].name       = p?.player?.gamerTag || s.entrant?.name || '???';
          evPlayers[i].team       = p?.player?.prefix || '';
          evPlayers[i].startggId  = s.entrant?.id;
          if (isCustom) {
            evPlayers[i].charId = `lmchar${i}`;
          } else if (!isMagna) {
            // En Lorem on respecte les prefs utilisateur (sets data n'override pas).
            // En Magna on IGNORE les prefs ici : elles seraient potentiellement
            // d'un autre jeu (cross-event contamination via startggId), ce qui
            // bloquerait la détection sets pour le bon perso SF6/Tekken/etc.
            const pref = getPlayerPref(s.entrant?.id);
            if (pref) { evPlayers[i].charId = pref.charId; evPlayers[i].costume = pref.costume; }
          }
        });
      }

      console.log(`[MULTI] "${ev.name}" noms :`, evPlayers.slice(0, playerCount).map(p => p.name));

      // ── Appliquer sets → personnages (seulement built-in roster + standings ok) ──
      // On compte aussi l'URL de l'image start.gg par character pour servir de
      // fallback quand le perso n'est pas dans notre mapping STARTGG_TO_ID
      // (ex. Alex, mods, personnages exotiques).
      if (standingsNodes.length > 0 && setsData) {
        const charCount = {};        // entrantId → { charName: count }
        const charImage = {};        // charName → URL start.gg (image principale)
        (setsData?.data?.event?.sets?.nodes||[]).forEach(set => {
          (set.games||[]).forEach(game => {
            (game.selections||[]).forEach(sel => {
              const eid = sel?.entrant?.id;
              const ch  = sel?.character;
              const cn  = ch?.name;
              if (!eid||!cn) return;
              if (!charCount[eid]) charCount[eid] = {};
              charCount[eid][cn] = (charCount[eid][cn]||0)+1;
              // Capture l'URL image start.gg du perso (préfère "primary", sinon
              // la première dispo). On ne capture qu'une fois par nom.
              if (!charImage[cn] && Array.isArray(ch.images) && ch.images.length) {
                const primary = ch.images.find(img => img.type === 'primary') || ch.images[0];
                if (primary?.url) charImage[cn] = primary.url;
              }
            });
          });
        });
        standingsNodes.slice(0, playerCount).forEach((s, i) => {
          // En custom, charId vaut déjà "lmchar${i}" (placeholder) : on ne le
          // remappe pas, mais on capture quand même l'image start.gg du perso.
          const charIdLocked = evPlayers[i].charId && !isCustom;
          if (charIdLocked) return;
          const counts = charCount[s.entrant?.id];
          const playerName = evPlayers[i].name;
          if (!counts) {
            console.log(`[MULTI] "${ev.name}" — ${playerName} : aucune sélection de perso dans les sets start.gg`);
            return;
          }
          const topChar = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
          if (!topChar) {
            console.log(`[MULTI] "${ev.name}" — ${playerName} : counts vides`, counts);
            return;
          }
          // Toujours stocker l'URL start.gg en fallback (au cas où le PNG
          // local n'existe pas, ex. Alex.png pas encore uploadé sur le repo).
          // drawMagnaCard tentera le local d'abord puis le fallback start.gg.
          if (charImage[topChar]) {
            evPlayers[i].charImgUrl = charImage[topChar];
            evPlayers[i].charNameStartgg = topChar;
          }
          // En custom on s'arrête là (pas de roster local à mapper).
          if (isCustom) return;
          // Si mapping local existe → on utilise aussi le mural haute-qualité.
          // findCharIdFromName est tolérant : essaie direct match puis
          // normalisation (lowercase/sans accent/sans ponctuation) puis
          // containment dans les deux sens. Couvre les variantes de noms
          // start.gg comme "Sol" pour "Sol Badguy", "Jack-O" pour "Jack-O'".
          const detectedId = (typeof findCharIdFromName === 'function')
            ? findCharIdFromName(topChar)
            : STARTGG_TO_ID[topChar];
          if (detectedId) {
            evPlayers[i].charId = detectedId;
            return;
          }
          if (charImage[topChar]) {
            console.log(`[MULTI] "${ev.name}" — ${playerName} : perso "${topChar}" non mappé localement, fallback image start.gg`);
            return;
          }
          console.warn(`[MULTI] "${ev.name}" — ${playerName} : perso "${topChar}" sans mapping ni image start.gg`);
        });
      }

      _completed++;
      showStatus('loading', `⏳ Events importés ${_completed}/${events.length}...`);

      // Capture l'image du videogame start.gg pour servir de fond au pill
      // game-selector en mode multi (fallback : image du coffre custom).
      const _imgs = ev.videogame?.images || [];
      const _vgImg = _imgs.find(i => i.type === 'profile')
                  || _imgs.find(i => i.type === 'primary')
                  || _imgs[0];
      const videogameImageUrl = _vgImg?.url
        || ev._customLayout?.gameImgDataUrl
        || ev._customLayout?.gameImgUrl
        || null;
      return {
        eventSlug:  ev.slug,
        eventName:  ev.name,
        game:       gameId,
        gameName:   ev._customLayout ? (ev._customLayout.name || gameName) : (gameName || GAME_LABELS[gameId] || gameId),
        players:    evPlayers,
        tournamentName: tournament.name,
        isCustomLayout: isCustom,
        videogameImageUrl,
      };
    };

    // Lance tous les events en parallèle. On préserve l'ordre original via
    // Promise.all (qui retourne les résultats dans l'ordre des inputs).
    graphs = await Promise.all(events.map(importOneEvent));

    // Note : autoDetectFormat est déjà appelé plus haut (avant le filtrage
    // des events) pour pouvoir inclure les events sans layout en Magna.

    // 3. Générer les canvas pour chaque graph
    showStatus('loading', '⏳ Génération des images...');
    // En Magna, on attend le logo PNG avant de générer les graphs sinon
    // le premier graph est rendu avec le placeholder canvas (timing bug)
    // car le PNG est encore en train de charger en async.
    if (typeof currentFormat !== 'undefined' && currentFormat === 'magna'
        && typeof loadMagnaLogo === 'function') {
      await loadMagnaLogo();
    }
    await generateAllGraphs();

    // 4. Afficher le premier
    currentGraphIdx = 0;
    renderMultiPreview();
    // Affiche le pill multi dès qu'il y a au moins 1 graph importé
    // (indicateur visuel du jeu courant + nav désactivée s'il n'y en a qu'un).
    showMultiNav(graphs.length >= 1);
    updateMultiTweet();

    showStatus('success', `✅ ${graphs.length} graph(s) générés pour "${tournament.name}" !`);

    // ── Fin de l'animation : les nuages se dissipent et le preview apparaît ──
    if (typeof cloudAnimEnd === 'function') cloudAnimEnd();

  } catch(err) {
    showStatus('error', '❌ Erreur : ' + err.message);
    if (typeof cloudAnimCancel === 'function') cloudAnimCancel();
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

    const isMagna = (typeof currentFormat !== 'undefined' && currentFormat === 'magna');

    // Charger le fond du jeu — SKIP en format Magna : Magna dessine son
    // propre fond rouge à rayures, pas besoin du fond per-game.
    if (!isMagna) {
      await new Promise(resolve => {
        const layout = LAYOUTS[graph.game];
        const bgSrc = layout?.bgFile || layout?._lm?.bgDataUrl || null;
        if (bgSrc) {
          const img = new Image();
          img.crossOrigin = 'anonymous'; // CORS pour toDataURL (Insta)
          img.onload = () => { bgImg = img; resolve(); };
          img.onerror = () => { bgImg = null; resolve(); };
          img.src = bgSrc;
        } else { bgImg = null; resolve(); }
      });
    } else {
      bgImg = null; // Magna n'utilise pas bgImg
    }

    // Précharger les murals des personnages : nécessaire pour Magna aussi
    // depuis Phase 2 (les cartes Magna dessinent le char art).
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
  // Sync visuel du pill game-selector (sel.value = ... ne dispatch pas 'change')
  if (typeof gameSelectorSyncToGameSelect === 'function') gameSelectorSyncToGameSelect();
  // Sync du pill multi (mode navigation entre graphes importés)
  if (typeof gameSelectorMultiRefresh === 'function') gameSelectorMultiRefresh();

  // Mettre à jour le nom du tournoi
  const nameEl = document.getElementById('tournamentName');
  if (nameEl) nameEl.value = graph.tournamentName || '';

  // Auto-détecte le compteur Magna pour matcher cet event spécifique
  // (chaque event peut avoir un N différent — SF6 top 5 vs Smash top 8).
  if (typeof autoDetectMagnaCount === 'function') autoDetectMagnaCount();

  // Recharger le bon fond pour ce jeu (built-in bgFile OU custom bgDataUrl)
  const layout = LAYOUTS[graph.game];
  const bgSrc = layout?.bgFile || layout?._lm?.bgDataUrl || null;
  if (bgSrc) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
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

  // Resync de l'état vide : maintenant qu'on a des graphs et un canvas
  // rempli, on veut quitter le mode "no-import" (panneau droit visible,
  // carte gauche non centrée, canvas affiché à la place de l'empty state).
  if (typeof _togglePreviewEmptyState === 'function') _togglePreviewEmptyState();
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
      img.crossOrigin = 'anonymous';
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
  // Refresh du pill multi-graph en même temps : la liste graphs[] peut
  // avoir changé et l'image start.gg de certains jeux vient d'être captée.
  if (show && typeof gameSelectorMultiRefresh === 'function') {
    gameSelectorMultiRefresh();
  }
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
  if (tweetEl) tweetEl.value = `🏆 Résultats du tournoi ${name} — ${game} !\n\n${top3}\n\nMerci à toustes ! 🎮 #FGC #${tag}`;
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
        img.crossOrigin = 'anonymous';
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

  // En format Magna : on n'a pas besoin de layout per-game, Magna utilise
  // son propre rendu unifié pour tous les jeux. On masque la section
  // "Jeux sans layout" peu importe les events détectés.
  // Met à jour le compteur global + rafraîchit l'onglet "Sans layout"
  // (apparition + clignotement) du carrousel de gauche.
  const _refreshNoLayoutTab = (n) => {
    window._noLayoutCount = n;
    if (typeof _tcRenderTabs === 'function') _tcRenderTabs();
  };

  if (typeof currentFormat !== 'undefined' && currentFormat === 'magna') {
    wrap.style.cssText = 'display:none !important';
    _refreshNoLayoutTab(0);
    return;
  }

  if (!events || events.length === 0) {
    wrap.style.cssText = 'display:none !important';
    _refreshNoLayoutTab(0);
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
          <div class="tv-body">
            <div class="tv-screen tv-screen-game">
              ${imgHtml}
              <div class="tv-screen-fallback" style="${fallbackStyle}">
                <span class="tv-screen-icon">🎮</span>
                <span class="tv-screen-text">Créer layout</span>
              </div>
              <div class="tv-screen-overlay">✨ Créer</div>
            </div>
          </div>
          <div class="tv-game-label">${gameName}</div>
        </button>
      </div>
    `;
  }).join('');

  // Force visible
  wrap.removeAttribute('style');
  wrap.style.display = 'block';
  _refreshNoLayoutTab(events.length);
  console.log('[showNoLayoutSection] section shown, display:', wrap.style.display);
}
