/* ================================================================
   BACKEND / EMAIL-CONFIG.JS — email verification code service (EmailJS)
   ----------------------------------------------------------------
   • Signup ke step-1 mein jo ONE-TIME code email par jaata hai,
     wo EmailJS ke REST API se bheja jaata hai (koi server nahi).
   • EmailJS par free account banao → ek Service (apna email/Gmail)
     → ek Template jisme ye variables hon :
         {{to_email}}   → jis email par code jaayega
         {{code}}       → 6-digit one-time code
         {{app_name}}   → "Achiva"
   • EmailJS dashboard → Account → API Keys → PUBLIC KEY yahan
     `publicKey` mein; Service ID aur Template ID bhi yahan.
   • Jab tak ye values fill nahi hoti, email-code signup band
     rehta hai (gate saaf message dikhata hai) aur "Sign in with
     Google" + normal login pehle jaise chalte hain.
   • NOTE: ye file website par deploy hoti hai — EmailJS ki PUBLIC
     key client-side safe maani jaati hai (rate-limits EmailJS par
     lago karein). Secret key kabhi yahan NA daalein.

   Load order (backend): firebase-config se pehle
   ================================================================ */

(function () {
  'use strict';

  var CONFIG = {
    publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
    serviceId: "YOUR_SERVICE_ID",
    templateId: "YOUR_TEMPLATE_ID"
  };

  function isFilled(c) {
    if (!c) return false;
    var need = ['publicKey', 'serviceId', 'templateId'];
    for (var i = 0; i < need.length; i++) {
      var v = c[need[i]];
      if (!v || typeof v !== 'string') return false;
      if (v.indexOf('YOUR_') === 0) return false;
    }
    return true;
  }

  /* pre-set config (test harness) override NAHI hoti */
  var pre = window.ACHIVA_EMAIL_CONFIG;
  if (pre && typeof pre === 'object' && pre.publicKey) {
    /* wahi chalegi */
  } else {
    window.ACHIVA_EMAIL_CONFIG = isFilled(CONFIG) ? CONFIG : null;
  }
})();
