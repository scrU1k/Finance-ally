package com.financeally.app;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

public class BankNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "BankNotifListener";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        try {
            Notification notification = sbn.getNotification();
            CharSequence titleChar = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textChar = notification.extras.getCharSequence(Notification.EXTRA_TEXT);

            String title = titleChar != null ? titleChar.toString() : "";
            String text = textChar != null ? textChar.toString() : "";

            String combined = (title + " " + text).trim();
            Log.d(TAG, "Notification received from " + sbn.getPackageName() + ": " + combined);

            if (isTransactionalText(combined)) {
                saveNotifToQueue(this, sbn.getPackageName(), combined);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing notification: " + e.getMessage(), e);
        }
    }

    private boolean isTransactionalText(String body) {
        if (body == null) return false;
        String lower = body.toLowerCase();

        // Filter out promotional spam & offers
        if (lower.contains("loan") || lower.contains("apply for") || lower.contains("congratulations") ||
            lower.contains("cashback up to") || lower.contains("discount") || lower.contains("recharge now") ||
            lower.contains("click here") || lower.contains("win up to") || lower.contains("flat rs")) {
            return false;
        }

        boolean hasAction = lower.contains("debited") || lower.contains("spent") || lower.contains("paid") ||
                            lower.contains("sent") || lower.contains("transferred") || lower.contains("credited") ||
                            lower.contains("withdrawn") || lower.contains("a/c") || lower.contains("ac ") ||
                            lower.contains("charged") || lower.contains("purchase") || lower.contains("txn");

        boolean hasMoney = lower.contains("rs") || lower.contains("inr") || lower.contains("₹") || lower.contains("vpa") ||
                           lower.contains("usd") || lower.contains("$") || lower.contains("eur") || lower.contains("€") ||
                           lower.contains("gbp") || lower.contains("£") || lower.contains("jpy") || lower.contains("¥") ||
                           lower.contains("cad") || lower.contains("aud") || lower.contains("sgd") || lower.contains("aed") ||
                           lower.contains("sar") || lower.contains("chf") || lower.contains("cny") || lower.contains("dirham") ||
                           lower.contains("dollar") || lower.contains("euro") || lower.contains("pound");

        return hasAction && hasMoney;
    }

    private void saveNotifToQueue(Context context, String packageName, String body) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String existingQueue = prefs.getString("fa_pending_sms_queue", "[]");
            JSONArray array = new JSONArray(existingQueue);

            JSONObject item = new JSONObject();
            item.put("id", "notif-" + System.currentTimeMillis());
            item.put("sender", packageName);
            item.put("body", body);
            item.put("timestamp", System.currentTimeMillis());

            array.put(item);

            prefs.edit().putString("fa_pending_sms_queue", array.toString()).apply();
            Log.d(TAG, "Saved bank notification to pending queue!");
        } catch (Exception e) {
            Log.e(TAG, "Error saving notification: " + e.getMessage(), e);
        }
    }
}
