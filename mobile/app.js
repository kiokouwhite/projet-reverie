// ============================================================
// PROJET RÊVERIE — APP MOBILE (version « terrain »)
// ------------------------------------------------------------
// Chargée par la coquille Capacitor (APK Android) — ou par un navigateur
// mobile. Parle au bot Rêverie (mêmes routes que le site) :
//   /channels, /post-horaires, /horaires-latest, /horaires-results,
//   /horaires-schedule, /post-announce, /channel-images.
// Périmètre : Horaires · Annonce · Galerie Top 8 · Réglages.
// ============================================================
'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ── RÉGLAGES (stockés sur le téléphone) ──────────────────────────────────────
const S = {
  get(k, d = '') { try { const v = localStorage.getItem('rvm_' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v)      { try { localStorage.setItem('rvm_' + k, String(v)); } catch {} },
};

// ── API BOT ───────────────────────────────────────────────────────────────────
// Secret envoyé en en-tête x-secret ET en query (?secret=) : les proxys peuvent
// filtrer les en-têtes custom, la query passe toujours (cf. checkSecret du bot).
async function api(path, { method = 'GET', body = null, timeout = 30000 } = {}) {
  const base   = S.get('botUrl').trim().replace(/\/+$/, '');
  const secret = S.get('secret').trim();
  if (!base || !secret) throw new Error('Configure d’abord le bot dans ⚙️ Réglages');
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: body ? JSON.stringify({ ...body, secret }) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Réponse invalide du bot (HTTP ${res.status})`); }
    if (!data.ok) throw new Error(data.error || `Erreur bot (HTTP ${res.status})`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Délai dépassé — le bot est-il en ligne ?');
    throw e;
  } finally { clearTimeout(timer); }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind = '', ms = 3000) {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast ' + kind; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; };

// ── PRESETS DE SONDAGE (miroir du site) ───────────────────────────────────────
const PRESETS = {
  lorem: {
    name: 'Lorem Ipsum', desc: 'Complet : arrivée, départ, tâches',
    questions: [
      { text: 'A quelle heure arrivez-vous ?', options: [
        { emoji: '16h',  label: 'Installation' },
        { emoji: '17h',  label: 'Accueil partie 1' },
        { emoji: '18h',  label: 'Accueil partie 2' },
        { emoji: '19h',  label: 'Début des tournois' },
        { emoji: 'a20h', label: 'Après le début des tournois' },
      ] },
      { text: 'A quelle heure partez-vous ?', options: [
        { emoji: 'av22h', label: 'Avant le rangement' },
        { emoji: '23h',   label: 'Pendant le rangement' },
        { emoji: '0h',    label: 'A la fermeture' },
      ] },
      { text: 'Voulez-vous recevoir une tâche en priorité ?', options: [
        { emoji: 'seeding', label: 'Seeding (précisez si seul ou à plusieurs)' },
        { emoji: 'accueil', label: 'Accueil (précisez durée et nombre)' },
        { emoji: 'regie',   label: 'Régie (précisez combien de temps)' },
      ] },
    ],
  },
  magna: {
    name: 'Magna Arena', desc: 'Simplifié : installation, rangement, TO',
    questions: [
      { text: 'Sur quoi peux-tu aider ?', options: [
        { emoji: '🔧', label: 'Installation' },
        { emoji: '🧹', label: 'Rangement' },
        { emoji: '🎮', label: 'TO' },
      ] },
    ],
  },
};
const presetKey = () => (PRESETS[S.get('preset')] ? S.get('preset') : 'lorem');
const questions = () => PRESETS[presetKey()].questions;

// ── SALONS ────────────────────────────────────────────────────────────────────
let channelsCache = null;
async function loadChannels(force = false) {
  if (channelsCache && !force) return channelsCache;
  const d = await api('/channels');
  channelsCache = d.channels || [];
  return channelsCache;
}
// <select> groupé par serveur. `selected` = id pré-sélectionné.
function channelSelectHTML(id, selected, channels) {
  const byGuild = new Map();
  (channels || []).forEach(c => { if (!byGuild.has(c.guildName)) byGuild.set(c.guildName, []); byGuild.get(c.guildName).push(c); });
  let html = `<select id="${id}"><option value="">— Choisir un salon —</option>`;
  byGuild.forEach((list, guild) => {
    html += `<optgroup label="${esc(guild)}">` + list.map(c =>
      `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>#${esc(c.name)}${c.category ? ' · ' + esc(c.category) : ''}</option>`
    ).join('') + `</optgroup>`;
  });
  return html + `</select>`;
}
// Remplit un conteneur avec le select des salons (charge la liste si besoin).
async function mountChannelSelect(containerId, selectId, selected) {
  const box = $('#' + containerId);
  if (!box) return;
  box.innerHTML = `<div class="hint"><span class="spin">⏳</span> Chargement des salons…</div>`;
  try {
    const ch = await loadChannels();
    box.innerHTML = channelSelectHTML(selectId, selected, ch);
    $('#' + selectId)?.addEventListener('change', e => S.set('channelId', e.target.value));
  } catch (e) {
    box.innerHTML = `<div class="hint">❌ ${esc(e.message)}</div>`;
  }
}
const channelName = id => (channelsCache || []).find(c => c.id === id)?.name || id;

