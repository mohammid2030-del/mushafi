package com.mushafi.app;
import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** FCM is the primary closed-app path. Periodic JobScheduler remains an offline/recovery fallback. */
public final class AppUpdatePush {
 public static final String TOPIC="mushafi_app_updates_v1";
 private static final AtomicBoolean busy=new AtomicBoolean();
 public static void sync(Context context,boolean refreshed){final Context c=context.getApplicationContext();try{
  boolean desired=AppUpdateNotifications.permitted(c)&&PrayerScheduler.channelEnabled(c,AppUpdateNotifications.CHANNEL);
  android.content.SharedPreferences p=c.getSharedPreferences("app-update-push",0);
  if(!desired&&!p.getBoolean("subscribed",false)){p.edit().putBoolean("subscribed",false).apply();return;}
  if(!refreshed&&p.contains("subscribed")&&p.getBoolean("subscribed",false)==desired)return;
  if(!busy.compareAndSet(false,true))return;
  if(FirebaseApp.getApps(c).isEmpty())FirebaseApp.initializeApp(c);
  FirebaseMessaging messaging=FirebaseMessaging.getInstance();messaging.setAutoInitEnabled(desired);
  (desired?messaging.subscribeToTopic(TOPIC):messaging.unsubscribeFromTopic(TOPIC)).addOnCompleteListener(task->{busy.set(false);if(task.isSuccessful()){p.edit().putBoolean("subscribed",desired).remove("lastError").apply();boolean now=AppUpdateNotifications.permitted(c)&&PrayerScheduler.channelEnabled(c,AppUpdateNotifications.CHANNEL);if(now!=desired)sync(c,true);}else p.edit().putString("lastError","subscription").apply();});
 }catch(Exception ignored){busy.set(false);}}
 public static void receive(Context c,Map<String,String> data){try{AppUpdatePolicy release=AppUpdatePushPayload.parse(data);if(release!=null)AppUpdateNotifications.deliver(c,release,true);}catch(Exception ignored){}}
 private AppUpdatePush(){}
}
