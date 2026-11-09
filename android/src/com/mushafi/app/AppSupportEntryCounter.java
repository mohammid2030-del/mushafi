package com.mushafi.app;
import android.content.Context;
/** Local foreground-entry identity, excluding external flows and configuration recreation. */
final class AppSupportEntryCounter {
 private static boolean skipConfigurationEntry;
 static synchronized void configurationChange(){skipConfigurationEntry=true;}
 static synchronized void enter(Context context){
  if(skipConfigurationEntry){skipConfigurationEntry=false;return;}
  android.content.SharedPreferences p=context.getSharedPreferences("support-entry",0);
  long previous=p.getLong("entry",0);p.edit().putLong("entry",previous==Long.MAX_VALUE?1:Math.max(1,previous+1)).apply();
 }
 static String id(Context context){return Long.toString(context.getSharedPreferences("support-entry",0).getLong("entry",0));}
}
