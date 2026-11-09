package com.mushafi.app;
import android.content.*;
public class KhatmaAlarmReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){final PendingResult result=goAsync();final Context app=context.getApplicationContext();new Thread(()->{try{if(KhatmaScheduler.ACTION.equals(intent.getAction()))KhatmaScheduler.deliver(app,intent);KhatmaScheduler.schedule(app);}finally{result.finish();}},"khatma-alarm").start();}
}