// ── PLANNING (auto-répartition depuis les votes, miroir simplifié du site) ────
function autoAssign(results) {
  const uName = u => (typeof u === 'object' ? u.name : u);
  const uObj  = u => (typeof u === 'object' ? u : { id: null, name: u });
  const all = new Map();
  (results || []).forEach(r => (r.reactions || []).forEach(re => (re.users || []).forEach(u => {
    const o = uObj(u); const ex = all.get(o.name);
    if (!ex) all.set(o.name, { id: o.id || null, name: o.name, toFG: !!o.toFG, toSmash: !!o.toSmash });
    else { ex.toFG = ex.toFG || !!o.toFG; ex.toSmash = ex.toSmash || !!o.toSmash; if (!ex.id && o.id) ex.id = o.id; }
  })));
  const get = n => all.get(n) || { id: null, name: n };
  const voters = (qi, emoji) => {
    const re = (results[qi]?.reactions || []).find(x => x.emoji === emoji);
    return [...new Set((re?.users || []).map(uName))].map(get);
  };
  const A = { install: [], rangement: [], accueil: [], regie: [], seeding: [], to: [], to_smash: [], to_fg: [] };

  if (presetKey() === 'magna') {
    // 3 premières options par position → install / rangement / to (TO = votes)
    const opts = questions()[0]?.options || [];
    ['install', 'rangement', 'to'].forEach((k, i) => { if (opts[i]) A[k] = voters(0, opts[i].emoji); });
    return A;
  }
  // Lorem Ipsum
  A.install   = voters(0, '16h');
  const rg = new Map();
  ['0h', '00h', 'minuit'].forEach(e => voters(1, e).forEach(u => rg.set(u.name, u)));
  A.rangement = [...rg.values()];
  A.seeding   = voters(2, 'seeding');
  A.regie     = voters(2, 'regie');
  A.accueil   = voters(2, 'accueil');
  A.to_smash  = [...all.values()].filter(u => u.toSmash);
  A.to_fg     = [...all.values()].filter(u => u.toFG);
  return A;
}
const mention = us => us.map(u => u.id ? `<@${u.id}>` : `@${u.name}`).join(' ');
function planMessage(A) {
  const p = [];
  if (A.install.length)   p.push(`🚀 Installation\n${mention(A.install)}`);
  if (A.accueil.length)   p.push(`🏠 Accueil\n${mention(A.accueil)}`);
  if (A.regie.length)     p.push(`💻 Régie\n${mention(A.regie)}`);
  if (A.seeding.length)   p.push(`🌱 Seeding\n${mention(A.seeding)}`);
  if (A.rangement.length) p.push(`🧹 Rangement\n${mention(A.rangement)}`);
  if (A.to.length)        p.push(`🎮 TO\n${mention(A.to)}`);
  if (A.to_smash.length)  p.push(`💥 TO Smash\n${mention(A.to_smash)}`);
  if (A.to_fg.length)     p.push(`🎮 TO FG\n${mention(A.to_fg)}`);
  return p.join('\n\n');
}
const PLAN_LABELS = { install:'🚀 Installation', accueil:'🏠 Accueil', regie:'💻 Régie', seeding:'🌱 Seeding', rangement:'🧹 Rangement', to:'🎮 TO', to_smash:'💥 TO Smash', to_fg:'🎮 TO FG' };
const chips = us => us.length ? `<div class="chips">${us.map(u => `<span class="chip">${esc(u.name)}</span>`).join('')}</div>` : `<span class="chip empty">personne</span>`;

