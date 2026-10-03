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
     * Uses AlarmClock / ExactAlarm so it reliably fires when the app is closed or device is in Doze.
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
            setExactOrClockAlarm(context, alarmManager, timestamp, pendingIntent, id);
            // Persist to AlarmStore so it survives device reboot!
            AlarmStore.saveAlarm(context, id, title, body, timestamp);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule alarm: " + e.getMessage());
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    /**
     * Dispatches exact alarms using setAlarmClock or setExactAndAllowWhileIdle.
     * setAlarmClock does NOT require SCHEDULE_EXACT_ALARM permission on Android 12/13/14+
     * and is guaranteed to wake the device from deep sleep/Doze mode even when app is killed.
     */
    public static void setExactOrClockAlarm(Context context, AlarmManager alarmManager, long timestamp, PendingIntent pendingIntent, int id) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                Log.d(TAG, "Scheduled exact alarm via setExactAndAllowWhileIdle at " + timestamp + " for id=" + id);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // setAlarmClock is an exact alarm exempt from exact alarm restrictions
                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(timestamp, pendingIntent);
                alarmManager.setAlarmClock(clockInfo, pendingIntent);
                Log.d(TAG, "Scheduled exact alarm via setAlarmClock at " + timestamp + " for id=" + id);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
            }
        } catch (SecurityException se) {
            Log.w(TAG, "Exact alarm permission restricted, falling back to setAlarmClock: " + se.getMessage());
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(timestamp, pendingIntent);
                    alarmManager.setAlarmClock(clockInfo, pendingIntent);
                    Log.d(TAG, "Fallback setAlarmClock scheduled at " + timestamp + " for id=" + id);
                } else {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                }
            } catch (Exception ex) {
                Log.e(TAG, "Final alarm fallback failed: " + ex.getMessage());
                throw new RuntimeException("All alarm scheduling methods failed: " + ex.getMessage(), ex);
            }
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

        // Remove from persistent store
        AlarmStore.removeAlarm(context, id);

        Log.d(TAG, "Cancelled notification id=" + id);
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    public static Intent buildNotifIntent(Context context, int id, String title, String body) {
        Intent intent = new Intent(context, NotificationReceiver.class);
        intent.setAction("com.financeally.app.NOTIFICATION_" + id);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("notifId", id);
        return intent;
    }
}
