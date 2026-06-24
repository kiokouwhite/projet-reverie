// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// Reçoit les annonces depuis l'app web et les poste sur Discord
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');     // requis EN HAUT : utilisé dès la config persistance
const path    = require('path');   // (sinon ReferenceError "Cannot access 'path' before initialization")
const {
  Client, GatewayIntentBits, EmbedBuilder, Partials, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const app    = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    // MessageContent est privilégié — à activer dans le Developer Portal.
    // Sans ça, on ne reçoit pas les attachments des messages non-mentionnés.
    GatewayIntentBits.MessageContent,
  ],
  // Partials nécessaires pour réagir aux réactions sur d'anciens messages
  // qui ne sont pas dans le cache au démarrage du bot.
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());               // Autorise les appels depuis ton app web
// 12MB par défaut pour absorber les snapshots PNG du planning Horaires. La
// route /backup (sauvegarde complète localStorage + images IndexedDB) peut être
// bien plus lourde → limite relevée à 64MB uniquement pour elle.
app.use((req, res, next) => {
  const limit = req.path === '/backup' ? '64mb' : '12mb';
  express.json({ limit })(req, res, next);
});

// ── RELAY DES TWEETS X VERS DISCORD (poller RSS) ─────────────────────────────
// On poll un flux RSS représentant un compte X (RSSHub par défaut, ou rss.app
// en payant). Variables d'env :
//   TWEETS_RSS_URL       — URL complète du flux RSS (ex: https://rsshub.app/twitter/user/projet_reverie)
//   TWEETS_CHANNEL_ID    — canal Discord où poster les nouveaux tweets
//   TWEETS_POLL_MINUTES  — intervalle de polling (défaut 15)
const TWEETS_POLL_MS = (parseInt(process.env.TWEETS_POLL_MINUTES) || 15) * 60_000;
let tweetsLastSeen = new Set();   // guids déjà vus
let tweetsState = {
  lastPollAt: null, lastError: null, lastFoundCount: 0, postedSinceStart: 0,
};

// Mini-parseur RSS (pas de dep, suffit pour les flux courants — RSSHub, rss.app)
function rssParse(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*?>([\\s\\S]*?)<\\/${tag}>`);
      const x = block.match(r);
      if (!x) return '';
      return x[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    };
    items.push({
      title:       get('title'),
      link:        get('link'),
      description: get('description'),
      pubDate:     get('pubDate'),
      guid:        get('guid') || get('link'),
    });
  }
  return items;
}

// vxtwitter.com fait des embeds Discord propres (X bloque l'embed officiel)
function rewriteTweetUrl(url) {
  return (url || '')
    .replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//, 'https://vxtwitter.com/');
}

async function pollTweets() {
  const url = process.env.TWEETS_RSS_URL;
  const channelId = process.env.TWEETS_CHANNEL_ID;
  if (!url || !channelId) return;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'projet-reverie-bot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = rssParse(xml);
    tweetsState.lastPollAt = Date.now();
    tweetsState.lastFoundCount = items.length;
    tweetsState.lastError = null;

    // Premier poll : tout marquer comme vu sans poster (sinon on spam le canal)
    const firstRun = tweetsLastSeen.size === 0;
    if (firstRun) {
      items.forEach(it => tweetsLastSeen.add(it.guid));
      console.log(`🐦 Premier poll : ${items.length} tweet(s) marqués comme déjà vus`);
      return;
    }

    // Poster les nouveaux du plus ancien au plus récent (les flux RSS sont
    // généralement triés du plus récent au plus ancien)
    const newOnes = items.filter(it => !tweetsLastSeen.has(it.guid)).reverse();
    if (!newOnes.length) return;

    // Garde-fou anti-spam : si on détecte d'un coup plus de N "nouveaux"
    // tweets, c'est presque certainement un changement d'URL, un reset, ou
    // un cache miss côté RSSHub — pas une vraie volée de tweets. On
    // resilience-mark sans poster pour éviter de saturer le canal.
    const SPAM_THRESHOLD = 3;
    if (newOnes.length > SPAM_THRESHOLD) {
      newOnes.forEach(it => tweetsLastSeen.add(it.guid));
      console.warn(`⚠️ ${newOnes.length} "nouveaux" tweets détectés en une passe (> ${SPAM_THRESHOLD}) — marqués comme vus sans poster (probable changement de baseline)`);
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      console.warn('TWEETS_CHANNEL_ID introuvable ou non textuel :', channelId);
      return;
    }

    for (const it of newOnes) {
      try {
        const link = rewriteTweetUrl(it.link);
        await channel.send(link || it.title || '(tweet sans lien)');
        tweetsLastSeen.add(it.guid);
        tweetsState.postedSinceStart++;
        // Petit délai pour éviter le rate limit Discord
        await new Promise(r => setTimeout(r, 800));
      } catch(e) {
        console.warn('post tweet :', e.message);
      }
    }
    console.log(`🐦 ${newOnes.length} nouveau(x) tweet(s) posté(s) dans #${channel.name}`);
  } catch(e) {
    tweetsState.lastError = e.message;
    console.warn('pollTweets :', e.message);
  }
}

// ── CONNEXION DISCORD ─────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  // Restaurer les tournois enregistrés (et re-armer leurs timers fin-de-tournoi)
  twRestoreRegistered();
  // Enregistrer les slash commands dans tous les serveurs du bot (instant)
  try {
    const guilds = await client.guilds.fetch();
    const commandDefs = [
      {
        name: 'faketest',
        description: 'Simule le post de fin pour un tournoi enregistré (sans le supprimer)',
        options: [{
          name: 'slug',
          description: 'Slug du tournoi start.gg (ex: lorem-ipsum-page-80)',
          type: 3, // STRING
          required: true,
        }],
      },
    ];
    for (const [, partial] of guilds) {
      try {
        const guild = await partial.fetch();
        await guild.commands.set(commandDefs);
      } catch (e) {
        console.warn(`Slash commands register échec pour guild ${partial?.id} :`, e.message);
      }
    }
    console.log(`✅ Slash commands enregistrés dans ${guilds.size} serveur(s) : /faketest`);
  } catch (e) {
    console.warn('Slash commands register échec global :', e.message);
  }
  // Démarrer le polling des tweets si configuré
  if (process.env.TWEETS_RSS_URL && process.env.TWEETS_CHANNEL_ID) {
    console.log(`🐦 Poller tweets actif (toutes les ${TWEETS_POLL_MS / 60_000} min)`);
    pollTweets(); // premier poll immédiat (silencieux pour marquer le baseline)
    setInterval(pollTweets, TWEETS_POLL_MS);
  } else {
    console.log('🐦 Poller tweets désactivé (TWEETS_RSS_URL ou TWEETS_CHANNEL_ID manquant)');
  }
});

// ── LISTENER DÉTECTION DE TOURNOIS START.GG ─────────────────────────────────
// Écoute tous les messages des channels surveillés (tournamentWatchConfig).
// Si un lien start.gg est trouvé et que son slug contient un keyword, le bot
// reply avec un embed proposant 2 boutons : "Enregistrer" / "Ignorer".
// L'enregistrement est traité par le handler interactionCreate ci-dessous.
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author?.bot || !msg.guild) return;
    const cfg = tournamentWatchConfig;
    // Log pour debug : tout message dans un channel surveillé
    const isWatched = cfg.channels && cfg.channels.includes(msg.channelId);
    if (isWatched) {
      console.log(`🎯 [TW] Message dans #${msg.channel?.name} (surveillé). Content="${(msg.content||'').slice(0,120)}"`);
    }
    if (!cfg.channels || !cfg.channels.length || !cfg.channels.includes(msg.channelId)) return;
    if (!cfg.keywords || !cfg.keywords.length) {
      console.log('🎯 [TW] Channel surveillé mais aucun keyword configuré — skip');
      return;
    }

    const urlMatch = msg.content.match(/https?:\/\/(?:www\.)?start\.gg\/tournament\/([^\s/?#]+)/i);
    if (!urlMatch) {
      console.log('🎯 [TW] Pas d\'URL start.gg dans le message');
      return;
    }
    const slug = urlMatch[1];
    const slugLower = slug.toLowerCase();
    const matchedKw = cfg.keywords.find(kw => slugLower.includes(String(kw).toLowerCase()));
    if (!matchedKw) {
      console.log(`🎯 [TW] URL start.gg détectée (slug="${slug}") mais aucun keyword matche [${cfg.keywords.join(', ')}]`);
      return;
    }

    if (tournamentRegistered.has(slug)) {
      console.log(`🎯 [TW] Tournoi "${slug}" déjà enregistré — skip popup`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎯 Tournoi détecté')
      .setDescription(
        `Mot-clé **${matchedKw}** repéré dans :\n` +
        `[\`${slug}\`](https://start.gg/tournament/${slug})\n\n` +
        `Veux-tu enregistrer ce tournoi ? À la fin de l'event, je posterai automatiquement un lien pour générer le Top 8 dans ce salon.`
      )
      .setColor(0xd80018)
      .setURL(`https://start.gg/tournament/${slug}`)
      .setTimestamp(new Date());
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`twreg:${slug}`).setLabel('Enregistrer').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`twign:${slug}`).setLabel('Ignorer').setStyle(ButtonStyle.Secondary).setEmoji('❌'),
    );
    await msg.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
    console.log(`🎯 [TW] Tournoi détecté dans #${msg.channel?.name} : ${slug} (kw=${matchedKw})`);
  } catch (e) {
    console.warn('[TW] messageCreate handler error :', e.message);
  }
});

