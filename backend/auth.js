/* ================================================================
   BACKEND / AUTH.JS — compulsory email login + login gate (UI)
   ----------------------------------------------------------------
   Responsibility:
     • App khulte hi #authGate dikha kar poora app dhak dena
       (z-index 400 — header 35, FAB 55, modals 95 se upar).
     • Login (Sign in) / Naya account (Sign up) / Forgot password.
     • Firebase auth ka session yaad rakhna:
         achiva.account.v1 → {uid, email, at}
         achiva.offline.v1 → '1'  (offline mode chalu hai)
       Isse app dobara khulne par gate flash nahi karti.
     • Net na ho + purana session ho → "Bina internet chalu rakhein"
       (offline mode). Naya user kabhi bina login andar nahi jaata.
     • Login ke baad backup.js ka firstRunFlow() chalana
       (cloud backup mila to pooch kar restore — kabhi auto nahi).
     • Auth ki har Firebase galti ka Hinglish message dikhana.

   UI note: CSS files FROZEN hain, isliye gate ka poora design
   inline styles se bana hai (koi naya CSS rule nahi).

   Load order (backend): 3/5
   ================================================================ */

(function () {
  'use strict';

  var ACCOUNT_KEY = 'achiva.account.v1';
  var OFFLINE_KEY = 'achiva.offline.v1';

  var gate = null;
  var gTitle = null, gSub = null, gTabs = null, gForm = null, gErr = null;
  var gMain = null, gAlt = null, gForgot = null, gOffline = null, gNote = null;
  var gEmail = null, gPass = null;
  var mode = 'login';            /* login | sign */
  var busy = false;
  var bootDone = false;
  var user = null;
  var testProvider = null;

  var signInHandlers = [];
  var signOutHandlers = [];

  /* ================================================================
     AUTH PROVIDER
     Real = Firebase (window.firebase.auth()). Test ke liye
     setTestProvider() se nakli provider inject ho sakta hai.
  ================================================================ */
  function realProvider() {
    var fa = window.firebase.auth();
    try { fa.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* ignore */ }
    return {
      ready: function () { return true; },
      currentUser: function () { return fa.currentUser; },
      onAuth: function (cb) { return fa.onAuthStateChanged(cb, function () { cb(null); }); },
      signIn: function (email, pass) { return fa.signInWithEmailAndPassword(email, pass); },
      signUp: function (email, pass) { return fa.createUserWithEmailAndPassword(email, pass); },
      reset: function (email) { return fa.sendPasswordResetEmail(email); },
      signOut: function () { return fa.signOut(); }
    };
  }

  function provider() {
    /* testProvider (ya window hook) se nakli provider bhi chal sakta hai —
       automated test ke liye. Production mein ye hamesha Firebase hi hota hai. */
    return testProvider || window.__ACHIVA_TEST_PROVIDER ||
      (window.firebase && window.firebase.auth ? realProvider() : null);
  }

  function authAvailable() {
    if (testProvider || window.__ACHIVA_TEST_PROVIDER) return true;
    return !!(window.firebase && window.firebase.auth && window.ACHIVA_FIREBASE_CONFIG);
  }

  /* ================================================================
     LOCAL SESSION (localStorage)
  ================================================================ */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function getAccount() {
    try {
      var raw = lsGet(ACCOUNT_KEY);
      if (!raw) return null;
      var a = JSON.parse(raw);
      return (a && a.uid) ? a : null;
    } catch (e) { return null; }
  }

  function setAccount(u) {
    if (!u) { lsDel(ACCOUNT_KEY); return; }
    lsSet(ACCOUNT_KEY, JSON.stringify({
      uid: u.uid,
      email: u.email || '',
      at: Date.now()
    }));
  }

  function isOffline() { return lsGet(OFFLINE_KEY) === '1'; }

  function session() {
    if (user) return { uid: user.uid, email: user.email || '', offline: false };
    if (isOffline()) {
      var a = getAccount();
      if (a) return { uid: a.uid, email: a.email, offline: true };
    }
    return null;
  }

  function currentUser() { return user; }

  /* ================================================================
     HINGLISH ERROR MAP (Firebase auth codes)
  ================================================================ */
  function authMsg(err) {
    var code = (err && (err.code || '')) || '';
    var raw = String((err && err.message) || err || '');
    if (/invalid-email|email-already-in-use|operation-not-allowed/i.test(raw) && !code) {
      code = 'auth/' + raw.toLowerCase().replace(/[^a-z-]/g, '');
    }
    var M = {
      'auth/invalid-email': 'Email sahi format mein nahi hai (jaise naam@gmail.com).',
      'auth/user-disabled': 'Ye account band kar diya gaya hai.',
      'auth/user-not-found': 'Is email se koi account nahi mila. Pehle "Naya account" banayein.',
      'auth/wrong-password': 'Password galat hai. Dobara koshish karein.',
      'auth/invalid-credential': 'Email ya password galat hai.',
      'auth/email-already-in-use': 'Ye email pehle se registered hai. "Login" se andar aayein.',
      'auth/weak-password': 'Password kam se kam 6 characters ka hona chahiye.',
      'auth/too-many-requests': 'Bahut baar galat koshish hui. Thodi der baad dobara karein.',
      'auth/network-request-failed': 'Internet connection nahi mil raha. Net check karein.',
      'auth/operation-not-allowed': 'Firebase Console mein Email/Password sign-in ON karna zaroori hai (FIREBASE_SETUP.md step 4).',
      'auth/requires-recent-login': 'Security ke liye ek baar dobara login karein.',
      'auth/popup-blocked': 'Popup block ho gaya. Browser mein popup allow karein.',
      'auth/cancelled-popup-request': 'Pehla popup band ho gaya. Dobara koshish karein.',
      'auth/web-storage-unsupported': 'Browser storage allow nahi kar raha (WebView settings check karein).'
    };
    if (M[code]) return M[code];
    /* code na mile to raw message se andaza lagao */
    if (/invalid-credential|wrong-password|user-not-found/i.test(raw)) return M['auth/invalid-credential'];
    if (/network|offline|fetch/i.test(raw)) return M['auth/network-request-failed'];
    if (/weak-password/i.test(raw)) return M['auth/weak-password'];
    if (/email-already-in-use/i.test(raw)) return M['auth/email-already-in-use'];
    return 'Login nahi ho paya: ' + (code || raw || 'unknown error');
  }

  /* ================================================================
     GATE UI (sab inline styles — CSS files ko chua nahi gaya)
  ================================================================ */
  var CARD_CSS = 'position:relative;width:min(340px,calc(100% - 44px));padding:22px 20px 20px;' +
    'border:1px solid var(--line);border-radius:24px;background:var(--sheet-bg);' +
    'box-shadow:0 30px 60px -24px rgba(10,12,16,.55),inset 0 1px 0 var(--hl-soft);' +
    'display:flex;flex-direction:column;gap:12px';
  var INPUT_CSS = 'width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--s2);' +
    'background:var(--input-bg);font:inherit;font-size:14px;color:var(--ink);outline:none;' +
    'box-sizing:border-box';
  var LBL_CSS = 'font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;' +
    'color:var(--ash);font-weight:600;margin:0 0 6px';
  var LINK_CSS = 'border:0;background:transparent;font:inherit;font-size:12px;' +
    'color:var(--slate);cursor:pointer;padding:6px;text-decoration:underline';

  var BRAND_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function field(labelText, type, placeholder, id) {
    var w = document.createElement('div');
    var l = document.createElement('div');
    l.style.cssText = LBL_CSS;
    l.textContent = labelText;
    var i = document.createElement('input');
    i.type = type;
    i.placeholder = placeholder || '';
    i.style.cssText = INPUT_CSS;
    i.autocomplete = type === 'password' ? 'current-password' : 'email';
    if (id) i.id = id;
    w.appendChild(l);
    w.appendChild(i);
    return { wrap: w, input: i };
  }

  function tabBtn(text, key) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('data-mode', key);
    b.style.cssText = 'flex:1;padding:9px 0;border-radius:99px;border:1px solid transparent;' +
      'background:transparent;font:inherit;font-size:12px;font-weight:700;color:var(--ash);cursor:pointer';
    return b;
  }

  /* gate ke andar ka poora form banado */
  function buildGate() {
    if (!gate) gate = document.getElementById('authGate');
    if (!gate) return;

    gate.innerHTML = '';

    var card = document.createElement('div');
    card.style.cssText = CARD_CSS;

    /* brand */
    var brand = document.createElement('div');
    brand.style.cssText = 'display:flex;align-items:center;gap:9px;justify-content:center';
    brand.innerHTML = '<span class="brand-mark">' + BRAND_SVG + '</span>';
    var bt = document.createElement('div');
    bt.innerHTML = '<div class="brand-name">ACHIVA</div>' +
      '<div class="brand-sub" style="text-align:center">Study OS</div>';
    brand.appendChild(bt);
    card.appendChild(brand);

    /* title + sub */
    gTitle = document.createElement('div');
    gTitle.style.cssText = 'font-family:var(--f-disp);font-size:19px;font-weight:700;' +
      'color:var(--ink);text-align:center;margin-top:4px';
    gTitle.textContent = 'Welcome back';
    card.appendChild(gTitle);

    gSub = document.createElement('div');
    gSub.style.cssText = 'font-size:12px;color:var(--ash);text-align:center;line-height:1.6';
    gSub.textContent = 'Apne account se login karein';
    card.appendChild(gSub);

    /* tabs */
    gTabs = document.createElement('div');
    gTabs.style.cssText = 'display:flex;gap:4px;padding:4px;border:1px solid var(--line);' +
      'border-radius:99px;background:var(--mi-bg);margin-top:2px';
    var tLogin = tabBtn('LOGIN', 'login');
    var tSign = tabBtn('NAYA ACCOUNT', 'sign');
    gTabs.appendChild(tLogin);
    gTabs.appendChild(tSign);
    gTabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-mode]') : null;
      if (b) setMode(b.getAttribute('data-mode'));
    });
    card.appendChild(gTabs);

    /* fields */
    gForm = document.createElement('div');
    var f1 = field('EMAIL', 'email', 'aapka@email.com', 'gateEmail');
    var f2 = field('PASSWORD', 'password', 'kam se kam 6 characters', 'gatePass');
    gEmail = f1.input;
    gPass = f2.input;
    gForm.appendChild(f1.wrap);
    gForm.appendChild(f2.wrap);
    gForm.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    card.appendChild(gForm);

    /* error line */
    gErr = document.createElement('div');
    gErr.id = 'gateError';
    gErr.style.cssText = 'display:none;font-size:11.5px;line-height:1.5;color:#c0392b;' +
      'background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.22);' +
      'border-radius:10px;padding:8px 10px';
    card.appendChild(gErr);

    /* main button */
    gMain = document.createElement('button');
    gMain.type = 'button';
    gMain.className = 'btn-solid';
    gMain.id = 'gateMain';
    gMain.style.cssText = 'flex:none;width:100%;margin-top:2px';
    gMain.textContent = 'LOGIN';
    gMain.addEventListener('click', submit);
    card.appendChild(gMain);

    /* forgot password */
    gForgot = document.createElement('button');
    gForgot.type = 'button';
    gForgot.id = 'gateForgot';
    gForgot.style.cssText = LINK_CSS;
    gForgot.textContent = 'Password bhool gaye?';
    gForgot.addEventListener('click', forgotFlow);
    card.appendChild(gForgot);

    /* switch mode link */
    gAlt = document.createElement('button');
    gAlt.type = 'button';
    gAlt.id = 'gateAlt';
    gAlt.style.cssText = LINK_CSS;
    gAlt.textContent = 'Naya account banana hai?';
    gAlt.addEventListener('click', function () { setMode(mode === 'login' ? 'sign' : 'login'); });
    card.appendChild(gAlt);

    /* offline entry (sirf zaroorat par dikhta hai) */
    gOffline = document.createElement('button');
    gOffline.type = 'button';
    gOffline.id = 'gateOffline';
    gOffline.className = 'btn-ghost';
    gOffline.style.cssText = 'flex:none;width:100%;display:none';
    gOffline.textContent = 'Bina internet chalu rakhein';
    gOffline.addEventListener('click', offlineEnter);
    card.appendChild(gOffline);

    /* footer note */
    gNote = document.createElement('div');
    gNote.id = 'gateNote';
    gNote.style.cssText = 'font-size:10.5px;color:var(--ash);text-align:center;line-height:1.6';
    gNote.textContent = 'Aapka data sirf aapke account mein save hota hai.';
    card.appendChild(gNote);

    gate.appendChild(card);
    paintTabs();
  }

  function paintTabs() {
    if (!gTabs) return;
    var bs = gTabs.querySelectorAll('button[data-mode]');
    Array.prototype.forEach.call(bs, function (b) {
      var on = b.getAttribute('data-mode') === mode;
      b.style.background = on ? 'var(--chip-bg)' : 'transparent';
      b.style.borderColor = on ? 'var(--s2)' : 'transparent';
      b.style.color = on ? 'var(--ink)' : 'var(--ash)';
      b.style.boxShadow = on ? 'inset 0 1px 0 var(--hl-soft)' : 'none';
    });
  }

  function setMode(m) {
    mode = (m === 'sign') ? 'sign' : 'login';
    showError('');
    paintTabs();
    if (!gTitle) return;
    if (mode === 'sign') {
      gTitle.textContent = 'Account banayein';
      gSub.textContent = 'Email aur password se apna account banayein';
      gMain.textContent = 'SIGN UP';
      gAlt.textContent = 'Pehle se account hai? Login karein';
      gForgot.style.display = 'none';
    } else {
      gTitle.textContent = 'Welcome back';
      gSub.textContent = 'Apne account se login karein';
      gMain.textContent = 'LOGIN';
      gAlt.textContent = 'Naya account banana hai?';
      gForgot.style.display = '';
    }
  }

  function showError(msg) {
    if (!gErr) return;
    if (!msg) { gErr.style.display = 'none'; gErr.textContent = ''; return; }
    gErr.textContent = msg;
    gErr.style.display = 'block';
  }

  function setBusy(on, label) {
    busy = !!on;
    if (!gMain) return;
    gMain.disabled = busy;
    gMain.style.opacity = busy ? '.6' : '1';
    gMain.textContent = busy ? (label || 'Please wait...') : (mode === 'sign' ? 'SIGN UP' : 'LOGIN');
  }

  function setBusyText(t) { if (gMain) { gMain.disabled = true; gMain.textContent = t; } }

  /* gate ko poora dikhao / chhupao */
  function showGate() {
    if (!gate) gate = document.getElementById('authGate');
    if (!gate) return;
    gate.style.display = 'flex';
    gate.style.opacity = '1';
    gate.style.pointerEvents = 'auto';
    gate.style.visibility = 'visible';
  }

  function hideGate() {
    if (!gate) gate = document.getElementById('authGate');
    if (!gate) return;
    gate.style.opacity = '0';
    gate.style.pointerEvents = 'none';
    /* .22s fade ke baad display none (jsdom mein bhi turant lagta hai) */
    window.setTimeout(function () {
      if (!gate) return;
      if (gate.style.opacity === '0') {
        gate.style.display = 'none';
        gate.style.visibility = 'hidden';
      }
    }, 240);
  }

  function gateVisible() {
    if (!gate) gate = document.getElementById('authGate');
    return !!gate && gate.style.display !== 'none';
  }

  /* ================================================================
     ACTIONS
  ================================================================ */
  function submit() {
    if (busy) return;
    var p = provider();
    if (!p) { showError('Login abhi chalu nahi hai (Firebase config missing).'); return; }

    var email = (gEmail && gEmail.value || '').trim();
    var pass = (gPass && gPass.value || '');
    showError('');

    if (!email || email.indexOf('@') < 0) { showError('Sahi email daalein (jaise naam@gmail.com).'); return; }
    if (!pass || pass.length < 6) { showError('Password kam se kam 6 characters ka hona chahiye.'); return; }

    setBusy(true, mode === 'sign' ? 'Account ban raha hai...' : 'Login ho raha hai...');

    var work = (mode === 'sign') ? p.signUp(email, pass) : p.signIn(email, pass);
    Promise.resolve(work).then(function (cred) {
      var u = (cred && cred.user) || p.currentUser();
      setBusy(false);
      if (!u || !u.uid) { showError('Login confirm nahi hua. Dobara koshish karein.'); return; }
      onSignedIn(u);
    }).catch(function (e) {
      setBusy(false);
      showError(authMsg(e));
    });
  }

  /* purana session wapas mila (app khulte hi) — koi pooch-taach nahi */
  function resume(u) {
    user = u;
    /* per-account local data : namespace set + legacy adopt.
       Agar stored namespace is uid se alag thi (bina sign-out account badla)
       to ek baar reload karo taaki features sahi account ka data padhein. */
    if (window.AppStorage) {
      var prev = window.AppStorage.ns();
      window.AppStorage.setNamespace(u.uid);
      window.AppStorage.adoptLegacy();
      if (prev !== u.uid) { window.location.reload(); return; }
    }
    lsDel(OFFLINE_KEY);
    setAccount(u);
    hideGate();
  }

  /* naya login / signup hua — ab cloud data ka faisla poocha jayega */
  function onSignedIn(u) {
    resume(u);
    if (window.AchivaBackup && window.AchivaBackup.firstRunFlow) {
      window.AchivaBackup.firstRunFlow(session());
    }
    signInHandlers.forEach(function (fn) { try { fn(session()); } catch (e) { /* ignore */ } });
  }

  function forgotFlow() {
    var p = provider();
    if (!p) { showError('Login abhi chalu nahi hai (Firebase config missing).'); return; }
    if (!window.UI || !UI.modal) { showError('Password reset abhi uplabdh nahi hai.'); return; }

    var m = UI.modal({ zWrap: 420, zScrim: 419, saveLabel: 'Link bhejo' });
    var msg = null;
    m.open('Password reset', function (body) {
      var f = UI.inputField('EMAIL', 'jis email se account banaya tha', 'email');
      if (gEmail && gEmail.value) f.input.value = gEmail.value.trim();
      body.appendChild(f.wrap);
      msg = UI.el('div');
      msg.style.cssText = 'font-size:11.5px;color:var(--ash);line-height:1.6;margin-top:4px';
      msg.textContent = 'Reset link aapke email par aayega. Link APK mein khud browser mein khul jayega.';
      body.appendChild(msg);
      /* save par email uthana padega — closure se */
      body.setAttribute('data-ready', '1');
      f.input.id = 'resetEmail';
    }, function () {
      var inp = document.getElementById('resetEmail');
      var email = (inp && inp.value || '').trim();
      if (!email || email.indexOf('@') < 0) { msg.textContent = 'Sahi email daalein.'; return; }
      msg.textContent = 'Bhej rahe hain...';
      Promise.resolve(p.reset(email)).then(function () {
        msg.textContent = 'Reset link bhej diya gaya hai. Email check karein (spam folder bhi).';
        window.setTimeout(function () { m.close(); }, 1400);
      }).catch(function (e) {
        msg.textContent = authMsg(e);
      });
    });
  }

  function offlineEnter() {
    var a = getAccount();
    if (!a) return;
    lsSet(OFFLINE_KEY, '1');
    hideGate();
    if (window.AchivaSettings && window.AchivaSettings.setBanner) {
      window.AchivaSettings.setBanner('Offline mode — backup / restore abhi band hai');
    }
  }

  function signOut() {
    var p = provider();
    var done = function () {
      user = null;
      setAccount(null);
      lsDel(OFFLINE_KEY);
      /* account ka local data ab visible NAHI (namespace clear) */
      if (window.AppStorage) window.AppStorage.setNamespace(null);
      signOutHandlers.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    };
    if (isOffline() || !p) { done(); return Promise.resolve(true); }
    return Promise.resolve(p.signOut()).then(done, done);
  }

  /* ================================================================
     BOOT
  ================================================================ */
  function boot() {
    if (bootDone) return;
    bootDone = true;
    buildGate();
    showGate();

    /* backend hi chalu nahi (config missing) → app ko rokna nahi */
    if (!authAvailable()) {
      setMode('login');
      if (gTitle) gTitle.textContent = 'Login abhi band hai';
      if (gSub) gSub.textContent = 'Firebase setup complete nahi hua.';
      if (gTabs) gTabs.style.display = 'none';
      if (gForm) gForm.style.display = 'none';
      if (gForgot) gForgot.style.display = 'none';
      if (gAlt) gAlt.style.display = 'none';
      if (gMain) {
        gMain.textContent = 'APP KHALEIN (bina login)';
        gMain.disabled = false;
        gMain.onclick = function () { hideGate(); };
      }
      if (gNote) {
        gNote.innerHTML = 'backend/firebase-config.js mein apni Firebase config daalein ' +
          'aur Firestore rules deploy karein — uske baad login apne aap chalu ho jayega.<br>' +
          '(guide: backend/FIREBASE_SETUP.md)';
      }
      return;
    }

    setMode('login');
    var p = provider();
    if (!p) { showError('Auth module load nahi hua. Page reload karein.'); return; }

    setBusyText('Connect ho raha hai...');

    var settled = false;
    var finish = function (u) {
      if (settled) return;
      settled = true;
      setBusy(false);
      if (u && u.uid) resume(u);
      else { user = null; showLoginUI(); }
    };

    /* onAuthStateChanged kabhi na aaye (SDK atka ho) to 7s baad khud faisla */
    var guard = window.setTimeout(function () {
      finish(p.currentUser ? p.currentUser() : null);
    }, 7000);

    try {
      p.onAuth(function (u) {
        window.clearTimeout(guard);
        finish(u);
      });
    } catch (e) {
      window.clearTimeout(guard);
      finish(null);
    }
  }

  /* login form wapas dikha do + offline entry ka faisla */
  function showLoginUI() {
    if (gTabs) gTabs.style.display = '';
    if (gForm) gForm.style.display = '';
    if (gAlt) gAlt.style.display = '';
    setMode('login');
    if (gMain) gMain.onclick = submit;
    if (gMain) gMain.style.display = '';
    if (gOffline) {
      /* purana session yaad hai to offline jaane ka rasta do */
      gOffline.style.display = getAccount() ? '' : 'none';
    }
    if (gNote) {
      gNote.textContent = getAccount()
        ? 'Net na chale to niche wale button se app offline bhi khol sakte hain.'
        : 'Aapka data sirf aapke account mein save hota hai.';
    }
    /* pehli baar khulne par gate ke upar app dikha na jaye */
    if (gEmail) { try { gEmail.blur(); } catch (e) { /* ignore */ } }
  }

  /* ================================================================
     EXPORT
  ================================================================ */
  window.AchivaAuth = {
    ACCOUNT_KEY: ACCOUNT_KEY,
    OFFLINE_KEY: OFFLINE_KEY,
    boot: boot,
    showGate: showGate,
    hideGate: hideGate,
    gateVisible: gateVisible,
    showError: showError,
    authMsg: authMsg,
    session: session,
    currentUser: currentUser,
    getAccount: getAccount,
    setAccount: setAccount,
    isOffline: isOffline,
    signOut: signOut,
    authAvailable: authAvailable,
    setTestProvider: function (p) { testProvider = p || null; },
    onSignIn: function (fn) { signInHandlers.push(fn); },
    onSignOut: function (fn) { signOutHandlers.push(fn); },
    /* test / advanced ke liye */
    _internal: {
      setMode: setMode,
      submit: submit,
      buildGate: buildGate,
      resume: resume,
      onSignedIn: onSignedIn
    }
  };
})();
