package com.mushafi.app;
import android.content.*;import org.json.*;import java.io.*;import java.net.*;import java.text.*;import java.util.*;
/** Validated AlAdhan monthly cache. Calculators/alarms never block on the network. */
public final class PrayerRemoteSource {
 private static Context app;private static volatile JSONObject cache=new JSONObject();private static boolean busy;private static long attempted;private static Runnable listener;
 private static final String[] KEYS={"fajr","sunrise","dhuhr","asr","maghrib","isha"},REMOTE={"Fajr","Sunrise","Dhuhr","Asr","Maghrib","Isha"};
 public static synchronized void init(Context c){if(app!=null)return;app=c.getApplicationContext();try{cache=new JSONObject(app.getSharedPreferences("prayer_source",0).getString("cache","{}"));}catch(Exception ignored){}}
 private static String profile(PrayerSettings s){return (s.json.optBoolean("autoMethod")?"AUTO":s.json.optString("method"))+"|"+s.json.optString("asr")+"|"+s.json.optString("timezone");}
 private static boolean matches(JSONObject data,PrayerSettings s){if(!s.json.optBoolean("onlineSource",true)||!profile(s).equals(data.optString("profile")))return false;double lat=s.json.optDouble("latitude"),lon=s.json.optDouble("longitude"),a=Math.toRadians(lat-data.optDouble("latitude",999)),b=Math.toRadians(lon-data.optDouble("longitude",999));double km=Math.sqrt(a*a+Math.pow(b*Math.cos(Math.toRadians(lat)),2))*6371;return km<=.5;}
 private static int methodId(String method){switch(method){case "UMM_AL_QURA":return 4;case "EGYPTIAN":return 5;case "KARACHI":return 1;case "DUBAI":return 16;case "KUWAIT":return 9;case "QATAR":return 10;case "SINGAPORE":return 11;case "NORTH_AMERICA":return 2;default:return 3;}}
 public static JSONObject day(PrayerSettings settings,Calendar calendar)throws JSONException{JSONObject result=new JSONObject().put("date",String.format(Locale.US,"%04d-%02d-%02d",calendar.get(Calendar.YEAR),calendar.get(Calendar.MONTH)+1,calendar.get(Calendar.DAY_OF_MONTH)));apply(settings,calendar,result);if(!result.optString("source").equals("aladhan"))return null;result.put("duha",result.getLong("sunrise")+settings.json.optInt("duhaOffset")*60000L).put("duhaEnd",result.getLong("dhuhr")-settings.json.optInt("zawalOffset")*60000L);return result;}
 public static void apply(PrayerSettings settings,Calendar calendar,JSONObject day)throws JSONException{
  JSONObject current=cache,days=current.optJSONObject("days"),row=matches(current,settings)&&days!=null?days.optJSONObject(day.getString("date")):null;
  day.put("source","offline").put("sourceMethod",PrayerRegion.method(settings));if(row==null)return;
  JSONObject offsets=settings.json.getJSONObject("offsets");int method=row.optInt("methodId");boolean extra=false;
  for(String key:KEYS){long at=row.getLong(key);if(key.equals("isha")&&method==4){String mode=settings.json.optString("ramadan");extra=mode.equals("on")||(mode.equals("auto")&&row.getLong("isha")-row.getLong("maghrib")>=110*60000L);if(!mode.equals("auto"))at=row.getLong("maghrib")+(extra?120:90)*60000L;}day.put(key,at+offsets.optInt(key)*60000L);}
  long previous=0;for(String key:KEYS){long at=day.getLong(key);if(at<=previous)throw new JSONException("unordered source times");previous=at;}
  day.put("ramadanAdjustment",extra).put("source","aladhan").put("sourceMethod",row.getString("methodName")).put("sourceMethodId",method).put("sourceUpdated",current.optLong("fetchedAt"));
 }
 public static synchronized void refresh(Context context,PrayerSettings settings,Runnable callback){
  init(context);if(!settings.json.optBoolean("confirmed")||!settings.json.optBoolean("onlineSource",true))return;
  if(busy){if(callback!=null)listener=callback;return;}
  long now=System.currentTimeMillis();boolean complete=matches(cache,settings)&&now-cache.optLong("fetchedAt")<86400000L;JSONObject days=cache.optJSONObject("days");for(int n=-1;n<=2&&complete;n++){Calendar date=PrayerCalculator.day(settings,now,n);String key=String.format(Locale.US,"%04d-%02d-%02d",date.get(Calendar.YEAR),date.get(Calendar.MONTH)+1,date.get(Calendar.DAY_OF_MONTH));complete=days!=null&&days.has(key);}
  if(complete||now-attempted<30000)return;attempted=now;busy=true;listener=callback;
  final Context c=app;final PrayerSettings requested;try{requested=new PrayerSettings(new JSONObject(settings.json.toString()));}catch(Exception e){busy=false;return;}
  new Thread(()->{boolean updated=false;try{
   JSONObject result=new JSONObject().put("profile",profile(requested)).put("latitude",requested.json.getDouble("latitude")).put("longitude",requested.json.getDouble("longitude")).put("fetchedAt",System.currentTimeMillis()),rows=new JSONObject();Set<String> months=new LinkedHashSet<>();for(int n=-1;n<=2;n++){Calendar date=PrayerCalculator.day(requested,System.currentTimeMillis(),n);months.add(date.get(Calendar.YEAR)+"/"+(date.get(Calendar.MONTH)+1));}
   for(String month:months){if(!matches(result,PrayerSettings.load(c)))throw new IOException("settings changed");String query="latitude="+requested.json.getDouble("latitude")+"&longitude="+requested.json.getDouble("longitude")+"&school="+(requested.json.optString("asr").equals("HANAFI")?1:0)+"&timezonestring="+URLEncoder.encode(requested.json.getString("timezone"),"UTF-8");if(!requested.json.optBoolean("autoMethod"))query+="&method="+methodId(requested.json.getString("method"));
    JSONObject parsed=parseCalendar(get("https://api.aladhan.com/v1/calendar/"+month+"?"+query+"&iso8601=true"),requested,month);for(Iterator<String> keys=parsed.keys();keys.hasNext();){String key=keys.next();rows.put(key,parsed.getJSONObject(key));}
   }

   result.put("days",rows).put("fetchedAt",System.currentTimeMillis());PrayerSettings latest=PrayerSettings.load(c);if(matches(result,latest)&&c.getSharedPreferences("prayer_source",0).edit().putString("cache",result.toString()).commit()){cache=result;updated=true;}
  }catch(Exception ignored){}finally{Runnable notify;synchronized(PrayerRemoteSource.class){busy=false;notify=listener;listener=null;}if(updated){PrayerScheduler.schedule(c);MushafiWidget.updateAll(c);}if(notify!=null)notify.run();}},"prayer-source").start();
 }
 public static JSONObject parseCalendar(JSONObject payload,PrayerSettings requested,String month)throws Exception{
  String[] target=month.split("/");int year=Integer.parseInt(target[0]),number=Integer.parseInt(target[1]);if(number<1||number>12)throw new IOException("invalid month");Calendar cal=new GregorianCalendar(TimeZone.getTimeZone("UTC"),Locale.US);cal.clear();cal.set(year,number-1,1);int length=cal.getActualMaximum(Calendar.DATE);JSONArray data=payload.getJSONArray("data");if(payload.optInt("code")!=200||data.length()!=length)throw new IOException("incomplete calendar");JSONObject rows=new JSONObject();
  for(int i=0;i<data.length();i++){
   JSONObject entry=data.getJSONObject(i),meta=entry.getJSONObject("meta"),method=meta.getJSONObject("method"),times=entry.getJSONObject("timings"),row=new JSONObject();String raw=entry.getJSONObject("date").getJSONObject("gregorian").getString("date");if(!raw.matches("[0-9]{2}-[0-9]{2}-[0-9]{4}"))throw new IOException("invalid date");String[] parts=raw.split("-");String key=parts[2]+"-"+parts[1]+"-"+parts[0];if(!key.startsWith(String.format(Locale.US,"%04d-%02d-",year,number))||rows.has(key))throw new IOException("wrong or duplicate date");
   if(Math.abs(meta.getDouble("latitude")-requested.json.getDouble("latitude"))>.001||Math.abs(meta.getDouble("longitude")-requested.json.getDouble("longitude"))>.001)throw new IOException("wrong coordinates");String zone=meta.getString("timezone");if(!Arrays.asList(TimeZone.getAvailableIDs()).contains(zone))throw new IOException("invalid zone");if(!zone.equals(requested.json.getString("timezone"))&&!TimeZone.getTimeZone(zone).hasSameRules(TimeZone.getTimeZone(requested.json.getString("timezone"))))throw new IOException("wrong zone");String school=requested.json.optString("asr").equals("HANAFI")?"HANAFI":"STANDARD";if(!meta.getString("school").equals(school))throw new IOException("wrong school");int id=method.getInt("id");if(id<0||id>99||(!requested.json.optBoolean("autoMethod")&&id!=methodId(requested.json.getString("method"))))throw new IOException("wrong method");long previous=0;
   for(int j=0;j<KEYS.length;j++){
    String clock=times.getString(REMOTE[j]);if(!clock.matches(key+"T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})"))throw new IOException("invalid ISO time");String normalized=clock.endsWith("Z")?clock.substring(0,clock.length()-1)+"+0000":clock.substring(0,clock.length()-3)+clock.substring(clock.length()-2);SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ",Locale.US);format.setLenient(false);long at=format.parse(normalized).getTime();if(j==KEYS.length-1&&at<=previous)at+=86400000L;if(at<=previous)throw new IOException("unordered times");previous=at;row.put(KEYS[j],at);
   }
   String name=method.getString("name");if(name.isEmpty()||name.length()>200)throw new IOException("invalid method name");row.put("methodId",id).put("methodName",name);rows.put(key,row);
  }
  return rows;
 }
 private static JSONObject get(String url)throws Exception{
  HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","Mushafi-Prayer/1");try{if(connection.getResponseCode()!=200)throw new IOException("source unavailable");try(InputStream input=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[8192];int n;while((n=input.read(bytes))!=-1){if(out.size()+n>524288)throw new IOException("calendar too large");out.write(bytes,0,n);}return new JSONObject(out.toString("UTF-8"));}}finally{connection.disconnect();}
 }
}
