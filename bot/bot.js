// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// Reçoit les annonces depuis l'app web et les poste sur Discord
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const app    = express();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
] });

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());               // Autorise les appels depuis ton app web
app.use(express.json());

// ── CONNEXION DISCORD ─────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
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
//   { channelId: "123...", message: "texte...", secret: "..." }
app.post('/post-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { channelId, message } = req.body;

  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message)   return res.status(400).json({ ok: false, error: 'message manquant' });
  if (message.length > 2000)
    return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000 caractères)` });

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased())
      return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });

    await channel.send(message);
    console.log(`📢 Annonce postée dans #${channel.name} (${channelId})`);
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
        const emoji = guild.emojis.cache.find(e => e.name === opt.emoji);
        description += emoji ? `<:${emoji.name}:${emoji.id}> ` : `:${opt.emoji}: `;
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
          const emoji = guild.emojis.cache.find(e => e.name === opt.emoji);
          if (emoji) await msg.react(emoji);
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

    for (const msgId of messageIds) {
      const message = await channel.messages.fetch(msgId);
      const msgResult = { messageId: msgId, reactions: [] };

      for (const [, reaction] of message.reactions.cache) {
        const users = await reaction.users.fetch();
        const userList = users
          .filter(u => !u.bot)
          .map(u => ({ id: u.id, name: u.globalName || u.username }));

        msgResult.reactions.push({
          emoji: reaction.emoji.name,
          count: userList.length,
          users: userList,
        });
      }

      results.push(msgResult);
    }

    res.json({ ok: true, results });
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

// ── DÉMARRAGE SERVEUR ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