// ── VUE : HORAIRES ────────────────────────────────────────────────────────────
let lastResults = null;
function renderHoraires() {
  const pk = presetKey();
  $('#view').innerHTML = `
    <div class="card">
      <div class="card-title">📋 Type de sondage</div>
      <div class="seg">
        ${Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}" class="${k === pk ? 'active' : ''}">${esc(p.name)}<small>${esc(p.desc)}</small></button>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">📨 Poster les sondages</div>
      <label class="field">Salon</label>
      <div id="hrChanBox"></div>
      <label class="check"><input type="checkbox" id="hrEveryone" ${S.get('everyone') === '1' ? 'checked' : ''}> 📣 Mentionner @everyone (message seul, à la fin)</label>
      <button class="btn btn-primary" id="hrPostBtn" type="button">📨 Poster les sondages maintenant</button>
    </div>

    <div class="card">
      <div class="card-title">📊 Résultats</div>
      <p class="hint">Récupère les votes des derniers sondages postés dans le salon choisi.</p>
      <button class="btn" id="hrLoadBtn" type="button">🔄 Charger les résultats</button>
      <div id="hrResults"></div>
    </div>

    <div class="card" id="hrPlanCard" hidden>
      <div class="card-title">🗂️ Planning (auto)</div>
      <div id="hrPlan"></div>
      <pre class="msg" id="hrPlanMsg"></pre>
      <div class="row">
        <button class="btn" id="hrCopyBtn" type="button">📋 Copier</button>
        <button class="btn btn-primary" id="hrPostPlanBtn" type="button">📨 Poster le planning</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔁 Envoi hebdomadaire</div>
      <div class="row">
        <select id="hrDay">
          ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'].map((d, i) => `<option value="${i}"${String(i) === S.get('day', '5') ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
        <input type="time" id="hrTime" value="${esc(S.get('time', '17:00'))}">
      </div>
      <button class="btn" id="hrWeeklyOn" type="button">🔁 Activer l’envoi hebdo</button>
      <button class="btn btn-danger" id="hrWeeklyOff" type="button">✕ Désactiver</button>
    </div>`;

  mountChannelSelect('hrChanBox', 'hrChan', S.get('channelId'));

  $$('.seg button').forEach(b => b.addEventListener('click', () => { S.set('preset', b.dataset.preset); renderHoraires(); }));
  $('#hrEveryone').addEventListener('change', e => S.set('everyone', e.target.checked ? '1' : '0'));
  $('#hrDay').addEventListener('change', e => S.set('day', e.target.value));
  $('#hrTime').addEventListener('change', e => S.set('time', e.target.value));

  // Poster
  $('#hrPostBtn').addEventListener('click', async () => {
    const channelId = $('#hrChan')?.value; if (!channelId) return toast('Choisis un salon', 'err');
    const btn = $('#hrPostBtn'); busy(btn, true, '⏳ Envoi…');
    try {
      const d = await api('/post-horaires', { method: 'POST', body: { channelId, questions: questions(), everyone: $('#hrEveryone').checked } });
      toast(`✅ ${d.messageIds?.length || questions().length} sondage(s) posté(s) !`, 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '📨 Poster les sondages maintenant'); }
  });

  // Résultats
  $('#hrLoadBtn').addEventListener('click', async () => {
    const channelId = $('#hrChan')?.value; if (!channelId) return toast('Choisis un salon', 'err');
    const btn = $('#hrLoadBtn'); busy(btn, true, '⏳ Chargement…');
    try {
      const latest = await api(`/horaires-latest?channelId=${encodeURIComponent(channelId)}&count=${questions().length}`);
      if (!latest.messageIds?.length) throw new Error('Aucun sondage trouvé dans ce salon');
      const d = await api(`/horaires-results?channelId=${encodeURIComponent(channelId)}&messageIds=${latest.messageIds.join(',')}`);
      lastResults = d.results || [];
      renderResults(lastResults);
      toast('✅ Résultats chargés', 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '🔄 Charger les résultats'); }
  });

  // Planning
  $('#hrCopyBtn').addEventListener('click', async () => {
    const t = $('#hrPlanMsg').textContent; if (!t) return;
    try { await navigator.clipboard.writeText(t); toast('✅ Copié', 'ok'); } catch { toast('❌ Copie impossible', 'err'); }
  });
  $('#hrPostPlanBtn').addEventListener('click', async () => {
    const channelId = $('#hrChan')?.value; const message = $('#hrPlanMsg').textContent.trim();
    if (!channelId) return toast('Choisis un salon', 'err');
    if (!message)   return toast('Planning vide', 'err');
    const btn = $('#hrPostPlanBtn'); busy(btn, true, '⏳ Envoi…');
    try { const d = await api('/post-announce', { method: 'POST', body: { channelId, message } }); toast(`✅ Planning posté dans #${d.channel || channelName(channelId)}`, 'ok'); }
    catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '📨 Poster le planning'); }
  });

  // Hebdo
  $('#hrWeeklyOn').addEventListener('click', async () => {
    const channelId = $('#hrChan')?.value; if (!channelId) return toast('Choisis un salon', 'err');
    const [h, m] = ($('#hrTime').value || '17:00').split(':').map(Number);
    const btn = $('#hrWeeklyOn'); busy(btn, true, '⏳…');
    try {
      await api('/horaires-schedule', { method: 'POST', body: { channelId, questions: questions(), dayOfWeek: Number($('#hrDay').value), hour: h, minute: m, everyone: $('#hrEveryone').checked } });
      toast(`✅ Envoi hebdo activé (${$('#hrDay').selectedOptions[0].textContent} ${$('#hrTime').value})`, 'ok', 4000);
    } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '🔁 Activer l’envoi hebdo'); }
  });
  $('#hrWeeklyOff').addEventListener('click', async () => {
    const btn = $('#hrWeeklyOff'); busy(btn, true, '⏳…');
    try { await api('/horaires-schedule', { method: 'DELETE' }); toast('✅ Envoi hebdo désactivé', 'ok'); }
    catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '✕ Désactiver'); }
  });

  if (lastResults) renderResults(lastResults);
}

