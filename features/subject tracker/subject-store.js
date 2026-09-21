/* ================================================================
   FEATURES / SUBJECT TRACKER / SUBJECT-STORE.JS — data + study-store
   ----------------------------------------------------------------
   Sirf DATA : subjects/chapters/tests/errors state, persist,
   progress helpers, aur study-time log (recordStudy / studyMsFor*).
   Koi UI nahi. Sab kuch window.ST par expose.
   ================================================================ */

(function () {
  'use strict';
  if (window.__achivaSTStoreLoaded) return;
  window.__achivaSTStoreLoaded = true;

  var el = UI.el, esc = UI.esc, uid = UI.uid;

  var state = { subjects: [] };
  var saved = window.AppStorage ? window.AppStorage.load() : null;
  if (saved) state = saved;
  if (!Array.isArray(state.tests)) state.tests = [];
  if (!Array.isArray(state.errors)) state.errors = [];

  function persist() {
    if (window.AppStorage) window.AppStorage.save(state);
  }

  var studyContext = null;   /* { subjectId, subjectName, chapterId, chapterName } */
  var STUDY_KEY = 'achiva.timer.study.v1';

  /* ================================================================
     HELPERS
  ================================================================ */
  /* core/ui.js ke saanjhe tools (naam wahi → baaki code untouched) */

  /* done chapters ka count (abhi koi chapter done mark nahi hota,
     baad ke features mein c.done set hoga) */
  function doneCount(subject) {
    return subject.chapters.filter(function (c) { return c.done; }).length;
  }

  function pctOf(done, total) {
    return total ? Math.round((done / total) * 100) : 0;
  }

  /* inline SVG icons */
  /* bottom tab icons */

  var app = document.getElementById('app');

  var STUDY_KEY = 'achiva.timer.study.v1';
  var studyContext = null;   /* { subjectId, subjectName, chapterId, chapterName } */
  function recordStudy(ms, startMs) {
    if (ms < 1000) return;
    var d = window.AppStorage.loadAt(STUDY_KEY) || [];
    if (!Array.isArray(d)) d = [];
    var c = studyContext || {};
    d.push({
      id: uid(),
      label: 'Study: ' + (c.chapterName || c.subjectName || 'Chapter'),
      subjectId: c.subjectId || null,
      subjectName: c.subjectName || '',
      chapterId: c.chapterId || null,
      chapterName: c.chapterName || '',
      startMs: startMs, endMs: startMs + ms, ms: ms
    });
    window.AppStorage.saveAt(STUDY_KEY, d);
  }

  function studyStore() {
    var d = window.AppStorage.loadAt(STUDY_KEY);
    return Array.isArray(d) ? d : [];
  }

  function studyMsForChapter(chId) {
    return studyStore().reduce(function (a, e) {
      return a + (e.chapterId === chId ? (e.ms || 0) : 0);
    }, 0);
  }

  function studyMsForSubject(subId) {
    return studyStore().reduce(function (a, e) {
      return a + (e.subjectId === subId ? (e.ms || 0) : 0);
    }, 0);
  }

  function fmtHMS(ms) {
    var t = Math.floor(ms / 1000);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60;
    /* 1 ghante se kam par "0h" nahi dikhate — sirf "25m 09s" */
    return (h > 0 ? h + 'h ' : '') +
      String(m).padStart(2, '0') + 'm ' + String(s2).padStart(2, '0') + 's';
  }
  window.ST = {
    state: state,
    persist: persist,
    doneCount: doneCount,
    pctOf: pctOf,
    getStudyContext: function () { return studyContext; },
    setStudyContext: function (c) { studyContext = c; },
    recordStudy: recordStudy,
    studyStore: studyStore,
    studyMsForChapter: studyMsForChapter,
    studyMsForSubject: studyMsForSubject,
    fmtHMS: fmtHMS
  };
})();
