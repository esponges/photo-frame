package com.fer.photoframe

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Survives reboots so the frame resumes its shuffle rather than restarting it, and
 * so the last known manifest can drive playback before the network is up.
 */
class Prefs(context: Context) : PlaylistStore {
    private val sp = context.getSharedPreferences("frame", Context.MODE_PRIVATE)

    var manifestVersion: String
        get() = sp.getString("version", "") ?: ""
        set(v) = sp.edit().putString("version", v).apply()

    override var queue: List<String>
        get() {
            val raw = sp.getString("queue", null) ?: return emptyList()
            val arr = JSONArray(raw)
            return (0 until arr.length()).map { arr.getString(it) }
        }
        set(v) = sp.edit().putString("queue", JSONArray(v).toString()).apply()

    override var cursor: Int
        get() = sp.getInt("cursor", 0)
        set(v) = sp.edit().putInt("cursor", v).apply()

    /** Cached item list, so a cold start with no network still has something to show. */
    override var items: List<Item>
        get() {
            val raw = sp.getString("items", null) ?: return emptyList()
            val arr = JSONArray(raw)
            return (0 until arr.length()).map { Item.from(arr.getJSONObject(it)) }
        }
        set(v) {
            val arr = JSONArray()
            v.forEach {
                arr.put(
                    JSONObject()
                        .put("id", it.id)
                        .put("md5", it.md5)
                        .put("kind", it.kind)
                        .put("w", it.width)
                        .put("h", it.height)
                        .put("caption", it.caption)
                        .also { o -> it.durationMs?.let { d -> o.put("durationMs", d) } },
                )
            }
            sp.edit().putString("items", arr.toString()).apply()
        }

    var settings: Settings
        get() {
            val raw = sp.getString("settings", null) ?: return Settings()
            return Settings.from(JSONObject(raw))
        }
        set(v) {
            val o = JSONObject()
                .put("intervalSec", v.intervalSec)
                .put("transitionMs", v.transitionMs)
                .put("transition", v.transition)
                .put("onHour", v.onHour)
                .put("offHour", v.offHour)
                .put("brightness", v.brightness)
                .put("showCaption", v.showCaption)
                .put("showDate", v.showDate)
            sp.edit().putString("settings", o.toString()).apply()
        }
}
