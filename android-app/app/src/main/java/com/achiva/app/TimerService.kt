package com.achiva.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock

/**
 * Study Timer — foreground service.
 * Background mein bhi timer chalta rahe (SystemClock elapsedRealtime
 * par based, isliye doze/throttle se nahi todta) aur notification
 * mein live countdown / elapsed time dikhe.
 * Countdown khatam → alag "time poora" notification.
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

        fun elapsedNow(): Long =
            baseMs + (if (running) SystemClock.elapsedRealtime() - startElapsed else 0L)

        fun remainingNow(): Long =
            if (mode == "count") maxOf(0L, countdownMs - elapsedNow()) else 0L

        fun statusJson(): String =
            "{\"running\":$running,\"mode\":\"$mode\",\"elapsedMs\":${elapsedNow()}," +
            "\"remainingMs\":${remainingNow()},\"finished\":$finished,\"startEpochMs\":$startEpoch}"

        fun start(ctx: Context, countdown: Long) {
            mode = if (countdown > 0) "count" else "stopw"
            countdownMs = countdown
            baseMs = 0L
            startElapsed = SystemClock.elapsedRealtime()
            startEpoch = System.currentTimeMillis()
            running = true
            finished = false
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
    }

    private val handler = Handler(Looper.getMainLooper())

    private val tick = object : Runnable {
        override fun run() {
            if (mode == "count" && running && remainingNow() <= 0L) {
                running = false
                finished = true
                updateNotification()
                showDoneNotification()
                stopSelf()
                return
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

    private fun buildNotif(text: String, channel: String, ongoing: Boolean): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Builder(this, channel)
            .setContentTitle("Achiva Timer")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentIntent(pi)
            .setOngoing(ongoing)
            .build()
    }

    private fun currentText(): String =
        if (mode == "count") "Countdown : " + fmt(remainingNow())
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

    private fun showDoneNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(102, buildNotif(
                "Time poora ho chuka hai! Session complete.", "achiva_timer_done", false))
        } catch (_: Throwable) { }
    }
}
