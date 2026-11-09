package com.mushafi.app;
import android.content.*;
public class PrayerAlarmReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){
  final PendingResult pending=goAsync();final Context app=context.getApplicationContext();new Thread(()->{try{if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))AppIdentity.normalizeNotifications(app);if(PrayerScheduler.ACTION.equals(intent.getAction()))PrayerScheduler.deliver(app,intent);PrayerScheduler.schedule(app);MushafiWidget.updateAll(app);}finally{pending.finish();}},"prayer-alarm").start();
 }
}
