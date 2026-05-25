// ============================================================
// BACKUP-SYNC.JS — Sauvegarde auto des données de l'app vers le bot
// ------------------------------------------------------------
// Pourquoi : toutes les données enregistrées (layouts du coffre, presets
// Discord, préférences de persos, configs d'éditeur…) vivent dans le
// navigateur (localStorage + IndexedDB). Elles survivent aux push GitHub, mais
// PAS au changement de navigateur/PC ni au vidage du cache.
//
// Ce module pousse automatiquement un blob {localStorage + images IndexedDB}
// vers le bot (routes /backup), et le restaure :
//   • automatiquement sur un appareil vierge (aucune donnée locale) ;
//   • manuellement via les boutons de l'onglet Configuration.
// Stockage côté bot : /home/reverie-data (persistant sur Azure).
// ============================================================
(function () {
  'use strict';

  const PROFILE   = 'default';            // 1 dataset partagé pour l'asso
  const DEBOUNCE  = 5000;                 // ms avant un push après un changement
  const PREFIXES  = ['top8_', 'dc_', 'hr_', 'sgg_', 'tweet_'];
  const EXACT     = ['collapse_reset_ver'];
  // Clés à NE PAS synchroniser (propres à l'appareil / sensibles inutiles).
  const SKIP      = new Set(['top8_startgg_key']);

  // Le coffre stocke ses images lourdes dans cette base IndexedDB.
  const IDB_DB    = 'top8_coffre_v1';
  const IDB_STORE = 'images';

  const _origSetItem = localStorage.setItem.bind(localStorage);
  let _restoring   = false;   // évite les boucles push pendant une restauration
  let _pushTimer   = null;
  let _lastPushHash = null;
  let _state = { lastSync: null, lastError: null, pushing: false };

  function isAppKey(k) {
    if (!k || SKIP.has(k)) return false;
    return EXACT.includes(k) || PREFIXES.some(p => k.startsWith(p));
  }

  function botCreds() {
    const url = (localStorage.getItem('dc_bot_url') || localStorage.getItem('hr_bot_url') || '')
      .trim().replace(/\/+$/, '');
    const secret = (localStorage.getItem('dc_bot_secret') || localStorage.getItem('hr_bot_secret') || '').trim();
    return { url, secret };
  }

  // ── IndexedDB : lecture/écriture de toutes les entrées du coffre ──
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  async function idbDumpAll() {
    let db; try { db = await idbOpen(); } catch (_) { return {}; }
    return new Promise(resolve => {
      const out = {};
      let tx;
      try { tx = db.transaction(IDB_STORE, 'readonly'); }
      catch (_) { return resolve({}); }
      const store = tx.objectStore(IDB_STORE);
      const kReq = store.getAllKeys();
      const vReq = store.getAll();
      tx.oncomplete = () => {
        const keys = kReq.result || [], vals = vReq.result || [];
        keys.forEach((k, i) => { out[String(k)] = vals[i]; });
        resolve(out);
      };
      tx.onerror = () => resolve({});
    });
  }
  async function idbRestoreAll(map) {
    if (!map || !Object.keys(map).length) return;
    let db; try { db = await idbOpen(); } catch (_) { return; }
    await new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      Object.entries(map).forEach(([k, v]) => { try { store.put(v, k); } catch (_) {} });
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
      tx.onabort    = resolve;
    });
  }

  // ── Construction / application du blob ──
  async function buildBlob() {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isAppKey(k)) ls[k] = localStorage.getItem(k);
    }
    const idb = await idbDumpAll();
    return { version: 1, ls, idb };
  }
  async function applyBlob(blob) {
    if (!blob) return;
    _restoring = true;
    try {
      if (blob.ls && typeof blob.ls === 'object') {
        Object.entries(blob.ls).forEach(([k, v]) => {
          if (isAppKey(k)) { try { _origSetItem(k, v); } catch (_) {} }
        });
      }
      await idbRestoreAll(blob.idb);
    } finally {
      _restoring = false;
    }
  }

  // Hash léger (sur les clés + tailles, pas le contenu complet) pour éviter de
  // repousser un blob identique. Suffisant pour détecter un vrai changement.
  function quickHash(blob) {
    try {
      const parts = [];
      const ls = blob.ls || {};
      Object.keys(ls).sort().forEach(k => parts.push(k + ':' + (ls[k] ? ls[k].length : 0)));
      const idb = blob.idb || {};
      Object.keys(idb).sort().forEach(k => {
        const v = idb[k];
        const len = typeof v === 'string' ? v.length : JSON.stringify(v || '').length;
        parts.push('@' + k + ':' + len);
      });
      return parts.join('|');
    } catch (_) { return String(Math.random()); }
  }

  // ── PUSH ──
  async function pushNow(reason) {
    const { url, secret } = botCreds();
    if (!url || !secret) return false;
    if (_state.pushing) return false;
    _state.pushing = true;
    try {
      const blob = await buildBlob();
      const h = quickHash(blob);
      if (h === _lastPushHash && reason !== 'manual') { _state.pushing = false; return false; }
      const res = await fetch(`${url}/backup?profile=${PROFILE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-secret': secret },
        body: JSON.stringify({ profile: PROFILE, blob }),
        keepalive: reason === 'unload',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      _lastPushHash = h;
      _state.lastSync = data.savedAt || new Date().toISOString();
      _state.lastError = null;
      try { localStorage.setItem('backup_last_sync', _state.lastSync); } catch (_) {}
      renderStatus();
      return true;
    } catch (e) {
      _state.lastError = e.message;
      renderStatus();
      return false;
    } finally {
      _state.pushing = false;
    }
  }

  function schedulePush() {
    if (_restoring) return;
    const { url, secret } = botCreds();
    if (!url || !secret) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => pushNow('auto'), DEBOUNCE);
  }

  // ── PULL ──
  async function pull() {
    const { url, secret } = botCreds();
    if (!url || !secret) return { ok: false, reason: 'noconf' };
    try {
      const res = await fetch(`${url}/backup?profile=${PROFILE}`, { headers: { 'x-secret': secret } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      return data;   // { ok, empty, savedAt, blob }
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // L'appareil est-il "vierge" (aucune donnée d'app significative) ?
  function localIsEmpty() {
    const coffre = localStorage.getItem('top8_coffre');
    const hasCoffre = coffre && coffre !== '[]' && coffre !== 'null';
    const hasPrefs  = !!localStorage.getItem('top8_player_prefs');
    const hasPreset = !!localStorage.getItem('dc_preset');
    return !hasCoffre && !hasPrefs && !hasPreset;
  }

  async function restoreFromBot(opts) {
    opts = opts || {};
    const data = await pull();
    if (!data.ok) { if (!opts.silent) alert('❌ Restauration impossible : ' + (data.reason || 'inconnu')); return false; }
    if (data.empty || !data.blob) { if (!opts.silent) alert('ℹ️ Aucune sauvegarde trouvée sur le bot.'); return false; }
    await applyBlob(data.blob);
    _state.lastSync = data.savedAt || _state.lastSync;
    try { localStorage.setItem('backup_last_sync', _state.lastSync || ''); } catch (_) {}
    return true;
  }

  // ── UI (onglet Configuration) ──
  function renderStatus() {
    const el = document.getElementById('backupSyncStatus');
    if (!el) return;
    const { url, secret } = botCreds();
    if (!url || !secret) { el.textContent = '⚠️ Configure d\'abord l\'URL du bot + le secret ci-dessus.'; el.style.color = '#b06000'; return; }
    if (_state.pushing)   { el.textContent = '⏳ Sauvegarde en cours…'; el.style.color = '#555'; return; }
    if (_state.lastError) { el.textContent = '❌ Dernière erreur : ' + _state.lastError; el.style.color = '#c0392b'; return; }
    if (_state.lastSync) {
      const d = new Date(_state.lastSync);
      el.textContent = '✅ Dernière sauvegarde : ' + (isNaN(d) ? _state.lastSync : d.toLocaleString('fr-FR'));
      el.style.color = '#2e7d52';
    } else {
      el.textContent = 'Aucune sauvegarde encore poussée.';
      el.style.color = '#666';
    }
  }

  window.backupPushNow = async function () {
    const ok = await pushNow('manual');
    renderStatus();
    if (ok) alert('✅ Données sauvegardées sur le bot.');
    else if (!_state.lastError) alert('ℹ️ Rien à sauvegarder (ou bot non configuré).');
    else alert('❌ Échec de la sauvegarde : ' + _state.lastError);
  };

  window.backupRestoreNow = async function () {
    if (!confirm('Restaurer les données depuis le bot ?\n\nLes layouts, presets et préférences enregistrés sur le bot vont remplacer/compléter ceux de cet appareil. La page se rechargera ensuite.')) return;
    const ok = await restoreFromBot({ silent: false });
    if (ok) { alert('✅ Données restaurées. La page va se recharger.'); location.reload(); }
  };

  // ── INIT ──
  // 1) Intercepte les écritures localStorage des clés de l'app → push débouncé.
  localStorage.setItem = function (key, value) {
    const r = _origSetItem(key, value);
    try { if (!_restoring && isAppKey(key) && key !== 'backup_last_sync') schedulePush(); } catch (_) {}
    return r;
  };
  // Permet aux autres modules (ex. layout-maker après écriture IndexedDB) de
  // déclencher explicitement une sauvegarde.
  window.backupSchedulePush = schedulePush;

  // 2) Au démarrage : restaure automatiquement si l'appareil est vierge.
  function init() {
    _state.lastSync = localStorage.getItem('backup_last_sync') || null;
    renderStatus();
    const { url, secret } = botCreds();
    if (!url || !secret) return;
    setTimeout(async () => {
      const data = await pull();
      if (data.ok && !data.empty && data.blob) {
        // Garde anti-boucle : on n'auto-restaure+recharge qu'une fois par session.
        const already = sessionStorage.getItem('backup_autorestored');
        if (localIsEmpty() && !already) {
          // Appareil neuf → on restaure en silence puis recharge pour appliquer.
          try { sessionStorage.setItem('backup_autorestored', '1'); } catch (_) {}
          await applyBlob(data.blob);
          _state.lastSync = data.savedAt || null;
          try { localStorage.setItem('backup_last_sync', _state.lastSync || ''); } catch (_) {}
          renderStatus();
          location.reload();
        } else {
          // Données locales présentes : on ne touche à rien automatiquement.
          _state.lastSync = data.savedAt || _state.lastSync;
          renderStatus();
        }
      } else {
        // Rien sur le bot encore → pousse l'état local courant comme base.
        if (!localIsEmpty()) pushNow('auto');
      }
    }, 1500);
  }

  // 3) Flush best-effort quand l'onglet se ferme / passe en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(_pushTimer); pushNow('unload'); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
