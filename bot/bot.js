// ============================================================
// BOT.JS — Bot Discord pour Projet Reverie
// Reçoit les annonces depuis l'app web et les poste sur Discord
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');

const app    = express();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

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

// ── ROUTE : Lister les salons disponibles ─────────────────────────────────────
// Utile pour choisir le channelId depuis l'app web
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

// ── DÉMARRAGE SERVEUR ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
