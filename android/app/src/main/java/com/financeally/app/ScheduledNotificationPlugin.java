package com.financeally.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScheduledNotification")
public class ScheduledNotificationPlugin extends Plugin {
    private static final String TAG = "SchedNotifPlugin";

    @Override
    public void load() {
        // Create channel as soon as plugin loads
        NotificationReceiver.createChannelIfNeeded(getContext());
    }

    /**
     * Schedule a notification at an exact future timestamp.
     * Called from JS as: ScheduledNotification.scheduleNotification({ id, title, body, timestamp })
     */
    @PluginMethod
    public void scheduleNotification(PluginCall call) {
        int id = call.getInt("id", 1001);
        String title = call.getString("title", "Scheduled Payment");
        String body = call.getString("body", "A scheduled payment is now due.");
        long timestamp = call.getLong("timestamp", System.currentTimeMillis() + 1000);

        Context context = getContext();
        Intent intent = buildNotifIntent(context, id, title, body);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("AlarmManager unavailable");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                // Fall back to inexact alarm if exact not allowed
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                Log.d(TAG, "Scheduled inexact alarm at " + timestamp + " for id=" + id);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                Log.d(TAG, "Scheduled exact alarm at " + timestamp + " for id=" + id);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                Log.d(TAG, "Scheduled exact alarm (pre-M) at " + timestamp + " for id=" + id);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule alarm: " + e.getMessage());
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    /**
     * Fire an immediate notification right now.
     * Called from JS as: ScheduledNotification.showNotification({ id, title, body })
     */
    @PluginMethod
    public void showNotification(PluginCall call) {
        int id = call.getInt("id", 1001);
        String title = call.getString("title", "Payment Logged");
        String body = call.getString("body", "Your scheduled payment has been logged.");

        Context context = getContext();
        Intent intent = buildNotifIntent(context, id, title, body);
        // Fire immediately by sending the broadcast directly
        context.sendBroadcast(intent);

        Log.d(TAG, "Fired immediate notification id=" + id);
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Cancel a previously scheduled notification.
     */
    @PluginMethod
    public void cancelNotification(PluginCall call) {
        int id = call.getInt("id", 1001);

        Context context = getContext();
        Intent intent = buildNotifIntent(context, id, "", "");
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(pendingIntent);
        }

        Log.d(TAG, "Cancelled notification id=" + id);
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    private Intent buildNotifIntent(Context context, int id, String title, String body) {
        Intent intent = new Intent(context, NotificationReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("notifId", id);
        return intent;
    }
}
