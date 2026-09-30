/* ================================================================
   VISUAL / CAPTURE.JS — app ke screenshots (baseline ya current)
   ----------------------------------------------------------------
   • App ko ek chhote static server par kholta hai (localhost)
   • External requests (Firebase CDN etc.) BLOCK — deterministic + tez
   • Animations OFF (reducedMotion:'reduce' — foundation.css respect karti hai)
   • 3 widths × 2 themes = 6 screenshots :
        phone  390x844   |  tablet 768x1024  |  wide 1440x900
        light + dark
   • VISUAL_UPDATE=1  →  baseline/ mein likho (intentional design change)
     warna              →  current/ mein likho (compare ke liye)

   Data seed JAAN-BOOJH kar nahi karte : empty-state UI sabse stable
   baseline hota hai, aur hamara asli maqsad "global CSS/leak detection"
   hai jo empty state mein bhi poori tarah dikhta hai.
   ================================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.VISUAL_UPDATE === '1'
  ? path.join(__dirname, 'baseline')
  : path.join(__dirname, 'current');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function serve() {
  return new Promise(function (resolve) {
    const s = http.createServer(function (req, res) {
      let u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(ROOT, u);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(fs.readFileSync(f));
    });
    s.listen(0, '127.0.0.1', function () { resolve(s); });
  });
}

const VIEWS = [
  ['phone', 390, 844],
  ['tablet', 768, 1024],
  ['wide', 1440, 900]
];
const THEMES = ['light', 'dark'];

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const url = 'http://127.0.0.1:' + port + '/';
  console.log('serving', ROOT, 'on', url);

  const browser = await chromium.launch();
  try {
    for (const [name, w, h] of VIEWS) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: h },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce'
        });
        /* sirf localhost allow — baaki sab abort (CDN/firebase/flakiness out) */
        await ctx.route('**/*', function (route) {
          const u = route.request().url();
          if (u.indexOf('http://127.0.0.1') === 0) return route.continue();
          return route.abort();
        });
        /* theme seed (settings.js prefs ko localStorage se padhta hai) */
        await ctx.addInitScript(function (t) {
          try { localStorage.setItem('achiva.prefs.v1', JSON.stringify({ theme: t })); } catch (e) {}
        }, theme);

        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        /* app ke async boot (storage open + loader) ke liye wait */
        await page.waitForTimeout(3000);
        const file = path.join(OUT, name + '-' + theme + '.png');
        await page.screenshot({ path: file });
        console.log('  📸', path.relative(ROOT, file));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('capture complete →', path.relative(ROOT, OUT));
})().catch(function (e) {
  console.error('CAPTURE FAILED:', e && e.message);
  process.exit(1);
});
