package com.achiva.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Phone ka REAL screen-time data — Android UsageStatsManager se.
 * Sirf ON-DEMAND query (jab web call kare) — koi background service nahi.
 * Conservative Kotlin : har version par compile ho.
 */
class UsagePlugin(private val ctx: Context) {

    // literal service name ("usagestats") : har SDK par compile hota hai,
    // constant-reference ke SDK issues se bachat
    private val usm =
        ctx.getSystemService("usagestats") as UsageStatsManager

    /** Usage-Access permission on hai? */
    fun hasPermission(): Boolean {
        try {
            val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            @Suppress("DEPRECATION")
            val mode = appOps.checkOpNoThrow(
                "android:get_usage_stats",
                Process.myUid(),
                ctx.packageName
            )
            return mode == 0   // 0 = MODE_ALLOWED
        } catch (t: Throwable) {
            return false
        }
    }

    /** Settings → Usage access screen kholo */
    fun openSettings() {
        try {
            val i = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        } catch (t: Throwable) {
            // ignore
        }
    }

    /** aaj ka poora usage JSON (crash-safe wrapper) */
    fun todayJson(): String {
        try {
            return buildJson()
        } catch (t: Throwable) {
            return JSONObject()
                .put("granted", false)
                .put("totalMs", 0)
                .put("apps", JSONArray())
                .toString()
        }
    }

    private fun buildJson(): String {
        val out = JSONObject()
        out.put("granted", hasPermission())
        if (!hasPermission()) {
            out.put("totalMs", 0)
            out.put("apps", JSONArray())
            return out.toString()
        }

        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        val dayStart = cal.timeInMillis
        val now = System.currentTimeMillis()

        val openAt = HashMap<String, Long>()
        val sessions = HashMap<String, MutableList<LongArray>>()

        val events = usm.queryEvents(dayStart, now)
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val pkg = e.packageName
            if (pkg == null) continue
            if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                openAt[pkg] = e.timeStamp
            } else if (e.eventType == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                val st = openAt.remove(pkg)
                if (st != null) {
                    var list = sessions[pkg]
                    if (list == null) {
                        list = mutableListOf()
                        sessions[pkg] = list
                    }
                    list.add(longArrayOf(st, e.timeStamp))
                }
            }
        }

        /* jo app abhi bhi khula hai */
        val openEntries = openAt.entries.toList()
        for (entry in openEntries) {
            var list = sessions[entry.key]
            if (list == null) {
                list = mutableListOf()
                sessions[entry.key] = list
            }
            list.add(longArrayOf(entry.value, now))
        }

        val pm = ctx.packageManager
        val listOut = mutableListOf<JSONObject>()
        var total = 0L

        val sessionEntries = sessions.entries.toList()
        for (entry in sessionEntries) {
            val pkg = entry.key
            val sorted = entry.value.sortedBy { it[0] }
            var tot = 0L
            val arr = JSONArray()
            for (s in sorted) {
                val dur = s[1] - s[0]
                if (dur <= 0L) continue
                tot += dur
                arr.put(JSONObject().put("startMs", s[0]).put("endMs", s[1]))
            }
            if (tot <= 0L) continue
            total += tot
            var name = pkg
            try {
                name = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (t: Throwable) {
                // package label nahi mila → package name hi rakho
            }
            listOut.add(
                JSONObject()
                    .put("pkg", pkg)
                    .put("name", name)
                    .put("totalMs", tot)
                    .put("sessions", arr)
            )
        }

        listOut.sortByDescending { it.getLong("totalMs") }
        val apps = JSONArray()
        for (o in listOut) {
            apps.put(o)
        }

        out.put("totalMs", total)
        out.put("apps", apps)
        return out.toString()
    }
}
