/* ================================================================
   FEATURES / SUBJECT TRACKER / NOTES.JS — per-topic detailed notes
   ----------------------------------------------------------------
   Topic tab (topic.js) ke kisi bhi topic/sub-topic card ke MIDDLE
   (name area) par click karte hi ye NOTES screen khulti hai.
   Tick / + / flag / kebab buttons par click se NAHI khulti —
   wo guard topic.js ke row-click handler mein hai (onBtn).

   SCREEN :
     • Back (←)      : topic list par wapas (close par pending save
                       turant flush hota hai)
     • Heading       : node ka naam — YAHAN EDIT KARNE SE sirf notes
                       ka apna title badalta hai (node.notesTitle);
                       BAHAR topic list ka naam waisa hi rehta hai
     • Eyebrow       : "NOTES" (chhota uppercase label)
     • Gear button   : Settings — abhi PLACEHOLDER (kaam baad mein)
     • AI button     : abhi PLACEHOLDER (kaam baad mein)
     • Body          : full-screen textarea — AUTO-SAVE (debounce
                       ~350ms), koi Save button nahi; back/close par
                       bhi flush. Purana data safe: notes/notesTitle
                       optional fields hain.

   DATA : node.notes (string) + node.notesTitle (string) — chapter
   ke topics ke saath hi main state mein persist (AppStorage) aur
   Firebase backup mein jaate hain. Indicator (topic.js) isi se
   banta hai : notes ya title likha ho → card par chhota icon.

   Screen pattern SubjectSetting.js jaisa hi : section.screen +
   SubjectListBridge.show (prev screen yaad rakhta hai, back par
   wahin wapas). ES5-only.

   window.Notes = { open(node, opts), close(), isOpen() }
   opts : { persist(), onSaved() }  — topic.js bhejta hai.
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaNotesLoaded) return;
  window.__achivaNotesLoaded = true;

  var el = UI.el;

  /* wahi icons jo canvas-editor.js use karta hai (consistent look) */
  var ICON_GEAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>';
  var ICON_AI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"/><path d="M18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>';
  var ICON_BACK = UI.icons.back;

  var SAVE_DEBOUNCE = 350;   /* ms — type karte hi auto-save */

  var screen = null;
  var prevScreen = null;
  var current = null;        /* { node, opts } */
  var titleInput = null, ta = null;
  var saveTimer = null;
  var touched = false;       /* user ne textarea mein type kiya */
  var titleTouched = false;  /* user ne heading edit ki */

  /* ================================================================
     SCREEN (ek hi instance — har node ke liye reuse, values refill)
  ================================================================ */
  function roundBtn(html, ariaLabel) {
    var b = UI.miniBtn(html, ariaLabel);
    b.style.cssText += ';width:34px;height:34px;border-radius:50%;border:1px solid ' +
      'var(--s2);background:var(--chip-bg)';
    return b;
  }

  function ensureScreen() {
    if (screen) return screen;
    var app = document.getElementById('app');
    if (!app) return null;

    screen = el('section', 'screen');
    screen.id = 'screen-topic-notes';
    screen.style.paddingTop = '58px';

    /* ---------- head : back · title (editable) · gear · AI ---------- */
    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px 6px';

    var back = roundBtn(ICON_BACK, 'Back');
    back.addEventListener('click', function () { close(); });
    head.appendChild(back);

    var titleWrap = el('div');
    titleWrap.style.cssText = 'flex:1;min-width:0';
    titleWrap.appendChild(el('div', 'eyebrow', 'Notes'));

    titleInput = el('input');
    titleInput.type = 'text';
    titleInput.autocomplete = 'off';
    titleInput.setAttribute('aria-label', 'Notes title');
    /* heading = topic ka naam; edit karne par sirf notesTitle badalta
       hai (node.name untouched). Neeche dashed line sirf focus par
       dikhti hai — layout shift zero (border hamesha reserved). */
    titleInput.style.cssText = 'width:100%;padding:0;border:none;border-bottom:1px dashed transparent;' +
      'outline:none;background:transparent;font-family:var(--f-disp);font-size:18px;font-weight:700;' +
      'color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    titleInput.addEventListener('focus', function () {
      titleInput.style.borderBottomColor = 'var(--s3)';
    });
    titleInput.addEventListener('blur', function () {
      titleInput.style.borderBottomColor = 'transparent';
    });
    titleInput.addEventListener('input', function () {
      titleTouched = true;
      scheduleSave();
    });
    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); ta.focus(); }
    });
    titleWrap.appendChild(titleInput);
    head.appendChild(titleWrap);

    /* Settings (gear) — PLACEHOLDER: kaam baad mein add hoga */
    var gearBtn = roundBtn(ICON_GEAR, 'Settings');
    head.appendChild(gearBtn);

    /* AI — PLACEHOLDER: kaam baad mein add hoga (pill topic.js ke
       "Add Topic" button jaisi hi) */
    var aiBtn = el('button', null, ICON_AI + '<span>AI</span>');
    aiBtn.type = 'button';
    aiBtn.setAttribute('aria-label', 'AI');
    aiBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;' +
      'border-radius:99px;border:1px solid var(--s2);background:var(--chip-bg);font:inherit;' +
      'font-size:12px;font-weight:700;color:var(--ink2);cursor:pointer;flex:none;' +
      'box-shadow:inset 0 1px 0 var(--hl-soft)';
    head.appendChild(aiBtn);

    screen.appendChild(head);

    /* ---------- body : full-height notes textarea (auto-save) ---------- */
    var body = el('div');
    body.style.cssText = 'flex:1;min-height:0;display:flex;padding-top:4px';

    ta = el('textarea');
    ta.setAttribute('aria-label', 'Notes');
    ta.placeholder = 'Yahan apne notes likho…';
    ta.style.cssText = 'flex:1;width:100%;resize:none;border:none;outline:none;background:transparent;' +
      'font:inherit;font-size:14px;line-height:1.75;color:var(--ink);' +
      'padding:10px 18px calc(28px + env(safe-area-inset-bottom,0px));' +
      '-webkit-user-select:text;user-select:text;overscroll-behavior:contain';
    ta.addEventListener('input', function () {
      touched = true;
      scheduleSave();
    });
    body.appendChild(ta);

    screen.appendChild(body);
    app.appendChild(screen);
    return screen;
  }

  /* ================================================================
     AUTO-SAVE (debounce) + flush
  ================================================================ */
  function scheduleSave() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      persistNow();
    }, SAVE_DEBOUNCE);
  }

  /* sirf tab likhte hain jab user ne kuch edit kiya ho — screen sirf
     KHOLNE se data touch nahi hota (indicator bhi nahi jalta) */
  function persistNow() {
    if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
    if (!current || (!touched && !titleTouched)) return;
    try {
      var n = current.node;
      var o = current.opts || {};
      if (touched) n.notes = ta.value;
      if (titleTouched) n.notesTitle = titleInput.value;
      if (o.persist) o.persist();
      if (o.onSaved) o.onSaved();     /* topic.js rows refresh (indicator) */
    } catch (e) { }
  }

  /* ================================================================
     OPEN / CLOSE (SubjectSetting.js wala screen pattern)
  ================================================================ */
  function open(node, opts) {
    if (!node) return;
    if (current) persistNow();       /* pichla node pending tha to flush */
    current = { node: node, opts: opts || {} };
    touched = false;
    titleTouched = false;

    var s = ensureScreen();
    if (!s) return;

    titleInput.value = node.notesTitle || node.name || '';
    ta.value = node.notes || '';
    ta.scrollTop = 0;

    /* jahan se khola, wahi yaad rakho — back par wahi wapas */
    var act = document.querySelector('section.screen.active');
    if (act && act !== s) prevScreen = act;

    if (window.SubjectListBridge && window.SubjectListBridge.show) {
      window.SubjectListBridge.show(s, true);
    } else {
      Array.prototype.forEach.call(document.querySelectorAll('section.screen'), function (x) {
        x.classList.remove('active');
      });
      s.classList.add('active');
    }
  }

  function close() {
    persistNow();                    /* back dabate hi pending save flush */
    if (!screen) return;
    var back = prevScreen;
    prevScreen = null;
    current = null;
    if (window.SubjectListBridge && window.SubjectListBridge.show) {
      if (back && document.body.contains(back)) { window.SubjectListBridge.show(back, false); return; }
      if (window.ST && window.ST.subjectScreen) { window.SubjectListBridge.show(window.ST.subjectScreen(), false); return; }
    }
    /* fallback (bridge ke bina) : notes hatao, prev screen wapas active */
    screen.classList.remove('active');
    if (back && document.body.contains(back)) back.classList.add('active');
  }

  function isOpen() {
    return !!(screen && screen.classList.contains('active'));
  }

  window.Notes = {
    open: open,
    close: close,
    isOpen: isOpen
  };
})();
