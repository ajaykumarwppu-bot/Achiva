/* TEST 6 : FULL PAGE — asli index.html jsdom mein load karke end-to-end check.
   Do scenarios:
     S1: already-migrated device — data SIRF IndexedDB mein (LS mein sirf meta
         + prefs mirror) → loader → features parse-time IDB se state padhein.
     S2: v2 upgrader — data SIRF localStorage mein, IDB khali → pehli boot par
         verified migration ho, features ka data sahi rahe, LS untouched rahe.
   Chalane ka tarika: cd /home/user && NODE_PATH=/tmp/audit/node_modules node tests/t6-fullpage.js */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- local file server + firebase CDN stub (jsdom v29 interceptor API) ---- */
const localInterceptor = requestInterceptor((request) => {
  const url = request.url;
  if (url.indexOf('https://www.gstatic.com/') === 0) {
    return new Response('/* firebase CDN stub (khaali) — auth graceful band rahega */',
      { headers: { 'Content-Type': 'application/javascript' } });
  }
  if (url.indexOf('http://localhost/') === 0) {
    const p = decodeURIComponent(new URL(url).pathname);
    try {
      const buf = fs.readFileSync(ROOT + p);
      const ct = /\.js$/.test(p) ? 'application/javascript'
        : /\.css$/.test(p) ? 'text/css' : 'text/plain';
      return new Response(buf, { headers: { 'Content-Type': ct } });
    } catch (e) {
      return new Response('/* missing: ' + p + ' */', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
  }
  return new Response('', { status: 404 });
});

/* IDB mein directly likhna (pre-populate ke liye) */
function idbSeed(idb, entries) {
  return new Promise((resolve, reject) => {
    const req = idb.open('achiva', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      const os = tx.objectStore('kv');
      Object.keys(entries).forEach(k => os.put(entries[k], k));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}
function idbDump(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open('achiva', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readonly');
      const os = tx.objectStore('kv');
      const kr = os.getAllKeys(), vr = os.getAll();
      tx.oncomplete = () => {
        const out = {};
        (kr.result || []).forEach((k, i) => { out[k] = (vr.result || [])[i]; });
        db.close();
        resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function bootPage(idb, lsSeed, tag) {
  return new Promise((resolve) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { errors.push(e); });
    vc.on('error', () => {});           /* console.error noise ignore */
    vc.on('warn', () => {});

    const dom = new JSDOM(HTML, {
      url: 'http://localhost/index.html',
      runScripts: 'dangerously',
      resources: { interceptors: [localInterceptor] },
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(win) {
        if (idb) win.indexedDB = idb;
        Object.keys(lsSeed || {}).forEach(k => win.localStorage.setItem(k, lsSeed[k]));
      }
    });

    const W = dom.window;
    const t0 = Date.now();
    (function poll() {
      const ready = W.AchivaFab && W.AchivaAuth && W.ST && W.GoodList && W.UI;
      if (ready) {
        /* boot.js (manifest ki aakhri file) chal chuka — thoda settle */
        setTimeout(() => resolve({ dom, W, errors, ms: Date.now() - t0 }), 250);
      } else if (Date.now() - t0 > 25000) {
        resolve({ dom, W, errors, ms: -1, timeout: true });
      } else {
        setTimeout(poll, 50);
      }
    })();
  });
}

function realScriptErrors(errors) {
  return errors.filter(e => {
    const s = String(e && e.stack || '') + String(e && e.message || '');
    return /features\/|core\/|backend\//.test(s);
  });
}

const SUBJECTS = '{"subjects":[{"id":"s1","name":"Physics","chapters":[{"id":"c1","name":"Motion","done":true},{"id":"c2","name":"Work","done":false}]}],"tests":[],"errors":[]}';
const HABITS = '{"habits":[{"id":"h1","name":"Subah 6 baje uthna","reps":{}}]}';
const GOALS = '{"goals":[{"id":"g1","title":"100 ghante padhai","cat":"Personal"}]}';
const EXAMS = '{"exams":[{"id":"e1","name":"JEE Mock","dt":1799999999999}]}';

async function main() {
  /* ================= S1 : migrated device — data sirf IDB mein ================= */
  console.log('--- S1: already-migrated device (data only in IDB) ---');
  {
    const idb = new IDBFactory();
    await idbSeed(idb, {
      'achiva.idb.migrated.v1': JSON.stringify({ v: 1, at: 1, keys: 6 }),
      'achiva.ns.v1': 'u42',
      'u/u42/achiva.subjectTracker.v1': SUBJECTS,
      'u/u42/achiva.goodHabits.v1': HABITS,
      'u/u42/achiva.goals.v1': GOALS,
      'u/u42/achiva.exams.v1': EXAMS,
      'achiva.prefs.v1': '{"theme":"dark"}'
    });
    /* LS mein sirf meta + prefs mirror (v3 dual-write jaisa realistic state) */
    const { dom, W, errors, ms, timeout } = await bootPage(idb, {
      'achiva.ns.v1': 'u42',
      'achiva.prefs.v1': '{"theme":"dark"}'
    }, 'S1');

    ok(!timeout, 'S1.1: page ' + ms + 'ms mein boot hua (timeout nahi)');
    const rerr = realScriptErrors(errors);
    ok(rerr.length === 0, 'S1.2: kisi app script mein uncaught error nahi' + (rerr.length ? ' → ' + rerr[0].message : ''));
    ok(W.AppStorage && W.AppStorage.engine() === 'idb', 'S1.3: engine idb');
    ok(W.ST && W.ST.state && W.ST.state.subjects.length === 1 && W.ST.state.subjects[0].name === 'Physics',
      'S1.4: subject-store ne parse-time IDB se subjects padhe');
    ok(W.GoodList && W.GoodList.all().length === 1 && W.GoodList.all()[0].name === 'Subah 6 baje uthna',
      'S1.5: good-list ne parse-time IDB se habits padhe');
    ok(W.GoalList && typeof W.GoalList.open === 'function', 'S1.6: goal-list load hua');
    ok(W.AchivaBackup && W.AchivaBackup.DOCS.length === 9, 'S1.7: backup.js load hua (9 DOCS)');
    ok(W.AchivaAuth && W.AchivaAuth.gateVisible() === true, 'S1.8: auth gate visible (firebase stub → login band mode)');
    const gateTxt = (W.document.getElementById('authGate') || {}).textContent || '';
    ok(/APP KHALEIN|Login abhi band/i.test(gateTxt), 'S1.9: gate par graceful message (crash nahi)');
    ok(W.document.documentElement.getAttribute('data-theme') === 'dark', 'S1.10: dark theme LS prefs mirror se lag gaya');
    const chip = W.document.getElementById('dateChip');
    ok(chip && /·/.test(chip.textContent || ''), 'S1.11: date chip bhara (' + (chip && chip.textContent) + ')');
    ok(W.AchivaFab && typeof W.AchivaFab.setVisible === 'function', 'S1.12: FAB (app-shell.js) wiring hui');
    /* IDB data intact */
    const dump = await idbDump(idb);
    ok(dump['u/u42/achiva.subjectTracker.v1'] === SUBJECTS, 'S1.13: IDB subjects byte-intact');
    dom.window.close();
  }

  /* ================= S2 : v2 upgrader — data sirf LS mein ================= */
  console.log('--- S2: v2 upgrader (data only in localStorage) ---');
  {
    const idb = new IDBFactory();   /* bilkul khali IDB */
    const ls = {
      'achiva.ns.v1': 'u42',
      'u/u42/achiva.subjectTracker.v1': SUBJECTS,
      'u/u42/achiva.goodHabits.v1': HABITS,
      'u/u42/achiva.goals.v1': GOALS,
      'u/u42/achiva.exams.v1': EXAMS,
      'u/u42/achiva.lastBackupAt': '1712345678901',
      'achiva.prefs.v1': '{"theme":"dark"}',
      'achiva.account.v1': '{"uid":"u42","email":"a@b.c","at":1}'
    };
    const { dom, W, errors, ms, timeout } = await bootPage(idb, ls, 'S2');

    ok(!timeout, 'S2.1: page ' + ms + 'ms mein boot hua');
    const rerr = realScriptErrors(errors);
    ok(rerr.length === 0, 'S2.2: kisi app script mein uncaught error nahi' + (rerr.length ? ' → ' + rerr[0].message : ''));
    ok(W.AppStorage.engine() === 'idb', 'S2.3: engine idb (migration ke baad)');
    ok(W.ST.state.subjects[0].name === 'Physics', 'S2.4: subjects sahi padhe gaye');
    ok(W.GoodList.all().length === 1, 'S2.5: habits sahi padhe gaye');

    const dump = await idbDump(idb);
    ok(!!dump['achiva.idb.migrated.v1'], 'S2.6: migration flag IDB mein laga');
    ok(dump['u/u42/achiva.subjectTracker.v1'] === SUBJECTS, 'S2.7: subjects IDB mein byte-exact copy');
    ok(dump['u/u42/achiva.goals.v1'] === GOALS, 'S2.8: goals copy hue');
    ok(dump['u/u42/achiva.exams.v1'] === EXAMS, 'S2.9: exams copy hue');
    ok(dump['u/u42/achiva.lastBackupAt'] === '1712345678901', 'S2.10: lastBackupAt copy hua');
    ok(dump['achiva.prefs.v1'] === '{"theme":"dark"}', 'S2.11: prefs copy hue');
    ok(dump['achiva.account.v1'] === undefined, 'S2.12: auth account key IDB mein NAHI gayi (skip)');

    /* LS purge abhi nahi — rollback safety */
    ok(W.localStorage.getItem('u/u42/achiva.subjectTracker.v1') === SUBJECTS, 'S2.13: LS data untouched (purge Phase 5 mein)');

    /* runtime write → IDB + LS dono mein jaye */
    W.GoodList.addHabit && W.GoodList.addHabit({ name: 'Roz revision' });
    if (W.AppStorage.flush) await W.AppStorage.flush();
    const dump2 = await idbDump(idb);
    let h = null; try { h = JSON.parse(dump2['u/u42/achiva.goodHabits.v1']); } catch (e) {}
    ok(h && h.habits.length === 2, 'S2.14: runtime addHabit IDB mein persist hua');
    let h2 = null; try { h2 = JSON.parse(W.localStorage.getItem('u/u42/achiva.goodHabits.v1')); } catch (e) {}
    ok(h2 && h2.habits.length === 2, 'S2.15: LS dual-write bhi hua');
    dom.window.close();
  }

  console.log('\nRESULT 6: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
