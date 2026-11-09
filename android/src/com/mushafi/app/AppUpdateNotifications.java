package com.mushafi.app;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageInfo;
import android.os.Build;
/** System-scheduled checks survive task dismissal and reboot; installation remains user initiated. */
public final class AppUpdateNotifications {
 static final int PERIODIC=8032,IMMEDIATE=8033,NOTICE=8034;
 static final String CHANNEL="app_updates_v1",EXTRA="openAppUpdate";
 static boolean permitted(Context c){return PrayerScheduler.notifications(c)&&androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled();}
 static long installed(Context c)throws Exception{PackageInfo p=c.getPackageManager().getPackageInfo(c.getPackageName(),0);return Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode;}
 static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("app-update-notifications",0);}
 static void channel(Context c){if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,UiLocale.text(c,"تحديثات مصحفي"),NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription(UiLocale.text(c,"إشعار عند توفر إصدار جديد من التطبيق"));((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);}}
 public static void schedule(Context c,boolean immediate){try{
  JobScheduler jobs=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);channel(c);clearInstalled(c);AppUpdatePush.sync(c,false);
  if(!permitted(c)||!PrayerScheduler.channelEnabled(c,CHANNEL)){jobs.cancel(PERIODIC);jobs.cancel(IMMEDIATE);return;}
  boolean periodic=false,queued=false;for(JobInfo job:jobs.getAllPendingJobs()){if(job.getId()==PERIODIC)periodic=true;if(job.getId()==IMMEDIATE)queued=true;}
  ComponentName service=new ComponentName(c,AppUpdateCheckJob.class);
  if(!periodic)jobs.schedule(new JobInfo.Builder(PERIODIC,service).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(60*60*1000L).setBackoffCriteria(60*1000L,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
  if(immediate&&!queued)jobs.schedule(new JobInfo.Builder(IMMEDIATE,service).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(1000).setBackoffCriteria(60*1000L,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
 }catch(Exception ignored){}}
 static void clearInstalled(Context c){try{if(prefs(c).getLong("notifiedCode",0)<=installed(c))((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTICE);}catch(Exception ignored){}}
 static synchronized void deliver(Context c,AppUpdatePolicy release,boolean available)throws Exception{
  channel(c);long installed=installed(c);NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
  if(!available||!release.newerThan(installed,Build.VERSION.SDK_INT)){manager.cancel(NOTICE);return;}
  if(!AppUpdateNoticePolicy.shouldNotify(release,installed,Build.VERSION.SDK_INT,prefs(c).getLong("notifiedCode",0),available,permitted(c)&&PrayerScheduler.channelEnabled(c,CHANNEL)))return;
  String title=UiLocale.text(c,"يوجد تحديث جديد"),body=UiLocale.text(c,"الإصدار {0} من مصحفي متاح. اضغط لعرض المميزات والتحديث الآن أو لاحقًا.",release.version);
  Intent open=new Intent(c,MainActivity.class).setAction("com.mushafi.app.OPEN_UPDATE").putExtra(EXTRA,true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent pending=PendingIntent.getActivity(c,NOTICE,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
  AppIdentity.decorate(c,builder).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).setCategory(Notification.CATEGORY_STATUS).setVisibility(Notification.VISIBILITY_PRIVATE);
  if(Build.VERSION.SDK_INT<26)builder.setDefaults(Notification.DEFAULT_SOUND);
  manager.notify(NOTICE,builder.build());prefs(c).edit().putLong("notifiedCode",release.code).commit();
 }
 private AppUpdateNotifications(){}
}
