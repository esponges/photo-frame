package com.fer.photoframe

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.Calendar

/**
 * Turns the screen on and off at the configured hours. A 2013 LCD run 24/7 ages
 * noticeably, and nobody wants a glowing rectangle in the living room at 3am.
 */
object Schedule {

    const val ACTION_ON = "com.fer.photoframe.SCREEN_ON"
    const val ACTION_OFF = "com.fer.photoframe.SCREEN_OFF"

    fun apply(context: Context, settings: Settings) {
        schedule(context, ACTION_ON, settings.onHour, 0)
        schedule(context, ACTION_OFF, settings.offHour, 1)
        // Bring the current state in line immediately, so saving settings in the
        // admin page doesn't wait until tomorrow to take effect.
        if (isWithinOnHours(settings)) {
            Root.screenOn()
            Root.setBrightness(settings.brightness)
            Root.disableScreenTimeout()
        } else {
            Root.screenOff()
        }
    }

    /** Handles windows that wrap midnight, e.g. on=22 off=2. */
    fun isWithinOnHours(settings: Settings): Boolean {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val on = settings.onHour
        val off = settings.offHour
        return if (on == off) true
        else if (on < off) hour in on until off
        else hour >= on || hour < off
    }

    private fun schedule(context: Context, action: String, hour: Int, requestCode: Int) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, ScheduleReceiver::class.java).setAction(action)
        val pi = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val next = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        am.setRepeating(AlarmManager.RTC_WAKEUP, next.timeInMillis, AlarmManager.INTERVAL_DAY, pi)
        Log.i("PhotoFrame", "scheduled $action at ${next.time}")
    }
}

class ScheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as FrameApp
        when (intent.action) {
            Schedule.ACTION_ON -> {
                Root.screenOn()
                Root.setBrightness(app.prefs.settings.brightness)
                Root.disableScreenTimeout()
            }
            Schedule.ACTION_OFF -> Root.screenOff()
        }
    }
}
