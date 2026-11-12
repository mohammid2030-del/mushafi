package com.mushafi.app;

import android.content.*;

public class FajrAlarmReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context, Intent intent) {
  final PendingResult result = goAsync();
  final Context app = context.getApplicationContext();
  new Thread(() -> {
   try {
    String action = intent.getAction();
    if (FajrCompanion.DISMISS.equals(action)) FajrCompanion.dismiss(app);
    else if (FajrCompanion.ACTION.equals(action)) FajrCompanion.deliver(app, intent);
    FajrCompanion.schedule(app);
   } finally { result.finish(); }
  }, "fajr-alarm").start();
 }
}
