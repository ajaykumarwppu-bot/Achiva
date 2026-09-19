/* ================================================================
   FEATURES / SUBJECT TRACKER / LIST.JS
   ----------------------------------------------------------------
   Subject Tracker ki complete card logic:
     • Subject screen  : "LIBRARY · N SUBJECTS" eyebrow + "Add Subject"
                         title, Add (+) button se popup khol kar naya
                         subject banana, subject cards dikhana
                         (letter tile, name + 3-dot, progress bar +
                         highlighted %, "done/total chapters · %" line)
     • Chapter screen  : subject card click par khulna — back arrow,
                         subject name, Add (+) button, chapter cards
     • Chapter cards   : screenshot jaisa card — letter tile, chapter
                         name + 3-dot, "EXAM READY · study-time"
                         label (time label ke just aage), progress
                         bar + %, "Status: Not Started · Priority:
                         Low" line (asal values baad ke features mein)
     • 3-dot (kebab)   : dono cards par working — Edit / Delete ka
                         popover toggle kholta hai
     • Popup (sheet)   : mid-screen modal — add aur edit dono ke liye,
                         save / cancel / scrim par poori tarah band hota
     • Chapter view    : chapter card click par chapter khulna
                         (abhi "Coming soon" screen)
     • Navigation      : subject ↔ chapter ↔ chapter-view screens
                         ke beech aana-jaana (back arrow included)
   Global header (brand + theme toggle + date) index.html mein hai
   aur har screen ke upar hamesha visible rehta hai.
   Styling ke liye style/ ke chaar CSS files use hoti hain
   (foundation → layout → component → screen).
   Data persist karne ke liye core/storage.js (window.AppStorage).
   ================================================================ */

