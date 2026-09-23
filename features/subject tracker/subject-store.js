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

  var STUDY_KEY = 'achiva.timer.study.v1';
  var CTX_KEY = 'achiva.timer.ctx.v1';   /* TIMER-FIX (Bug F): context persist hota hai
                                            taaki page-reload ke baad native save bhi
                                            sahi subject/chapter se jude */
  var studyContext = null;   /* { subjectId, subjectName, chapterId, chapterName } */
  try { studyContext = window.AppStorage.loadAt(CTX_KEY) || null; } catch (e) { studyContext = null; }

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

  /* (duplicate STUDY_KEY/studyContext declarations hata diye — TIMER-FIX:
     upar wala restore na toote) */
  function recordStudy(ms, startMs, sessionId) {
    if (!(ms >= 1000)) return;               /* NaN/negative/1s-se-kam guard */
    var d = window.AppStorage.loadAt(STUDY_KEY) || [];
    if (!Array.isArray(d)) d = [];
    var c = studyContext || {};
    d.push({
      id: uid(),
      sessionId: sessionId || null,          /* TIMER-FIX (Bug C): dedupe ab exact id se */
      label: 'Study: ' + (c.chapterName || c.subjectName || 'Chapter'),
      subjectId: c.subjectId || null,
      subjectName: c.subjectName || '',
      chapterId: c.chapterId || null,
      chapterName: c.chapterName || '',
      startMs: startMs, endMs: startMs + ms, ms: ms
    });
    window.AppStorage.saveAt(STUDY_KEY, d);
    /* TIMER-FIX (Bug D): session save sabse critical write hai — pending IDB
       transaction ko turant commit karne ki koshish (fire-and-forget; flush
       kabhi reject nahi hota). Isse "save ke turant baad app band → data gaya"
       ki race window lagbhag khatam. */
    try { if (window.AppStorage.flush) window.AppStorage.flush(); } catch (e) { }
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
    setStudyContext: function (c) {
      studyContext = c;
      /* TIMER-FIX (Bug F): reload ke baad bhi context zinda rahe */
      try { window.AppStorage.saveAt(CTX_KEY, c || null); } catch (e) { }
    },
    recordStudy: recordStudy,
    studyStore: studyStore,
    studyMsForChapter: studyMsForChapter,
    studyMsForSubject: studyMsForSubject,
    fmtHMS: fmtHMS
  };
})();
