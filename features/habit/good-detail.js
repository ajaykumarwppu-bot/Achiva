/* ================================================================
   FEATURES / HABIT / GOOD-DETAIL.JS — good habit detail screen
   ----------------------------------------------------------------
   • head : circular back + habit name
   • Top par DO side-by-side boxes :
       LEFT  : ek box do parts mein —
                 upar  : bada dark number = CURRENT streak
                         just neeche label "current streak"
                         phir ek chhoti divider line
                 neeche : chhota number = BEST streak + label
       RIGHT : parallel box —
                 Start date (kab shuru hui)
                 divider
                 bada number = kitne days beet chuke (since start)
   • Aage ke sections (history, edits, graph) baad mein aayenge
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaGoodDetailLoaded) return;
  window.__achivaGoodDetailLoaded = true;

  var el = UI.el, esc = UI.esc;
  var G = function () { return window.GoodList; };

  var screen = el('section', 'screen');
  screen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(screen);

  function boxBase() {
    var b = el('div');
    b.style.cssText = 'flex:1;padding:14px;border:1px solid var(--line);border-radius:18px;' +
      'background:var(--tile-bg);box-shadow:inset 0 1px 0 var(--hl-soft);text-align:center';
    return b;
  }
  function divider() {
    var d = el('div');
    d.style.cssText = 'width:34px;height:1px;background:var(--s2);margin:8px auto';
    return d;
  }


  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  function monthKey(iso) { return iso.slice(0, 7); }
  function addMonths(mk, n) {
    var y = +mk.slice(0, 4), m = +mk.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function monthLabel(mk) { return MONTHS[+mk.slice(5, 7) - 1] + ' ' + mk.slice(2, 4); }
  function daysInMonth(mk) {
    return new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
  }
  function lerp(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  /* repetition ke hisaab se color : halka green → dark green */
  function repColor(h, date) {
    var done = G().repsOn(h, date);
    var total = h.repsPerDay || 1;
    if (done <= 0) return null;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var from = dark ? [36, 52, 42] : [207, 230, 207];
    var to = dark ? [86, 211, 100] : [46, 160, 67];
    var t = Math.min(1, done / total);
    return { bg: lerp(from, to, t), done: done >= total };
  }
  var TICK = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  /* ---------- month-wise streak panel (3 month rolling) ---------- */
  function streakPanel(h) {
    var p = UI.panel();
    p.style.cssText += ';margin:0 18px 12px';
    p.appendChild(UI.panelTitle('Streak box'));
    var today = UI.todayISO();
    var startMK = monthKey(h.startDate);
    var todayMK = monthKey(today);
    var fromMK = startMK > addMonths(todayMK, -2) ? startMK : addMonths(todayMK, -2);
    for (var mi = 0; mi < 3; mi++) {
      var mk = addMonths(fromMK, mi);
      var ml = el('div', null, monthLabel(mk));
      ml.style.cssText = 'font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
        'color:var(--slate);margin:' + (mi ? '10px' : '2px') + ' 0 5px';
      p.appendChild(ml);
      var wrap = el('div');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
      var dim = daysInMonth(mk);
      for (var d = 1; d <= dim; d++) {
        var iso = mk + '-' + String(d).padStart(2, '0');
        if (iso < h.startDate) continue;          /* start se pehle ke din nahi */
        var b = el('div');
        b.className = 'gh-box';
        var col = repColor(h, iso);
        if (iso > today) b.className += ' gh-fut';
        else if (col) {
          b.style.background = col.bg;
          b.style.borderColor = col.bg;
          if (col.done) {
            b.innerHTML = TICK;                    /* rep poori = tick */
            b.style.display = 'flex';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
          }
        }
        b.title = iso;
        wrap.appendChild(b);
      }
      p.appendChild(wrap);
    }
    return p;
  }


  /* ---------- formation / automaticity graph (GoodSystem se) ---------- */
  function formationPanel(h) {
    var GS = window.GoodSystem;
    var cs = GS.compute(h.logs || {}, {
      startDate: h.startDate, strict: h.strict || 3, repsPerDay: h.repsPerDay || 1
    }, UI.todayISO());
    var p = UI.panel();
    p.style.cssText += ';margin:0 18px 12px';

    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px';
    head.appendChild(UI.panelTitle('Habit Formation', true));
    var rb = UI.pillBtn('Detail');
    rb.style.cssText += ';padding:5px 11px;font-size:10.5px';
    rb.addEventListener('click', function () { rulesModal(h, cs); });
    head.appendChild(rb);
    p.appendChild(head);

    var sc = UI.chip(cs.stage.key);
    sc.style.cssText += ';background:var(--chip-bg);color:var(--ink2);border-color:var(--s2);margin-bottom:8px';
    p.appendChild(sc);
    if (cs.stage.key === 'Ignition L1') {
      var warn = el('div', null, 'Sabse hard level — in 7 din ko bilkul mat chhodo.');
      warn.style.cssText = 'font-size:10.5px;font-weight:700;color:#a06a00;background:rgba(160,106,0,.1);' +
        'border:1px solid rgba(160,106,0,.35);border-radius:10px;padding:6px 10px;margin-bottom:8px';
      p.appendChild(warn);
    }

    /* ---- stylish green area graph with axes ---- */
    var W = 300, H = 132, x0 = 30, y0 = 8, x1 = 294, y1 = 108;
    var series = cs.series;
    var maxDay = series.length ? series[series.length - 1].day : 1;
    function px(day) { return x0 + (day / Math.max(1, maxDay)) * (x1 - x0); }
    function py(A) { return y1 - (A / 100) * (y1 - y0); }
    var pts = series.map(function (q) { return px(q.day).toFixed(1) + ',' + py(q.A).toFixed(1); });
    var line = pts.join(' ');
    var area = 'M' + x0 + ',' + y1 + ' L' + pts.join(' L') + ' L' + px(maxDay).toFixed(1) + ',' + y1 + ' Z';
    var last = series.length ? series[series.length - 1] : null;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' +
      '<defs><linearGradient id="ghg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(46,160,67,.55)"/><stop offset="100%" stop-color="rgba(46,160,67,.06)"/>' +
      '</linearGradient></defs>' +
      /* axes */
      '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--s2)" stroke-width="1"/>' +
      '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--s2)" stroke-width="1"/>' +
      /* y ticks */
      '<text x="' + (x0 - 4) + '" y="' + (py(100) + 3) + '" font-size="7" fill="var(--ash)" text-anchor="end">100</text>' +
      '<text x="' + (x0 - 4) + '" y="' + (py(50) + 3) + '" font-size="7" fill="var(--ash)" text-anchor="end">50</text>' +
      '<text x="' + (x0 - 4) + '" y="' + (py(0) + 3) + '" font-size="7" fill="var(--ash)" text-anchor="end">0</text>' +
      /* axis labels */
      '<text x="8" y="' + ((y0 + y1) / 2) + '" font-size="8" fill="var(--slate)" transform="rotate(-90 8 ' + ((y0 + y1) / 2) + ')" text-anchor="middle">Habit Automate</text>' +
      '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 2) + '" font-size="8" fill="var(--slate)" text-anchor="middle">Days</text>' +
      /* area + line */
      (series.length ? '<path d="' + area + '" fill="url(#ghg)"/>' : '') +
      (series.length ? '<polyline points="' + line + '" fill="none" stroke="#2ea043" stroke-width="2" stroke-linejoin="round"/>' : '') +
      (last ? '<circle cx="' + px(last.day).toFixed(1) + '" cy="' + py(last.A).toFixed(1) + '" r="3.4" fill="#2ea043" stroke="#fff" stroke-width="1"/>' : '') +
      '</svg>';
    var gw = el('div');
    gw.innerHTML = svg;
    p.appendChild(gw);

    var foot = el('div');
    foot.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--slate)';
    foot.appendChild(el('span', null, 'Day 1'));
    var av = el('b', null, 'Automaticity ' + cs.automaticity + '%');
    av.style.cssText = 'color:var(--ink);font-size:11px';
    foot.appendChild(av);
    foot.appendChild(el('span', null, 'Day ' + maxDay));
    p.appendChild(foot);
    return p;
  }

  /* ---------- rules "Detail" modal ---------- */
  function rulesModal(h, cs) {
    var GS = window.GoodSystem;
    var m = UI.modal({ zScrim: 90, zWrap: 91 });
    m.open('Formation rules — ' + h.name, function (body) {
      function tbl(heads, rows) {
        var t = el('table');
        t.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;margin:6px 0 12px';
        var hr = el('tr');
        heads.forEach(function (x) {
          var th = el('th', null, x);
          th.style.cssText = 'text-align:left;padding:4px 6px;border-bottom:1px solid var(--line);color:var(--slate);font-weight:700';
          hr.appendChild(th);
        });
        t.appendChild(hr);
        rows.forEach(function (r) {
          var tr = el('tr');
          r.forEach(function (c) {
            var td = el('td', null, c);
            td.style.cssText = 'padding:4px 6px;border-bottom:1px solid var(--line);color:var(--ink2)';
            tr.appendChild(td);
          });
          t.appendChild(tr);
        });
        return t;
      }
      body.appendChild(UI.panelTitle('Stages (habit age)'));
      body.appendChild(tbl(['Stage', 'Days', 'Grace', 'Penalty'],
        GS.STAGES.map(function (x) { return [x.key, x.from + '–' + (x.to > 9000 ? '∞' : x.to), x.grace, Math.round(x.penalty * 100) + '%']; })));
      body.appendChild(UI.panelTitle('Strict levels'));
      body.appendChild(tbl(['Strict', 'Grace cap', 'Grace floor', 'Penalty ×'],
        Object.keys(GS.STRICT).map(function (k) { var v = GS.STRICT[k]; return [k, v.cap > 90 ? '∞' : v.cap, v.floor, v.mult]; })));
      body.appendChild(UI.panelTitle('Daily rules'));
      var rules = [
        'done (reps poori) → streak+1, automaticity badhti hai (front-loaded)',
        'minimum (chhota version) → streak+1, ~45% gain',
        'missed → gap+1; gap ≤ grace → streak safe, −' + GS.GRACE_DROP + '% ; gap > grace → streak=0, score ×(1−penalty)',
        'grace = clamp(stage.grace, strict.floor, strict.cap); floor sirf day ' + GS.FLOOR_FROM_DAY + '+ par',
        'penalty = stage.penalty × strict.mult',
        'stage = total COMPLETED days se (ek miss stage nahi girata)',
        'log edit sirf pichhle 2 din tak (backfill nahi)'
      ];
      rules.forEach(function (r) {
        var d = el('div', null, '• ' + r);
        d.style.cssText = 'font-size:10.5px;line-height:1.6;color:var(--ink2);padding:1px 0';
        body.appendChild(d);
      });
      var cur = el('div');
      cur.style.cssText = 'margin-top:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;' +
        'background:var(--chip-bg);font-size:10.5px;color:var(--ink2);line-height:1.7';
      var gp = GS.gracePenalty(cs.stageIdx, h.strict || 3, cs.totalDays);
      cur.innerHTML = 'Is habit par abhi : <b>Strict ' + (h.strict || 3) + '</b> · <b>' + cs.stage.key +
        '</b> · grace <b>' + gp.grace + '</b> · penalty <b>' + Math.round(gp.penalty * 100) + '%</b>';
      body.appendChild(cur);
      if (window.GoodSystemScenarios) {
        var tb = el('button', 'btn-ghost', 'View test scenarios');
        tb.style.width = '100%';
        tb.style.marginTop = '10px';
        tb.addEventListener('click', function () { m.close(); window.GoodSystemScenarios.open(); });
        body.appendChild(tb);
      }
    }, null);
    var sv = m.sheet.querySelector('.sheet-actions .btn-solid');
    if (sv) sv.style.display = 'none';
  }

  function open(id) {
    var h = G().get(id);
    if (!h) { G().openList(); return; }
    screen.innerHTML = '';
    var scroll = el('div', 'scroll');

    /* head */
    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px 6px';
    var back = UI.miniBtn(UI.icons.back, 'Back');
    back.style.cssText += ';width:34px;height:34px;border-radius:50%;border:1px solid var(--s2);background:var(--chip-bg)';
    back.addEventListener('click', function () { G().openList(); });
    head.appendChild(back);
    var tt = el('b', null, h.name);
    tt.style.cssText = 'flex:1;min-width:0;font-family:var(--f-disp);font-size:16px;font-weight:700;' +
      'color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    head.appendChild(tt);
    var keb = UI.miniBtn(UI.icons.kebab, 'Edit habit');
    keb.style.flex = 'none';
    keb.addEventListener('click', function () { window.GoodList.openAddModal(h); });
    head.appendChild(keb);
    scroll.appendChild(head);

    /* two boxes */
    var row = el('div');
    row.style.cssText = 'display:flex;gap:10px;margin:10px 18px 12px';

    /* LEFT : current streak / divider / best streak */
    var left = boxBase();
    var cur = G().goodStreak(h);
    var curN = el('div', null, String(cur));
    curN.style.cssText = 'font-family:var(--f-disp);font-size:30px;font-weight:700;line-height:1.1;color:var(--ink2)';
    left.appendChild(curN);
    var curL = el('div', null, 'current streak');
    curL.style.cssText = 'font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--slate);margin-top:2px';
    left.appendChild(curL);
    left.appendChild(divider());
    var best = G().bestStreak(h);
    var bestN = el('div', null, String(best));
    bestN.style.cssText = 'font-family:var(--f-disp);font-size:19px;font-weight:700;color:var(--ink)';
    left.appendChild(bestN);
    var bestL = el('div', null, 'best streak');
    bestL.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ash);margin-top:1px';
    left.appendChild(bestL);
    row.appendChild(left);

    /* RIGHT : start date / divider / days since start */
    var right = boxBase();
    var stL = el('div', null, 'Start');
    stL.style.cssText = 'font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--slate)';
    right.appendChild(stL);
    var stV = el('div', null, UI.fmtDate(h.startDate));
    stV.style.cssText = 'font-size:13px;font-weight:700;color:var(--ink);margin-top:3px';
    right.appendChild(stV);
    right.appendChild(divider());
    var days = Math.max(0, Math.round((new Date(UI.todayISO()) - new Date(h.startDate)) / 86400000));
    var dN = el('div', null, String(days));
    dN.style.cssText = 'font-family:var(--f-disp);font-size:22px;font-weight:700;color:var(--ink2)';
    right.appendChild(dN);
    var dL = el('div', null, 'days ho chuke');
    dL.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ash);margin-top:1px';
    right.appendChild(dL);
    row.appendChild(right);

    scroll.appendChild(row);
    scroll.appendChild(streakPanel(h));
    scroll.appendChild(formationPanel(h));
    screen.appendChild(scroll);
    window.SubjectListBridge.show(screen, true);
  }

  window.GoodDetail = { open: open };
})();
