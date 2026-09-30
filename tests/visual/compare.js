/* ================================================================
   VISUAL / COMPARE.JS — current vs baseline pixel comparison
   ----------------------------------------------------------------
   • har baseline PNG ko current se milata hai (pixelmatch)
   • ALLOW se zyada farq → exit 1 (CI fail)
   • diff images tests/visual/diff/ mein likhta hai (artifact ke liye)
   • baseline missing/current missing → fail (saaf message ke saath)

   ALLOW chhota rakha hai (20px) kyunki animations OFF hain aur runner
   hamesha wahi (GitHub Linux) hai — isliye AA-noise nahi ke barabar hai.
   Phone/tablet/wide sab par same rule : koi bhi anjane visual change
   ko push par hi pakad lo. Intentional change = [visual-update] commit.
   ================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const HERE = __dirname;
const B = path.join(HERE, 'baseline');
const C = path.join(HERE, 'current');
const D = path.join(HERE, 'diff');
const ALLOW = Number(process.env.VISUAL_ALLOW || 20);

if (!fs.existsSync(B)) {
  console.error('❌ baseline/ folder nahi mila.');
  console.error('   Pehli baar?  [visual-update] tag wala commit push karo,');
  console.error('   ya locally:  npm run visual:update');
  process.exit(1);
}
fs.mkdirSync(D, { recursive: true });

const bases = fs.readdirSync(B).filter(f => f.endsWith('.png'));
if (!bases.length) {
  console.error('❌ baseline/ khaali hai — [visual-update] se bootstrap karo.');
  process.exit(1);
}

let fail = false;
console.log('──────── visual compare (allow ≤ ' + ALLOW + 'px) ────────');

for (const f of bases) {
  const cf = path.join(C, f);
  if (!fs.existsSync(cf)) {
    console.log('❌ ' + f + '  → current screenshot missing');
    fail = true;
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(path.join(B, f)));
  const b = PNG.sync.read(fs.readFileSync(cf));
  if (a.width !== b.width || a.height !== b.height) {
    console.log('❌ ' + f + '  → size badla ' + a.width + 'x' + a.height +
      ' → ' + b.width + 'x' + b.height);
    fail = true;
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  fs.writeFileSync(path.join(D, f), PNG.sync.write(diff));
  const okN = n <= ALLOW;
  console.log((okN ? '✅ ' : '❌ ') + f.padEnd(20) + ' diff=' + n + 'px');
  if (!okN) fail = true;
}

/* current mein extra files hon (naya screen add hua?) → batao, fail mat karo */
if (fs.existsSync(C)) {
  const extra = fs.readdirSync(C).filter(f => f.endsWith('.png') && bases.indexOf(f) === -1);
  if (extra.length) console.log('ℹ️  naye (unbaselined) screenshots: ' + extra.join(', '));
}

console.log('──────────────────────────────────────────────');
if (fail) {
  console.error('❌ VISUAL REGRESSION — diff images: tests/visual/diff/');
  process.exit(1);
}
console.log('✅ koi visual regression nahi');
