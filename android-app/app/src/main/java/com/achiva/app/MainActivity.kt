package com.achiva.app

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
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

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val url = BuildConfig.WEB_URL

            // placeholder URL guard : APK banane se pehle URL set nahi hua
            if (url.contains("USERNAME") || url.contains("REPO/\"") || url.isBlank()) {
                showErrorScreen(
                    "SETUP ADHURA HAI\n\n" +
                    "android-app/app/build.gradle mein WEB_URL abhi bhi placeholder hai.\n\n" +
                    "1. GitHub repo mein app/build.gradle kholo\n" +
                    "2. WEB_URL mein apna Pages URL daalo, jaise:\n" +
                    "   https://ajaykumarwppu-bot.github.io/achiva/\n" +
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

            // sirf hamara hosted URL WebView ke andar, baaki browser mein
            wv.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?, request: WebResourceRequest?
                ): Boolean {
                    return try {
                        val u = request?.url?.toString() ?: return false
                        if (u.startsWith(url)) false
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
