package com.fer.photoframe

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Thin wrapper over the backend. Uses org.json rather than a serialization library
 * to keep the APK small; the payloads are three objects.
 */
class Api(private val client: OkHttpClient, private val baseUrl: String) {

    fun mediaUrl(item: Item) = "$baseUrl/api/media/${item.id}/${item.md5}.jpg"
    fun backdropUrl(item: Item) = "$baseUrl/api/media/${item.id}/${item.md5}/backdrop.jpg"
    /**
     * VideoView on API 25 offers no public way to attach an Authorization header,
     * so this one route accepts the token as a query parameter instead.
     */
    fun videoUrl(item: Item) =
        "$baseUrl/api/video/${item.id}?token=${BuildConfig.FRAME_TOKEN}"

    suspend fun manifest(): Manifest? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url("$baseUrl/api/manifest").build()
            client.newCall(req).execute().use { res ->
                val body = res.body?.string()
                if (!res.isSuccessful || body == null) {
                    Log.w(TAG, "manifest HTTP ${res.code}: ${body?.take(200)}")
                    return@withContext null
                }
                val o = JSONObject(body)
                val arr: JSONArray = o.getJSONArray("items")
                Manifest(
                    version = o.getString("version"),
                    settings = Settings.from(o.getJSONObject("settings")),
                    items = (0 until arr.length()).map { Item.from(arr.getJSONObject(it)) },
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "manifest failed: ${e.message}")
            null
        }
    }

    /** Returns the drained commands and the current settings, or null when offline. */
    suspend fun poll(): Pair<List<String>, Settings>? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url("$baseUrl/api/commands").build()
            client.newCall(req).execute().use { res ->
                val body = res.body?.string() ?: return@withContext null
                if (!res.isSuccessful) return@withContext null
                val o = JSONObject(body)
                val arr = o.getJSONArray("commands")
                val cmds = (0 until arr.length()).map {
                    arr.getJSONObject(it).optString("type")
                }
                cmds to Settings.from(o.getJSONObject("settings"))
            }
        } catch (e: Exception) {
            Log.v(TAG, "poll failed: ${e.message}")
            null
        }
    }

    suspend fun heartbeat(itemId: String, battery: Int, version: String) =
        withContext(Dispatchers.IO) {
            try {
                val json = JSONObject()
                    .put("itemId", itemId)
                    .put("battery", battery)
                    .put("appVersion", version)
                    .toString()
                val req = Request.Builder()
                    .url("$baseUrl/api/heartbeat")
                    .post(json.toRequestBody(JSON))
                    .build()
                client.newCall(req).execute().close()
            } catch (e: Exception) {
                Log.v(TAG, "heartbeat failed: ${e.message}")
            }
        }

    /**
     * Asks the server for the first byte of a video so it converts and caches the clip
     * before it is shown. Videos are never cached on the device, so without this the
     * first play after the server went cold waits for the conversion.
     */
    suspend fun warmVideo(item: Item) = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url(videoUrl(item))
                .header("Range", "bytes=0-0")
                .build()
            // A cold server converts the clip before it answers (~30s), longer than the
            // client's usual 30s read timeout.
            client.newBuilder().readTimeout(90, TimeUnit.SECONDS).build()
                .newCall(req).execute().close()
        } catch (e: Exception) {
            Log.v(TAG, "video warm-up failed: ${e.message}")
        }
    }

    private companion object {
        const val TAG = "PhotoFrame"
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
