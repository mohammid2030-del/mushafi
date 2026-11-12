package com.mushafi.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;
import org.json.JSONObject;

/**
 * Follows one outgoing call placed by صحبة الفجر: reports when it goes off-hook and when it ends.
 * Android does not tell an app whether the other side answered, so the page asks the user after "ended".
 */
final class FajrCallTracker {
 interface Sink { void event(JSONObject json); }

 private final Context context;
 private final Sink sink;
 private final Handler main = new Handler(Looper.getMainLooper());
 private TelephonyManager phone;
 private Object listener;
 private boolean offhook, done;
 private long offhookAt;
 private final Runnable noStart = () -> finish("failed", "no-start");

 FajrCallTracker(Context context, Sink sink) { this.context = context.getApplicationContext(); this.sink = sink; }

 boolean start() {
  if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return false;
  phone = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
  if (phone == null) return false;
  try {
   if (Build.VERSION.SDK_INT >= 31) {
    Modern m = new Modern(); listener = m; phone.registerTelephonyCallback(context.getMainExecutor(), m);
   } else {
    Legacy l = new Legacy(); listener = l; phone.listen(l, PhoneStateListener.LISTEN_CALL_STATE);
   }
  } catch (Exception e) { return false; }
  main.postDelayed(noStart, 15000);
  return true;
 }

 private void state(int s) {
  if (done) return;
  if (s == TelephonyManager.CALL_STATE_OFFHOOK && !offhook) {
   offhook = true; offhookAt = System.currentTimeMillis(); main.removeCallbacks(noStart);
   send("started", null, 0);
  } else if (s == TelephonyManager.CALL_STATE_IDLE && offhook) {
   finish("ended", null);
  }
 }

 void cancel() { finish("cancelled", null); }

 private void finish(String kind, String reason) {
  if (done) return;
  done = true; main.removeCallbacks(noStart);
  try {
   if (Build.VERSION.SDK_INT >= 31 && listener instanceof TelephonyCallback) phone.unregisterTelephonyCallback((TelephonyCallback) listener);
   else if (listener instanceof PhoneStateListener) phone.listen((PhoneStateListener) listener, PhoneStateListener.LISTEN_NONE);
  } catch (Exception ignored) {}
  send(kind, reason, offhook ? (System.currentTimeMillis() - offhookAt) / 1000.0 : 0);
 }

 private void send(String kind, String reason, double duration) {
  try {
   JSONObject j = new JSONObject().put("state", kind);
   if (reason != null) j.put("reason", reason);
   if ("ended".equals(kind)) j.put("duration", Math.round(duration));
   sink.event(j);
  } catch (Exception ignored) {}
 }

 private final class Modern extends TelephonyCallback implements TelephonyCallback.CallStateListener {
  @Override public void onCallStateChanged(int s) { state(s); }
 }

 @SuppressWarnings("deprecation")
 private final class Legacy extends PhoneStateListener {
  @Override public void onCallStateChanged(int s, String number) { state(s); }
 }
}
