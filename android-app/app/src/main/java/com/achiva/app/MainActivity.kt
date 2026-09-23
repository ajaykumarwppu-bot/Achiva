package com.achiva.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView

/**
 * Achiva — hybrid shell (CRASH-PROOF build).
 *
 * • Koi bhi unexpected error ho to app crash hone ke bajaye
 *   screen par error ka REASON dikhati hai (taaki screenshot
 *   bhej kar exact fix mil sake)
 * • WEB_URL abhi placeholder ho to setup instructions dikhati hai
 * • Hosted web app (GitHub Pages) ko WebView mein kholta hai
 * • Native bridge (Bridge.kt) ko "AchivaNative" naam se deta hai
 */
class MainActivity : Activity() {

    private var web: WebView? = null

    companion object {
        /* AlarmActivity / Bridge WebView ko completed session save karwa sakte hain */
        @Volatile var instance: MainActivity? = null
            private set

        /* TIMER-FIX (Bug A4): jo save WebView tak nahi pahunch paya (page
           reload ho raha tha / activity destroyed thi) wo yahan rukta hai —
           agle onResume / onPageFinished par retry hota hai. Pehle ye
           SILENTLY DROP ho jata tha. */
        @Volatile var pendingSave: Triple<Long, Long, String>? = null

        fun requestSave(elapsedMs: Long, startEpochMs: Long, sessionId: String = "") {
            val act = instance
            if (act == null || act.web == null) {
                pendingSave = Triple(elapsedMs, startEpochMs, sessionId)
                return
            }
            act.runOnUiThread { act.attemptSave(elapsedMs, startEpochMs, sessionId, 0) }
        }
    }

    private val saveHandler = Handler(Looper.getMainLooper())

    /* TIMER-FIX: JS '1' ack lautata hai (window.AchivaStudySave ka return).
       Ack na mile → har 1s retry (max 30) → phir bhi nahi → pendingSave. */
    private fun attemptSave(ms: Long, startMs: Long, sid: String, tries: Int) {
        val w = web
        if (w == null) {
            if (tries < 30) saveHandler.postDelayed({ attemptSave(ms, startMs, sid, tries + 1) }, 1000L)
            else pendingSave = Triple(ms, startMs, sid)
            return
        }
        val safeSid = sid.filter { it.isLetterOrDigit() }.take(40)
        val js = "(function(){try{" +
            "return window.AchivaStudySave ? String(window.AchivaStudySave($ms,$startMs,\"$safeSid\")) : \"0\";" +
            "}catch(e){return \"0\";}})();"
        val onFail: () -> Unit = {
            if (tries < 30) saveHandler.postDelayed({ attemptSave(ms, startMs, sid, tries + 1) }, 1000L)
            else pendingSave = Triple(ms, startMs, sid)
        }
        try {
            w.evaluateJavascript(js) { res ->
                if (res == null || !res.contains("1")) onFail()
            }
        } catch (_: Throwable) { onFail() }
    }

    private fun drainPendingSave() {
        val p = pendingSave ?: return
        pendingSave = null
        attemptSave(p.first, p.second, p.third, 0)
    }

