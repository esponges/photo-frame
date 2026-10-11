package com.fer.photoframe

import org.json.JSONObject

data class Item(
    val id: String,
    val md5: String,
    val kind: String,
    val width: Int,
    val height: Int,
    val caption: String,
    val durationMs: Long?,
) {
    val isVideo: Boolean get() = kind == "video"

    /** True when the photo is wider than the portrait screen and will letterbox. */
    val needsBackdrop: Boolean get() = width > 0 && height > 0 && width > height

    companion object {
        fun from(o: JSONObject) = Item(
            id = o.getString("id"),
            md5 = o.getString("md5"),
            kind = o.optString("kind", "photo"),
            width = o.optInt("w", 0),
            height = o.optInt("h", 0),
            caption = o.optString("caption", ""),
            durationMs = if (o.has("durationMs")) o.getLong("durationMs") else null,
        )
    }
}

data class Settings(
    val intervalSec: Int = 60,
    val transitionMs: Int = 1500,
    val transition: String = "crossfade",
    val onHour: Int = 7,
    val offHour: Int = 23,
    val brightness: Int = 160,
    val showCaption: Boolean = true,
    val showDate: Boolean = true,
) {
    val kenBurns: Boolean get() = transition == "kenburns"

    companion object {
        fun from(o: JSONObject) = Settings(
            intervalSec = o.optInt("intervalSec", 60).coerceIn(5, 3600),
            transitionMs = o.optInt("transitionMs", 1500).coerceIn(0, 10_000),
            transition = o.optString("transition", "crossfade"),
            onHour = o.optInt("onHour", 7).coerceIn(0, 23),
            offHour = o.optInt("offHour", 23).coerceIn(0, 23),
            brightness = o.optInt("brightness", 160).coerceIn(0, 255),
            showCaption = o.optBoolean("showCaption", true),
            showDate = o.optBoolean("showDate", true),
        )
    }
}

data class Manifest(val version: String, val settings: Settings, val items: List<Item>)
