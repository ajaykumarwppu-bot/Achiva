/* ================================================================
   CANVAS / CANVAS-AI.JS  —  AI Plan Generator (BYOK)
   ----------------------------------------------------------------
   • Canvas editor ke ✨ AI button se khulta hai — JAHAN BHI canvas
     open ho (Draw board, goal board, chapter mind-map — sab
     CanvasEditor.open() se aate hain, isliye button sab jagah hai)
   • Pehli baar : BYOK key wizard (provider + apni API key + model)
     — key sirf device par (AchivaAI, core/ai-client.js); cloud
     backup mein kabhi nahi jaati.
   • Topic likho → AI deep research karke poora study plan banata hai:
       - Quick : 1 AI call → groups + nodes + edges
       - Deep  : 3 AI calls → outline → notes expand → dependencies
       - Web-search toggle : provider support kare to on
   • Plan canvas mein materialize hota hai :
       groups  = glass group boxes (phases)
       nodes   = cards (steps/topics, notes ke saath)
       edges   = connection lines (prerequisite/order)
     + group→group flow lines + group ke andar sequential chain
   • Poora plan EK undo snapshot mein — ek Undo se sab hat jata hai
   • Layout : existing content ke NEECHE khali area mein (kuch bhi
     overlap nahi hota), phir view plan par fit
   • ES5-only syntax
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaCanvasAiLoaded) return;
  window.__achivaCanvasAiLoaded = true;

  var el = UI.el, uid = UI.uid;

  var aiModal = UI.modal({ zScrim: 92, zWrap: 93 });
  var keyModal = UI.modal({ zScrim: 96, zWrap: 97 });

  var currentAbort = null;

  function E() { return (window.CanvasEditor && window.CanvasEditor.api) || null; }
  function API() { return window.AchivaAI; }

  /* ================================================================
     PROMPTS + PIPELINE
  ================================================================ */
  var SYSTEM_BASE =
    'You are an expert study planner for Indian students. ' +
    'Respond ONLY with valid JSON — no markdown fences, no extra text. ' +
    'Write titles/notes in the SAME language as the user topic (Hinglish topics → Hinglish).';

  var SCHEMA =
    '{"title":"plan ka naam","groups":[{"id":"g1","title":"Phase 1: …","note":"1-line summary",' +
    '"nodes":[{"id":"n1","title":"step/topic","note":"actionable details"}]}],' +
    '"edges":[{"from":"n1","to":"n2","label":"chhota reason"}]}';

  function topicBlock(topic) { return 'Topic: ' + topic + '\n\n'; }

  var RULES_FULL =
    'Rules:\n' +
    '- 3 se 6 groups (phases/stages), har group mein 3 se 8 nodes\n' +
    '- node.note = actionable steps (kya karna hai, kaise, kitna time)\n' +
    '- edges = prerequisites/order (from pehle karo, to baad mein) — 5 se 15 edges\n' +
    '- sab ids unique hon (g1,g2,… / n1,n2,…)\n' +
    '- SIRF valid JSON do, exactly is schema mein:\n' + SCHEMA;

  function promptQuick(topic) {
    return topicBlock(topic) +
      'Is topic par ek COMPLETE study plan banao — phases (groups), har phase mein steps (nodes), aur steps ke beech order (edges).\n' +
      RULES_FULL;
  }
  function promptOutline(topic) {
    return topicBlock(topic) +
      'Is topic par research karke plan ka OUTLINE banao (abhi sirf structure):\n' +
      '- 3 se 6 groups (phases), har group mein 3 se 8 nodes\n' +
      '- har node ki note abhi SIRF 1 short line\n' +
      '- edges MAT do\n' +
      '- sab ids unique hon (g1,g2,… / n1,n2,…)\n' +
      '- SIRF valid JSON do, is schema mein (edges array khaali chhodo):\n' + SCHEMA;
  }
  function promptExpand(outlineJson) {
    return 'Ye plan ka outline hai:\n' + outlineJson + '\n\n' +
      'Ab DEEP RESEARCH karke har node ki note ko 3-6 actionable lines mein expand karo ' +
      '(concrete steps, quantities, examples/numericals, revision pointers).\n' +
      'Wapas EXACTLY same structure aur SAME ids do — nodes add/remove/rename mat karo. ' +
      'edges abhi bhi mat do. SIRF valid JSON.';
  }
  function promptEdges(compactJson) {
    return 'Ye study plan hai:\n' + compactJson + '\n\n' +
      'Ab iske nodes ke beech prerequisite/order connections (dependencies) do — ' +
      'kaunsa step kis se pehle hona chahiye (same group ke andar bhi aur groups ke beech bhi).\n' +
      'SIRF un ids ka use karo jo plan mein hain. 5 se 20 edges.\n' +
      'SIRF valid JSON do: {"edges":[{"from":"id","to":"id","label":"chhota reason"}]}';
  }

  /* ek AI call + JSON na bane to ek repair retry */
  function callJson(prompt, opts, maxTokens) {
    var A = API();
    var base = {
      system: SYSTEM_BASE,
      user: prompt,
      json: true,
      search: !!opts.search,
      signal: opts.signal,
      maxTokens: maxTokens
    };
    return A.chat(base).then(function (res) {
      if (!res.ok) return res;
      if (res.json) return res;
      /* repair retry : invalid JSON → sirf JSON maango */
      return A.chat({
        system: SYSTEM_BASE,
        user: 'Ye JSON invalid tha. Ise theek karke SIRF valid JSON wapas do (koi text/fences nahi):\n' +
          String(res.text || '').slice(0, 2500),
        json: true,
        search: false,
        signal: opts.signal,
        maxTokens: maxTokens
      }).then(function (res2) {
        if (!res2.ok) return res2;
        if (res2.json) return res2;
        return { ok: false, error: 'AI ne valid JSON nahi diya — dobara try karo (ya Deep mode band karke Quick try karo).' };
      });
    });
  }

  /* plan ko safe shape mein lao (clamp + validate) */
  function normalizePlan(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var rawGroups = Array.isArray(raw.groups) ? raw.groups : [];
    if (!rawGroups.length) return null;
    var out = { title: String(raw.title || 'AI Plan').slice(0, 80), groups: [], edges: [] };
    var nodeIds = {};
    rawGroups.slice(0, 8).forEach(function (g, gi) {
      if (!g || typeof g !== 'object') return;
      var rawNodes = Array.isArray(g.nodes) ? g.nodes : [];
      var gg = {
        id: 'aig' + (gi + 1),
        title: String(g.title || ('Phase ' + (gi + 1))).slice(0, 60),
        note: String(g.note || '').slice(0, 200),
        nodes: []
      };
      rawNodes.slice(0, 10).forEach(function (n, ni) {
        if (!n) return;
        var isStr = (typeof n === 'string');
        var t = String(isStr ? n : (n.title || '')).slice(0, 80);
        if (!t) return;
        var id = String((!isStr && n.id) || ('n' + gi + '_' + ni));
        if (nodeIds[id]) id = id + '_x' + gi + '_' + ni;   /* collision guard */
        nodeIds[id] = true;
        gg.nodes.push({
          id: id,
          title: t,
          note: String((!isStr && n.note) || '').slice(0, 600)
        });
      });
      if (gg.nodes.length) out.groups.push(gg);
    });
    if (!out.groups.length) return null;
    var seen = {};
    (Array.isArray(raw.edges) ? raw.edges : []).forEach(function (e) {
      if (!e || !nodeIds[e.from] || !nodeIds[e.to] || e.from === e.to) return;
      var k = e.from + '>' + e.to;
      if (seen[k] || out.edges.length >= 40) return;
      seen[k] = 1;
      out.edges.push({ from: String(e.from), to: String(e.to), label: String(e.label || '').slice(0, 40) });
    });
    return out;
  }

  /* poori pipeline : topic → normalized plan */
  function generatePlan(topic, opts) {
    opts = opts || {};
    var deep = (opts.depth === 'deep');
    var phase = opts.onPhase || function () {};
    var quickCall = function (p, mt) { return callJson(p, opts, mt); };

    if (!deep) {
      phase('Research + plan ban raha hai… (1 AI call)');
      return quickCall(promptQuick(topic), 3500).then(function (res) {
        if (!res.ok) return res;
        var plan = normalizePlan(res.json);
        if (!plan) return { ok: false, error: 'AI ke jawab se plan nahi ban paya — dobara try karo.' };
        return { ok: true, plan: plan, note: res.note };
      });
    }

    /* DEEP : pass1 outline → pass2 expand → pass3 edges */
    var outline = null;
    phase('Deep research 1/3 : outline…');
    return quickCall(promptOutline(topic), 2500).then(function (res1) {
      if (!res1.ok) return res1;
      outline = normalizePlan(res1.json);
      if (!outline) return { ok: false, error: 'AI ke outline se plan nahi ban paya — dobara try karo.' };
      phase('Deep research 2/3 : notes expand…');
      return callJson(promptExpand(JSON.stringify(outline)), opts, 4000).then(function (res2) {
        var expanded = (res2.ok && res2.json) ? normalizePlan(res2.json) : null;
        if (!expanded) expanded = outline;   /* expand fail → outline se hi chalao */
        phase('Deep research 3/3 : connections…');
        return callJson(promptEdges(JSON.stringify({ groups: expanded.groups })), opts, 1500).then(function (res3) {
          var plan = expanded;
          if (res3.ok && res3.json && Array.isArray(res3.json.edges)) {
            var merged = normalizePlan({ title: plan.title, groups: plan.groups, edges: res3.json.edges });
            if (merged) plan = merged;
          } else if (!plan.edges.length) {
            /* edges pass fail + outline mein bhi edges nahi → quick-style edges nahi, bas chain */
          }
          return { ok: true, plan: plan, note: res3.note || (res2 && res2.note) };
        });
      });
    });
  }

  /* ================================================================
     LAYOUT — plan → canvas (groups + cards + lines)
  ================================================================ */
  var CW = 180, CH = 100, GAP = 18, PAD = 18, TITLE_H = 40, FLOW_GAP = 70;

  function contentBBox(canvas) {
    var has = false, minx = 1e9, maxy = -1e9;
    canvas.cards.forEach(function (c) {
      has = true; minx = Math.min(minx, c.x); maxy = Math.max(maxy, c.y + c.h);
    });
    (canvas.groups || []).forEach(function (g) {
      has = true; minx = Math.min(minx, g.x); maxy = Math.max(maxy, g.y + g.h);
    });
    return has ? { minx: minx, maxy: maxy } : null;
  }

  function anchorFor(a, b) {
    var acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    var bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    if (bcy > acy + 40) return ['s', 'n'];
    if (bcy < acy - 40) return ['n', 's'];
    if (bcx >= acx) return ['e', 'w'];
    return ['w', 'e'];
  }

  /* normalized plan ko current canvas mein rakho — EK commit (undo-able) */
  function placePlan(plan) {
    var api = E();
    if (!api) return false;
    var canvas = api.getCanvas();
    if (!canvas || !plan || !plan.groups || !plan.groups.length) return false;
    if (!Array.isArray(canvas.groups)) canvas.groups = [];

    /* origin : existing content ke neeche (khaali canvas → 40,40) */
    var bb = contentBBox(canvas);
    var ox = bb ? bb.minx : 40;
    var oy = bb ? bb.maxy + 120 : 40;

    var y = oy;
    var nodeCard = {};
    var connected = {};

    /* title card */
    var titleCard = { id: uid(), x: ox, y: y, w: 340, h: 64, color: '#ffffff', text: plan.title };
    canvas.cards.push(titleCard);
    y += 64 + FLOW_GAP;

    var groupBoxes = [];
    plan.groups.forEach(function (g) {
      var cols = Math.min(3, g.nodes.length);
      var rows = Math.ceil(g.nodes.length / cols);
      var gw = PAD * 2 + cols * CW + (cols - 1) * GAP;
      var gh = TITLE_H + PAD + rows * CH + (rows - 1) * GAP + PAD;
      var box = { id: uid(), x: ox, y: y, w: gw, h: gh, color: '', text: g.title };
      canvas.groups.push(box);
      groupBoxes.push(box);

      g.nodes.forEach(function (n, ni) {
        var col = ni % cols, row = Math.floor(ni / cols);
        var card = {
          id: uid(),
          x: ox + PAD + col * (CW + GAP),
          y: y + TITLE_H + PAD + row * (CH + GAP),
          w: CW, h: CH, color: '#ffffff',
          text: n.title + (n.note ? '\n\n' + n.note : '')
        };
        canvas.cards.push(card);
        nodeCard[n.id] = card;
      });

      /* group ke andar sequential chain (plan ka natural flow) */
      for (var ni = 0; ni < g.nodes.length - 1; ni++) {
        var a = nodeCard[g.nodes[ni].id], b = nodeCard[g.nodes[ni + 1].id];
        if (!a || !b) continue;
        var sides = (a.y === b.y) ? ['e', 'w'] : ['s', 'n'];
        canvas.lines.push({
          id: uid(), from: { cid: a.id, side: sides[0] }, to: { cid: b.id, side: sides[1] },
          text: '', arrow: 'end', color: ''
        });
        connected[a.id + '>' + b.id] = 1;
      }
      y += gh + FLOW_GAP;
    });

    /* group → group flow lines (phase order) */
    for (var gi = 0; gi < groupBoxes.length - 1; gi++) {
      canvas.lines.push({
        id: uid(),
        from: { cid: groupBoxes[gi].id, side: 's' },
        to: { cid: groupBoxes[gi + 1].id, side: 'n' },
        text: '', arrow: 'end', color: ''
      });
    }

    /* AI dependency edges */
    (plan.edges || []).forEach(function (e) {
      var a = nodeCard[e.from], b = nodeCard[e.to];
      if (!a || !b || a.id === b.id) return;
      if (connected[a.id + '>' + b.id] || connected[b.id + '>' + a.id]) return;
      connected[a.id + '>' + b.id] = 1;
      var sides = anchorFor(a, b);
      canvas.lines.push({
        id: uid(), from: { cid: a.id, side: sides[0] }, to: { cid: b.id, side: sides[1] },
        text: e.label || '', arrow: 'end', color: ''
      });
    });

    api.commit();
    if (window.CanvasCards) window.CanvasCards.render();
    if (window.CanvasLines) window.CanvasLines.render();
    if (window.CanvasGroups) window.CanvasGroups.render();

    /* view plan par fit karo */
    focusRect(api, ox, oy, Math.max(340, PAD * 2 + 3 * CW + 2 * GAP), y - FLOW_GAP - oy);
    return true;
  }

  function focusRect(api, x, y, w, h) {
    var vw = api.viewport.clientWidth || 360;
    var vh = api.viewport.clientHeight || 640;
    var t = api.getT();
    var s = Math.max(0.25, Math.min(vw / w, vh / h, 1) * 0.92);
    t.s = s;
    t.x = (vw - w * s) / 2 - x * s;
    t.y = (vh - h * s) / 2 - y * s;
    api.applyT();
  }

  /* ================================================================
     UI — key wizard + plan modal
  ================================================================ */
  function openKeyWizard(onDone) {
    var A = API();
    var cfg = A.loadCfg() || {};
    keyModal.open('AI setup (apni key)', function (body) {
      body.appendChild(el('div', 'sub-meta',
        'BYOK — apni AI API key lagao. Key SIRF is device par save hoti hai aur cloud backup mein KABHI nahi jaati. Kharcha tumhare provider ke rates se lagega.'));

      body.appendChild(UI.label('Provider'));
      var sel = el('select');
      sel.style.cssText = UI.fieldCss + ';margin-bottom:10px';
      A.PROVIDERS.forEach(function (p) {
        var o = el('option', null, p.label);
        o.value = p.id;
        sel.appendChild(o);
      });
      sel.value = cfg.provider || 'openai';
      body.appendChild(sel);

      body.appendChild(UI.label('Model'));
      var modelInp = el('input');
      modelInp.type = 'text';
      modelInp.style.cssText = UI.fieldCss + ';margin-bottom:10px';
      body.appendChild(modelInp);

      var baseWrap = el('div');
      baseWrap.style.cssText = 'margin-bottom:10px';
      baseWrap.appendChild(UI.label('Base URL (custom)'));
      var baseInp = el('input');
      baseInp.type = 'text';
      baseInp.placeholder = 'https://api.groq.com/openai/v1';
      baseInp.style.cssText = UI.fieldCss;
      baseWrap.appendChild(baseInp);
      body.appendChild(baseWrap);

      body.appendChild(UI.label('API key'));
      var keyInp = el('input');
      keyInp.type = 'password';
      keyInp.placeholder = 'sk-…';
      keyInp.autocomplete = 'off';
      keyInp.style.cssText = UI.fieldCss + ';margin-bottom:10px';
      body.appendChild(keyInp);

      var row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px';
      var testBtn = UI.pillBtn('Test key');
      var testMsg = el('div', 'sub-meta', '');
      row.appendChild(testBtn);
      row.appendChild(testMsg);
      body.appendChild(row);

      var delBtn = UI.pillBtn('Key delete karo');
      delBtn.style.marginTop = '10px';
      delBtn.addEventListener('click', function () {
        A.clearCfg();
        keyInp.value = '';
        testMsg.textContent = 'Key hata di gayi.';
      });
      if (A.hasKey()) body.appendChild(delBtn);

      function draft() {
        return {
          provider: sel.value,
          key: String(keyInp.value || '').trim() || (A.loadCfg() || {}).key || '',
          model: String(modelInp.value || '').trim(),
          baseUrl: String(baseInp.value || '').trim()
        };
      }
      function syncDefaults() {
        var p = A.provider(sel.value);
        var cur = A.loadCfg();
        modelInp.value = (cur && cur.provider === sel.value && cur.model) ? cur.model : ((p && p.model) || '');
        baseInp.value = (cur && cur.provider === sel.value && cur.baseUrl) ? cur.baseUrl : '';
        baseWrap.style.display = (sel.value === 'custom') ? '' : 'none';
      }
      sel.addEventListener('change', syncDefaults);
      if (cfg.provider) {
        modelInp.value = cfg.model || '';
        baseInp.value = cfg.baseUrl || '';
      }
      syncDefaults();

      testBtn.addEventListener('click', function () {
        var d = draft();
        if (!d.key) { testMsg.textContent = 'Pehle key dalo.'; return; }
        testMsg.textContent = 'Test ho raha hai…';
        A.testKey(d).then(function (r) {
          testMsg.textContent = r.ok ? '✓ Key chal rahi hai' : ('✗ ' + r.error);
          testMsg.style.color = r.ok ? 'var(--good, #2e7d32)' : 'var(--bad, #c62828)';
        });
      });

      keyModal._draft = draft;
    }, function () {
      var d = keyModal._draft ? keyModal._draft() : null;
      if (!d || !d.key) return;
      A.saveCfg(d);
      keyModal.close();
      if (onDone) onDone();
    });
  }

  function openPlanModal() {
    var A = API();
    var cfg = A.loadCfg();
    if (!cfg) { openKeyWizard(openPlanModal); return; }
    var prov = A.provider(cfg.provider);
    var canvas = E() ? E().getCanvas() : null;
    var canvasName = (canvas && canvas.name) ? canvas.name : '';

    aiModal.open('AI plan banao', function (body) {
      body.appendChild(el('div', 'sub-meta',
        'Topic likho — AI research karke isi canvas mein phases (group boxes), steps (cards) aur connections bana dega.'));

      var who = el('div', 'sub-meta',
        (prov ? prov.label : cfg.provider) + ' · ' + (cfg.model || 'default model') +
        ' · key ' + A.maskKey(cfg.key) + (canvasName ? ' · board: ' + canvasName : ''));
      who.style.marginBottom = '10px';
      body.appendChild(who);

      body.appendChild(UI.label('Kya plan karna hai?'));
      var topic = el('textarea');
      topic.rows = 3;
      topic.placeholder = 'e.g. Electrochemistry — 20 din ka complete revision plan (boards + numericals)';
      topic.style.cssText = UI.fieldCss + ';resize:vertical;margin-bottom:10px';
      body.appendChild(topic);

      body.appendChild(UI.label('Depth'));
      var depth = el('select');
      depth.style.cssText = UI.fieldCss + ';margin-bottom:10px';
      var o1 = el('option', null, 'Quick — 1 AI call (~4k tokens)'); o1.value = 'quick';
      var o2 = el('option', null, 'Deep research — 3 AI calls (~10k tokens)'); o2.value = 'deep';
      depth.appendChild(o1); depth.appendChild(o2);
      body.appendChild(depth);

      var searchLbl = el('label');
      searchLbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2);margin-bottom:10px';
      var searchBox = el('input');
      searchBox.type = 'checkbox';
      searchLbl.appendChild(searchBox);
      searchLbl.appendChild(el('span', null, 'Web search bhi karo (provider support kare to)'));
      body.appendChild(searchLbl);

      var status = el('div', 'sub-meta', '');
      status.style.cssText = 'display:none;margin-bottom:10px;white-space:pre-wrap';
      body.appendChild(status);

      var btnRow = el('div');
      btnRow.style.cssText = 'display:flex;gap:10px';
      var gen = el('button', 'btn-solid', '✨ Plan banao');
      gen.type = 'button';
      gen.style.flex = '1';
      var cancelGen = UI.pillBtn('Cancel');
      cancelGen.style.display = 'none';
      btnRow.appendChild(gen);
      btnRow.appendChild(cancelGen);
      body.appendChild(btnRow);

      var changeKey = UI.pillBtn('AI key change karo');
      changeKey.style.marginTop = '10px';
      changeKey.addEventListener('click', function () {
        aiModal.close();
        openKeyWizard(openPlanModal);
      });
      body.appendChild(changeKey);

      gen.addEventListener('click', function () {
        var t = String(topic.value || '').trim();
        if (!t) { show('Topic to likho pehle 🙂', true); return; }
        currentAbort = window.AbortController ? new AbortController() : { signal: undefined, abort: function () {} };
        gen.disabled = true;
        gen.textContent = 'Ban raha hai…';
        cancelGen.style.display = '';
        generatePlan(t, {
          depth: depth.value,
          search: searchBox.checked,
          signal: currentAbort.signal,
          onPhase: function (msg) { show(msg, false); }
        }).then(function (res) {
          gen.disabled = false;
          gen.textContent = '✨ Plan banao';
          cancelGen.style.display = 'none';
          if (res.aborted) { show('Cancel ho gaya.', true); return; }
          if (!res.ok) { show(res.error || 'Kuch gadbad ho gayi — dobara try karo.', true); return; }
          if (!placePlan(res.plan)) { show('Canvas ready nahi — editor mein se dobara try karo.', true); return; }
          aiModal.close();
        }, function () {
          gen.disabled = false;
          gen.textContent = '✨ Plan banao';
          cancelGen.style.display = 'none';
          show('Unexpected error — dobara try karo.', true);
        });
      });
      cancelGen.addEventListener('click', function () {
        if (currentAbort) { try { currentAbort.abort(); } catch (e) { /* ignore */ } }
      });

      function show(msg, isErr) {
        status.style.display = '';
        status.textContent = msg;
        status.style.color = isErr ? 'var(--bad, #c62828)' : 'var(--ink2)';
      }
    }, null);
  }

  function open() {
    var api = E();
    if (!api || !api.getCanvas()) return;      /* editor khula hi nahi */
    if (api.readOnly()) return;                /* read-only mein generation band */
    if (!API()) return;                        /* ai-client load nahi hua */
    if (!API().hasKey()) { openKeyWizard(openPlanModal); return; }
    openPlanModal();
  }

  window.CanvasAI = {
    open: open,
    openKeyWizard: openKeyWizard,
    /* tests ke liye headless entry points (modal ke bina) */
    _test: {
      generatePlan: function (topic, opts) { return generatePlan(topic, opts || {}); },
      placePlan: placePlan,
      normalizePlan: normalizePlan
    }
  };
})();
