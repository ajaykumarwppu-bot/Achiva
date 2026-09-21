/* TEST 1 : good-detail kebab → Edit/Delete popover (direct edit NAHI) */
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
function load(dom, rel) { dom.window.eval(fs.readFileSync(rel, 'utf8')); }

function setup() {
  const dom = mkWin(); const W = dom.window;
  W.SubjectListBridge = { show: function (el, top) { W.__shown = (W.__shown || []); W.__shown.push(el); } };
  load(dom, 'core/storage.js');
  load(dom, 'core/ui.js');
  load(dom, 'features/habit/GoodSystem.js');
  load(dom, 'features/habit/good-list.js');
  load(dom, 'features/habit/good-detail.js');
  return { dom, W, doc: W.document };
}
function click(W, el) { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true })); }
function findPop(doc) { return doc.querySelector('.pop[data-open]'); }
function popBtns(pop) { return Array.prototype.slice.call(pop.querySelectorAll('button')); }

/* ---- A) kebab click → popover khule, edit modal NA khule ---- */
console.log('TEST 1A : kebab → Edit/Delete popover');
{
  const { dom, W, doc } = setup();
  const h = W.GoodList.addHabit({ name: 'Drink water', repsPerDay: 8, startDate: W.UI.todayISO() });
  W.GoodDetail.open(h.id);
  const keb = doc.querySelector('button[aria-label="Edit or delete"]');
  ok(!!keb, 'kebab button aria-label "Edit or delete" milta hai');
  click(W, keb);
  const pop = findPop(doc);
  ok(!!pop, 'kebab click par popover OPEN hota hai');
  if (pop) {
    const labels = popBtns(pop).map(b => b.textContent.trim());
    ok(labels.indexOf('Edit') >= 0 && labels.indexOf('Delete') >= 0, 'popover mein Edit + Delete dono hain (' + labels.join(' / ') + ')');
  }
  ok(!doc.querySelector('.sheet'), 'kebab click par edit modal DIRECTLY nahi khula (koi .sheet nahi)');
}

/* ---- B) Edit click → edit modal khulta hai ---- */
console.log('TEST 1B : popover → Edit click → edit modal');
{
  const { dom, W, doc } = setup();
  const h = W.GoodList.addHabit({ name: 'Read 10 pages', repsPerDay: 1, startDate: W.UI.todayISO() });
  W.GoodDetail.open(h.id);
  click(W, doc.querySelector('button[aria-label="Edit or delete"]'));
  const pop = findPop(doc);
  const editBtn = popBtns(pop).filter(b => b.textContent.trim() === 'Edit')[0];
  click(W, editBtn);
  const sheet = doc.querySelector('.sheet');
  ok(!!sheet, 'Edit click par modal sheet khulti hai');
  if (sheet) {
    const title = sheet.querySelector('h3');
    ok(title && title.textContent === 'Edit habit', 'modal title "Edit habit" hai (got: ' + (title && title.textContent) + ')');
    const nameInput = sheet.querySelector('input');
    ok(nameInput && nameInput.value === 'Read 10 pages', 'modal mein habit ka data prefill hai');
  }
  /* Cancel → habit safe */
  const cancel = Array.prototype.slice.call(doc.querySelectorAll('.sheet .btn-ghost')).filter(b => b.textContent === 'Cancel')[0];
  if (cancel) click(W, cancel);
  ok(W.GoodList.all().length === 1, 'Cancel ke baad habit delete nahi hui');
  ok(!findPop(doc), 'Edit click ke baad popover band ho gaya');
}

/* ---- C) Delete → pehli click "Confirm Delete", doosri click → delete ---- */
console.log('TEST 1C : popover → Delete (do-click confirm) → habit delete');
{
  const { dom, W, doc } = setup();
  const h1 = W.GoodList.addHabit({ name: 'Wake up 6am', repsPerDay: 1, startDate: W.UI.todayISO() });
  const h2 = W.GoodList.addHabit({ name: 'No sugar', repsPerDay: 1, startDate: W.UI.todayISO() });
  W.GoodDetail.open(h1.id);
  click(W, doc.querySelector('button[aria-label="Edit or delete"]'));
  const pop = findPop(doc);
  const delBtn = popBtns(pop).filter(b => b.className.indexOf('danger') >= 0)[0];
  ok(!!delBtn, 'Delete (danger) button milta hai');
  click(W, delBtn);
  ok(delBtn.querySelector('span').textContent === 'Confirm Delete', 'pehli Delete click → "Confirm Delete" (confirm step)');
  ok(W.GoodList.get(h1.id) !== null, 'confirm se pehle habit ABHI delete nahi hui');
  click(W, delBtn);
  ok(W.GoodList.get(h1.id) === null, 'Confirm Delete click → habit delete ho gayi');
  ok(W.GoodList.all().length === 1 && W.GoodList.all()[0].id === h2.id, 'sirf target habit delete hui, doosri safe');
  const raw = JSON.parse(W.localStorage.getItem('achiva.goodHabits.v1'));
  ok(raw.habits.length === 1, 'localStorage mein bhi delete persist hua (1 habit bachi)');
  ok(!findPop(doc), 'delete ke baad popover band');
  const shown = W.__shown || [];
  ok(shown.length > 0, 'delete ke baad openList() call hui (bridge.show)');
}

console.log('\nRESULT 1: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
