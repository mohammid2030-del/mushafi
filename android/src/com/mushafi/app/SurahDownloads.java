package com.mushafi.app;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/** Full-surah downloads for offline listening. Files live where SurahPlaybackService already looks for them. */
final class SurahDownloads {
  interface Sink { void event(String json); }
  private static JSONObject catalog;
  private static Thread worker;
  private static volatile boolean cancel;

  static synchronized JSONObject catalog(Context c) {
    if (catalog == null) {
      try (InputStream in = c.getAssets().open("surah-audio.json")) {
        ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[65536]; int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n);
        catalog = new JSONObject(o.toString("UTF-8"));
      } catch (Exception e) { catalog = new JSONObject(); }
    }
    return catalog;
  }
  static JSONObject track(Context c, int r, int ch) {
    JSONObject reader = catalog(c).optJSONObject(String.valueOf(r)); if (reader == null) return null;
    JSONObject chapters = reader.optJSONObject("chapters"); return chapters == null ? null : chapters.optJSONObject(String.valueOf(ch));
  }
  static File file(Context c, JSONObject t, int r, int ch) {
    String v = t.optString("sourceVersion");
    String folder = ("mp3quran-primary-v1".equals(v) || "kfgqpc-v1".equals(v) || "mp3quran-nafees-v1".equals(v)) ? v + "/" : "";
    return new File(c.getFilesDir(), "surah-audio/" + folder + r + "/" + ch + ".mp3");
  }
  static boolean complete(File f) { return f.isFile() && f.length() > 128; }
  static String list(Context ctx) {
    Context c = ctx.getApplicationContext(); JSONArray out = new JSONArray(); JSONObject cat = catalog(c); Iterator<String> it = cat.keys();
    while (it.hasNext()) {
      String key = it.next(); int r; try { r = Integer.parseInt(key); } catch (Exception e) { continue; }
      JSONObject reader = cat.optJSONObject(key); JSONObject chapters = reader == null ? null : reader.optJSONObject("chapters"); if (chapters == null) continue;
      for (int ch = 1; ch <= 114; ch++) { JSONObject t = chapters.optJSONObject(String.valueOf(ch)); if (t != null && complete(file(c, t, r, ch))) out.put(r + ":" + ch); }
    }
    return out.toString();
  }
  private static String event(int r, int ch, String status, long received, long total) {
    try { return new JSONObject().put("reader", r).put("chapter", ch).put("status", status).put("received", received).put("total", total).toString(); }
    catch (Exception e) { return "{}"; }
  }
  private static boolean allowed(Uri u) {
    String h = u.getHost();
    return "https".equals(u.getScheme()) && ("download.quranicaudio.com".equals(h) || "cdn.mp3quran.net".equals(h) || "download.qurancomplex.gov.sa".equals(h));
  }
  static synchronized void start(Context ctx, final int r, final int ch, final Sink sink) {
    final Context c = ctx.getApplicationContext();
    if (worker != null && worker.isAlive()) { sink.event(event(r, ch, "busy", 0, 0)); return; }
    final JSONObject t = track(c, r, ch);
    if (t == null) { sink.event(event(r, ch, "error", 0, 0)); return; }
    cancel = false;
    worker = new Thread(() -> {
      File out = file(c, t, r, ch), part = new File(out.getPath() + ".part"); HttpURLConnection con = null;
      try {
        String source = t.getString("url"); if (!allowed(Uri.parse(source))) throw new IOException("host");
        File dir = out.getParentFile(); if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("dir");
        con = (HttpURLConnection) new URL(source).openConnection(); con.setConnectTimeout(15000); con.setReadTimeout(30000); con.setInstanceFollowRedirects(true);
        if (con.getResponseCode() != 200) throw new IOException("http");
        long total = con.getContentLength(), got = 0, last = 0;
        sink.event(event(r, ch, "progress", 0, total));
        try (InputStream in = new BufferedInputStream(con.getInputStream()); OutputStream o = new FileOutputStream(part)) {
          byte[] b = new byte[65536]; int n;
          while ((n = in.read(b)) > 0) {
            if (cancel) throw new InterruptedIOException("cancel");
            o.write(b, 0, n); got += n; long now = System.currentTimeMillis();
            if (now - last > 350) { last = now; sink.event(event(r, ch, "progress", got, total)); }
          }
        }
        if ((total > 0 && got != total) || got <= 128) throw new IOException("incomplete");
        if (out.exists() && !out.delete()) throw new IOException("replace");
        if (!part.renameTo(out)) throw new IOException("rename");
        sink.event(event(r, ch, "done", got, got));
      } catch (Exception e) {
        //noinspection ResultOfMethodCallIgnored
        part.delete();
        sink.event(event(r, ch, cancel ? "cancelled" : "error", 0, 0));
      } finally { if (con != null) con.disconnect(); }
    }, "surah-download");
    worker.start();
  }
  static void cancel() { cancel = true; }
  static void delete(Context ctx, int r, int ch, Sink sink) {
    Context c = ctx.getApplicationContext(); JSONObject t = track(c, r, ch);
    if (t != null) { //noinspection ResultOfMethodCallIgnored
      file(c, t, r, ch).delete(); }
    sink.event(event(r, ch, "deleted", 0, 0));
  }
}
