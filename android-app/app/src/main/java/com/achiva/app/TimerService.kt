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

        private var player: MediaPlayer? = null
        private var wake: PowerManager.WakeLock? = null

        fun elapsedNow(): Long =
            baseMs + (if (running) SystemClock.elapsedRealtime() - startElapsed else 0L)

        fun remainingNow(): Long =
            if (mode == "count") maxOf(0L, countdownMs - elapsedNow()) else 0L

        fun statusJson(): String =
            "{\"running\":$running,\"mode\":\"$mode\",\"elapsedMs\":${elapsedNow()}," +
            "\"remainingMs\":${remainingNow()},\"finished\":$finished," +
            "\"alarmActive\":$alarmActive,\"startEpochMs\":$startEpoch}"

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
            /* full-screen alarm activity (lock ke upar) */
            try {
                val intent = Intent(ctx, AlarmActivity::class.java)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                ctx.startActivity(intent)
            } catch (_: Throwable) { }
            /* high-importance done notification */
            try {
                val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(102, buildStaticNotif(ctx,
                    "Time poora! Session complete. Save ya Extend karein.", "achiva_timer_done", false))
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
                updateNotification()
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
