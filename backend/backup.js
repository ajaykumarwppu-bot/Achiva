/* ================================================================
   BACKEND / BACKUP.JS — manual backup + restore (koi auto-backup nahi)
   ----------------------------------------------------------------
   Responsibility:
     • App ka poora data 6 localStorage keys mein hai. Inhe 6 alag
       Firestore docs mein JSON *string* ki tarah save karna, taaki
       restore par data byte-to-byte wapas mile.
     • Backup SIRF user ke button dabane par hota hai (Settings →
       "Backup now") — app khud kabhi upload nahi karti.
     • Restore bhi sirf user ki haan se hota hai.
     • Login ke baad ek baar "firstRunFlow" : cloud aur local data
       dekh kar 3 mein se ek sawaal poochta hai (kabhi auto nahi).
     • Settings panel ko status dena: lastBackupAt, cloudSummary,
       localSummary, hasLocal.

   Firestore layout:
     users/{uid}                    → profile doc {email, createdAt, lastBackupAt, app:'achiva', v:1}
     users/{uid}/data/<docId>       → {v:1, savedAt:<ms>, value:"<JSON string>"}

   Load order (backend): 4/5
   ================================================================ */

(function () {
  'use strict';

  var CLOUD = window.AchivaCloud;

  /* ---------- app ke saare data keys (backup mein yahi jayenge) ----------
     docId = Firestore document ka naam | key = localStorage key
     label = Settings mein dikhne wala naam | main = asli study data hai?  */
  var DOCS = [
    { docId: 'subjectTracker', key: 'achiva.subjectTracker.v1',   label: 'Subjects + chapters', main: true },
    { docId: 'canvas',         key: 'achiva.canvas.v1',           label: 'Canvas boards',       main: true },
    { docId: 'timerStudy',     key: 'achiva.timer.study.v1',      label: 'Screen-time log',     main: true },
    { docId: 'timerManual',    key: 'achiva.timer.manual.v1',     label: 'Manual time entries', main: true },
    { docId: 'canvasColors',   key: 'achiva.canvas.savedColors',  label: 'Canvas colours',      main: false },
    { docId: 'prefs',          key: 'achiva.prefs.v1',            label: 'App settings',        main: false }
  ];

  function hasCloud() { return !!(CLOUD && CLOUD.ready && CLOUD.ready()); }
  function msg(e) { return CLOUD && CLOUD.message ? CLOUD.message(e) : 'Cloud se baat nahi ho payi.'; }

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function sess() {
    return (window.AchivaAuth && window.AchivaAuth.session) ? window.AchivaAuth.session() : null;
  }

  /* ---------- local summary ---------- */
  function localSummary() {
    var out = [];
    DOCS.forEach(function (d) {
      var raw = lsGet(d.key);
      var n = 0;
      if (raw) {
        try {
          var v = JSON.parse(raw);
          if (Array.isArray(v)) n = v.length;
          else if (v && typeof v === 'object') n = Object.keys(v).length;
          else n = 1;
        } catch (e) { n = 1; }
      }
      out.push({ docId: d.docId, label: d.label, main: !!d.main, present: !!raw, count: n });
    });
    return out;
  }

  function hasLocal() {
    return DOCS.some(function (d) {
      if (!d.main) return false;
      var raw = lsGet(d.key);
      return !!raw && raw !== 'null' && raw !== '{}' && raw !== '[]';
    });
  }

  /* prefs ko pehle localStorage mein likh do, phir backup lo —
     isse theme choice bhi cloud par chali jaati hai */
  function flushPrefs() {
    try {
      if (window.AchivaSettings && window.AchivaSettings.readPrefs) {
        var p = window.AchivaSettings.readPrefs();
        lsSet('achiva.prefs.v1', JSON.stringify(p));
      }
    } catch (e) { /* ignore */ }
  }

  function lastBackupAt() {
    var raw = lsGet('achiva.lastBackupAt');
    var n = raw ? parseInt(raw, 10) : 0;
    return n || null;
  }

  /* ---------- BACKUP (upload) ---------- */
  function push(s) {
    s = s || sess();
    if (!s || !s.uid) return Promise.resolve({ ok: false, code: 'no-account', message: 'Pehle login karein, phir backup lein.' });
    if (s.offline) return Promise.resolve({ ok: false, code: 'offline', message: 'Offline mode mein backup nahi ho sakta. Net aane par dobara karein.' });
    if (!hasCloud()) return Promise.resolve({ ok: false, code: 'no-cloud', message: 'Cloud ready nahi hai (Firebase config / SDK check karein).' });

    flushPrefs();
    var now = Date.now();
    var jobs = [];

    DOCS.forEach(function (d) {
      var raw = lsGet(d.key);
      if (raw === null || raw === undefined) return;   /* jo key hi nahi hai, wo doc nahi banega */
      jobs.push(CLOUD.saveDoc('users/' + s.uid + '/data/' + d.docId, {
        v: 1,
        savedAt: now,
        value: raw                    /* JSON string — byte-exact round trip */
      }));
    });

    /* profile doc = users/<uid> (2 segments = valid DocumentReference).
       Pehle 'users/<uid>/profile' (3 segments) tha jo Firestore mein invalid hai
       aur logged-in user par backup/settings ko crash karta tha. */
    jobs.push(CLOUD.saveDoc('users/' + s.uid, {
      app: 'achiva',
      v: 1,
      email: s.email || '',
      uid: s.uid,
      createdAt: now,
      lastBackupAt: now
    }));

    return Promise.all(jobs).then(function (res) {
      var bad = null;
      res.forEach(function (r) { if (!r.ok && !bad) bad = r; });
      if (bad) return { ok: false, code: bad.code, message: bad.message || msg(bad) };
      lsSet('achiva.lastBackupAt', String(now));
      return { ok: true, at: now, docs: res.length };
    }).catch(function (e) {
      return { ok: false, code: 'unknown', message: msg(e) };
    });
  }

  /* ---------- cloud se poora data padho ---------- */
  function fetchCloud(s) {
    s = s || sess();
    if (!s || !s.uid) return Promise.resolve({ ok: false, code: 'no-account', message: 'Pehle login karein.' });
    if (!hasCloud()) return Promise.resolve({ ok: false, code: 'no-cloud', message: 'Cloud ready nahi hai.' });

    return Promise.all([
      CLOUD.readDoc('users/' + s.uid),          /* profile doc = users/<uid> (2 segments, valid) */
      CLOUD.readDocs('users/' + s.uid + '/data')
    ]).then(function (r) {
      var prof = r[0], docsRes = r[1];
      if (!prof.ok) return { ok: false, code: prof.code, message: prof.message || msg(prof) };
      if (!docsRes.ok) return { ok: false, code: docsRes.code, message: docsRes.message || msg(docsRes) };

      var map = {};
      (docsRes.docs || []).forEach(function (d) {
        if (d.data && typeof d.data.value === 'string') map[d.id] = d.data;
      });
      var items = [];
      DOCS.forEach(function (d) {
        if (map[d.docId]) {
          items.push({ docId: d.docId, label: d.label, value: map[d.docId].value, savedAt: map[d.docId].savedAt || 0 });
        }
      });
      return {
        ok: true,
        items: items,
        profile: prof.data || null,
        lastBackupAt: (prof.data && prof.data.lastBackupAt) || null
      };
    }).catch(function (e) {
      return { ok: false, code: 'unknown', message: msg(e) };
    });
  }

  function cloudSummary(s) {
    return fetchCloud(s).then(function (r) {
      if (!r.ok) return r;
      return {
        ok: true,
        lastBackupAt: r.lastBackupAt,
        items: r.items.map(function (i) { return { docId: i.docId, label: i.label, savedAt: i.savedAt }; }),
        count: r.items.length
      };
    });
  }

  /* ---------- RESTORE (download → localStorage → reload) ---------- */
  function applyItems(items) {
    var n = 0;
    (items || []).forEach(function (it) {
      if (typeof it.value !== 'string') return;
      if (lsSet(it.key || keyOf(it.docId), it.value)) n++;
    });
    return n;
  }

  /* app ko dobara load karo.
     Export ke zariye call hota hai taaki automated test mein ise
     count karne wale function se badla ja sake (production mein
     ye bilkul window.location.reload() hi karta hai). */
  function reload() { window.location.reload(); }
  function doReload() {
    var f = (window.AchivaBackup && window.AchivaBackup.reload) || reload;
    f();
  }

  function keyOf(docId) {
    for (var i = 0; i < DOCS.length; i++) if (DOCS[i].docId === docId) return DOCS[i].key;
    return null;
  }

  function pull(s, opts) {
    s = s || sess();
    opts = opts || {};
    if (!s || !s.uid) return Promise.resolve({ ok: false, code: 'no-account', message: 'Pehle login karein.' });
    if (s.offline) return Promise.resolve({ ok: false, code: 'offline', message: 'Offline mode mein restore nahi ho sakta.' });
    if (!hasCloud()) return Promise.resolve({ ok: false, code: 'no-cloud', message: 'Cloud ready nahi hai.' });

    return fetchCloud(s).then(function (r) {
      if (!r.ok) return r;
      if (!r.items.length) {
        return { ok: false, code: 'empty', message: 'Cloud par abhi koi backup nahi mila. Pehle "Backup now" dabayein.' };
      }
      var n = applyItems(r.items.map(function (i) { return { docId: i.docId, key: keyOf(i.docId), value: i.value }; }));
      /* theme turant lagao (reload se pehle bhi sahi dikhe) */
      try {
        if (window.AchivaSettings && window.AchivaSettings.applyThemeFromStorage) {
          window.AchivaSettings.applyThemeFromStorage();
        }
      } catch (e) { /* ignore */ }
      if (r.lastBackupAt) lsSet('achiva.lastBackupAt', String(r.lastBackupAt));
      if (opts.reload !== false) {
        window.setTimeout(doReload, 350);
      }
      return { ok: true, count: n, at: r.lastBackupAt };
    });
  }

  /* ---------- time ko readable banao ---------- */
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    var p = function (x) { return String(x).padStart(2, '0'); };
    var mon = (window.UI && UI.MONTHS) ? UI.MONTHS[d.getMonth()] : ('M' + (d.getMonth() + 1));
    return d.getDate() + ' ' + mon +
      ' ' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function agoText(ts) {
    if (!ts) return 'kabhi nahi';
    var diff = Date.now() - ts;
    if (diff < 0) diff = 0;
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'abhi';
    if (m < 60) return m + ' min pehle';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' ghante pehle';
    var dd = Math.floor(h / 24);
    if (dd < 30) return dd + ' din pehle';
    return fmtTime(ts);
  }

  /* ================================================================
     DIALOGS (UI.modal ka use — CSS frozen, isliye sab builder se)
  ================================================================ */
  function dlg(zWrap) {
    return UI.modal({ zWrap: zWrap || 430, zScrim: (zWrap || 430) - 1 });
  }

  function choiceModal(o) {
    var m = dlg(o.z || 430);
    var status = null;
    m.open(o.title, function (body) {
      if (o.text) {
        var p = UI.el('div', null, UI.esc(o.text));
        p.style.cssText = 'font-size:12.5px;line-height:1.7;color:var(--ink2);margin-bottom:10px';
        body.appendChild(p);
      }
      if (o.bullets && o.bullets.length) {
        var ul = UI.el('div');
        ul.style.cssText = 'font-size:11.5px;line-height:1.9;color:var(--ash);margin:0 0 10px;' +
          'padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--chap-bg)';
        o.bullets.forEach(function (b) { ul.appendChild(UI.el('div', null, '• ' + UI.esc(b))); });
        body.appendChild(ul);
      }
      (o.buttons || []).forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b.label;
        btn.className = b.cls || 'btn-solid';
        btn.style.cssText = 'width:100%;flex:none;margin-top:8px;padding:12px;border-radius:12px;' +
          'font:inherit;font-size:13px;font-weight:600;cursor:pointer;' +
          (b.cls === 'btn-ghost'
            ? 'border:1px solid var(--s2);background:transparent;color:var(--ink2)'
            : 'border:0;background:var(--ink);color:var(--paper)');
        btn.addEventListener('click', function () {
          if (status) status.textContent = '';
          var setStat = function (t) {
            if (!status) {
              status = UI.el('div');
              status.style.cssText = 'font-size:11.5px;color:var(--ash);text-align:center;margin-top:10px';
              body.appendChild(status);
            }
            status.textContent = t;
          };
          b.onClick(btn, setStat, b.finish);
        });
        body.appendChild(btn);
      });
    }, null);          /* saveFn null → modal ke apne Save/Cancel buttons nahi dikhenge */
    return m;
  }

  /* ---------- login ke baad ka faisla (sirf ek baar) ---------- */
  function firstRunFlow(s) {
    if (!s || !s.uid) return Promise.resolve(null);
    if (s.offline) return Promise.resolve({ action: 'offline' });
    if (!hasCloud()) return Promise.resolve({ action: 'no-cloud' });

    return fetchCloud(s).then(function (r) {
      if (!r.ok) return r;

      var cloudHas = r.items.length > 0;
      var localHas = hasLocal();
      var cloudAt = r.lastBackupAt ? agoText(r.lastBackupAt) : '—';

      /* 1) cloud khali + local khali → kuch nahi karna */
      if (!cloudHas && !localHas) return { action: 'none' };

      /* 2) cloud khali + local bhara → upload ka offer */
      if (!cloudHas && localHas) {
        return ask({
          title: 'Data cloud par bhejein?',
          text: 'Is phone mein pehle se data saved hai, lekin cloud par abhi koi backup nahi hai.',
          buttons: [
            { label: 'Haan, abhi backup karein', cls: 'btn-solid', onClick: function (btn, setStat, finish) {
                setStat('Backup ho raha hai...');
                btn.disabled = true;
                push(s).then(function (res) {
                  if (res.ok) { setStat('Backup ho gaya ✔'); doReload(); }
                  else { setStat(res.message || msg(res)); btn.disabled = false; finish(); }
                });
              } },
            { label: 'Abhi nahi', cls: 'btn-ghost', done: false, onClick: function (btn, setStat, finish) { finish({ action: 'skip' }); } }
          ],
          result: { action: 'offer-upload' }
        });
      }

      /* 3) cloud bhara + local khali → restore ka offer */
      if (cloudHas && !localHas) {
        return ask({
          title: 'Cloud backup mila',
          text: 'Aapke account mein pehle se data save hai. Use is phone par wapas laayein?',
          bullets: ['Last backup: ' + cloudAt, 'Cloud par ' + r.items.length + ' hisse saved hain'],
          buttons: [
            { label: 'Haan, data wapas laayein', cls: 'btn-solid', onClick: function (btn, setStat, finish) {
                setStat('Restore ho raha hai...');
                btn.disabled = true;
                pull(s).then(function (res) {
                  if (res.ok) setStat('Restore ho gaya ✔ App reload ho rahi hai...');
                  else { setStat(res.message || msg(res)); btn.disabled = false; finish(); }
                });
              } },
            { label: 'Nahi, khaali se shuru karein', cls: 'btn-ghost', done: false, onClick: function (btn, setStat, finish) { finish({ action: 'skip' }); } }
          ],
          result: { action: 'offer-restore' }
        });
      }

      /* 4) dono bhare → teen raaste */
      return ask({
        title: 'Data ka faisla aapka',
        text: 'Is phone par bhi data hai aur cloud par bhi. Kya karna hai?',
        bullets: ['Cloud backup: ' + cloudAt, 'Phone ka data: ' + localCountText()],
        buttons: [
          { label: 'Cloud wala data yahan laayein', cls: 'btn-solid', onClick: function (btn, setStat, finish) {
              setStat('Restore ho raha hai...');
              btn.disabled = true;
              pull(s).then(function (res) {
                if (res.ok) setStat('Restore ho gaya ✔ App reload ho rahi hai...');
                else { setStat(res.message || msg(res)); btn.disabled = false; finish(); }
              });
            } },
          { label: 'Phone wala data cloud par bhejein', cls: 'btn-ghost', onClick: function (btn, setStat, finish) {
              setStat('Backup ho raha hai...');
              btn.disabled = true;
              push(s).then(function (res) {
                if (res.ok) setStat('Ho gaya ✔ Ab data cloud par safe hai.');
                else { setStat(res.message || msg(res)); btn.disabled = false; finish(); }
              });
            } },
          { label: 'Kuch nahi, phone wala data hi rakhein', cls: 'btn-ghost', done: false, onClick: function (btn, setStat, finish) { finish({ action: 'skip' }); } }
        ],
        result: { action: 'offer-merge' }
      });
    });

    /* modal khola; button ka kaam pure hone par modal band + result resolve */
    function ask(o) {
      return new Promise(function (resolve) {
        var m = null;
        var settled = false;
        var finish = function (r) {
          if (m) m.close();
          if (!settled) { settled = true; resolve(r); }
        };
        var wrapped = (o.buttons || []).map(function (b) {
          return {
            label: b.label,
            cls: b.cls,
            finish: finish,
            done: b.done,
            onClick: function (btn, setStat) {
              /* button apna kaam kare; kaam pure hone par finish() */
              b.onClick(btn, setStat, finish);
            }
          };
        });
        m = choiceModal({ title: o.title, text: o.text, bullets: o.bullets, buttons: wrapped, z: o.z });
        /* modal khula hi hai — caller ko bata do (user abhi soch raha hai) */
        window.setTimeout(function () {
          if (!settled) { settled = true; resolve(o.result || { action: 'shown' }); }
        }, 100);
      });
    }
  }

  function localCountText() {
    var s = localSummary().filter(function (x) { return x.main && x.present; });
    if (!s.length) return 'khaali';
    return s.map(function (x) { return x.label; }).join(', ');
  }

  /* ---------- Settings panel ke buttons ---------- */
  function backupNow(setStat) {
    var s = sess();
    if (!s) { setStat('Pehle login karein.'); return; }
    setStat('Backup ho raha hai...');
    push(s).then(function (r) {
      if (r.ok) setStat('Backup ho gaya ✔ ' + fmtTime(r.at) + ' · ' + r.docs + ' hisse cloud par.');
      else setStat('Backup fail: ' + (r.message || msg(r)));
      try { window.AchivaSettings.refreshBackup(); } catch (e) { /* ignore */ }
    });
  }

  function restoreNow(setStat) {
    var s = sess();
    if (!s) { setStat('Pehle login karein.'); return; }
    choiceModal({
      title: 'Cloud se restore karein?',
      text: 'Is phone ka data cloud wale backup se BADAL jayega (jo bhi aakhri backup tha).',
      bullets: ['App restore ke baad apne aap reload ho jayegi.'],
      buttons: [
        { label: 'Haan, restore karein', cls: 'btn-solid', onClick: function (btn, st) {
            setStat('Restore ho raha hai...');
            btn.disabled = true;
            pull(s).then(function (r) {
              if (r.ok) setStat('Restore ho gaya ✔ App reload ho rahi hai...');
              else { setStat('Restore fail: ' + (r.message || msg(r))); st(''); btn.disabled = false; }
            });
          } },
        { label: 'Cancel', cls: 'btn-ghost', done: false, onClick: function (btn, setStat, finish) { finish({ action: 'cancel' }); } }
      ]
    });
  }

  window.AchivaBackup = {
    DOCS: DOCS,
    push: push,
    pull: pull,
    fetchCloud: fetchCloud,
    cloudSummary: cloudSummary,
    localSummary: localSummary,
    hasLocal: hasLocal,
    lastBackupAt: lastBackupAt,
    firstRunFlow: firstRunFlow,
    backupNow: backupNow,
    restoreNow: restoreNow,
    fmtTime: fmtTime,
    agoText: agoText,
    reload: reload,
    clearLastBackup: function () { lsDel('achiva.lastBackupAt'); }
  };
})();
