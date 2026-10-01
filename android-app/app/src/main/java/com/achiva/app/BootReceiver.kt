package com.achiva.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Reboot ke baad FocusService khud start karo (agar user ki setting ON hai).
 * settings.bootStart default true.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent?) {
        try {
            val a = intent?.action ?: return
            if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED) return
            val s = try { JSONObject(FocusPrefs.settings(ctx)) } catch (t: Throwable) { JSONObject() }
            if (s.optBoolean("bootStart", true)) FocusService.start(ctx)
        } catch (t: Throwable) { /* ignore */ }
    }
}
