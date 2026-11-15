package com.mushafi.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Hajj & Umrah: the phone's own step counter (TYPE_STEP_COUNTER) and report sharing.
 *
 * The hardware counter keeps counting while the app is closed, so a session only needs a
 * baseline: steps = accumulated + (current − baseline). A reboot resets the counter to 0;
 * that is detected (value drops) and folded into the accumulated total. Nothing leaves the
 * device — values are kept in private SharedPreferences and handed to the page only.
 */
final class HajjNative implements SensorEventListener {
    static final int PERMISSION_CODE = 96;
    static final int SAVE_CODE = 86;

    interface Emitter { void emit(String fn, String json); }

    private final Activity activity;
    private final Emitter emitter;
    private final SensorManager manager;
    private final Sensor counter;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean listening;
    private boolean queryPending;
    private byte[] pendingSave;

    HajjNative(Activity activity, Emitter emitter) {
        this.activity = activity;
        this.emitter = emitter;
        manager = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        counter = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    private SharedPreferences prefs() { return activity.getSharedPreferences("hajj_steps", Context.MODE_PRIVATE); }

    private boolean permitted() {
        return Build.VERSION.SDK_INT < 29 || activity.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    String status() {
        try {
            String permission = counter == null ? "unsupported" : permitted() ? "granted"
                : prefs().getBoolean("asked", false) && !activity.shouldShowRequestPermissionRationale(Manifest.permission.ACTIVITY_RECOGNITION) ? "denied" : "prompt";
            return new JSONObject().put("platform", "android").put("available", counter != null).put("permission", permission)
                .put("active", prefs().getBoolean("active", false)).put("source", "sensor").put("distance", false).toString();
        } catch (Exception e) { return "{\"available\":false}"; }
    }

    void requestPermission() {
        if (counter == null || permitted()) { emitter.emit("onHajjStepPermission", status()); return; }
        boolean asked = prefs().getBoolean("asked", false);
        if (asked && !activity.shouldShowRequestPermissionRationale(Manifest.permission.ACTIVITY_RECOGNITION)) {
            try { activity.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()))); } catch (Exception ignored) {}
            emitter.emit("onHajjStepPermission", status());
            return;
        }
        prefs().edit().putBoolean("asked", true).apply();
        activity.requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, PERMISSION_CODE);
    }

    void permissionResult() { emitter.emit("onHajjStepPermission", status()); if (prefs().getBoolean("active", false)) listen(); }

    void begin() {
        prefs().edit().putBoolean("active", true).putFloat("base", -1f).putLong("accum", 0).putFloat("last", -1f).apply();
        listen();
    }

    void end() {
        prefs().edit().putBoolean("active", false).apply();
        stop();
    }

    void query() {
        if (!prefs().getBoolean("active", false) || counter == null || !permitted()) { emitSteps(); return; }
        queryPending = true;
        listen();
        // The counter normally reports its value as soon as it is registered; if a device only
        // reports on the next step, answer with the last saved value instead of waiting.
        main.postDelayed(() -> { if (queryPending) { queryPending = false; emitSteps(); } }, 1500);
    }

    void resume() { if (prefs().getBoolean("active", false)) listen(); }
    void pause() { stop(); }

    private void listen() {
        if (listening || counter == null || !permitted()) return;
        listening = manager.registerListener(this, counter, SensorManager.SENSOR_DELAY_NORMAL, main);
    }

    private void stop() {
        if (!listening) return;
        manager.unregisterListener(this);
        listening = false;
    }

    private long steps() {
        SharedPreferences p = prefs();
        float base = p.getFloat("base", -1f), last = p.getFloat("last", -1f);
        if (base < 0 || last < 0) return p.getLong("accum", 0);
        return p.getLong("accum", 0) + Math.max(0, Math.round(last - base));
    }

    private void emitSteps() {
        try {
            emitter.emit("onHajjSteps", new JSONObject().put("active", prefs().getBoolean("active", false))
                .put("steps", steps()).put("source", "sensor").put("permission", permitted() ? "granted" : "prompt").toString());
        } catch (Exception ignored) {}
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.values == null || event.values.length == 0) return;
        float v = event.values[0];
        SharedPreferences p = prefs();
        if (!p.getBoolean("active", false)) return;
        float base = p.getFloat("base", -1f), last = p.getFloat("last", -1f);
        long accum = p.getLong("accum", 0);
        SharedPreferences.Editor e = p.edit();
        if (base < 0) base = v;
        else if (last >= 0 && v + 0.5f < last) { accum += Math.max(0, Math.round(last - base)); base = 0; }
        e.putFloat("base", base).putFloat("last", v).putLong("accum", accum).apply();
        if (queryPending) { queryPending = false; emitSteps(); }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    // ---------- report files ----------

    private static byte[] decode(String base64) {
        if (base64 == null || base64.length() > 12_000_000) return null;
        int comma = base64.indexOf(',');
        try { return Base64.decode(comma >= 0 ? base64.substring(comma + 1) : base64, Base64.DEFAULT); } catch (Exception e) { return null; }
    }

    private static String safeName(String name, String fallback) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "");
        return n.isEmpty() || n.length() > 80 ? fallback : n;
    }

    private static boolean allowedMime(String mime) { return "image/png".equals(mime) || "image/jpeg".equals(mime) || "application/pdf".equals(mime); }

    void share(String base64, String mime, String name) {
        byte[] bytes = decode(base64);
        if (bytes == null || !allowedMime(mime)) { emitter.emit("onHajjFile", "{\"ok\":false}"); return; }
        new Thread(() -> {
            try {
                File dir = new File(activity.getCacheDir(), "shared");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("dir");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3600_000L) f.delete();
                File file = new File(dir, safeName(name, "Mushafi-report"));
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
                Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", file);
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.runOnUiThread(() -> {
                    try { activity.startActivity(Intent.createChooser(send, "مشاركة الملخص")); emitter.emit("onHajjFile", "{\"ok\":true,\"action\":\"share\"}"); }
                    catch (Exception e) { emitter.emit("onHajjFile", "{\"ok\":false}"); }
                });
            } catch (Exception e) { emitter.emit("onHajjFile", "{\"ok\":false}"); }
        }).start();
    }

    void save(String base64, String mime, String name) {
        byte[] bytes = decode(base64);
        if (bytes == null || !allowedMime(mime)) { emitter.emit("onHajjFile", "{\"ok\":false}"); return; }
        pendingSave = bytes;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime)
            .putExtra(Intent.EXTRA_TITLE, safeName(name, "Mushafi-report"));
        try { activity.startActivityForResult(intent, SAVE_CODE); } catch (Exception e) { pendingSave = null; emitter.emit("onHajjFile", "{\"ok\":false}"); }
    }

    void saveResult(int result, Intent data) {
        final byte[] bytes = pendingSave;
        pendingSave = null;
        if (bytes == null || result != Activity.RESULT_OK || data == null || data.getData() == null) { emitter.emit("onHajjFile", "{\"ok\":false,\"cancelled\":true}"); return; }
        final Uri uri = data.getData();
        new Thread(() -> {
            try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new Exception("stream");
                out.write(bytes);
                emitter.emit("onHajjFile", "{\"ok\":true,\"action\":\"save\"}");
            } catch (Exception e) { emitter.emit("onHajjFile", "{\"ok\":false}"); }
        }).start();
    }
}
