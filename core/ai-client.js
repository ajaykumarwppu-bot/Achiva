/* ================================================================
   CORE / AI-CLIENT.JS  —  BYOK (Bring Your Own Key) AI client
   ----------------------------------------------------------------
   • User ki APNI API key — key sirf isi device par save hoti hai
     (AppStorage 'achiva.ai.keys.v1', per-account namespace).
   • Key Achiva cloud backup mein KABHI nahi jaati — backup.js ki
     DOCS list mein ye key jaan-boojh kar include NAHI hai.
     (BYOK = key sirf tumhare browser se tumhare provider tak.)
   • Providers : OpenAI · Google Gemini · Anthropic Claude ·
     Custom (koi bhi OpenAI-compatible Base URL — Groq, OpenRouter,
     LM Studio, ollama…)
   • chat() : one-shot prompt → text (+JSON extract), fetch se.
     Sab errors Hinglish mein normalize hote hain.
   • Web-search toggle : provider support kare to on —
       - Gemini    : tools:[{google_search:{}}]  (grounding)
       - Anthropic : tools:[{type:'web_search_20250305'}]
       - OpenAI    : Responses API + web_search_preview tool;
                     account/model support na kare to chat-completions
                     par graceful fallback (note ke saath)
   • Test hook : window.__ACHIVA_AI_TEST_PROVIDER = { chat(opts) }
     → network bypass (auth.js ke __ACHIVA_TEST_PROVIDER jaisa hi)
   • ES5-only syntax (purane Android WebView safe)
   ================================================================ */

