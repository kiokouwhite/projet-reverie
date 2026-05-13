// ============================================================
// TOURNAMENT-WATCH.JS — Configuration de la détection auto
// Gère la liste des salons surveillés + mots-clés à détecter
// dans les URLs start.gg postées. Persiste localStorage et push
// la config vers le bot via /tournament-watch/config.
// ============================================================

// Clé localStorage pour la config locale
const TW_LS_KEY = 'top8_tournament_watch_config';

// État courant (lu/écrit par les fonctions ci-dessous)
let twConfig = {
  channels: [],          // Liste de Discord channel IDs surveillés
  keywords: ['Lorem', 'Magna'], // Mots-clés à détecter dans l'URL
};

// Cache des channels chargés du bot (id → { id, name, guildName })
let _twChannelsCache = [];

// ── INIT ────────────────────────────────────────────────────────────────────
function twInit() {
  twLoadConfig();
  twRenderKeywords();
  twRenderChannels();
  // Push immédiat au bot pour re-synchroniser après un éventuel redéploiement
  // Railway (la config bot est en mémoire et peut être perdue).
  twPushToBot();
  // Auto-charge la liste des salons depuis le bot — épargne le clic manuel
  // sur "Charger les salons". Best-effort : si le bot n'est pas configuré
  // ou ne répond pas, on garde le placeholder.
  twAutoLoadChannelsIfPossible();
  // Liste des tournois actuellement enregistrés (en attente de fin)
  twLoadRegistered();
}

// Auto-charge les channels si le bot est configuré. Silencieux : pas
// d'erreur visible si le bot n'est pas dispo (l'user peut cliquer le
// bouton manuel comme fallback).
async function twAutoLoadChannelsIfPossible() {
  // Skip si déjà chargé (ex. user retourne sur l'onglet Configuration après
  // avoir navigué ailleurs — pas la peine de re-fetch à chaque visite).
  if (_twChannelsCache.length) return;
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  if (!botUrl || !secret) return; // pas de bot config, on ne fait rien
  try {
    await twLoadChannels();
  } catch (e) {
    // Silencieux : l'utilisateur peut toujours cliquer manuellement
    console.warn('[TW] Auto-load channels échoué :', e.message);
  }
}

// ── CONFIG LOCAL (localStorage) ─────────────────────────────────────────────
function twLoadConfig() {
  try {
    const raw = localStorage.getItem(TW_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        twConfig.channels = Array.isArray(parsed.channels) ? parsed.channels : [];
        twConfig.keywords = Array.isArray(parsed.keywords) && parsed.keywords.length
          ? parsed.keywords : ['Lorem', 'Magna'];
      }
    }
  } catch (e) {
    console.warn('[TW] Config corrompue, reset :', e.message);
    twConfig = { channels: [], keywords: ['Lorem', 'Magna'] };
  }
}

