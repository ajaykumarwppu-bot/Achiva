package com.achiva.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock

/**
 * Study Timer — foreground service.
 * Background mein bhi timer chalta rahe (SystemClock elapsedRealtime
 * par based, isliye doze/throttle se nahi todta) aur notification
 * mein live countdown / elapsed time dikhe.
 *
 * Countdown khatam → ALARM mode :
 *   - looping alarm tone (MediaPlayer, USAGE_ALARM)
 *   - partial WakeLock (phone soya na rahe)
 *   - AlarmActivity ko FULL-SCREEN intent se kholo (lock-screen par bhi)
 *   - service khud ko stop NAHI karti jab tak user Save/Extend na kare
 */
class TimerService : Service() {

    companion object {
        var mode: String = "stopw"        // "count" | "stopw"
        var running: Boolean = false
        var finished: Boolean = false
        var countdownMs: Long = 0L
        var baseMs: Long = 0L             // accumulated (paused) time
        var startElapsed: Long = 0L
        var startEpoch: Long = 0L

        /* alarm state + pending completed session (save ke liye) */
        var alarmActive: Boolean = false
        var pendingElapsedMs: Long = 0L
        var pendingStartEpochMs: Long = 0L
        var pendingSessionId: String = ""     // TIMER-FIX: web wali session id (dedupe)

        /* TIMER-FIX: abhi chal rahi session ki web-generated id
           (Bridge.timerSetSession se aati hai; statusJson mein wapas jaati hai) */
        private var sessionId: String = ""
        fun setSessionId(id: String?) {
            sessionId = (id ?: "").filter { it.isLetterOrDigit() }.take(40)
        }

        /* TIMER-FIX (Bug A5): session ka state SharedPreferences mein bhi —
           process mar jaye (swipe-kill / system kill) to bhi completed ya
           overdue session agli app-launch par web reconcile se save ho jaye. */
        private const val PREFS = "achiva_timer"
        fun persistSession(ctx: Context) {
            try {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString("mode", mode)
                    .putLong("countdownMs", countdownMs)
                    .putLong("startEpochMs", startEpoch)
                    .putString("sessionId", sessionId)
                    .putBoolean("finished", finished)
                    .putLong("elapsedMs", if (finished) pendingElapsedMs else -1L)
                    .apply()
            } catch (_: Throwable) { }
        }

        fun clearPending(ctx: Context) {
            pendingElapsedMs = 0L
            pendingStartEpochMs = 0L
            pendingSessionId = ""
            try {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
            } catch (_: Throwable) { }
        }

        /**
         * Web reconcile (Bridge.timerPendingSession) ke liye:
         * completed session ya process-death ke baad OVERDUE countdown —
         * dono {elapsedMs, startEpochMs, sessionId} JSON mein; warna "".
         */
        fun pendingJson(ctx: Context): String {
            try {
                val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val startEp = p.getLong("startEpochMs", 0L)
                if (startEp <= 0L) return ""
                val sid = p.getString("sessionId", "") ?: ""
                if (p.getBoolean("finished", false)) {
                    val e = p.getLong("elapsedMs", 0L)
                    return if (e >= 1000L)
                        "{\"elapsedMs\":$e,\"startEpochMs\":$startEp,\"sessionId\":\"$sid\"}"
                    else ""
                }
                val modeS = p.getString("mode", "stopw") ?: "stopw"
                val cd = p.getLong("countdownMs", 0L)
                if (modeS == "count" && cd > 0L) {
                    /* service/process mar gaya tha; wall-clock se overdue check */
                    if (System.currentTimeMillis() - startEp >= cd) {
                        return "{\"elapsedMs\":$cd,\"startEpochMs\":$startEp,\"sessionId\":\"$sid\"}"
                    }
                }
                return ""
            } catch (_: Throwable) { return "" }
        }

        private var player: MediaPlayer? = null
        private var wake: PowerManager.WakeLock? = null

        fun elapsedNow(): Long =
            baseMs + (if (running) SystemClock.elapsedRealtime() - startElapsed else 0L)

        fun remainingNow(): Long =
            if (mode == "count") maxOf(0L, countdownMs - elapsedNow()) else 0L

        fun statusJson(): String =
            "{\"running\":$running,\"mode\":\"$mode\",\"elapsedMs\":${elapsedNow()}," +
            "\"remainingMs\":${remainingNow()},\"finished\":$finished," +
            "\"alarmActive\":$alarmActive,\"startEpochMs\":$startEpoch," +
            "\"countdownMs\":$countdownMs,\"sessionId\":\"$sessionId\"}"

        fun start(ctx: Context, countdown: Long) {
            stopAlarm(ctx)                     // purana alarm ho to band
            mode = if (countdown > 0) "count" else "stopw"
            countdownMs = countdown
            baseMs = 0L
            startElapsed = SystemClock.elapsedRealtime()
            startEpoch = System.currentTimeMillis()
            running = true
            finished = false
            alarmActive = false
            sessionId = ""                     // web timerSetSession se nayi id bhejegi
            pendingElapsedMs = 0L
            pendingStartEpochMs = 0L
            pendingSessionId = ""
            persistSession(ctx)                // TIMER-FIX: process-death recovery
            try {
                ctx.startForegroundService(Intent(ctx, TimerService::class.java))
            } catch (_: Throwable) {
                try { ctx.startService(Intent(ctx, TimerService::class.java)) } catch (_: Throwable) {}
            }
        }

        fun pause() {
            if (running) { baseMs = elapsedNow(); running = false }
        }

        fun resume() {
            if (!running && !finished) {
                startElapsed = SystemClock.elapsedRealtime()
                running = true
            }
        }

        fun stopAll() {
            running = false
            finished = false
            baseMs = 0L
            countdownMs = 0L
        }

        /* ---------- alarm (tone + wake + full-screen) ---------- */
        fun startAlarm(ctx: Context) {
            if (alarmActive) return
            alarmActive = true
            /* looping alarm tone */
            try {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val mp = MediaPlayer()
                mp.setDataSource(ctx, uri)
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                mp.isLooping = true
                mp.prepare()
                mp.start()
                player = mp
            } catch (_: Throwable) { }
            /* phone soya na rahe */
            try {
                val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
                val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "achiva:timer-alarm")
                wl.acquire(10 * 60 * 1000L)     // max 10 min safety
                wake = wl
            } catch (_: Throwable) { }
            /* full-screen alarm activity — app foreground mein ho tabhi
               startActivity chalta hai. TIMER-FIX (Bug A1): Android 10+
               background se startActivity BLOCK kar deta hai, isliye neeche
               FULL-SCREEN-INTENT notification bhi diya gaya hai — screen
               band/locked par bhi system AlarmActivity kholega. */
            try {
                val intent = Intent(ctx, AlarmActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                ctx.startActivity(intent)
            } catch (_: Throwable) { }
            /* high-importance done notification + FULL-SCREEN INTENT */
            try {
                val fsi = PendingIntent.getActivity(
                    ctx, 1,
                    Intent(ctx, AlarmActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
                val notif = Notification.Builder(ctx, "achiva_timer_done")
                    .setContentTitle("Achiva Timer")
                    .setContentText("Time poora! Save ya Extend karein.")
                    .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                    .setCategory(Notification.CATEGORY_ALARM)
                    .setFullScreenIntent(fsi, true)
                    .setContentIntent(fsi)
                    .setAutoCancel(true)
                    .build()
                val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(102, notif)
            } catch (_: Throwable) { }
        }

        fun stopAlarm(ctx: Context) {
            if (!alarmActive && player == null) { alarmActive = false; return }
            alarmActive = false
            try { player?.stop(); player?.release(); } catch (_: Throwable) { }
            player = null
            try { wake?.let { if (it.isHeld) it.release() } } catch (_: Throwable) { }
            wake = null
            try {
                val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(102)
            } catch (_: Throwable) { }
        }

        /* completed session save ho chuka ho ya ho raha ho; naya countdown shuru */
        fun extend(ctx: Context, ms: Long) {
            stopAlarm(ctx)
            start(ctx, ms)
        }

        /* sab band */
        fun saveAndStop(ctx: Context) {
            stopAlarm(ctx)
            stopAll()
            try { ctx.stopService(Intent(ctx, TimerService::class.java)) } catch (_: Throwable) { }
        }

        private fun buildStaticNotif(ctx: Context, text: String, channel: String, ongoing: Boolean): Notification {
            val pi = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            return Notification.Builder(ctx, channel)
                .setContentTitle("Achiva Timer")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentIntent(pi)
                .setOngoing(ongoing)
                .build()
        }
    }

    private val handler = Handler(Looper.getMainLooper())

    private val tick = object : Runnable {
        override fun run() {
            if (mode == "count" && running && remainingNow() <= 0L) {
                running = false
                finished = true
                pendingElapsedMs = elapsedNow()
                pendingStartEpochMs = startEpoch
                pendingSessionId = sessionId           // TIMER-FIX: web wali id
                updateNotification()
                persistSession(this@TimerService)      // TIMER-FIX: process-death recovery
                startAlarm(this@TimerService)     // tone + wake + full-screen; stopSelf NAHI
                return                              // tick band (alarm chal raha hai)
            }
            updateNotification()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onBind(p0: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannels()
        try {
            val n = buildNotif(currentText(), "achiva_timer", true)
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(101, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(101, n)
            }
        } catch (_: Throwable) { }
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        stopAlarm(this)
        super.onDestroy()
    }

    private fun createChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel("achiva_timer", "Study Timer", NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel("achiva_timer_done", "Timer Complete", NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun buildNotif(text: String, channel: String, ongoing: Boolean): Notification =
        buildStaticNotif(this, text, channel, ongoing)

    private fun currentText(): String =
        if (alarmActive) "Time poora! Save ya Extend karein."
        else if (mode == "count") "Countdown : " + fmt(remainingNow())
        else "Study running : " + fmt(elapsedNow())

    private fun fmt(ms: Long): String {
        val t = ms / 1000
        val h = t / 3600
        val m = (t % 3600) / 60
        val s = t % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s)
        else String.format("%02d:%02d", m, s)
    }

    private fun updateNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(101, buildNotif(currentText(), "achiva_timer", true))
        } catch (_: Throwable) { }
    }
}
