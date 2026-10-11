package com.fer.photoframe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Relaunches the frame after a reboot or a power cut. Starting an activity from a
 * boot receiver is allowed here: the background-activity-launch restrictions only
 * arrived in Android 10, and this device is on 7.1.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val app = context.applicationContext as FrameApp
        Schedule.apply(context, app.prefs.settings)
        SyncWorker.enqueue(context)
        context.startActivity(
            Intent(context, FrameActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
