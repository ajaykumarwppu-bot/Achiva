package com.achiva.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * FOCUS SHIELD — Tier-1 (soft-lock) enforcement service.
 *
 * Har ~1.5 sec mein foreground app padhta hai (UsageStatsManager, wahi
 * tareeka jo UsagePlugin on-demand use karta hai). Agar foreground app
 * kisi ACTIVE rule ki blocked-list mein hai :
 *    1. BlockOverlayActivity (full-screen, non-cancelable) kholo
 *    2. HOME intent bhejo taaki blocked app peeche chhup jaaye
 *
 * Ye "hard block" NAHI hai (Android normal apps ko wo power nahi deta) —
 * ye ek strong soft-lock hai : overlay hatane ke liye user ko jaan-boojh
 * kar force-stop / permission revoke karni padti hai, aur har emergency
 * unlock ka log banta hai.
 *
 * Foreground service (specialUse) isliye taaki OEM battery-killers kam
 * se kam rok sakein; notification hamesha dikhti hai (transparency).
 */
class FocusService : Service() {

    companion object {
        private const val CH = "achiva_focus_shield"
        private const val NOTIF_ID = 4101
        private const val POLL_MS = 1500L

        var running = false
            private set

        fun start(ctx: Context) {
            val i = Intent(ctx, FocusService::class.java)
            /* Android 8+ : background se start karne par startForegroundService
               zaroori hai (boot receiver / app band ho tab bhi service chale).
               onCreate mein turant startForeground() hota hai, isliye ye safe hai. */
            try { ctx.startForegroundService(i); return } catch (t: Throwable) { /* fall through */ }
            try { ctx.startService(i) } catch (t2: Throwable) { /* ignore */ }
        }

        fun stop(ctx: Context) {
            try {
                ctx.stopService(Intent(ctx, FocusService::class.java))
            } catch (t: Throwable) { /* ignore */ }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var blockedPkg: String? = null

    private val tick = object : Runnable {
        override fun run() {
            try { step() } catch (t: Throwable) { /* service kabhi na mare */ }
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
        try {
            startForeground(NOTIF_ID, notif("Focus Shield chalu hai"))
        } catch (t: Throwable) {
            /* notification na ban payi (channel/post blocked) → service ko
               marne do, warna system ForegroundServiceDidNotStart crash deta hai */
            try { stopSelf() } catch (t2: Throwable) { }
            return
        }
        handler.post(tick)
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    /* ---------- notification ---------- */
    private fun createChannel() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(CH, "Focus Shield", NotificationManager.IMPORTANCE_LOW)
            ch.description = "App-blocking ki live status"
            nm.createNotificationChannel(ch)
        } catch (t: Throwable) { /* ignore */ }
    }

    private fun notif(text: String): Notification =
        Notification.Builder(this, CH)
            .setContentTitle("Achiva Focus Shield")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)
            .build()

    private fun updateNotif(text: String) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, notif(text))
        } catch (t: Throwable) { /* ignore */ }
    }

    /* ---------- foreground package (UsageEvents se) ---------- */
    private fun foregroundPkg(): String? {
        try {
            val usm = getSystemService("usagestats") as UsageStatsManager
            val now = System.currentTimeMillis()
            val events = usm.queryEvents(now - 60_000L, now + 1_000L)
            var last: String? = null
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) last = e.packageName
            }
            return last
        } catch (t: Throwable) {
            return null
        }
    }

    /* ---------- main loop ---------- */
    private fun step() {
        val pkg = foregroundPkg() ?: return
        if (pkg == packageName) { blockedPkg = null; return }

        val rule = FocusRules.blockingRule(this, pkg)
        if (rule != null) {
            blockedPkg = pkg
            openOverlay(pkg, rule.optString("name", "Focus"))
            goHome()
            updateNotif("Block kiya: " + labelOf(pkg))
        } else if (blockedPkg != null) {
            blockedPkg = null
            updateNotif("Focus Shield chalu hai")
        }
    }

    private fun openOverlay(pkg: String, ruleName: String) {
        try {
            val i = Intent(this, BlockOverlayActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            i.putExtra("pkg", pkg)
            i.putExtra("rule", ruleName)
            startActivity(i)
        } catch (t: Throwable) { /* ignore */ }
    }

    private fun goHome() {
        try {
            val h = Intent(Intent.ACTION_MAIN)
            h.addCategory(Intent.CATEGORY_HOME)
            h.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(h)
        } catch (t: Throwable) { /* ignore */ }
    }

    private fun labelOf(pkg: String): String {
        return try {
            val pm = packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        } catch (t: Throwable) { pkg }
    }
}
