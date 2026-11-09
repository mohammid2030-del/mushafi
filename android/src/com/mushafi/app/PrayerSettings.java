package com.mushafi.app;
import android.content.Context;
import org.json.*;
import java.util.*;

/** One validated configuration shared by the screen and Android alarms. */
public final class PrayerSettings {
 public static final String[] KEYS={"fajr","dhuhr","asr","maghrib","isha"};
 public static final String[] NAMES={"الفجر","الظهر","العصر","المغرب","العشاء"};
 public static final String[] VOICES={"afasy","nafees","mansour","mustafa","silent"};
 public static final String[] METHODS={"AUTO","UMM_AL_QURA","MUSLIM_WORLD_LEAGUE","EGYPTIAN","KARACHI","DUBAI","KUWAIT","QATAR","SINGAPORE","NORTH_AMERICA"};
 public JSONObject json;
 public PrayerSettings(JSONObject input) throws JSONException {
  json=new JSONObject();json.put("version",1);
  json.put("confirmed",input.optBoolean("confirmed",false));json.put("enabled",input.optBoolean("enabled",false));
  String city=input.optString("city","الرياض").trim();if(city.length()<1||city.length()>80)throw new JSONException("city");json.put("city",city);
  double lat=input.optDouble("latitude",24.7136),lon=input.optDouble("longitude",46.6753);
  if(Double.isNaN(lat)||Double.isInfinite(lat)||Math.abs(lat)>89||Double.isNaN(lon)||Double.isInfinite(lon)||Math.abs(lon)>180)throw new JSONException("coordinates");
  json.put("latitude",lat);json.put("longitude",lon);
  String zone=input.optString("timezone","Asia/Riyadh");if(!Arrays.asList(TimeZone.getAvailableIDs()).contains(zone))throw new JSONException("timezone");json.put("timezone",zone);
  String method=input.optString("method","UMM_AL_QURA");boolean automatic=input.optBoolean("autoMethod",!input.has("method")||method.equals("AUTO"));if(!Arrays.asList(METHODS).contains(method))throw new JSONException("method");if(method.equals("AUTO"))method="UMM_AL_QURA";json.put("autoMethod",automatic);json.put("method",automatic?PrayerRegion.method(zone):method);json.put("onlineSource",input.optBoolean("onlineSource",true));
  String asr=input.optString("asr","SHAFI");if(!asr.equals("SHAFI")&&!asr.equals("HANAFI"))throw new JSONException("asr");json.put("asr",asr);
  String ramadan=input.optString("ramadan","auto");if(!Arrays.asList("auto","on","off").contains(ramadan))throw new JSONException("ramadan");json.put("ramadan",ramadan);
  json.put("duhaOffset",bounded(input,"duhaOffset",15,10,30));json.put("zawalOffset",bounded(input,"zawalOffset",10,5,20));
  json.put("reminderMinutes",bounded(input,"reminderMinutes",5,1,15));
  String voice=input.optString("voice","afasy");if(voice.equals("ali_mulla"))voice="afasy";if(!Arrays.asList(VOICES).contains(voice))throw new JSONException("voice");json.put("voice",voice);
  JSONObject offsets=input.optJSONObject("offsets"),rows=input.optJSONObject("prayers"),out=new JSONObject(),tune=new JSONObject();
  int[] defaults={20,20,20,10,20};
  for(int i=0;i<KEYS.length;i++){String k=KEYS[i];JSONObject row=rows==null?null:rows.optJSONObject(k);if(row==null)row=new JSONObject();JSONObject r=new JSONObject();r.put("iqama",bounded(row,"iqama",defaults[i],0,120));r.put("adhan",row.optBoolean("adhan",true));r.put("reminder",row.optBoolean("reminder",true));r.put("atIqama",row.optBoolean("atIqama",true));out.put(k,r);tune.put(k,bounded(offsets==null?new JSONObject():offsets,k,0,-30,30));}
  tune.put("sunrise",bounded(offsets==null?new JSONObject():offsets,"sunrise",0,-30,30));json.put("prayers",out);json.put("offsets",tune);
 }
 private int bounded(JSONObject o,String key,int fallback,int min,int max)throws JSONException{if(!o.has(key))return fallback;Object raw=o.get(key);if(!(raw instanceof Number))throw new JSONException(key);double d=((Number)raw).doubleValue();if(Double.isNaN(d)||d!=Math.rint(d)||d<min||d>max)throw new JSONException(key);return(int)d;}
 public static synchronized PrayerSettings load(Context c){
  PrayerRemoteSource.init(c);
  android.content.SharedPreferences prefs=c.getSharedPreferences("prayer_times",0);
  PrayerSettings settings;
  try{settings=new PrayerSettings(new JSONObject(prefs.getString("settings","{}")));}
  catch(Exception e){try{settings=new PrayerSettings(new JSONObject());}catch(Exception impossible){throw new IllegalStateException(impossible);}}
  if(!prefs.getBoolean("asrIqama20_v1",false)){
   try{if(settings.row("asr").optInt("iqama")==15)settings.row("asr").put("iqama",20);}catch(JSONException impossible){throw new IllegalStateException(impossible);}
   prefs.edit().putString("settings",settings.json.toString()).putBoolean("asrIqama20_v1",true).commit();
  }
  if(!prefs.getBoolean("regional_method_v1",false)){try{if(settings.json.optString("method").equals("UMM_AL_QURA")){settings.json.put("autoMethod",true).put("method",PrayerRegion.method(settings.json.optString("timezone")));}}catch(JSONException impossible){throw new IllegalStateException(impossible);}prefs.edit().putString("settings",settings.json.toString()).putBoolean("regional_method_v1",true).commit();}
  return settings;
 }

 public void save(Context c){c.getSharedPreferences("prayer_times",0).edit().putString("settings",json.toString()).commit();MushafiWidget.refresh(c);}
 public JSONObject row(String key){return json.optJSONObject("prayers").optJSONObject(key);}
 public boolean enabled(){return json.optBoolean("enabled")&&json.optBoolean("confirmed");}
}
