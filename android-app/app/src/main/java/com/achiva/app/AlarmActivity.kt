package com.achiva.app

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen ALARM activity — jab study timer ka countdown khatam hota hai.
 * Lock-screen ke upar bhi khulti hai (manifest mein showWhenLocked/turnScreenOn).
 *
 * Buttons :
 *   [Stop & Save]  → completed session WebView (study log) mein save + alarm/service band
 *   [Extend +3m / +5m / +60m] aur custom minutes →
 *                    pehle completed session save, phir naya countdown shuru
 */
class AlarmActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        /* lock ke upar + screen on + keyguard ke bahar */
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val elapsed = TimerService.pendingElapsedMs
        val startEpoch = TimerService.pendingStartEpochMs

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(48, 64, 48, 48)
        root.setBackgroundColor(0xFF14181D.toInt())

        fun tv(text: String, size: Float, bold: Boolean, color: Int): TextView {
            val t = TextView(this)
            t.text = text
            t.textSize = size
            if (bold) t.paint.isFakeBoldText = true
            t.setTextColor(color)
            return t
        }

        root.addView(tv("⏰ Time khatam!", 30f, true, 0xFFFFFFFF.toInt()))
        root.addView(tv("Aapka study session complete ho gaya:", 15f, false, 0xFFB9C2CC.toInt()).also {
            it.setPadding(0, 12, 0, 0)
        })
        root.addView(tv(fmt(elapsed), 46f, true, 0xFF3FB950.toInt()).also { it.setPadding(0, 8, 0, 24) })

        fun btn(label: String, onClick: () -> Unit): Button {
            val b = Button(this)
            b.text = label
            b.setPadding(24, 28, 24, 28)
            b.setOnClickListener { onClick() }
            root.addView(b)
            return b
        }

        /* Stop & Save */
        btn("Stop & Save") {
            MainActivity.requestSave(elapsed, startEpoch)
            TimerService.saveAndStop(this)
            finish()
        }

        /* Extend presets */
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        listOf(3, 5, 60).forEach { m ->
            val b = Button(this)
            b.text = "+$m min"
            b.setOnClickListener { doExtend(elapsed, startEpoch, m.toLong() * 60000L) }
            row.addView(b)
        }
        root.addView(row)

        /* custom minutes */
        val inp = EditText(this)
        inp.hint = "custom minutes (e.g. 60)"
        inp.inputType = android.text.InputType.TYPE_CLASS_NUMBER
        root.addView(inp)
        btn("Extend custom") {
            val m = inp.text.toString().trim().toLongOrNull() ?: return@btn
            if (m < 1) return@btn
            doExtend(elapsed, startEpoch, m * 60000L)
        }

        setContentView(root)
    }

    private fun doExtend(elapsed: Long, startEpoch: Long, ms: Long) {
        /* pehle completed session save, phir naya countdown */
        MainActivity.requestSave(elapsed, startEpoch)
        TimerService.extend(this, ms)
        finish()
    }

    private fun fmt(ms: Long): String {
        val t = ms / 1000
        val h = t / 3600
        val m = (t % 3600) / 60
        val s = t % 60
        return if (h > 0) String.format("%dh %02dm", h, m) else String.format("%d min", m)
    }

    override fun onBackPressed() {
        /* alarm ko back se dismiss mat karo — user ko button chunna hoga */
    }
}
