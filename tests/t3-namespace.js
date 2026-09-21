/* TEST 3 : habits/exams — login namespace + adoptLegacy migration */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }

function mkWin() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  dom.window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  return dom;
}

/* ---- A) login se PEHLE bana data → login par namespace mein adopt ho ---- */
console.log('TEST 3A : adoptLegacy — habits + exams account namespace mein migrate');
{
  const dom = mkWin(); const W = dom.window;
  W.localStorage.setItem('achiva.goodHabits.v1', '{"habits":[{"id":"h1","name":"Old habit"}]}');
  W.localStorage.setItem('achiva.exams.v1', '{"exams":[{"id":"e1","name":"Old exam","dt":1}]}');
  W.eval(fs.readFileSync('core/storage.js', 'utf8'));
  W.AppStorage.setNamespace('u9');
  W.AppStorage.adoptLegacy();
  ok(W.localStorage.getItem('u/u9/achiva.goodHabits.v1') === '{"habits":[{"id":"h1","name":"Old habit"}]}',
    'purana habits data u/u9/ namespace mein MOVE hua');
  ok(W.localStorage.getItem('u/u9/achiva.exams.v1') === '{"exams":[{"id":"e1","name":"Old exam","dt":1}]}',
    'purana exams data u/u9/ namespace mein MOVE hua');
  ok(W.localStorage.getItem('achiva.goodHabits.v1') === null, 'unprefixed habits key hat gayi');
  ok(W.localStorage.getItem('achiva.exams.v1') === null, 'unprefixed exams key hat gayi');
  ok(W.AppStorage.loadAt('achiva.goodHabits.v1').habits[0].name === 'Old habit',
    'namespace ke baad loadAt se habits padhe ja sakte hain');
}

/* ---- B) logged-in user ka habits/exams data namespaced key par save ho ---- */
console.log('TEST 3B : logged-in save → namespaced physical key');
{
  const dom = mkWin(); const W = dom.window;
  W.localStorage.setItem('achiva.ns.v1', 'u42');       /* pehle se logged in (page load par NS read) */
  W.eval(fs.readFileSync('core/storage.js', 'utf8'));
  W.AppStorage.saveAt('achiva.goodHabits.v1', { habits: [{ id: 'x' }] });
  W.AppStorage.saveAt('achiva.exams.v1', { exams: [{ id: 'y' }] });
  ok(W.localStorage.getItem('u/u42/achiva.goodHabits.v1') !== null, 'habits u/u42/ par save hue');
  ok(W.localStorage.getItem('u/u42/achiva.exams.v1') !== null, 'exams u/u42/ par save hue');
  ok(W.localStorage.getItem('achiva.goodHabits.v1') === null, 'doosre account ka data leak nahi hua (bare key khali)');
}

console.log('\nRESULT 3: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
