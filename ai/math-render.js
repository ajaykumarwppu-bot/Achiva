/* ================================================================
   AI / MATH-RENDER.JS — KaTeX wrapper + $..$ tokenizer (NOTES math)
   ----------------------------------------------------------------
   Notes ke Read view mein math dikhane ka poora kaam yahan hai :

   • tokenize(text) : plain text ko tokens mein toda —
       $$...$$ → display math (multiline ok)
       $...$   → inline math (same line, non-greedy)
       \$      → literal dollar (escape)
       akela/bina-jodi $ → literal text
     Har math token ke saath uska EXACT start/end offset bhi hota
     hai — notes.js isi se "formula par tap → edit → text mein
     wapas replace" karta hai.

   • renderText(container, text) : tokens se DOM banata hai.
       - text hisse hamesha createTextNode se (XSS-safe, koi
         innerHTML nahi)
       - math hisse katex.renderToString(throwOnError:false) se —
         KaTeX ka output by-design safe hai (trust:false default,
         \href jaisi cheezein disabled)
       - katex load na hua ho (vendor 404 / slow net) to math raw
         $..$ text hi dikhta hai — screen kabhi blank/crash nahi

   • renderMathHtml(latex, display) : single formula → HTML string
     (formula-editor modal ke LIVE PREVIEW ke liye).

   Depends: vendor/katex (window.katex) — optional hai; UI (el/esc).
   ES5-only. window.MathRender par expose.
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaMathRenderLoaded) return;
  window.__achivaMathRenderLoaded = true;

  var UIx = window.UI || {};
  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }
  function escHtml(s) {
    if (UIx.esc) return UIx.esc(s);
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function katexReady() { return !!window.katex; }

  /* ---------- single formula → safe HTML ---------- */
  function renderMathHtml(latex, display) {
    if (!katexReady()) {
      /* engine abhi load nahi hua — raw dikhao (fail-safe) */
      return '<span class="nr-math-err">' +
        escHtml(display ? '$$' + latex + '$$' : '$' + latex + '$') + '</span>';
    }
    try {
      return window.katex.renderToString(latex, {
        throwOnError: false,     /* galat LaTeX → red text, crash nahi */
        displayMode: !!display,
        errorColor: '#c0392b'
      });
    } catch (e) {
      return '<span class="nr-math-err">' + escHtml(latex) + '</span>';
    }
  }

  /* ---------- tokenizer ----------
     Math tokens ke start/end ORIGINAL text ke offsets hain
     (delimiters $ / $$ sahit) — edit par slice-replace isi se hota hai. */
  function tokenize(text) {
    var tokens = [];
    var src = String(text == null ? '' : text);
    var n = src.length, i = 0;
    var buf = '', bufStart = 0;

    function flushText(end) {
      if (buf) { tokens.push({ type: 'text', value: buf, start: bufStart, end: end }); buf = ''; }
    }

    while (i < n) {
      var ch = src.charAt(i);

      /* \$ → literal $ */
      if (ch === '\\' && src.charAt(i + 1) === '$') {
        if (!buf) bufStart = i;
        buf += '$'; i += 2; continue;
      }

      if (ch === '$') {
        /* $$...$$ display — closing $$ dhoondho (multiline ok) */
        if (src.charAt(i + 1) === '$') {
          var closeD = src.indexOf('$$', i + 2);
          if (closeD !== -1) {
            flushText(i);
            tokens.push({ type: 'display', value: src.slice(i + 2, closeD), start: i, end: closeD + 2 });
            i = closeD + 2; bufStart = i; continue;
          }
          /* jodi nahi mili → literal */
          if (!buf) bufStart = i;
          buf += '$$'; i += 2; continue;
        }
        /* $...$ inline — closing $ SAME LINE par hona chahiye */
        var j = i + 1, found = -1;
        while (j < n) {
          var c = src.charAt(j);
          if (c === '\\' && src.charAt(j + 1) === '$') { j += 2; continue; }
          if (c === '\n') break;
          if (c === '$') { found = j; break; }
          j++;
        }
        if (found > i + 1) {   /* $...$ — kam se kam 1 char beech mein */
          flushText(i);
          tokens.push({ type: 'inline', value: src.slice(i + 1, found), start: i, end: found + 1 });
          i = found + 1; bufStart = i; continue;
        }
        /* akela $ → literal */
      }

      if (!buf) bufStart = i;
      buf += ch; i++;
    }
    flushText(n);
    return tokens;
  }

  /* ---------- text → rendered DOM (lines + math) ----------
     Return: mathSpans[] — har render ka span registry (tap→edit ke liye).
     container mein .nr-line / .nr-math-display / .nr-math-inline bante hain. */
  var lastSpans = [];

  function renderText(container, text) {
    container.innerHTML = '';
    lastSpans = [];
    var tokens = tokenize(text);
    var line = null;

    function ensureLine() {
      if (!line) { line = el('div', 'nr-line'); container.appendChild(line); }
      return line;
    }

    tokens.forEach(function (t) {
      if (t.type === 'text') {
        var parts = t.value.split('\n');
        for (var k = 0; k < parts.length; k++) {
          if (k > 0) line = null;              /* newline → nayi line */
          if (parts[k]) ensureLine().appendChild(document.createTextNode(parts[k]));
          else if (k > 0) ensureLine();        /* khaali line → blank row (spacing) */
        }
        return;
      }
      var idx = lastSpans.length;
      lastSpans.push({
        latex: t.value, start: t.start, end: t.end,
        display: t.type === 'display'
      });
      var holder = el(t.type === 'display' ? 'div' : 'span',
        t.type === 'display' ? 'nr-math-display' : 'nr-math-inline');
      holder.setAttribute('data-mi', String(idx));
      holder.setAttribute('role', 'button');
      holder.setAttribute('aria-label', 'Edit formula');
      holder.innerHTML = renderMathHtml(t.value, t.type === 'display');
      if (t.type === 'display') { line = null; container.appendChild(holder); }
      else ensureLine().appendChild(holder);
    });

    if (!container.childNodes.length) {
      var ph = el('div', 'nr-empty', 'Abhi kuch nahi likha — Write mein jao.');
      container.appendChild(ph);
    }
    return lastSpans;
  }

  window.MathRender = {
    available: katexReady,
    tokenize: tokenize,
    renderText: renderText,
    renderMathHtml: renderMathHtml,
    getSpans: function () { return lastSpans; }
  };
})();
