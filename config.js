// ============================================================
// CONFIG.JS — Onglet "Configuration" centralisé
// Gère 3 settings (start.gg API, bot URL, bot secret) en
// synchronisant avec toutes les clés legacy localStorage et les
// inputs DOM des autres onglets, pour que le user n'ait qu'à
// remplir une seule fois.
// ============================================================

let cfgInitDone = false;

function cfgInit() {
  if (cfgInitDone) return;
  cfgInitDone = true;

  // Charger valeurs existantes (premier non-vide pour chaque setting)
  const startgg = localStorage.getItem('top8_startgg_key') || '';
  const url     = localStorage.getItem('dc_bot_url')    || localStorage.getItem('hr_bot_url')    || '';
  const secret  = localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '';
  const logCh   = localStorage.getItem('dc_log_channel_id') || '';

  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('cfgStartggKey', startgg);
  setV('cfgBotUrl',     url);
  setV('cfgBotSecret',  secret);
  setV('dcLogChannelId', logCh);

  // Pré-remplir aussi les inputs des autres onglets si vides
  cfgPropagateToInputs(startgg, url, secret);

  // Restaure le label du picker du log channel
  if (logCh && typeof renderDcChannelPickerBtn === 'function') {
    const wrap = document.getElementById('dcLogChannelPickerWrap');
    if (wrap) wrap.innerHTML = renderDcChannelPickerBtn(logCh, 'dcLogChannelId', 'dcLogChannelPickerWrap');
  }
}

// Sauvegarde toutes les valeurs en localStorage et propage aux inputs
// des autres onglets en temps réel (à chaque oninput).
function cfgSaveAll() {
  const startgg = (document.getElementById('cfgStartggKey')?.value || '').trim();
  const url     = (document.getElementById('cfgBotUrl')?.value     || '').trim().replace(/\/$/, '');
  const secret  = (document.getElementById('cfgBotSecret')?.value  || '').trim();
  const logCh   = (document.getElementById('dcLogChannelId')?.value || '').trim();

  // Persister dans toutes les clés legacy attendues par chaque module
  cfgWriteOrRemove('top8_startgg_key', startgg);
  cfgWriteOrRemove('dc_bot_url',       url);
  cfgWriteOrRemove('hr_bot_url',       url);
  cfgWriteOrRemove('dc_bot_secret',    secret);
  cfgWriteOrRemove('hr_bot_secret',    secret);
  cfgWriteOrRemove('dc_log_channel_id', logCh);

  // Propager aux inputs DOM des autres onglets s'ils existent
  cfgPropagateToInputs(startgg, url, secret);

  cfgFlash('✅ Sauvegardé');
}

function cfgWriteOrRemove(key, value) {
  if (value) localStorage.setItem(key, value);
  else       localStorage.removeItem(key);
}

function cfgPropagateToInputs(startgg, url, secret) {
  // Top 8 — apiKey
  const apiKey = document.getElementById('apiKey');
  if (apiKey && apiKey.value !== startgg) apiKey.value = startgg;

  // Onglet Discord
  const dcBotUrl    = document.getElementById('dcBotUrl');
  const dcBotSecret = document.getElementById('dcBotSecret');
  if (dcBotUrl    && dcBotUrl.value    !== url)    dcBotUrl.value    = url;
  if (dcBotSecret && dcBotSecret.value !== secret) dcBotSecret.value = secret;

  // Onglet Horaires
  const hrBotUrl    = document.getElementById('hrBotUrl');
  const hrBotSecret = document.getElementById('hrBotSecret');
  if (hrBotUrl    && hrBotUrl.value    !== url)    hrBotUrl.value    = url;
  if (hrBotSecret && hrBotSecret.value !== secret) hrBotSecret.value = secret;
}

// ── BASCULE AFFICHAGE EN CLAIR DES MOTS DE PASSE ───────────────────────────
// Protégée par un mot de passe admin ("gnarpyadmin"). Une fois validé pour
// la session, tous les champs type="password" du panel Configuration
// passent en type="text". Re-clic = re-cache.
const CFG_REVEAL_PASSWORD = 'gnarpyadmin';
let _cfgRevealed = false;

function cfgToggleReveal() {
  const btn = document.getElementById('cfgRevealBtn');
  if (_cfgRevealed) {
    _cfgSetPasswordFieldsVisible(false);
    _cfgRevealed = false;
    if (btn) btn.textContent = '👁️ Afficher les mots de passe';
    return;
  }
  const entered = prompt('Mot de passe admin :');
  if (entered == null) return; // cancel
  if (entered !== CFG_REVEAL_PASSWORD) {
    cfgFlash('❌ Mot de passe incorrect', 'error');
    return;
  }
  _cfgSetPasswordFieldsVisible(true);
  _cfgRevealed = true;
  if (btn) btn.textContent = '🙈 Masquer les mots de passe';
}

function _cfgSetPasswordFieldsVisible(visible) {
  // Tous les <input> du panel #pageConfig dont le type était password
  const root = document.getElementById('pageConfig');
  if (!root) return;
  root.querySelectorAll('input').forEach(el => {
    // On garde une trace du type original via data-attr pour pouvoir restore
    if (visible) {
      if (el.type === 'password') {
        el.dataset.cfgOrigType = 'password';
        el.type = 'text';
      }
    } else {
      if (el.dataset.cfgOrigType === 'password') {
        el.type = 'password';
        delete el.dataset.cfgOrigType;
      }
    }
  });
}

let _cfgFlashTimer = null;
function cfgFlash(msg, type) {
  const el = document.getElementById('cfgStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'cfg-status cfg-status-' + (type || 'ok');
  el.style.display = 'block';
  clearTimeout(_cfgFlashTimer);
  _cfgFlashTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
}
