/* ================================================================
   CANVAS / CANVAS-CARDS.JS  —  cards (nodes) ki poori duniya
   ----------------------------------------------------------------
   • Double-tap khali jagah → naya card (editor ki tap-detection)
   • Card : drag-move, resize (se/e/s handles)
   • Card par TAP → koi popup nahi : card ke just upar mini
     toolbar : [Focus] [Text] [Delete] [Color]
       - Focus  : card screen ke beech mein aa jata hai
       - Text   : cursor card ke ANDAR blink karta hai, wahin likho
                  (contenteditable), bahar click par save
       - Delete : do-click confirm
       - Color  : poori color plate + saved colors (editor shared)
   • 4 side anchors → curved lines (canvas-lines.js)
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaCanvasCardsLoaded) return;
  window.__achivaCanvasCardsLoaded = true;

  var el = UI.el, esc = UI.esc, uid = UI.uid;

  var ICON_FOCUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
  var ICON_TEXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>';
  var ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  var ICON_COLOR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.7 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17c2.8 0 5-2.2 5-5 0-5-4.5-9-10-9z"/></svg>';

  var E = null;
  var canvas = null;
  var editingCard = null;

  /* ---------- card mini-toolbar ---------- */
  var toolbar = null;
  var toolbarCard = null;

  function buildToolbar() {
    toolbar = el('div');
    toolbar.style.cssText = 'position:absolute;z-index:20;display:none;gap:6px;padding:6px;' +
      'border-radius:14px;background:var(--tile-bg);border:1px solid var(--line);' +
      'box-shadow:0 12px 28px -14px rgba(20,23,28,.5)';
    var defs = [
      [ICON_FOCUS, 'Focus', function (c) { E.focusCard(c); hideToolbar(); }],
      [ICON_TEXT, 'Text', function (c) { startInlineText(c); }],
      [ICON_TRASH, 'Delete', null],
      [ICON_COLOR, 'Color', function (c) {
        E.openColorPlate(c.color, function (col) {
          c.color = col;
          liveRecolor(c, col);
        }, function () {
          E.commit();
          render();
        });
      }]
    ];
    defs.forEach(function (d) {
      var b = el('button', null, d[0]);
      b.type = 'button';
      b.setAttribute('aria-label', d[1]);
      b.title = d[1];
      b.style.cssText = 'width:32px;height:32px;border-radius:10px;border:1px solid var(--s2);' +
        'background:var(--chip-bg);color:var(--ink2);cursor:pointer;display:flex;' +
        'align-items:center;justify-content:center;font-size:10px;font-weight:700';
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!toolbarCard) return;
        if (d[1] === 'Delete') {
          if (!b._armed) {
            b._armed = true;
            b.textContent = '✓?';
            b.innerHTML = '✕!';
            b.style.background = 'var(--ink)';
            b.style.color = 'var(--paper)';
            return;
          }
          deleteCard(toolbarCard);
          return;
        }
        d[2](toolbarCard);
      });
      toolbar.appendChild(b);
    });
    E.screen.appendChild(toolbar);
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = 'none';
    toolbarCard = null;
  }

  function showToolbar(c) {
    if (!toolbar) buildToolbar();
    toolbarCard = c;
    [...toolbar.children].forEach(function (b) {
      b._armed = false;
      if (b.getAttribute('aria-label') === 'Delete') {
        b.innerHTML = ICON_TRASH;
        b.style.background = 'var(--chip-bg)';
        b.style.color = 'var(--ink2)';
      }
    });
    var t = E.getT();
    var r = E.viewport.getBoundingClientRect();
    var sx = c.x * t.s + t.x + r.left;
    var sy = c.y * t.s + t.y + r.top;
    var sw = c.w * t.s;
    toolbar.style.display = 'flex';
    var tbW = 170;
    var left = Math.max(8, Math.min(sx + sw / 2 - tbW / 2, (r.width || 360) - tbW - 8));
    var top = sy - 48;
    if (top < 8) top = sy + c.h * t.s + 8;
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  function liveRecolor(c, col) {
    var node = E.cardsLayer.querySelector('[data-cid="' + c.id + '"]');
    if (node) node.style.background = col;
  }

  function deleteCard(c) {
    canvas.cards = canvas.cards.filter(function (x) { return x !== c; });
    canvas.lines = canvas.lines.filter(function (l) {
      return l.from.cid !== c.id && l.to.cid !== c.id;
    });
    hideToolbar();
    E.commit();
    render();
    E.rerenderLines();
  }

  /* ---------- inline text (cursor card ke andar) ---------- */
  function startInlineText(c) {
    var node = E.cardsLayer.querySelector('[data-cid="' + c.id + '"]');
    if (!node) return;
    var txt = node.querySelector('div');
    editingCard = c;
    txt.contentEditable = 'true';
    txt.setAttribute('contenteditable', 'true');
    txt.style.overflow = 'auto';
    txt.style.outline = '1.5px solid var(--steel)';
    txt.style.borderRadius = '6px';
    txt.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(txt);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
    txt.addEventListener('blur', function once() {
      txt.removeEventListener('blur', once);
      txt.contentEditable = 'false';
      txt.setAttribute('contenteditable', 'false');
      txt.style.outline = '';
      c.text = txt.innerText;
      editingCard = null;
      E.commit();
      render();
    });
  }

  /* ---------- init / render ---------- */
  function init(editor, cv) {
    E = editor;
    canvas = cv;
    editingCard = null;
    if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
    toolbar = null;
    toolbarCard = null;
    render();
    /* bahar / pan / zoom par toolbar hide */
    E.viewport.addEventListener('pointerdown', function () { hideToolbar(); }, true);
  }

  function createAt(w) {
    canvas.cards.push({
      id: uid(),
      x: Math.round(w.x - 80), y: Math.round(w.y - 50),
      w: 160, h: 100, color: '#ffffff', text: ''
    });
    E.commit();
    render();
  }

  function render() {
    E.cardsLayer.innerHTML = '';
    canvas.cards.forEach(function (c) {
      E.cardsLayer.appendChild(cardEl(c));
    });
  }

  function cardEl(c) {
    var d = el('div');
    d.setAttribute('data-cid', c.id);
    d.style.cssText = 'position:absolute;left:' + c.x + 'px;top:' + c.y + 'px;width:' + c.w +
      'px;height:' + c.h + 'px;background:' + (c.color || '#ffffff') + ';' +
      'border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 20px -12px rgba(20,23,28,.4);' +
      'cursor:grab;touch-action:none';

    var txt = el('div', null, esc(c.text || ''));
    txt.style.cssText = 'position:absolute;inset:8px;font-size:13px;line-height:1.45;color:#22262c;' +
      'white-space:pre-wrap;word-break:break-word;overflow:hidden';
    d.appendChild(txt);

    [['se', 'right:-6px;bottom:-6px;cursor:nwse-resize'],
     ['e', 'right:-6px;top:50%;margin-top:-6px;cursor:ew-resize'],
     ['s', 'bottom:-6px;left:50%;margin-left:-6px;cursor:ns-resize']].forEach(function (h) {
      var hd = el('div');
      hd.setAttribute('data-h', h[0]);
      hd.style.cssText = 'position:absolute;' + h[1] + ';width:12px;height:12px;border-radius:4px;' +
        'background:var(--tile-bg);border:1.5px solid var(--steel);touch-action:none';
      d.appendChild(hd);
    });

    [['n', 'top:-6px;left:50%;margin-left:-6px'],
     ['e', 'right:-6px;top:50%;margin-top:-6px'],
     ['s', 'bottom:-6px;left:50%;margin-left:-6px'],
     ['w', 'left:-6px;top:50%;margin-top:-6px']].forEach(function (a) {
      var an = el('div');
      an.setAttribute('data-side', a[0]);
      an.style.cssText = 'position:absolute;' + a[1] + ';width:12px;height:12px;border-radius:50%;' +
        'background:var(--tile-bg);border:1.5px solid var(--steel);cursor:crosshair;touch-action:none';
      an.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        hideToolbar();
        startConnect(c, a[0], e);
      });
      d.appendChild(an);
    });

    d.addEventListener('pointerdown', function (e) {
      if (E.readOnly()) return;
      if (editingCard === c) return;   /* text editing chalu hai */
      var h = e.target.getAttribute && e.target.getAttribute('data-h');
      if (h) {
        e.stopPropagation();
        hideToolbar();
        startResize(c, h, e);
        return;
      }
      if (e.target.getAttribute && e.target.getAttribute('data-side')) return;
      e.stopPropagation();
      startMove(c, d, e);
    });

    return d;
  }

  /* ---------- move + tap → toolbar ---------- */
  function startMove(c, dEl, e) {
    var s0 = E.getT().s;
    var sx = e.clientX, sy = e.clientY, ox = c.x, oy = c.y;
    var moved = false;
    function mv(ev) {
      var dx = (ev.clientX - sx) / s0, dy = (ev.clientY - sy) / s0;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true;
      c.x = Math.round(ox + dx);
      c.y = Math.round(oy + dy);
      dEl.style.left = c.x + 'px';
      dEl.style.top = c.y + 'px';
      E.rerenderLines();
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (moved) E.commit();
      else showToolbar(c);
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /* ---------- resize ---------- */
  function startResize(c, h, e) {
    var s0 = E.getT().s;
    var sx = e.clientX, sy = e.clientY, ow = c.w, oh = c.h;
    function mv(ev) {
      var dx = (ev.clientX - sx) / s0, dy = (ev.clientY - sy) / s0;
      if (h === 'se' || h === 'e') c.w = Math.max(80, Math.round(ow + dx));
      if (h === 'se' || h === 's') c.h = Math.max(56, Math.round(oh + dy));
      render();
      E.rerenderLines();
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      E.commit();
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /* ---------- connect drag ---------- */
  function startConnect(c, side, e) {
    if (E.readOnly()) return;
    var from = { cid: c.id, side: side };
    window.CanvasLines.tempStart(from, E.toWorld(e.clientX, e.clientY));
    function mv(ev) {
      window.CanvasLines.tempMove(E.toWorld(ev.clientX, ev.clientY));
    }
    function up(ev) {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      var to = anchorAtWorld(E.toWorld(ev.clientX, ev.clientY));
      if (to && to.cid !== from.cid) {
        canvas.lines.push({
          id: uid(), from: from, to: to,
          text: '', arrow: 'end', color: ''
        });
        window.CanvasLines.tempEnd(true);
        E.commit();
        window.CanvasLines.render();
      } else {
        window.CanvasLines.tempEnd(false);
      }
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /* ---------- anchors math ---------- */
  function anchorPoint(card, side) {
    if (side === 'n') return { x: card.x + card.w / 2, y: card.y, nx: 0, ny: -1 };
    if (side === 'e') return { x: card.x + card.w, y: card.y + card.h / 2, nx: 1, ny: 0 };
    if (side === 's') return { x: card.x + card.w / 2, y: card.y + card.h, nx: 0, ny: 1 };
    return { x: card.x, y: card.y + card.h / 2, nx: -1, ny: 0 };
  }

  function anchorAtWorld(w) {
    var thr = 16 / E.getT().s;
    for (var i = 0; i < canvas.cards.length; i++) {
      var c = canvas.cards[i];
      var sides = ['n', 'e', 's', 'w'];
      for (var j = 0; j < 4; j++) {
        var p = anchorPoint(c, sides[j]);
        if (Math.abs(w.x - p.x) < thr && Math.abs(w.y - p.y) < thr) {
          return { cid: c.id, side: sides[j] };
        }
      }
    }
    return null;
  }

  function cardById(id) {
    var c = null;
    canvas.cards.forEach(function (x) { if (x.id === id) c = x; });
    return c;
  }

  window.CanvasCards = {
    init: init,
    render: render,
    createAt: createAt,
    anchorPoint: anchorPoint,
    anchorAtWorld: anchorAtWorld,
    cardById: cardById,
    hideToolbar: hideToolbar
  };
})();