function renderResults(results) {
  const qs = questions();
  const box = $('#hrResults'); if (!box) return;
  box.innerHTML = results.map((r, qi) => {
    const q = qs[qi]; if (!q) return '';
    return `<div class="q-block"><div class="q-title">Q${qi + 1} — ${esc(q.text)}</div>` +
      q.options.map(o => {
        const re = (r.reactions || []).find(x => x.emoji === o.emoji);
        const us = (re?.users || []).map(u => typeof u === 'object' ? u.name : u);
        return `<div class="opt"><span class="opt-lbl">${esc(o.emoji)} ${esc(o.label)}</span><span class="opt-cnt">${us.length}</span>${chips(us.map(n => ({ name: n })))}</div>`;
      }).join('') + `</div>`;
  }).join('') || `<div class="empty">Aucun résultat.</div>`;

  // Planning auto
  const A = autoAssign(results);
  const secs = Object.keys(PLAN_LABELS).filter(k => A[k].length);
  const card = $('#hrPlanCard');
  if (!secs.length) { card.hidden = true; return; }
  card.hidden = false;
  $('#hrPlan').innerHTML = secs.map(k => `<div class="plan-sec"><div class="plan-sec-title">${PLAN_LABELS[k]}</div>${chips(A[k])}</div>`).join('');
  $('#hrPlanMsg').textContent = planMessage(A);
}

// ── VUE : ANNONCE ─────────────────────────────────────────────────────────────
function renderAnnonce() {
  $('#view').innerHTML = `
    <div class="card">
      <div class="card-title">📢 Annonce Discord</div>
      <label class="field">Salon</label>
      <div id="anChanBox"></div>
      <label class="field">Message</label>
      <textarea id="anMsg" placeholder="Ton annonce… (les @mentions et emojis Discord fonctionnent)">${esc(S.get('draft'))}</textarea>
      <button class="btn btn-primary" id="anPostBtn" type="button">📨 Poster</button>
    </div>`;
  mountChannelSelect('anChanBox', 'anChan', S.get('channelId'));
  $('#anMsg').addEventListener('input', e => S.set('draft', e.target.value));
  $('#anPostBtn').addEventListener('click', async () => {
    const channelId = $('#anChan')?.value; const message = $('#anMsg').value.trim();
    if (!channelId) return toast('Choisis un salon', 'err');
    if (!message)   return toast('Message vide', 'err');
    if (message.length > 2000) return toast(`Trop long (${message.length}/2000)`, 'err');
    const btn = $('#anPostBtn'); busy(btn, true, '⏳ Envoi…');
    try { const d = await api('/post-announce', { method: 'POST', body: { channelId, message } }); toast(`✅ Posté dans #${d.channel || channelName(channelId)}`, 'ok'); S.set('draft', ''); $('#anMsg').value = ''; }
    catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '📨 Poster'); }
  });
}

