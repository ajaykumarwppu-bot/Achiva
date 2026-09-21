/* ================================================================
   FEATURES / SUBJECT TRACKER / STUDY-TIMER.JS — timer + complete-alarm
   ----------------------------------------------------------------
   Countdown + stopwatch (native TimerService + browser fallback),
   timer-complete alarm (WebAudio beep + in-app modal), aur
   window.AchivaStudySave native save-hook.
   ================================================================ */

(function () {
  'use strict';
  if (window.__achivaSTTimerLoaded) return;
  window.__achivaSTTimerLoaded = true;
  var el = UI.el, esc = UI.esc, uid = UI.uid;

  var ST = window.ST;
  var ICON_CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  var ICON_CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var studyState = null;   /* { mode:'count'|'stop', countdownMs, startEpoch, accMs, running } */
  var studyTick = null;

  function nativeTimer() {
    var n = window.AchivaNative;
    try {
      return (n && n.timerAvailable && n.timerAvailable() === '1') ? n : null;
    } catch (e) { return null; }
  }

  function fmtTimer(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60;
    return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s2).padStart(2, '0');
  }

  var studyContext = null;   /* { subjectId, subjectName, chapterId, chapterName } */

  function studyStatus() {
    var n = nativeTimer();
    if (n) {
      try { return JSON.parse(n.timerStatus()); } catch (e) { /* fall through */ }
    }
    if (!studyState) return { running: false, mode: 'stop', remainingMs: 0, elapsedMs: 0 };
    var el2 = studyState.running ? (Date.now() - studyState.startEpoch) : 0;
    var total = studyState.accMs + el2;
    return {
      running: studyState.running,
      mode: studyState.mode,
      elapsedMs: total,
      remainingMs: studyState.mode === 'count' ? Math.max(0, studyState.countdownMs - total) : 0,
      finished: studyState.mode === 'count' && total >= studyState.countdownMs
    };
  }

  function studyStart(mode, countdownMs) {
    ensureAudio();          /* user-gesture : baad mein alarm-beep autoplay ke liye */
    var n = nativeTimer();
    studyState = {
      mode: mode, countdownMs: countdownMs || 0,
      startEpoch: Date.now(), accMs: 0, running: true
    };
    if (n) { try { n.timerStart(mode === 'count' ? countdownMs : 0); } catch (e) { /* fallback */ } }
    ensureGlobalTick();
    paintPopup();
  }

  /* popup band ho tab bhi countdown-complete record ho (browser fallback) */
  /* ek hi session do baar save na ho (web + native dono save karte hain) */
  function alreadyRecorded(startMs) {
    try {
      var d = ST.studyStore() || [];
      for (var i = 0; i < d.length; i++) {
        if (d[i] && typeof d[i].startMs === 'number' && Math.abs(d[i].startMs - startMs) < 3000) return true;
      }
    } catch (e) { }
    return false;
  }

  function ensureGlobalTick() {
    if (studyTick) return;
    studyTick = setInterval(function () {
      if (!studyState) return;
      var st = studyStatus();
      if (st.finished) {
        /* BUG-#003 fix : web KHUD record karta hai (native par nirbhar nahi).
           Dedupe guard taaki web + native dono milakar double-save na karein. */
        var startMs = Date.now() - st.elapsedMs;
        if (!alreadyRecorded(startMs)) {
          ST.recordStudy(st.elapsedMs, startMs);
        }
        studyState = null;
        ST.refreshLists();
        paintPopup();
        var nat = nativeTimer();
        if (!nat) {
          /* Browser : in-app alarm modal + beep (APK mein native AlarmActivity UI deta hai) */
          openWebAlarm(st.elapsedMs);
        }
      }
    }, 500);
  }

  function studyPause() {
    var st = studyStatus();
    var n = nativeTimer();
    if (n) { try { n.timerPause(); } catch (e) { } }
    if (studyState) {
      studyState.accMs = st.elapsedMs;
      studyState.running = false;
    }
    paintPopup();
  }

  function studyResume() {
    var n = nativeTimer();
    if (n) { try { n.timerResume(); } catch (e) { } }
    if (studyState) { studyState.startEpoch = Date.now(); studyState.running = true; }
    paintPopup();
  }

  function studyStop() {
    var st = studyStatus();
    var n = nativeTimer();
    var startMs = Date.now() - st.elapsedMs;
    if (n) { try { n.timerStop(); } catch (e) { } }
    ST.recordStudy(st.elapsedMs, startMs);
    studyState = null;
    ST.refreshLists();
    paintPopup();
  }

  /* ================================================================
     TIMER-COMPLETE ALARM (browser fallback) + native save hook
  ================================================================ */
  var audioCtx = null;
  var beepNodes = null;

  function ensureAudio() {
    /* user-gesture (timer Start) par banaya jaata hai taaki baad mein autoplay ho */
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) { } }
  }

  function startBeep() {
    if (!audioCtx) return;
    stopBeep();
    try {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      var lfo = audioCtx.createOscillator();      /* alarm-jaisa pulsing */
      var lfoGain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      lfo.type = 'sine';
      lfo.frequency.value = 2.2;
      lfoGain.gain.value = 0.4;
      gain.gain.value = 0.5;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); lfo.start();
      beepNodes = { osc: osc, gain: gain, lfo: lfo };
    } catch (e) { beepNodes = null; }
  }
  function stopBeep() {
    if (!beepNodes) return;
    try { beepNodes.osc.stop(); beepNodes.lfo.stop(); } catch (e) { }
    try { beepNodes.gain.disconnect(); } catch (e) { }
    beepNodes = null;
  }

  var webAlarmModal = UI.modal({ zScrim: 95, zWrap: 96 });
  function openWebAlarm(elapsedMs) {
    startBeep();
    webAlarmModal.open('⏰ Time khatam!', function (body) {
      var big = el('div', null, ST.fmtHMS(elapsedMs));
      big.style.cssText = 'font-family:var(--f-mono);font-size:34px;font-weight:700;color:#2ea043;margin:2px 0 10px';
      body.appendChild(big);
      body.appendChild(el('div', null, 'Session save ho gaya. Ab extend karein ya band karein.'));
      var row = el('div');
      row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:12px 0';
      [3, 5, 60].forEach(function (m) {
        var b = UI.pillBtn('+' + m + ' min');
        b.addEventListener('click', function () {
          stopBeep();
          webAlarmModal.close();
          studyStart('count', m * 60000);
        });
        row.appendChild(b);
      });
      body.appendChild(row);
      var cust = el('div');
      cust.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:12px';
      var inp = el('input');
      inp.type = 'number';
      inp.placeholder = 'custom minutes';
      inp.style.cssText = UI.fieldCss + ';flex:1';
      var ex = UI.pillBtn('Extend');
      ex.addEventListener('click', function () {
        var m = parseInt(inp.value, 10);
        if (!m || m < 1) return;
        stopBeep();
        webAlarmModal.close();
        studyStart('count', m * 60000);
      });
      cust.appendChild(inp); cust.appendChild(ex);
      body.appendChild(cust);
      var stopB = UI.solidBtn('Stop & Save');
      stopB.addEventListener('click', function () {
        stopBeep();
        var n = nativeTimer();
        if (n) { try { n.timerStopAlarm(); } catch (e) { } }
        webAlarmModal.close();
        ST.refreshLists();
      });
      body.appendChild(stopB);
    }, null);
    var sv = webAlarmModal.sheet.querySelector('.sheet-actions .btn-solid');
    if (sv) sv.style.display = 'none';
  }

  /* native (AlarmActivity) isi ko call karti hai completed session save ke liye */
  window.AchivaStudySave = function (ms, startMs) {
    /* agar web ne pehle hi ye session record kar liya hai to dobara mat save karo */
    if (!alreadyRecorded(startMs)) {
      ST.recordStudy(ms, startMs);
    }
    ST.refreshLists();
    try { paintPopup(); } catch (e) { }
  };

  var timerModal = UI.modal({ zScrim: 91, zWrap: 92 });
  var popupTick = null;
  var popupRefs = null;

  /* chhota popup : countdown / stopwatch / controls */
  function openTimerPopup() {
    timerModal.open('Study Timer', function (body) {
      var disp = el('div', null, '00:00');
      disp.style.cssText = 'font-family:var(--f-mono);font-size:32px;font-weight:700;' +
        'color:var(--ink);margin:2px 0 10px';
      body.appendChild(disp);

      body.appendChild(UI.label('Countdown (reverse) :'));
      var crow = el('div');
      crow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px';
      [['25m', 25], ['45m', 45], ['90m', 90], ['1h', 60], ['1.5h', 90], ['2h', 120]].forEach(function (p, i) {
        var mins = [25, 45, 90, 60, 90, 120][i];
        var b = UI.pillBtn(p[0]);
        b.addEventListener('click', function () { studyStart('count', mins * 60000); });
        crow.appendChild(b);
      });
      body.appendChild(crow);

      var cust = el('div');
      cust.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:12px';
      var minInp = el('input');
      minInp.type = 'number';
      minInp.placeholder = 'minutes (1-120)';
      minInp.style.cssText = UI.fieldCss + ';flex:1';
      var cstart = UI.pillBtn('Start');
      cstart.addEventListener('click', function () {
        var m2 = parseInt(minInp.value, 10);
        if (!m2 || m2 < 1) return;
        studyStart('count', m2 * 60000);
      });
      cust.appendChild(minInp);
      cust.appendChild(cstart);
      body.appendChild(cust);

      body.appendChild(UI.label('Stopwatch :'));
      var swBtn = UI.pillBtn('Start Stopwatch');
      swBtn.style.marginBottom = '12px';
      swBtn.addEventListener('click', function () { studyStart('stop', 0); });
      body.appendChild(swBtn);

      var ctrl = el('div');
      ctrl.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      var pauseB = UI.solidBtn('Pause');
      pauseB.addEventListener('click', studyPause);
      var resumeB = UI.solidBtn('Resume');
      resumeB.addEventListener('click', studyResume);
      var stopB = UI.solidBtn('Stop + Save');
      stopB.addEventListener('click', studyStop);
      ctrl.appendChild(pauseB); ctrl.appendChild(resumeB); ctrl.appendChild(stopB);
      body.appendChild(ctrl);

      var note = el('div', 'sub-meta', '');
      note.style.marginTop = '8px';
      body.appendChild(note);

      popupRefs = { disp: disp, pauseB: pauseB, resumeB: resumeB, stopB: stopB, note: note };
      paintPopup();
    }, null);

    if (popupTick) clearInterval(popupTick);
    popupTick = setInterval(function () {
      if (!timerModal.isOpen()) {
        clearInterval(popupTick); popupTick = null; return;
      }
      paintPopup();   /* completion record global tick karta hai */
    }, 500);
  }

  function paintPopup() {
    if (!popupRefs) return;
    var st = studyStatus();
    popupRefs.disp.textContent =
      st.mode === 'count' ? fmtTimer(st.remainingMs) : fmtTimer(st.elapsedMs);
    popupRefs.pauseB.style.opacity = st.running ? '1' : '.4';
    popupRefs.resumeB.style.opacity = (!st.running && studyState) ? '1' : '.4';
    popupRefs.stopB.style.opacity = studyState ? '1' : '.4';
    popupRefs.note.textContent = nativeTimer()
      ? (st.running ? 'Timer background mein chal raha hai - notification mein live.' : 'Timer ready.')
      : 'Browser mode : timer chalega, notification APK version mein.';
  }

  window.ST.openTimerPopup = openTimerPopup;
  window.ST.paintTimerPopup = paintPopup;
  window.ST.studyStart = studyStart;
  window.ST.studyStop = studyStop;
})();
