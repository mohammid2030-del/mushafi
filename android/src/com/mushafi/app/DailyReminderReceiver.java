package com.mushafi.app;
import android.content.*;
public class DailyReminderReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent intent){PendingResult pending=goAsync();Context app=c.getApplicationContext();new Thread(()->{try{if(DailyReminderScheduler.ACTION.equals(intent.getAction()))DailyReminderScheduler.deliver(app,intent);DailyReminderScheduler.schedule(app);}finally{pending.finish();}},"daily-reminder").start();}
}
