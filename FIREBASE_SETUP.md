# achiva · Firebase setup (ek hi baar, ~10 minute)

Ye guide sirf aapke liye hai — app ko chalane ke liye. Isse padh kar step-by-step karein,
app mein **koi code samajhne ki zaroorat nahi** hai. Sirf step 5 mein ek copy-paste karna hai.

---

## Kya ban raha hai

| Cheez | Kaise kaam karegi |
|---|---|
| **Login** | App khulte hi email + password maangega. Bina login app nahi khulegi. |
| **Backup** | Settings (gear icon) → **Backup now**. Sirf aapke dabane par. Koi auto-backup nahi. |
| **Restore** | Settings → **Restore**. Cloud wala data phone par wapas aa jayega (app reload hoti hai). |
| **Naya phone / fresh login** | App poochegi: *"Cloud backup mila — wapas laayein?"* Aap haan kahenge tabhi restore hoga. |
| **Theme** | Header se andar Settings mein chali gayi hai. Pasand yaad rehti hai aur backup mein bhi jaati hai. |
| **Paisa** | Firebase ka **Spark (free) plan** kaafi hai. Credit card ki zaroorat nahi. |

> Cloud Storage (files/images) wala hissa **use nahi kiya gaya** — wo ab paida (Blaze) plan maangta hai.
> Hum sirf **Firestore** use karte hain, jo free plan mein milta hai (1 GB data, din ke 20,000 writes).

---

## Step 1 — Firebase project banayein

1. <https://console.firebase.google.com/> kholein → Google account se login karein.
2. **Add project** → naam `achiva` → Continue.
3. Google Analytics: **OFF** kar dein (zaroorat nahi) → **Create project**.

## Step 2 — Web app register karein (config milega)

1. Project khulne par **`</>`** (Web) icon dabayein.
2. App nickname: `achiva-web` → **Register app**.
3. Screen par `firebaseConfig` dikhega — **use copy kar lein** (step 5 mein paste karna hai):

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "achiva-app.firebaseapp.com",
  projectId: "achiva-app",
  storageBucket: "achiva-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123"
};
```

4. Baaki steps (npm install waghaira) **skip** kar dein — hum CDN script use karte hain.

## Step 3 — Firestore database banayein

1. Left menu → **Build → Firestore Database** → **Create database**.
2. Location: `asia-south1` (Mumbai) ya jo najdeek lage → Next.
3. Mode: **Start in production mode** → Create.
   (Rules hum step 6 mein khud lagayenge — isliye production mode hi sahi hai.)

## Step 4 — Email/Password login ON karein

1. Left menu → **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → **Email/Password** → Enable karein → Save.
3. Zaroorat nahi hai, par agar chahein to **Email link (passwordless)** OFF hi rehne dein.

## Step 5 — config app mein daalein (sirf copy-paste)

File kholein: **`backend/firebase-config.js`**

Usme ye lines milengi:

```js
var CONFIG = {
  apiKey: 'PASTE-YOUR-apiKey',
  authDomain: 'PASTE-YOUR-authDomain',
  projectId: 'PASTE-YOUR-projectId',
  storageBucket: 'PASTE-YOUR-storageBucket',
  messagingSenderId: 'PASTE-YOUR-messagingSenderId',
  appId: 'PASTE-YOUR-appId'
};
```

Har `PASTE-YOUR-...` ki jagah step 2 mein mili value daal dein (quotes ke andar), jaise:

```js
var CONFIG = {
  apiKey: 'AIzaSyD-xxxxxx',
  authDomain: 'achiva-app.firebaseapp.com',
  projectId: 'achiva-app',
  storageBucket: 'achiva-app.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abc123'
};
```

Save karein. **Bas itna hi code ka kaam hai.**

> Config daalne se pehle app kharab nahi hoti — gate par *"Login abhi band hai"* likha aayega
> aur ek button hoga jisse app bina login khul jayegi. Config daalte hi login apne aap chalu.

## Step 6 — Firestore rules lagayein (security)

1. **Firestore Database → Rules** tab kholein.
2. Jo bhi likha hai use hata kar **`backend/firestore.rules`** ka poora text paste karein.
3. **Publish** dabayein.

Iska matlab: har user **sirf apna** data padh/likh sakta hai, bina login koi kuch nahi dekh sakta.

## Step 7 — allowed domains (agar zaroorat pade)

**Authentication → Settings → Authorized domains** mein check karein:

- `ajaykumarwppu-bot.github.io` — add karein (agar list mein na ho)
- `localhost` — testing ke liye (pehle se hota hai)

APK isi GitHub Pages URL ko kholta hai, isliye alag se kuch nahi karna.

## Step 8 — deploy karein

1. Sab files GitHub repo mein push karein (`backend/` folder bhi — ab wo deploy hota hai).
2. GitHub → **Actions → Deploy Web → Run workflow**.
3. 1-2 minute baad <https://ajaykumarwppu-bot.github.io/achiva/> kholein.
4. **APK dobara build karne ki zaroorat NAHI hai** — APK wahi website kholta hai.

---

## Pehli baar use kaise karein

1. App kholein → gate aayega → **NAYA ACCOUNT** tab → email + password (6+ characters) → **SIGN UP**.
2. Ab app khul jayegi.
3. Header ka **gear (⚙)** icon dabayein → **Backup now**.
4. Ho gaya — data cloud par safe.

**Doosre phone / browser mein:** wahi email-password se login karein → app poochegi
*"Cloud backup mila, wapas laayein?"* → **Haan** → data aa jayega.

---

## Chhoti-chhoti baatein

- **Password bhool gaye?** Gate par *"Password bhool gaye?"* → email daalein → reset link mail par aayega
  (link APK mein apne aap Chrome mein khul jayega).
- **Internet na ho:** agar pehle login kar chuke hain to gate par *"Bina internet chalu rakhein"* button
  aayega — app offline khul jayegi (backup/restore us waqt band).
  Naya user offline andar **nahi** ja sakta.
- **Sign out:** Settings → Account → Sign out. Phone ka data mit-ta nahi, dobara login par mil jayega.
- **Free limit:** 1 GB storage, din ke 20,000 write, 50,000 read. Ek insaan ke liye ye bahut zyada hai —
  backup manual hai isliye limit chhoone ka sawaal hi nahi.
- **Data kahan rehta hai:** `users/<aapki-uid>/profile` aur `users/<aapki-uid>/data/...` (6 documents).
- **Auto-backup jaan-boojh kar nahi hai** — aapne kaha tha *"manual hi rahe"*.

## Files jo is kaam ke liye bani/badli

| File | Kya |
|---|---|
| `backend/firebase-config.js` | **naya** — aapki Firebase config (sirf yahan paste karna hai) |
| `backend/cloud.js` | **naya** — Firestore se baat karne wali patli layer |
| `backend/auth.js` | **naya** — login gate + email/password + offline entry |
| `backend/backup.js` | **naya** — Backup now / Restore / first-login ka sawaal |
| `backend/settings.js` | **naya** — gear button + Settings sheet (theme, backup, account) |
| `backend/firestore.rules` | **naya** — security rules (Firebase Console mein paste) |
| `index.html` | **badla** — gear button, theme pre-apply, 3 SDK + 5 backend script tags |
| `.github/workflows/deploy-web.yml` | **badla** — `backend/` folder bhi deploy ho |
| `style/*.css` | **kuch nahi badla** (frozen — byte-identical) |
| `android-app/` | **kuch nahi badla** (APK rebuild ki zaroorat nahi) |
