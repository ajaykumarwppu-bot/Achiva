/* ================================================================
   FEATURES / TIMER / TIMER.JS  —  TIME screen (screen-time data)
   ----------------------------------------------------------------
   • FAB ke TIME button se khulti hai
   • DO mode :
       LIVE   : APK ka native bridge → phone ka real data
                (total screen time, har app ka total + exact
                sessions : 9:13–10:15 waghera) — on-demand fetch
       MANUAL : bridge na ho (browser) → user khud sessions add
                kare (app name + start + end), localStorage mein
   • Refresh button : dobara fetch (koi background polling nahi)
   • App row expand karo → saari sessions ki ranges dikhti hain
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaTimerLoaded) return;
  window.__achivaTimerLoaded = true;

  var el = UI.el, esc = UI.esc, uid = UI.uid;
  var ICON_REFRESH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>';
  var MKEY = 'achiva.timer.manual.v1';

  function bridge() { return window.SubjectListBridge; }

  /* ---------- manual store ---------- */
  function manualData() {
    var d = window.AppStorage.loadAt(MKEY);
    if (!d || typeof d !== 'object') d = {};
    return d;
  }
  function saveManual(d) {
    window.AppStorage.saveAt(MKEY, d);
  }
  function todayKey() {
    return UI.todayISO();
  }

  /* ---------- time formats ---------- */
  function fmtMs(ms) {
    var tot = Math.round(ms / 1000);
    var h = Math.floor(tot / 3600);
    var m = Math.floor((tot % 3600) / 60);
    var s2 = tot % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s2 + 's';
    return s2 + 's';
  }
  function fmtClock(ms) {
    var d = new Date(ms);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function minsBetween(a, b) {
    var pa = a.split(':'), pb = b.split(':');
    return Math.max(0, (+pb[0] * 60 + +pb[1]) - (+pa[0] * 60 + +pa[1]));
  }

  /* ---------- screen ---------- */
  var screen = el('section', 'screen');
  screen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(screen);

  var liveData = null;   /* native se aaya hua aaj ka data */

  function openTime() {
    render();
    bridge().show(screen, true);
    refresh();
  }

  function refresh() {
    if (window.TimerBridge && window.TimerBridge.available()) {
      window.TimerBridge.fetchToday(function (data) {
        liveData = data;
        render();
      });
    } else {
      liveData = null;
      render();
    }
  }

  function liveMode() {
    return !!(window.TimerBridge && window.TimerBridge.available() &&
      window.TimerBridge.hasPermission() && liveData);
  }

  /* ---------- render ---------- */
  function render() {
    screen.innerHTML = '';

    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 18px 4px';
    /* back arrow NAHI : Time ek top-level feature hai (kisi cheez ke
       andar nahi) — is par aana-jaana FAB (menu button) se hota hai */
    var tw = el('div', 'sub-title-wrap');
    tw.style.flex = '1';
    tw.appendChild(el('h2', null, 'Time'));
    tw.appendChild(el('div', 'sub-meta', liveMode() ? 'Phone data (live)' : 'Manual mode'));
    head.appendChild(tw);
    var rf = el('button', 'icon-btn', ICON_REFRESH);
    rf.type = 'button';
    rf.setAttribute('aria-label', 'Refresh');
    rf.addEventListener('click', refresh);
    head.appendChild(rf);
    screen.appendChild(head);

    var wrap = el('div', 'scroll');

    /* native hai par permission nahi → guide panel */
    if (window.TimerBridge && window.TimerBridge.available() &&
        !window.TimerBridge.hasPermission()) {
      var pp = UI.panel();
      pp.appendChild(el('div', 'sub-meta',
        'Phone ka usage data lene ke liye Usage Access permission chahiye.'));
      var pb = UI.pillBtn('Enable Usage Permission');
      pb.style.marginTop = '10px';
      pb.addEventListener('click', function () {
        window.TimerBridge.requestPermission();
      });
      pp.appendChild(pb);
      wrap.appendChild(pp);
    }

    /* browser fallback notice */
    if (!(window.TimerBridge && window.TimerBridge.available())) {
      var np = UI.panel();
      np.appendChild(el('div', 'sub-meta',
        'Browser mode : phone ka real usage data yahan nahi milta ' +
        '(wo APK version mein milta hai). Abhi ke liye aap manually ' +
        'sessions add kar sakte hain — total neeche calculate hoga.'));
      wrap.appendChild(np);
    }

    /* ---------- data ikatha karo ---------- */
    var apps = [];   /* { name, totalMs, sessions:[{label,durMs}] } */
    if (liveMode()) {
      (liveData.apps || []).forEach(function (a) {
        apps.push({
          name: a.name,
          totalMs: a.totalMs,
          sessions: (a.sessions || []).map(function (s) {
            return {
              label: fmtClock(s.startMs) + ' – ' + fmtClock(s.endMs),
              durMs: s.endMs - s.startMs
            };
          })
        });
      });
    } else {
      var md = manualData()[todayKey()] || [];
      var byName = {};
      md.forEach(function (s) {
        if (!byName[s.name]) byName[s.name] = { name: s.name, totalMs: 0, sessions: [] };
        var mins = minsBetween(s.start, s.end);
        byName[s.name].totalMs += mins * 60000;
        byName[s.name].sessions.push({
          label: s.start + ' – ' + s.end,
          durMs: mins * 60000,
          id: s.id
        });
      });
      Object.keys(byName).forEach(function (k) { apps.push(byName[k]); });
      apps.sort(function (a, b) { return b.totalMs - a.totalMs; });
    }

    /* ---------- total card ---------- */
    var totalMs = apps.reduce(function (s, a) { return s + a.totalMs; }, 0);
    var tp = UI.panel();
    var tl = el('div', 'eyebrow', 'Today · screen time');
    tp.appendChild(tl);
    var big = el('div', null, fmtMs(totalMs));
    big.style.cssText = 'font-family:var(--f-disp);font-size:34px;font-weight:700;color:var(--ink);margin:4px 0';
    tp.appendChild(big);
    tp.appendChild(el('div', 'sub-meta',
      apps.length + ' apps · ' +
      apps.reduce(function (s, a) { return s + a.sessions.length; }, 0) + ' sessions'));
    wrap.appendChild(tp);

    /* ---------- study sessions (chapter study timer ka data) ---------- */
    var SKEY = 'achiva.timer.study.v1';
    var study = window.AppStorage.loadAt(SKEY);
    if (!Array.isArray(study)) study = [];
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayStudy = study.filter(function (e) { return e.startMs >= todayStart.getTime(); });
    if (todayStudy.length) {
      var sp2 = UI.panel();
      sp2.appendChild(UI.panelTitle('Study Sessions'));
      var stMs = todayStudy.reduce(function (a, b) { return a + (b.ms || 0); }, 0);
      sp2.appendChild(el('div', 'sub-meta', 'Aaj ka study time : ' + fmtMs(stMs)));
      todayStudy.slice().reverse().forEach(function (e) {
        var row = el('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:5px 0;' +
          'font-size:12px;color:var(--ink2);border-top:1px solid var(--line);margin-top:5px';
        var d0 = new Date(e.startMs);
        var lbl = e.subjectName
          ? (e.subjectName + (e.chapterName ? ' \u2192 ' + e.chapterName : ''))
          : (e.label || 'Study');
        row.appendChild(el('span', null,
          esc(lbl) + ' \u00b7 ' + d0.getHours() + ':' + String(d0.getMinutes()).padStart(2, '0')));
        row.appendChild(el('span', 'sub-meta', fmtMs(e.ms)));
        sp2.appendChild(row);
      });
      wrap.appendChild(sp2);
    }

    /* ---------- manual add panel ---------- */
    if (!liveMode()) {
      var ap = UI.panel();
      ap.appendChild(UI.panelTitle('Add Session'));
      var nf = UI.inputField('App name', 'e.g. Instagram');
      var sf = UI.inputField('Start', '09:13', 'time');
      var ef = UI.inputField('End', '10:15', 'time');
      ap.appendChild(nf.wrap); ap.appendChild(sf.wrap); ap.appendChild(ef.wrap);
      var sb = UI.solidBtn('Save Session');
      sb.addEventListener('click', function () {
        var name = nf.input.value.trim();
        if (!name || !sf.input.value || !ef.input.value) return;
        var d = manualData();
        var k = todayKey();
        if (!d[k]) d[k] = [];
        d[k].push({ id: uid(), name: name, start: sf.input.value, end: ef.input.value });
        saveManual(d);
        render();
      });
      ap.appendChild(sb);
      wrap.appendChild(ap);
    }

    /* ---------- app list ---------- */
    if (!apps.length) {
      wrap.appendChild(el('div', 'empty',
        liveMode() ? 'Aaj koi usage data nahi mila.' : 'Koi session nahi — upar se add karo.'));
    }
    apps.forEach(function (a) {
      var card = el('div', 'sub-card');
      card.style.padding = '12px 30px 12px 12px';
      var tile = el('div', 'sub-tile t2', esc((a.name || '?').charAt(0).toUpperCase()));
      tile.style.width = '40px'; tile.style.height = '40px';
      tile.style.borderRadius = '12px'; tile.style.fontSize = '16px';
      card.appendChild(tile);
      var main = el('div', 'sub-main');
      main.appendChild(el('h3', null, esc(a.name)));
      main.appendChild(el('div', 'sub-meta', fmtMs(a.totalMs) + ' · ' + a.sessions.length + ' sessions'));
      card.appendChild(main);
      card.appendChild(el('div', 'sub-meta', '▾'));

      var detail = el('div');
      detail.style.cssText = 'margin:0 18px 12px;padding:10px 12px;border:1px solid var(--line);' +
        'border-radius:12px;background:var(--tile-bg);display:none';
      a.sessions.forEach(function (s) {
        var row = el('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:4px 0;' +
          'font-size:12px;color:var(--ink2)';
        row.appendChild(el('span', null, esc(s.label)));
        row.appendChild(el('span', 'sub-meta', fmtMs(s.durMs)));
        detail.appendChild(row);
      });

      card.addEventListener('click', function () {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      });
      wrap.appendChild(card);
      wrap.appendChild(detail);
    });

    screen.appendChild(wrap);
  }

  window.TimerFeature = { open: openTime };

  /* native shell (MainActivity.onResume) is hook ko call karke
     permission-settings se wapas aane par data refresh karwata hai */
  window.__timerRefresh = refresh;
})();
