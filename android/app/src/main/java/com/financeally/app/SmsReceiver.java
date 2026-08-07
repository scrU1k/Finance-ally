package com.financeally.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "FinanceAllySmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            Bundle bundle = intent.getExtras();
            if (bundle != null) {
                try {
                    Object[] pdus = (Object[]) bundle.get("pdus");
                    if (pdus == null) return;

                    for (Object pdu : pdus) {
                        String format = bundle.getString("format");
                        SmsMessage smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
                        String sender = smsMessage.getDisplayOriginatingAddress();
                        String messageBody = smsMessage.getMessageBody();

                        Log.d(TAG, "Received SMS from: " + sender + " | Body: " + messageBody);

                        if (isTransactionalSms(messageBody)) {
                            saveSmsToQueue(context, sender, messageBody);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing incoming SMS: " + e.getMessage(), e);
                }
            }
        }
    }

    private boolean isTransactionalSms(String body) {
        if (body == null) return false;
        String lower = body.toLowerCase();

        // 1. FILTER OUT PROMOTIONAL SPAM & OFFERS
        if (lower.contains("loan") || lower.contains("apply for") || lower.contains("congratulations") ||
            lower.contains("cashback up to") || lower.contains("discount") || lower.contains("recharge now") ||
            lower.contains("click here") || lower.contains("win up to") || lower.contains("flat rs")) {
            return false;
        }

        // 2. REQUIRE TRANSACTION KEYWORDS
        boolean hasAction = lower.contains("debited") || lower.contains("spent") || lower.contains("paid") ||
                            lower.contains("sent") || lower.contains("transferred") || lower.contains("credited") ||
                            lower.contains("withdrawn") || lower.contains("a/c") || lower.contains("ac ");

        boolean hasMoney = lower.contains("rs") || lower.contains("inr") || lower.contains("₹") || lower.contains("vpa");

        return hasAction && hasMoney;
    }

    private void saveSmsToQueue(Context context, String sender, String body) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String existingQueue = prefs.getString("fa_pending_sms_queue", "[]");
            JSONArray array = new JSONArray(existingQueue);

            JSONObject item = new JSONObject();
            item.put("id", "sms-" + System.currentTimeMillis());
            item.put("sender", sender);
            item.put("body", body);
            item.put("timestamp", System.currentTimeMillis());

            array.put(item);

            prefs.edit().putString("fa_pending_sms_queue", array.toString()).apply();
            Log.d(TAG, "Saved transactional SMS to pending queue!");
        } catch (Exception e) {
            Log.e(TAG, "Error saving SMS to queue: " + e.getMessage(), e);
        }
    }
}
