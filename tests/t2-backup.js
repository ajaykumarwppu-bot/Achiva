/* TEST 2 : backup push/pull — saare 9 keys incl. goodHabits + exams round trip */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
const W = dom.window;
W.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
function load(rel) { W.eval(fs.readFileSync(rel, 'utf8')); }

/* ---- mock cloud ---- */
const saved = {};
W.AchivaCloud = {
  ready: () => true,
  message: e => String(e && e.message || e),
  saveDoc: (p, d) => { saved[p] = JSON.parse(JSON.stringify(d)); return Promise.resolve({ ok: true }); },
  readDoc: (p) => Promise.resolve(p === 'users/u1'
    ? { ok: true, data: { app: 'achiva', uid: 'u1', lastBackupAt: 1234 } }
    : { ok: false, code: 'not-found' }),
  readDocs: (p) => Promise.resolve({
    ok: true,
    docs: Object.keys(saved).filter(k => k.indexOf('users/u1/data/') === 0)
      .map(k => ({ id: k.split('/').pop(), data: saved[k] }))
  })
};
W.AchivaAuth = { session: () => ({ uid: 'u1', email: 'a@b.c' }) };
W.AchivaSettings = { readPrefs: () => ({ theme: 'dark' }), applyThemeFromStorage: () => {} };

load('core/storage.js');
load('backend/backup.js');

/* ---- seed : app ka poora data (9 keys) ---- */
const seeds = {
  'achiva.subjectTracker.v1': { subjects: [{ id: 's1', name: 'Physics', chapters: [{ id: 'c1', name: 'Kinematics' }] }] },
  'achiva.canvas.v1': { boards: [{ id: 'b1', name: 'Bio map' }] },
  'achiva.timer.study.v1': [{ ms: 3600000, subjectId: 's1', start: 1, end: 2 }],
  'achiva.timer.manual.v1': [{ ms: 1800000, day: '2026-09-18' }],
  'achiva.canvas.savedColors': ['#2ea043'],
  'achiva.goals.v1': { goals: [{ id: 'g1', name: 'Daily 3 tasks', tasks: [] }] },
  'achiva.goodHabits.v1': { habits: [{ id: 'h1', name: 'Drink water', repsPerDay: 8, startDate: '2026-09-01', strict: 3, logs: { '2026-09-18': { done: 8, times: [1, 2] } } }] },
  'achiva.exams.v1': { exams: [{ id: 'e1', name: 'JEE Mains', dt: 1790000000000 }, { id: 'e2', name: 'NEET', dt: 1795000000000 }] }
};
Object.keys(seeds).forEach(k => W.AppStorage.saveAt(k, seeds[k]));

/* DOCS list check */
const docs = W.AchivaBackup.DOCS;
ok(docs.length === 9, 'DOCS mein 9 entries hain (got ' + docs.length + ')');
ok(docs.some(d => d.docId === 'goodHabits' && d.key === 'achiva.goodHabits.v1' && d.main), 'goodHabits doc registered (main=true)');
ok(docs.some(d => d.docId === 'exams' && d.key === 'achiva.exams.v1' && d.main), 'exams doc registered (main=true)');
const sum = W.AchivaBackup.localSummary();
ok(sum.some(s => s.docId === 'goodHabits' && s.present), 'localSummary: Good habits present');
ok(sum.some(s => s.docId === 'exams' && s.present), 'localSummary: Exams present');

/* ---- PUSH (backup) ---- */
W.AchivaBackup.push().then(res => {
  ok(res.ok === true, 'push() ok=true (docs=' + res.docs + ')');
  ok(!!saved['users/u1/data/goodHabits'], 'cloud par goodHabits doc gaya');
  ok(!!saved['users/u1/data/exams'], 'cloud par exams doc gaya');
  ok(saved['users/u1/data/goodHabits'] && saved['users/u1/data/goodHabits'].value === JSON.stringify(seeds['achiva.goodHabits.v1']), 'goodHabits value byte-exact');
  ok(saved['users/u1/data/exams'] && saved['users/u1/data/exams'].value === JSON.stringify(seeds['achiva.exams.v1']), 'exams value byte-exact');
  const dataDocs = Object.keys(saved).filter(k => k.indexOf('/data/') >= 0);
  ok(dataDocs.length === 9, 'total 9 data docs cloud par gaye (got ' + dataDocs.length + ')');
  ok(!!saved['users/u1'], 'profile doc bhi gaya');

  /* ---- WIPE local (naya phone simulate) ---- */
  Object.keys(seeds).forEach(k => W.AppStorage.rawDel(k));
  W.AppStorage.rawDel('achiva.prefs.v1');
  ok(W.AppStorage.rawGet('achiva.goodHabits.v1') === null, 'wipe: habits local se gaye');
  ok(W.AppStorage.rawGet('achiva.exams.v1') === null, 'wipe: exams local se gaye');

  /* ---- PULL (restore) ---- */
  return W.AchivaBackup.pull(null, { reload: false });
}).then(r => {
  ok(r.ok === true, 'pull() ok=true (count=' + r.count + ')');
  ok(r.count === 9, 'restore par 9 keys likhi gayin (got ' + r.count + ')');
  let allExact = true;
  Object.keys(seeds).forEach(k => {
    const raw = W.AppStorage.rawGet(k);
    if (raw !== JSON.stringify(seeds[k])) { allExact = false; console.log('    mismatch: ' + k); }
  });
  ok(allExact, 'saare 8 data keys byte-exact restore hue');
  const hab = JSON.parse(W.AppStorage.rawGet('achiva.goodHabits.v1'));
  ok(hab.habits[0].name === 'Drink water' && hab.habits[0].logs['2026-09-18'].done === 8, 'habit + logs (reps) wapas aaye');
  const ex = JSON.parse(W.AppStorage.rawGet('achiva.exams.v1'));
  ok(ex.exams.length === 2 && ex.exams[0].name === 'JEE Mains', 'dono exams wapas aaye');
  ok(W.AppStorage.rawGet('achiva.prefs.v1') !== null, 'prefs (theme) bhi restore hua');
  ok(W.localStorage.getItem('achiva.lastBackupAt') === '1234', 'lastBackupAt restore ke baad set hua');

  console.log('\nRESULT 2: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}).catch(e => { console.log('ERROR: ' + e.stack); process.exit(1); });
