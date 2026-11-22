package com.mushafi.app;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.net.Uri;
import android.os.*;
import java.util.*;

/** Live Quran radio, played natively with Media3 ExoPlayer so it keeps going with the screen off and survives drops:
 *  it follows the stations' redirects (Radiojar moves to a plain-http node, allowed for radiojar.com only by the network
 *  security config), reconnects on errors and stalls, and switches to the station's backup server when there is one. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class RadioPlaybackService extends Service implements AudioManager.OnAudioFocusChangeListener {
 public static final String PLAY = "radio.PLAY", STOP = "radio.STOP";
 public interface Listener { void onRadio(String json); }
 static volatile Listener listener;
 static volatile String snapshot = "{\"id\":\"\",\"status\":\"stopped\"}";
 private static final String CHANNEL = "radio_playback_v1";
 private static final int NOTIFICATION = 7810;
 private static final int MAX_ATTEMPTS = 8;
 private androidx.media3.exoplayer.ExoPlayer player;
 private MediaSession session;
 private AudioManager focus;
 private String id = "", title = "", place = "", status = "stopped";
 private boolean foreground, pausedByFocus;

 /** Only the known radio networks may be played: Radiojar and mp3quran (qurango.net). */
 static boolean allowed(String url) {
  try {
   Uri u = Uri.parse(url);
   String h = u.getHost();
   if (!"https".equals(u.getScheme()) || h == null) return false;
   h = h.toLowerCase(java.util.Locale.ROOT);
   return h.equals("radiojar.com") || h.endsWith(".radiojar.com") || h.equals("qurango.net") || h.endsWith(".qurango.net") || h.equals("mp3quran.net") || h.endsWith(".mp3quran.net");
  } catch (Exception e) { return false; }
 }

 /** The station's address, then its backup server (mp3quran serves every station from qurango.net and backup.qurango.net). */
 static List<String> candidates(String url) {
  List<String> list = new ArrayList<>();
  list.add(url);
  try {
   Uri u = Uri.parse(url);
   String h = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.ROOT);
   if (h.equals("qurango.net")) list.add(u.buildUpon().authority("backup.qurango.net").build().toString());
   else if (h.equals("backup.qurango.net")) list.add(u.buildUpon().authority("qurango.net").build().toString());
  } catch (Exception ignored) {}
  return list;
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
 private List<String> sources = new ArrayList<>();
 private int generation, attempts, sourceIndex;
 private final Runnable stallCheck = () -> { if (player != null && !"playing".equals(status)) retry(); };
 private final Runnable steady = () -> attempts = 0;

 private void start(String newId, String newUrl, String newTitle, String newPlace) {
  release();
  id = newId == null ? "" : newId;
  title = newTitle == null ? "" : newTitle;
  place = newPlace == null ? "" : newPlace;
  String url = newUrl == null ? "" : newUrl;
  attempts = 0; sourceIndex = 0;
  status = "loading";
  goForeground();
  if (!allowed(url)) { fail(); return; }
  sources = candidates(url);
  if (focus.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { fail(); return; }
  connect();
 }

 private void connect() {
  releasePlayer();
  final int gen = ++generation;
  status = "loading"; publish();
  final String stream = sources.get(sourceIndex % sources.size());
  try {
   androidx.media3.datasource.DefaultHttpDataSource.Factory http = new androidx.media3.datasource.DefaultHttpDataSource.Factory()
    .setUserAgent("Mushafi/Android").setAllowCrossProtocolRedirects(true).setConnectTimeoutMs(10000).setReadTimeoutMs(20000);
   final androidx.media3.exoplayer.ExoPlayer next = new androidx.media3.exoplayer.ExoPlayer.Builder(this)
    .setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(http)).build();
   player = next;
   next.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder().setUsage(androidx.media3.common.C.USAGE_MEDIA).setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_SPEECH).build(), false);
   next.setWakeMode(androidx.media3.common.C.WAKE_MODE_NETWORK);
   next.addListener(new androidx.media3.common.Player.Listener() {
    @Override public void onPlaybackStateChanged(int state) {
     if (player != next || gen != generation) return;
     if (state == androidx.media3.common.Player.STATE_BUFFERING) {
      if (!"loading".equals(status)) { status = "loading"; publish(); }
      main.removeCallbacks(stallCheck); main.postDelayed(stallCheck, 15000);
     } else if (state == androidx.media3.common.Player.STATE_READY) {
      main.removeCallbacks(stallCheck);
      if (next.getPlayWhenReady() && !"playing".equals(status)) { status = "playing"; publish(); main.removeCallbacks(steady); main.postDelayed(steady, 30000); }
     } else if (state == androidx.media3.common.Player.STATE_ENDED) retry();
    }
    @Override public void onPlayerError(androidx.media3.common.PlaybackException error) { if (player == next && gen == generation) retry(); }
   });
   next.setMediaItem(androidx.media3.common.MediaItem.fromUri(stream));
   next.setPlayWhenReady(true);
   next.prepare();
   main.removeCallbacks(stallCheck); main.postDelayed(stallCheck, 20000);
  } catch (Exception e) { retry(); }
 }

 /** A live stream that drops or stalls reconnects on its own, alternating with the backup server, before giving up. */
 private void retry() {
  if (id.isEmpty()) return;
  releasePlayer();
  main.removeCallbacks(steady);
  if (++attempts > MAX_ATTEMPTS) { fail(); return; }
  sourceIndex++;
  status = "loading"; publish();
  final int gen = ++generation;
  main.postDelayed(() -> { if (gen == generation && !id.isEmpty()) connect(); }, Math.min(1000L * attempts, 5000L));
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
  if (player != null) { try { player.release(); } catch (Exception ignored) {} player = null; }
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
   try { if (player.getPlayWhenReady()) { player.setPlayWhenReady(false); pausedByFocus = true; } } catch (Exception ignored) {}
  } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) {
   pausedByFocus = false;
   try { player.setPlayWhenReady(true); } catch (Exception ignored) {}
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
