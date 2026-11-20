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

 private final Handler main = new Handler(Looper.getMainLooper());
 private String url = "";
 private int generation, attempts;
 private final Runnable stallCheck = () -> { if (player != null && "loading".equals(status)) retry(); };
 private final Runnable steady = () -> attempts = 0;

 private void start(String newId, String newUrl, String newTitle, String newPlace) {
  release();
  id = newId == null ? "" : newId;
  title = newTitle == null ? "" : newTitle;
  place = newPlace == null ? "" : newPlace;
  url = newUrl == null ? "" : newUrl;
  attempts = 0;
  status = "loading";
  goForeground();
  if (!allowed(url)) { fail(); return; }
  if (focus.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail(); return; }
  connect();
 }

 /** Radiojar answers with a short-lived redirect to an http:// node; the same node serves https, so the redirect is resolved here and kept on https (cleartext stays off). */
 static String resolve(String source) {
  String current = source;
  for (int hop = 0; hop < 4; hop++) {
   java.net.HttpURLConnection c = null;
   try {
    c = (java.net.HttpURLConnection) new java.net.URL(current).openConnection();
    c.setInstanceFollowRedirects(false);
    c.setConnectTimeout(8000); c.setReadTimeout(8000);
    c.setRequestProperty("User-Agent", "Mushafi/Android");
    c.setRequestProperty("Icy-MetaData", "0");
    int code = c.getResponseCode();
    if (code < 300 || code >= 400) return code < 300 ? current : null;
    String next = c.getHeaderField("Location");
    if (next == null) return null;
    next = new java.net.URL(new java.net.URL(current), next).toString();
    if (next.startsWith("http://")) next = "https://" + next.substring(7);
    if (!allowed(next)) return null;
    current = next;
   } catch (Exception e) { return null; }
   finally { if (c != null) c.disconnect(); }
  }
  return null;
 }

 private void connect() {
  releasePlayer();
  final int gen = ++generation;
  status = "loading"; publish();
  final String source = url;
  new Thread(() -> {
   final String stream = resolve(source);
   main.post(() -> { if (gen == generation && !id.isEmpty()) play(gen, stream); });
  }, "radio-resolve").start();
 }

 private void play(int gen, String stream) {
  if (stream == null) { retry(); return; }
  try {
   final MediaPlayer next = new MediaPlayer();
   player = next;
   next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
   next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
   Map<String, String> headers = new HashMap<>();
   headers.put("User-Agent", "Mushafi/Android");
   next.setDataSource(this, Uri.parse(stream), headers);
   next.setOnPreparedListener(mp -> { if (player != mp) return; mp.start(); status = "playing"; publish(); main.removeCallbacks(steady); main.postDelayed(steady, 30000); });
   next.setOnInfoListener((mp, what, extra) -> {
    if (player != mp) return false;
    if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) { status = "loading"; publish(); main.removeCallbacks(stallCheck); main.postDelayed(stallCheck, 12000); }
    else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) { main.removeCallbacks(stallCheck); status = "playing"; publish(); }
    return false;
   });
   next.setOnErrorListener((mp, what, extra) -> { if (player == mp) retry(); return true; });
   next.setOnCompletionListener(mp -> { if (player == mp) retry(); });
   next.prepareAsync();
   main.removeCallbacks(stallCheck); main.postDelayed(stallCheck, 20000);
  } catch (Exception e) { retry(); }
 }

 /** A live stream that drops or stalls reconnects on its own (fresh redirect each time) before giving up. */
 private void retry() {
  if (id.isEmpty()) return;
  releasePlayer();
  main.removeCallbacks(steady);
  if (++attempts > 5) { fail(); return; }
  status = "loading"; publish();
  final int gen = ++generation;
  main.postDelayed(() -> { if (gen == generation && !id.isEmpty()) connect(); }, Math.min(1000L * attempts, 4000L));
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

 private void releasePlayer() {
  main.removeCallbacks(stallCheck);
  if (player != null) { try { player.reset(); player.release(); } catch (Exception ignored) {} player = null; }
 }

 private void release() {
  pausedByFocus = false;
  generation++;
  main.removeCallbacks(steady);
  releasePlayer();
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
