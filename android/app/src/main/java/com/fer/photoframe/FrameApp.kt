package com.fer.photoframe

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class FrameApp : Application(), ImageLoaderFactory {

    lateinit var http: OkHttpClient
        private set
    lateinit var api: Api
        private set
    lateinit var prefs: Prefs
        private set

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        http = OkHttpClient.Builder()
            .addInterceptor { chain ->
                // Every backend route except /api/health requires this.
                val req: Request = chain.request().newBuilder()
                    .header("Authorization", "Bearer ${BuildConfig.FRAME_TOKEN}")
                    .build()
                chain.proceed(req)
            }
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        api = Api(http, BuildConfig.FRAME_BASE_URL.trimEnd('/'))
    }

    /**
     * A few hundred photos at ~300KB fit comfortably in 200MB, so the whole library
     * ends up on disk and the frame keeps running through multi-day outages.
     *
     * The memory cache is deliberately tiny: a 1200x1920 ARGB_8888 bitmap is ~9MB,
     * and this device has 2GB total with no room to be careless.
     */
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient { http }
        .memoryCache { MemoryCache.Builder(this).maxSizeBytes(48 * 1024 * 1024).build() }
        .diskCache {
            DiskCache.Builder()
                .directory(cacheDir.resolve("image_cache"))
                .maxSizeBytes(200L * 1024 * 1024)
                .build()
        }
        .respectCacheHeaders(true)
        .build()
}
