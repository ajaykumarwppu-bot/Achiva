/* ================================================================
   FEATURES / HABIT / GOOD-LIST.JS — good habits (single file)
   ----------------------------------------------------------------
   Poora good-habit logic isi EK file mein :

   1) ENTRY screen  : FAB → HABITS par jaate hi ek simple BADA card
                      dikhta hai jisme "Good Habit" likha hota hai
                      (+ kitni habits hain). Card tap → andar.
   2) LIST screen   : andar jaate hi upar [Add Habit] button.
                      Tap → modal : habit name · description ·
                      repetition per day · start date (calendar) · Save
                      Save ke baad neeche habit cards bante hain :
                        - habit ka naam
                        - "today X/Y reps" (kitne reps ho chuke)
                        - [+] se rep log hota hai
                        - chhota 🔥 streak chip
                      Kisi bhi card par tap → DETAIL screen
   3) DETAIL screen : abhi "Coming soon" (detail aane wala hai)

   Storage : 'achiva.goodHabits.v1' → { habits: [ {id,name,desc,
             repsPerDay,startDate,logs:{'YYYY-MM-DD':{done,times}} } ] }
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaGoodListLoaded) return;
  window.__achivaGoodListLoaded = true;

  var el = UI.el, esc = UI.esc;
  var KEY = 'achiva.goodHabits.v1';
  var data = window.AppStorage.loadAt(KEY) || { habits: [] };
  if (!Array.isArray(data.habits)) data.habits = [];

  function persist() { window.AppStorage.saveAt(KEY, data); }
  function bridge() { return window.SubjectListBridge; }
  function today() { return UI.todayISO(); }

  /* ---------- store ---------- */
  function all() { return data.habits; }
  function get(id) { return data.habits.filter(function (h) { return h.id === id; })[0] || null; }
  function addHabit(o) {
    o.id = o.id || UI.uid();
    o.repsPerDay = Math.max(1, o.repsPerDay || 1);
    o.startDate = o.startDate || today();
    o.logs = o.logs || {};
    data.habits.push(o);
    persist();
    return o;
  }
  function removeHabit(id) {
    data.habits = data.habits.filter(function (h) { return h.id !== id; });
    persist();
  }
  function repsOn(h, date) {
    var l = (h.logs || {})[date];
    return l ? (l.done || 0) : 0;
  }
  function addRep(h, delta) {
    var d = today();
    if (!h.logs) h.logs = {};
    if (!h.logs[d]) h.logs[d] = { done: 0, times: [] };
    h.logs[d].done = Math.min(h.repsPerDay || 1, Math.max(0, (h.logs[d].done || 0) + delta));
    if (delta > 0) h.logs[d].times.push(Date.now());
    persist();
    return h.logs[d].done;
  }
  function dayDone(h, date) { return repsOn(h, date) >= (h.repsPerDay || 1); }
  function bestStreak(h) {
    var keys = Object.keys(h.logs || {}).sort();
    var best = 0, cur = 0, prev = null;
    keys.forEach(function (k) {
      if (!dayDone(h, k)) return;
      cur = (prev && UI.addDays(prev, 1) === k) ? cur + 1 : 1;
      if (cur > best) best = cur;
      prev = k;
    });
    return best;
  }
  function goodStreak(h) {
    var d = today();
    if (!dayDone(h, d)) d = UI.addDays(d, -1);
    var n = 0;
    while (dayDone(h, d) && n < 5000) { n++; d = UI.addDays(d, -1); }
    return n;
  }

  /* ---------- screens ---------- */
  var entryScreen = el('section', 'screen');
  entryScreen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(entryScreen);

  var listScreen = el('section', 'screen');
  listScreen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(listScreen);

  var detailScreen = el('section', 'screen');
  detailScreen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(detailScreen);

  /* ---------- 1) ENTRY : ek bada "Good Habit" card ---------- */
  function renderEntry() {
    entryScreen.innerHTML = '';
    var scroll = el('div', 'scroll');
    var card = el('div', 'sub-card');
    card.style.cssText += ';margin:26px 20px;padding:26px 20px;align-items:center;cursor:pointer';
    var tile = el('div', 'sub-tile t1', 'G');
    tile.style.cssText += ';width:56px;height:56px;font-size:24px;border-radius:18px';
    card.appendChild(tile);
    var main = el('div', 'sub-main');
    main.style.cssText = 'width:100%;text-align:center';
    var t = el('div', null, 'Good Habit');
    t.style.cssText = 'font-family:var(--f-disp);font-size:20px;font-weight:700;color:var(--ink);margin-top:10px';
    var sub = el('div', 'sub-meta', data.habits.length + ' habit' + (data.habits.length === 1 ? '' : 's'));
    sub.style.marginTop = '4px';
    main.appendChild(t);
    main.appendChild(sub);
    card.appendChild(main);
    card.addEventListener('click', function () { openList(); });
    scroll.appendChild(card);
    entryScreen.appendChild(scroll);
  }

  function open() {
    renderEntry();
    bridge().show(entryScreen, true);
  }

  /* ---------- 2) LIST : Add Habit + habit cards ---------- */
  function renderList() {
    listScreen.innerHTML = '';
    var scroll = el('div', 'scroll');

    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px 6px';
    var back = UI.miniBtn(UI.icons.back, 'Back');
    back.style.cssText += ';width:34px;height:34px;border-radius:50%;border:1px solid var(--s2);background:var(--chip-bg)';
    back.addEventListener('click', function () { open(); });
    head.appendChild(back);
    var tt = el('b', null, 'Good Habits');
    tt.style.cssText = 'flex:1;font-family:var(--f-disp);font-size:17px;font-weight:700;color:var(--ink)';
    head.appendChild(tt);
    var add = UI.pillBtn('+ Add Habit');
    add.style.cssText += ';padding:7px 13px;font-size:11.5px';
    add.addEventListener('click', function () { openAddModal(); });
    head.appendChild(add);
    scroll.appendChild(head);

    if (!data.habits.length) {
      var hint = el('div', null, 'Koi good habit nahi.<br>+ Add Habit se pehli habit banao.');
      hint.style.cssText = 'margin:26px 20px;padding:22px;border:1px dashed var(--s2);border-radius:18px;' +
        'color:var(--slate);font-size:12.5px;line-height:1.7;text-align:center';
      scroll.appendChild(hint);
    } else {
      data.habits.forEach(function (h) { scroll.appendChild(habitCard(h)); });
    }
    listScreen.appendChild(scroll);
  }

  var ICON_CHEV = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  /* round progress button : fraction-fill green, complete par tick */
  function progressBtn(h, done, total, repsLine) {
    var b = el('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Add rep');
    b.style.cssText = 'width:34px;height:34px;border-radius:50%;cursor:pointer;flex:none;' +
      'display:flex;align-items:center;justify-content:center;border:1px solid var(--s2);' +
      'transition:transform .16s ease, background .2s ease;';
    function paint(d) {
      var pct = Math.round((d / total) * 100);
      var comp = d >= total;
      b.style.background = comp ? '#2ea043'
        : 'conic-gradient(#2ea043 ' + pct + '%, var(--chip-bg) ' + pct + '% 100%)';
      b.style.borderColor = comp ? '#2ea043' : 'var(--s2)';
      b.style.color = comp ? '#fff' : 'var(--slate)';
      b.innerHTML = comp ? UI.icons.check : '';
    }
    paint(done);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var cur = repsOn(h, today());
      if (cur >= total) return;                 /* cap : repetition se zyada nahi */
      var nd = addRep(h, 1);
      b.style.transform = 'scale(1.18)';
      window.setTimeout(function () { b.style.transform = 'scale(1)'; }, 160);
      paint(nd);
      if (repsLine) repsLine.textContent = 'today ' + nd + '/' + total + ' reps';
    });
    return b;
  }

  function habitCard(h) {
    var c = el('div', 'sub-card no-chevron');
    c.style.cssText += ';padding:13px 14px;align-items:flex-start;cursor:pointer';
    var tile = el('div', 'sub-tile t1', esc((h.name || '?').charAt(0).toUpperCase()));
    c.appendChild(tile);

    var main = el('div', 'sub-main');
    main.style.cssText = 'flex:1;min-width:0';
    var name = el('h3', null, esc(h.name));
    name.style.margin = '0';
    main.appendChild(name);
    var done = repsOn(h, today());
    var total = h.repsPerDay || 1;
    var repsLine = el('div', 'sub-meta', 'today ' + done + '/' + total + ' reps');
    repsLine.style.margin = '2px 0 0';          /* naam ke just neeche, kam gap */
    main.appendChild(repsLine);
    /* Habit Formation % bar (automaticity) */
    var cs = window.GoodSystem.compute(h.logs || {}, {
      startDate: h.startDate, strict: h.strict || 3, repsPerDay: h.repsPerDay || 1
    }, today());
    var fpct = cs.autoPercent;
    var fbar = el('div');
    fbar.style.cssText = 'height:5px;border-radius:99px;background:var(--s2);overflow:hidden;margin-top:9px';
    var ffill = el('div');
    ffill.style.cssText = 'height:100%;border-radius:99px;background:var(--ink);width:' + fpct + '%;transition:width .3s';
    fbar.appendChild(ffill);
    main.appendChild(fbar);
    var flab = el('div', 'sub-meta', 'Habit Formation ' + fpct + '%');
    flab.style.margin = '3px 0 0';
    main.appendChild(flab);
    c.appendChild(main);

    /* right column : progress button (upar) + arrow (neeche) — ek line/sequence mein */
    var col = el('div');
    col.style.cssText = 'flex:none;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:10px;align-self:stretch';
    col.appendChild(progressBtn(h, done, total, repsLine));
    var ab = el('button', null, ICON_CHEV);
    ab.type = 'button';
    ab.setAttribute('aria-label', 'Open detail');
    ab.style.cssText = 'width:26px;height:26px;border-radius:8px;border:0;background:transparent;' +
      'color:var(--slate);cursor:pointer;display:flex;align-items:center;justify-content:center';
    ab.addEventListener('click', function (e) { e.stopPropagation(); openDetail(h.id); });
    col.appendChild(ab);
    c.appendChild(col);

    c.addEventListener('click', function () { openDetail(h.id); });
    return c;
  }

  function openList() {
    renderList();
    bridge().show(listScreen, true);
  }

  /* ---------- add habit modal ---------- */
  function openAddModal(h) {
    var m = UI.modal({ zScrim: 85, zWrap: 86 });
    var nameF = UI.inputField('Habit name', 'e.g. Drink water');
    var descWrap = el('div');
    descWrap.style.marginBottom = '12px';
    descWrap.appendChild(UI.label('Description'));
    var descIn = el('textarea');
    descIn.placeholder = 'What exactly is this habit...';
    descIn.style.cssText = 'width:100%;min-height:64px;resize:vertical;border:1px solid var(--s2);border-radius:12px;' +
      'background:var(--input-bg);padding:10px 12px;font:inherit;font-size:13px;color:var(--ink);box-sizing:border-box';
    descWrap.appendChild(descIn);
    var repsF = UI.inputField('Repetition per day', 'e.g. 1, 2, 10', 'number');
    var startISO = today();
    if (h) {
      nameF.input.value = h.name || '';
      descIn.value = h.desc || '';
      repsF.input.value = h.repsPerDay || 1;
      startISO = h.startDate || today();
    } else repsF.input.value = 1;
    var startB = UI.pillBtn('Start: ' + UI.fmtDate(startISO));
    startB.style.cssText += ';width:100%;justify-content:flex-start;margin-bottom:10px';
    startB.addEventListener('click', function () {
      window.AchivaCalendar.open('Start date', startISO, function (iso) {
        startISO = iso;
        startB.innerHTML = 'Start: ' + UI.fmtDate(iso);
      });
    });
    var strictR = UI.chipRow(['1', '2', '3', '4', '5'], String(h ? (h.strict || 3) : 3));
    var minF = UI.inputField('Minimum version (bad day par chhota version)', 'e.g. 4 pushups / 1 page');
    var tgtF = UI.inputField('Target time / number (optional)', 'e.g. 11pm / 8 glass');
    if (h) { minF.input.value = h.minimum || ''; tgtF.input.value = h.target || ''; }

    m.open(h ? 'Edit habit' : 'New good habit', function (body) {
      body.appendChild(nameF.wrap);
      body.appendChild(descWrap);
      body.appendChild(repsF.wrap);
      body.appendChild(startB);
      body.appendChild(UI.label('Strict level (1 = strictest, 5 = lenient)'));
      body.appendChild(strictR.row);
      strictR.row.style.margin = '6px 0 12px';
      body.appendChild(minF.wrap);
      body.appendChild(tgtF.wrap);
    }, function () {
      var name = nameF.input.value.trim();
      if (!name) { nameF.input.focus(); return; }
      if (h) {
        h.name = name;
        h.desc = descIn.value.trim();
        h.repsPerDay = Math.max(1, parseInt(repsF.input.value, 10) || 1);
        h.startDate = startISO;
        h.strict = parseInt(strictR.get(), 10) || 3;
        h.minimum = minF.input.value.trim();
        h.target = tgtF.input.value.trim();
        persist();
      } else {
        addHabit({
          name: name,
          desc: descIn.value.trim(),
          repsPerDay: Math.max(1, parseInt(repsF.input.value, 10) || 1),
          startDate: startISO,
          strict: parseInt(strictR.get(), 10) || 3,
          minimum: minF.input.value.trim(),
          target: tgtF.input.value.trim()
        });
      }
      m.close();
      if (h && window.GoodDetail) window.GoodDetail.open(h.id);
      else renderList();
    });
  }

  /* ---------- 3) DETAIL : good-detail.js ---------- */
  function openDetail(id) {
    if (window.GoodDetail) { window.GoodDetail.open(id); return; }
    var h = get(id);
    detailScreen.innerHTML = '';
    var scroll = el('div', 'scroll');
    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px 6px';
    var back = UI.miniBtn(UI.icons.back, 'Back');
    back.style.cssText += ';width:34px;height:34px;border-radius:50%;border:1px solid var(--s2);background:var(--chip-bg)';
    back.addEventListener('click', function () { openList(); });
    head.appendChild(back);
    var tt = el('b', null, h ? h.name : 'Habit');
    tt.style.cssText = 'flex:1;min-width:0;font-family:var(--f-disp);font-size:16px;font-weight:700;' +
      'color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    head.appendChild(tt);
    scroll.appendChild(head);

    var box = el('div');
    box.style.cssText = 'margin:40px 24px;padding:34px 20px;border:1px dashed var(--s2);border-radius:22px;text-align:center';
    var t1 = el('div', null, 'Coming soon');
    t1.style.cssText = 'font-family:var(--f-disp);font-size:18px;font-weight:700;color:var(--ink2);margin-bottom:8px';
    var t2 = el('div', null, 'Is habit ki poori detail (history, streak graph, edits) is update ke baad aayegi.');
    t2.style.cssText = 'font-size:12px;line-height:1.7;color:var(--slate)';
    box.appendChild(t1); box.appendChild(t2);
    scroll.appendChild(box);

    detailScreen.appendChild(scroll);
    bridge().show(detailScreen, true);
  }

  window.GoodList = {
    open: open, openList: openList, openDetail: openDetail,
    all: all, get: get, addHabit: addHabit, removeHabit: removeHabit, addRep: addRep,
    repsOn: repsOn, dayDone: dayDone, goodStreak: goodStreak, bestStreak: bestStreak,
    openAddModal: openAddModal
  };
})();
