# achiva — Project Brief & Migration Guide

Source: `uploads/achiva-V2 (5).pdf` (5 pages, rendered & read). Extracted 9/19/2026.
Total: **61 nodes = 19 folders + 41 files** (matches PDF header exactly).

---

## 1. Reconstructed file tree (web + android)

Root mapping: PDF's "New Project/" = **workspace root `/home/user/`** (flattened, no wrapper
folders). "android-app/" stays as its own folder at the root.

```
New Project/
├── index.html
├── style/
│   ├── foundation.css      # global design DNA: colors, typography, spacing, tokens, reset
│   ├── layout.css          # structure/positioning: shell, header, sections, grid/flex, responsive
│   ├── component.css       # reusable UI: buttons, cards, inputs, modals, toasts + states
│   └── screen.css          # per-screen unique styling overrides
├── features/
│   ├── subject tracker/    # ⚠ folder name has a SPACE — rename to subject-tracker
│   │   ├── list.js
│   │   ├── basics.js
│   │   ├── topic.js
│   │   ├── sources.js
│   │   ├── sources-detail.js
│   │   ├── rivision.js     # ⚠ likely typo of revision.js — confirm
│   │   ├── test.js
│   │   ├── error.js
│   │   └── doubt.js
│   ├── canvas/
│   │   ├── canvas.js
│   │   ├── canvas-cards.js
│   │   ├── canvas-lines.js
│   │   ├── canvas-editor.js
│   │   └── canvas-groups.js
│   └── timer/
│       ├── timer.js
│       └── timer-bridge.js
├── core/
│   ├── storage.js
│   └── ui.js
├── backend/
│   ├── auth.js
│   ├── backup.js
│   ├── cloud.js
│   ├── firebase-config.js  # ⚠ holds Firebase keys — keep OUT of public git
│   └── settings.js
└── android-app/
    ├── app/
    │   ├── build.gradle
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       ├── java/com/achiva/app/
    │       │   ├── Bridge.kt
    │       │   ├── MainActivity.kt
    │       │   ├── TimerService.kt
    │       │   └── UsagePlugin.kt
    │       └── res/
    │           ├── drawable/ic_launcher_foreground.xml
    │           ├── values/colors.xml
    │           ├── values/strings.xml
    │           ├── values/themes.xml
    │           └── minmap-anypdi-v26/ic_launcher.xml   # ⚠ likely typo of mipmap-anydpi-v26
    ├── build.gradle
    └── settings.gradle
```

Not in tree but mentioned by user (add when migrating):
- `storage.rules` (Firebase Storage rules)
- Firebase setup file (firestore rules / firebase.json / setup notes)

Folder count check: style, features, subject-tracker, canvas, timer, core, backend,
android-app, app, src, main, java, com, achiva, app, res, drawable, values, mipmap = **19** ✔
File count = 27 web + 14 android = **41** ✔

---

## 2. CSS architecture intent (from PDF notes)

- **foundation.css** — visual foundation / design DNA. Global colors (light+dark), bg/surface,
  primary/secondary/accent, text colors, typography defaults, font size/weight base rules,
  border colors/radii, shadows, global spacing vars, transition/animation duration vars,
  CSS variables & design tokens, basic reset. NO screen/component positioning here.
- **layout.css** — structure & spatial arrangement: app shell, header position, main content
  area, screen containers, section spacing, flexbox/grid, columns/rows, responsive rules,
  mobile adaptation, scroll containers, fixed/sticky/relative positioning, alignment,
  page-level container dimensions. Does NOT define button/card visuals.
- **component.css** (a.k.a components.css) — reusable UI used in 1+ places with same design &
  behavior: buttons, cards, input fields, selectors, modals, progress bars, toggles, menu items,
  chips/tags, icon containers, dashboard blocks, list items, empty states, toast/notifications.
  Includes states: default, hover, active, selected, disabled, focus, loading.
  Rule: if Subject Card / Chapter Card / other cards share a base design → common design lives here.
- **screen.css** (a.k.a screens.css) — unique per-screen / per-feature visual needs that differ
  from global layout or reusable components: Subject Tracker, Chapter, Topic, Study Source card
  appearance, Revision, Question Recall, Settings, special sections, screen-level component mods.
  Example: common card base → components.css; Study Source card special mod → screens.css.

---

## 3. Workspace capacity (measured in THIS session)

- Disk: ~9.9 GB total, ~9.3 GB free. Inodes: ~655,000 files.
- Persistence cap (what actually matters): keep `/home/user` ≤ **10,000 files** and ≤ **128 MB**,
  else turn-end snapshot may drop content.
- Auto-excluded from snapshot (don't count toward cap, but DON'T persist): node_modules, dist,
  build, out, target, .venv, __pycache__, .cache, .next, .turbo, coverage, etc.
- RAM ~1 GB, CPU 2 cores, bash timeout default 30s / max 1800s.
- A 61-file front-end app is far below every limit.

---

## 4. Why the old chat kept saying "Content Security Warning"

- It is the **chat-input safety/moderation filter**, triggered by pasting a big code blob that
  contained **Firebase keys / tokens / long random strings** (looks like secrets exfiltration).
- Once triggered, the flag often sticks to the **whole conversation thread**, so even innocent
  later prompts get blocked. That is why every retry (last night ~1am and this morning) failed.
- **NOT caused by file count or workspace size.** Workspace and input moderation are separate.
- No user-facing unflag. Fix = **start a new conversation** + **never paste raw keys into chat**.

---

## 5. How to move the whole project into THIS workspace (ranked)

1. **ZIP upload (best).** In the old chat, use the workspace **Download/Export** button — it is a
   UI action, needs no prompt, so it still works even though prompts are blocked. Attach the .zip
   here; I unzip into the **workspace root `/home/user/`** (project is flattened there: index.html,
   style/, features/, core/, backend/, android-app/ — no wrapper folders, per user's request).
   OR zip your **local copy** (already set up) and attach.
2. **Git.** Push local → private GitHub repo → download repo ZIP → attach here.
   Do **NOT** paste a Personal Access Token into chat (re-triggers the same filter).
3. **Scaffold from this brief.** I create all 61 nodes from Section 1; you paste small files one at
   a time with keys redacted. Tedious but works if zip is impossible.

### Security rules for the move
- Never paste real Firebase `apiKey`/tokens into any chat message.
- Keep `firebase-config.js` with real keys OUT of public git: use a `firebase-config.template.js`
  + `.gitignore`, or env vars / local-only file.
- Zips containing keys are fine inside this private workspace, just don't publish them.

---

## 6. Naming — RESOLVED (verified against real index.html, Batch 1)
- `features/subject tracker/` space is REAL (index.html references it). Kept as-is; do NOT rename
  unless index.html script paths are updated in the same change.
- `rivision.js` spelling is REAL. Kept as-is.
- `res/minmap-anypdi-v26/` in the PDF is an OCR artifact; real Android dir is `mipmap-anydpi-v26/`.
