package com.financeally.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class AlarmStore {
    private static final String PREF_NAME = "fa_scheduled_alarms";
    private static final String KEY_ALARMS = "alarms_list";

    public static class AlarmEntry {
        public int id;
        public String title;
        public String body;
        public long timestamp;

        public AlarmEntry(int id, String title, String body, long timestamp) {
            this.id = id;
            this.title = title;
            this.body = body;
            this.timestamp = timestamp;
        }
    }

    public static synchronized void saveAlarm(Context context, int id, String title, String body, long timestamp) {
        List<AlarmEntry> list = getAlarms(context);
        list.removeIf(a -> a.id == id);
        list.add(new AlarmEntry(id, title, body, timestamp));
        persistList(context, list);
    }

    public static synchronized void removeAlarm(Context context, int id) {
        List<AlarmEntry> list = getAlarms(context);
        list.removeIf(a -> a.id == id);
        persistList(context, list);
    }

    public static synchronized List<AlarmEntry> getAlarms(Context context) {
        List<AlarmEntry> result = new ArrayList<>();
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_ALARMS, null);
        if (raw != null) {
            try {
                JSONArray arr = new JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    result.add(new AlarmEntry(
                        obj.getInt("id"),
                        obj.getString("title"),
                        obj.getString("body"),
                        obj.getLong("timestamp")
                    ));
                }
            } catch (Exception ignored) {}
        }
        return result;
    }

    private static void persistList(Context context, List<AlarmEntry> list) {
        try {
            JSONArray arr = new JSONArray();
            for (AlarmEntry a : list) {
                JSONObject obj = new JSONObject();
                obj.put("id", a.id);
                obj.put("title", a.title);
                obj.put("body", a.body);
                obj.put("timestamp", a.timestamp);
                arr.put(obj);
            }
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_ALARMS, arr.toString()).apply();
        } catch (Exception ignored) {}
    }
}
