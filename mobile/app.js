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

// ── QUESTIONS SYNCHRONISÉES DEPUIS LE SITE ────────────────────────────────────
// Le site pousse automatiquement ses réglages (dont les questions éditées,
// clés hr_questions_lorem / hr_questions_magna) dans la sauvegarde du bot.
// L'app les récupère via /backup-keys (léger) : ce que tu modifies sur le site
// arrive ici tout seul. Repli : copie locale, puis questions intégrées.
const SYNC_KEYS = ['hr_questions_lorem', 'hr_questions_magna'];
let questionsSync = { at: null, source: 'builtin', lastTry: 0 };
function applySyncedQuestions(values) {
  let n = 0;
  ['lorem', 'magna'].forEach(k => {
    const raw = values && values['hr_questions_' + k];
    if (!raw) return;
    try {
      const qs = JSON.parse(raw);
      if (Array.isArray(qs) && qs.length && qs.every(q => q && Array.isArray(q.options))) { PRESETS[k].questions = qs; n++; }
    } catch {}
  });
  return n;
}
(function loadQuestionsCache() {
  try {
    const c = JSON.parse(S.get('questionsCache') || 'null');
    if (c && c.values && applySyncedQuestions(c.values)) questionsSync = { at: c.at || null, source: 'cache', lastTry: 0 };
  } catch {}
})();
async function syncQuestions({ silent = true } = {}) {
  questionsSync.lastTry = Date.now();
  try {
    const d = await api('/backup-keys?profile=default&keys=' + SYNC_KEYS.join(','), { timeout: 12000 });
    const n = applySyncedQuestions(d.values || {});
    if (n) {
      questionsSync = { at: d.savedAt || new Date().toISOString(), source: 'site', lastTry: Date.now() };
      S.set('questionsCache', JSON.stringify({ at: questionsSync.at, values: d.values }));
    } else if (!silent) toast('ℹ️ Le site n’a encore rien sauvegardé (ouvre Horaires sur le site une fois)', '', 4500);
    return n;
  } catch (e) { if (!silent) toast('❌ ' + e.message, 'err', 4500); return 0; }
}
function relTime(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
function syncHintHTML() {
  const q = questionsSync;
  const txt = q.source === 'site'  ? `🔄 Questions du site · sauvegarde ${relTime(q.at)}`
            : q.source === 'cache' ? `📦 Questions du site (copie locale · ${relTime(q.at)})`
            :                        '📋 Questions intégrées — le site n’a pas encore été synchronisé';
  return `<div class="sync-row"><span class="hint">${esc(txt)}</span><button type="button" class="btn btn-sm" id="hrSyncBtn">↻</button></div>`;
}

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
// Toutes les personnes ayant voté (dédoublonnées par nom, id Discord + flags TO)
function collectPeople(results) {
  const uObj = u => (typeof u === 'object' ? u : { id: null, name: u });
  const all = new Map();
  (results || []).forEach(r => (r.reactions || []).forEach(re => (re.users || []).forEach(u => {
    const o = uObj(u); const ex = all.get(o.name);
    if (!ex) all.set(o.name, { id: o.id || null, name: o.name, toFG: !!o.toFG, toSmash: !!o.toSmash });
    else { ex.toFG = ex.toFG || !!o.toFG; ex.toSmash = ex.toSmash || !!o.toSmash; if (!ex.id && o.id) ex.id = o.id; }
  })));
  return all;
}
function autoAssign(results) {
  const uName = u => (typeof u === 'object' ? u.name : u);
  const all = collectPeople(results);
  const get = n => all.get(n) || { id: null, name: n };
  // Votes par emoji, toutes questions confondues : les emojis sont uniques
  // d'une question à l'autre, et le site permet de réordonner les questions.
  const voters = (_qi, emoji) => {
    const names = new Set();
    (results || []).forEach(r => (r.reactions || []).forEach(re => { if (re.emoji === emoji) (re.users || []).forEach(u => names.add(uName(u))); }));
    return [...names].map(get);
  };
  const A = { install: [], rangement: [], accueil: [], regie: [], seeding: [], to: [], to_smash: [], to_fg: [] };

  if (presetKey() === 'magna') {
    // Options reconnues par leur libellé (install / rangement / TO), position en
    // repli — même logique que le site (hrMagnaZoneByEmoji).
    const opts = questions()[0]?.options || [];
    const KEYS = { install: /install/i, rangement: /rang/i, to: /\bto\b|to-?ing|r[ée]gie|arbitr/i };
    const used = new Set(), matched = new Set();
    Object.entries(KEYS).forEach(([k, re]) => {
      const i = opts.findIndex((o, j) => !used.has(j) && re.test(`${o.label || ''} ${o.emoji || ''}`));
      if (i >= 0) { A[k] = voters(0, opts[i].emoji); used.add(i); matched.add(k); }
    });
    ['install', 'rangement', 'to'].forEach(k => {          // repli par position
      if (matched.has(k)) return;
      const i = opts.findIndex((o, j) => !used.has(j));
      if (i >= 0) { A[k] = voters(0, opts[i].emoji); used.add(i); }
    });
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

// ── PLANNING MODIFIABLE À LA MAIN ────────────────────────────────────────────
// Après « Charger les résultats », la répartition auto peut être retouchée :
// touche un nom → « Déplacer vers … » / « Retirer » ; ＋ sur un rôle → ajoute
// un votant (ou un nom libre) ; ↺ Auto → recalcule depuis les votes.
// Le brouillon est mémorisé (localStorage) tant que les votes n'ont pas changé.
const PRESET_ROLES = {
  lorem: ['install', 'accueil', 'regie', 'seeding', 'rangement', 'to_smash', 'to_fg'],
  magna: ['install', 'rangement', 'to'],
};
const planRoles = () => PRESET_ROLES[presetKey()] || Object.keys(PLAN_LABELS);
let lastPlan = null;   // { sig, A, manual }
const resultsSig = results => JSON.stringify((results || []).map(r => (r.reactions || []).map(re =>
  [re.emoji, (re.users || []).map(u => (typeof u === 'object' ? u.name : u)).sort()])));
function planNormalize(A) { Object.keys(PLAN_LABELS).forEach(k => { if (!Array.isArray(A[k])) A[k] = []; }); return A; }
function ensurePlan(results) {
  const sig = resultsSig(results);
  if (lastPlan && lastPlan.sig === sig) return lastPlan;
  try { const d = JSON.parse(S.get('planDraft') || 'null'); if (d && d.sig === sig && d.A) { lastPlan = { sig, A: planNormalize(d.A), manual: !!d.manual }; return lastPlan; } } catch {}
  lastPlan = { sig, A: planNormalize(autoAssign(results)), manual: false };
  return lastPlan;
}
function planPersist() { try { S.set('planDraft', JSON.stringify(lastPlan)); } catch {} }
function planEdit(fn) { fn(lastPlan.A); lastPlan.manual = true; planPersist(); renderPlan(); }
function planRemove(A, name, role) { A[role] = (A[role] || []).filter(u => u.name !== name); }
function planAdd(A, user, role) { if (!(A[role] || []).some(u => u.name === user.name)) (A[role] = A[role] || []).push(user); }

// Feuille d'actions en bas d'écran → Promise<value | null>
function sheet(title, items) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'sheet-ov';
    ov.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-title">${esc(title)}</div>` +
      items.map((it, i) => `<button type="button" class="sheet-btn${it.danger ? ' danger' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('') +
      `<button type="button" class="sheet-btn cancel" data-i="-1">Annuler</button></div>`;
    const close = v => { ov.remove(); resolve(v); };
    ov.addEventListener('click', e => {
      const b = e.target.closest('.sheet-btn');
      if (b) { const i = Number(b.dataset.i); close(i >= 0 ? items[i].value : null); }
      else if (e.target === ov) close(null);
    });
    document.body.appendChild(ov);
  });
}

function renderPlan() {
  const box = $('#hrPlan'); if (!box || !lastPlan) return;
  const A = lastPlan.A, roles = planRoles();
  box.innerHTML = roles.map(k => `
    <div class="plan-sec" data-role="${k}">
      <div class="plan-sec-head"><span class="plan-sec-title">${PLAN_LABELS[k]}</span><button type="button" class="plan-add" data-role="${k}" aria-label="Ajouter à ${esc(PLAN_LABELS[k])}">＋</button></div>
      ${(A[k] || []).length
        ? `<div class="chips">${A[k].map(u => `<button type="button" class="chip chip-btn" data-role="${k}" data-name="${esc(u.name)}">${esc(u.name)}</button>`).join('')}</div>`
        : '<span class="chip empty">personne</span>'}
    </div>`).join('') +
    `<div class="plan-tools"><span class="hint">${lastPlan.manual ? '✏️ Modifié à la main' : '🤖 Répartition automatique'} · touche un nom pour le déplacer</span>${lastPlan.manual ? '<button type="button" class="btn btn-sm" id="hrPlanReset">↺ Auto</button>' : ''}</div>`;
  $('#hrPlanMsg').textContent = planMessage(A);

  box.onclick = async e => {
    const chip = e.target.closest('.chip-btn');
    const add  = e.target.closest('.plan-add');
    const reset = e.target.closest('#hrPlanReset');
    if (chip) {
      const { role, name } = chip.dataset;
      const choice = await sheet(`${name} · ${PLAN_LABELS[role]}`, [
        ...roles.filter(r => r !== role).map(r => ({ label: `→ ${PLAN_LABELS[r]}`, value: 'mv:' + r })),
        { label: '✕ Retirer du planning', value: 'rm', danger: true },
      ]);
      if (!choice) return;
      planEdit(A => {
        const user = (A[role] || []).find(u => u.name === name) || { id: null, name };
        planRemove(A, name, role);
        if (choice.startsWith('mv:')) planAdd(A, user, choice.slice(3));
      });
      toast(choice === 'rm' ? `✕ ${name} retiré` : `✅ ${name} → ${PLAN_LABELS[choice.slice(3)]}`, 'ok', 1800);
    } else if (add) {
      const role = add.dataset.role;
      const people = [...collectPeople(lastResults).values()].filter(u => !(A[role] || []).some(x => x.name === u.name));
      const choice = await sheet(`Ajouter à ${PLAN_LABELS[role]}`, [
        ...people.map(u => ({ label: u.name, value: 'p:' + u.name })),
        { label: '✏️ Autre nom…', value: 'other' },
      ]);
      if (!choice) return;
      let user = null;
      if (choice === 'other') { const n = (prompt('Nom à ajouter :') || '').trim(); if (!n) return; user = { id: null, name: n }; }
      else user = people.find(u => u.name === choice.slice(2));
      if (!user) return;
      planEdit(A => planAdd(A, user, role));
      toast(`✅ ${user.name} → ${PLAN_LABELS[role]}`, 'ok', 1800);
    } else if (reset) {
      lastPlan = { sig: lastPlan.sig, A: planNormalize(autoAssign(lastResults)), manual: false };
      planPersist(); renderPlan();
      toast('↺ Répartition automatique rétablie', 'ok', 1800);
    }
  };
}

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
      ${syncHintHTML()}
      <p class="hint" style="margin:6px 0 0">${questions().length} question(s) · ${questions().reduce((a, q) => a + (q.options || []).length, 0)} option(s)</p>
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
      <div class="card-title">🗂️ Planning</div>
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
  $('#hrSyncBtn').addEventListener('click', async () => {
    const btn = $('#hrSyncBtn'); busy(btn, true, '⏳');
    const n = await syncQuestions({ silent: false });
    busy(btn, false, '↻');
    if (n) { toast('✅ Questions synchronisées depuis le site', 'ok'); renderHoraires(); }
  });
  // Synchro automatique (une fois par 5 min max) : si les questions ont changé,
  // on ré-affiche.
  if (Date.now() - questionsSync.lastTry > 5 * 60 * 1000 && S.get('botUrl') && S.get('secret')) {
    const before = JSON.stringify(questions());
    syncQuestions().then(n => { if (n && JSON.stringify(questions()) !== before && $('#hrPostBtn')) renderHoraires(); else if (n && $('#hrSyncBtn')) $('#hrSyncBtn').parentElement.outerHTML = syncHintHTML(); });
  }
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
      const dayOfWeek = Number($('#hrDay').value);
      await api('/horaires-schedule', { method: 'POST', body: { channelId, questions: questions(), dayOfWeek, hour: h, minute: m, everyone: $('#hrEveryone').checked, preset: presetKey(), presetName: PRESETS[presetKey()].name } });
      planUpsertAuto({ dayOfWeek, hour: h, minute: m, presetName: PRESETS[presetKey()].name, channelId });
      if (isNative()) planReschedule(false);
      toast(`✅ Envoi hebdo activé (${$('#hrDay').selectedOptions[0].textContent} ${$('#hrTime').value}) · ajouté au Planning`, 'ok', 4000);
    } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
    finally { busy(btn, false, '🔁 Activer l’envoi hebdo'); }
  });
  $('#hrWeeklyOff').addEventListener('click', async () => {
    const btn = $('#hrWeeklyOff'); busy(btn, true, '⏳…');
    try { await api('/horaires-schedule', { method: 'DELETE' }); planRemoveAuto(); if (isNative()) planReschedule(false); toast('✅ Envoi hebdo désactivé · retiré du Planning', 'ok'); }
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

  // Planning : répartition auto, puis retouchable à la main (cf. renderPlan)
  ensurePlan(results);
  $('#hrPlanCard').hidden = false;
  renderPlan();
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
// ── PLANNING HEBDO (rappels par notification LOCALE) ─────────────────────────
// Tâches récurrentes de la semaine (envoyer les horaires, faire le Top 8…) avec
// un rappel programmé SUR LE TÉLÉPHONE via le plugin Capacitor LocalNotifications
// — aucun serveur, ça sonne même app fermée, et ça survit au redémarrage du
// téléphone (RECEIVE_BOOT_COMPLETED). Dans un navigateur (hors APK), la liste
// fonctionne mais sans rappels. Les cases « fait » se réinitialisent chaque
// semaine (rattachées à la semaine ISO courante).
const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const PLAN_DEFAULTS = [
  { id: 1, emoji: '🗓️', title: 'Envoyer les sondages horaires',            day: 5, time: '17:00', notify: true },
  { id: 2, emoji: '📊', title: 'Relever les résultats & faire le planning', day: 6, time: '12:00', notify: true },
  { id: 3, emoji: '📢', title: 'Poster l’annonce du tournoi',              day: 3, time: '18:00', notify: true },
  { id: 4, emoji: '🏆', title: 'Faire le Top 8',                           day: 0, time: '21:00', notify: true },
];
const TEST_NOTIF_ID = 999999;
let PLAN = null;
let planEditingId = null;

// ── TÂCHE AUTOMATIQUE : l'envoi hebdo des sondages ───────────────────────────
// Quand l'envoi hebdomadaire est activé (sur le site ou ici), une tâche
// « Sondages envoyés automatiquement » apparaît dans le Planning au jour et à
// l'heure programmés (rappel activé). Elle suit l'état du bot : mise à jour si
// le jour / l'heure / le type changent, retirée quand l'envoi est désactivé.
// Elle n'est pas modifiable à la main (sauf la cloche) — ça se règle sur le site.
const PLAN_AUTO_ID = 900001;   // id stable (sert aussi d'id de notification)
let planAutoSync = { lastTry: 0 };
const planAutoTask = () => planLoad().tasks.find(t => t.id === PLAN_AUTO_ID) || null;
function planUpsertAuto(s) {
  const P = planLoad();
  const time  = `${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`;
  const title = `Sondages${s.presetName ? ' « ' + s.presetName + ' »' : ''} envoyés automatiquement`;
  let t = planAutoTask(), changed = false;
  if (!t) {
    t = { id: PLAN_AUTO_ID, emoji: '📨', title, day: Number(s.dayOfWeek) || 0, time, notify: true, auto: 'horaires', channel: s.channelId || '' };
    P.tasks.unshift(t); changed = true;
  } else if (t.title !== title || t.day !== Number(s.dayOfWeek) || t.time !== time) {
    t.title = title; t.day = Number(s.dayOfWeek) || 0; t.time = time; t.channel = s.channelId || t.channel; changed = true;
  }
  if (changed) planSave();
  return changed;
}
function planRemoveAuto() {
  const P = planLoad(); const n = P.tasks.length;
  P.tasks = P.tasks.filter(t => t.id !== PLAN_AUTO_ID);
  if (P.tasks.length === n) return false;
  planSave(); return true;
}
async function syncAutoTask({ force = false } = {}) {
  if (!S.get('botUrl') || !S.get('secret')) return false;
  if (!force && Date.now() - planAutoSync.lastTry < 5 * 60 * 1000) return false;
  planAutoSync.lastTry = Date.now();
  try {
    const d = await api('/horaires-schedule', { timeout: 12000 });
    const changed = (d.active && d.schedule) ? planUpsertAuto(d.schedule) : planRemoveAuto();
    if (changed) { if ($('#planList')) renderPlanList(); if (isNative()) planReschedule(false); }
    return changed;
  } catch { return false; }
}

function planLoad() {
  if (PLAN) return PLAN;
  try { PLAN = JSON.parse(S.get('planning', 'null')); } catch { PLAN = null; }
  if (!PLAN || !Array.isArray(PLAN.tasks)) PLAN = { tasks: PLAN_DEFAULTS.map(t => ({ ...t })), nextId: 5, done: {} };
  if (!PLAN.done) PLAN.done = {};
  return PLAN;
}
function planSave() { S.set('planning', JSON.stringify(PLAN)); }

// Clé de semaine ISO (ex. « 2026-W38 ») : les cases « fait » y sont rattachées.
function weekKey(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dow);
  const y = x.getUTCFullYear();
  return `${y}-W${String(Math.ceil((((x - Date.UTC(y, 0, 1)) / 864e5) + 1) / 7)).padStart(2, '0')}`;
}

// Plugin natif (présent uniquement dans l'APK ; absent dans un navigateur).
const ln = () => window.Capacitor?.Plugins?.LocalNotifications || null;
const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

// Permission Android 13+ : vérifie, et ne demande que si `ask`.
async function planPermission(ask = true) {
  const L = ln(); if (!L) return 'unavailable';
  try {
    let s = await L.checkPermissions();
    if (s.display !== 'granted' && ask) s = await L.requestPermissions();
    return s.display;
  } catch { return 'denied'; }
}
// Android 14+ : alarmes exactes (sinon un rappel peut glisser de quelques minutes).
async function planExactAllowed() {
  const L = ln(); if (!L || typeof L.checkExactNotificationSetting !== 'function') return true;
  try { return (await L.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch { return true; }
}

// (Re)programme TOUS les rappels : annule l'existant puis replanifie les tâches
// activées. Idempotent → appelé après chaque modification et au démarrage.
// weekday du plugin : 1 = dimanche … 7 = samedi (d'où `day + 1`).
async function planReschedule(ask = true) {
  const L = ln(); if (!L) return false;
  if ((await planPermission(ask)) !== 'granted') return false;
  try {
    const pending = await L.getPending();
    if (pending?.notifications?.length) await L.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const notifications = planLoad().tasks.filter(t => t.notify).map(t => {
      const [h, m] = String(t.time || '17:00').split(':').map(Number);
      return {
        id: t.id,
        title: `${t.emoji} ${t.title}`.trim(),
        body: 'C’est le moment — Projet Rêverie',
        schedule: { on: { weekday: t.day + 1, hour: h, minute: m }, repeats: true, allowWhileIdle: true },
        extra: { tab: 'planning' },
      };
    });
    if (notifications.length) await L.schedule({ notifications });
    return true;
  } catch (e) { console.warn('[planning] reschedule :', e); return false; }
}
const PERM_DENIED_MSG = '❌ Notifications refusées — autorise-les dans les réglages Android';

async function planTestNotification() {
  const L = ln(); if (!L) return toast('Disponible dans l’app Android', 'err');
  if ((await planPermission(true)) !== 'granted') return toast(PERM_DENIED_MSG, 'err', 4500);
  try {
    await L.schedule({ notifications: [{ id: TEST_NOTIF_ID, title: '🔔 Test Projet Rêverie', body: 'Les rappels fonctionnent !', schedule: { at: new Date(Date.now() + 5000) } }] });
    toast('✅ Notification test dans 5 secondes…', 'ok');
  } catch (e) { toast('❌ ' + e.message, 'err', 4500); }
}

function renderPlanning() {
  const native = isNative() && !!ln();
  $('#view').innerHTML = `
    <div class="card">
      <div class="card-title">📅 Cette semaine</div>
      <div class="plan-progress"><span id="planCount"></span><span class="hint" style="margin:0">${esc(weekKey())}</span></div>
      <div id="planStatus" class="hint" style="margin-bottom:0"></div>
      ${native ? `<button class="btn btn-ghost" id="planTestBtn" type="button">🔔 Tester une notification</button>` : ''}
    </div>
    <div class="card">
      <div class="card-title">✅ Tâches récurrentes</div>
      <div id="planList"></div>
      <button class="btn" id="planAddBtn" type="button">＋ Ajouter une tâche</button>
    </div>
    <div class="card" id="planFormCard" hidden>
      <div class="card-title" id="planFormTitle">Nouvelle tâche</div>
      <div class="row">
        <input type="text" id="pfEmoji" class="fixed" style="width:64px;text-align:center" maxlength="4" placeholder="🔔">
        <input type="text" id="pfTitle" placeholder="Titre de la tâche">
      </div>
      <div class="row" style="margin-top:8px">
        <select id="pfDay">${DAYS_FR.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
        <input type="time" id="pfTime" value="17:00">
      </div>
      <label class="check"><input type="checkbox" id="pfNotify" checked> 🔔 Me rappeler par notification</label>
      <div class="row">
        <button class="btn btn-ghost" id="pfCancel" type="button">Annuler</button>
        <button class="btn btn-primary" id="pfSave" type="button">Enregistrer</button>
      </div>
    </div>`;
  renderPlanList();
  refreshPlanStatus();
  syncAutoTask();
  $('#planTestBtn')?.addEventListener('click', planTestNotification);
  $('#planAddBtn').addEventListener('click', () => openPlanForm(null));
  $('#pfCancel').addEventListener('click', () => { $('#planFormCard').hidden = true; planEditingId = null; });
  $('#pfSave').addEventListener('click', savePlanForm);
}

function renderPlanList() {
  const P = planLoad(); const wk = weekKey(); const done = P.done[wk] || {};
  const box = $('#planList'); if (!box) return;
  $('#planCount').textContent = `${P.tasks.filter(t => done[t.id]).length} / ${P.tasks.length} tâche(s) faite(s)`;
  box.innerHTML = P.tasks.length ? P.tasks.map(t => `
    <div class="task${done[t.id] ? ' done' : ''}">
      <label class="task-check"><input type="checkbox" data-done="${t.id}" ${done[t.id] ? 'checked' : ''}></label>
      <div class="task-main">
        <div class="task-title">${esc(t.emoji)} ${esc(t.title)}</div>
        <div class="task-when">${DAYS_FR[t.day] || '?'} · ${esc(t.time)}${t.auto ? ' · <span class="task-auto">🌐 envoi hebdo du site</span>' : ''}</div>
      </div>
      <button type="button" class="task-bell${t.notify ? ' on' : ''}" data-bell="${t.id}" title="Rappel">${t.notify ? '🔔' : '🔕'}</button>
      ${t.auto
        ? `<button type="button" class="task-ico" data-auto="${t.id}" title="Géré par l’envoi hebdo">🌐</button>`
        : `<button type="button" class="task-ico" data-edit="${t.id}" title="Modifier">✏️</button>
      <button type="button" class="task-ico" data-del="${t.id}" title="Supprimer">🗑️</button>`}
    </div>`).join('') : `<div class="empty">Aucune tâche — ajoute-en une !</div>`;
  box.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', () =>
    toast('🌐 Cette tâche suit l’envoi hebdo des sondages : change le jour / l’heure dans Horaires (site ou app), ou désactive l’envoi pour la retirer', '', 5000)));

  box.querySelectorAll('[data-done]').forEach(cb => cb.addEventListener('change', e => {
    const id = Number(e.target.dataset.done); const P = planLoad(); const wk = weekKey();
    P.done = { [wk]: { ...(P.done[wk] || {}), [id]: e.target.checked } };   // ne conserve que la semaine courante
    planSave(); renderPlanList();
  }));
  box.querySelectorAll('[data-bell]').forEach(b => b.addEventListener('click', async () => {
    const t = planLoad().tasks.find(x => x.id === Number(b.dataset.bell)); if (!t) return;
    t.notify = !t.notify; planSave(); renderPlanList();
    if (isNative()) { const ok = await planReschedule(t.notify); if (t.notify && !ok) toast(PERM_DENIED_MSG, 'err', 4500); refreshPlanStatus(); }
  }));
  box.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openPlanForm(Number(b.dataset.edit))));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const P = planLoad(); const t = P.tasks.find(x => x.id === Number(b.dataset.del)); if (!t) return;
    if (!confirm(`Supprimer « ${t.title} » ?`)) return;
    P.tasks = P.tasks.filter(x => x.id !== t.id); planSave(); renderPlanList();
    if (isNative()) { planReschedule(false); refreshPlanStatus(); }
  }));
}

function openPlanForm(id) {
  planEditingId = id;
  const t = id != null ? planLoad().tasks.find(x => x.id === id) : null;
  $('#planFormTitle').textContent = t ? 'Modifier la tâche' : 'Nouvelle tâche';
  $('#pfEmoji').value  = t ? t.emoji : '';
  $('#pfTitle').value  = t ? t.title : '';
  $('#pfDay').value    = String(t ? t.day : 5);
  $('#pfTime').value   = t ? t.time : '17:00';
  $('#pfNotify').checked = t ? !!t.notify : true;
  const card = $('#planFormCard'); card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#pfTitle').focus();
}

async function savePlanForm() {
  const title = $('#pfTitle').value.trim(); if (!title) return toast('Donne un titre à la tâche', 'err');
  const P = planLoad();
  const data = { emoji: ($('#pfEmoji').value.trim() || '🔔'), title, day: Number($('#pfDay').value), time: $('#pfTime').value || '17:00', notify: $('#pfNotify').checked };
  if (planEditingId != null) { const t = P.tasks.find(x => x.id === planEditingId); if (t) Object.assign(t, data); }
  else P.tasks.push({ id: P.nextId++, ...data });
  planSave(); $('#planFormCard').hidden = true; planEditingId = null; renderPlanList();
  if (isNative()) { const ok = await planReschedule(data.notify); if (data.notify && !ok) return toast(PERM_DENIED_MSG, 'err', 4500); refreshPlanStatus(); }
  toast('✅ Enregistré', 'ok');
}

// Bandeau d'état des rappels : navigateur / permission refusée / alarmes exactes.
async function refreshPlanStatus() {
  const el = $('#planStatus'); if (!el) return;
  if (!isNative() || !ln()) { el.innerHTML = 'ℹ️ Les rappels par notification fonctionnent dans l’app Android. Ici, la liste seule.'; return; }
  const perm = await planPermission(false);
  if (perm !== 'granted') {
    el.innerHTML = `❌ Notifications non autorisées. <button class="btn btn-sm btn-primary" id="planPermBtn" type="button">Autoriser</button>`;
    $('#planPermBtn')?.addEventListener('click', async () => { await planReschedule(true); refreshPlanStatus(); });
    return;
  }
  const n = planLoad().tasks.filter(t => t.notify).length;
  el.innerHTML = (await planExactAllowed())
    ? `🔔 Rappels actifs — ${n} programmé(s).`
    : `⚠️ Rappels actifs (${n}), mais Android peut les décaler de quelques minutes. <button class="btn btn-sm btn-ghost" id="planExactBtn" type="button">Autoriser les rappels précis</button>`;
  $('#planExactBtn')?.addEventListener('click', async () => { try { await ln().changeExactNotificationSetting(); } catch {} });
}

const VIEWS = {
  horaires: { title: 'Horaires', render: renderHoraires },
  planning: { title: 'Planning', render: renderPlanning },
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
  if (configured) { try { await loadChannels(); setDot(true); } catch { setDot(false); } syncAutoTask(); }
  // Planning : un tap sur un rappel ouvre l'onglet ; et on resynchronise les
  // rappels au lancement (sans redemander la permission).
  const L = ln();
  if (L) {
    try { L.addListener('localNotificationActionPerformed', () => go('planning')); } catch {}
    planReschedule(false);
  }
  // Retour au premier plan après un moment : on reprend les questions du site
  // (elles ont pu être modifiées entre-temps) et on ré-affiche Horaires.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !configured) return;
    syncAutoTask();
    if (Date.now() - questionsSync.lastTry < 5 * 60 * 1000) return;
    const before = JSON.stringify(PRESETS.lorem.questions) + JSON.stringify(PRESETS.magna.questions);
    syncQuestions().then(n => {
      if (n && JSON.stringify(PRESETS.lorem.questions) + JSON.stringify(PRESETS.magna.questions) !== before && $('#hrPostBtn')) renderHoraires();
    });
  });
})();