// ── VUE : GALERIE TOP 8 ───────────────────────────────────────────────────────
function renderTop8() {
  $('#view').innerHTML = `
    <div class="card">
      <div class="card-title">🏆 Galerie</div>
      <p class="hint">Les images postées dans un salon (Top 8, visuels…), du plus récent au plus ancien.</p>
      <label class="field">Salon</label>
      <div id="t8ChanBox"></div>
      <button class="btn" id="t8LoadBtn" type="button">🖼️ Charger les images</button>
      <div class="grid" id="t8Grid"></div>
    </div>`;
  mountChannelSelect('t8ChanBox', 't8Chan', S.get('galleryChannelId') || S.get('channelId'));
  $('#t8LoadBtn').addEventListener('click', async () => {
    const channelId = $('#t8Chan')?.value; if (!channelId) return toast('Choisis un salon', 'err');
    S.set('galleryChannelId', channelId);
    const btn = $('#t8LoadBtn'); busy(btn, true, '⏳ Chargement…');
    try {
      const d = await api(`/channel-images?channelId=${encodeURIComponent(channelId)}&limit=60&includeBots=1`);
      const photos = d.photos || [];
      $('#t8Grid').innerHTML = photos.length ? photos.map(p =>
        `<div class="thumb" data-url="${esc(p.url)}" data-cap="${esc(p.author)} · ${new Date(p.postedAt).toLocaleDateString('fr-FR')}"><img src="${esc(p.url)}" alt="" loading="lazy"><div class="by">${esc(p.author || '')}</div></div>`
      ).join('') : `<div class="empty">Aucune image dans ce salon.</div>`;
      $$('#t8Grid .thumb').forEach(t => t.addEventListener('click', () => openLightbox(t.dataset.url, t.dataset.cap)));
      toast(`✅ ${photos.length} image(s)`, 'ok');
    } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '🖼️ Charger les images'); }
  });
}
function openLightbox(url, cap) { $('#lightboxImg').src = url; $('#lightboxCaption').textContent = cap || ''; $('#lightbox').hidden = false; }
$('#lightboxClose').addEventListener('click', () => { $('#lightbox').hidden = true; $('#lightboxImg').src = ''; });
$('#lightbox').addEventListener('click', e => { if (e.target === $('#lightbox')) $('#lightboxClose').click(); });

// ── VUE : RÉGLAGES ────────────────────────────────────────────────────────────
function renderReglages() {
  $('#view').innerHTML = `
    <div class="card">
      <div class="card-title">🤖 Bot Rêverie</div>
      <p class="hint">Les mêmes identifiants que dans l’onglet Configuration du site. Ils restent sur ce téléphone.</p>
      <label class="field">URL du bot</label>
      <input type="url" id="stUrl" value="${esc(S.get('botUrl'))}" placeholder="https://…" autocomplete="off" autocapitalize="none">
      <label class="field">Mot secret (APP_SECRET)</label>
      <div class="row">
        <input type="password" id="stSecret" value="${esc(S.get('secret'))}" autocomplete="new-password">
        <button class="btn btn-sm btn-ghost fixed" id="stEye" type="button">👁️</button>
      </div>
      <button class="btn btn-primary" id="stTest" type="button">🔌 Tester la connexion</button>
    </div>
    <div class="card">
      <div class="card-title">ℹ️ À propos</div>
      <p class="hint" style="margin:0">Projet Rêverie — app mobile « terrain ». Le contenu se met à jour automatiquement à chaque nouvelle version du site.</p>
    </div>`;
  $('#stUrl').addEventListener('input',    e => { S.set('botUrl', e.target.value); channelsCache = null; });
  $('#stSecret').addEventListener('input', e => { S.set('secret', e.target.value); channelsCache = null; });
  $('#stEye').addEventListener('click', () => { const i = $('#stSecret'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#stTest').addEventListener('click', async () => {
    const btn = $('#stTest'); busy(btn, true, '⏳ Test…');
    try { const ch = await loadChannels(true); toast(`✅ Connecté — ${ch.length} salon(s) visibles`, 'ok'); setDot(true); }
    catch (e) { toast('❌ ' + e.message, 'err', 4500); setDot(false); }
    finally { busy(btn, false, '🔌 Tester la connexion'); }
  });
}

// ── ROUTEUR ───────────────────────────────────────────────────────────────────
const VIEWS = {
  horaires: { title: 'Horaires', render: renderHoraires },
  annonce:  { title: 'Annonce',  render: renderAnnonce },
  top8:     { title: 'Top 8',    render: renderTop8 },
  reglages: { title: 'Réglages', render: renderReglages },
};
function go(tab) {
  const v = VIEWS[tab] || VIEWS.horaires;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#topbarTitle').textContent = v.title;
  S.set('tab', tab);
  window.scrollTo(0, 0);
  v.render();
}
$$('.tab').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

// Pastille d'état du bot (ping discret au démarrage si configuré)
function setDot(ok) { const d = $('#botDot'); d.className = 'topbar-dot ' + (ok ? 'ok' : 'err'); }
(async function boot() {
  const configured = S.get('botUrl') && S.get('secret');
  go(configured ? (S.get('tab') || 'horaires') : 'reglages');
  if (configured) { try { await loadChannels(); setDot(true); } catch { setDot(false); } }
})();
