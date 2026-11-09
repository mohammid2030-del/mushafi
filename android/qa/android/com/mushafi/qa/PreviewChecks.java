package com.mushafi.qa;
import android.app.*;import android.content.*;import android.media.*;import com.mushafi.app.*;import java.lang.reflect.*;import org.json.*;
final class PreviewChecks {
 interface Check{boolean ready()throws Exception;}
 static void until(Check check)throws Exception{long end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(check.ready())return;Thread.sleep(100);}throw new Exception("timeout");}
 static void need(boolean b,String why)throws Exception{if(!b)throw new Exception(why);}
 static void run(Instrumentation i)throws Exception{Context c=i.getTargetContext();Activity activity=i.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));MainActivity main=(MainActivity)activity;Field f=MainActivity.class.getDeclaredField("surahService");f.setAccessible(true);until(()->f.get(main)!=null);SurahPlaybackService service=(SurahPlaybackService)f.get(main);i.runOnMainSync(()->service.stop());i.runOnMainSync(()->service.pause());need(new JSONObject(service.snapshot()).getString("status").equals("stopped"),"idle pause must remain stopped");Field p=MainActivity.class.getDeclaredField("prayerPreview");p.setAccessible(true);
 for(String voice:PrayerSettings.VOICES){if(voice.equals("silent"))continue;PrayerSettings settings=new PrayerSettings(new JSONObject().put("voice",voice));need(settings.json.getString("voice").equals(voice),"accepted voice "+voice);main.previewPrayerVoice(voice);until(()->p.get(main)!=null&&((MediaPlayer)p.get(main)).isPlaying());MediaPlayer player=(MediaPlayer)p.get(main);need(player.getDuration()>5000&&player.getDuration()<30000,"valid short clip "+voice);need(new JSONObject(service.snapshot()).getString("status").equals("stopped"),"no phantom Quran player "+voice);main.stopPrayerVoice();until(()->p.get(main)==null);}
 }
}
