package com.achiva.app

import android.content.Context
import android.webkit.JavascriptInterface

/**
 * Web ↔ Native bridge.
 * WebView mein "AchivaNative" naam se inject hota hai.
 * Saare methods JSON/string return karte hain jo web side parse karti hai.
 */
class Bridge(private val ctx: Context) {

    private val usage = UsagePlugin(ctx)

    /** bridge zinda hai? web isi se detect karta hai */
    @JavascriptInterface
    fun isReady(): String = "1"

    /** Usage-Access permission on hai ya nahi */
    @JavascriptInterface
    fun hasUsagePermission(): String = if (usage.hasPermission()) "1" else "0"

    /** phone ki Usage-Access settings kholo (first-time permission) */
    @JavascriptInterface
    fun openUsageSettings() {
        usage.openSettings()
    }

    /**
     * Aaj ka poora usage data (on-demand, koi background service nahi):
     * {
     *   "granted": true,
     *   "totalMs": 8123000,
     *   "apps": [
     *     { "pkg":"com.instagram.android", "name":"Instagram",
     *       "totalMs": 5230000,
     *       "sessions": [ {"startMs":…, "endMs":…}, … ] },
     *     …
     *   ]
     * }
     */
    @JavascriptInterface
    fun getTodayUsage(): String = usage.todayJson()

    /* ---------- study timer (background service + notifications) ---------- */

    @JavascriptInterface
    fun timerAvailable(): String = "1"

    /** countdownMs > 0 → countdown mode, 0 → stopwatch */
    @JavascriptInterface
    fun timerStart(countdownMs: Long) {
        TimerService.start(ctx, countdownMs)
    }

    /* ---------- TIMER-FIX (Batch 41) : session identity + recovery ---------- */

    /** web apni session-id bhejti hai (timerStart ke turant baad) —
       completed session save + dedupe isi se pakka hota hai */
    @JavascriptInterface
    fun timerSetSession(sessionId: String?) {
        TimerService.setSessionId(sessionId)
        TimerService.persistSession(ctx)   // id prefs mein bhi (process-death recovery)
    }

    /** process-death ke baad bhi bacha hua completed/overdue session:
       {elapsedMs, startEpochMs, sessionId} ya "" — web reconcile ise
       save karke timerClearPending bulata hai */
    @JavascriptInterface
    fun timerPendingSession(): String = TimerService.pendingJson(ctx)

    /** pending session web save kar chuki — SharedPreferences saaf karo */
    @JavascriptInterface
    fun timerClearPending() {
        TimerService.clearPending(ctx)
    }

    @JavascriptInterface
    fun timerPause() { TimerService.pause() }

    @JavascriptInterface
    fun timerResume() { TimerService.resume() }

    @JavascriptInterface
    fun timerStatus(): String = TimerService.statusJson()

    /** stop + final status JSON (web isi se session record karta hai) */
    @JavascriptInterface
    fun timerStop(): String {
        val s = TimerService.statusJson()
        TimerService.stopAlarm(ctx)
        TimerService.stopAll()
        try {
            ctx.stopService(android.content.Intent(ctx, TimerService::class.java))
        } catch (_: Throwable) { }
        return s
    }

    /** sirf alarm tone/full-screen band karo (session service chalta rahe) */
    @JavascriptInterface
    fun timerStopAlarm(): String {
        TimerService.stopAlarm(ctx)
        return "1"
    }

    /** alarm chal raha hai? */
    @JavascriptInterface
    fun timerAlarmActive(): String = if (TimerService.alarmActive) "1" else "0"

    /** completed session save ho chuka ho; naya countdown shuru karo */
    @JavascriptInterface
    fun timerExtend(ms: Long): String {
        TimerService.extend(ctx, ms)
        return "1"
    }

    /* ================================================================
       FOCUS SHIELD (Tier-1 soft-lock) — web ↔ native
       ================================================================ */

    /** rules JSON set karo (web focus-store se) */
    @JavascriptInterface
    fun focusSetRules(json: String) { FocusPrefs.setRules(ctx, json) }

    /** settings JSON set karo */
    @JavascriptInterface
    fun focusSetSettings(json: String) { FocusPrefs.setSettings(ctx, json) }

    /** live state push karo (targetDone / studyMinutes / timerRunning) */
    @JavascriptInterface
    fun focusPushState(json: String) { FocusPrefs.setState(ctx, json) }

    /** rules + settings + state ek saath (UI load par) */
    @JavascriptInterface
    fun focusGetAll(): String {
        return try {
            org.json.JSONObject()
                .put("rules", FocusPrefs.rules(ctx))
                .put("settings", FocusPrefs.settings(ctx))
                .put("state", FocusPrefs.state(ctx))
                .toString()
        } catch (t: Throwable) { "{}" }
    }

    /** installed launcher apps (picker ke liye) */
    @JavascriptInterface
    fun focusListApps(): String {
        val out = org.json.JSONArray()
        try {
            val pm = ctx.packageManager
            val main = android.content.Intent(android.content.Intent.ACTION_MAIN)
            main.addCategory(android.content.Intent.CATEGORY_LAUNCHER)
            val list = pm.queryIntentActivities(main, 0)
            for (ri in list) {
                val pkg = ri.activityInfo.packageName
                if (pkg == ctx.packageName) continue
                out.put(org.json.JSONObject().put("pkg", pkg)
                    .put("label", ri.loadLabel(pm).toString()))
            }
        } catch (t: Throwable) { /* ignore */ }
        return out.toString()
    }

    @JavascriptInterface
    fun focusStart() { FocusService.start(ctx) }

    @JavascriptInterface
    fun focusStop() { FocusService.stop(ctx) }

    @JavascriptInterface
    fun focusRunning(): String = if (FocusService.running) "1" else "0"

    /** overlay (display-over-other-apps) permission */
    @JavascriptInterface
    fun focusHasOverlay(): String =
        if (android.provider.Settings.canDrawOverlays(ctx)) "1" else "0"

    @JavascriptInterface
    fun focusRequestOverlay() {
        try {
            val i = android.content.Intent(
                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:" + ctx.packageName))
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        } catch (t: Throwable) { /* ignore */ }
    }

    /** usage-access permission (UsagePlugin ka reuse) */
    @JavascriptInterface
    fun focusHasUsage(): String = if (usage.hasPermission()) "1" else "0"

    @JavascriptInterface
    fun focusOpenUsage() { usage.openSettings() }

    /** emergency unlock : minutes tak saare rules OFF + log */
    @JavascriptInterface
    fun focusUnlock(minutes: Int) {
        try {
            val st = org.json.JSONObject(FocusPrefs.state(ctx))
            val now = System.currentTimeMillis()
            st.put("unlockUntil", now + minutes * 60_000L)
            st.put("unlockCount", st.optInt("unlockCount", 0) + 1)
            st.put("lastUnlockAt", now)
            FocusPrefs.setState(ctx, st.toString())
        } catch (t: Throwable) { /* ignore */ }
    }
}
