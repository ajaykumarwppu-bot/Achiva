/* ================================================================
   CORE / APP-SHELL.JS — floating nav button (FAB) + coming-soon screens
   ----------------------------------------------------------------
   Ye code pehle index.html ke andar inline <script> tha.
   IndexedDB migration (v3) mein index.html ke saare feature/backend
   scripts ek ordered loader se load hote hain, isliye ise yahan
   file bana diya gaya. LOGIC BILKUL UNCHANGED — sirf jagah badli.
   Loader manifest mein ye backend/settings.js ke BAAD aati hai
   (pehle inline script bhi sab scripts ke baad hi chalta tha).
   Depends on: UI, SubjectListBridge, Dashboard, CanvasList,
   TimerFeature, GoalList, GoodList (sab loader se pehle aa chuke).
   ================================================================ */
    (function () {
      'use strict';
      var app = document.getElementById('app');
      var fab = document.getElementById('fab');
      var col = document.getElementById('fabCol');
      var row = document.getElementById('fabRow');
      var FAB = 58, MARGIN = 14;
      var COL_W = 72, COL_H = 252, ROW_W = 252, ROW_H = 72;
      var corner = 'br';
      var menuOpen = false;

      /* ---------- coming-soon feature screens ---------- */
      var FEATURE_SCREENS = {};
      var FEATURE_TITLES = {
        dash: 'Dashboard', cal: 'Calendar',
        tasks: 'Tasks', habits: 'Habits', goals: 'Goals'
      };
      Object.keys(FEATURE_TITLES).forEach(function (key) {
        var s = UI.el('section', 'screen');
        s.style.paddingTop = '58px';
        var head = UI.el('div');
        head.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 18px 4px';
        /* back arrow NAHI : ye apne aap mein ek feature screen hai
           (kisi cheez ke andar nahi) — is par aana-jaana FAB
           (menu button) se hi hota hai */
        var tw = UI.el('div', 'sub-title-wrap');
        tw.appendChild(UI.el('h2', null, FEATURE_TITLES[key]));
        tw.appendChild(UI.el('div', 'sub-meta', 'Naya feature'));
        head.appendChild(tw);
        s.appendChild(head);
        var wrap = UI.el('div', 'scroll');
        var empty = UI.el('div', 'empty', 'Coming soon<br>' + FEATURE_TITLES[key] + ' feature yahan jald add hoga.');
        empty.style.margin = '12px 18px';
        wrap.appendChild(empty);
        s.appendChild(wrap);
        app.appendChild(s);
        FEATURE_SCREENS[key] = s;
      });

      /* ---------- corner positioning ---------- */
      function cornerPos(c) {
        var w = app.clientWidth, h = app.clientHeight;
        if (c === 'br') return { x: w - FAB - MARGIN, y: h - FAB - MARGIN };
        if (c === 'bl') return { x: MARGIN, y: h - FAB - MARGIN };
        if (c === 'tr') return { x: w - FAB - MARGIN, y: MARGIN + 44 };
        return { x: MARGIN, y: MARGIN + 44 };
      }

      function place(c, animate) {
        corner = c;
        app.setAttribute('data-corner', c);
        var p = cornerPos(c);
        if (animate) {
          fab.classList.add('snap');
          window.setTimeout(function () { fab.classList.remove('snap'); }, 420);
        }
        fab.style.left = p.x + 'px';
        fab.style.top = p.y + 'px';
        if (menuOpen) positionGroups();
      }

      /* fab ki current position (inline style se — layout-safe) */
      function fabXY() {
        return { x: parseInt(fab.style.left, 10) || 0, y: parseInt(fab.style.top, 10) || 0 };
      }

      /* ---------- menu open/close ----------
         Corner-wise directions : dono groups fab wale corner ki
         dono edges ke along khulte hain (screen mein fit) :
           br → column upar, row left   |  bl → column upar, row right
           tr → column neeche, row left  |  tl → column neeche, row right */
      function clamp(v, min, max) { return Math.min(Math.max(min, v), max); }

      function positionGroups() {
        var p = fabXY();
        var w = app.clientWidth, h = app.clientHeight;
        var rightSide = (corner === 'br' || corner === 'tr');
        var bottomSide = (corner === 'br' || corner === 'bl');
        /* column (4 items vertical) */
        col.style.left = clamp(p.x - 7, 4, w - COL_W - 4) + 'px';
        col.style.top = (bottomSide
          ? clamp(p.y - 8 - COL_H, 4, h - COL_H - 4)
          : clamp(p.y + FAB + 8, 4, h - COL_H - 4)) + 'px';
        col.style.transformOrigin = '50% ' + (bottomSide ? '100%' : '0%');
        /* row (4 items horizontal) */
        row.style.top = clamp(p.y - 7, 4, h - ROW_H - 4) + 'px';
        row.style.left = (rightSide
          ? clamp(p.x - 8 - ROW_W, 4, w - ROW_W - 4)
          : clamp(p.x + FAB + 8, 4, w - ROW_W - 4)) + 'px';
        row.style.transformOrigin = (rightSide ? '100%' : '0%') + ' 50%';
      }

      function openMenu() {
        menuOpen = true;
        app.classList.add('menu-open');
        positionGroups();
        [col, row].forEach(function (g) {
          g.style.visibility = 'visible';
          g.style.pointerEvents = 'auto';
        });
        window.requestAnimationFrame(function () {
          [col, row].forEach(function (g) {
            g.style.opacity = '1';
            g.style.transform = 'none';
          });
        });
      }

      function closeMenu() {
        if (!menuOpen) return;
        menuOpen = false;
        app.classList.remove('menu-open');
        [col, row].forEach(function (g) {
          g.style.opacity = '0';
          g.style.transform = 'scale(.6)';
          g.style.pointerEvents = 'none';
        });
        window.setTimeout(function () {
          if (!menuOpen) {
            [col, row].forEach(function (g) { g.style.visibility = 'hidden'; });
          }
        }, 260);
      }

      /* ---------- FAB visibility ----------
         FAB sirf main screens par dikhta hai (subjects / chapters /
         books / feature screens). Chapter-view (basics / topic /
         sources / revision) ke andar list.js ka showScreen ise
         setVisible(false) se chhupa deta hai. */
      var fabVisible = true;
      var fabVisTimer = null;

      function setVisible(v) {
        v = !!v;
        if (v === fabVisible) return;
        fabVisible = v;
        if (!v) closeMenu();          /* khula menu bhi saath band */
        fab.style.pointerEvents = v ? 'auto' : 'none';
        if (fabVisTimer) { window.clearTimeout(fabVisTimer); fabVisTimer = null; }
        if (v) {
          fab.style.visibility = 'visible';
          fab.style.opacity = '0';
          window.requestAnimationFrame(function () {
            if (!fabVisible) return;
            fab.style.transition = 'opacity .28s ease';
            fab.style.opacity = '1';
            fabVisTimer = window.setTimeout(function () {
              fabVisTimer = null;
              fab.style.transition = '';   /* .snap corner animation safe */
            }, 300);
          });
        } else {
          fab.style.transition = 'opacity .22s ease';
          fab.style.opacity = '0';
          fabVisTimer = window.setTimeout(function () {
            fabVisTimer = null;
            if (!fabVisible) {
              fab.style.visibility = 'hidden';
              fab.style.transition = '';
            }
          }, 240);
        }
      }

      window.AchivaFab = { setVisible: setVisible };

      /* ---------- navigation ---------- */
      function onMenuClick(e) {
        var item = e.target.closest('.mitem');
        if (!item) return;
        var key = item.getAttribute('data-key');
        closeMenu();
        var B = window.SubjectListBridge;
        if (key === 'subs') {
          B.show(B.subjectScreen(), false);
        } else if (key === 'time') {
          /* Time = screen-time tracker (features/timer/) */
          if (window.TimerFeature) window.TimerFeature.open();
        } else if (key === 'draw') {
          /* Draw = Canvas feature (canvas/canvas.js) */
          if (window.CanvasList) window.CanvasList.openList();
        } else if (key === 'goals') {
          /* Goals = Goal feature (features/goals/) */
          if (window.GoalList) window.GoalList.open();
        } else if (key === 'habits') {
          /* Habits = Good habits (features/habit/good-list.js) */
          if (window.GoodList) window.GoodList.open();
        } else if (key === 'dash') {
          /* DASH = asli Dashboard (features/dashboard/) */
          if (window.Dashboard) window.Dashboard.open();
        } else if (key === 'tasks') {
          /* TASKS = extra tasks feature (features/task/task.js) */
          if (window.TaskFeature) window.TaskFeature.open();
          else B.show(FEATURE_SCREENS[key], true);
        } else {
          B.show(FEATURE_SCREENS[key], true);
        }
      }
      col.addEventListener('click', onMenuClick);
      row.addEventListener('click', onMenuClick);

      document.addEventListener('pointerdown', function (e) {
        if (menuOpen && !col.contains(e.target) && !row.contains(e.target) && !fab.contains(e.target)) closeMenu();
      });

      /* ---------- drag (long-hold) + corner snap ---------- */
      var drag = null;
      fab.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (fab.setPointerCapture) fab.setPointerCapture(e.pointerId);
        var p0 = fabXY();
        drag = { sx: e.clientX, sy: e.clientY, ox: p0.x, oy: p0.y, moved: false };
      });
      fab.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (!drag.moved) {
          drag.moved = true;
          closeMenu();
          app.classList.add('dragging');
          fab.classList.remove('snap');
        }
        var w = app.clientWidth, h = app.clientHeight;
        var x = Math.min(Math.max(4, drag.ox + dx), w - FAB - 4);
        var y = Math.min(Math.max(4, drag.oy + dy), h - FAB - 4);
        fab.style.left = x + 'px';
        fab.style.top = y + 'px';
      });
      fab.addEventListener('pointerup', function () {
        if (!drag) return;
        var wasMoved = drag.moved;
        drag = null;
        app.classList.remove('dragging');
        if (!wasMoved) {
          /* tap → menu toggle */
          if (menuOpen) closeMenu(); else openMenu();
          return;
        }
        /* nearest corner par snap */
        var p1 = fabXY();
        var fx = p1.x + FAB / 2, fy = p1.y + FAB / 2;
        var w = app.clientWidth, h = app.clientHeight;
        var c = (fx > w / 2 ? 'r' : 'l') + (fy > h / 2 ? 'b' : 't');
        place(c === 'rb' ? 'br' : c === 'lb' ? 'bl' : c === 'rt' ? 'tr' : 'tl', true);
      });
      fab.addEventListener('pointercancel', function () {
        drag = null;
        app.classList.remove('dragging');
      });

      window.addEventListener('resize', function () { place(corner, false); });

      /* initial position */
      place('br', false);
    })();