// ── HANDLER INTERACTIONS (boutons + slash commands) ─────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // ── Slash command /faketest ────────────────────────────────────────────
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
      if (interaction.commandName === 'faketest') {
        const slug = interaction.options.getString('slug', true);
        if (!tournamentRegistered.has(slug)) {
          const registeredList = [...tournamentRegistered.keys()];
          const hint = registeredList.length
            ? `\nTournois enregistrés : ${registeredList.map(s => `\`${s}\``).join(', ')}`
            : '\nAucun tournoi enregistré actuellement.';
          await interaction.reply({
            content: `❌ Aucun tournoi enregistré avec ce slug : \`${slug}\`${hint}`,
            ephemeral: true,
          });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        await twPostEndOfTournament(slug, { test: true });
        await interaction.editReply({
          content: `✅ Post de test envoyé pour \`${slug}\`. L'enregistrement reste actif et le post automatique de fin de tournoi se fera quand même.`,
        });
        return;
      }
    }

    if (!interaction.isButton()) return;
    const id = interaction.customId || '';
    if (id.startsWith('twreg:')) {
      const slug = id.slice('twreg:'.length);
      if (tournamentRegistered.has(slug)) {
        await interaction.reply({ content: '⚠️ Ce tournoi est déjà enregistré.', ephemeral: true });
        return;
      }
      // Defer le edit le temps de fetch start.gg (endAt)
      await interaction.deferUpdate();

      let endAt = null;
      let tournamentName = slug;
      try {
        const data = await twGqlFetch(
          `query($slug:String!) { tournament(slug:$slug) { name endAt } }`,
          { slug }
        );
        const t = data?.data?.tournament;
        if (t) {
          endAt = t.endAt || null;
          tournamentName = t.name || slug;
        }
      } catch (e) {
        console.warn(`🎯 [TW] Fetch start.gg échec pour "${slug}" :`, e.message);
      }

      const entry = {
        slug,
        channelId:    interaction.channelId,
        messageId:    interaction.message?.id,
        registeredBy: interaction.user?.id,
        registeredAt: Date.now(),
        endAt,
        tournamentName,
      };
      tournamentRegistered.set(slug, entry);
      twSaveRegisteredToFile();
      if (endAt) twScheduleEndPost(slug);

      const endDesc = endAt
        ? `Fin prévue : <t:${endAt}:F> (<t:${endAt}:R>)\n\nJe posterai automatiquement le lien d'import à ce moment-là.`
        : `⚠️ Impossible de récupérer la date de fin depuis start.gg — pas de post auto programmé. Tu pourras quand même importer manuellement.`;

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Tournoi enregistré')
          .setDescription(
            `**${tournamentName}** ([\`${slug}\`](https://start.gg/tournament/${slug}))\n\n` +
            endDesc
          )
          .setColor(0x46d18f)
          .setFooter({ text: `Enregistré par ${interaction.user?.username || 'un utilisateur'}` })
          .setTimestamp(new Date())
        ],
        components: [],
      });
      console.log(`✅ [TW] Tournoi enregistré : ${slug} (par ${interaction.user?.tag}, endAt=${endAt ? new Date(endAt*1000).toISOString() : 'inconnu'})`);
    } else if (id.startsWith('twign:')) {
      const slug = id.slice('twign:'.length);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Ignoré')
          .setDescription(`Pas d'enregistrement pour [\`${slug}\`](https://start.gg/tournament/${slug}).`)
          .setColor(0x808080)
        ],
        components: [],
      });
      console.log(`❌ [TW] Tournoi ignoré : ${slug} (par ${interaction.user?.tag})`);
    }
  } catch (e) {
    console.warn('[TW] interactionCreate handler error :', e.message);
  }
});

// ── GARDE-FOUS ANTI-CRASH ────────────────────────────────────────────────────
// Sans ça, la moindre promesse rejetée non gérée (route Express, event Discord,
// intervalle, fetch…) fait QUITTER le process Node (≥18) → bot HORS LIGNE. Ici on
// logue l'erreur et on CONTINUE, pour que le bot reste connecté à Discord.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
// Erreurs de la connexion Discord : on logue (discord.js se reconnecte tout seul).
client.on('error',           (err)     => console.error('[discord client error]', err));
client.on('shardError',      (err)     => console.error('[discord shard error]', err));
client.on('shardDisconnect', (ev, id)  => console.warn(`[discord] shard ${id} déconnecté (code ${ev && ev.code}) — reconnexion auto…`));
client.on('shardReconnecting', (id)    => console.warn(`[discord] shard ${id} en reconnexion…`));

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Impossible de se connecter à Discord :', err.message);
  process.exit(1);
});

// ── HELPER : vérification du secret ──────────────────────────────────────────
function checkSecret(req, res) {
  // Secret accepté en en-tête, dans le corps OU en query (?secret=). La couche
  // CORS/proxy d'Azure peut filtrer les en-têtes custom (x-secret) ; la query,
  // elle, passe toujours (c'est déjà le canal du SSE via /chat/stream).
  const secret = req.headers['x-secret'] || req.body?.secret || req.query?.secret;
  if (!secret || secret !== process.env.APP_SECRET) {
    res.status(401).json({ ok: false, error: 'Secret invalide' });
    return false;
  }
  return true;
}

// ── ROUTE : Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    ok:     true,
    status: 'Bot en ligne',
    bot:    client.user?.tag || 'Connexion en cours...',
  });
});

// ── SAUVEGARDE / RESTAURATION DES DONNÉES DE L'APP ────────────────────────────
// L'app web pousse ici un blob JSON (localStorage + images IndexedDB du coffre)
// pour survivre au changement de navigateur/PC et aux redéploiements. On stocke
// HORS de wwwroot — dans /home sur Azure (process.env.HOME) — car wwwroot est
// remplacé à chaque déploiement, alors que /home est persistant.
const PERSIST_DIR = process.env.HOME
  ? path.join(process.env.HOME, 'reverie-data')
  : path.join(__dirname, 'reverie-data');
