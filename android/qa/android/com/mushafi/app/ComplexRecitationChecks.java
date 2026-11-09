package com.mushafi.app;
import android.app.*;import android.content.*;import android.media.*;import java.io.*;import java.lang.reflect.*;import org.json.*;
/** Actual publisher MP3 fixtures, isolated from account and network data. */
public final class ComplexRecitationChecks {
 interface Check{boolean get()throws Exception;}
 static void until(Check c)throws Exception{long end=System.currentTimeMillis()+60000;while(System.currentTimeMillis()<end){if(c.get())return;Thread.sleep(120);}throw new Exception("complex audio timeout");}
 static void need(boolean b,String message)throws Exception{if(!b)throw new Exception(message);}
 static Object field(Object o,String n)throws Exception{Field f=o.getClass().getDeclaredField(n);f.setAccessible(true);return f.get(o);}
 static JSONObject state(SurahPlaybackService s)throws Exception{return new JSONObject(s.snapshot());}
 static String key(JSONArray rows,int at){String key="";for(int i=0;i<rows.length();i++){JSONArray r=rows.optJSONArray(i);if(r.optInt(1)>at)break;key="1:"+r.optInt(0);}return key;}
 public static void run(Instrumentation test)throws Exception{
  Context context=test.getTargetContext();int[] ids={133,1001,1002,1003,1004};String[] names={"muaiqly","huthify","ayyoub","muhanna","akhdar"};
  for(int i=0;i<ids.length;i++){File f=new File(context.getFilesDir(),"surah-audio/kfgqpc-v1/"+ids[i]+"/1.mp3");f.getParentFile().mkdirs();try(InputStream in=test.getContext().getAssets().open("complex55/"+names[i]+"-1.mp3");FileOutputStream out=new FileOutputStream(f)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}
  File stale=new File(context.getFilesDir(),"surah-audio/133/1.mp3");stale.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(stale)){out.write(new byte[1024]);}
  MainActivity a=(MainActivity)test.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));until(()->field(a,"surahService")!=null);SurahPlaybackService service=(SurahPlaybackService)field(a,"surahService");JSONObject catalog=(JSONObject)field(service,"catalog");
  try{for(int id:ids){JSONObject track=catalog.getJSONObject(String.valueOf(id)).getJSONObject("chapters").getJSONObject("1");JSONArray rows=track.getJSONArray("timings");test.runOnMainSync(()->service.play(id,1,0));until(()->"playing".equals(state(service).optString("status"))||"error".equals(state(service).optString("status")));need(!"error".equals(state(service).optString("status")),"Publisher file plays for "+id);need(Math.abs(state(service).optInt("duration")-track.optInt("duration"))<250,"Actual MP3 duration matches timing source "+id);Object player=field(service,"player");int target=rows.getJSONArray(3).getInt(1)+300;test.runOnMainSync(()->service.seek(target,"complex-"+id));until(()->!state(service).optBoolean("seeking")&&("complex-"+id).equals(state(service).optString("seekToken")));need(state(service).optString("key").equals(key(rows,state(service).optInt("position"))),"Actual seek verse "+id);need(Math.abs(state(service).optInt("position")-target)<1500,"Actual seek position "+id);need(field(service,"player")==player,"Single continuous player "+id);test.runOnMainSync(()->{service.pause();service.seek(10000,"older");service.seek(20000,"middle");service.seek(target,"latest");});until(()->!state(service).optBoolean("seeking")&&"latest".equals(state(service).optString("seekToken")));need("paused".equals(state(service).optString("status")),"Paused latest seek stays paused "+id);need(state(service).optString("key").equals(key(rows,state(service).optInt("position"))),"Latest actual verse "+id);test.runOnMainSync(service::stop);}}
  finally{test.runOnMainSync(service::stop);stale.delete();}
 }
}
