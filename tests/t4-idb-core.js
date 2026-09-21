/* TEST 4 : naya IDB storage engine — core behaviour
   (sync API same, write-behind IDB, LS dual-write, fallback, namespace)
   Chalane ka tarika:  cd /home/user && NODE_PATH=/tmp/audit/node_modules node tests/t4-idb-core.js */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }

function mkWin(idb) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  if (idb) dom.window.indexedDB = idb;
  dom.window.eval(fs.readFileSync('core/storage.js', 'utf8'));
  return dom;
}

/* IDB se directly (AppStorage bypass) saara kv data padho */
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

async function main() {
  /* ---- A) koi indexedDB nahi → LS fallback, purana behaviour ---- */
  {
    const dom = mkWin(null);
    const W = dom.window, A = W.AppStorage;
    const res = await A.open();
    ok(res === false, 'A1: bina IDB open() false resolve hua');
    ok(A.engine() === 'ls', 'A2: engine ls fallback');
    ok(A.rawSet('achiva.goals.v1', '{"goals":[]}') === true, 'A3: rawSet true (LS mode)');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[]}', 'A4: rawGet roundtrip');
    ok(W.localStorage.getItem('achiva.goals.v1') === '{"goals":[]}', 'A5: LS mein likha gaya');
    A.setNamespace('u1');
    A.rawSet('achiva.exams.v1', '{"exams":[1]}');
    ok(W.localStorage.getItem('u/u1/achiva.exams.v1') === '{"exams":[1]}', 'A6: namespace LS mode mein bhi sahi');
    await A.flush();
    ok(true, 'A7: flush LS mode mein bhi resolve hota hai');
    dom.window.close();
  }

  /* ---- B) IDB engine : fresh start, write-behind + dual-write ---- */
  const idb = new IDBFactory();
  {
    const dom = mkWin(idb);
    const W = dom.window, A = W.AppStorage;
    const res = await A.open();
    ok(res === true, 'B1: IDB open() true resolve hua');
    ok(A.engine() === 'idb', 'B2: engine idb');
    A.setNamespace('u9');
    ok(A.rawSet('achiva.goals.v1', '{"goals":[{"id":"g1"}]}') === true, 'B3: rawSet true (IDB mode)');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"g1"}]}', 'B4: sync rawGet cache se turant');
    ok(W.localStorage.getItem('u/u9/achiva.goals.v1') === '{"goals":[{"id":"g1"}]}', 'B5: LS dual-write hua');
    await A.flush();
    const dump = await idbDump(idb);
    ok(dump['u/u9/achiva.goals.v1'] === '{"goals":[{"id":"g1"}]}', 'B6: flush ke baad IDB mein value physical key par');
    ok(dump['achiva.ns.v1'] === 'u9', 'B7: ns key IDB mein mirror hui');

    /* save/load + saveAt/loadAt purane semantics */
    A.save({ subjects: [{ id: 's1', name: 'Maths' }] });
    const st = A.load();
    ok(st && st.subjects[0].name === 'Maths', 'B8: save/load roundtrip');
    A.saveAt('achiva.canvas.savedColors', ['#fff', '#000']);
    const cols = A.loadAt('achiva.canvas.savedColors');
    ok(Array.isArray(cols) && cols[1] === '#000', 'B9: saveAt/loadAt roundtrip');
    ok(A.loadAt('jo.key.nahi.hai') === null, 'B10: missing key → null');
    A.rawSet('bad', '{oops');
    ok(A.loadAt('bad') === null, 'B11: corrupt JSON → null (crash nahi)');

    /* rawDel teeno jagah se hataye */
    A.rawDel('achiva.canvas.savedColors');
    ok(A.rawGet('achiva.canvas.savedColors') === null, 'B12: rawDel cache se hataya');
    ok(W.localStorage.getItem('u/u9/achiva.canvas.savedColors') === null, 'B13: rawDel LS mirror se hataya');
    await A.flush();
    const dump2 = await idbDump(idb);
    ok(dump2['u/u9/achiva.canvas.savedColors'] === undefined, 'B14: rawDel IDB se hataya');

    /* prefs device-level : namespace ke bina */
    A.rawSet(A.PREFS_KEY, '{"theme":"dark"}');
    ok(W.localStorage.getItem('achiva.prefs.v1') === '{"theme":"dark"}', 'B15: prefs bare key par (namespace nahi)');
    await A.flush();
    const dump3 = await idbDump(idb);
    ok(dump3['achiva.prefs.v1'] === '{"theme":"dark"}', 'B16: prefs IDB mein bare key par');

    /* namespace switch → isolation */
    A.setNamespace('u10');
    ok(A.rawGet('achiva.goals.v1') === null, 'B17: doosra namespace khali dikhta hai');
    A.setNamespace('u9');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"g1"}]}', 'B18: wapas u9 → data mil gaya');
    dom.window.close();
  }

  /* ---- C) "restart" : same IDB, naya window, LS bilkul khali ---- */
  {
    const dom = mkWin(idb);
    const W = dom.window, A = W.AppStorage;
    ok(A.rawGet('achiva.goals.v1') === null, 'C1: open() se pehle (khali LS) cache khali');
    const res = await A.open();
    ok(res === true && A.engine() === 'idb', 'C2: restart par IDB engine');
    A.setNamespace('u9');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"g1"}]}', 'C3: IDB se data wapas mila');
    ok(A.rawGet(A.PREFS_KEY) === '{"theme":"dark"}', 'C4: prefs IDB se wapas mile');
    dom.window.close();
  }

  /* ---- D) pre-open writes (dirty) open() ke baad IDB pahunchte hain ---- */
  {
    const idb2 = new IDBFactory();
    const dom = mkWin(idb2);
    const W = dom.window, A = W.AppStorage;
    A.rawSet('achiva.exams.v1', '{"exams":[{"id":"e1"}]}');   /* open() se PEHLE */
    const res = await A.open();
    ok(res === true, 'D1: pre-open write ke baad open() true');
    ok(A.rawGet('achiva.exams.v1') === '{"exams":[{"id":"e1"}]}', 'D2: value cache mein barkarar');
    await A.flush();
    const dump = await idbDump(idb2);
    ok(dump['achiva.exams.v1'] === '{"exams":[{"id":"e1"}]}', 'D3: pre-open write IDB mein pahuncha');
    dom.window.close();
  }

  /* ---- E) IDB open error → LS fallback (data safe) ---- */
  {
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
      { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
    const W = dom.window;
    /* nakli indexedDB jo open par onerror fire kare */
    W.indexedDB = {
      open: function () {
        const req = { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null, result: null, error: new Error('boom') };
        setTimeout(function () { if (req.onerror) req.onerror({ target: req }); }, 5);
        return req;
      }
    };
    W.eval(fs.readFileSync('core/storage.js', 'utf8'));
    const A = W.AppStorage;
    const res = await A.open();
    ok(res === false, 'E1: IDB error par open() false');
    ok(A.engine() === 'ls', 'E2: engine ls fallback');
    A.rawSet('achiva.goals.v1', '{"goals":[{"id":"new"}]}');
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"new"}]}', 'E3: fallback mein data safe');
    dom.window.close();
  }

  /* ---- F) IDB value jeetti hai jab LS mirror stale ho ---- */
  {
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
      { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
    const W = dom.window;
    W.indexedDB = idb;
    W.localStorage.setItem('achiva.ns.v1', 'u9');
    W.localStorage.setItem('u/u9/achiva.goals.v1', '{"goals":"STALE-LS"}');
    W.eval(fs.readFileSync('core/storage.js', 'utf8'));
    const A = W.AppStorage;
    ok(A.rawGet('achiva.goals.v1') === '{"goals":"STALE-LS"}', 'F1: open() se pehle LS seed dikhta hai');
    await A.open();
    ok(A.rawGet('achiva.goals.v1') === '{"goals":[{"id":"g1"}]}', 'F2: open() ke baad IDB value jeeti');
    dom.window.close();
  }

  console.log('\nRESULT 4: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
