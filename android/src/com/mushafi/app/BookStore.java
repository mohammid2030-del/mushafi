package com.mushafi.app;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Books kept on the device (الكتب): PDF files under files/books plus a small index. */
final class BookStore {
 private BookStore() {}

 static File dir(Context c) { File d = new File(c.getFilesDir(), "books"); if (!d.exists()) d.mkdirs(); return d; }
 private static File index(Context c) { return new File(dir(c), "index.json"); }

 /** Only IslamHouse files over HTTPS are ever downloaded. */
 static boolean trusted(String url) {
  try { Uri u = Uri.parse(url); String h = u.getHost(); return "https".equals(u.getScheme()) && h != null && (h.equals("islamhouse.com") || h.endsWith(".islamhouse.com")); } catch (Exception e) { return false; }
 }
 static boolean validId(String id) { return id != null && id.matches("[0-9]{1,14}"); }
 static File file(Context c, String id) { return new File(dir(c), id + ".pdf"); }

 static synchronized JSONArray all(Context c) {
  try { File f = index(c); if (!f.exists()) return new JSONArray(); byte[] b = new byte[(int) f.length()]; java.io.FileInputStream in = new java.io.FileInputStream(f); try { int n = 0; while (n < b.length) { int r = in.read(b, n, b.length - n); if (r < 0) break; n += r; } } finally { in.close(); }
   JSONArray list = new JSONArray(new String(b, StandardCharsets.UTF_8)), kept = new JSONArray();
   for (int i = 0; i < list.length(); i++) { JSONObject o = list.optJSONObject(i); if (o != null && validId(o.optString("id")) && file(c, o.optString("id")).exists()) kept.put(o); }
   return kept;
  } catch (Exception e) { return new JSONArray(); }
 }
 private static synchronized void write(Context c, JSONArray list) {
  try { File tmp = new File(dir(c), "index.tmp"); FileOutputStream out = new FileOutputStream(tmp); try { out.write(list.toString().getBytes(StandardCharsets.UTF_8)); } finally { out.close(); } tmp.renameTo(index(c)); } catch (Exception ignored) {}
 }
 static synchronized JSONObject find(Context c, String id) { JSONArray l = all(c); for (int i = 0; i < l.length(); i++) if (id.equals(l.optJSONObject(i).optString("id"))) return l.optJSONObject(i); return null; }

 static synchronized void put(Context c, JSONObject entry) {
  JSONArray l = all(c), out = new JSONArray(); String id = entry.optString("id");
  try { entry.put("savedAt", System.currentTimeMillis()); } catch (Exception ignored) {}
  out.put(entry);
  for (int i = 0; i < l.length(); i++) if (!id.equals(l.optJSONObject(i).optString("id"))) out.put(l.optJSONObject(i));
  write(c, out);
 }
 static synchronized void setPage(Context c, String id, int page, int pages) {
  JSONArray l = all(c);
  for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (id.equals(o.optString("id"))) try { o.put("page", page).put("pages", pages); } catch (Exception ignored) {} }
  write(c, l);
 }
 /** Removes a book, or every part of it when given the book's own id. */
 static synchronized void delete(Context c, String id) {
  if (!validId(id)) return;
  JSONArray l = all(c), out = new JSONArray();
  for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (id.equals(o.optString("id")) || id.equals(o.optString("bookId"))) file(c, o.optString("id")).delete(); else out.put(o); }
  write(c, out);
 }
}
