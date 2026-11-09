package com.mushafi.app;
import android.content.*;
/** Stopping a notification must never create a new foreground service. */
public class AdhanStopReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent i){c.stopService(new Intent(c,AdhanPlaybackService.class));}
}