    /* TIMER-FIX: web ka reconcile hook — orphan/finished/pending sessions
       page khulte hi aur app foreground par lautne par save hote hain */
    private fun reconcileWeb() {
        try {
            web?.evaluateJavascript(
                "if (window.AchivaTimerReconcile) window.AchivaTimerReconcile();", null
            )
        } catch (_: Throwable) { }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        try {
            val url = BuildConfig.WEB_URL

            // placeholder URL guard : APK banane se pehle URL set nahi hua
            if (url.contains("USERNAME") || url.contains("REPO/\"") || url.isBlank()) {
                showErrorScreen(
                    "SETUP ADHURA HAI\n\n" +
                    "android-app/app/build.gradle mein WEB_URL abhi bhi placeholder hai.\n\n" +
                    "1. GitHub repo mein app/build.gradle kholo\n" +
                    "2. WEB_URL mein apna Pages URL daalo, jaise:\n" +
                    "   https://ajaykumarwppu-bot.github.io/Achiva/\n" +
                    "3. Commit karo → Build APK workflow dobara chalega\n" +
                    "4. Naya APK install karo"
                )
                return
            }

            val wv = WebView(this)
            web = wv
            setContentView(wv)

            wv.settings.javaScriptEnabled = true
            wv.settings.domStorageEnabled = true          // localStorage ✔
            wv.settings.databaseEnabled = true
            wv.settings.mediaPlaybackRequiresUserGesture = false

            /* TIMER-FIX / GOOGLE-FIX : Android WebView ka UA "; wv)" flag
               Google OAuth ko block karwata hai (disallowed_useragent).
               Flag hata do taaki Google consent WebView mein chal sake. */
            try {
                val ua = wv.settings.userAgentString
                if (ua != null && ua.contains("; wv)")) {
                    wv.settings.userAgentString = ua.replace("; wv)", "")
                }
            } catch (_: Throwable) { }

            // sirf hamara hosted URL + auth flows WebView ke andar, baaki browser mein
            wv.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                    /* TIMER-FIX: page ready — orphan sessions reconcile karo
                       aur pending save (retry-queue) drain karo */
                    reconcileWeb()
                    drainPendingSave()
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?, request: WebResourceRequest?
                ): Boolean {
                    return try {
                        val u = request?.url?.toString() ?: return false
                        val host = request?.url?.host ?: ""
                        /* GOOGLE-FIX : Google sign-in redirect flow ke saare
                           pages app ke ANDAR khulein (popup WebView mein block
                           hota hai, redirect chalta hai) */
                        val inApp = u.startsWith(url) ||
                            host == "accounts.google.com" ||
                            host == "apis.google.com" ||
                            host == "firebaseapp.com" ||
                            host.endsWith(".firebaseapp.com")
                        if (inApp) false
                        else {
                            startActivity(
                                android.content.Intent(
                                    android.content.Intent.ACTION_VIEW,
                                    android.net.Uri.parse(u)
                                )
                            )
                            true
                        }
                    } catch (_: Throwable) { true }
                }
            }

            // ★ native bridge — web isi se phone ka usage data maangti hai
            wv.addJavascriptInterface(Bridge(this), "AchivaNative")

            /* TIMER-FIX (Bug A2): Android 13+ par notification permission ke
               bina timer notification + alarm full-screen notification DONO
               invisible rehte hain. Ek baar maang lo. */
            if (Build.VERSION.SDK_INT >= 33) {
                try {
                    if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED
                    ) {
                        requestPermissions(
                            arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1001
                        )
                    }
                } catch (_: Throwable) { }
            }

            wv.loadUrl(url)
        } catch (t: Throwable) {
            showErrorScreen("ACHIVA START ERROR\n\n" + (t.toString()))
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            // permission settings se wapas aane par web ko refresh ka signal
            web?.evaluateJavascript(
                "if (window.__timerRefresh) window.__timerRefresh();", null
            )
        } catch (_: Throwable) { }
        /* TIMER-FIX: foreground par laute → reconcile + pending-save retry */
        reconcileWeb()
        drainPendingSave()
    }

    /* GOOGLE-FIX : Google consent page se back → app page par wapas
       (warna back button app band kar deta) */
    override fun onBackPressed() {
        if (web?.canGoBack() == true) {
            web?.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        /* TIMER-FIX: stale instance se bacho — requestSave ab pendingSave
           mein park karega (pehle destroyed WebView par silently fail hota tha) */
        if (instance === this) instance = null
        saveHandler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /** crash ki jagah : screen par readable error */
    private fun showErrorScreen(msg: String) {
        val tv = TextView(this)
        tv.text = msg
        tv.setTextColor(Color.WHITE)
        tv.setBackgroundColor(Color.parseColor("#16181B"))
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        tv.setPadding(48, 64, 48, 48)
        setContentView(tv)
    }
}
