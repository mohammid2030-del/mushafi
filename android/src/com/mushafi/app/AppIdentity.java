package com.mushafi.app;
import android.app.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
/** Keep one system app icon. A media cover represents the reciter, not another app logo. */
public final class AppIdentity {
 private AppIdentity(){}
 private static final String REVISION="mushafi.officialIconRevision",FIXED="official-system-only-v2";
 public static int notificationIcon(Context context){return context.getResources().getIdentifier("ic_prayer_notification","drawable",context.getPackageName());}
 public static int notificationColor(Context context){return context.getResources().getColor(context.getResources().getIdentifier("mushafi_icon_symbol","color",context.getPackageName()),context.getTheme());}
 public static Notification.Builder decorate(Context context,Notification.Builder builder){
  builder.setLargeIcon((Bitmap)null);
  Bundle extras=builder.getExtras();
  extras.remove(Notification.EXTRA_LARGE_ICON);
  extras.remove(Notification.EXTRA_LARGE_ICON_BIG);
  extras.putString(REVISION,FIXED);
  return builder.setExtras(extras).setSmallIcon(notificationIcon(context)).setColor(notificationColor(context));
 }
 static boolean needsRefresh(boolean media,boolean currentRevision,boolean hasArtwork,boolean sameIcon,boolean sameColor){return !sameIcon||!sameColor||!media&&(!currentRevision||hasArtwork);}
 private static boolean sameIcon(Notification notification,int icon){try{return notification.getSmallIcon()!=null&&notification.getSmallIcon().getResId()==icon;}catch(Exception ignored){return false;}}
 private static boolean hasArtwork(Notification notification){return notification.getLargeIcon()!=null||notification.largeIcon!=null||notification.extras!=null&&(notification.extras.get(Notification.EXTRA_LARGE_ICON)!=null||notification.extras.get(Notification.EXTRA_LARGE_ICON_BIG)!=null);}
 public static void normalizeNotifications(Context context){
  if(Build.VERSION.SDK_INT<24)return;
  try{
   NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
   int color=notificationColor(context),icon=notificationIcon(context);
   for(StatusBarNotification active:manager.getActiveNotifications())try{
    Notification old=active.getNotification();
    boolean media=Notification.CATEGORY_TRANSPORT.equals(old.category)&&old.extras!=null&&old.extras.containsKey(Notification.EXTRA_MEDIA_SESSION);
    boolean fixed=old.extras!=null&&FIXED.equals(old.extras.getString(REVISION));
    if(!needsRefresh(media,fixed,hasArtwork(old),sameIcon(old,icon),old.color==color))continue;
    Notification.Builder builder=Notification.Builder.recoverBuilder(context,old).setSmallIcon(icon).setColor(color).setOnlyAlertOnce(true);
    if(!media)decorate(context,builder);
    manager.notify(active.getTag(),active.getId(),builder.build());
   }catch(Exception ignored){}
  }catch(Exception ignored){}
 }
}
