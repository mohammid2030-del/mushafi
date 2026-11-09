package com.mushafi.app;
public final class NotificationIdentityPolicyTest {
 private static void need(boolean value,String message){if(!value)throw new AssertionError(message);}
 public static void main(String[] args){
  need(AppIdentity.needsRefresh(false,false,true,true,true),"v1 reminders must lose their extra logo even when color/icon are current");
  need(AppIdentity.needsRefresh(false,false,false,true,true),"older clean reminders receive the migration stamp");
  need(AppIdentity.needsRefresh(false,true,true,true,true),"artwork reintroduced after stamping must still be removed");
  need(!AppIdentity.needsRefresh(false,true,false,true,true),"already clean reminders are not reposted");
  need(!AppIdentity.needsRefresh(true,false,true,true,true),"reciter portrait is content, not a second app icon");
  need(!AppIdentity.needsRefresh(true,false,false,true,true),"media without cover is not given an app logo");
  need(AppIdentity.needsRefresh(true,true,true,false,true),"old media system icon must be corrected");
  need(AppIdentity.needsRefresh(true,false,true,true,false),"media accent correction retains its cover");
  need(AppIdentity.needsRefresh(false,true,false,false,true),"wrong system icon cannot hide behind the migration stamp");
  need(AppIdentity.needsRefresh(false,true,false,true,false),"wrong accent cannot hide behind the migration stamp");
  System.out.println("PASS: notification migration, no-logo reminder policy, no repeat update, and reciter-cover preservation (10 cases).");
 }
}
