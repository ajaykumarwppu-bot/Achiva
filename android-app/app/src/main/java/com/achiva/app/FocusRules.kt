package com.achiva.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * FOCUS SHIELD ka rule engine (pure logic, koi UI nahi).
 * Web-side focus-store.js ka MIRROR — dono same semantics rakhte hain
 * (tests web-side engine ko cover karte hain; native mirror hand-test).
 *
 * Rules :
 *   mode "time"   : start–end window (days repeat ke saath); midnight wrap
 *   mode "target" : jab tak aaj ka study-target poora NAHI hua
 *   mode "timer"  : jab tak study-timer chal raha hai
 *
 * Emergency unlock : state.unlockUntil (epoch ms) se pehle koi block nahi.
 * Days convention : 1=Sunday … 7=Saturday (Calendar.DAY_OF_WEEK jaisa).
 */
object FocusRules {

    class Eval(
        val nowMin: Int,
        val day: Int,
        val targetDone: Boolean,
        val timerRunning: Boolean,
        val nowMs: Long,
        val unlockUntil: Long
    )

    fun toMin(hhmm: String?): Int {
        val p = (hhmm ?: "00:00").split(":")
        val h = p.getOrNull(0)?.toIntOrNull() ?: 0
        val m = p.getOrNull(1)?.toIntOrNull() ?: 0
        return h * 60 + m
    }

    fun evalNow(ctx: Context): Eval {
        val st = try { JSONObject(FocusPrefs.state(ctx)) } catch (t: Throwable) { JSONObject() }
        val c = Calendar.getInstance()
        return Eval(
            nowMin = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE),
            day = c.get(Calendar.DAY_OF_WEEK),
            targetDone = st.optBoolean("targetDone", false),
            timerRunning = st.optBoolean("timerRunning", false),
            nowMs = System.currentTimeMillis(),
            unlockUntil = st.optLong("unlockUntil", 0L)
        )
    }

    /** ek rule abhi active hai ya nahi */
    fun isActive(r: JSONObject, e: Eval): Boolean {
        if (!r.optBoolean("active", true)) return false
        if (e.unlockUntil > e.nowMs) return false        /* emergency unlock window */

        val days = r.optJSONArray("days")
        if (days != null && days.length() > 0) {
            var hit = false
            for (i in 0 until days.length()) if (days.optInt(i) == e.day) hit = true
            if (!hit) return false
        }
        return when (r.optString("mode", "time")) {
            "time" -> {
                val s = toMin(r.optString("start"))
                val en = toMin(r.optString("end"))
                if (s <= en) (e.nowMin >= s && e.nowMin < en)
                else (e.nowMin >= s || e.nowMin < en)     /* midnight wrap */
            }
            "target" -> !e.targetDone
            "timer" -> e.timerRunning
            else -> false
        }
    }

    /** is package ko abhi block karne wala pehla rule (null agar koi nahi) */
    fun blockingRule(ctx: Context, pkg: String): JSONObject? {
        if (pkg.isEmpty()) return null
        val st = try { JSONObject(FocusPrefs.settings(ctx)) } catch (t: Throwable) { JSONObject() }
        val allow = st.optJSONArray("alwaysAllow")
        if (allow != null) {
            for (i in 0 until allow.length()) if (allow.optString(i) == pkg) return null
        }
        val e = evalNow(ctx)
        val arr = try { JSONArray(FocusPrefs.rules(ctx)) } catch (t: Throwable) { JSONArray() }
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (!isActive(r, e)) continue
            val apps = r.optJSONArray("apps") ?: continue
            for (j in 0 until apps.length()) if (apps.optString(j) == pkg) return r
        }
        return null
    }
}