(function () {
  'use strict';

  /* script double-run guard (do instances = double cards / double popup) */
  if (window.__achivaListLoaded) return;
  window.__achivaListLoaded = true;

  /* ================================================================
     STATE
  ================================================================ */
  var state = { subjects: [] };
  var currentSubject = null;   /* jis subject ka chapter screen khula hai */
  var currentChapter = null;   /* jo chapter khula hai */
  var sheetMode = 'subject';   /* 'subject' | 'chapter' | 'edit-subject' | 'edit-chapter' */
  var editTarget = null;       /* edit mode mein jis object ka naam badalna hai */
  var sheetOpen = false;       /* popup khula hai ya nahi (double-save guard) */

  /* core/storage.js se saved data load karo */
  var saved = window.AppStorage ? window.AppStorage.load() : null;
  if (saved) state = saved;
  if (!Array.isArray(state.tests)) state.tests = [];
  if (!Array.isArray(state.errors)) state.errors = [];

  function persist() {
    if (window.AppStorage) window.AppStorage.save(state);
  }

  /* ================================================================
     HELPERS
  ================================================================ */
  /* core/ui.js ke saanjhe tools (naam wahi → baaki code untouched) */
  var el = UI.el, esc = UI.esc, uid = UI.uid;

  /* done chapters ka count (abhi koi chapter done mark nahi hota,
     baad ke features mein c.done set hoga) */
  function doneCount(subject) {
    return subject.chapters.filter(function (c) { return c.done; }).length;
  }

  function pctOf(done, total) {
    return total ? Math.round((done / total) * 100) : 0;
  }

  /* inline SVG icons */
  var ICON_PLUS = UI.icons.plusBig;
  var ICON_BACK = UI.icons.back;
  var ICON_CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_KEBAB = UI.icons.kebab;
  var ICON_EDIT = UI.icons.edit;
  var ICON_TRASH = UI.icons.trash;
  /* bottom tab icons */
  var ICON_BOOK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>';
  var ICON_TARGET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>';
  var ICON_STACK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6"/></svg>';
  var ICON_REPEAT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

  var app = document.getElementById('app');

  /* ================================================================
     3-DOT (KEBAB) + EDIT/DELETE POPOVER
  ================================================================ */
  var closePops = UI.closePops, togglePop = UI.togglePop;

  /* chhota, border-less 3-dot button */
  function kebab(onClick) {
    var k = UI.miniBtn(ICON_KEBAB, 'Edit or delete');
    k.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return k;
  }

  /* card ke andar Edit / Delete popover
     (delete = do-click confirm, baaki sab features jaisa — subject/chapter
     delete sabse destructive action hai isliye confirm zaroori) */
  function makePop(onEdit, onDelete) {
    return UI.makeKebabPop(onEdit, onDelete, { top: '40px', right: '8px' });
  }

  /* patla (compact) card : padding, tile size aur gaps squeeze */
  function compactCard(card, tile) {
    card.style.padding = '12px 30px 12px 12px';
    tile.style.width = '40px';
    tile.style.height = '40px';
    tile.style.borderRadius = '12px';
    tile.style.fontSize = '16px';
  }

  /* ================================================================
     SCREENS (teen screens : subjects → chapters → chapter view)
     paddingTop : global header (~55px) ke neeche content rahe
  ================================================================ */
  var activeScreen = null;
  var SCREEN_TOP = '58px';

  function makeScreen(id) {
    var s = el('section', 'screen');
    s.id = id;
    s.style.paddingTop = SCREEN_TOP;
    app.appendChild(s);
    return s;
  }

  /* screen switch : forward = aage ki screen, warna back */
  function showScreen(next, forward) {
    if (next === activeScreen) return;
    if (activeScreen) {
      if (forward) {
        activeScreen.classList.remove('active');
        activeScreen.classList.add('exit-left');
      } else {
        activeScreen.classList.remove('active', 'exit-left');
      }
    }
    next.classList.remove('exit-left');
    next.classList.add('active');
    /* subject screen par wapsi : book counts fresh rakho */
    if (next === subjectScreen) updateBooks();
    activeScreen = next;
    /* FAB (floating menu button) sirf main screens par dikhe :
       subjects / chapters / books / features — lekin chapter-view
       (basics/topic/sources/revision) ke andar CHHUPA rahe */
    if (window.AchivaFab) window.AchivaFab.setVisible(next !== chapterViewScreen);
  }

  /* ---------- 1) SUBJECT SCREEN ---------- */
  var subjectScreen = makeScreen('screen-subjects');

  var subTop = el('div', 'sub-top');
  var subTopTitle = el('div', 'sub-title-wrap');
  var subjectEyebrow = el('div', 'eyebrow', '');
  subTopTitle.appendChild(subjectEyebrow);
  subTopTitle.appendChild(el('h2', null, 'Add Subject'));
  var addSubjectBtn = el('button', 'add-btn', ICON_PLUS);
  addSubjectBtn.type = 'button';
  addSubjectBtn.setAttribute('aria-label', 'Add subject');
  subTop.appendChild(subTopTitle);
  subTop.appendChild(addSubjectBtn);
  subjectScreen.appendChild(subTop);

  var subjectScroll = el('div', 'scroll');
  var subjectList = el('div', 'chap-list');
  subjectScroll.appendChild(subjectList);

  /* ---------- BOOKS ROW : Test / Doubt / Error (subject cards ke neeche) ---------- */
  var ICON_BOOKTEST = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></svg>';
  var ICON_BOOKDOUBT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 0 1 5.6 0c0 1.8-2.8 2.2-2.8 3.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>';
  var ICON_BOOKERR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>';

  function bookCard(title, iconHtml, spineColor, onOpen) {
    var b = el('div');
    b.style.cssText = 'position:relative;cursor:pointer;border:1px solid var(--line);' +
      'border-left:6px solid ' + spineColor + ';border-radius:4px 14px 14px 4px;' +
      'background:var(--card-bg);box-shadow:inset 0 1px 0 var(--hl-soft),0 10px 22px -16px rgba(30,34,40,.3);' +
      'padding:12px 10px 10px 14px;min-height:112px;display:flex;flex-direction:column;' +
      'justify-content:space-between;gap:8px;transition:transform .18s';
    var top = el('div');
    top.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:6px';
    var t = el('div', null, title);
    t.style.cssText = 'font-family:var(--f-disp);font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.2';
    var ico = el('span', null, iconHtml);
    ico.style.cssText = 'color:var(--slate);display:flex';
    top.appendChild(t);
    top.appendChild(ico);
    var count = el('div', 'sub-meta', '');
    b.appendChild(top);
    b.appendChild(count);
    b.addEventListener('click', onOpen);
    b._count = count;
    return b;
  }

  var booksRow = el('div');
  booksRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:6px 18px 14px';
  var testBook = bookCard('Test Book', ICON_BOOKTEST, 'var(--slate)', function () {
    if (window.TestBook) window.TestBook.open();
  });
  var doubtBook = bookCard('Doubt Book', ICON_BOOKDOUBT, 'var(--steel)', function () {
    if (window.DoubtBook) window.DoubtBook.open();
  });
  var errorBook = bookCard('Error Book', ICON_BOOKERR, 'var(--ash)', function () {
    if (window.ErrorBook) window.ErrorBook.open();
  });
  booksRow.appendChild(testBook);
  booksRow.appendChild(doubtBook);
  booksRow.appendChild(errorBook);
  subjectScroll.appendChild(booksRow);

  function updateBooks() {
    var doubts = 0;
    state.subjects.forEach(function (s) {
      (s.chapters || []).forEach(function (c) {
        (c.sources || []).forEach(function (src) {
          doubts += (src.doubt || []).length;
        });
      });
    });
    testBook._count.textContent = state.tests.length + (state.tests.length === 1 ? ' test' : ' tests');
    doubtBook._count.textContent = doubts + (doubts === 1 ? ' doubt' : ' doubts');
    errorBook._count.textContent = state.errors.length + (state.errors.length === 1 ? ' error' : ' errors');
  }

  subjectScreen.appendChild(subjectScroll);

  /* ---------- 2) CHAPTER SCREEN ---------- */
  var chapterScreen = makeScreen('screen-chapters');

  var chapTop = el('div', 'sub-top');
  var chapBackBtn = el('button', 'icon-btn', ICON_BACK);
  chapBackBtn.type = 'button';
  chapBackBtn.setAttribute('aria-label', 'Back to subjects');
  var chapTopTitle = el('div', 'sub-title-wrap');
  var chapTitle = el('h2', null, '');
  chapTopTitle.appendChild(chapTitle);
  var addChapterBtn = el('button', 'add-btn', ICON_PLUS);
  addChapterBtn.type = 'button';
  addChapterBtn.setAttribute('aria-label', 'Add chapter');
  chapTop.appendChild(chapBackBtn);
  chapTop.appendChild(chapTopTitle);
  chapTop.appendChild(addChapterBtn);
  chapterScreen.appendChild(chapTop);

  var chapterScroll = el('div', 'scroll');
  var chapterList = el('div', 'chap-list');
  chapterScroll.appendChild(chapterList);
  chapterScreen.appendChild(chapterScroll);

  /* ---------- 3) CHAPTER VIEW SCREEN ("Coming soon") ---------- */
  var chapterViewScreen = makeScreen('screen-chapter-view');

  var viewTop = el('div', 'sub-top');
  var viewBackBtn = el('button', 'icon-btn', ICON_BACK);
  viewBackBtn.type = 'button';
  viewBackBtn.setAttribute('aria-label', 'Back to chapters');
  var viewTopTitle = el('div', 'sub-title-wrap');
  var viewTitle = el('h2', null, '');
  var viewMeta = el('div', 'sub-meta', '');
  viewTopTitle.appendChild(viewTitle);
  viewTopTitle.appendChild(viewMeta);
  var timeBtn = el('button', 'icon-btn', ICON_CLOCK);
  timeBtn.type = 'button';
  timeBtn.setAttribute('aria-label', 'Study timer');
  timeBtn.addEventListener('click', function () { openTimerPopup(); });
  viewTop.appendChild(viewBackBtn);
  viewTop.appendChild(viewTopTitle);
  viewTop.appendChild(timeBtn);
  chapterViewScreen.appendChild(viewTop);

  var viewScroll = el('div', 'scroll');
  chapterViewScreen.appendChild(viewScroll);

  /* ---------- BOTTOM TAB NAVIGATION (chapter view mein fixed) ----------
     Chaar features : basics.js / topic.js / sources.js / rivision.js
     Bar hamesha bottom par fixed rehti hai, beech ka viewScroll
     scrollable rehta hai. Jab koi feature file (window.Topic,
     window.Sources, window.Revision ...) apna renderChapterView
     expose karegi, tab yahan se navigate ho jayega. */
  var TABS = [
    { key: 'basics', label: 'Basics', module: 'Basics', icon: ICON_BOOK },
    { key: 'topic', label: 'Topic', module: 'Topic', icon: ICON_TARGET },
    { key: 'sources', label: 'Sources', module: 'Sources', icon: ICON_STACK },
    { key: 'revision', label: 'Revision', module: 'Revision', icon: ICON_REPEAT }
  ];
  var currentTab = 'basics';
  var tabButtons = {};

  var tabBar = el('div');
  tabBar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;gap:8px;' +
    'padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));' +
    'background:var(--mi-bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
    'border-top:1px solid var(--line)';

  function paintTabs() {
    TABS.forEach(function (t) {
      var b = tabButtons[t.key];
      var sel = t.key === currentTab;
      b.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;' +
        'padding:9px 4px;border-radius:14px;cursor:pointer;font:inherit;font-size:10px;' +
        'font-weight:600;letter-spacing:.04em;transition:.18s;' +
        (sel
          ? 'background:var(--ink);color:var(--paper);border:1px solid var(--line-strong)'
          : 'background:var(--chip-bg);color:var(--slate);border:1px solid var(--s2)');
    });
  }

  function showTab(key) {
    currentTab = key;
    paintTabs();
    viewScroll.innerHTML = '';
    var tab = null;
    TABS.forEach(function (t) { if (t.key === key) tab = t; });
    var mod = window[tab.module];
    if (mod && mod.renderChapterView) {
      mod.renderChapterView(viewScroll, currentChapter, {
        persist: persist,
        refreshCards: renderChapters
      });
    } else {
      /* feature file abhi nahi hai — beech ka area placeholder */
      var ph = el('div', 'empty', 'Coming soon<br>' + tab.label + ' feature yahan jald add hoga.');
      ph.style.margin = '18px 18px 12px';
      viewScroll.appendChild(ph);
    }
  }

  TABS.forEach(function (t) {
    var b = el('button');
    b.type = 'button';
    b.innerHTML = t.icon + '<span>' + t.label + '</span>';
    b.addEventListener('click', function () { showTab(t.key); });
    tabButtons[t.key] = b;
    tabBar.appendChild(b);
  });
  chapterViewScreen.appendChild(tabBar);

  /* ================================================================
     POPUP — mid-screen modal (add + edit dono ke liye)
  ================================================================ */
  var sheetScrim = el('div', 'sheet-scrim');
  sheetScrim.style.transition = 'opacity .22s ease';   /* wrap fade ke saath sync */
  app.appendChild(sheetScrim);

  /* centered wrapper : sheet ko screen ke beech mein rakhta hai.
     Fade IS wrapper par hota hai — box, input aur buttons SAB EK
     SAATH aate/jaate hain (koi hissa alag-alag timing par nahi). */
  var sheetWrap = el('div');
  sheetWrap.style.cssText = 'position:absolute;inset:0;z-index:75;display:flex;' +
    'align-items:center;justify-content:center;pointer-events:none;visibility:hidden;' +
    'opacity:0;transition:opacity .22s ease';
  var sheetHideTimer = null;

  var sheet = el('div', 'sheet');
  sheet.style.position = 'relative';
  sheet.style.left = 'auto';
  sheet.style.right = 'auto';
  sheet.style.bottom = 'auto';
  sheet.style.width = 'min(380px, calc(100% - 44px))';
  /* CSS ka slide-up/down transform yahan nahi chahiye — poora popup
     wrapper ke opacity fade se khulta/band hota hai (ek saath) */
  sheet.style.transform = 'none';
  sheet.style.transition = 'none';
  sheet.appendChild(el('div', 'sheet-grab'));
  var sheetTitle = el('h3', null, '');
  var sheetLabel = el('label', null, '');
  var sheetInput = el('input');
  sheetInput.type = 'text';
  sheetInput.autocomplete = 'off';
  var sheetActions = el('div', 'sheet-actions');
  var sheetCancel = el('button', 'btn-ghost', 'Cancel');
  var sheetSave = el('button', 'btn-solid', 'Save');
  sheetCancel.type = 'button';
  sheetSave.type = 'button';
  sheetActions.appendChild(sheetCancel);
  sheetActions.appendChild(sheetSave);
  sheet.appendChild(sheetTitle);
  sheet.appendChild(sheetLabel);
  sheet.appendChild(sheetInput);
  sheet.appendChild(sheetActions);
  sheetWrap.appendChild(sheet);
  app.appendChild(sheetWrap);

  function openSheet(mode, target) {
    sheetMode = mode;
    editTarget = target || null;

    if (mode === 'subject') {
      sheetTitle.textContent = 'Add Subject';
      sheetLabel.textContent = 'Subject name';
      sheetInput.placeholder = 'e.g. Mathematics';
      sheetInput.value = '';
    } else if (mode === 'chapter') {
      sheetTitle.textContent = 'Add Chapter';
      sheetLabel.textContent = 'Chapter name';
      sheetInput.placeholder = 'e.g. Quadratic Equations';
      sheetInput.value = '';
    } else if (mode === 'edit-subject') {
      sheetTitle.textContent = 'Edit Subject';
      sheetLabel.textContent = 'Subject name';
      sheetInput.placeholder = 'Subject name';
      sheetInput.value = target.name;
    } else {
      sheetTitle.textContent = 'Edit Chapter';
      sheetLabel.textContent = 'Chapter name';
      sheetInput.placeholder = 'Chapter name';
      sheetInput.value = target.name;
    }

    sheetOpen = true;
    if (sheetHideTimer) { window.clearTimeout(sheetHideTimer); sheetHideTimer = null; }
    sheetWrap.style.visibility = 'visible';
    sheetWrap.style.pointerEvents = 'auto';
    app.classList.add('sheet-open');            /* scrim fade-in */
    window.requestAnimationFrame(function () {
      /* box + input + buttons — sab ek saath fade-in */
      if (sheetOpen) sheetWrap.style.opacity = '1';
    });
    window.setTimeout(function () {
      if (sheetOpen) { sheetInput.focus(); sheetInput.select(); }
    }, 260);
  }

  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    app.classList.remove('sheet-open');        /* scrim fade-out (.22s) */
    /* box + input + buttons — sab EK SAATH fade-out,
       koi hissa pehle/baad mein nahi jaata */
    sheetWrap.style.opacity = '0';
    sheetWrap.style.pointerEvents = 'none';
    /* fade khatam hone par wrapper poori tarah chhupao */
    if (sheetHideTimer) window.clearTimeout(sheetHideTimer);
    sheetHideTimer = window.setTimeout(function () {
      sheetHideTimer = null;
      if (!sheetOpen) sheetWrap.style.visibility = 'hidden';
    }, 240);
  }

  function saveSheet() {
    if (!sheetOpen) return;               /* double-save guard */
    var name = sheetInput.value.trim();
    if (!name) { sheetInput.focus(); return; }

    try {
      if (sheetMode === 'subject') {
        state.subjects.push({ id: uid(), name: name, chapters: [] });
      } else if (sheetMode === 'chapter') {
        if (currentSubject) currentSubject.chapters.push({ id: uid(), name: name });
      } else if (sheetMode === 'edit-subject' && editTarget) {
        editTarget.name = name;
        if (currentSubject === editTarget) chapTitle.textContent = name;
      } else if (sheetMode === 'edit-chapter' && editTarget) {
        editTarget.name = name;
        if (currentChapter === editTarget) viewTitle.textContent = name;
      }
      persist();

      /* dono lists refresh : subject card ka chapter count bhi update rahe */
      renderSubjects();
      renderChapters();
    } finally {
      closeSheet();                      /* save ke baad popup hamesha band */
    }
  }

  /* ================================================================
     DELETE
  ================================================================ */
  function deleteSubject(subject) {
    state.subjects = state.subjects.filter(function (s) { return s !== subject; });
    if (currentSubject === subject) currentSubject = null;
    persist();
    renderSubjects();
    renderChapters();
  }

  function deleteChapter(chapter) {
    if (!currentSubject) return;
    currentSubject.chapters = currentSubject.chapters.filter(function (c) { return c !== chapter; });
    if (currentChapter === chapter) currentChapter = null;
    persist();
    renderSubjects();
    renderChapters();
  }

  /* ================================================================
     RENDER : SUBJECT CARDS
  ================================================================ */
  function renderSubjects() {
    subjectList.innerHTML = '';

    /* header eyebrow : LIBRARY · N SUBJECTS */
    subjectEyebrow.textContent = 'Library · ' + state.subjects.length +
      (state.subjects.length === 1 ? ' subject' : ' subjects');

    if (!state.subjects.length) {
      var empty = el('div', 'empty', 'No subjects yet.<br>+ button se apna pehla subject add karo.');
      empty.style.margin = '0 18px 12px';
      subjectList.appendChild(empty);
      updateBooks();
      return;
    }

    state.subjects.forEach(function (subject, i) {
      var total = subject.chapters.length;
      var done = doneCount(subject);
      var pct = pctOf(done, total);

      var card = el('div', 'sub-card');
      var tile = el('div', 'sub-tile t' + (i % 5),
        esc(subject.name.charAt(0).toUpperCase()));
      compactCard(card, tile);
      card.appendChild(tile);

      var main = el('div', 'sub-main');

      /* name row + 3-dot end mein */
      var top = el('div', 'cb-top');
      top.style.marginBottom = '8px';
      top.appendChild(el('h3', null, esc(subject.name)));
      top.appendChild(kebab(function () { togglePop(pop); }));
      main.appendChild(top);

      /* progress bar + highlighted % bar ke end mein */
      var mid = el('div', 'cb-mid');
      mid.style.marginBottom = '6px';
      var bar = el('div', 'cb-bar');
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      mid.appendChild(bar);
      mid.appendChild(el('span', 'cb-pct', pct + '%'));

      /* subject ka TOTAL study time : name aur progress bar ke beech
         wale GAP (8px) ke andar — ABSOLUTE position, flow se bahar.
         Isliye time dikhne par bhi card ki height bilkul wahi rehti
         hai jo bina time ke hoti hai (koi extra line add nahi hoti). */
      var subMs = studyMsForSubject(subject.id);
      if (subMs > 0) {
        top.style.position = 'relative';
        var tl2 = el('div', null, 'Total study : ' + fmtHMS(subMs));
        tl2.style.cssText = 'position:absolute;left:0;top:100%;margin-top:4px;' +
          'transform:translateY(-50%);font-size:9px;line-height:1;' +
          'letter-spacing:.02em;color:var(--ash);white-space:nowrap;' +
          'pointer-events:none';
        top.appendChild(tl2);
      }
      main.appendChild(mid);

      /* done/total chapters · % line */
      main.appendChild(el('div', 'sub-meta',
        done + '/' + total + ' chapters · ' + pct + '%'));

      card.appendChild(main);

      /* 3-dot popover : Edit / Delete */
      var pop = makePop(
        function () { openSheet('edit-subject', subject); },
        function () { deleteSubject(subject); }
      );
      card.appendChild(pop);

      card.addEventListener('click', function () { openChapters(subject); });
      subjectList.appendChild(card);
    });

    updateBooks();
  }

  /* ================================================================
     RENDER : CHAPTER CARDS (screenshot jaisa card design)
  ================================================================ */
  function renderChapters() {
    chapterList.innerHTML = '';
    if (!currentSubject) return;

    if (!currentSubject.chapters.length) {
      var empty = el('div', 'empty',
        'No chapters yet.<br>+ button se apna pehla chapter add karo.');
      empty.style.margin = '0 18px 12px';
      chapterList.appendChild(empty);
      return;
    }

    currentSubject.chapters.forEach(function (chapter, i) {
      var card = el('div', 'sub-card');
      var tile = el('div', 'sub-tile t' + (i % 5),
        esc(chapter.name.charAt(0).toUpperCase()));
      compactCard(card, tile);
      card.appendChild(tile);

      var main = el('div', 'sub-main');

      /* name + EXAM READY label (study time label ke JUST AAGE),
         aur 3-dot end mein */
      var chMs = studyMsForChapter(chapter.id);
      var top = el('div', 'cb-top');
      top.style.marginBottom = '8px';
      var head = el('div');
      var h3 = el('h3', null, esc(chapter.name));
      h3.style.marginTop = '0';
      var label = el('div', 'eyebrow', 'Exam ready');
      label.style.marginTop = '1px';
      if (chMs > 0) {
        var tSpan = el('span', null, ' \u00b7 ' + fmtHMS(chMs));
        tSpan.style.cssText = 'text-transform:none;letter-spacing:.04em';
        label.appendChild(tSpan);
      }
      head.appendChild(h3);
      head.appendChild(label);
      top.appendChild(head);
      top.appendChild(kebab(function () { togglePop(pop); }));
      main.appendChild(top);

      /* progress bar + % (asal logic baad ke features mein aayegi) */
      var mid = el('div', 'cb-mid');
      mid.style.marginBottom = '6px';
      var bar = el('div', 'cb-bar');
      var fill = el('i');
      fill.style.width = '0%';
      bar.appendChild(fill);
      mid.appendChild(bar);
      mid.appendChild(el('span', 'cb-pct', '0%'));
      main.appendChild(mid);

      /* status line : values basics.js ke selectors se aati hain
         (study time ab "Exam ready" ke just aage upar dikhta hai) */
      main.appendChild(el('div', 'sub-meta',
        'Status: ' + (chapter.status || 'Not Started') +
        ' · Priority: ' + (chapter.priority || 'Low')));

      card.appendChild(main);

      /* 3-dot popover : Edit / Delete */
      var pop = makePop(
        function () { openSheet('edit-chapter', chapter); },
        function () { deleteChapter(chapter); }
      );
      card.appendChild(pop);

      card.addEventListener('click', function () { openChapterView(chapter); });
      chapterList.appendChild(card);
    });
  }

  /* ================================================================
     NAVIGATION
  ================================================================ */
  function openChapters(subject) {
    currentSubject = subject;
    chapTitle.textContent = subject.name;
    renderChapters();
    showScreen(chapterScreen, true);
  }

  function openChapterView(chapter) {
    currentChapter = chapter;
    studyContext = {
      subjectId: currentSubject ? currentSubject.id : null,
      subjectName: currentSubject ? currentSubject.name : '',
      chapterId: chapter.id,
      chapterName: chapter.name
    };
    viewTitle.textContent = chapter.name;
    viewMeta.textContent = currentSubject ? currentSubject.name : '';

    /* chapter ke andar ka content bottom tab se chalta hai
       (default : Basics → basics.js) */
    showTab('basics');
    showScreen(chapterViewScreen, true);
  }

  /* ================================================================
     EVENTS
  ================================================================ */
  addSubjectBtn.addEventListener('click', function () { openSheet('subject'); });
  addChapterBtn.addEventListener('click', function () { openSheet('chapter'); });

  chapBackBtn.addEventListener('click', function () { showScreen(subjectScreen, false); });
  viewBackBtn.addEventListener('click', function () { showScreen(chapterScreen, false); });

  sheetCancel.addEventListener('click', closeSheet);
  sheetScrim.addEventListener('click', closeSheet);
  sheetSave.addEventListener('click', saveSheet);
  sheetInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveSheet();
  });

  /* kahin bhi bahar click par popover band */

  /* ================================================================
     STUDY TIMER : countdown + stopwatch (native service + fallback)
  ================================================================ */
  var ICON_CLOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var STUDY_KEY = 'achiva.timer.study.v1';
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

  function refreshLists() {
    try { renderChapters(); } catch (e) { }
    try { renderSubjects(); } catch (e) { }
  }

  function studyStart(mode, countdownMs) {
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
  function ensureGlobalTick() {
    if (studyTick) return;
    studyTick = setInterval(function () {
      if (!studyState) return;
      var st = studyStatus();
      if (st.finished) {
        recordStudy(st.elapsedMs, Date.now() - st.elapsedMs);
        studyState = null;
        var n2 = nativeTimer();
        if (n2) { try { n2.timerStop(); } catch (e) { } }
        refreshLists();
        paintPopup();
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
    recordStudy(st.elapsedMs, startMs);
    studyState = null;
    refreshLists();
    paintPopup();
  }

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

  /* ================================================================
     BRIDGE : books (test/doubt/error) apni screens ko is se
     app mein dikhate hain (screen transitions + state access)
  ================================================================ */
  window.SubjectListBridge = {
    show: function (screenEl, forward) { showScreen(screenEl, forward); },
    subjectScreen: function () { return subjectScreen; },
    getState: function () { return state; },
    persist: persist,
    openChapterViewTab: function (key) {
      showScreen(chapterViewScreen, false);
      showTab(key);
    }
  };

  /* ================================================================
     INIT
  ================================================================ */
  renderSubjects();
  showScreen(subjectScreen, true);
})();
