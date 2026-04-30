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
