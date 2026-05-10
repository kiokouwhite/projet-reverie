// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// Reçoit les annonces depuis l'app web et les poste sur Discord
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');

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
app.use(express.json());

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

// ── ROUTE : Poster une annonce ────────────────────────────────────────────────
// Body attendu :
//   { channelId: "123...", message?: "texte...", embeds?: [Discord embed objects] }
// Au moins un de message/embeds doit être fourni.
app.post('/post-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, message, embeds } = req.body;

  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message && !(Array.isArray(embeds) && embeds.length))
    return res.status(400).json({ ok: false, error: 'message ou embeds manquant' });
  if (message && message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased())
      return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    const payload = {};
    if (message) payload.content = message;
    if (Array.isArray(embeds) && embeds.length) payload.embeds = embeds;
    await channel.send(payload);
    console.log(`📢 Annonce postée dans #${channel.name} (${channelId}) ${embeds ? '[embed]' : ''}`);
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
//   { channelId: "123...", message: "texte...", scheduledAt: 1700000000000 (ms), secret: "..." }
app.post('/schedule-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, message, scheduledAt } = req.body;

  if (!channelId)   return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message)     return res.status(400).json({ ok: false, error: 'message manquant' });
  if (!scheduledAt) return res.status(400).json({ ok: false, error: 'scheduledAt manquant' });
  if (message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });

  const delay = scheduledAt - Date.now();
  if (delay < 0)
    return res.status(400).json({ ok: false, error: 'La date est dans le passé' });

  const id = schedCounter++;
  const timer = setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        await channel.send(message);
        console.log(`📢 [PLANIFIÉ #${id}] Annonce postée dans #${channel.name}`);
      }
    } catch(e) {
      console.error(`❌ [PLANIFIÉ #${id}] Erreur :`, e.message);
    } finally {
      scheduled.delete(id);
    }
  }, delay);

  scheduled.set(id, { id, channelId, message, scheduledAt, timer });
  console.log(`🕐 Annonce #${id} planifiée dans ${Math.round(delay/1000)}s`);
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

// ── ROUTE : Lister les rôles du serveur ──────────────────────────────────────
// Permet à l'app web de proposer un picker de rôles pour @-mentioner depuis
// les annonces. Filtre les rôles "@everyone" et les rôles managed (bots).
app.get('/roles', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot en cours de connexion' });
  const guildId = process.env.GUILD_ID;
  if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID non configuré' });
  try {
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();
    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone' && !r.managed)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position, mentionable: r.mentionable }))
      .sort((a, b) => b.position - a.position); // du plus haut au plus bas
    res.json({ ok: true, roles });
  } catch(e) {
    console.error('roles :', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ROUTE : Lister les salons disponibles ─────────────────────────────────────
// Utile pour choisir le channelId depuis l'app web
app.get('/channels', async (req, res) => {
  if (!checkSecret(req, res)) return;
  if (!client.isReady()) return res.status(503).json({ ok: false, error: 'Bot Discord en cours de connexion, réessaie dans 5 secondes' });

  const guildId = process.env.GUILD_ID;
  if (!guildId) return res.status(400).json({ ok: false, error: 'GUILD_ID non configuré' });

  try {
    const guild    = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const textChans = channels
      .filter(c => c.isTextBased() && !c.isThread())
      .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, channels: textChans });
  } catch (e) {
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
