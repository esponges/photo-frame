package com.fer.photoframe

import android.util.Log

/**
 * Root shell helpers. The tablet is rooted, which is the only way to turn the
 * screen off on a schedule without becoming a device-admin app.
 */
object Root {

    fun run(command: String): Boolean = try {
        val p = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
        val code = p.waitFor()
        if (code != 0) Log.w(TAG, "su failed ($code): $command")
        code == 0
    } catch (e: Exception) {
        Log.w(TAG, "su unavailable: ${e.message}")
        false
    }

    /**
     * KEYCODE_SLEEP / KEYCODE_WAKEUP are used deliberately instead of KEYCODE_POWER
     * (26), which *toggles*: a missed or doubled event would leave the schedule
     * permanently inverted.
     */
    fun screenOff() = run("input keyevent 223")
    fun screenOn() = run("input keyevent 224")

    fun setBrightness(value: Int) =
        run("settings put system screen_brightness ${value.coerceIn(0, 255)}")

    /** Keeps the OS from dimming while the frame is meant to be visible. */
    fun disableScreenTimeout() = run("settings put system screen_off_timeout 2147483647")

    private const val TAG = "PhotoFrame"
}
