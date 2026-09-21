/* ================================================================
   FEATURES / DASHBOARD / DASHBOARD.JS — landing screen
   ----------------------------------------------------------------
   • App khulte hi DIRECT yahi screen khulti hai (koi feature nahi).
   • Abhi v1 : "Total Tasks" card — poore app ke saare tasks ek jagah :
       - GOAL tasks  : har goal ke canvas-board ke tagged cards
                       (daily / range / date tasks)  [goal-task logic]
       - HABIT tasks : har active habit = ek recurring daily task
   • Count + list (naam + source + type + due-status).
   • Aage aur sections (streaks, progress, timers) yahi judenge.
   ================================================================ */

(function () {
  'use strict';
  if (window.__achivaDashboardLoaded) return;
  window.__achivaDashboardLoaded = true;

  var el = UI.el, esc = UI.esc;

  var screen = el('section', 'screen');
  screen.style.paddingTop = '58px';
  document.getElementById('app').appendChild(screen);

  function bridge() { return window.SubjectListBridge; }
  function today() { return UI.todayISO(); }

  /* ---------- goal tasks : tagged canvas cards ---------- */
  function goalTasks() {
    var out = [];
    try {
      var gd = window.AppStorage.loadAt('achiva.goals.v1') || { goals: [] };
      var goals = gd.goals || [];
      var cd = window.CanvasList ? window.CanvasList.getData() : { canvases: [] };
      goals.forEach(function (g) {
        var board = null;
        (cd.canvases || []).forEach(function (c) {
          if ((g.canvasId && c.id === g.canvasId) || (!board && c.goalId === g.id)) board = c;
        });
        if (!board) return;
        (board.cards || []).forEach(function (c) {
          if (!c.tag) return;
          out.push({
            title: (c.text || '').split('\n')[0].replace(/#(daily|done)|#range\s+[0-9/\-]+/gi, '').trim() || 'Task',
            source: 'Goal',
            type: c.tag.type,
            done: !!c.tag.done,
            goal: g.title
          });
        });
      });
    } catch (e) { }
    return out;
  }

  /* ---------- habit tasks : har active habit = daily task ---------- */
  function habitTasks() {
    var out = [];
    try {
      var habits = (window.GoodList && window.GoodList.all) ? window.GoodList.all() : [];
      (habits || []).forEach(function (h) {
        out.push({
          title: h.name || 'Habit',
          source: 'Habit',
          type: 'daily',
          done: (window.GoodList.repsOn(h, today()) >= (h.repsPerDay || 1)),
          goal: ''
        });
      });
    } catch (e) { }
    return out;
  }

  function tasks() {
    return goalTasks().concat(habitTasks());
  }

  function statusOf(t) {
    if (t.done) return 'done';
    if (t.type === 'daily') return 'today';
    return 'pending';
  }

  function render() {
    screen.innerHTML = '';
    var scroll = el('div', 'scroll');

    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 18px 6px';
    var t = el('b', null, 'Dashboard');
    t.style.cssText = 'font-family:var(--f-disp);font-size:20px;font-weight:700;color:var(--ink)';
    head.appendChild(t);
    scroll.appendChild(head);

    var all = tasks();
    var done = all.filter(function (x) { return x.done; }).length;

    /* Total Tasks card */
    var card = el('div');
    card.style.cssText = 'margin:0 18px 12px;padding:16px;border:1px solid var(--line);border-radius:18px;' +
      'background:var(--tile-bg);box-shadow:inset 0 1px 0 var(--hl-soft)';
    var big = el('div', null, String(all.length));
    big.style.cssText = 'font-family:var(--f-disp);font-size:38px;font-weight:700;color:var(--ink);line-height:1';
    card.appendChild(big);
    var lab = el('div', null, 'Total Tasks');
    lab.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--slate);margin:4px 0 10px';
    card.appendChild(lab);
    var sub = el('div', null, done + ' done · ' + (all.length - done) + ' pending');
    sub.style.cssText = 'font-size:11.5px;color:var(--ash);margin-bottom:10px';
    card.appendChild(sub);

    scroll.appendChild(card);
    if (window.DashboardToday) window.DashboardToday.render(scroll);
    screen.appendChild(scroll);
  }

  var openRetries = 0;
  function open() {
    /* init ke waqt goals/habit scripts abhi load nahi hui hoti →
       ek tick ruk kar render karo taaki pehli baar bhi sab sections bhare dikhein */
    if ((!window.GoalTask || !window.GoodList) && openRetries < 5) {
      openRetries++;
      window.setTimeout(open, 0);
      return;
    }
    openRetries = 0;
    render();
    if (bridge()) bridge().show(screen, true);
  }

  window.Dashboard = { open: open, render: render, tasks: tasks };
})();
