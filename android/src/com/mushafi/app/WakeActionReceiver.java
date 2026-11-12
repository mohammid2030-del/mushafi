package com.mushafi.app;

import android.content.*;

public class WakeActionReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context, Intent intent) {
  Context c = context.getApplicationContext();
  String callId = intent.getStringExtra("callId"), action = intent.getAction();
  if (callId == null || action == null) return;
  if (WakeRing.TIMEOUT.equals(action)) {
   if (callId.equals(c.getSharedPreferences("wake", 0).getString("ringing", ""))) {
    String name = c.getSharedPreferences("wake", 0).getString("ringingName", "");
    WakeRing.stopRinging(c, callId);
    WakeClient.respond(c, callId, "missed");
    WakeRing.missed(c, callId, name);
   }
   return;
  }
  WakeRing.stopRinging(c, callId);
  WakeClient.respond(c, callId, WakeRing.ANSWER.equals(action) ? "answered" : "declined");
 }
}
