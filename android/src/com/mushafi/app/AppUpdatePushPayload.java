package com.mushafi.app;
import java.util.Map;
/** Strict, testable FCM data contract; metadata is never an installation instruction. */
public final class AppUpdatePushPayload {
 public static AppUpdatePolicy parse(Map<String,String> data){
  if(data==null||data.size()>16||!"app_update".equals(data.get("kind"))||!"com.mushafi.app".equals(data.get("packageName"))||!"true".equals(data.get("available")))return null;
  int length=0;for(Map.Entry<String,String> e:data.entrySet()){if(e.getValue()==null)return null;length+=e.getKey().length()+e.getValue().length();}if(length>3000)return null;
  return new AppUpdatePolicy(Integer.parseInt(data.get("versionCode")),data.get("versionName"),Integer.parseInt(data.get("minSdk")),data.get("url"),data.get("sha256"),Long.parseLong(data.get("size")));
 }
 private AppUpdatePushPayload(){}
}
