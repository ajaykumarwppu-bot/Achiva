/* ================================================================
   CORE / STORAGE.JS — localStorage persistence for achiva
   ----------------------------------------------------------------
   Responsibility:
     • App ke data (subjects + chapters) ko localStorage mein
       save / load karna.
     • Features (jaise subject tracker ka list.js) is file ko
       call karke apna state persist karte hain.
     • Yahan koi UI logic NAHI hogi — sirf data storage.
   ================================================================ */

(function () {
  'use strict';

  var KEY = 'achiva.subjectTracker.v1';

  /* ---------- load : localStorage se state padho ---------- */
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
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
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false; /* localStorage unavailable (private mode etc.) */
    }
  }

  /* ---------- clear : saved data hatao ---------- */
  function clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }

  /* ---------- generic keys : doosre features (canvas etc.) apna
     data alag key par rakhte hain, same safe pattern ---------- */
  function loadAt(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveAt(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  window.AppStorage = {
    load: load,
    save: save,
    clear: clear,
    loadAt: loadAt,
    saveAt: saveAt
  };
})();
