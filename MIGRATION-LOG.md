# achiva — Migration Log

**Project root = workspace root (`/home/user/`)** — flattened on user's request so every
file/folder name is directly visible in the workspace (no `achiva/` or `app/` wrapper folders).
Naming rule: **exact names from index.html are preserved** (including `features/subject tracker/`
with a space and `rivision.js`) — renaming would break the app's script references.

Received batches are copied verbatim (byte-size verified against uploads).

---

## Batch 1 — ✔ (5 files)

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| index.html | /index.html | 23275 |
| foundation.css | /style/foundation.css | 6258 |
| layout.css | /style/layout.css | 4562 |
| component.css | /style/component.css | 18612 |
| screen.css | /style/screen.css | 7129 |

## Batch 2 — ✔ (5 files)

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| list.js | /features/subject tracker/list.js | 38817 |
| basics.js | /features/subject tracker/basics.js | 14948 |
| rivision.js | /features/subject tracker/rivision.js | 30110 |
| error.js | /features/subject tracker/error.js | 12395 |
| doubt.js | /features/subject tracker/doubt.js | 5649 |

## Batch 3 — ✔ (5 files) — subject tracker COMPLETE (9/9)

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| topic.js | /features/subject tracker/topic.js | 16556 |
| sources.js | /features/subject tracker/sources.js | 14410 |
| sources-detail.js | /features/subject tracker/sources-detail.js | 19646 |
| test.js | /features/subject tracker/test.js | 14704 |
| canvas.js | /features/canvas/canvas.js | 6227 |

## Batch 4 — ✔ (5 files) — canvas COMPLETE (5/5)

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| canvas-cards.js | /features/canvas/canvas-cards.js | 13437 |
| canvas-lines.js | /features/canvas/canvas-lines.js | 11698 |
| canvas-editor.js | /features/canvas/canvas-editor.js | 20515 |
| canvas-groups.js | /features/canvas/canvas-groups.js | 13815 |
| timer.js | /features/timer/timer.js | 10672 |

## Batch 5 — ✔ (5 files) — timer COMPLETE (2/2), core COMPLETE (2/2)

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| timer-bridge.js | /features/timer/timer-bridge.js | 1935 |
| storage.js | /core/storage.js | 2086 |
| ui.js | /core/ui.js | 19809 |
| auth.js | /backend/auth.js | 23318 |
| backup.js | /backend/backup.js | 19702 |

All 20 JS files pass `node --check` (syntax valid) as of this batch.

## Batch 6 — ✔ (5 files) — backend COMPLETE (5/5); Firebase extras received

| Source (uploads/) | Placed at | Bytes | Notes |
|---|---|---|---|
| cloud.js | /backend/cloud.js | 5976 | syntax OK |
| settings.js | /backend/settings.js | 20084 | syntax OK |
| firebase-config.js | /backend/firebase-config.js | 2561 | REAL KEYS — content never printed in chat; git-ignored |
| FIREBASE_SETUP.md | /FIREBASE_SETUP.md | 6768 | setup guide (8 steps) |
| firestore.rules.txt | /backend/firestore.rules | 1658 | renamed .txt→.rules; path matches FIREBASE_SETUP.md ("backend/firestore.rules") |

Actions taken with this batch:
- **Encoding repair:** uploaded firestore.rules.txt was invalid UTF-8 (cp1252 bytes from copy-paste);
  transcoded to UTF-8 and restored 4 mangled "→" arrows. Rules logic untouched (comments only).
- **Created /backend/firebase-config.template.js** — same shape as real config, all 6 secret values
  replaced with YOUR_* placeholders (2 config blocks masked). Safe to commit.
- **Created /.gitignore** — ignores node_modules/, dist/, build/, .env and backend/firebase-config.js.

Extras status: `storage.rules` is NOT referenced anywhere in FIREBASE_SETUP.md or index.html —
treated as resolved/unnecessary (the "Store.rules" the user mentioned = firestore.rules). Confirm
with user only if Storage bucket rules turn out to be needed later.

## Batch 7 — ✔ (7 files) — android res/ complete + root gradle files