try { fs.mkdirSync(PERSIST_DIR, { recursive: true }); } catch (_) {}
function backupFilePath(profile) {
  const safe = String(profile || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
  return path.join(PERSIST_DIR, `backup-${safe}.json`);
}

// GET /backup?profile=default → renvoie le dernier blob sauvegardé.
app.get('/backup', (req, res) => {
  if (!checkSecret(req, res)) return;
  try {
    const fp = backupFilePath(req.query.profile);
    if (!fs.existsSync(fp)) return res.json({ ok: true, empty: true });
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    res.json({ ok: true, empty: false, savedAt: data.savedAt || null, blob: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /backup → enregistre le blob. Corps : { profile?, blob }
// Écriture atomique (tmp + rename) pour ne jamais corrompre le fichier.
app.post('/backup', (req, res) => {
  if (!checkSecret(req, res)) return;
  try {
    const blob = req.body?.blob;
    if (!blob || typeof blob !== 'object') {
      return res.status(400).json({ ok: false, error: 'blob manquant ou invalide' });
    }
    blob.savedAt = new Date().toISOString();
    const fp  = backupFilePath(req.body.profile);
    const tmp = fp + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(blob));
    fs.renameSync(tmp, fp);
    res.json({ ok: true, savedAt: blob.savedAt, bytes: fs.statSync(fp).size });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DÉTECTION TOURNOIS START.GG ─────────────────────────────────────────────
// Config envoyée par l'app web depuis l'onglet Configuration :
//   { channels: [discordChannelId, ...], keywords: ['Lorem', 'Magna'] }
// Le bot écoute les messages dans ces channels et, si un lien start.gg
// est posté dont le slug contient un mot-clé, propose un embed avec 2
// boutons (Enregistrer / Ignorer). Persisté dans un JSON file local pour
// survivre aux redéploiements Railway (best-effort).
// (fs et path sont désormais requis tout en haut du fichier.)
// Migration : les anciennes versions stockaient ces fichiers dans __dirname
// (= /home/site/wwwroot/ sur Azure), qui est ÉCRASÉ à chaque déploiement →
// la config était perdue à chaque push. On les déplace désormais vers
// PERSIST_DIR (/home/reverie-data, persistant à travers les deploys). Si un
// ancien fichier existe encore dans wwwroot, on le rapatrie une fois.
function migrateFromWwwroot(filename) {
  try {
    const oldP = path.join(__dirname, filename);
    const newP = path.join(PERSIST_DIR, filename);
    if (fs.existsSync(oldP) && !fs.existsSync(newP)) {
      fs.copyFileSync(oldP, newP);
      console.log(`🔄 Migration : ${filename} déplacé vers /home (survit désormais aux deploys)`);
    }
  } catch (e) {
    console.warn(`Migration ${filename} échouée :`, e.message);
  }
}
migrateFromWwwroot('tournament-watch-config.json');
migrateFromWwwroot('tournament-watch-registered.json');
const TW_CONFIG_FILE     = path.join(PERSIST_DIR, 'tournament-watch-config.json');
const TW_REGISTERED_FILE = path.join(PERSIST_DIR, 'tournament-watch-registered.json');
let tournamentWatchConfig = { channels: [], keywords: ['Lorem', 'Magna'], startggKey: '' };
const tournamentRegistered = new Map(); // slug → { slug, channelId, registeredAt, endAt, ... }
const tournamentTimers     = new Map(); // slug → setTimeout id (pour clear si besoin)
// URL publique du générateur Top 8 — utilisée pour le deep-link import
// posté à la fin du tournoi. Ajustable via env var si besoin.
const TW_TOP8_BASE_URL = process.env.TW_TOP8_BASE_URL || 'https://kiokouwhite.github.io/projet-reverie/';

// Charge la config depuis le fichier au démarrage
try {
  if (fs.existsSync(TW_CONFIG_FILE)) {
    const raw = fs.readFileSync(TW_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.channels) && Array.isArray(parsed.keywords)) {
      tournamentWatchConfig = {
        channels: parsed.channels,
        keywords: parsed.keywords,
        startggKey: typeof parsed.startggKey === 'string' ? parsed.startggKey : '',
      };
      console.log(`🎯 [TW] Config restaurée depuis fichier : ${tournamentWatchConfig.channels.length} salon(s), keywords [${tournamentWatchConfig.keywords.join(', ')}], startgg key ${tournamentWatchConfig.startggKey ? 'présente' : 'absente'}`);
    }
  } else {
    console.log('🎯 [TW] Pas de fichier config existant — config par défaut (vide)');
  }
} catch (e) {
  console.warn('🎯 [TW] Lecture config échouée :', e.message);
}

function twSaveConfigToFile() {
  try {
    fs.writeFileSync(TW_CONFIG_FILE, JSON.stringify(tournamentWatchConfig, null, 2), 'utf8');
  } catch (e) {
    console.warn('🎯 [TW] Écriture config échouée :', e.message);
  }
}

function twSaveRegisteredToFile() {
  try {
    fs.writeFileSync(TW_REGISTERED_FILE, JSON.stringify([...tournamentRegistered.values()], null, 2), 'utf8');
  } catch (e) {
    console.warn('🎯 [TW] Écriture registered échouée :', e.message);
  }
}

// Restaure les tournois enregistrés au boot et re-arme les timers fin-de-tournoi
function twRestoreRegistered() {
  try {
    if (!fs.existsSync(TW_REGISTERED_FILE)) return;
    const raw = fs.readFileSync(TW_REGISTERED_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    arr.forEach(t => {
      if (!t || !t.slug) return;
      tournamentRegistered.set(t.slug, t);
      if (t.endAt) twScheduleEndPost(t.slug);
    });
    console.log(`🎯 [TW] ${tournamentRegistered.size} tournoi(s) restauré(s) depuis fichier`);
  } catch (e) {
    console.warn('🎯 [TW] Lecture registered échouée :', e.message);
  }
}

// ── HELPER start.gg GraphQL ─────────────────────────────────────────────────
async function twGqlFetch(query, variables) {
  const key = tournamentWatchConfig.startggKey;
  if (!key) throw new Error('Clé start.gg non configurée (pousse-la depuis l\'app web)');
  const res = await fetch('https://api.start.gg/gql/alpha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`start.gg HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e => e.message).join('; '));
  return data;
}

// ── PROGRAMME LE POST DE FIN DE TOURNOI ─────────────────────────────────────
// Lit endAt sur l'entrée et configure un setTimeout. Si endAt est dans le
// passé, poste immédiatement. Idempotent : clear l'ancien timer s'il existe.
function twScheduleEndPost(slug) {
  const t = tournamentRegistered.get(slug);
  if (!t || !t.endAt) return;
  // Clear ancien timer si déjà programmé
  if (tournamentTimers.has(slug)) {
    clearTimeout(tournamentTimers.get(slug));
    tournamentTimers.delete(slug);
  }
  const delay = (t.endAt * 1000) - Date.now();
  // setTimeout max ~24.8j ; pour les tournois plus loin on poll quand
  // la limite est atteinte. (Cas rare, planning hebdomadaire en pratique.)
  const MAX_DELAY = 24 * 24 * 60 * 60 * 1000; // 24j de sécurité
  if (delay <= 0) {
    twPostEndOfTournament(slug);
    return;
  }
  if (delay > MAX_DELAY) {
    // Re-armer plus tard
    const id = setTimeout(() => twScheduleEndPost(slug), MAX_DELAY);
    tournamentTimers.set(slug, id);
    return;
  }
  const id = setTimeout(() => twPostEndOfTournament(slug), delay);
  tournamentTimers.set(slug, id);
  const eta = new Date(t.endAt * 1000).toISOString();
  console.log(`⏰ [TW] Post fin programmé pour "${slug}" dans ${(delay/60000).toFixed(1)} min (à ${eta})`);
}

// Poste le message final dans le channel d'origine. Si test=true,
// préfixe le titre par [TEST] et NE supprime PAS l'entrée (utile pour
// la commande /faketest qui simule le post avant la vraie fin).
async function twPostEndOfTournament(slug, { test = false } = {}) {
  const t = tournamentRegistered.get(slug);
  if (!t) return;
  try {
    const channel = await client.channels.fetch(t.channelId);
    if (!channel?.isTextBased?.()) {
      console.warn(`🏆 [TW] Channel ${t.channelId} introuvable pour "${slug}"`);
    } else {
      const importUrl = `${TW_TOP8_BASE_URL.replace(/\/$/, '')}/?import=${encodeURIComponent(slug)}`;
      const titlePrefix = test ? '🧪 [TEST] ' : '';
      const embed = new EmbedBuilder()
        .setTitle(`${titlePrefix}🏆 Tournoi terminé !`)
        .setDescription(
          `**${t.tournamentName || slug}** ([\`${slug}\`](https://start.gg/tournament/${slug}))\n\n` +
          `Génère le Top 8 → [Cliquer ici pour ouvrir le générateur](${importUrl})` +
          (test ? '\n\n*⚠️ Test manuel — l\'enregistrement reste actif.*' : '')
        )
        .setColor(test ? 0x9b7fb8 : 0xf5c623)
        .setURL(importUrl)
        .setTimestamp(new Date());
      // Reply au message original si possible (sinon nouveau message)
      const replyOpts = { embeds: [embed], allowedMentions: { repliedUser: false } };
      if (t.messageId) {
        try {
          const origMsg = await channel.messages.fetch(t.messageId);
          await origMsg.reply(replyOpts);
        } catch {
          await channel.send(replyOpts);
        }
      } else {
        await channel.send(replyOpts);
      }
      console.log(`🏆 [TW] Post fin${test ? ' (TEST)' : ''} envoyé pour "${slug}" dans #${channel.name}`);
    }
  } catch (e) {
    console.error(`🏆 [TW] Erreur post fin "${slug}" :`, e.message);
  } finally {
    // Cleanup uniquement en mode normal (pas en test)
    if (!test) {
      tournamentRegistered.delete(slug);
      tournamentTimers.delete(slug);
      twSaveRegisteredToFile();
    }
  }
}

app.post('/tournament-watch/config', (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channels, keywords, startggKey } = req.body || {};
  if (!Array.isArray(channels) || !Array.isArray(keywords)) {
    return res.status(400).json({ ok: false, error: 'channels et keywords doivent être des tableaux' });
  }
  tournamentWatchConfig = {
    channels:   channels.filter(c => typeof c === 'string'),
    keywords:   keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim()),
    startggKey: typeof startggKey === 'string' ? startggKey.trim() : (tournamentWatchConfig.startggKey || ''),
  };
  twSaveConfigToFile();
  console.log(`🎯 [TW] Config mise à jour : ${tournamentWatchConfig.channels.length} salon(s), keywords: [${tournamentWatchConfig.keywords.join(', ')}], startgg key ${tournamentWatchConfig.startggKey ? 'présente' : 'absente'}`);
  res.json({ ok: true, config: { ...tournamentWatchConfig, startggKey: tournamentWatchConfig.startggKey ? '[present]' : '' } });
});

app.get('/tournament-watch/config', (req, res) => {
  if (!checkSecret(req, res)) return;
  // On ne renvoie pas la clé start.gg en clair (juste un indicateur de présence)
  const safeConfig = {
    channels: tournamentWatchConfig.channels,
    keywords: tournamentWatchConfig.keywords,
    hasStartggKey: !!tournamentWatchConfig.startggKey,
  };
  res.json({ ok: true, config: safeConfig, registered: [...tournamentRegistered.values()] });
});

// Désinscrit un tournoi enregistré (clear timer + retire de la liste + sauvegarde)
app.delete('/tournament-watch/registered/:slug', (req, res) => {
  if (!checkSecret(req, res)) return;
  const slug = req.params.slug;
  if (!tournamentRegistered.has(slug)) {
    return res.status(404).json({ ok: false, error: 'Slug inconnu' });
  }
  tournamentRegistered.delete(slug);
  if (tournamentTimers.has(slug)) {
    clearTimeout(tournamentTimers.get(slug));
    tournamentTimers.delete(slug);
  }
  twSaveRegisteredToFile();
  console.log(`🗑️ [TW] Tournoi désinscrit manuellement : ${slug}`);
  res.json({ ok: true });
});

// ── ROUTE : Poster une annonce ────────────────────────────────────────────────
// Body attendu :
//   { channelId: "123...", message?: "texte...", embeds?: [Discord embed objects] }
// Au moins un de message/embeds doit être fourni.
app.post('/post-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, message, embeds, image, imageFirst } = req.body;

  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message && !(Array.isArray(embeds) && embeds.length) && !image)
    return res.status(400).json({ ok: false, error: 'message, embeds ou image manquant' });
  if (message && message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased())
      return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    // Résolution des `:name:` shorthand → `<:name:id>` pour les Application
    // Emojis du bot (qui ne sont PAS auto-résolus par Discord côté serveur
    // contrairement à ce qui se passe quand un utilisateur tape).
    const emojiMap = await getAppEmojiMap();

    // Construit l'attachment image (optionnel) en Buffer pour AttachmentBuilder
    let imageAttachment = null;
    if (image && image.dataB64) {
      const raw = image.dataB64.startsWith('data:')
        ? image.dataB64.split(',')[1]
        : image.dataB64;
      const buf = Buffer.from(raw, 'base64');
      const name = image.name || 'planning.png';
      imageAttachment = new AttachmentBuilder(buf, { name });
    }

    // Embed payload (substitué pour les :emoji:)
    const embedPayload = (Array.isArray(embeds) && embeds.length)
      ? embeds.map(e => {
          const out = { ...e };
          if (out.title)       out.title       = substituteAppEmojis(out.title, emojiMap);
          if (out.description) out.description = substituteAppEmojis(out.description, emojiMap);
          if (out.footer?.text) out.footer = { ...out.footer, text: substituteAppEmojis(out.footer.text, emojiMap) };
          return out;
        })
      : null;
    const contentSub = message ? substituteAppEmojis(message, emojiMap) : null;

    // Mode "image au-dessus" : Discord rend les attachments APRÈS le
    // content/embed dans une même message → on splitte en 2 envois.
    //   1) message: image seule
    //   2) message: content + embed (selon ce qui est fourni)
    // Le content du 2e message peut contenir des `<@id>` qui pingueront
    // réellement les utilisateurs (les mentions dans un embed ne pingent
    // pas, donc ce mode "classique" est nécessaire pour les notifications).
    if (imageFirst && imageAttachment && (contentSub || embedPayload)) {
      const imgMsg = await channel.send({ files: [imageAttachment] });
      const second = {};
      if (contentSub)   second.content = contentSub;
      if (embedPayload) second.embeds  = embedPayload;
      const contentMsg = await channel.send(second);
      console.log(`📢 Annonce postée dans #${channel.name} (${channelId}) [image puis ${contentSub ? 'content' : ''}${contentSub && embedPayload ? '+' : ''}${embedPayload ? 'embed' : ''}]`);
      // On renvoie les IDs pour permettre une édition ultérieure du message.
      return res.json({ ok: true, channel: channel.name, messageId: contentMsg.id, imageMessageId: imgMsg.id });
    }

    // Cas standard : tout dans un seul message
    const payload = {};
    if (contentSub) payload.content = contentSub;
    if (embedPayload) payload.embeds = embedPayload;
    if (imageAttachment) payload.files = [imageAttachment];
    const sentMsg = await channel.send(payload);
    console.log(`📢 Annonce postée dans #${channel.name} (${channelId}) ${embeds ? '[embed]' : ''}${image ? ' [+image]' : ''}`);
    res.json({ ok: true, channel: channel.name, messageId: sentMsg.id, imageMessageId: imageAttachment ? sentMsg.id : null });

  } catch (e) {
    console.error('Erreur post-announce :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Éditer une annonce déjà postée ────────────────────────────────────
// Permet de corriger un message déjà envoyé (ex : planning où des gens se sont
// trompés). On fournit les IDs renvoyés par /post-announce :
//   - messageId       : le message de contenu (texte) à ré-éditer
//   - imageMessageId  : le message portant l'image (peut être le même que
//                       messageId si tout est dans un seul message)
app.post('/edit-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, messageId, message, embeds, image, imageMessageId } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!messageId && !imageMessageId) return res.status(400).json({ ok: false, error: 'messageId ou imageMessageId requis' });
  if (message && message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased())
      return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    const emojiMap = await getAppEmojiMap();
    const contentSub = (message != null) ? substituteAppEmojis(message, emojiMap) : null;
    const embedPayload = (Array.isArray(embeds) && embeds.length)
      ? embeds.map(e => {
          const out = { ...e };
          if (out.title)        out.title       = substituteAppEmojis(out.title, emojiMap);
          if (out.description)  out.description = substituteAppEmojis(out.description, emojiMap);
          if (out.footer?.text) out.footer = { ...out.footer, text: substituteAppEmojis(out.footer.text, emojiMap) };
          return out;
        })
      : null;

    // Nouvelle image (optionnelle) → remplace l'attachment existant
    let imageAttachment = null;
    if (image && image.dataB64) {
      const raw = image.dataB64.startsWith('data:') ? image.dataB64.split(',')[1] : image.dataB64;
      imageAttachment = new AttachmentBuilder(Buffer.from(raw, 'base64'), { name: image.name || 'planning.png' });
    }

    const sameMsg = messageId && imageMessageId && messageId === imageMessageId;

    if (sameMsg) {
      // Tout est dans un seul message : on édite contenu + image ensemble.
      const m = await channel.messages.fetch(messageId);
      const edit = {};
      if (contentSub != null) edit.content = contentSub;
      if (embedPayload)       edit.embeds  = embedPayload;
      if (imageAttachment)  { edit.files = [imageAttachment]; edit.attachments = []; }
      await m.edit(edit);
    } else {
      // Message de contenu (texte/embed)
      if (messageId && (contentSub != null || embedPayload)) {
        const m = await channel.messages.fetch(messageId);
        const edit = {};
        if (contentSub != null) edit.content = contentSub;
        if (embedPayload)       edit.embeds  = embedPayload;
        await m.edit(edit);
      }
      // Message image (séparé) : on remplace l'attachment
      if (imageMessageId && imageAttachment) {
        const im = await channel.messages.fetch(imageMessageId);
        await im.edit({ files: [imageAttachment], attachments: [] });
      }
    }

    console.log(`✏️  Annonce éditée dans #${channel.name} (${channelId})`);
    res.json({ ok: true, channel: channel.name });

  } catch (e) {
    console.error('Erreur edit-announce :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PLANIFICATION ─────────────────────────────────────────────────────────────
// Stockage en mémoire des messages planifiés
const scheduled = new Map(); // id → { id, channelId, message, scheduledAt, timer }
let schedCounter = 1;

// ── ROUTE : Planifier une annonce ─────────────────────────────────────────────
// Body attendu :
//   { channelId, message?, embeds?, trailing?, scheduledAt: 1700000000000 (ms) }
//   - message  : contenu du 1er post (header)
//   - embeds   : tableau d'embeds Discord (rendus avec le 1er post)
//   - trailing : contenu d'un 2e post envoyé juste après le 1er (mentions
//                qui pinguent après les embeds — cf flow Stras'Fighters)
app.post('/schedule-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, message, embeds, trailing, scheduledAt } = req.body;

  if (!channelId)   return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message && !(Array.isArray(embeds) && embeds.length))
    return res.status(400).json({ ok: false, error: 'message ou embeds manquant' });
  if (!scheduledAt) return res.status(400).json({ ok: false, error: 'scheduledAt manquant' });
  if (message && message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });
  if (trailing && trailing.length > 2000)
    return res.status(400).json({ ok: false, error: `Trailing trop long (${trailing.length}/2000 caractères)` });

  const delay = scheduledAt - Date.now();
  if (delay < 0)
    return res.status(400).json({ ok: false, error: 'La date est dans le passé' });

  const id = schedCounter++;
  const timer = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        // Résolution des emojis d'application au moment de l'envoi (et pas
        // de la planification) pour récupérer une map fraîche.
        const emojiMap = await getAppEmojiMap();
        const payload = {};
        if (message) payload.content = substituteAppEmojis(message, emojiMap);
        if (Array.isArray(embeds) && embeds.length) {
          payload.embeds = embeds.map(e => {
            const out = { ...e };
            if (out.title)        out.title       = substituteAppEmojis(out.title, emojiMap);
            if (out.description)  out.description = substituteAppEmojis(out.description, emojiMap);
            if (out.footer?.text) out.footer = { ...out.footer, text: substituteAppEmojis(out.footer.text, emojiMap) };
            return out;
          });
        }
        await channel.send(payload);
        // 2e post optionnel : trailing (closing + URL + mentions de rôle).
        // Posté APRÈS les embeds pour que les mentions pinguent.
        if (trailing) {
          await channel.send({ content: substituteAppEmojis(trailing, emojiMap) });
        }
        console.log(`📢 [PLANIFIÉ #${id}] Annonce postée dans #${channel.name}${trailing ? ' (+ trailing)' : ''}`);
      }
    } catch(e) {
      console.error(`❌ [PLANIFIÉ #${id}] Erreur :`, e.message);
    } finally {
      scheduled.delete(id);
    }
  }, delay);

  scheduled.set(id, { id, channelId, message, embeds, trailing, scheduledAt, timer });
  console.log(`🕐 Annonce #${id} planifiée dans ${Math.round(delay/1000)}s${embeds ? ' [embeds]' : ''}${trailing ? ' [+ trailing]' : ''}`);
  res.json({ ok: true, id, scheduledAt, delayMs: delay });
});

// ── ROUTE : Lister les annonces planifiées ────────────────────────────────────
app.get('/scheduled', (req, res) => {
  if (!checkSecret(req, res)) return;
  const list = Array.from(scheduled.values()).map(s => ({
    id: s.id, channelId: s.channelId, scheduledAt: s.scheduledAt,
    messagePreview: s.message.substring(0, 80) + (s.message.length > 80 ? '…' : ''),
  }));
  res.json({ ok: true, scheduled: list });
});

// ── ROUTE : Annuler une annonce planifiée ─────────────────────────────────────
app.delete('/scheduled/:id', (req, res) => {
  if (!checkSecret(req, res)) return;
  const id = parseInt(req.params.id);
  const entry = scheduled.get(id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Planification introuvable' });
  clearTimeout(entry.timer);
  scheduled.delete(id);
  res.json({ ok: true, id });
});

// ── ROUTE : Lister les emojis de l'APPLICATION (cross-server) ─────────────────
// Les Application Emojis (Discord 2024) sont liés au bot, pas à un serveur,
// et utilisables partout où le bot poste. À uploader via Developer Portal →
// ton app → onglet Emojis (jusqu'à 2000 par application).
app.get('/app-emojis', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });
  try {
    const emojis = await client.application.emojis.fetch();
    const list = emojis
      .map(e => ({
        id:       e.id,
        name:     e.name,
        url:      e.imageURL({ size: 64 }),
        animated: e.animated,
        // Code à insérer tel quel dans un message Discord
        markdown: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ok: true, emojis: list });
  } catch(e) {
    console.error('app-emojis :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Importer un Application Emoji depuis l'app ────────────────────────
// Body JSON : { name: "mon_emoji", imageBase64: "data:image/png;base64,iVBOR…" }
// Limites Discord : 256 KiB par fichier, nom 2-32 chars [a-z0-9_], max 2000 emojis.
app.post('/app-emojis', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });
  try {
    let { name, imageBase64 } = req.body || {};
    if (!name || !imageBase64) {
      return res.status(400).json({ ok: false, error: 'name et imageBase64 requis' });
    }
    // Sanitize nom : minuscules, alphanum + _, 2-32 chars
    name = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
    if (name.length < 2) return res.status(400).json({ ok: false, error: 'Nom trop court (min 2 chars)' });
    // L'API discord.js accepte une data URL ou un Buffer directement
    const emoji = await client.application.emojis.create({
      attachment: imageBase64,
      name,
    });
    res.json({
      ok: true,
      emoji: {
        id:       emoji.id,
        name:     emoji.name,
        url:      emoji.imageURL({ size: 64 }),
        animated: emoji.animated,
        markdown: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
      },
    });
  } catch(e) {
    console.error('app-emojis POST :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Lister les emojis custom du serveur ───────────────────────────────
app.get('/emojis', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });
  const guildId = process.env.GUILD_ID;
  if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID non configuré' });
  try {
    const guild = await client.guilds.fetch(guildId);
    await guild.emojis.fetch();
    const emojis = guild.emojis.cache
      .map(e => ({ id: e.id, name: e.name, url: e.imageURL() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ok: true, emojis });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Lister les rôles de TOUS les serveurs où le bot est ─────────────
// Permet à l'app web de proposer un picker de rôles cross-server pour
// @-mentioner depuis les annonces. Chaque rôle est annoté avec son serveur
// pour que l'app puisse les grouper. Filtre @everyone et les managed (bots).
app.get('/roles', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });
  try {
    const allGuilds = await client.guilds.fetch(); // OAuth2Guild collection
    const allRoles = [];
    for (const [, partial] of allGuilds) {
      try {
        const guild = await partial.fetch();
        await guild.roles.fetch();
        guild.roles.cache.forEach(r => {
          if (r.name === '@everyone' || r.managed) return;
          allRoles.push({
            id:       r.id,
            name:     r.name,
            color:    r.hexColor,
            position: r.position,
            mentionable: r.mentionable,
            guildId:  guild.id,
            guildName: guild.name,
          });
        });
      } catch(e) {
        console.warn(`roles fetch guild ${partial?.name || partial?.id} :`, e.message);
      }
    }
    // Tri : par nom de serveur, puis par position descendante
    allRoles.sort((a, b) =>
      a.guildName.localeCompare(b.guildName) || (b.position - a.position)
    );
    res.json({ ok: true, roles: allRoles });
  } catch(e) {
    console.error('roles :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Lister les salons de TOUS les serveurs où le bot est ────────────
// Permet à l'app web de choisir le channel cible (post-announce, horaires).
// Chaque salon est annoté avec {guildId, guildName} pour l'optgroup côté UI.
app.get('/channels', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot Discord en cours de connexion, réessaie dans 5 secondes' });

  try {
    const allGuilds = await client.guilds.fetch();
    const allChans = [];
    for (const [, partial] of allGuilds) {
      try {
        const guild    = await partial.fetch();
        const channels = await guild.channels.fetch();
        channels.forEach(c => {
          if (!c?.isTextBased?.() || c?.isThread?.()) return;
          allChans.push({
            id:        c.id,
            name:      c.name,
            category:  c.parent?.name || '',
            position:  c.rawPosition ?? c.position ?? 0,
            guildId:   guild.id,
            guildName: guild.name,
          });
        });
      } catch(e) {
        console.warn(`channels fetch guild ${partial?.name || partial?.id} :`, e.message);
      }
    }
    // Tri : par nom de serveur, puis catégorie, puis nom
    allChans.sort((a, b) =>
      a.guildName.localeCompare(b.guildName) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name)
    );
    res.json({ ok: true, channels: allChans });
  } catch (e) {
    console.error('channels :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── HORAIRES ─────────────────────────────────────────────────────────────────
// Stockage en mémoire
let horairesLastChannelId = '';
let horairesLastMessageIds = [];
let horairesWeeklyConfig = null;
let horairesWeeklyInterval = null;

// ── Persistance de la programmation hebdomadaire ─────────────────────────────
// Fichier stocké dans PERSIST_DIR (/home/reverie-data) → survit aux restarts
// ET aux redéploiements Azure. Avant ce fix, la config vivait en mémoire et
// disparaissait à chaque push sur bot/**.
const HORAIRES_SCHED_FILE = path.join(PERSIST_DIR, 'horaires-schedule.json');

function saveHorairesSchedule() {
  try {
    if (horairesWeeklyConfig) {
      fs.writeFileSync(HORAIRES_SCHED_FILE, JSON.stringify(horairesWeeklyConfig, null, 2), 'utf8');
    } else if (fs.existsSync(HORAIRES_SCHED_FILE)) {
      fs.unlinkSync(HORAIRES_SCHED_FILE);
    }
  } catch (e) {
    console.warn('📅 [HORAIRES] Écriture schedule échouée :', e.message);
  }
}

// (Re)crée le setInterval qui vérifie chaque minute si on doit poster.
// Utilisé par POST /horaires-schedule ET par la restauration au démarrage.
function armHorairesInterval() {
  if (horairesWeeklyInterval) { clearInterval(horairesWeeklyInterval); horairesWeeklyInterval = null; }
  if (!horairesWeeklyConfig) return;
  horairesWeeklyInterval = setInterval(async () => {
    const cfg = horairesWeeklyConfig;
    if (!cfg) return;
    const now = new Date();
    if (now.getDay() === cfg.dayOfWeek && now.getHours() === cfg.hour && now.getMinutes() === cfg.minute) {
      try {
        const ids = await postHorairesMessages(cfg.channelId, cfg.questions, !!cfg.everyone);
        horairesLastChannelId  = cfg.channelId;
        horairesLastMessageIds = ids;
        console.log(`📅 [HEBDO] Sondages postés automatiquement`);
      } catch (e) {
        console.error('Erreur schedule horaires :', e.message);
      }
    }
  }, 60000);
}

// Recharge la config depuis le disque et ré-arme le timer (appelé au boot).
function loadHorairesSchedule() {
  try {
    if (!fs.existsSync(HORAIRES_SCHED_FILE)) {
      console.log('📅 [HORAIRES] Aucune programmation hebdo enregistrée.');
      return;
    }
    const cfg = JSON.parse(fs.readFileSync(HORAIRES_SCHED_FILE, 'utf8'));
    if (!cfg || !cfg.channelId) return;
    horairesWeeklyConfig = cfg;
    armHorairesInterval();
    const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    console.log(`📅 [HORAIRES] Programmation hebdo restaurée : ${days[cfg.dayOfWeek]} à ${cfg.hour}h${String(cfg.minute).padStart(2,'0')} (salon ${cfg.channelId})`);
  } catch (e) {
    console.warn('📅 [HORAIRES] Lecture schedule échouée :', e.message);
  }
}
// Restauration au démarrage — pas besoin d'attendre Discord (le setInterval
// patientera jusqu'à la minute prévue ; à ce moment-là le client est ready).
loadHorairesSchedule();

// Couleurs des embeds par question
const EMBED_COLORS = [0x9b59b6, 0x3498db, 0xe91e8c];

// Helper : poster les 3 messages sondages avec réactions (format embed)
// Détecte si c'est un nom d'emoji custom (ex: "16h") ou un emoji Unicode (ex: "🕐")
function isCustomEmojiName(str) {
  return /^[a-zA-Z0-9_]+$/.test(str || '');
}

// Récupère la map { name → emoji } des Application Emojis du bot.
// Les Application Emojis sont utilisables dans tous les serveurs où le bot
// poste, contrairement aux emojis de guild qui sont locaux.
async function getAppEmojiMap() {
  try {
    const collection = await client.application.emojis.fetch();
    const map = new Map();
    collection.forEach(e => map.set(e.name, e));
    return map;
  } catch (e) {
    console.error('getAppEmojiMap :', e.message);
    return new Map();
  }
}

// Remplace les `:name:` shortcuts par leur markdown Discord complet
// (`<:name:id>` ou `<a:name:id>` pour les animés) en utilisant la map
// d'Application Emojis fournie. Les `<:x:id>` déjà valides sont préservés.
// Les `:name:` non reconnus sont laissés tels quels (peuvent être des
// shortcodes Unicode comme :smile: que Discord gère côté client).
function substituteAppEmojis(text, emojiMap) {
  if (!text || !emojiMap || !emojiMap.size) return text;
  // L'alternance commence par les tags complets, donc ils sont matchés
  // d'abord et passés tels quels (group 1 = nom seul → undefined ici).
  const RE = /<a?:[a-zA-Z0-9_]+:\d+>|:([a-zA-Z0-9_]+):/g;
  return text.replace(RE, (full, name) => {
    if (!name) return full; // tag complet déjà formé
    const e = emojiMap.get(name);
    if (!e) return full;
    return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
  });
}

// Résout un nom d'emoji custom : Application Emojis du bot d'abord
// (cross-server), puis fallback sur les emojis du serveur cible.
async function resolveCustomEmoji(guild, name) {
  // 1. Application Emojis (utilisables dans tous les serveurs où le bot poste)
  try {
    const appEmojis = await client.application.emojis.fetch();
    const found = appEmojis.find(e => e.name === name);
    if (found) return found;
  } catch(e) { /* ignore */ }
  // 2. Emojis du serveur cible
  return guild.emojis.cache.find(e => e.name === name) || null;
}

async function postHorairesMessages(channelId, questions, everyone = false) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Channel introuvable ou non textuel');

  const guild = channel.guild;
  await guild.emojis.fetch();

  const messageIds = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const question = questions[qi];

    // Construire la description avec les options
    let description = '';
    for (const opt of question.options) {
      if (isCustomEmojiName(opt.emoji)) {
        const emoji = await resolveCustomEmoji(guild, opt.emoji);
        if (emoji) {
          const prefix = emoji.animated ? 'a' : '';
          description += `<${prefix}:${emoji.name}:${emoji.id}> `;
        } else {
          description += `:${opt.emoji}: `;
        }
      } else {
        description += `${opt.emoji} `; // emoji Unicode direct
      }
      description += `${opt.label}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle(question.text)
      .setDescription(description.trim())
      .setColor(EMBED_COLORS[qi % EMBED_COLORS.length]);

    // @everyone : uniquement sur le 1er message (sinon on pingerait 3×).
    // allowedMentions force le ping (le bot doit avoir la permission « Mentionner
    // @everyone » dans le salon, sinon Discord l'affiche en texte sans notifier).
    const sendOpts = { embeds: [embed] };
    if (everyone && qi === 0) {
      sendOpts.content = '@everyone';
      sendOpts.allowedMentions = { parse: ['everyone'] };
    }
    const msg = await channel.send(sendOpts);
    messageIds.push(msg.id);

    // Ajouter les réactions (custom ou Unicode)
    for (const opt of question.options) {
      try {
        if (isCustomEmojiName(opt.emoji)) {
          const emoji = await resolveCustomEmoji(guild, opt.emoji);
          if (emoji) await msg.react(emoji.id);
        } else {
          await msg.react(opt.emoji);
        }
      } catch(e) {}
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return messageIds;
}

// POST /post-horaires — poster les sondages immédiatement
app.post('/post-horaires', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, questions, everyone } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!questions?.length) return res.status(400).json({ ok: false, error: 'questions manquantes' });

  try {
    const messageIds = await postHorairesMessages(channelId, questions, !!everyone);
    horairesLastChannelId  = channelId;
    horairesLastMessageIds = messageIds;
    console.log(`📅 Sondages horaires postés : ${messageIds.join(', ')}`);
    res.json({ ok: true, messageIds });
  } catch(e) {
    console.error('Erreur post-horaires :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /horaires-results — lire les réactions
app.get('/horaires-results', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const idsParam  = req.query.messageIds;
  const channelId = req.query.channelId || horairesLastChannelId;
  const messageIds = idsParam ? idsParam.split(',').filter(Boolean) : horairesLastMessageIds;

  if (!channelId)       return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!messageIds.length) return res.status(400).json({ ok: false, error: 'Aucun messageId fourni' });

  try {
    const channel = await client.channels.fetch(channelId);
    const results = [];
    const allUserIds = new Set(); // pour batch-fetch les rôles

    for (const msgId of messageIds) {
      const message = await channel.messages.fetch(msgId);
      const msgResult = { messageId: msgId, reactions: [] };

      for (const [, reaction] of message.reactions.cache) {
        const users = await reaction.users.fetch();
        const userList = users
          .filter(u => !u.bot)
          .map(u => {
            allUserIds.add(u.id);
            return { id: u.id, name: u.globalName || u.username };
          });

        msgResult.reactions.push({
          emoji: reaction.emoji.name,
          count: userList.length,
          users: userList,
        });
      }

      results.push(msgResult);
    }

    // Récupère les rôles des votants pour annoter TO FG / TO Smash
    const TO_FG_ID    = process.env.TO_FG_ROLE_ID || '';
    const TO_SMASH_ID = process.env.TO_SMASH_ROLE_ID || '';
    const memberRoles = new Map(); // userId → { toFG, toSmash }
    if ((TO_FG_ID || TO_SMASH_ID) && allUserIds.size > 0 && channel.guild) {
      await Promise.all([...allUserIds].map(async (uid) => {
        try {
          const member = await channel.guild.members.fetch(uid);
          memberRoles.set(uid, {
            toFG:    !!TO_FG_ID    && member.roles.cache.has(TO_FG_ID),
            toSmash: !!TO_SMASH_ID && member.roles.cache.has(TO_SMASH_ID),
          });
        } catch(e) { /* membre parti, ignoré */ }
      }));
      // Annoter chaque user des résultats
      results.forEach(r => r.reactions.forEach(react => react.users.forEach(u => {
        const roles = memberRoles.get(u.id);
        if (roles) Object.assign(u, roles);
      })));
    }

    res.json({ ok: true, results, rolesEnabled: !!(TO_FG_ID || TO_SMASH_ID) });
  } catch(e) {
    console.error('Erreur horaires-results :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /horaires-latest — retrouver le dernier batch de sondages dans le salon.
// Scanne les messages récents et renvoie les `count` derniers messages-embed
// postés par le bot (= les sondages), en ordre chronologique. Permet de charger
// AUTOMATIQUEMENT les résultats les plus récents même si les sondages ont été
// postés par le scheduler hebdo (et non depuis l'app dans la session courante).
app.get('/horaires-latest', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });

  const channelId = req.query.channelId || horairesLastChannelId;
  const count = Math.max(1, Math.min(10, parseInt(req.query.count, 10) || 3));
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    // Récupère les ~50 derniers messages, garde ceux du bot avec embed (sondages)
    const fetched = await channel.messages.fetch({ limit: 50 });
    const polls = [...fetched.values()]
      .filter(m => m.author?.id === client.user.id && m.embeds.length > 0)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp); // plus récent d'abord

    if (!polls.length) return res.json({ ok: true, messageIds: [], channel: channel.name });

    // Les `count` plus récents, remis en ordre chronologique (Q1, Q2, Q3…)
    const latest = polls.slice(0, count).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    res.json({ ok: true, messageIds: latest.map(m => m.id), channel: channel.name });
  } catch(e) {
    console.error('Erreur horaires-latest :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /horaires-schedule — activer l'envoi hebdomadaire
app.post('/horaires-schedule', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, questions, dayOfWeek, hour, minute, everyone } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });

  horairesWeeklyConfig = { channelId, questions, dayOfWeek, hour, minute, everyone: !!everyone };
  armHorairesInterval();         // (re)arme le timer (annule l'ancien si besoin)
  saveHorairesSchedule();        // persiste sur disque → survit au prochain restart/deploy

  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  console.log(`🗓️ Sondages programmés chaque ${days[dayOfWeek]} à ${hour}h${String(minute).padStart(2,'0')}`);
  res.json({ ok: true, dayOfWeek, hour, minute });
});

// DELETE /horaires-schedule — désactiver l'envoi hebdomadaire
app.delete('/horaires-schedule', (req, res) => {
  if (!checkSecret(req, res)) return;
  if (horairesWeeklyInterval) clearInterval(horairesWeeklyInterval);
  horairesWeeklyInterval = null;
  horairesWeeklyConfig   = null;
  saveHorairesSchedule();        // supprime le fichier → reste désactivé après restart
  res.json({ ok: true });
});

// ── PHOTOS DEPUIS UN CANAL DISCORD ────────────────────────────────────────────
// L'app web appelle GET /channel-images?channelId=X&limit=N pour récupérer
// les images des N derniers messages d'un canal. Pas de système de queue —
// l'utilisateur sélectionne directement dans l'app.

function isImageAttachment(att) {
  if (!att) return false;
  if (att.contentType && att.contentType.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(att.name || att.filename || '');
}

// ── ROUTE : Lire les images des derniers messages d'un canal ──────────────────
// Query : ?channelId=... (optionnel, défaut PHOTO_CHANNEL_ID env) &limit=N (défaut 30, max 100)
app.get('/channel-images', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const channelId = req.query.channelId || process.env.PHOTO_CHANNEL_ID;
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant et PHOTO_CHANNEL_ID non configuré' });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    const messages = await channel.messages.fetch({ limit });
    const photos = [];
    messages.forEach(msg => {
      if (msg.author?.bot) return;
      msg.attachments.forEach(att => {
        if (!isImageAttachment(att)) return;
        photos.push({
          id:          att.id,
          messageId:   msg.id,
          channelId:   msg.channelId,
          url:         att.url,
          author:      msg.author?.globalName || msg.author?.username || '',
          postedAt:    msg.createdTimestamp,
          filename:    att.name || att.filename || `photo_${att.id}.png`,
          contentType: att.contentType || 'image/png',
        });
      });
    });
    // Tri du plus récent au plus ancien
    photos.sort((a, b) => b.postedAt - a.postedAt);
    res.json({ ok: true, photos });
  } catch(e) {
    console.error('channel-images :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTES TWEETS ─────────────────────────────────────────────────────────────
app.get('/tweets-status', (req, res) => {
  if (!checkSecret(req, res)) return;
  res.json({
    ok: true,
    configured: !!(process.env.TWEETS_RSS_URL && process.env.TWEETS_CHANNEL_ID),
    rssUrl: process.env.TWEETS_RSS_URL ? '***configured***' : null,
    channelId: process.env.TWEETS_CHANNEL_ID || null,
    pollMinutes: TWEETS_POLL_MS / 60_000,
    lastPollAt: tweetsState.lastPollAt,
    lastError: tweetsState.lastError,
    lastFoundCount: tweetsState.lastFoundCount,
    postedSinceStart: tweetsState.postedSinceStart,
    seenCount: tweetsLastSeen.size,
  });
});

app.post('/tweets-poll', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!process.env.TWEETS_RSS_URL || !process.env.TWEETS_CHANNEL_ID) {
    return res.status(400).json({ ok: false, error: 'TWEETS_RSS_URL ou TWEETS_CHANNEL_ID manquant' });
  }
  await pollTweets();
  res.json({ ok: true, state: tweetsState });
});

// Reset du baseline : utile pour re-tester (les tweets actuels redeviendront "neufs")
app.post('/tweets-reset', (req, res) => {
  if (!checkSecret(req, res)) return;
  tweetsLastSeen.clear();
  res.json({ ok: true });
});

// ── CHAT TEXTUEL (start.gg Deluxe) ──────────────────────────────────────────
// Petit chat en SSE pour les TO d'un tournoi. Stockage en RAM (ring buffer),
// pas de salons : un seul fil partagé. Authentification via le secret partagé
// déjà utilisé pour les autres endpoints.
const CHAT_MAX = 500;
const _chatMessages = [];        // [{ id, pseudo, text, ts }]
const _chatClients  = new Set(); // res objects connectés en SSE

function chatBroadcast(event, payload) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of _chatClients) {
    try { res.write(chunk); } catch (e) { /* client mort, sera nettoyé via 'close' */ }
  }
}

// SSE : flux temps réel. EventSource ne sait pas envoyer de headers custom,
// donc on accepte le secret en query string.
app.get('/chat/stream', (req, res) => {
  const secret = req.query.secret;
  if (!secret || secret !== process.env.APP_SECRET) {
    res.status(401).end();
    return;
  }
  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no', // utile derrière nginx/Railway
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  _chatClients.add(res);

  // Heartbeat pour empêcher les proxies de couper la connexion inactive
  const hb = setInterval(() => {
    try { res.write(`: hb\n\n`); } catch (e) {}
  }, 25000);
  req.on('close', () => {
    clearInterval(hb);
    _chatClients.delete(res);
  });
});

app.post('/chat/send', (req, res) => {
  if (!checkSecret(req, res)) return;
  const pseudo = String(req.body?.pseudo || '').trim().slice(0, 40);
  const text   = String(req.body?.text   || '').trim().slice(0, 1000);
  if (!pseudo || !text) {
    res.status(400).json({ ok: false, error: 'pseudo et text requis' });
    return;
  }
  const msg = {
    id:     Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    pseudo, text,
    ts:     Date.now(),
  };
  _chatMessages.push(msg);
  if (_chatMessages.length > CHAT_MAX) _chatMessages.shift();
  chatBroadcast('message', msg);
  res.json({ ok: true, message: msg });
});

app.get('/chat/history', (req, res) => {
  if (!checkSecret(req, res)) return;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, CHAT_MAX);
  res.json({ ok: true, messages: _chatMessages.slice(-limit) });
});

// ── PARTAGE INSTAGRAM (QR code → téléphone) ─────────────────────────────────
// L'app web upload un PNG + texte → on retourne une URL avec token court.
// L'utilisateur scanne le QR code généré côté app → le téléphone ouvre une
// page HTML mobile-friendly avec navigator.share() pour pousser dans
// Instagram via la feuille de partage native iOS/Android.
const _instaShares = new Map(); // token → { png:Buffer, text, filename, createdAt }
const INSTA_SHARE_TTL = 30 * 60 * 1000; // 30 minutes
// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [token, share] of _instaShares) {
    if (now - share.createdAt > INSTA_SHARE_TTL) _instaShares.delete(token);
  }
}, 5 * 60 * 1000);

function instaRandomToken() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

app.post('/insta-share/upload', (req, res) => {
  if (!checkSecret(req, res)) return;
  const pngBase64 = String(req.body?.pngBase64 || '');
  const text      = String(req.body?.text     || '');
  const filename  = String(req.body?.filename || 'top8.png');
  if (!pngBase64) {
    res.status(400).json({ ok: false, error: 'pngBase64 requis' });
    return;
  }
  let png;
  try {
    png = Buffer.from(pngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
  } catch (e) {
    res.status(400).json({ ok: false, error: 'PNG invalide' });
    return;
  }
  const token = instaRandomToken();
  _instaShares.set(token, { png, text, filename, createdAt: Date.now() });
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, token, url: `${base}/insta-share/${token}` });
});

// Page mobile : visualisation + bouton Partager (Web Share API → Instagram)
app.get('/insta-share/:token', (req, res) => {
  const share = _instaShares.get(req.params.token);
  if (!share) {
    res.status(404).type('html').send(`
      <!doctype html><meta charset="utf-8"><title>Lien expiré</title>
      <style>body{font-family:system-ui;padding:40px;text-align:center;color:#333;}</style>
      <h2>⏱️ Lien expiré ou introuvable</h2>
      <p>Les partages ne sont conservés que 30 minutes. Retourne sur l'app pour générer un nouveau QR code.</p>
    `);
    return;
  }
  const imgUrl = `/insta-share/${req.params.token}/image`;
  const escapedText = share.text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Partager sur Instagram</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       background:linear-gradient(135deg,#fdf4ff 0%,#fff5e6 100%);min-height:100vh;color:#222;}
  h1{font-size:18px;margin:0 0 16px 0;text-align:center;}
  .card{background:#fff;border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,0.08);
        max-width:480px;margin:0 auto 16px auto;}
  .img-wrap{display:flex;justify-content:center;background:#f6f3f0;border-radius:12px;overflow:hidden;}
  .img-wrap img{max-width:100%;height:auto;display:block;}
  .text-area{width:100%;min-height:120px;margin-top:12px;padding:10px 12px;border-radius:10px;
             border:1px solid #ddd;font-family:inherit;font-size:14px;resize:vertical;background:#fafafa;}
  .actions{display:flex;flex-direction:column;gap:10px;margin-top:16px;}
  .btn{display:block;width:100%;padding:14px 18px;border:none;border-radius:999px;
       font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center;
       transition:transform 0.1s,filter 0.15s;}
  .btn:active{transform:scale(0.97);}
  .btn-primary{background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;}
  .btn-secondary{background:#f0f0f0;color:#222;}
  .btn:hover{filter:brightness(1.05);}
  .hint{font-size:12px;color:#666;text-align:center;margin-top:6px;}
  .ok{color:#2e7d32;font-weight:700;}
</style>
</head>
<body>
  <h1>📷 Partager sur Instagram</h1>
  <div class="card">
    <div class="img-wrap"><img src="${imgUrl}" alt="Top 8"></div>
    <textarea class="text-area" id="txt" readonly>${escapedText}</textarea>
    <div class="actions">
      <button class="btn btn-primary" id="shareBtn">Partager → Instagram</button>
      <button class="btn btn-secondary" id="copyBtn">📋 Copier le texte</button>
      <a class="btn btn-secondary" href="${imgUrl}" download="${share.filename}">⬇ Télécharger l'image</a>
    </div>
    <p class="hint" id="hint">Sur iPhone/Android, le bouton "Partager" ouvre la feuille de partage avec Instagram.</p>
  </div>

<script>
const shareBtn = document.getElementById('shareBtn');
const copyBtn  = document.getElementById('copyBtn');
const txt      = document.getElementById('txt');
const hint     = document.getElementById('hint');

async function doShare() {
  try {
    const r = await fetch('${imgUrl}');
    const blob = await r.blob();
    const file = new File([blob], '${share.filename}', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        text: txt.value || '',
      });
      hint.innerHTML = '<span class="ok">✅ Partage ouvert ! Choisis Instagram dans la liste.</span>';
    } else {
      hint.innerHTML = '⚠️ Ce navigateur ne supporte pas le partage natif. Télécharge l\\'image et le texte ci-dessous.';
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      hint.innerHTML = '❌ Erreur : ' + e.message;
    }
  }
}

async function doCopy() {
  try {
    txt.removeAttribute('readonly');
    txt.select();
    document.execCommand('copy');
    txt.setAttribute('readonly', '');
    if (navigator.clipboard) await navigator.clipboard.writeText(txt.value);
    hint.innerHTML = '<span class="ok">✅ Texte copié ! Colle-le dans Instagram (long-press → Coller).</span>';
  } catch (e) {
    hint.innerHTML = '❌ Copie impossible : ' + e.message;
  }
}

shareBtn.addEventListener('click', doShare);
copyBtn.addEventListener('click', doCopy);
</script>
</body>
</html>`);
});

// Binaire de l'image (référencé par la page mobile)
app.get('/insta-share/:token/image', (req, res) => {
  const share = _instaShares.get(req.params.token);
  if (!share) { res.status(404).send('Not found'); return; }
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `inline; filename="${share.filename.replace(/"/g, '')}"`);
  res.send(share.png);
});

// ── DÉMARRAGE SERVEUR ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
