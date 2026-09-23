/* ================================================================
   FEATURES / SUBJECT TRACKER / TOPIC.JS
   ----------------------------------------------------------------
   Chapter view ke "Topic" bottom-tab ka poora content:
     • Add Topic button (upar) : popup mein ek line = ek topic,
       yaani ek saath multiple main topics add kar sakte ho
     • Parent-child tree : har topic ke andar sub-topics, unke
       andar aur sub-topics ... maximum 6 layers (recursive render,
       simple & halka code)
     • Har node (kisi bhi layer ka) ke liye:
       - + button se usi layer ke multiple sub-topics add karo
         (popup mein ek line = ek sub-topic)
       - Edit (rename) aur Delete (do-click confirm, poora subtree)
       - Tag : No Tag / Important / Very Very Important
         (default = no tag)
       - Done tick : node done karo to saare andar wale nodes
         (har depth tak) automatic done; leaf akela done hota hai;
         untick karne par node + uske descendants untick
   Data chapter.topics mein save hota hai aur core/storage.js
   (window.AppStorage) ke through persist hota hai.
   List.js ke bottom tab se hook : window.Topic.renderChapterView.
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaTopicLoaded) return;
  window.__achivaTopicLoaded = true;

  var MAX_DEPTH = 6;   /* topic → sub-topic ki maximum layers */

  var hooks = null;
  var chapter = null;
  var container = null;

  /* ================================================================
     HELPERS
  ================================================================ */
  /* core/ui.js ke saanjhe tools (naam wahi → baaki code untouched) */
  var el = UI.el, esc = UI.esc, uid = UI.uid;

  function ensure(ch) {
    if (!Array.isArray(ch.topics)) ch.topics = [];
  }

  function ensureNode(n) {
    if (!Array.isArray(n.children)) n.children = [];
    if (n.tag == null) n.tag = '';
    n.done = !!n.done;
  }

  /* recursive walk : har node par fn(node, depth) */
  function walk(nodes, fn, depth) {
    nodes.forEach(function (n) {
      ensureNode(n);
      fn(n, depth);
      walk(n.children, fn, depth + 1);
    });
  }

  /* done / untick : node + poora subtree */
  function setDone(n, v) {
    n.done = v;
    n.children.forEach(function (c) { setDone(c, v); });
  }

  function removeNode(nodes, id) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) { nodes.splice(i, 1); return true; }
      if (removeNode(nodes[i].children || [], id)) return true;
    }
    return false;
  }

  function findNode(nodes, id) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
      var f = findNode(nodes[i].children || [], id);
      if (f) return f;
    }
    return null;
  }

  function commit() {
    if (hooks && hooks.persist) hooks.persist();
  }

  var TAG_LABEL = { imp: 'IMP', vvi: 'VVI' };

  /* inline SVG icons */
  var ICON_PLUS = UI.icons.plus;
  var ICON_KEBAB = UI.icons.kebab;
  var ICON_EDIT = UI.icons.edit;
  var ICON_TRASH = UI.icons.trash;
  var ICON_FLAG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4c4-2 8 2 12 0v10c-4 2-8-2-12 0"/></svg>';
  var ICON_CHECK = UI.icons.check;
  var ICON_MM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><path d="M9.5 10.5L6 7.5M14.5 10.5l3.5-3M9.5 13.5L6 16.5M14.5 13.5l3.5 3"/></svg>';
  var ICON_AI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"/><path d="M18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>';

  /* ================================================================
     AI TOPICS — EK HI MODE
     ----------------------------------------------------------------
     • User seedha likhe ("mere ye topics hain…") YA bahar wale AI ka
       NORMAL analysis paste kare → app ka AI (wahi AchivaAI, wahi
       model — koi naya system nahi) use topic-tree mein badal deta
       hai (predefined data structure, jaise topic system rakhta hai).
     • "Copy Prompt" button : bahar wale AI + sources (PDFs etc.) ke
       liye prompt copy karta hai — wo AI NORMAL answer deta hai
       (detailed indented list, koi JSON nahi); wo answer yahan paste
       hota hai aur app ka AI use tree bana deta hai.
     • Topics ADD sirf user ke confirm par (Append / Replace).
     • Mind-map ko kuch nahi karna padta — wo isi tree se banta hai.
     ================================================================ */

  /* Bahar wale AI ke liye prompt (user copy karke sources ke saath dega).
     Normal answer maangta hai — JSON nahi — taaki user simple rahe. */
  var AI_PROMPT_EXTERNAL =
    'Tum ek study-syllabus extraction assistant ho. User tumhe ek ya zyada study sources (PDFs / notes / text) dega.\n' +
    'KAAM: sabhi sources se POORE topics, sub-topics aur sub-sub-topics nikaalna — jitni detail mein ho sake, jitne parts mein tod sako tod do.\n' +
    'OUTPUT FORMAT (sirf yahi, kuch aur nahi):\n' +
    '- Plain indented list — KOI JSON nahi, KOI markdown fences nahi, KOI intro/outro/explanation nahi.\n' +
    '- Level 1 line = TOPIC\n' +
    '- 2 space indent = us topic ka SUB-TOPIC\n' +
    '- 4 space indent = SUB-SUB-TOPIC (aur gehrai ke liye indent aise hi badhao)\n' +
    '- Har line sirf ek short study-unit ka naam rakhe, poora sentence nahi.\n' +
    'RULES:\n' +
    '1. Sabhi sources ko mila kar POORA syllabus cover karo — koi chapter / formula / practical / exercise chhute nahi.\n' +
    '2. Foundation pehle : jo pehle padhna zaroori hai wo pehle aaye.\n' +
    '3. Duplicate topics merge karo.\n' +
    '4. Jitne detailed parts ban sakte hain banao (har topic ke 2-8 sub-topics, har sub-topic ke 0-6 sub-sub-topics).\n' +
    '5. Sirf list do — jo maanga hai bas wahi. Koi extra baat strictly forbidden hai.\n';

  /* App-AI ka internal system prompt : topic system ka EXACT data
     structure batata hai (jaise canvas-ai ko canvas ka structure
     bataya jaata hai) — output sirf valid JSON tree. */
  function aiSystemPrompt() {
    return 'You are a study-structure engine inside the Achiva app. ' +
      'Convert the user\'s input (direct topic description OR another AI\'s plain indented analysis list) ' +
      'into the app\'s topic tree. Respond ONLY with valid JSON — no markdown fences, no extra text — ' +
      'in exactly this schema: {"topics":[{"name":"topic","children":[{"name":"sub-topic","children":[]}]}]}. ' +
      'Rules: preserve the user\'s hierarchy and order; level-1 lines = topics, indented lines = sub-topics; ' +
      'merge duplicates; drop empty or non-study lines; names concise (<=60 chars); ' +
      'max depth 6; max 8 children per node; same language as input (Hinglish allowed).';
  }

  function normalizeTree(raw) {
    function clean(s) {
      return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 60);
    }
    var roots = (raw && Array.isArray(raw.topics)) ? raw.topics : (Array.isArray(raw) ? raw : []);
    function walk(list, depth, cap) {
      var res = [];
      if (!Array.isArray(list) || depth >= 6) return res;   /* max 6 layers */
      var seen = {};
      list.forEach(function (n) {
        if (res.length >= cap) return;
        var name = '', kids = [];
        if (typeof n === 'string') name = clean(n);
        else if (n && typeof n === 'object') {
          name = clean(n.name || n.title || n.topic || '');
          kids = n.children || n.subtopics || n.sub || n.items || [];
        }
        if (!name) return;
        var key = name.toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        res.push({ name: name, children: walk(kids, depth + 1, 8) });
      });
      return res;
    }
    return walk(roots, 0, 8);
  }

  function toNodes(list) {
    return (list || []).map(function (n) {
      return { id: UI.uid(), name: n.name, done: false, tag: '', children: toNodes(n.children || []) };
    });
  }

  function callAiTopics(text, signal) {
    var A = window.AchivaAI;
    var base = {
      system: aiSystemPrompt(), user: text, json: true,
      search: false, signal: signal, maxTokens: 3000
    };
    return A.chat(base).then(function (res) {
      if (!res.ok) return res;
      if (res.json) return res;
      /* repair retry : invalid JSON → sirf JSON maango */
      return A.chat({
        system: aiSystemPrompt(),
        user: 'Ye JSON invalid tha. Ise theek karke SIRF valid JSON wapas do (koi text/fences nahi):\n' +
          String(res.text || '').slice(0, 2500),
        json: true, search: false, signal: signal, maxTokens: 3000
      });
    });
  }

  function copyText(s) {
    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = s;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacy(); });
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve(legacy());
  }

  function openAiTopics() {
    if (!chapter) return;
    var A = window.AchivaAI;
    var m = UI.modal({ zScrim: 92, zWrap: 93 });
    var parsed = null;

    /* no-key state : seedha key wizard bhejo (canvas wala hi) */
    if (!A || !A.hasKey || !A.hasKey()) {
      m.open('AI Topics', function (body) {
        body.appendChild(el('div', null,
          'AI use karne ke liye pehle apni AI key set karein (BYOK). Key sirf is device par rahti hai.'));
        var b = UI.solidBtn('AI key set karo');
        b.style.marginTop = '10px';
        b.addEventListener('click', function () {
          m.close();
          if (window.CanvasAI && window.CanvasAI.openKeyWizard) {
            window.CanvasAI.openKeyWizard(function () { openAiTopics(); });
          }
        });
        body.appendChild(b);
      }, null);
      return;
    }

    m.open('AI Topics — ' + (chapter.name || ''), function (body) {
      /* ---------- input view ---------- */
      var inputView = el('div');
      var info = el('div', null,
        'Apne topics/sub-topics likhein, YA bahar wale AI ka analysis yahan paste karein — ' +
        'app ka AI inhe topic-tree mein badal dega. Bahar wale AI ke liye "Copy Prompt" button use karein.');
      info.style.cssText = 'font-size:11.5px;color:var(--ash);line-height:1.6;margin-bottom:10px';
      inputView.appendChild(info);

      var ta = el('textarea');
      ta.rows = 6;
      ta.placeholder = 'e.g. Electrochemistry ke ye topics hain: Coulomb law (numericals ke saath), Capacitors (series-parallel)…\n' +
        'YA bahar wale AI ka indented analysis paste karein…';
      ta.style.cssText = 'width:100%;min-height:110px;resize:vertical;border:1px solid var(--s2);border-radius:12px;' +
        'background:var(--input-bg);padding:10px 12px;font:inherit;font-size:13px;color:var(--ink);box-sizing:border-box';
      inputView.appendChild(ta);

      var btnRow = el('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
      var copyBtn = UI.pillBtn('Copy Prompt');
      var genBtn = UI.pillBtn(ICON_AI + ' <span>Analyze karo</span>');
      genBtn.style.cssText += ';background:var(--ink);color:var(--paper);border-color:var(--ink)';
      btnRow.appendChild(copyBtn);
      btnRow.appendChild(genBtn);
      inputView.appendChild(btnRow);

      var status = el('div', 'sub-meta', '');
      status.style.marginTop = '8px';
      inputView.appendChild(status);
      body.appendChild(inputView);

      /* ---------- preview view ---------- */
      var previewView = el('div');
      previewView.style.display = 'none';
      body.appendChild(previewView);

      copyBtn.addEventListener('click', function () {
        copyText(AI_PROMPT_EXTERNAL).then(function (ok) {
          status.textContent = ok
            ? 'Prompt copy ho gaya ✔ — bahar wale AI + sources ko dein, answer yahan paste karein.'
            : 'Copy nahi hua — prompt select karke manually copy karein.';
        });
      });

      genBtn.addEventListener('click', function () {
        var txt = (ta.value || '').trim();
        if (!txt) { status.textContent = 'Pehle kuch likhein ya paste karein.'; return; }
        status.textContent = 'AI analysis kar raha hai...';
        var ctx = 'Subject/Chapter context: ' + (chapter.name || '') + '.\n\n';
        callAiTopics(ctx + txt).then(function (res) {
          if (!res || !res.ok) {
            status.textContent = (res && res.error) ? res.error : 'AI se baat nahi ho payi — dobara koshish karein.';
            return;
          }
          parsed = normalizeTree(res.json);
          if (!parsed.length) {
            status.textContent = 'AI se topic tree nahi ban paya — thoda clear likh kar dobara koshish karein.';
            return;
          }
          showPreview();
        });
      });

      function addLine(parent, name, depth) {
        var d = el('div', null, esc(name));
        d.style.cssText = 'font-size:12px;color:var(--ink2);padding:2px 0 2px ' + (depth * 14) + 'px;' +
          (depth ? 'color:var(--slate);' : 'font-weight:600;');
        parent.appendChild(d);
      }
      function walkShow(list, depth, parent) {
        (list || []).forEach(function (n) {
          addLine(parent, n.name, depth);
          walkShow(n.children, depth + 1, parent);
        });
      }

      function showPreview() {
        inputView.style.display = 'none';
        previewView.style.display = '';
        previewView.innerHTML = '';
        var counts = (function cnt(l) {
          var n = 0;
          (l || []).forEach(function (x) { n += 1 + cnt(x.children); });
          return n;
        })(parsed);
        var head = el('div', null, 'AI ne ' + parsed.length + ' topics / ' + counts + ' total nodes banaye :');
        head.style.cssText = 'font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px';
        previewView.appendChild(head);
        var listBox = el('div');
        listBox.style.cssText = 'max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;' +
          'padding:8px 10px;background:var(--chap-bg);margin-bottom:10px';
        walkShow(parsed, 0, listBox);
        previewView.appendChild(listBox);

        var repWrap = el('div');
        repWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px';
        var rep = el('input');
        rep.type = 'checkbox';
        rep.id = 'aiTopicsReplace';
        var repLab = el('label', null, 'Purane topics replace karein (nahi to neeche add honge)');
        repLab.style.cssText = 'font-size:11.5px;color:var(--slate)';
        repWrap.appendChild(rep);
        repWrap.appendChild(repLab);
        previewView.appendChild(repWrap);

        var row2 = el('div');
        row2.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        var addB = UI.solidBtn('Topics mein add karo');
        addB.style.flex = '1';
        var backB = UI.pillBtn('← Wapas');
        row2.appendChild(addB);
        row2.appendChild(backB);
        previewView.appendChild(row2);

        addB.addEventListener('click', function () {
          var nodes = toNodes(parsed);
          if (rep.checked) chapter.topics = nodes;
          else chapter.topics = (chapter.topics || []).concat(nodes);
          if (hooks && hooks.persist) hooks.persist();
          m.close();
          rerender();
        });
        backB.addEventListener('click', function () {
          previewView.style.display = 'none';
          inputView.style.display = '';
        });
      }
    }, null);
  }

  var app = document.getElementById('app');

  /* ================================================================
     POPOVERS : kebab (Edit/Delete) + tag (3 options)
  ================================================================ */
  var closePops = UI.closePops, togglePop = UI.togglePop;

  function basePop() {
    var pop = el('div', 'pop');
    pop.style.top = '38px';
    pop.style.right = '6px';
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    return pop;
  }

  function popButton(cls, html) {
    var b = el('button', cls, html);
    b.type = 'button';
    return b;
  }

  function makeKebabPop(onEdit, onDelete) {
    return UI.makeKebabPop(onEdit, onDelete);
  }

  function makeTagPop(node) {
    var pop = basePop();
    [
      ['', 'No Tag'],
      ['imp', 'Important'],
      ['vvi', 'Very Very Important']
    ].forEach(function (opt) {
      var b = popButton(null, '<span>' + opt[1] + '</span>');
      if (node.tag === opt[0]) b.style.background = 'var(--mist)';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        node.tag = opt[0];
        closePops();
        commit();
        rerender();
      });
      pop.appendChild(b);
    });
    return pop;
  }


  /* ================================================================
     MODAL (mid-screen) : multi-line add + single-line edit
  ================================================================ */
  var topicModal = UI.modal({ zScrim: 86, zWrap: 87 });
  var sheetBody = null;

  function openModal(title, build, saveFn) {
    topicModal.open(title, function (b) { sheetBody = b; build(b); }, saveFn);
  }

  function closeModal() { topicModal.close(); }

  var FIELD_CSS = UI.fieldCss;

  /* ek saath multiple topics/sub-topics : ek line = ek entry */
  function openAddModal(targetArray, title) {
    openModal(title, function (body) {
      var lab = el('label', null, 'Ek line mein ek topic:');
      var ta = el('textarea');
      ta.rows = 4;
      ta.placeholder = 'Topic 1\nTopic 2\nTopic 3';
      ta.style.cssText = FIELD_CSS + ';resize:vertical;line-height:1.6';
      body.appendChild(lab);
      body.appendChild(ta);
      body._get = function () {
        return ta.value.split('\n').map(function (s) { return s.trim(); })
          .filter(function (s) { return s; });
      };
      window.setTimeout(function () { if (topicModal.isOpen()) ta.focus(); }, 260);
    }, function () {
      var lines = sheetBody._get();
      if (!lines.length) return;
      lines.forEach(function (name) {
        targetArray.push({ id: uid(), name: name, done: false, tag: '', children: [] });
      });
      closeModal();
      commit();
      rerender();
    });
  }

  function openEditModal(node) {
    openModal('Edit Topic', function (body) {
      var lab = el('label', null, 'Topic name');
      var inp = el('input');
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.value = node.name;
      inp.style.cssText = FIELD_CSS;
      body.appendChild(lab);
      body.appendChild(inp);
      body._get = function () { return inp.value.trim(); };
      window.setTimeout(function () {
        if (topicModal.isOpen()) { inp.focus(); inp.select(); }
      }, 260);
    }, function () {
      var name = sheetBody._get();
      if (!name) return;
      node.name = name;
      closeModal();
      commit();
      rerender();
    });
  }

  /* ================================================================
     NODE ROW (recursive)
  ================================================================ */
  var roundCheck = UI.roundCheck;

  var smallBtn = UI.miniBtn;

  function nodeRow(n, depth) {
    var row = el('div');
    row.style.cssText = 'position:relative;display:flex;align-items:flex-start;gap:9px;' +
      'padding:10px 10px 10px 12px;border:1px solid var(--line);border-radius:12px;' +
      'background:var(--chap-bg);margin:0 18px 8px ' + (18 + (depth - 1) * 14) + 'px';

    /* done tick : node + poora subtree */
    var tick = roundCheck(n.done);
    tick.addEventListener('click', function () {
      setDone(n, !n.done);
      commit();
      rerender();
    });
    row.appendChild(tick);

    /* name + tag chip */
    var main = el('div');
    main.style.cssText = 'flex:1;min-width:0;display:flex;align-items:flex-start;gap:7px;flex-wrap:wrap';
    var name = el('div', null, esc(n.name));
    name.style.cssText = 'font-size:13.5px;line-height:1.5;color:var(--ink2);' +
      'white-space:pre-wrap;word-break:break-word;' +
      (n.done ? 'text-decoration:line-through;color:var(--ash)' : '');
    main.appendChild(name);
    if (n.tag) {
      var chip = el('span', 'chip-st', TAG_LABEL[n.tag]);
      if (n.tag === 'vvi') {
        chip.style.background = 'var(--ink)';
        chip.style.color = 'var(--paper)';
        chip.style.borderColor = 'var(--line-strong)';
      }
      main.appendChild(chip);
    }
    row.appendChild(main);

    /* right controls : + sub-topic, tag flag, kebab */
    var ctr = el('div');
    ctr.style.cssText = 'display:flex;align-items:center;gap:2px;flex:none';

    if (depth < MAX_DEPTH) {
      var addSub = smallBtn(ICON_PLUS, 'Add sub-topic');
      addSub.addEventListener('click', function (e) {
        e.stopPropagation();
        openAddModal(n.children, 'Add Sub-Topic');
      });
      ctr.appendChild(addSub);
    }

    var flag = smallBtn(ICON_FLAG, 'Tag topic');
    if (n.tag) flag.style.color = 'var(--ink)';
    var tagPop = makeTagPop(n);
    flag.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePop(tagPop);
    });
    ctr.appendChild(flag);

    var kebabBtn = smallBtn(ICON_KEBAB, 'Edit or delete topic');
    var kebabPop = makeKebabPop(
      function () { openEditModal(n); },
      function () {
        removeNode(chapter.topics, n.id);
        commit();
        rerender();
      }
    );
    kebabBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePop(kebabPop);
    });
    ctr.appendChild(kebabBtn);

    row.appendChild(ctr);
    row.appendChild(tagPop);
    row.appendChild(kebabPop);
    return row;
  }

  /* ================================================================
     AUTO MIND MAP : topic tree → canvas cards + curved lines
     (canvas editor fullscreen mein khulta hai, Draw list mein
     save NAHI hota — back par topic screen par wapas)
  ================================================================ */
  function sidePair(a, b) {
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    var bx = b.x + b.w / 2, by = b.y + b.h / 2;
    var dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? { a: 'e', b: 'w' } : { a: 'w', b: 'e' };
    }
    return dy > 0 ? { a: 's', b: 'n' } : { a: 'n', b: 's' };
  }

  function buildMindMap(ch) {
    var cards = [];
    var lines = [];
    var pairs = [];
    var DEPTH_COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f5', '#e5e7eb', '#fef3c7'];

    function mkCard(x, y, w, h, color, text) {
      var c = { id: UI.uid(), x: Math.round(x), y: Math.round(y), w: w, h: h, color: color, text: text };
      cards.push(c);
      return c;
    }

    function mkLine(a, b) {
      var sp = sidePair(a, b);
      lines.push({
        id: UI.uid(),
        from: { cid: a.id, side: sp.a },
        to: { cid: b.id, side: sp.b },
        text: '', arrow: 'none', color: ''
      });
    }

    /* subtree ke leaf count → angular space (bade branches ko zyada jagah) */
    function leaves(n) {
      var k = n.children || [];
      if (!k.length) return 1;
      var sum = 0;
      k.forEach(function (c) { sum += leaves(c); });
      return sum;
    }

    /* AUTO-FIT helper : CanvasCards ka shared fit logic */
    function fitVia(text, w, h) {
      return (window.CanvasCards && window.CanvasCards.fitSize)
        ? window.CanvasCards.fitSize(text, w, h)
        : { w: w, h: h };
    }

    /* radial placement : har branch ko leaf-count ke hisaab se sector */
    function placeKids(kids, parentCard, angStart, angSpan, depth) {
      if (!kids.length) return;
      var tot = 0;
      kids.forEach(function (k) { tot += leaves(k); });
      var a = angStart;
      kids.forEach(function (k) {
        var span = angSpan * (leaves(k) / tot);
        var ang = a + span / 2;
        var R = depth === 0 ? 340 : (depth === 1 ? 250 : 210);
        /* fitted card bada ho to thoda door rakho (overlap kam ho) */
        var f = fitVia(k.name, 140, 52);
        R += Math.max(0, Math.max(f.w - 140, f.h - 52)) / 2;
        var cx = parentCard.x + parentCard.w / 2 + Math.cos(ang) * R;
        var cy = parentCard.y + parentCard.h / 2 + Math.sin(ang) * R;
        var kc = mkCard(cx - f.w / 2, cy - f.h / 2, f.w, f.h,
          DEPTH_COLORS[Math.min(depth + 1, DEPTH_COLORS.length - 1)], k.name);
        pairs.push([parentCard, kc]);
        placeKids(k.children || [], kc, a, span, depth + 1);
        a += span;
      });
    }

    /* RULE : koi bhi do cards overlap NA karein —
       iterative collision resolution (radial look preserved) */
    function resolveOverlaps(all) {
      var PAD = 30;
      for (var it = 0; it < 200; it++) {
        var moved = false;
        for (var i = 0; i < all.length; i++) {
          for (var j = i + 1; j < all.length; j++) {
            var a = all[i], b = all[j];
            var dx = (b.x + b.w / 2) - (a.x + a.w / 2);
            var dy = (b.y + b.h / 2) - (a.y + a.h / 2);
            var ox = (a.w + b.w) / 2 + PAD - Math.abs(dx);
            var oy = (a.h + b.h) / 2 + PAD - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              moved = true;
              var wa = (i === 0) ? 0 : 1;   /* root pinned */
              var wb = (j === 0) ? 0 : 1;
              var tw = wa + wb || 1;
              if (ox < oy) {
                var sg = dx > 0 ? 1 : -1;
                a.x -= sg * ox * (wa / tw);
                b.x += sg * ox * (wb / tw);
              } else {
                var sg2 = dy > 0 ? 1 : -1;
                a.y -= sg2 * oy * (wa / tw);
                b.y += sg2 * oy * (wb / tw);
              }
            }
          }
        }
        if (!moved) break;
      }
      all.forEach(function (c) { c.x = Math.round(c.x); c.y = Math.round(c.y); });
    }

    var fr = fitVia(ch.name, 200, 80);
    var root = mkCard(-fr.w / 2, -fr.h / 2, fr.w, fr.h, DEPTH_COLORS[0], ch.name);
    placeKids(ch.topics || [], root, -Math.PI, 2 * Math.PI, 0);
    resolveOverlaps(cards);
    pairs.forEach(function (p) { mkLine(p[0], p[1]); });

    return {
      id: 'mindmap-' + (ch.id || 'x'),
      name: 'Mind Map: ' + ch.name,
      category: 'Auto',
      date: UI.fmtDate(UI.todayISO()),
      cards: cards,
      lines: lines
    };
  }

  function openMindMap() {
    if (!chapter || !window.CanvasEditor) return;
    var mm = buildMindMap(chapter);
    window.CanvasEditor.open(mm, function () {
      window.SubjectListBridge.openChapterViewTab('topic');
    });
  }

  /* ================================================================
     RENDER
  ================================================================ */
  function render() {
    container.innerHTML = '';

    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;padding:12px 18px 8px;gap:8px;flex-wrap:wrap';
    var addBtn = el('button', null, ICON_PLUS + ' <span>Add Topic</span>');
    addBtn.type = 'button';
    addBtn.style.cssText = 'display:inline-flex;align-items:center;gap:7px;padding:9px 16px;' +
      'border-radius:99px;border:1px solid var(--s2);background:var(--chip-bg);font:inherit;' +
      'font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer;' +
      'box-shadow:inset 0 1px 0 var(--hl-soft)';
    addBtn.addEventListener('click', function () {
      openAddModal(chapter.topics, 'Add Topic');
    });
    head.appendChild(addBtn);

    /* AI TOPICS : likho ya paste karo → AI topic-tree bana dega */
    var aiBtn = el('button', null, ICON_AI + ' <span>AI Topics</span>');
    aiBtn.type = 'button';
    aiBtn.style.cssText = 'display:inline-flex;align-items:center;gap:7px;padding:9px 16px;' +
      'border-radius:99px;border:1px solid var(--s2);background:var(--chip-bg);font:inherit;' +
      'font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer;' +
      'box-shadow:inset 0 1px 0 var(--hl-soft)';
    aiBtn.addEventListener('click', function () { openAiTopics(); });
    head.appendChild(aiBtn);

    /* Auto Mind Map : topic tree se automatic mind map → canvas editor */
    var mmBtn = el('button', null, ICON_MM + ' <span>Auto Mind Map</span>');
    mmBtn.type = 'button';
    mmBtn.style.cssText = 'display:inline-flex;align-items:center;gap:7px;padding:9px 16px;' +
      'border-radius:99px;border:1px solid var(--s2);background:var(--chip-bg);' +
      'font:inherit;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer;' +
      'box-shadow:inset 0 1px 0 var(--hl-soft)';
    mmBtn.addEventListener('click', function () { openMindMap(); });
    head.appendChild(mmBtn);
    container.appendChild(head);

    if (!chapter.topics.length) {
      var empty = el('div', 'empty',
        'No topics yet.<br>Add Topic se ek saath multiple topics add karo (ek line = ek topic).');
      empty.style.margin = '0 18px 12px';
      container.appendChild(empty);
      return;
    }

    walk(chapter.topics, function (n, depth) {
      container.appendChild(nodeRow(n, depth));
    }, 1);
  }

  function rerender() {
    if (!container || !chapter) return;
    var st = container.scrollTop;
    render();
    container.scrollTop = st;
  }

  function renderChapterView(cont, ch, hk) {
    container = cont;
    chapter = ch;
    hooks = hk || hooks;
    ensure(ch);
    rerender();
  }

  window.Topic = { renderChapterView: renderChapterView };
})();
