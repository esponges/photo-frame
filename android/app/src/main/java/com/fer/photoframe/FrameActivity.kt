package com.fer.photoframe

import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Drawable
import android.os.BatteryManager
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil.imageLoader
import coil.request.ImageRequest
import com.fer.photoframe.databinding.ActivityFrameBinding
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class FrameActivity : AppCompatActivity() {

    private lateinit var binding: ActivityFrameBinding
    private lateinit var app: FrameApp
    private lateinit var playlist: Playlist

    private var settings = Settings()
    /** Which of the two ImageViews is currently on top and visible. */
    private var showingA = true
    private var skipRequested = false

    /** A fast horizontal swipe anywhere on the screen skips to the next item. */
    private val swipeToNext by lazy {
        GestureDetector(
            this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                    val start = e1 ?: return false
                    val dx = e2.x - start.x
                    val dy = e2.y - start.y
                    val horizontal = abs(dx) >= SWIPE_MIN_DISTANCE_PX && abs(dx) > abs(dy) * 1.5f
                    if (!horizontal || abs(vx) < SWIPE_MIN_VELOCITY) return false
                    Log.i(TAG, "swipe: next")
                    skipRequested = true
                    return true
                }
            },
        )
    }
    private var loopJob: Job? = null

    private val dateFormat = SimpleDateFormat("EEEE d MMMM", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        app = application as FrameApp
        binding = ActivityFrameBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (BuildConfig.FRAME_BASE_URL.isBlank()) {
            showStatus("No FRAME_BASE_URL baked in.\nSee android/local.properties.")
            return
        }

        // The scheduled wake (KEYCODE_WAKEUP) brings the keyguard up over whatever was
        // showing. These flags put the frame above it and dismiss a non-secure one, so
        // the 07:00 wake lands on a photo instead of a lock screen.
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
        )
        goImmersive()

        settings = app.prefs.settings
        playlist = Playlist(app.prefs).apply { restore() }

        Schedule.apply(this, settings)
        SyncWorker.enqueue(this)

        startLoop()
        startPolling()
    }

    override fun onResume() {
        super.onResume()
        goImmersive()
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        swipeToNext.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    /** Sticky immersive: no status bar, no nav bar, and it comes back after a stray tap. */
    @Suppress("DEPRECATION")
    private fun goImmersive() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_FULLSCREEN
    }

    // ---------------------------------------------------------------- main loop

    private fun startLoop() {
        loopJob?.cancel()
        loopJob = lifecycleScope.launch {
            // Pull the manifest once up front so a fresh install has something to
            // show without waiting for the 30-minute worker.
            refreshManifest()

            if (playlist.size == 0) {
                showStatus("No photos yet.\nAdd some to the Drive folder.")
            }

            while (isActive) {
                val item = playlist.current() ?: playlist.advance()
                if (item == null) {
                    delay(30_000)
                    refreshManifest()
                    continue
                }

                hideStatus()
                val t0 = SystemClock.elapsedRealtime()
                val shown = show(item)
                Log.i(TAG, "item ${item.id.take(6)} ${item.kind} shown=$shown show=${SystemClock.elapsedRealtime() - t0}ms")
                // Not awaited: the first call after the network drops waits out the 30s
                // read timeout on a dead pooled socket, which would stall the next photo.
                lifecycleScope.launch { heartbeat(item) }

                // A video advances when it ends; a photo after the interval.
                val dwellMs = if (shown && item.isVideo) {
                    (item.durationMs ?: 15_000L).coerceAtMost(120_000L)
                } else {
                    settings.intervalSec * 1000L
                }

                waitOrSkip(if (shown) dwellMs else 0L)
                playlist.advance()
            }
        }
    }

    /** Sleeps in short slices so a skip command lands quickly. */
    private suspend fun waitOrSkip(ms: Long) {
        var waited = 0L
        while (waited < ms) {
            if (skipRequested) {
                skipRequested = false
                return
            }
            delay(250)
            waited += 250
        }
    }

    // ------------------------------------------------------------------ display

    /** Returns false when the item could not be displayed and should be skipped. */
    private suspend fun show(item: Item): Boolean {
        return if (item.isVideo) showVideo(item) else { showPhoto(item); true }
    }

    private suspend fun showPhoto(item: Item) {
        binding.video.visibility = View.GONE

        val incoming: ImageView = if (showingA) binding.photoB else binding.photoA
        val outgoing: ImageView = if (showingA) binding.photoA else binding.photoB

        val drawable = load(app.api.mediaUrl(item))
        if (drawable == null) {
            Log.w(TAG, "could not load ${item.id}")
            return
        }
        incoming.setImageDrawable(drawable)

        // Landscape photos letterbox on a portrait screen, so fill the gap with the
        // tiny blurred backdrop stretched up. No on-device blur needed.
        if (item.needsBackdrop) {
            load(app.api.backdropUrl(item))?.let { binding.backdrop.setImageDrawable(it) }
            binding.backdrop.visibility = View.VISIBLE
        } else {
            binding.backdrop.visibility = View.INVISIBLE
        }

        setCaption(item)

        val ms = settings.transitionMs.toLong()
        incoming.animate().alpha(1f).setDuration(ms).start()
        outgoing.animate().alpha(0f).setDuration(ms).start()
        showingA = !showingA

        if (settings.kenBurns) kenBurns(incoming, settings.intervalSec * 1000L)

        // Prefetch exactly one ahead: at ~9MB per decoded bitmap, a deeper queue
        // would be reckless on 2GB of RAM.
        playlist.peekNext()?.let { next ->
            if (next.isVideo) lifecycleScope.launch { app.api.warmVideo(next) }
            else prefetch(app.api.mediaUrl(next))
        }
    }

    /** A very slow drift. Optional, because continuous animation can jank on an Adreno 320. */
    private fun kenBurns(view: ImageView, durationMs: Long) {
        view.scaleX = 1f
        view.scaleY = 1f
        view.animate()
            .scaleX(1.08f)
            .scaleY(1.08f)
            .setDuration(durationMs)
            .start()
    }

    private suspend fun showVideo(item: Item): Boolean {
        // The video view sits under the photos (see the layout), so the previous photo
        // stays up until the clip is confirmed playing; a clip that cannot play never
        // blanks the frame.
        binding.video.visibility = View.VISIBLE

        // Generous on purpose. The server may have to convert the clip first (a phone's
        // HEVC becomes H.264) when it has gone cold, and an MP4 with its index at the end
        // needs several sequential range requests (~1s each) before it can start. The
        // previous photo stays on screen while this runs, so waiting costs nothing
        // visible. 3s was measured to skip good clips.
        val started = withTimeoutOrNull(VIDEO_START_TIMEOUT_MS) {
            val ready = kotlinx.coroutines.CompletableDeferred<Boolean>()
            binding.video.setOnPreparedListener { mp ->
                mp.isLooping = false
                mp.setVolume(0f, 0f)
                ready.complete(true)
            }
            binding.video.setOnErrorListener { _, what, extra ->
                Log.w(TAG, "video ${item.id} failed: what=$what extra=$extra")
                ready.complete(false)
                true
            }
            binding.video.setVideoPath(app.api.videoUrl(item))
            binding.video.start()
            ready.await()
        }

        if (started != true) {
            binding.video.visibility = View.GONE
            return false
        }
        // Starting is not playing. This ROM ships a software HEVC decoder (FFmpeg), so a
        // 10-bit 1080p phone clip prepares without error and then sits at position 0 on
        // black ("buffer low, pausing") for its whole length. Require the position to
        // actually move, and skip the clip if it does not.
        val advancing = withTimeoutOrNull(VIDEO_PROGRESS_TIMEOUT_MS) {
            while (binding.video.currentPosition < MIN_VIDEO_PROGRESS_MS) delay(200)
            true
        }
        if (advancing != true) {
            Log.w(TAG, "video ${item.id.take(6)} prepared but is not advancing; skipping")
            binding.video.stopPlayback()
            binding.video.visibility = View.GONE
            return false
        }

        setCaption(item)
        binding.backdrop.visibility = View.INVISIBLE
        binding.photoA.animate().alpha(0f).setDuration(300).start()
        binding.photoB.animate().alpha(0f).setDuration(300).start()
        return true
    }

    private fun setCaption(item: Item) {
        binding.caption.visibility =
            if (settings.showCaption && item.caption.isNotBlank()) View.VISIBLE else View.GONE
        binding.caption.text = item.caption

        binding.date.visibility = if (settings.showDate) View.VISIBLE else View.GONE
        binding.date.text = dateFormat.format(Date())
    }

    private suspend fun load(url: String): Drawable? {
        val req = ImageRequest.Builder(this).data(url).build()
        return imageLoader.execute(req).drawable
    }

    private fun prefetch(url: String) {
        imageLoader.enqueue(ImageRequest.Builder(this).data(url).build())
    }

    // ---------------------------------------------------------------- backend

    private suspend fun refreshManifest() {
        val manifest = app.api.manifest() ?: return
        // The poll loop only reschedules when its incoming settings differ from
        // `settings`, so a change absorbed here must reschedule itself.
        val settingsChanged = manifest.settings != settings
        settings = manifest.settings
        app.prefs.settings = manifest.settings
        if (settingsChanged) Schedule.apply(this, manifest.settings)
        if (manifest.version != app.prefs.manifestVersion) {
            app.prefs.manifestVersion = manifest.version
            playlist.update(manifest.items)
        }
    }

    /** Polls for admin commands and settings changes every 10s. */
    private fun startPolling() {
        lifecycleScope.launch {
            while (isActive) {
                delay(10_000)
                val result = app.api.poll() ?: continue
                val (commands, newSettings) = result

                if (newSettings != settings) {
                    settings = newSettings
                    app.prefs.settings = newSettings
                    Schedule.apply(this@FrameActivity, newSettings)
                }

                for (cmd in commands) {
                    Log.i(TAG, "command: $cmd")
                    when (cmd) {
                        "skip" -> skipRequested = true
                        "resync" -> { refreshManifest(); skipRequested = true }
                        "reload" -> { startLoop(); }
                    }
                }
            }
        }
    }

    private suspend fun heartbeat(item: Item) {
        val level = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        app.api.heartbeat(item.id, level, BuildConfig.VERSION_NAME)
    }

    // ----------------------------------------------------------------- status

    private fun showStatus(text: String) {
        binding.status.visibility = View.VISIBLE
        binding.status.text = text
    }

    private fun hideStatus() {
        binding.status.visibility = View.GONE
    }

    private companion object {
        const val TAG = "PhotoFrame"
        const val VIDEO_START_TIMEOUT_MS = 45_000L
        const val VIDEO_PROGRESS_TIMEOUT_MS = 4_000L
        const val MIN_VIDEO_PROGRESS_MS = 300
        const val SWIPE_MIN_DISTANCE_PX = 150f
        const val SWIPE_MIN_VELOCITY = 600f
    }
}
