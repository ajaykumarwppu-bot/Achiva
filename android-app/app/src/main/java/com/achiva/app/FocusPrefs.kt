package com.achiva.app

import android.content.Context
import android.content.SharedPreferences

/**
 * FOCUS SHIELD ki native-side storage (SharedPreferences).
 * Web (focus-store.js) rules/settings/state yahan push karta hai taaki
 * FocusService WebView ke band hone par bhi kaam kare.
 *
 * 3 blobs (JSON strings) :
 *   rules    : [{id,name,apps[],mode,days[],start,end,timerMin,active}]
 *   settings : {cooldownMin, strict, bootStart, overlayText, alwaysAllow[]}
 *   state    : {targetDone, timerRunning, unlockUntil, studyMinutes}
 */
object FocusPrefs {

    private const val FILE = "achiva_focus_v1"
    private const val K_RULES = "rules_json"
    private const val K_SETTINGS = "settings_json"
    private const val K_STATE = "state_json"

    private fun sp(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun rules(ctx: Context): String = sp(ctx).getString(K_RULES, "[]") ?: "[]"
    fun setRules(ctx: Context, json: String) {
        sp(ctx).edit().putString(K_RULES, json).apply()
    }

    fun settings(ctx: Context): String = sp(ctx).getString(K_SETTINGS, "{}") ?: "{}"
    fun setSettings(ctx: Context, json: String) {
        sp(ctx).edit().putString(K_SETTINGS, json).apply()
    }

    fun state(ctx: Context): String = sp(ctx).getString(K_STATE, "{}") ?: "{}"
    fun setState(ctx: Context, json: String) {
        sp(ctx).edit().putString(K_STATE, json).apply()
    }
}
