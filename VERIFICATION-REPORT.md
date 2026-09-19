# achiva — Verification Report (9/19/2026)

## A. Completeness (kuch chhoota to nahi?)

| Check | Result |
|---|---|
| Files vs PDF spec | **41/41 core files + 19/19 folders** ✔ |
| index.html local src/href (27) | **sab resolve, 0 missing** ✔ |
| JS syntax (`node --check`, 23 web files) | sab pass ✔ |
| XML well-formed (6 android xml) | sab pass ✔ |
| Kotlin package vs directory (4 .kt) | match ✔ |
| Cross-file API calls (AchivaAuth/Cloud/Settings/Backup/Fab) | **sab resolve** ✔ (AchivaFab index.html inline script mein define hai, call guarded) |
| Extras | firestore.rules, firebase-config.template.js, .gitignore, FIREBASE_SETUP.md ✔ |
| Not yet received | `.github/workflows/Build APK.yml`, `.github/workflows/Deploy a Web.yml` |

## B. Runtime tests

1. **jsdom (headless DOM), full load incl. Firebase CDN:** sab modules ban-te hain
   (UI, AchivaSettings, AchivaAuth, AchivaCloud, firebase). Gear SVG button mein inject hota hai
   (wireHeader chalta hai). `open()` bina exception ke chalta hai; click par panel
   `translateY(0)` = open. ✔
2. **Real headless Chrome (puppeteer, 412×915 mobile viewport):**
   - `elementFromPoint` gear center par → **top element = BUTTON#settingsBtn** (koi overlay nahi)
   - gate hidden (post-login simulate) ke baad **asli mouse click se panel KHULTA hai**
     (`isOpen: true`, transform `translateY(0px)`)
   - **0 console errors / 0 page errors**
   ✔

## C. Settings button bug — ROOT CAUSE (confirmed 9/19/2026)

User screenshot (DevTools, live Pages site) + live bundle fetch se confirm:

1. **Deployed bundle STALE hai.** Live `backend/backup.js` & `cloud.js` (ajaykumarwppu-bot.github.io/Achiva/)
   mein `userdata` path hai; workspace files mein nahi. Console error
   `Invalid collection reference ... userdata/<uid> has 2 segments` isi purane code se aata hai,
   settings button dabane par → `open()` crash → sheet nahi khulti.
2. **Workspace code mein bhi parity bug tha** (logged-in user par wahi crash karta):
   `doc('users/<uid>/profile')` = 3 segments (DocumentReference ko EVEN chahiye).
3. **firestore.rules bhi parity-wrong thi** (`match /profile` = 3-segment doc path; aur
   `match /users/{uid} { allow false }` naye profile-doc ko deny karta).

### Fixes applied in this workspace
- `backend/backup.js`: profile path → `users/<uid>` (save + read, 2 segments ✔); schema comments update.
- `backend/cloud.js`: schema comment update.
- `backend/firestore.rules`: `match /users/{uid}` ab owner ko read/write deta hai; `/profile` sub-match
   hataya; `/data/{docId}` shape-check waisa hi.
- `backend/settings.js`: `open()` mein `safe()` wrapper — paint/refresh errors ab sheet ko
   **kabhi nahi** rok sakte (defensive).

### Post-fix verification
- Parity lint: sab Firestore paths VALID (doc=even, collection=odd) ✔
- `node --check` backup/cloud/settings ✔
- Headless Chrome: boot + real click → panel open, **0 errors** ✔

### User action required (order matter karta hai)
1. Firebase Console → Firestore → Rules mein **naya `backend/firestore.rules`** paste + Publish
   (purani rules naye profile-doc ko deny karengi).
2. Workspace files commit + push → `Deploy a Web` + `Build APK` workflows naya bundle banayenge.
3. Pages hard-refresh (cache) + naya APK install → settings button test.

Cosmetic (ignore): Firestore `enableMultiTabIndexedDbPersistence` deprecation notice;
`[DOM] Password field is not contained in a form`.

## D. Reproduce commands (isi workspace mein)
- jsdom: `cd /home/user && node /tmp/jt/test.js net`  ( /tmp session-scoped hai; dobara chahiye to
  `npm i jsdom fake-indexeddb puppeteer` )
- chrome hit-test: `node /tmp/jt/test3.js`
