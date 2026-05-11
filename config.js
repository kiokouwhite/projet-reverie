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

  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('cfgStartggKey', startgg);
  setV('cfgBotUrl',     url);
  setV('cfgBotSecret',  secret);

  // Pré-remplir aussi les inputs des autres onglets si vides
  cfgPropagateToInputs(startgg, url, secret);
}

// Sauvegarde toutes les valeurs en localStorage et propage aux inputs
// des autres onglets en temps réel (à chaque oninput).
function cfgSaveAll() {
  const startgg = (document.getElementById('cfgStartggKey')?.value || '').trim();
  const url     = (document.getElementById('cfgBotUrl')?.value     || '').trim().replace(/\/$/, '');
  const secret  = (document.getElementById('cfgBotSecret')?.value  || '').trim();

  // Persister dans toutes les clés legacy attendues par chaque module
  cfgWriteOrRemove('top8_startgg_key', startgg);
  cfgWriteOrRemove('dc_bot_url',       url);
  cfgWriteOrRemove('hr_bot_url',       url);
  cfgWriteOrRemove('dc_bot_secret',    secret);
  cfgWriteOrRemove('hr_bot_secret',    secret);

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

let _cfgFlashTimer = null;
function cfgFlash(msg) {
  const el = document.getElementById('cfgStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'cfg-status cfg-status-ok';
  el.style.display = 'block';
  clearTimeout(_cfgFlashTimer);
  _cfgFlashTimer = setTimeout(() => { el.style.display = 'none'; }, 1500);
}
