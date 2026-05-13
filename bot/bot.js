// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// Reçoit les annonces depuis l'app web et les poste sur Discord
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
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
// 10MB pour absorber les snapshots PNG du planning Horaires envoyés en base64
// par l'app web (route /post-announce avec champ `image`). Discord plafonne
// les uploads à ~10MB côté bot non-boosté donc 12MB côté Express est large.
app.use(express.json({ limit: '12mb' }));

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
client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
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

// ── HANDLER BOUTONS ENREGISTRER / IGNORER ───────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    const id = interaction.customId || '';
    if (id.startsWith('twreg:')) {
      const slug = id.slice('twreg:'.length);
      if (tournamentRegistered.has(slug)) {
        await interaction.reply({ content: '⚠️ Ce tournoi est déjà enregistré.', ephemeral: true });
        return;
      }
      tournamentRegistered.set(slug, {
        slug,
        channelId:    interaction.channelId,
        messageId:    interaction.message?.id,
        registeredBy: interaction.user?.id,
        registeredAt: Date.now(),
        endAt:        null, // Phase 3 : query start.gg pour récupérer endAt
      });
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Tournoi enregistré')
          .setDescription(
            `[\`${slug}\`](https://start.gg/tournament/${slug})\n\n` +
            `Je posterai automatiquement le lien d'import dans ce salon à la fin de l'event.`
          )
          .setColor(0x46d18f)
          .setFooter({ text: `Enregistré par ${interaction.user?.username || 'un utilisateur'}` })
          .setTimestamp(new Date())
        ],
        components: [],
      });
      console.log(`✅ [TW] Tournoi enregistré : ${slug} (par ${interaction.user?.tag})`);
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

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Impossible de se connecter à Discord :', err.message);
  process.exit(1);
});

// ── HELPER : vérification du secret ──────────────────────────────────────────
function checkSecret(req, res) {
  const secret = req.headers['x-secret'] || req.body?.secret;
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

// ── DÉTECTION TOURNOIS START.GG ─────────────────────────────────────────────
// Config envoyée par l'app web depuis l'onglet Configuration :
//   { channels: [discordChannelId, ...], keywords: ['Lorem', 'Magna'] }
// Le bot écoute les messages dans ces channels et, si un lien start.gg
// est posté dont le slug contient un mot-clé, propose un embed avec 2
// boutons (Enregistrer / Ignorer). Persisté dans un JSON file local pour
// survivre aux redéploiements Railway (best-effort).
const fs = require('fs');
const path = require('path');
const TW_CONFIG_FILE = path.join(__dirname, 'tournament-watch-config.json');
let tournamentWatchConfig = { channels: [], keywords: ['Lorem', 'Magna'] };
const tournamentRegistered = new Map(); // slug → { slug, channelId, registeredAt, endAt, ... }

// Charge la config depuis le fichier au démarrage
try {
  if (fs.existsSync(TW_CONFIG_FILE)) {
    const raw = fs.readFileSync(TW_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.channels) && Array.isArray(parsed.keywords)) {
      tournamentWatchConfig = parsed;
      console.log(`🎯 [TW] Config restaurée depuis fichier : ${tournamentWatchConfig.channels.length} salon(s), keywords [${tournamentWatchConfig.keywords.join(', ')}]`);
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

app.post('/tournament-watch/config', (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channels, keywords } = req.body || {};
  if (!Array.isArray(channels) || !Array.isArray(keywords)) {
    return res.status(400).json({ ok: false, error: 'channels et keywords doivent être des tableaux' });
  }
  tournamentWatchConfig = {
    channels: channels.filter(c => typeof c === 'string'),
    keywords: keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim()),
  };
  twSaveConfigToFile();
  console.log(`🎯 [TW] Config mise à jour : ${tournamentWatchConfig.channels.length} salon(s), keywords: [${tournamentWatchConfig.keywords.join(', ')}]`);
  res.json({ ok: true, config: tournamentWatchConfig });
});

app.get('/tournament-watch/config', (req, res) => {
  if (!checkSecret(req, res)) return;
  res.json({ ok: true, config: tournamentWatchConfig, registered: [...tournamentRegistered.values()] });
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
      await channel.send({ files: [imageAttachment] });
      const second = {};
      if (contentSub)   second.content = contentSub;
      if (embedPayload) second.embeds  = embedPayload;
      await channel.send(second);
      console.log(`📢 Annonce postée dans #${channel.name} (${channelId}) [image puis ${contentSub ? 'content' : ''}${contentSub && embedPayload ? '+' : ''}${embedPayload ? 'embed' : ''}]`);
      return res.json({ ok: true, channel: channel.name });
    }

    // Cas standard : tout dans un seul message
    const payload = {};
    if (contentSub) payload.content = contentSub;
    if (embedPayload) payload.embeds = embedPayload;
    if (imageAttachment) payload.files = [imageAttachment];
    await channel.send(payload);
    console.log(`📢 Annonce postée dans #${channel.name} (${channelId}) ${embeds ? '[embed]' : ''}${image ? ' [+image]' : ''}`);
    res.json({ ok: true, channel: channel.name });

  } catch (e) {
    console.error('Erreur post-announce :', e.message);
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

async function postHorairesMessages(channelId, questions) {
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

    const msg = await channel.send({ embeds: [embed] });
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
  const { channelId, questions } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!questions?.length) return res.status(400).json({ ok: false, error: 'questions manquantes' });

  try {
    const messageIds = await postHorairesMessages(channelId, questions);
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

// POST /horaires-schedule — activer l'envoi hebdomadaire
app.post('/horaires-schedule', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, questions, dayOfWeek, hour, minute } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });

  // Annuler l'ancien schedule si existant
  if (horairesWeeklyInterval) clearInterval(horairesWeeklyInterval);

  horairesWeeklyConfig = { channelId, questions, dayOfWeek, hour, minute };

  // Vérifier chaque minute
  horairesWeeklyInterval = setInterval(async () => {
    const now = new Date();
    if (
      now.getDay()     === horairesWeeklyConfig.dayOfWeek &&
      now.getHours()   === horairesWeeklyConfig.hour &&
      now.getMinutes() === horairesWeeklyConfig.minute
    ) {
      try {
        const ids = await postHorairesMessages(
          horairesWeeklyConfig.channelId,
          horairesWeeklyConfig.questions
        );
        horairesLastChannelId  = horairesWeeklyConfig.channelId;
        horairesLastMessageIds = ids;
        console.log(`📅 [HEBDO] Sondages postés automatiquement`);
      } catch(e) {
        console.error('Erreur schedule horaires :', e.message);
      }
    }
  }, 60000);

  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  console.log(`🗓️ Sondages programmés chaque ${days[dayOfWeek]} à ${hour}h${String(minute).padStart(2,'0')}`);
  res.json({ ok: true, dayOfWeek, hour, minute });
});

// DELETE /horaires-schedule — désactiver l'envoi hebdomadaire
app.delete('/horaires-schedule', (req, res) => {
  if (!checkSecret(req, res)) return;
  if (horairesWeeklyInterval) {
    clearInterval(horairesWeeklyInterval);
    horairesWeeklyInterval = null;
    horairesWeeklyConfig   = null;
  }
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

// ── DÉMARRAGE SERVEUR ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
