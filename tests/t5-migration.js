/* TEST 5 : one-time LS → IDB migration (copy + verify + flag, idempotent,
   auth-keys skip, adoptLegacy interaction, LS untouched until purge)
   Chalane ka tarika:  cd /home/user && NODE_PATH=/tmp/audit/node_modules node tests/t5-migration.js */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }

function mkWin(idb, lsSeed) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const W = dom.window;
  if (idb) W.indexedDB = idb;
  if (lsSeed) Object.keys(lsSeed).forEach(k => W.localStorage.setItem(k, lsSeed[k]));
  W.eval(fs.readFileSync('core/storage.js', 'utf8'));
  return dom;
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

/* realistic purana-user LS state (v2 app se) */
const SEED = {
  'achiva.ns.v1': 'u42',
  'u/u42/achiva.subjectTracker.v1': '{"subjects":[{"id":"s1","name":"Physics"}]}',
  'u/u42/achiva.goals.v1': '{"goals":[{"id":"g1","title":"100 ghante"}]}',
  'u/u42/achiva.lastBackupAt': '1712345678901',
  'achiva.canvas.v1': '{"canvases":[{"id":"c0"}]}',          /* legacy bare (adopt ke pehle) */
  'achiva.prefs.v1': '{"theme":"dark"}',
  'achiva.account.v1': '{"uid":"u42","email":"a@b.c"}',       /* auth private — skip hona chahiye */
  'achiva.offline.v1': '1',                                   /* auth private — skip hona chahiye */
  'some.other.app.key': 'irrelevant'                          /* non-achiva — skip */
};

async function main() {
  const idb = new IDBFactory();

  /* ---- A) pehli boot : migration copy + verify + flag ---- */
  {
    const dom = mkWin(idb, SEED);
    const W = dom.window, A = W.AppStorage;
    const res = await A.open();
    ok(res === true && A.engine() === 'idb', 'A1: migration ke saath IDB engine chalu');

    const dump = await idbDump(idb);
    ok(dump['u/u42/achiva.subjectTracker.v1'] === SEED['u/u42/achiva.subjectTracker.v1'], 'A2: subjects IDB mein copy hue (byte-exact)');
    ok(dump['u/u42/achiva.goals.v1'] === SEED['u/u42/achiva.goals.v1'], 'A3: goals copy hue');
    ok(dump['u/u42/achiva.lastBackupAt'] === '1712345678901', 'A4: lastBackupAt copy hua');
    ok(dump['achiva.canvas.v1'] === SEED['achiva.canvas.v1'], 'A5: bare legacy canvas copy hua');
    ok(dump['achiva.prefs.v1'] === SEED['achiva.prefs.v1'], 'A6: prefs copy hue');
    ok(dump['achiva.ns.v1'] === 'u42', 'A7: ns key copy hui');
    ok(!!dump['achiva.idb.migrated.v1'], 'A8: migration flag lag gaya');
    let flag = {}; try { flag = JSON.parse(dump['achiva.idb.migrated.v1']); } catch (e) {}
    ok(flag.v === 1 && flag.keys === 6, 'A9: flag mein key-count sahi (6) — actual: ' + flag.keys);
    ok(dump['achiva.account.v1'] === undefined, 'A10: auth account key SKIP hui');
    ok(dump['achiva.offline.v1'] === undefined, 'A11: auth offline key SKIP hui');
    ok(dump['some.other.app.key'] === undefined, 'A12: non-achiva key SKIP hui');

    /* LS purge abhi NAHI — rollback safety */
    ok(W.localStorage.getItem('u/u42/achiva.goals.v1') === SEED['u/u42/achiva.goals.v1'], 'A13: LS data abhi untouched (purge baad mein)');

    /* data AppStorage se readable */
    ok(A.rawGet('achiva.goals.v1') === SEED['u/u42/achiva.goals.v1'], 'A14: NS=u42 ke saath goals readable');
    const st = A.load();
    ok(st && st.subjects[0].name === 'Physics', 'A15: load() se subjects mile');
    dom.window.close();
  }

  /* ---- B) doosri boot : migration dobara NAHI (idempotent) ---- */
  {
    const dom = mkWin(idb, null);   /* LS khali — sirf IDB mein data */
    const W = dom.window, A = W.AppStorage;
    const res = await A.open();
    ok(res === true, 'B1: doosri boot IDB se');
    const dump = await idbDump(idb);
    let flag = {}; try { flag = JSON.parse(dump['achiva.idb.migrated.v1']); } catch (e) {}
    ok(flag.keys === 6, 'B2: flag purana hi hai (re-migrate nahi hua)');
    A.setNamespace('u42');
    ok(A.rawGet('achiva.goals.v1') === SEED['u/u42/achiva.goals.v1'], 'B3: data IDB se intact');

    /* is session mein update → agli boot par IDB wala fresh value mile */
    A.rawSet('achiva.goals.v1', '{"goals":[{"id":"g1","title":"200 ghante"}]}');
    await A.flush();
    dom.window.close();
  }
  {
    const dom = mkWin(idb, null);
    const A = dom.window.AppStorage;
    await A.open();
    A.setNamespace('u42');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"g1","title":"200 ghante"}]}', 'B4: teesri boot par updated value mili');
    dom.window.close();
  }

  /* ---- C) adoptLegacy migration ke saath : bare canvas → u42 namespace ---- */
  {
    const dom = mkWin(idb, null);
    const W = dom.window, A = W.AppStorage;
    await A.open();
    A.setNamespace('u42');
    A.adoptLegacy();
    ok(A.rawGet('achiva.canvas.v1') === '{"canvases":[{"id":"c0"}]}', 'C1: bare canvas u42 namespace mein adopt hua');
    await A.flush();
    const dump = await idbDump(idb);
    ok(dump['u/u42/achiva.canvas.v1'] === '{"canvases":[{"id":"c0"}]}', 'C2: adopted canvas IDB mein namespaced key par');
    ok(dump['achiva.canvas.v1'] === undefined, 'C3: bare key IDB se hat gayi');
    ok(W.localStorage.getItem('achiva.canvas.v1') === null, 'C4: bare key LS se hat gayi');
    ok(W.localStorage.getItem('u/u42/achiva.canvas.v1') === '{"canvases":[{"id":"c0"}]}', 'C5: LS mirror mein namespaced key');
    dom.window.close();
  }

  /* ---- D) fresh install : khali LS + khali IDB → flag fir bhi lagta hai ---- */
  {
    const idb3 = new IDBFactory();
    const dom = mkWin(idb3, null);
    const A = dom.window.AppStorage;
    const res = await A.open();
    ok(res === true, 'D1: fresh install par IDB engine');
    const dump = await idbDump(idb3);
    let flag = {}; try { flag = JSON.parse(dump['achiva.idb.migrated.v1']); } catch (e) {}
    ok(flag.v === 1 && flag.keys === 0, 'D2: fresh flag keys=0');
    ok(A.load() === null && A.rawGet('achiva.goals.v1') === null, 'D3: fresh install khali dikhta hai');
    dom.window.close();
  }

  console.log('\nRESULT 5: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
