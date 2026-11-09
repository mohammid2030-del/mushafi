package com.mushafi.app;
import android.app.*;import android.content.*;import android.widget.*;import android.webkit.*;import java.lang.reflect.*;import java.util.concurrent.atomic.*;
/** Native language, notification and reused launch-curtain regression. */
public final class LocaleChecks {
 static void need(boolean value,String message)throws Exception{if(!value)throw new Exception(message);}
 static String value(Notification n,String key){return String.valueOf(n.extras.getCharSequence(key));}
 public static void run(Instrumentation i)throws Exception{
  Context c=i.getTargetContext();String old=c.getSharedPreferences("ui-language",0).getString("language","system");LaunchHarnessActivity activity=null;LaunchScreen[] screen={null};
  try{
   UiLocale.save(c,"en");need(UiLocale.language(c).equals("en"),"English preference persisted");need(UiLocale.text(c,"الفجر").equals("Fajr"),"prayer name");need(UiLocale.text(c,"حان وقت صلاة {0}","Fajr").equals("It is time for Fajr prayer"),"native interpolation");need(UiLocale.text(c,"البقرة").equals("Al-Baqarah"),"surah UI name");
   PrayerSettings s=PrayerSettings.load(c);Notification n=PrayerScheduler.notification(c,s,"fajr","adhan",System.currentTimeMillis(),false,false,false);
   need(value(n,Notification.EXTRA_TITLE).equals("It is time for Fajr prayer"),"English notification title");need(!value(n,Notification.EXTRA_TEXT).matches(".*[\\u0621-\\u064a].*"),"English notification body");
   n=PrayerScheduler.notification(c,s,"asr","reminder",System.currentTimeMillis(),true,false,false);need(value(n,Notification.EXTRA_TITLE).equals("Prayer notification test")||value(n,Notification.EXTRA_TITLE).equals("Prayer alert test")||value(n,Notification.EXTRA_TITLE).equals(UiLocale.text(c,"تجربة تنبيه الصلاة")),"test notification");
   UiLocale.save(c,"ur");need(UiLocale.language(c).equals("ur"),"Urdu preference persisted");need(UiLocale.normalize("ur-PK").equals("ur"),"Urdu system locale");need(UiLocale.text(c,"الأذكار").equals("اذکار"),"Urdu catalog loaded");need(UiLocale.text(c,"الفجر").equals("فجر"),"Urdu prayer name");
   UiLocale.save(c,"ar");need(value(PrayerScheduler.notification(c,s,"fajr","adhan",System.currentTimeMillis(),false,false,false),Notification.EXTRA_TITLE).equals("حان وقت صلاة الفجر"),"Arabic restored");
   UiLocale.save(c,"invalid");need(UiLocale.language(c).equals("ar"),"invalid preference ignored");
   activity=(LaunchHarnessActivity)i.startActivitySync(new Intent(c,LaunchHarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));final LaunchHarnessActivity a=activity;
   i.runOnMainSync(()->{screen[0]=new LaunchScreen(a,a.root,()->{},()->{});screen[0].show();screen[0].resume();});
   Field field=LaunchScreen.class.getDeclaredField("presentation");field.setAccessible(true);WebView web=(WebView)field.get(screen[0]);long deadline=System.currentTimeMillis()+30000;AtomicReference<String> text=new AtomicReference<>("");
   while(System.currentTimeMillis()<deadline){i.runOnMainSync(()->web.evaluateJavascript("document.querySelector('h1')&&document.querySelector('h1').textContent",text::set));Thread.sleep(250);if(text.get().contains("جار"))break;}need(text.get().contains("جار"),"Arabic loading copy");
   UiLocale.save(c,"en");i.runOnMainSync(()->screen[0].show());deadline=System.currentTimeMillis()+30000;
   while(System.currentTimeMillis()<deadline){i.runOnMainSync(()->web.evaluateJavascript("document.querySelector('h1')&&document.querySelector('h1').textContent",text::set));Thread.sleep(250);if(text.get().contains("Preparing your Mushafi"))break;}need(text.get().contains("Preparing your Mushafi"),"warm curtain follows changed language");
  }finally{UiLocale.save(c,old);final LaunchHarnessActivity a=activity;i.runOnMainSync(()->{if(screen[0]!=null)screen[0].destroy();if(a!=null)a.finish();});}
 }
}
