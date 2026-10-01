package com.achiva.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import org.json.JSONObject

/**
 * FOCUS SHIELD ka full-screen lock overlay.
 *
 * • BACK button dead hai ; recents se hidden (manifest excludeFromRecents)
 * • Har 1 sec mein check : rule abhi bhi active hai? nahi → khud finish
 * • HOME/recents se nikalne par khud finish → zombie task nahi banta ;
 *   blocked app dobara khulte hi FocusService naya overlay khol deta hai
 * • Do nikalne ke raaste :
 *     [Achiva kholo]        → MainActivity (padhai ki taraf)
 *     [Emergency unlock]    → settings.cooldownMin tak sab rules OFF
 *                              (state.unlockUntil) + attempt log
 * • Target progress web ke push kiye state (studyMinutes/targetMinutes) se
 */
class BlockOverlayActivity : Activity() {

    companion object {
        /* lock screen abhi screen par hai? FocusService isi se decide karta hai
           ki dobara launch karna hai ya nahi (relaunch loop se bachne ke liye) */
        @Volatile var showing = false
            private set
    }

    private val handler = Handler(Looper.getMainLooper())
    private var pkg: String = ""
    private var rule: String = "Focus"

    private val poll = object : Runnable {
        override fun run() {
            try {
                if (FocusRules.blockingRule(this@BlockOverlayActivity, pkg) == null) {
                    finish()
                    return
                }
                paint()
            } catch (t: Throwable) { /* ignore */ }
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setContentView(R.layout.activity_block_overlay)

        val btnOpen = findViewById<Button>(R.id.btnOpen)
        val btnUnlock = findViewById<Button>(R.id.btnUnlock)

        btnOpen.setOnClickListener {
            try {
                val i = Intent(this, MainActivity::class.java)
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(i)
            } catch (t: Throwable) { /* ignore */ }
            finish()
        }
        btnUnlock.setOnClickListener { tryUnlock() }

        readIntent(intent)
        paint()
        handler.post(poll)
    }

    /* singleInstance launch-mode : dobara block par wahi instance aata hai aur
       naya intent onNewIntent mein milta hai — warna purani app ka naam dikhta
       rehta (aur progress bhi stale rehti). */
    override fun onNewIntent(i: Intent?) {
        super.onNewIntent(i)
        try {
            setIntent(i)
            readIntent(i)
            paint()
        } catch (t: Throwable) { /* ignore */ }
    }

    private fun readIntent(i: Intent?) {
        pkg = i?.getStringExtra("pkg") ?: pkg
        rule = i?.getStringExtra("rule") ?: rule
    }

    /* labels + progress + unlock button ek saath (onCreate, onNewIntent, poll) */
    private fun paint() {
        val tvApp = findViewById<TextView>(R.id.tvApp)
        val tvRule = findViewById<TextView>(R.id.tvRule)
        val tvProg = findViewById<TextView>(R.id.tvProg)
        if (tvApp == null || tvRule == null || tvProg == null) return

        tvApp.text = labelOf(pkg)
        tvRule.text = rule

        try {
            val st = JSONObject(FocusPrefs.state(this))
            val mins = st.optDouble("studyMinutes", 0.0)
            val target = st.optDouble("targetMinutes", 60.0)
            val done = st.optBoolean("targetDone", false)
            tvProg.text = if (done) "Aaj ka study target poora ✅"
            else "Aaj ki padhai: " + fmt(mins) + " / " + fmt(target) + " min"
        } catch (t: Throwable) { tvProg.text = "" }

        paintUnlockBtn()
    }

    override fun onResume() {
        super.onResume()
        showing = true
    }

    /* user HOME / recents se nikal gaya → ye task zombie na bane, khud band ho
       jaao. Blocked app dobara khulte hi FocusService naya overlay khol dega. */
    override fun onPause() {
        showing = false
        super.onPause()
        try { finish() } catch (t: Throwable) { /* ignore */ }
    }

    private fun fmt(d: Double): String {
        val m = Math.round(d).toInt()
        return if (m >= 60) (m / 60).toString() + "h " + (m % 60).toString() + "m"
        else m.toString() + "m"
    }

    private fun state(): JSONObject =
        try { JSONObject(FocusPrefs.state(this)) } catch (t: Throwable) { JSONObject() }

    private fun tryUnlock() {
        val s = try { JSONObject(FocusPrefs.settings(this)) } catch (t: Throwable) { JSONObject() }
        val cool = s.optInt("cooldownMin", 5) * 60_000L
        val st = state()
        val now = System.currentTimeMillis()
        if (st.optLong("unlockUntil", 0L) > now) return      /* cooldown chal raha */
        st.put("unlockUntil", now + cool)
        st.put("unlockCount", st.optInt("unlockCount", 0) + 1)
        st.put("lastUnlockAt", now)
        st.put("lastUnlockPkg", pkg)
        FocusPrefs.setState(this, st.toString())
        finish()
    }

    private fun paintUnlockBtn() {
        val btn = findViewById<Button>(R.id.btnUnlock)
        val left = state().optLong("unlockUntil", 0L) - System.currentTimeMillis()
        if (left > 0) {
            btn.text = "Emergency unlock (" + (left / 60000L + 1).toString() + " min baad)"
            btn.isEnabled = false
        } else {
            btn.text = "Emergency unlock (log hoga)"
            btn.isEnabled = true
        }
    }

    private fun labelOf(p: String): String {
        return try {
            val pm = packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(p, 0)).toString()
        } catch (t: Throwable) { p }
    }

    override fun onBackPressed() { /* jaan-boojh kar dead */ }

    override fun onDestroy() {
        showing = false
        handler.removeCallbacks(poll)
        super.onDestroy()
    }
}