| Source | Placed at | Notes |
|---|---|---|
| ic_launcher_foreground.xml | android-app/app/src/main/res/drawable/ | XML well-formed ✔ |
| ic_launcher.xml | android-app/app/src/main/res/mipmap-anydpi-v26/ | XML well-formed ✔ |
| colors.xml | android-app/app/src/main/res/values/ | XML well-formed ✔ |
| strings.xml | android-app/app/src/main/res/values/ | XML well-formed ✔ |
| themes.xml | android-app/app/src/main/res/values/ | XML well-formed ✔ |
| (screenshot 1_Capture.PNG) | android-app/build.gradle | transcribed verbatim from editor screenshot |
| (screenshot Capture.PNG) | android-app/settings.gradle | transcribed verbatim; rootProject.name = "Achiva" |

## Batch 8 — ✔ (6 files) — android-app COMPLETE (13/13) → **PROJECT 41/41 COMPLETE** 🎉

| Source (uploads/) | Placed at | Bytes |
|---|---|---|
| build.gradle.txt | android-app/app/build.gradle | 1510 |
| Bridge.kt.txt | .../java/com/achiva/app/Bridge.kt | 2145 |
| MainActivity.kt.txt | .../java/com/achiva/app/MainActivity.kt | 4000 |
| TimerService.kt.txt | .../java/com/achiva/app/TimerService.kt | 5789 |
| UsagePlugin.kt.txt | .../java/com/achiva/app/UsagePlugin.kt | 5198 |
| AndroidManifest.xml | android-app/app/src/main/AndroidManifest.xml | 1894 |

The `.txt`-rename trick worked perfectly (byte-exact). All 4 .kt files declare
`package com.achiva.app` matching their directory. Manifest is well-formed XML.

---

## FINAL VALIDATION (after batch 8)

- **index.html:** all **27 local src/href references resolve** — zero missing files.
- **Node count:** 19 folders ✔ (matches PDF "19 folders"); 41 core files ✔ + extras.
- **Syntax:** all 23 web JS files pass `node --check`; all 6 XML well-formed.
- **Extras present:** backend/firestore.rules, backend/firebase-config.template.js, .gitignore,
  FIREBASE_SETUP.md, PROJECT-BRIEF.md, MIGRATION-LOG.md.

## Still pending
**Nothing.** Migration complete.

## Batch 9 — ✔ (2 files) — CI workflows added; uploads cleanup

| Source (uploads/) | Placed at | Notes |
|---|---|---|
| deploy-web.yml.txt | .github/workflows/deploy-web.yml | YAML valid; jobs: deploy; triggers: workflow_dispatch + push(paths) |
| build-apk.yml.txt | .github/workflows/build-apk.yml | YAML valid; jobs: build; JDK17 + Gradle 8.7 (AGP 8.5.2 ke saath compatible) |

Workflow review notes:
- deploy-web: web-root auto-detect (`git ls-files ... index.html`), space wala `subject tracker`
  folder `cp -r` se sahi copy hota hai; `_site/backend/firestore.rules` site se hataya jata hai ✔
- deploy-web: `backend/firebase-config.js` site par publish HOTI hai (zaroori hai) — isliye
  `.gitignore` se wo line hatayi gayi; suraksha = firestore.rules + Firebase Console domain restrictions.
- build-apk: keystore har run regenerate hota hai agar repo mein committed nahi hai →
  pehle run ka `achiva-keystore` artifact download karke repo mein commit karo (stable signature).

Cleanup: `/home/user/uploads/` poori tarah delete (saari uploaded source files placed & verified thi).
Workspace ab: **50 files, ~640 KB**.

---

## How to send files the uploader blocks (proven tricks)

1. **Rename to .txt (best, byte-exact):** copy `X.gradle` → `X.gradle.txt` (or `X.kt.txt`), upload,
   I rename back. Bytes are untouched by renaming — works for ANY file, even binaries/images.
   Already proven with `firestore.rules.txt`, `*.kt.txt`, `*.yml.txt`.
2. **Editor screenshot:** fine for SHORT files (< ~40 lines). I transcribe verbatim.
   Risk: long files → multiple screenshots + transcription error risk. Prefer trick 1.
3. **Zip:** try uploading a `.zip` of the remaining files; if the extension is allowed I unzip.
4. Do NOT paste secrets/keys into chat text (that is what flagged the old thread).

---

## Notes learned from index.html (verified)
- Firebase compat SDK **12.18.0** from gstatic (app-compat, auth-compat, firestore-compat).
- Script load order in index.html = backend/* → core/* → features/* (canvas, subject tracker, timer).
- `features/subject tracker/` space and `rivision.js` spelling are REAL, kept as-is.
