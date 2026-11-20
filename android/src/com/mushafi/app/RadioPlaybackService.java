package com.mushafi.app;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.net.Uri;
import android.os.*;
import java.util.*;

/** Live Quran radio, played natively so it keeps going with the screen off (the page's web view cannot reach the web). */
public class RadioPlaybackService extends Service implements AudioManager.OnAudioFocusChangeListener {
 public static final String PLAY = "radio.PLAY", STOP = "radio.STOP";
 public interface Listener { void onRadio(String json); }
 static volatile Listener listener;
 static volatile String snapshot = "{\"id\":\"\",\"status\":\"stopped\"}";
 private static final String CHANNEL = "radio_playback_v1";
 private static final int NOTIFICATION = 7810;
 private MediaPlayer player;
 private MediaSession session;
 private AudioManager focus;
 private String id = "", title = "", place = "", status = "stopped";
 private boolean foreground, pausedByFocus;

 /** Only the known radio streams (Radiojar) may be played. */
 static boolean allowed(String url) {
  try {
   Uri u = Uri.parse(url);
   String h = u.getHost();
   return "https".equals(u.getScheme()) && h != null && (h.equals("radiojar.com") || h.endsWith(".radiojar.com"));
  } catch (Exception e) { return false; }
 }

 @Override public IBinder onBind(Intent intent) { return null; }

 @Override public void onCreate() {
  super.onCreate();
  focus = (AudioManager) getSystemService(AUDIO_SERVICE);
  session = new MediaSession(this, "MushafiRadio");
  session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
  session.setCallback(new MediaSession.Callback() {
   @Override public void onPause() { stopRadio(); }
   @Override public void onStop() { stopRadio(); }
  });
 }

 @Override public int onStartCommand(Intent intent, int flags, int startId) {
  String action = intent == null ? null : intent.getAction();
  if (PLAY.equals(action)) start(intent.getStringExtra("id"), intent.getStringExtra("url"), intent.getStringExtra("title"), intent.getStringExtra("place"));
  else stopRadio();
  return START_NOT_STICKY;
 }

 private void start(String newId, String url, String newTitle, String newPlace) {
  release();
  id = newId == null ? "" : newId;
  title = newTitle == null ? "" : newTitle;
  place = newPlace == null ? "" : newPlace;
  status = "loading";
  goForeground();
  if (url == null || !allowed(url)) { fail(); return; }
  if (focus.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail(); return; }
  try {
   final MediaPlayer next = new MediaPlayer();
   player = next;
   next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
   next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
   Map<String, String> headers = new HashMap<>();
   headers.put("User-Agent", "Mushafi/Android");
   next.setDataSource(this, Uri.parse(url), headers);
   next.setOnPreparedListener(mp -> { if (player != mp) return; mp.start(); status = "playing"; publish(); });
   next.setOnInfoListener((mp, what, extra) -> {
    if (player != mp) return false;
    if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) { status = "loading"; publish(); }
    else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) { status = "playing"; publish(); }
    return false;
   });
   next.setOnErrorListener((mp, what, extra) -> { if (player == mp) fail(); return true; });
   next.setOnCompletionListener(mp -> { if (player == mp) fail(); });
   next.prepareAsync();
   publish();
  } catch (Exception e) { fail(); }
 }

 private void fail() { status = "error"; publish(); stopRadio(false); }

 private void stopRadio() { stopRadio(true); }

 private void stopRadio(boolean announce) {
  release();
  id = ""; if (announce) status = "stopped";
  if (announce) publish();
  status = "stopped";
  snapshot = json();
  session.setActive(false);
  if (foreground) { stopForeground(true); foreground = false; }
  stopSelf();
 }

 private void release() {
  pausedByFocus = false;
  if (player != null) { try { player.reset(); player.release(); } catch (Exception ignored) {} player = null; }
  try { focus.abandonAudioFocus(this); } catch (Exception ignored) {}
 }

 @Override public void onAudioFocusChange(int change) {
  if (player == null) return;
  if (change == AudioManager.AUDIOFOCUS_LOSS) stopRadio();
  else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
   try { if (player.isPlaying()) { player.pause(); pausedByFocus = true; } } catch (Exception ignored) {}
  } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) {
   pausedByFocus = false;
   try { player.start(); } catch (Exception ignored) {}
  }
 }

 private String json() {
  return "{\"id\":" + org.json.JSONObject.quote(id) + ",\"status\":" + org.json.JSONObject.quote(status) + "}";
 }

 private void publish() {
  snapshot = json();
  Listener l = listener;
  if (l != null) l.onRadio(snapshot);
  if (foreground) {
   session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_STOP | PlaybackState.ACTION_PAUSE)
    .setState("playing".equals(status) ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_BUFFERING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build());
   ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, notification());
  }
 }

 private void goForeground() {
  session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, UiLocale.text(this, title)).putString(MediaMetadata.METADATA_KEY_ARTIST, UiLocale.text(this, place)).build());
  session.setActive(true);
  if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
  else startForeground(NOTIFICATION, notification());
  foreground = true;
 }

 private Notification notification() {
  NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
  if (Build.VERSION.SDK_INT >= 26) {
   NotificationChannel c = new NotificationChannel(CHANNEL, UiLocale.text(this, "الإذاعات"), NotificationManager.IMPORTANCE_LOW);
   c.setSound(null, null); c.setShowBadge(false); nm.createNotificationChannel(c);
  }
  Intent open = new Intent(this, MainActivity.class).putExtra("openRadio", true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent content = PendingIntent.getActivity(this, 7811, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop = PendingIntent.getService(this, 7812, new Intent(this, RadioPlaybackService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
  b.setSmallIcon(AppIdentity.notificationIcon(this)).setColor(AppIdentity.notificationColor(this))
   .setContentTitle(UiLocale.text(this, title))
   .setContentText(UiLocale.text(this, "playing".equals(status) ? "بث مباشر" : "جارٍ الاتصال بالبث…") + (place.isEmpty() ? "" : " · " + UiLocale.text(this, place)))
   .setContentIntent(content).setDeleteIntent(stop).setOngoing(true).setShowWhen(false).setVisibility(Notification.VISIBILITY_PUBLIC)
   .addAction(android.R.drawable.ic_menu_close_clear_cancel, UiLocale.text(this, "إيقاف"), stop)
   .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0));
  return b.build();
 }

 @Override public void onTaskRemoved(Intent rootIntent) { stopRadio(); super.onTaskRemoved(rootIntent); }

 @Override public void onDestroy() {
  release();
  if (session != null) session.release();
  super.onDestroy();
 }
}
