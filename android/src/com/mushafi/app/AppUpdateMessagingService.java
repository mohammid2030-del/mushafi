package com.mushafi.app;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
/** No notification payload: validate and deduplicate locally before posting the one system icon. */
public final class AppUpdateMessagingService extends FirebaseMessagingService {
 @Override public void onMessageReceived(RemoteMessage message){AppUpdatePush.receive(this,message.getData());}
 @Override public void onNewToken(String token){AppUpdateNotifications.channel(this);AppUpdatePush.sync(this,true);}
}
