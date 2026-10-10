package com.financeally.app;

import android.app.Activity;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PrivacyScreen")
public class PrivacyScreenPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                JSObject ret = new JSObject();
                ret.put("enabled", true);
                call.resolve(ret);
            });
        } else {
            call.reject("Activity is null");
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                JSObject ret = new JSObject();
                ret.put("enabled", false);
                call.resolve(ret);
            });
        } else {
            call.reject("Activity is null");
        }
    }
}
