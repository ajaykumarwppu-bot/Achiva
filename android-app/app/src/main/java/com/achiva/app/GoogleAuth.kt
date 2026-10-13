package com.achiva.app

import android.content.Intent
import android.net.Uri
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.browser.customtabs.CustomTabsIntent
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialCustomException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.util.concurrent.Executors

/**
 * GOOGLE-FIX (native sign-in — laptop jaisa account chooser).
 * WebView isolated hai: Chrome cookies nahi, Settings>Accounts nahi dikhta.
 * CredentialManager = SYSTEM account chooser. Fail → Custom Tab fallback.
 */
object GoogleAuth {

    const val JS_TOKEN_CB = "__onNativeGoogleToken"
    const val JS_ERROR_CB = "__onNativeGoogleError"
    const val JS_CUSTOM_TAB_CB = "__onNativeGoogleCustomTab"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val bg = Executors.newSingleThreadExecutor()
    private var cachedBase: String? = null

    fun resolveWebClientId(jsClientId: String?): String {
        try { if (!jsClientId.isNullOrBlank()) return jsClientId.trim() } catch (_: Throwable) { }
        return try { (BuildConfig.GOOGLE_WEB_CLIENT_ID ?: "").trim() } catch (_: Throwable) { "" }
    }

    fun nativeAvailable(webClientId: String): Boolean {
        if (webClientId.isBlank()) return false
        return try { Class.forName("androidx.credentials.CredentialManager"); true } catch (_: Throwable) { false }
    }

    fun signIn(activity: MainActivity, web: WebView?, jsClientId: String?) {
        val clientId = resolveWebClientId(jsClientId)
        if (clientId.isBlank()) { jsError(web, "NO_CONFIG"); return }
        try {
            val cm = CredentialManager.create(activity)
            val googleOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(clientId)
                .setAutoSelectEnabled(false)
                .build()
            val request = GetCredentialRequest.Builder().addCredentialOption(googleOption).build()
            val signal = CancellationSignal()
            bg.execute {
                try {
                    cm.getCredential(activity, request, signal, bg,
                        object : androidx.credentials.CredentialManagerCallback<
                            androidx.credentials.GetCredentialResponse, GetCredentialException> {
                            override fun onResult(result: androidx.credentials.GetCredentialResponse) {
                                handleResult(web, result)
                            }
                            override fun onError(e: GetCredentialException) {
                                handleError(activity, web, e, clientId)
                            }
                        })
                } catch (t: Throwable) {
                    mainHandler.post { openCustomTab(activity, clientId, "EX:" + t.javaClass.simpleName) }
                }
            }
        } catch (t: Throwable) {
            try { openCustomTab(activity, clientId, "EX:" + t.javaClass.simpleName) }
            catch (_: Throwable) { jsError(web, "UNAVAILABLE") }
        }
    }
    fun openCustomTab(activity: MainActivity, webClientId: String, reason: String) {
        try {
            val web = activity.currentWebView()
            jsCustomTab(web, reason)
            // NOTE: Firebase JS ka __/auth/handler seedha Custom Tab mein kholna
            // kaam NAHI karta (session wapas WebView mein nahi aata). Isliye
            // fallback = app ka apna page Chrome- engineering Custom Tab mein kholo:
            // Chrome ke Google cookies wahan share hote hain → account chooser
            // dikhta hai → user login karke wapas app mein aata hai aur
            // Firebase session (LOCAL persistence) sync ho jata hai.
            val base = cachedBase ?: webUrl()
            val url = base + (if (base.endsWith("/")) "" else "/") +
                "?google_fallback=" + Uri.encode(reason)
            val intent = CustomTabsIntent.Builder().build()
            intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { intent.launchUrl(activity, Uri.parse(url)) }
            catch (_: Throwable) {
                val view = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(view)
            }
        } catch (_: Throwable) { }
    }

    fun openCustomTabUrl(activity: MainActivity, url: String?) {
        if (url.isNullOrBlank()) return
        try {
            val intent = CustomTabsIntent.Builder().build()
            intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { intent.launchUrl(activity, Uri.parse(url)) }
            catch (_: Throwable) {
                val view = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(view)
            }
        } catch (_: Throwable) { }
    }

