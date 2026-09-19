# Achiva — Nayi Repo Banane Ki Poori Guide (step-by-step)

Workspace status: **50 files, ~640 KB**, sab verified (41 core + android + CI + docs).
`.github/workflows/` dono yml YAML-validated hain. `uploads/` delete ho chuka hai.

---

## Step 0 — Workspace download karo
Workspace ka ZIP download karo. Isme **hidden folders bhi** aate hain (`.github/`, `.gitignore`) —
ye zaroori hain kyunki CI workflows wahin se chalte hain.

## Step 1 — Nayi repo banao
GitHub → **New repository**
- Name: `Achiva`
- **Public** (free GitHub Pages ke liye zaroori)
- ❌ "Add a README file" — mat chuno
- ❌ .gitignore template — mat chuno (hamari apni hai)
- ❌ License — abhi nahi

## Step 2 — Files push karo (git CLI recommended)
```bash
cd <downloaded-workspace-folder>
git init -b main
git add -A
git commit -m "Achiva v2 - web app + android app + CI workflows"
git remote add origin https://github.com/<aapka-username>/Achiva.git
git push -u origin main
```
Kyun CLI: `.github/` jaise **dot-folders web upload UI mein aksar chhoot jaate hain**;
`git add -A` unhe pakka leta hai. (Web UI use karni hi ho to dono yml manually
`.github/workflows/` mein create karke paste karni padengi.)

## Step 3 — Repo checklist (push ke baad GitHub par dikhe)
- `index.html`, `style/`, `core/`, `features/` (incl. `subject tracker/` space wala), `backend/`
- `android-app/` (13 files)
- `.github/workflows/deploy-web.yml` + `build-apk.yml`
- `.gitignore`, `FIREBASE_SETUP.md`, `PROJECT-BRIEF.md`, `MIGRATION-LOG.md`, `VERIFICATION-REPORT.md`
- `backend/firebase-config.js` ✔ (repo mein HONI chahiye — Pages isi se chalti hai;
  Firebase web config client-side public hoti hai, asli suraksha rules + domain restrictions hain)

## Step 4 — Pages ON karo
Repo → **Settings → Pages → Source: "GitHub Actions"**.
(Push paths match hone ki wajah se `Deploy Web` workflow turant khud chal jayega.)

## Step 5 — Actions tab dono runs check karo
- **Deploy Web** ✔ → environment `github-pages`, URL milega (`https://<user>.github.io/Achiva/`)
- **Build APK** ✔ → artifacts:
  1. `achiva-apk` → download karke install/test
  2. `achiva-keystore` (**sirf pehle run mein**) → download karke repo mein
     `android-app/app/achiva.keystore` par rakho → commit+push.
     Isse agle sab builds **same signature** ke honge (warna har naye APK par uninstall/reinstall).

## Step 6 — Firebase Console (ISI ORDER MEIN)
1. **Firestore → Rules** → `backend/firestore.rules` ka naya text paste → **Publish**.
   (Purani rules naya profile-doc `users/<uid>` deny karti thi — backup tab tak fail rahega.)
2. **Authentication → Settings → Authorized domains** → naya Pages domain add karo
   (`localhost` pehle se hoga).
3. (Recommended) **Google Cloud Console → Credentials → API key → Application restrictions**
   → HTTP referrers: `https://<user>.github.io/*` + `http://localhost/*`.

## Step 7 — Test karo
- Pages URL **hard refresh** (Ctrl+Shift+R / mobile mein cache clear)
- Login → header gear → **Settings sheet khulni chahiye** (theme + account + backup)
- "Backup now" → restore round-trip test
- Naya APK install → same test

## Step 8 — Purana repo delete
Sirf jab naya repo par sab test ho jaye:
purani repo → Settings → General → **Delete this repository**.
(Isse purana Pages URL bhi band ho jayega — wahi stale bundle bug ka source tha.)

## Step 9 — Mujhe batao
Naya Pages URL bhejo — main headless Chrome se live bundle + settings button dobara verify kar dunga.

---

## Workflows mein mile 2 note (guide mein handle ho chuke)
1. `build-apk.yml` keystore tab hi banata hai jab repo mein na ho → pehle run ka artifact
   commit karna zaroori (Step 5.2), warna signature har build badlegi.
2. `deploy-web.yml` `backend/firebase-config.js` site par publish karta hai (zaroori hai) —
   isliye `.gitignore` se wo line hatayi gayi hai; suraksha Step 6.2/6.3 se.
