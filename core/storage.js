/* ================================================================
   CORE / STORAGE.JS — localStorage persistence for achiva
   ----------------------------------------------------------------
   Responsibility:
     • App ke data (subjects + chapters) ko localStorage mein
       save / load karna.
     • Features (jaise subject tracker ka list.js) is file ko
       call karke apna state persist karte hain.
     • Yahan koi UI logic NAHI hogi — sirf data storage.

   PER-ACCOUNT ISOLATION (v2):
     • Har logged-in user ka data alag namespace mein:
         physical key = 'u/<uid>/<logical-key>'
     • Namespace uid localStorage['achiva.ns.v1'] mein rakha jata hai
       taaki page parse hote hi (auth resolve hone se PEHLE) sahi
       account ka data padha jaye.
     • 'achiva.prefs.v1' (theme etc.) device-level rahta hai (shared).
     • Sign-out par namespace null → koi account data nahi dikhta.
     • adoptLegacy(): upgrade se pehle wala unprefixed data pehli
       login par us account ke namespace mein MOVE ho jata hai.
   ================================================================ */

(function () {
  'use strict';

  var KEY = 'achiva.subjectTracker.v1';
  var NSKEY = 'achiva.ns.v1';
  var PREFS_KEY = 'achiva.prefs.v1';   /* device-level, shared */

  /* ye saari app-data keys account-namespace mein rahti hain */
  var DATA_KEYS = [
    'achiva.subjectTracker.v1',
    'achiva.canvas.v1',
    'achiva.timer.study.v1',
    'achiva.timer.manual.v1',
    'achiva.canvas.savedColors'
  ];

  /* ---------- namespace ---------- */
  function readNs() {
    try { return window.localStorage.getItem(NSKEY) || null; } catch (e) { return null; }
  }
  var NS = readNs();

  function ns() { return NS; }

  function setNamespace(uid) {
    NS = uid || null;
    try {
      if (NS) window.localStorage.setItem(NSKEY, NS);
      else window.localStorage.removeItem(NSKEY);
    } catch (e) { /* ignore */ }
  }

  /* logical key → physical (account-scoped) key */
  function phys(key) {
    if (!NS || key === PREFS_KEY) return key;
    return 'u/' + NS + '/' + key;
  }

  /* upgrade migration: purana unprefixed data → current account namespace */
  function adoptLegacy() {
    if (!NS) return;
    try {
      DATA_KEYS.forEach(function (k) {
        var pk = phys(k);
        if (window.localStorage.getItem(pk) === null) {
          var v = window.localStorage.getItem(k);
          if (v !== null) {
            window.localStorage.setItem(pk, v);
            window.localStorage.removeItem(k);
          }
        }
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- raw (string) access, namespace-aware ---------- */
  function rawGet(key) {
    try { return window.localStorage.getItem(phys(key)); } catch (e) { return null; }
  }
  function rawSet(key, val) {
    try { window.localStorage.setItem(phys(key), val); return true; } catch (e) { return false; }
  }
  function rawDel(key) {
    try { window.localStorage.removeItem(phys(key)); } catch (e) { /* ignore */ }
  }

  /* ---------- load : localStorage se state padho ---------- */
  function load() {
    try {
      var raw = rawGet(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.subjects)) return null;
      return data;
    } catch (e) {
      return null; /* localStorage unavailable / corrupt data */
    }
  }

  /* ---------- save : state ko localStorage mein likho ---------- */
  function save(state) {
    return rawSet(KEY, JSON.stringify(state));
  }

  /* ---------- clear : saved data hatao ---------- */
  function clear() {
    rawDel(KEY);
  }

  /* ---------- generic keys : doosre features (canvas etc.) apna
     data alag key par rakhte hain, same safe pattern ---------- */
  function loadAt(key) {
    try {
      var raw = rawGet(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveAt(key, value) {
    return rawSet(key, JSON.stringify(value));
  }

  window.AppStorage = {
    load: load,
    save: save,
    clear: clear,
    loadAt: loadAt,
    saveAt: saveAt,
    rawGet: rawGet,
    rawSet: rawSet,
    rawDel: rawDel,
    ns: ns,
    setNamespace: setNamespace,
    adoptLegacy: adoptLegacy,
    DATA_KEYS: DATA_KEYS,
    PREFS_KEY: PREFS_KEY
  };
})();
