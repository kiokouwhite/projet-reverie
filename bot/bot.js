// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');

const app    = express();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
] });

app.use(cors());
app.use(express.json());

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Impossible de se connecter à Discord :', err.message);
  process.exit(1);
});

function checkSecret(req, res) {
  const secret = req.headers['x-secret'] || req.body?.secret;
  if (!secret || secret !== process.env.APP_SECRET) {
    res.status(401).json({ ok: false, error: 'Secret invalide' });
    return false;
  }
  return true;
}

app.get('/', (req, res) => {
  res.json({ ok: true, status: 'Bot en ligne', bot: client.user?.tag || 'Connexion en cours...' });
});

// ── Poster une annonce immédiatement ─────────────────────────
app.post('/post-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, message } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message)   return res.status(400).json({ ok: false, error: 'message manquant' });
  if (message.length > 2000) return res.status(400).json({ ok: false, error: `Message trop long (${message.length}/2000)` });
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return res.status(400).json({ ok: false, error: 'Channel introuvable ou non textuel' });
    await channel.send(message);
    console.log(`📢 Annonce postée dans #${channel.name}`);
    res.json({ ok: true, channel: channel.name });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Planification d'annonce ───────────────────────────────────
const scheduled = new Map();
let schedCounter = 1;

app.post('/schedule-announce', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, message, scheduledAt } = req.body;
  if (!channelId)   return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!message)     return res.status(400).json({ ok: false, error: 'message manquant' });
  if (!scheduledAt) return res.status(400).json({ ok: false, error: 'scheduledAt manquant' });
  if (message.length > 2000) return res.status(400).json({ ok: false, error: 'Message trop long' });
  const delay = scheduledAt - Date.now();
  if (delay < 0) return res.status(400).json({ ok: false, error: 'La date est dans le passé' });
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
    } finally { scheduled.delete(id); }
  }, delay);
  scheduled.set(id, { id, channelId, message, scheduledAt, timer });
  res.json({ ok: true, id, scheduledAt, delayMs: delay });
});

app.get('/scheduled', (req, res) => {
  if (!checkSecret(req, res)) return;
  const list = Array.from(scheduled.values()).map(s => ({
    id: s.id, channelId: s.channelId, scheduledAt: s.scheduledAt,
    messagePreview: s.message.substring(0, 80) + (s.message.length > 80 ? '…' : ''),
  }));
  res.json({ ok: true, scheduled: list });
});

app.delete('/scheduled/:id', (req, res) => {
  if (!checkSecret(req, res)) return;
  const id = parseInt(req.params.id);
  const entry = scheduled.get(id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Planification introuvable' });
  clearTimeout(entry.timer);
  scheduled.delete(id);
  res.json({ ok: true, id });
});

// ── Lister les salons ─────────────────────────────────────────
app.get('/channels', async (req, res) => {
  if (!checkSecret(req, res)) return;
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

// ── Horaires — sondages hebdomadaires ────────────────────────
let horairesLastChannelId  = '';
let horairesLastMessageIds = [];
let horairesWeeklyConfig   = null;
let horairesWeeklyInterval = null;

async function postHorairesMessages(channelId, questions) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Channel introuvable ou non textuel');
  const guild = channel.guild;
  await guild.emojis.fetch();
  const messageIds = [];
  for (const question of questions) {
    let text = `**${question.text}**\n`;
    for (const opt of question.options) {
      const emoji = guild.emojis.cache.find(e => e.name === opt.emoji);
      const emojiStr = emoji ? `<:${emoji.name}:${emoji.id}>` : `:${opt.emoji}:`;
      text += `${emojiStr} ${opt.label}\n`;
    }
    const msg = await channel.send(text);
    messageIds.push(msg.id);
    for (const opt of question.options) {
      const emoji = guild.emojis.cache.find(e => e.name === opt.emoji);
      if (emoji) {
        try { await msg.react(emoji); } catch(e) {}
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }
  return messageIds;
}

app.post('/post-horaires', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, questions } = req.body;
  if (!channelId)        return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!questions?.length) return res.status(400).json({ ok: false, error: 'questions manquantes' });
  try {
    const messageIds = await postHorairesMessages(channelId, questions);
    horairesLastChannelId  = channelId;
    horairesLastMessageIds = messageIds;
    console.log(`📅 Sondages horaires postés : ${messageIds.join(', ')}`);
    res.json({ ok: true, messageIds });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/horaires-results', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const idsParam   = req.query.messageIds;
  const channelId  = req.query.channelId || horairesLastChannelId;
  const messageIds = idsParam ? idsParam.split(',').filter(Boolean) : horairesLastMessageIds;
  if (!channelId)         return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (!messageIds.length) return res.status(400).json({ ok: false, error: 'Aucun messageId fourni' });
  try {
    const channel = await client.channels.fetch(channelId);
    const results = [];
    for (const msgId of messageIds) {
      const message   = await channel.messages.fetch(msgId);
      const msgResult = { messageId: msgId, reactions: [] };
      for (const [, reaction] of message.reactions.cache) {
        const users     = await reaction.users.fetch();
        const userNames = users.filter(u => !u.bot).map(u => u.globalName || u.username);
        msgResult.reactions.push({ emoji: reaction.emoji.name, count: userNames.length, users: userNames });
      }
      results.push(msgResult);
    }
    res.json({ ok: true, results });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/horaires-schedule', async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { channelId, questions, dayOfWeek, hour, minute } = req.body;
  if (!channelId) return res.status(400).json({ ok: false, error: 'channelId manquant' });
  if (horairesWeeklyInterval) clearInterval(horairesWeeklyInterval);
  horairesWeeklyConfig = { channelId, questions, dayOfWeek, hour, minute };
  horairesWeeklyInterval = setInterval(async () => {
    const now = new Date();
    if (now.getDay() === horairesWeeklyConfig.dayOfWeek &&
        now.getHours() === horairesWeeklyConfig.hour &&
        now.getMinutes() === horairesWeeklyConfig.minute) {
      try {
        const ids = await postHorairesMessages(horairesWeeklyConfig.channelId, horairesWeeklyConfig.questions);
        horairesLastChannelId  = horairesWeeklyConfig.channelId;
        horairesLastMessageIds = ids;
        console.log(`📅 [HEBDO] Sondages postés automatiquement`);
      } catch(e) { console.error('Erreur schedule horaires :', e.message); }
    }
  }, 60000);
  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  console.log(`🗓️ Sondages programmés chaque ${days[dayOfWeek]} à ${hour}h${String(minute).padStart(2,'0')}`);
  res.json({ ok: true, dayOfWeek, hour, minute });
});

app.delete('/horaires-schedule', (req, res) => {
  if (!checkSecret(req, res)) return;
  if (horairesWeeklyInterval) {
    clearInterval(horairesWeeklyInterval);
    horairesWeeklyInterval = null;
    horairesWeeklyConfig   = null;
  }
  res.json({ ok: true });
});

// ── Démarrage serveur ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
