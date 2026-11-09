package com.mushafi.app;
import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.view.KeyEvent;
import android.os.*;

/** Dismissible adhan audio; alarm routing is opt-in. Never changes volume, ringer mode, or interruption policy. */
public class AdhanPlaybackService extends Service implements AudioManager.OnAudioFocusChangeListener {
 public static final String STOP="com.mushafi.app.STOP_ADHAN",CHANNEL="prayer_alarm_audio_v1";
 static final int NOTICE=7910;
 private static volatile AdhanPlaybackService active;
 private MediaSession volumeSession;private BroadcastReceiver volumeChanges;
 private MediaPlayer player;private AudioManager audio;private AudioFocusRequest focusRequest;private final Handler handler=new Handler(Looper.getMainLooper());
 private boolean systemFallback,played;private volatile boolean discardFinal;private int lastStartId;private PrayerSettings settings;private String key="dhuhr";private long at;private boolean test,finished,alarmMode;private BroadcastReceiver noisy;
 public static boolean enabled(Context c){return c.getSharedPreferences("prayer_audio",0).getBoolean("onSilent",false);}
 static void state(Context c,String status,String error){c.getSharedPreferences("prayer_audio",0).edit().putString("playback",status).putString("error",error).apply();}
 static boolean allowed(Context c){if(!PrayerScheduler.notifications(c))return false;if(Build.VERSION.SDK_INT<26)return true;NotificationChannel ch=((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).getNotificationChannel(CHANNEL);return ch!=null&&ch.getImportance()!=NotificationManager.IMPORTANCE_NONE;}
 /** Foreground key handling complements the active session's background volume routing. */
 public static boolean stopFromVolumeKey(){AdhanPlaybackService service=active;if(service==null||service.finished)return false;service.handler.post(service::finishPlayback);return true;}
 static boolean audible(Context c){AudioManager audio=(AudioManager)c.getSystemService(Context.AUDIO_SERVICE);return enabled(c)||(audio.getRingerMode()==AudioManager.RINGER_MODE_NORMAL&&audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION)>0);}
 public static void cancel(Context c){AdhanPlaybackService service=active;if(service!=null)service.discardFinal=true;c.stopService(new Intent(c,AdhanPlaybackService.class));}
 public static void reconcile(Context c){AdhanPlaybackService service=active;if(service!=null)service.handler.post(()->{if(!service.stillAllowed()){service.discardFinal=true;service.finishPlayback();}});}
 private boolean stillAllowed(){PrayerSettings current=PrayerSettings.load(this);return alarmMode==enabled(this)&&allowed(this,settings)&&current.json.optString("voice").equals(settings.json.optString("voice"))&&(test||(current.enabled()&&current.row(key)!=null&&current.row(key).optBoolean("adhan")));}
 private void armVolumeStop(){
  active=this;
  // A relative volume provider receives a button press even at min/max, where no
  // stream-volume change occurs. It is installed only for this short-lived alarm.
  volumeSession=new MediaSession(this,"MushafiAdhan");
  volumeSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS|MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
  volumeSession.setCallback(new MediaSession.Callback(){
   @Override public void onPause(){finishPlayback();}
   @Override public void onStop(){finishPlayback();}
   @Override public boolean onMediaButtonEvent(Intent intent){KeyEvent event=intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);if(event!=null&&event.getAction()==KeyEvent.ACTION_DOWN){finishPlayback();return true;}return super.onMediaButtonEvent(intent);}
  },handler);
  int stream=alarmMode?AudioManager.STREAM_ALARM:AudioManager.STREAM_NOTIFICATION;
  volumeSession.setPlaybackToRemote(new VolumeProvider(VolumeProvider.VOLUME_CONTROL_RELATIVE,Math.max(1,audio.getStreamMaxVolume(stream)),audio.getStreamVolume(stream)){
   @Override public void onAdjustVolume(int direction){if(direction!=AudioManager.ADJUST_SAME)handler.post(AdhanPlaybackService.this::finishPlayback);}
   @Override public void onSetVolumeTo(int value){handler.post(AdhanPlaybackService.this::finishPlayback);}
  });
  volumeSession.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_STOP|PlaybackState.ACTION_PAUSE).setState(PlaybackState.STATE_PLAYING,0,1).build());
  volumeSession.setActive(true);
  // Some device volume panels adjust a stream directly instead of routing keys
  // through the active session. Ignore unchanged/initial values.
  volumeChanges=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent intent){if(intent.hasExtra("android.media.EXTRA_VOLUME_STREAM_VALUE")&&intent.hasExtra("android.media.EXTRA_PREV_VOLUME_STREAM_VALUE")&&intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_VALUE",-1)!=intent.getIntExtra("android.media.EXTRA_PREV_VOLUME_STREAM_VALUE",-1))finishPlayback();}};
  IntentFilter filter=new IntentFilter("android.media.VOLUME_CHANGED_ACTION");
  if(Build.VERSION.SDK_INT>=33)registerReceiver(volumeChanges,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(volumeChanges,filter);
 }
 static boolean allowed(Context c,PrayerSettings settings){if(enabled(c))return allowed(c);if(!PrayerScheduler.notifications(c))return false;if(Build.VERSION.SDK_INT<26)return true;NotificationChannel ch=((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).getNotificationChannel(PrayerScheduler.notificationChannel(c,settings,"adhan"));return ch!=null&&ch.getImportance()>=NotificationManager.IMPORTANCE_DEFAULT&&ch.getSound()!=null;}
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onCreate(){super.onCreate();audio=(AudioManager)getSystemService(AUDIO_SERVICE);noisy=new BroadcastReceiver(){public void onReceive(Context c,Intent i){finishPlayback();}};if(Build.VERSION.SDK_INT>=33)registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(noisy,new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));}
 @Override public int onStartCommand(Intent intent,int flags,int startId){lastStartId=startId;if(intent==null||STOP.equals(intent.getAction())){finishPlayback();return START_NOT_STICKY;}release();finished=false;discardFinal=false;systemFallback=false;played=false;active=this;settings=PrayerSettings.load(this);key=intent.getStringExtra("key");if(key==null)key="dhuhr";at=intent.getLongExtra("at",System.currentTimeMillis());test=intent.getBooleanExtra("test",false);alarmMode=enabled(this);PrayerScheduler.channels(this,settings);startForeground(NOTICE,PrayerScheduler.notification(this,settings,key,"adhan",at,test,alarmMode,true));
  if(settings.json.optString("voice").equals("silent")||!stillAllowed()){discardFinal=true;finishPlayback();return START_NOT_STICKY;}
  NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(nm.getCurrentInterruptionFilter()==NotificationManager.INTERRUPTION_FILTER_NONE||(!alarmMode&&nm.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)){state(this,"stopped","وضع عدم الإزعاج يمنع صوت المنبّهات حاليًا.");finishPlayback();return START_NOT_STICKY;}
  if((!alarmMode&&audio.getRingerMode()!=AudioManager.RINGER_MODE_NORMAL)||audio.getStreamVolume(alarmMode?AudioManager.STREAM_ALARM:AudioManager.STREAM_NOTIFICATION)==0){state(this,"stopped",alarmMode?"صوت المنبّهات مكتوم. ارفعه من إعدادات الصوت لتسمع الأذان.":"الهاتف صامت أو صوت التنبيهات مكتوم؛ لم يُشغّل الأذان.");finishPlayback();return START_NOT_STICKY;}
  if(audio.getMode()==AudioManager.MODE_IN_CALL||audio.getMode()==AudioManager.MODE_IN_COMMUNICATION){state(this,"stopped","لم يُشغّل الأذان أثناء المكالمة.");finishPlayback();return START_NOT_STICKY;}
  try{AudioAttributes attributes=new AudioAttributes.Builder().setUsage(alarmMode?AudioAttributes.USAGE_ALARM:AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();int granted;if(Build.VERSION.SDK_INT>=26){focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(this).build();granted=audio.requestAudioFocus(focusRequest);}else granted=audio.requestAudioFocus(this,alarmMode?AudioManager.STREAM_ALARM:AudioManager.STREAM_NOTIFICATION,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);if(granted!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw new IllegalStateException("focus");
   final MediaPlayer next=new MediaPlayer();player=next;next.setAudioAttributes(attributes);next.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);String voice=settings.json.optString("voice");Uri sound=Uri.parse("android.resource://"+getPackageName()+"/raw/adhan_"+voice);if(!alarmMode&&Build.VERSION.SDK_INT>=26){NotificationChannel channel=nm.getNotificationChannel(PrayerScheduler.notificationChannel(this,settings,"adhan"));if(channel!=null&&channel.getSound()!=null)sound=channel.getSound();}next.setDataSource(this,sound);next.setOnPreparedListener(p->{if(player!=p)return;if(!stillAllowed()){discardFinal=true;finishPlayback();return;}try{p.start();played=true;armVolumeStop();state(this,"playing","");}catch(Exception failure){systemFallback=!played;state(this,"error","تعذر تشغيل ملف الأذان؛ استُخدم إشعار النظام وفق إعداداته.");finishPlayback();}});next.setOnCompletionListener(p->{if(player==p)finishPlayback();});next.setOnErrorListener((p,a,b)->{if(player==p){systemFallback=!played;state(this,"error","تعذر تشغيل الأذان الآن؛ جرّب الصوت من إعدادات الصلاة.");finishPlayback();}return true;});state(this,"loading","");next.prepareAsync();handler.postDelayed(this::finishPlayback,60000);
  }catch(Exception e){systemFallback=!played;state(this,"error","تعذر بدء صوت الأذان؛ استُخدم إشعار النظام وفق إعداداته.");finishPlayback();}return START_NOT_STICKY;
 }
 @Override public void onAudioFocusChange(int change){if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)finishPlayback();}
 private void release(){if(active==this)active=null;if(volumeChanges!=null){try{unregisterReceiver(volumeChanges);}catch(Exception ignored){}volumeChanges=null;}if(volumeSession!=null){volumeSession.setActive(false);volumeSession.release();volumeSession=null;}handler.removeCallbacksAndMessages(null);MediaPlayer old=player;player=null;if(old!=null){try{old.release();}catch(Exception ignored){}}if(audio!=null){if(Build.VERSION.SDK_INT>=26&&focusRequest!=null)audio.abandonAudioFocusRequest(focusRequest);else audio.abandonAudioFocus(this);}focusRequest=null;}
 private void finishPlayback(){if(finished)return;finished=true;release();String error=getSharedPreferences("prayer_audio",0).getString("error","");state(this,"stopped",error);stopForeground(false);if(settings!=null){NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(systemFallback&&!discardFinal&&stillAllowed()){manager.cancel(NOTICE);int fallbackId=test?7099:Math.abs((key+"adhan").hashCode());manager.cancel(fallbackId);manager.notify(fallbackId,PrayerScheduler.notification(this,settings,key,"adhan",at,test,false,false));}else if(discardFinal||(!test&&!PrayerSettings.load(this).enabled()))manager.cancel(NOTICE);else manager.notify(NOTICE,PrayerScheduler.notification(this,settings,key,"adhan",at,test,alarmMode,false,true));}stopSelf(lastStartId);}
 @Override public void onDestroy(){if(!finished)finishPlayback();try{unregisterReceiver(noisy);}catch(Exception ignored){}super.onDestroy();}
}