(function () {
  'use strict';

  if (window.__achivaAiClientLoaded) return;
  window.__achivaAiClientLoaded = true;

  var CFG_KEY = 'achiva.ai.keys.v1';

  var PROVIDERS = [
    { id: 'openai',    label: 'OpenAI',                    model: 'gpt-4o-mini',                search: true  },
    { id: 'gemini',    label: 'Google Gemini',             model: 'gemini-2.0-flash',           search: true  },
    { id: 'anthropic', label: 'Anthropic Claude',          model: 'claude-3-5-sonnet-latest',   search: true  },
    { id: 'custom',    label: 'Custom (OpenAI-jaisa API)', model: '',                           search: false }
  ];

  function provider(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return null;
  }

  /* ---------- config (BYOK key store) ---------- */
  function loadCfg() {
    var cfg = null;
    try { cfg = window.AppStorage.loadAt(CFG_KEY); } catch (e) { cfg = null; }
    if (!cfg || typeof cfg !== 'object' || !cfg.key) return null;
    return {
      provider: provider(cfg.provider) ? cfg.provider : 'openai',
      key: String(cfg.key),
      model: String(cfg.model || ''),
      baseUrl: String(cfg.baseUrl || '')
    };
  }
  function saveCfg(cfg) {
    if (!cfg || !cfg.key) return false;
    return window.AppStorage.saveAt(CFG_KEY, {
      provider: provider(cfg.provider) ? cfg.provider : 'openai',
      key: String(cfg.key),
      model: String(cfg.model || ''),
      baseUrl: String(cfg.baseUrl || '')
    });
  }
  function clearCfg() {
    try { window.AppStorage.rawDel(CFG_KEY); } catch (e) { /* ignore */ }
  }
  function hasKey() { return !!loadCfg(); }

  function maskKey(k) {
    k = String(k || '');
    if (k.length <= 10) return '••••';
    return k.slice(0, 6) + '…' + k.slice(-4);
  }

  /* ---------- JSON nikaalna (fences / extra text tolerate) ---------- */
  function extractJson(text) {
    if (!text) return null;
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch (e) { /* aage try karo */ }
    var i = s.indexOf('{');
    var j = s.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try { return JSON.parse(s.slice(i, j + 1)); } catch (e2) { /* null */ }
    }
    return null;
  }

  /* ---------- fetch helper + error normalize ---------- */
  function jfetch(url, init) {
    return window.fetch(url, init);
  }
  function errOf(r, label) {
    return r.text().then(function (body) {
      var msg = '';
      try {
        var d = JSON.parse(body);
        msg = (d.error && (d.error.message || d.error)) || d.message || '';
        if (typeof msg !== 'string') msg = '';
      } catch (e) { msg = String(body || '').slice(0, 160); }
      var code = r.status;
      var hint;
      if (code === 401 || code === 403) hint = 'API key reject ho gayi (' + code + ') — key check karo.';
      else if (code === 404) hint = 'Model ya endpoint nahi mila (404) — model name / Base URL check karo.';
      else if (code === 429) hint = 'Rate-limit ya quota khatam (429) — thodi der baad try karo.';
      else if (code >= 500) hint = label + ' server error (' + code + ') — baad mein try karo.';
      else hint = label + ' ne error diya (' + code + ')';
      return { ok: false, error: hint + (msg ? ' — ' + msg.slice(0, 200) : ''), status: code };
    }, function () {
      return { ok: false, error: label + ' ne error diya (' + r.status + ')', status: r.status };
    });
  }
  function netErr(label, e) {
    if (e && (e.name === 'AbortError' || e.aborted)) return { ok: false, error: 'cancelled', aborted: true };
    return { ok: false, error: label + ' se connect nahi ho paya — internet / VPN / firewall check karo.' };
  }
  function done(res, opts) {
    if (res.ok && opts && opts.json && res.json === undefined) res.json = extractJson(res.text);
    return res;
  }

  /* ---------- OpenAI (chat completions) ---------- */
  function chatOpenAI(cfg, opts) {
    var body = {
      model: cfg.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: opts.system || 'You are a helpful assistant.' },
        { role: 'user', content: opts.user }
      ]
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.json) body.response_format = { type: 'json_object' };
    return jfetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: opts.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          var c = (d.choices && d.choices[0] && d.choices[0].message) || {};
          return { ok: true, text: String(c.content || '') };
        });
      }
      return errOf(r, 'OpenAI');
    });
  }
  /* OpenAI web-search : Responses API try karo, na chale to fallback */
  function collectResponses(d) {
    if (typeof d.output_text === 'string') return d.output_text;
    var s = '';
    (d.output || []).forEach(function (it) {
      if (it && it.type === 'message') {
        (it.content || []).forEach(function (c) {
          if (c && c.type === 'output_text' && c.text) s += c.text;
        });
      }
    });
    return s;
  }
  function chatOpenAISearch(cfg, opts) {
    var body = {
      model: cfg.model || 'gpt-4o-mini',
      instructions: opts.system || 'You are a helpful assistant.',
      input: opts.user,
      tools: [{ type: 'web_search_preview' }]
    };
    if (opts.json) body.text = { format: { type: 'json_object' } };
    return jfetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: opts.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          return { ok: true, text: collectResponses(d), note: 'web search chalu tha' };
        });
      }
      if (r.status === 400 || r.status === 403 || r.status === 404) {
        /* account/model par web_search nahi → normal chat se kaam chalao */
        return chatOpenAI(cfg, opts).then(function (res) {
          if (res.ok) res.note = 'Web search is account/model par support nahi — model ki knowledge se bana hai.';
          return res;
        });
      }
      return errOf(r, 'OpenAI');
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      return chatOpenAI(cfg, opts);
    });
  }

  /* ---------- Anthropic ---------- */
  function chatAnthropic(cfg, opts) {
    var body = {
      model: cfg.model || 'claude-3-5-sonnet-latest',
      max_tokens: opts.maxTokens || 4000,
      system: opts.system || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: opts.user }]
    };
    if (opts.search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
    return jfetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        /* browser se direct call ke liye Anthropic ka required header */
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          var s = '';
          (d.content || []).forEach(function (b) {
            if (b && b.type === 'text' && b.text) s += b.text;
          });
          return { ok: true, text: s };
        });
      }
      return errOf(r, 'Anthropic');
    });
  }

  /* ---------- Google Gemini ---------- */
  function chatGemini(cfg, opts) {
    var model = cfg.model || 'gemini-2.0-flash';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(cfg.key);
    var body = {
      contents: [{ role: 'user', parts: [{ text: opts.user }] }]
    };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    var gc = {};
    if (opts.json) gc.responseMimeType = 'application/json';
    if (opts.maxTokens) gc.maxOutputTokens = opts.maxTokens;
    var hasGc = false;
    for (var k in gc) if (Object.prototype.hasOwnProperty.call(gc, k)) hasGc = true;
    if (hasGc) body.generationConfig = gc;
    if (opts.search) body.tools = [{ google_search: {} }];
    return jfetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (d) {
          var s = '';
          var parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
          parts.forEach(function (p) { if (p && p.text) s += p.text; });
          return { ok: true, text: s };
        });
      }
      return errOf(r, 'Gemini');
    });
  }

  /* ---------- Custom (OpenAI-compatible base URL) ---------- */
  function chatCustom(cfg, opts) {
    var base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    if (!base) return Promise.resolve({ ok: false, error: 'Custom provider ke liye Base URL zaroori hai.' });
    var body = {
      model: cfg.model || 'default',
      messages: [
        { role: 'system', content: opts.system || 'You are a helpful assistant.' },
        { role: 'user', content: opts.user }
      ]
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    function attempt(withJson) {
      var b = body;
      if (withJson && opts.json) b = JSON.parse(JSON.stringify(body));
      if (withJson && opts.json) b.response_format = { type: 'json_object' };
      return jfetch(base + '/chat/completions', {
        method: 'POST',
        signal: opts.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        body: JSON.stringify(b)
      }).then(function (r) {
        if (r.ok) {
          return r.json().then(function (d) {
            var c = (d.choices && d.choices[0] && d.choices[0].message) || {};
            return { ok: true, text: String(c.content || '') };
          });
        }
        /* response_format na samajhne wale servers → bina json-mode retry */
        if (withJson && opts.json && r.status === 400) return attempt(false);
        return errOf(r, 'Custom API');
      });
    }
    return attempt(true);
  }

  /* ---------- main chat() ---------- */
  function chat(opts) {
    opts = opts || {};
    var p;
    try {
      /* test hook — network bypass (tests isi se mock karte hain) */
      var hook = window.__ACHIVA_AI_TEST_PROVIDER;
      if (hook && typeof hook.chat === 'function') {
        p = Promise.resolve(hook.chat(opts)).then(function (res) {
          res = res || {};
          if (res.ok === false) return res;
          return { ok: true, text: String(res.text || ''), note: res.note };
        });
        return p.then(function (res) { return done(res, opts); });
      }

      var cfg = opts.cfg || loadCfg();
      if (!cfg || !cfg.key) {
        return Promise.resolve({ ok: false, error: 'API key saved nahi hai — AI setup mein apni key dalo.' });
      }
      var which = cfg.provider;
      if (which === 'openai') p = opts.search ? chatOpenAISearch(cfg, opts) : chatOpenAI(cfg, opts);
      else if (which === 'gemini') p = chatGemini(cfg, opts);
      else if (which === 'anthropic') p = chatAnthropic(cfg, opts);
      else p = chatCustom(cfg, opts);
      return p.then(function (res) { return done(res, opts); }, function (e) {
        return done(netErr('AI provider', e), opts);
      });
    } catch (e) {
      return Promise.resolve(done(netErr('AI provider', e), opts));
    }
  }

  /* ---------- key test (chhoti si call) ---------- */
  function testKey(cfg) {
    return chat({
      cfg: cfg,
      system: 'You are a test. Reply with exactly one word: ok',
      user: 'ping',
      maxTokens: 16
    }).then(function (res) {
      if (res.ok) return { ok: true };
      return { ok: false, error: res.error };
    });
  }

  window.AchivaAI = {
    CFG_KEY: CFG_KEY,
    PROVIDERS: PROVIDERS,
    provider: provider,
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    clearCfg: clearCfg,
    hasKey: hasKey,
    maskKey: maskKey,
    chat: chat,
    testKey: testKey,
    extractJson: extractJson
  };
})();
