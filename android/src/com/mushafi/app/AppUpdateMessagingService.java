package com.mushafi.app;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
/** No notification payload: validate and deduplicate locally before posting the one system icon. */
public final class AppUpdateMessagingService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){java.util.Map<String,String> d=message.getData();String type=d.get("type");if("wake".equals(type)||"wakeEnd".equals(type)){WakeRing.receive(this,d);return;}AppUpdatePush.receive(this,d);}
 @Override public void onNewToken(String token){WakeClient.tokenRefreshed(this,token);AppUpdateNotifications.channel(this);AppUpdatePush.sync(this,true);}
}
