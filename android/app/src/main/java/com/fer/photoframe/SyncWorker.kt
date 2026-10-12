package com.fer.photoframe

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import coil.imageLoader
import coil.request.ImageRequest
import java.util.concurrent.TimeUnit

/**
 * Keeps the on-disk cache warm so the frame is genuinely offline-first: with a few
 * hundred photos the entire library ends up cached, and the frame then survives a
 * dead router or a backend outage for as long as the power stays on.
 */
class SyncWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as FrameApp
        val manifest = app.api.manifest() ?: return Result.retry()

        app.prefs.settings = manifest.settings
        app.prefs.items = manifest.items
        app.prefs.manifestVersion = manifest.version
        Schedule.apply(applicationContext, manifest.settings)

        // Have the server convert and cache each video now, so the first play is quick.
        manifest.items.filter { it.isVideo }.forEach { app.api.warmVideo(it) }

        // Warm the disk cache. Videos are deliberately excluded: they stream and are
        // never cached, and pulling them would blow the cache budget.
        val loader = applicationContext.imageLoader
        for (item in manifest.items.filter { !it.isVideo }) {
            loader.execute(
                ImageRequest.Builder(applicationContext)
                    .data(app.api.mediaUrl(item))
                    .build(),
            )
            if (item.needsBackdrop) {
                loader.execute(
                    ImageRequest.Builder(applicationContext)
                        .data(app.api.backdropUrl(item))
                        .build(),
                )
            }
        }
        return Result.success()
    }

    companion object {
        private const val NAME = "frame-sync"

        fun enqueue(context: Context) {
            val work = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                work,
            )
        }
    }
}