// Sauvegarde la config courante (lue depuis les inputs) + push au bot
function twSaveConfig() {
  // Lire les keywords depuis l'input texte (csv)
  const kwInput = document.getElementById('cfgTwKeywords');
  if (kwInput) {
    twConfig.keywords = kwInput.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!twConfig.keywords.length) twConfig.keywords = ['Lorem', 'Magna'];
  }
  // Lire les channels cochés
  const checked = Array.from(
    document.querySelectorAll('#cfgTwChannelsList input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  twConfig.channels = checked;

  // Persister local
  try { localStorage.setItem(TW_LS_KEY, JSON.stringify(twConfig)); } catch {}

  // Push au bot (best-effort, n'affiche d'erreur que si on a un bot configuré)
  twPushToBot();
}

// Affiche le statut (success/error/info) dans le bloc du card
function _twStatus(type, msg) {
  const el = document.getElementById('cfgTwStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cfg-status cfg-status-' + type;
  el.style.display = 'block';
  clearTimeout(_twStatus._timer);
  _twStatus._timer = setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ── RENDU UI ────────────────────────────────────────────────────────────────
function twRenderKeywords() {
  const input = document.getElementById('cfgTwKeywords');
  if (input) input.value = twConfig.keywords.join(', ');
}

function twRenderChannels() {
  const list = document.getElementById('cfgTwChannelsList');
  if (!list) return;
  if (!_twChannelsCache.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-soft);font-style:italic;">Clique sur « Charger les salons » pour récupérer la liste.</div>';
    return;
  }
  // Grouper par guildName pour une meilleure lisibilité
  const byGuild = new Map();
  _twChannelsCache.forEach(ch => {
    const g = ch.guildName || 'Serveur';
    if (!byGuild.has(g)) byGuild.set(g, []);
    byGuild.get(g).push(ch);
  });
  const html = [];
  byGuild.forEach((channels, guildName) => {
    html.push(`<div style="font-size:11px;font-weight:700;color:var(--text-soft);margin:6px 0 2px;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(guildName)}</div>`);
    channels.forEach(ch => {
      const checked = twConfig.channels.includes(ch.id) ? 'checked' : '';
      html.push(`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:3px 4px;border-radius:4px;">
        <input type="checkbox" value="${escapeHtml(ch.id)}" ${checked} onchange="twSaveConfig()">
        <span>#${escapeHtml(ch.name)}</span>
      </label>`);
    });
  });
  list.innerHTML = html.join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ── CHARGER LES SALONS DEPUIS LE BOT ────────────────────────────────────────
async function twLoadChannels() {
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  if (!botUrl || !secret) {
    _twStatus('error', '❌ Configure d\'abord URL bot + secret ci-dessus.');
    return;
  }
  _twStatus('loading', '⏳ Chargement des salons…');
  try {
    const res = await fetch(`${botUrl}/channels`, { headers: { 'x-secret': secret } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Réponse invalide');
    _twChannelsCache = Array.isArray(data.channels) ? data.channels : [];
    twRenderChannels();
    _twStatus('ok', `✅ ${_twChannelsCache.length} salon(s) chargé(s)`);
  } catch (e) {
    console.error('[TW] loadChannels error :', e);
    _twStatus('error', `❌ Erreur : ${e.message}`);
  }
}

// ── TOURNOIS ENREGISTRÉS ────────────────────────────────────────────────────
// Fetch la liste depuis le bot et l'affiche dans la card Configuration.
async function twLoadRegistered() {
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  const wrap = document.getElementById('cfgTwRegisteredList');
  if (!wrap) return;
  if (!botUrl || !secret) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text-soft);font-style:italic;">Configure le bot pour voir la liste.</div>';
    return;
  }
  try {
    const res = await fetch(`${botUrl}/tournament-watch/config`, { headers: { 'x-secret': secret } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Réponse invalide');
    twRenderRegistered(Array.isArray(data.registered) ? data.registered : []);
  } catch (e) {
    console.warn('[TW] loadRegistered error :', e.message);
    wrap.innerHTML = `<div style="font-size:12px;color:#c83b78;">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function twRenderRegistered(list) {
  const wrap = document.getElementById('cfgTwRegisteredList');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text-soft);font-style:italic;">Aucun tournoi enregistré pour l\'instant.</div>';
    return;
  }
  // Trier par endAt ascendant (les plus proches de la fin en premier)
  list.sort((a, b) => (a.endAt || Infinity) - (b.endAt || Infinity));
  wrap.innerHTML = list.map(t => {
    const slug = t.slug || '';
    const name = t.tournamentName || slug;
    const dateStr = t.endAt
      ? new Date(t.endAt * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      : '<span style="color:#c83b78;">endAt inconnu</span>';
    const remaining = t.endAt ? _twRelativeTimeFr(t.endAt * 1000 - Date.now()) : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;background:rgba(155,127,184,0.06);border:1px solid rgba(155,127,184,0.15);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</div>
        <div style="font-size:11px;color:var(--text-soft);font-family:ui-monospace,Menlo,monospace;">${escapeHtml(slug)}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px;">Fin : ${dateStr}${remaining ? ' · ' + remaining : ''}</div>
      </div>
      <button type="button" onclick="twRemoveRegistered('${escapeHtml(slug).replace(/'/g, "\\'")}')"
              title="Désinscrire ce tournoi"
              style="background:transparent;border:1px solid rgba(200,59,120,0.35);color:#c83b78;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;flex-shrink:0;">✕</button>
    </div>`;
  }).join('');
}

// Format relatif type "dans 3h", "il y a 2j"
function _twRelativeTimeFr(ms) {
  const abs = Math.abs(ms);
  const sign = ms >= 0 ? 'dans ' : 'il y a ';
  if (abs < 60_000) return sign + 'moins d\'une minute';
  if (abs < 3_600_000) return sign + Math.round(abs / 60_000) + ' min';
  if (abs < 86_400_000) return sign + Math.round(abs / 3_600_000) + ' h';
  return sign + Math.round(abs / 86_400_000) + ' j';
}

async function twRemoveRegistered(slug) {
  if (!confirm(`Désinscrire le tournoi "${slug}" ?`)) return;
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  if (!botUrl || !secret) return;
  try {
    const res = await fetch(`${botUrl}/tournament-watch/registered/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'x-secret': secret },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    twLoadRegistered(); // refresh
    _twStatus('ok', `✅ Tournoi désinscrit : ${slug}`);
  } catch (e) {
    _twStatus('error', `❌ Erreur : ${e.message}`);
  }
}

// ── PUSH VERS LE BOT ────────────────────────────────────────────────────────
async function twPushToBot() {
  const botUrl = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '').trim().replace(/\/+$/, '');
  const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
  if (!botUrl || !secret) return; // bot pas configuré, on ne fait rien
  // Inclut la clé start.gg : nécessaire au bot pour fetch endAt d'un
  // tournoi enregistré et programmer le post de fin d'event.
  const startggKey = (localStorage.getItem('top8_startgg_key') || '').trim();
  const payload = { ...twConfig, startggKey };
  try {
    const res = await fetch(`${botUrl}/tournament-watch/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[TW] Push config échec :', res.status, text);
    }
  } catch (e) {
    // Best-effort : pas d'erreur visible (le bot est peut-être down)
    console.warn('[TW] Push config error :', e.message);
  }
}
