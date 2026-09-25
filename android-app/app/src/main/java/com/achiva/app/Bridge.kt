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
}
