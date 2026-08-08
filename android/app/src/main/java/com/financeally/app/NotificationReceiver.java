package com.financeally.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class NotificationReceiver extends BroadcastReceiver {
    private static final String TAG = "NotifReceiver";
    public static final String CHANNEL_ID = "scheduled_payments";

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int notifId = intent.getIntExtra("notifId", 1001);

        if (title == null) title = "Scheduled Payment";
        if (body == null) body = "A scheduled payment is now due.";

        Log.d(TAG, "Firing scheduled notification: " + title);

        // Create channel if needed
        createChannelIfNeeded(context);

        // Launch app on tap
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, notifId, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        try {
            manager.notify(notifId, builder.build());
            Log.d(TAG, "Notification fired successfully, id=" + notifId);
        } catch (SecurityException e) {
            Log.e(TAG, "Missing POST_NOTIFICATIONS permission: " + e.getMessage());
        }
    }

    public static void createChannelIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Scheduled Payments", NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Alerts when a scheduled payment becomes due");
                channel.enableVibration(true);
                channel.enableLights(true);
                nm.createNotificationChannel(channel);
            }
        }
    }
}
