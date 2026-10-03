package com.financeally.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.List;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "Received broadcast action: " + action);

        if (action == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {

            // Ensure notification channel exists
            NotificationReceiver.createChannelIfNeeded(context);

            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) {
                Log.e(TAG, "AlarmManager unavailable on boot");
                return;
            }

            long now = System.currentTimeMillis();
            List<AlarmStore.AlarmEntry> alarms = AlarmStore.getAlarms(context);
            Log.d(TAG, "Restoring " + alarms.size() + " scheduled alarms after boot");

            for (AlarmStore.AlarmEntry a : alarms) {
                if (a.timestamp <= now) {
                    // Past alarm, discard from store
                    AlarmStore.removeAlarm(context, a.id);
                } else {
                    Intent notifIntent = ScheduledNotificationPlugin.buildNotifIntent(context, a.id, a.title, a.body);
                    PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context, a.id, notifIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    ScheduledNotificationPlugin.setExactOrClockAlarm(context, alarmManager, a.timestamp, pendingIntent, a.id);
                    Log.d(TAG, "Restored alarm id=" + a.id + " for timestamp=" + a.timestamp);
                }
            }
        }
    }
}