    fun handleDeepLink(activity: MainActivity, uri: Uri?) {
        try {
            if (uri == null || uri.scheme != "achiva") return
            val web = activity.currentWebView() ?: return
            val full = uri.toString().replace("'", "\\'")
            mainHandler.post {
                try {
                    web.evaluateJavascript(
                        "(function(){try{if(window.__onNativeGoogleRedirect)" +
                            "{window.__onNativeGoogleRedirect('$full');}}catch(e){}})();", null)
                } catch (_: Throwable) { }
            }
        } catch (_: Throwable) { }
    }

    fun notePageUrl(url: String?) {
        try {
            if (url.isNullOrBlank()) return
            val u = Uri.parse(url)
            val scheme = u.scheme ?: return
            val host = u.host ?: return
            if (scheme != "http" && scheme != "https") return
            cachedBase = "$scheme://$host"
        } catch (_: Throwable) { }
    }

    fun jsGetWebClientId(web: WebView?, cb: (String) -> Unit) {
        mainHandler.post {
            try {
                web?.evaluateJavascript(
                    "(function(){try{return window.ACHIVA_GOOGLE_WEB_CLIENT_ID||'';}catch(e){return '';}})();"
                ) { res ->
                    try {
                        var v = (res ?: "").trim()
                        if (v.length >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length - 1)
                        cb(v)
                    } catch (_: Throwable) { cb("") }
                }
            } catch (_: Throwable) { cb("") }
        }
    }

    private fun handleResult(web: WebView?, result: androidx.credentials.GetCredentialResponse) {
        try {
            val cred = result.credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val bundle = cred.data
                val idToken = try { GoogleIdTokenCredential.createFrom(bundle).idToken }
                catch (_: Throwable) {
                    bundle.getString("com.google.android.libraries.identity.googleid.BUNDLE_KEY_ID_TOKEN") ?: ""
                }
                if (idToken.isNotBlank()) { jsToken(web, idToken); return }
            }
            jsError(web, "NO_TOKEN")
        } catch (t: Throwable) { jsError(web, "EX:" + t.javaClass.simpleName) }
    }

    private fun handleError(activity: MainActivity, web: WebView?, e: GetCredentialException, clientId: String) {
        mainHandler.post {
            when (e) {
                is GetCredentialCancellationException -> jsError(web, "CANCELLED")
                is NoCredentialException -> openCustomTab(activity, clientId, "NO_CREDENTIAL")
                is GetCredentialCustomException -> openCustomTab(activity, clientId, "CUSTOM:" + (e.type ?: ""))
                else -> openCustomTab(activity, clientId, "ERR:" + e.javaClass.simpleName)
            }
        }
    }

    private fun jsToken(web: WebView?, idToken: String) {
        val safe = idToken.replace("\\", "\\\\").replace("'", "\\'")
        mainHandler.post {
            try {
                web?.evaluateJavascript(
                    "(function(){try{if(window.$JS_TOKEN_CB){window.$JS_TOKEN_CB('$safe');}}catch(e){}})();", null)
            } catch (_: Throwable) { }
        }
    }

    private fun jsError(web: WebView?, code: String) {
        val safe = code.replace("'", "")
        mainHandler.post {
            try {
                web?.evaluateJavascript(
                    "(function(){try{if(window.$JS_ERROR_CB){window.$JS_ERROR_CB('$safe');}}catch(e){}})();", null)
            } catch (_: Throwable) { }
        }
    }

    private fun jsCustomTab(web: WebView?, reason: String) {
        val safe = reason.replace("'", "")
        mainHandler.post {
            try {
                web?.evaluateJavascript(
                    "(function(){try{if(window.$JS_CUSTOM_TAB_CB){window.$JS_CUSTOM_TAB_CB('$safe');}}catch(e){}})();",
                    null)
            } catch (_: Throwable) { }
        }
    }

    private fun webUrl(): String {
        return try { BuildConfig.WEB_URL } catch (_: Throwable) { "https://ajaykumarwppu-bot.github.io/Achiva/" }
    }
}
