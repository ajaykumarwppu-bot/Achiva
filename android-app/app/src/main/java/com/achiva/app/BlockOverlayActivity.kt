package com.achiva.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
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
 *
 * STRICTNESS LEVELS (settings.strictLevel — web focus-store se aata hai):
 *   normal : [Emergency unlock] ek tap → cooldownMin tak sab rules OFF + log
 *   strict : [Emergency unlock] sirf 5 SECOND LONG-PRESS se khulta hai
 *            (countdown button par dikhta hai) + cooldown 2× + log
 *   ultra  : Emergency unlock button hi NAHI. Sirf do raaste:
 *            [Achiva kholo] (padhai) ya [Back] (blocked app band → HOME).
 *            Rule OFF / mode change sirf Settings se (web-side logged).
 *
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

    /* ---------- STRICT-mode LONG-PRESS unlock (5 second) ---------- */
    private val lpHandler = Handler(Looper.getMainLooper())
    private var lpActive = false
    private var lpStart = 0L
    private val LP_MS = 5000L
    private val lpTick = object : Runnable {
        override fun run() {
            if (!lpActive) return
            val btn = findViewById<Button>(R.id.btnUnlock) ?: return
            val left = LP_MS - (System.currentTimeMillis() - lpStart)
            if (left <= 0) {
                lpActive = false
                tryUnlock()          /* 5 sec poore → unlock (cooldown 2×) */
                paintUnlockBtn()
                return
            }
            btn.text = "Daba ke rakho… " +
                String.format(java.util.Locale.US, "%.1f", left / 1000.0) + "s"
            lpHandler.postDelayed(this, 100)
        }
    }
    private fun cancelLongPress() {
        lpActive = false
        lpHandler.removeCallbacks(lpTick)
    }

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
        val btnBack = findViewById<Button>(R.id.btnBack)

        btnOpen.setOnClickListener {
            try {
                val i = Intent(this, MainActivity::class.java)
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(i)
            } catch (t: Throwable) { /* ignore */ }
            finish()
        }

        /* ULTRA ka [Back] : blocked app band → HOME. Overlay finish;
           blocked app dobara kholi to FocusService phir block karega. */
        btnBack?.setOnClickListener {
            try {
                val h = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                h.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(h)
            } catch (t: Throwable) { /* ignore */ }
            finish()
        }

        /* Unlock : normal = ek tap; strict = 5-sec LONG-PRESS (touch
           listener click ko consume kar leta hai, countdown dikhta hai) */
        btnUnlock.setOnClickListener {
            if (strictLevel() != "strict") tryUnlock()
        }
        btnUnlock.setOnTouchListener { v, ev ->
            if (strictLevel() != "strict") return@setOnTouchListener false  /* normal: click chale */
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (!(v as Button).isEnabled) return@setOnTouchListener false
                    cancelLongPress()
                    lpActive = true
                    lpStart = System.currentTimeMillis()
                    lpHandler.post(lpTick)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (lpActive) { cancelLongPress(); paintUnlockBtn() }
                    true
                }
                else -> false
            }
        }

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

        /* level-wise buttons :
           ultra  → unlock button GONE, [Back] VISIBLE (do hi raaste)
           normal/strict → unlock VISIBLE, [Back] GONE (pehle jaisa) */
        val btnU = findViewById<Button>(R.id.btnUnlock)
        val btnB = findViewById<Button>(R.id.btnBack)
        if (strictLevel() == "ultra") {
            btnU?.visibility = View.GONE
            btnB?.visibility = View.VISIBLE
        } else {
            btnU?.visibility = View.VISIBLE
            btnB?.visibility = View.GONE
            paintUnlockBtn()
        }
    }

    override fun onResume() {
        super.onResume()
        showing = true
    }

    /* user HOME / recents se nikal gaya → ye task zombie na bane, khud band ho
       jaao. Blocked app dobara khulte hi FocusService naya overlay khol dega. */
    override fun onPause() {
        showing = false
        cancelLongPress()
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

    private fun settingsObj(): JSONObject =
        try { JSONObject(FocusPrefs.settings(this)) } catch (t: Throwable) { JSONObject() }

    /* web (focus-store) se aaya level — unknown/missing = 'normal' (safe) */
    private fun strictLevel(): String {
        val v = settingsObj().optString("strictLevel", "normal")
        return if (v == "strict" || v == "ultra") v else "normal"
    }

    /* strict mein cooldown DOUBLE (web ab base value hi store karta hai) */
    private fun effectiveCooldownMin(): Int {
        val base = settingsObj().optInt("cooldownMin", 5)
        return if (strictLevel() == "strict") base * 2 else base
    }

    private fun tryUnlock() {
        /* ULTRA : overlay se unlock exist hi nahi karta (button GONE hai,
           ye guard uska double-safety hai) */
        if (strictLevel() == "ultra") return
        val st = state()
        val now = System.currentTimeMillis()
        if (st.optLong("unlockUntil", 0L) > now) return      /* cooldown chal raha */
        val cool = effectiveCooldownMin() * 60_000L
        st.put("unlockUntil", now + cool)
        st.put("unlockCount", st.optInt("unlockCount", 0) + 1)
        st.put("lastUnlockAt", now)
        st.put("lastUnlockPkg", pkg)
        st.put("lastUnlockLevel", strictLevel())             /* audit: kis level par toda */
        FocusPrefs.setState(this, st.toString())
        finish()
    }

    private fun paintUnlockBtn() {
        val btn = findViewById<Button>(R.id.btnUnlock) ?: return
        if (lpActive) return            /* long-press countdown text overwrite na ho */
        val left = state().optLong("unlockUntil", 0L) - System.currentTimeMillis()
        if (left > 0) {
            btn.text = "Emergency unlock (" + (left / 60000L + 1).toString() + " min baad)"
            btn.isEnabled = false
        } else {
            btn.text = if (strictLevel() == "strict")
                "Emergency unlock — 5 sec DABA KE RAKHO (log hoga)"
            else
                "Emergency unlock (log hoga)"
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
        cancelLongPress()
        handler.removeCallbacks(poll)
        super.onDestroy()
    }
}
