package com.mushafi.app;
import android.content.*;
public final class AppUpdateReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent intent){AppUpdateNotifications.schedule(c,true);}
}
