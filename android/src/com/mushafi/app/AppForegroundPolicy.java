package com.mushafi.app;
/** Monotonic lifecycle decisions; cold starts are covered by Activity.onCreate. */
final class AppForegroundPolicy {
 static boolean reloadAfterBackground(long stopped,long now){return stopped>0&&now-stopped>600000L;}
 static boolean keepScreenOn(boolean reading,boolean reciting,boolean foreground){return foreground&&(reading||reciting);}
}
