package com.mushafi.app;

import android.app.Activity;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.graphics.pdf.PdfRenderer;
import android.os.*;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Reads a book (PDF) from الكتب: downloads it once, keeps it on the device, remembers the page. */
public class BookReaderActivity extends Activity {
 private final Handler ui = new Handler(Looper.getMainLooper());
 private final ExecutorService worker = Executors.newSingleThreadExecutor();
 private JSONObject book;
 private String id, url;
 private boolean dark, destroyed;
 private volatile boolean cancelled;
 private int ink, muted, bg, surface, gold;
 private FrameLayout body;
 private LinearLayout bar;
 private boolean reading, barShown = true;
 private TextView pageLabel;
 private PdfRenderer renderer;
 private ParcelFileDescriptor descriptor;
 private float aspect = 1.414f;
 private int pageCount, pageWidth;
 private LruCache<Integer, Bitmap> cache;

 private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
 private String t(String s) { return UiLocale.text(this, s); }

 @Override protected void onCreate(Bundle state) {
  super.onCreate(state);
  try { book = new JSONObject(getIntent().getStringExtra("book")); } catch (Exception e) { finish(); return; }
  id = book.optString("id"); url = book.optString("url");
  if (!BookStore.validId(id) || !BookStore.trusted(url)) { finish(); return; }
  dark = getSharedPreferences("launch-style", 0).getBoolean("dark", false);
  bg = dark ? NightPalette.BACKGROUND : 0xfff5f3ed; surface = dark ? NightPalette.SURFACE : 0xfffffdf8;
  ink = dark ? NightPalette.INK : 0xff213c31; muted = dark ? NightPalette.MUTED : 0xff7e897e; gold = dark ? NightPalette.GOLD : 0xff8a6a2c;
  getWindow().setStatusBarColor(surface); getWindow().setNavigationBarColor(bg);
  if (Build.VERSION.SDK_INT >= 23 && !dark) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
  int max = (int) (Runtime.getRuntime().maxMemory() / 4);
  cache = new LruCache<Integer, Bitmap>(max) { @Override protected int sizeOf(Integer k, Bitmap b) { return b.getByteCount(); } };

  FrameLayout root = new FrameLayout(this); root.setBackgroundColor(bg);
  root.setLayoutDirection(UiLocale.rtl(this) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
  bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setBackgroundColor(surface); bar.setPadding(dp(8), dp(6), dp(14), dp(6));
  if (Build.VERSION.SDK_INT >= 21) bar.setElevation(dp(4));
  TextView close = new TextView(this); close.setText("✕"); close.setTextSize(20); close.setTextColor(ink); close.setGravity(Gravity.CENTER);
  close.setContentDescription(t("إغلاق")); close.setOnClickListener(v -> finish());
  bar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
  TextView title = new TextView(this); title.setText(book.optString("title")); title.setTextColor(ink); title.setTextSize(15); title.setTypeface(Typeface.DEFAULT_BOLD);
  title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END); title.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG);
  bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
  pageLabel = new TextView(this); pageLabel.setTextColor(gold); pageLabel.setTextSize(13); pageLabel.setTypeface(Typeface.DEFAULT_BOLD); pageLabel.setPadding(dp(10), 0, 0, 0);
  bar.addView(pageLabel);
  body = new FrameLayout(this); root.addView(body, new FrameLayout.LayoutParams(-1, -1));
  root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
  setContentView(root);
  root.setOnApplyWindowInsetsListener((v, insets) -> {
   int top = insets.getSystemWindowInsetTop(), left = insets.getSystemWindowInsetLeft(), right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
   if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) { android.view.DisplayCutout c = insets.getDisplayCutout(); top = Math.max(top, c.getSafeInsetTop()); left = Math.max(left, c.getSafeInsetLeft()); right = Math.max(right, c.getSafeInsetRight()); }
   bar.setPadding(dp(8) + left, dp(6) + top, dp(14) + right, dp(6));
   body.setPadding(left, reading ? 0 : bar.getHeight(), right, bottom);
   return insets.consumeSystemWindowInsets();
  });

  File f = BookStore.file(this, id);
  if (f.exists() && f.length() > 0 && BookStore.find(this, id) != null) open(f); else download();
 }

 /* ---------- download ---------- */
 private TextView status; private ProgressBar progress; private TextView action;

 private void showMessage(String text, boolean busy, String actionLabel, View.OnClickListener onAction) {
  body.removeAllViews();
  LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER); box.setPadding(dp(32), 0, dp(32), 0);
  status = new TextView(this); status.setText(text); status.setTextColor(ink); status.setTextSize(15); status.setGravity(Gravity.CENTER); status.setLineSpacing(0, 1.3f);
  box.addView(status);
  progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setMax(1000); progress.setIndeterminate(true);
  if (Build.VERSION.SDK_INT >= 21) { progress.setProgressTintList(android.content.res.ColorStateList.valueOf(gold)); progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(gold)); }
  progress.setVisibility(busy ? View.VISIBLE : View.GONE);
  LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(220), dp(18)); lp.topMargin = dp(18); box.addView(progress, lp);
  if (actionLabel != null) {
   action = new TextView(this); action.setText(actionLabel); action.setTextColor(gold); action.setTextSize(14); action.setTypeface(Typeface.DEFAULT_BOLD); action.setGravity(Gravity.CENTER);
   GradientDrawable d = new GradientDrawable(); d.setCornerRadius(dp(22)); d.setStroke(dp(1), gold); action.setBackground(d); action.setPadding(dp(22), dp(10), dp(22), dp(10)); action.setOnClickListener(onAction);
   LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-2, -2); ap.topMargin = dp(22); box.addView(action, ap);
  }
  body.addView(box, new FrameLayout.LayoutParams(-1, -1));
 }

 private void download() {
  cancelled = false;
  showMessage(t("جارٍ تنزيل الكتاب…"), true, t("إلغاء"), v -> { cancelled = true; finish(); });
  final File target = BookStore.file(this, id), tmp = new File(BookStore.dir(this), id + ".part");
  new Thread(() -> {
   HttpURLConnection c = null; boolean ok = false; String error = t("تعذر تنزيل الكتاب؛ تحقق من الاتصال ثم أعد المحاولة");
   try {
    URL u = new URL(url); c = (HttpURLConnection) u.openConnection(); c.setConnectTimeout(20000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(true);
    c.connect(); int code = c.getResponseCode(); if (code != 200 || !BookStore.trusted(c.getURL().toString())) throw new IOException("http " + code);
    long total = c.getContentLength(); if (total > 400L * 1024 * 1024) { error = t("حجم الكتاب كبير جدًا"); throw new IOException("big"); }
    InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream out = new FileOutputStream(tmp);
    try { byte[] buf = new byte[64 * 1024]; long done = 0; int n; long last = 0;
     while ((n = in.read(buf)) > 0) { if (cancelled) throw new IOException("cancelled"); out.write(buf, 0, n); done += n;
      long now = SystemClock.uptimeMillis(); if (now - last > 120) { last = now; final long d = done; ui.post(() -> progressTo(d, total)); } }
    } finally { out.close(); in.close(); }
    byte[] head = new byte[5]; FileInputStream check = new FileInputStream(tmp); try { check.read(head); } finally { check.close(); }
    if (!new String(head, "US-ASCII").startsWith("%PDF")) throw new IOException("not pdf");
    if (target.exists()) target.delete(); ok = tmp.renameTo(target);
   } catch (Exception e) { tmp.delete(); } finally { if (c != null) c.disconnect(); }
   final boolean success = ok; final String message = error;
   ui.post(() -> {
    if (destroyed || cancelled) return;
    if (success) { BookStore.put(this, book); open(target); notifyPage(); }
    else showMessage(message, false, t("إعادة المحاولة"), v -> download());
   });
  }).start();
 }
 private void progressTo(long done, long total) {
  if (progress == null || destroyed) return;
  if (total > 0) { progress.setIndeterminate(false); progress.setProgress((int) (done * 1000 / total)); status.setText(t("جارٍ تنزيل الكتاب…") + "  " + UiLocale.number(this, (int) (done * 100 / total)) + "٪"); }
 }

 /* ---------- reading: page by page like the Mushaf; two pages side by side on a wide screen ---------- */
 private FrameLayout stage;
 private LinearLayout spreadRow;
 private int start;              // first page shown
 private boolean twoUp, rtlBook, turning, zoomed;
 private GestureDetector gestures;

 private void open(File f) {
  try {
   descriptor = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
   renderer = new PdfRenderer(descriptor); pageCount = renderer.getPageCount();
   if (pageCount > 0) { PdfRenderer.Page p = renderer.openPage(0); aspect = p.getHeight() / (float) Math.max(1, p.getWidth()); p.close(); }
  } catch (Exception e) { BookStore.delete(this, id); notifyPage(); showMessage(t("تعذر فتح الكتاب"), false, t("إعادة المحاولة"), v -> download()); return; }
  String name = book.optString("title");
  rtlBook = name.matches("(?s).*[\\u0600-\\u06FF].*") || UiLocale.rtl(this);
  body.removeAllViews();
  reading = true; body.setPadding(body.getPaddingLeft(), 0, body.getPaddingRight(), body.getPaddingBottom());
  immersive(true);
  ui.postDelayed(() -> { if (reading && barShown) showBar(false); }, 1800);
  stage = new FrameLayout(this); stage.setBackgroundColor(bg); stage.setClipChildren(false);
  spreadRow = new LinearLayout(this); spreadRow.setGravity(Gravity.CENTER); spreadRow.setClipChildren(false);
  spreadRow.setLayoutDirection(rtlBook ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
  stage.addView(spreadRow, new FrameLayout.LayoutParams(-1, -1));
  body.addView(stage, new FrameLayout.LayoutParams(-1, -1));
  stage.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { if (r - l != or - ol || b - t != ob - ot) stage.post(this::layoutSpread); });
  gestures = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
   @Override public boolean onDown(MotionEvent e) { return true; }
   @Override public boolean onDoubleTap(MotionEvent e) { zoom(!zoomed, e.getX(), e.getY()); return true; }
   @Override public boolean onScroll(MotionEvent a, MotionEvent b, float dx, float dy) {
    if (!zoomed) return false;
    float maxX = spreadRow.getWidth() / 2f, maxY = spreadRow.getHeight() / 2f;
    spreadRow.setTranslationX(Math.max(-maxX, Math.min(maxX, spreadRow.getTranslationX() - dx)));
    spreadRow.setTranslationY(Math.max(-maxY, Math.min(maxY, spreadRow.getTranslationY() - dy)));
    return true;
   }
   @Override public boolean onFling(MotionEvent a, MotionEvent b, float vx, float vy) {
    if (zoomed) return false;
    if (a == null || Math.abs(vx) < Math.abs(vy) || Math.abs(b.getX() - a.getX()) < dp(40)) return false;
    boolean towardRight = vx > 0;
    turn(towardRight == rtlBook ? 1 : -1); return true;
   }
   @Override public boolean onSingleTapConfirmed(MotionEvent e) {
    float w = stage.getWidth(); if (w <= 0 || zoomed) return false;
    if (e.getX() < w / 4f) { turn(rtlBook ? 1 : -1); return true; }
    if (e.getX() > w * 3 / 4f) { turn(rtlBook ? -1 : 1); return true; }
    showBar(!barShown); return true;
   }
  });
  stage.setOnTouchListener((v, e) -> gestures.onTouchEvent(e));
  JSONObject saved = BookStore.find(this, id); int page = saved == null ? 0 : saved.optInt("page", 0);
  start = page > 0 && page < pageCount ? page : 0;
  stage.post(this::layoutSpread);
 }

 @Override public void onConfigurationChanged(android.content.res.Configuration c) {
  super.onConfigurationChanged(c);
  if (stage != null) stage.post(this::layoutSpread);
 }

 private int step() { return twoUp ? 2 : 1; }

 /** The pages fill the screen; a tap in the middle shows or hides the title bar (and the phone's bars with it). */
 private void showBar(boolean show) {
  barShown = show;
  bar.animate().cancel();
  if (show) { bar.setVisibility(View.VISIBLE); bar.setTranslationY(-bar.getHeight()); bar.animate().translationY(0).alpha(1f).setDuration(180).start(); }
  else bar.animate().translationY(-bar.getHeight()).alpha(0f).setDuration(180).withEndAction(() -> { if (!barShown) bar.setVisibility(View.GONE); }).start();
  immersive(!show);
 }

 @SuppressWarnings("deprecation")
 private void immersive(boolean on) {
  View d = getWindow().getDecorView();
  int light = (Build.VERSION.SDK_INT >= 23 && !dark) ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : 0;
  int keep = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
  d.setSystemUiVisibility(on ? keep | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY : keep | light);
 }

 /** Double tap: twice as large around the tapped spot, drag to move around; double tap again to fit the page. */
 private void zoom(boolean in, float x, float y) {
  zoomed = in;
  if (in) { spreadRow.setPivotX(x); spreadRow.setPivotY(y); spreadRow.animate().scaleX(2f).scaleY(2f).setDuration(180).start(); }
  else spreadRow.animate().scaleX(1f).scaleY(1f).translationX(0).translationY(0).setDuration(180).start();
 }

 /** Builds the current spread: one page fitted to the screen, or two pages side by side when the screen is wide. */
 private void layoutSpread() {
  if (stage == null || pageCount == 0 || destroyed) return;
  zoomed = false; spreadRow.setScaleX(1f); spreadRow.setScaleY(1f); spreadRow.setTranslationX(0); spreadRow.setTranslationY(0);
  int pad = dp(6), gap = dp(6);
  int w = stage.getWidth() - pad * 2, h = stage.getHeight() - pad * 2;
  if (w <= 0 || h <= 0) { stage.post(this::layoutSpread); return; }
  twoUp = pageCount > 1 && w > h * 1.1f;
  if (twoUp) start -= start % 2;
  start = Math.max(0, Math.min(start, pageCount - 1));
  int boxW = twoUp ? (w - gap) / 2 : w;
  int pw = (int) Math.min(boxW, h / aspect), ph = (int) (pw * aspect);
  pageWidth = pw;
  spreadRow.removeAllViews();
  for (int k = 0; k < step(); k++) {
   int index = start + k;
   ImageView v = new ImageView(this);
   v.setScaleType(ImageView.ScaleType.FIT_CENTER); v.setBackgroundColor(dark ? NIGHT_PAGE : Color.WHITE); v.setTag(index);
   v.setLayerType(View.LAYER_TYPE_HARDWARE, null);
   if (Build.VERSION.SDK_INT >= 21) {
    v.setElevation(dp(dark ? 0 : 3));
    v.setOutlineProvider(new ViewOutlineProvider() { @Override public void getOutline(View view, Outline o) { o.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(4)); } });
    v.setClipToOutline(true);
   }
   LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(pw, ph);
   if (twoUp) lp.setMarginStart(k == 0 ? 0 : gap);
   if (index >= pageCount) { v.setVisibility(View.INVISIBLE); spreadRow.addView(v, lp); continue; }
   v.setContentDescription(UiLocale.text(this, "صفحة {0}", UiLocale.number(this, index + 1)));
   Bitmap b = cache.get(index);
   if (b != null && b.getWidth() >= Math.min(pw * 2, 2000) * 0.9f) v.setImageBitmap(b); else { if (b != null) v.setImageBitmap(b); render(index, v); }
   spreadRow.addView(v, lp);
  }
  updateLabel();
  for (int k = 1; k <= step(); k++) { prefetch(start + step() - 1 + k); prefetch(start - k); }
 }

 private void turn(int direction) {
  if (turning || stage == null) return;
  int next = start + direction * step();
  if (next < 0 || next >= pageCount) return;
  turning = true;
  float out = (direction > 0) == rtlBook ? stage.getWidth() : -stage.getWidth();
  spreadRow.animate().translationX(out * 0.35f).alpha(0f).setDuration(140).withEndAction(() -> {
   start = next; layoutSpread();
   spreadRow.setTranslationX(-out * 0.35f);
   spreadRow.animate().translationX(0).alpha(1f).setDuration(180).withEndAction(() -> turning = false).start();
  }).start();
 }

 private void updateLabel() {
  if (pageCount == 0) return;
  String first = UiLocale.number(this, start + 1);
  String text = twoUp && start + 1 < pageCount ? first + "–" + UiLocale.number(this, start + 2) : first;
  pageLabel.setText(text + " / " + UiLocale.number(this, pageCount));
 }

 private void prefetch(int index) {
  if (index < 0 || index >= pageCount || cache.get(index) != null) return;
  render(index, null);
 }

 private void render(final int index, final ImageView target) {
  // Rendered at twice the size it is shown and scaled down, so small Arabic text stays sharp.
  final int width = Math.min(Math.max(pageWidth * 2, dp(400)), 2000);
  worker.execute(() -> {
   Bitmap have = cache.get(index);
   if (destroyed || renderer == null || (have != null && have.getWidth() >= width * 0.9f)) {
    if (target != null) ui.post(() -> { if (target.getTag() instanceof Integer && (Integer) target.getTag() == index) target.setImageBitmap(cache.get(index)); });
    return;
   }
   Bitmap bmp = null;
   try { synchronized (this) { PdfRenderer.Page p = renderer.openPage(index); int h = Math.max(1, Math.round(width * p.getHeight() / (float) Math.max(1, p.getWidth())));
     bmp = Bitmap.createBitmap(width, h, Bitmap.Config.ARGB_8888); bmp.eraseColor(Color.WHITE);
     Matrix m = new Matrix(); m.setScale(width / (float) p.getWidth(), h / (float) p.getHeight());
     p.render(bmp, null, m, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); p.close(); }
    if (dark) nightPage(bmp); } catch (Throwable e) { bmp = null; }
   final Bitmap result = bmp;
   if (result != null) cache.put(index, result);
   if (target != null) ui.post(() -> { if (!destroyed && result != null && target.getTag() instanceof Integer && (Integer) target.getTag() == index) target.setImageBitmap(result); });
  });
 }

 /* ---------- night pages: dark paper, white text, gold for coloured text (Quran verses, headings) ---------- */
 private static final int NIGHT_PAGE = 0xff17171b;
 private static void nightPage(Bitmap b) {
  int w = b.getWidth(), h = b.getHeight(); int[] row = new int[w];
  final int pr = 0x17, pg = 0x17, pb = 0x1b;          // page
  final int tr = 0xf2, tg = 0xec, tb = 0xe0;          // text
  final int gr = 0xe6, gg = 0xc4, gb = 0x78;          // gold
  for (int y = 0; y < h; y++) {
   b.getPixels(row, 0, w, 0, y, w, 1);
   for (int x = 0; x < w; x++) {
    int c = row[x], r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255;
    int max = Math.max(r, Math.max(g, bl)), min = Math.min(r, Math.min(g, bl));
    float ink = 1f - (0.299f * r + 0.587f * g + 0.114f * bl) / 255f;
    float sat = max == 0 ? 0 : (max - min) / (float) max;
    if (sat > 0.28f && ink > 0.12f) {
     float k = Math.min(1f, ink * 1.7f);
     row[x] = 0xff000000 | ((int) (pr + (gr - pr) * k) << 16) | ((int) (pg + (gg - pg) * k) << 8) | (int) (pb + (gb - pb) * k);
    } else {
     row[x] = 0xff000000 | ((int) (pr + (tr - pr) * ink) << 16) | ((int) (pg + (tg - pg) * ink) << 8) | (int) (pb + (tb - pb) * ink);
    }
   }
   b.setPixels(row, 0, w, 0, y, w, 1);
  }
 }

 /** The shell refreshes الكتب when it comes back (MainActivity.onResume). */
 private void notifyPage() {}

 @Override protected void onPause() {
  super.onPause();
  if (stage != null && pageCount > 0) BookStore.setPage(this, id, start, pageCount);
 }
 @Override protected void onDestroy() {
  destroyed = true; cancelled = true; worker.shutdownNow();
  synchronized (this) { try { if (renderer != null) renderer.close(); } catch (Exception ignored) {} try { if (descriptor != null) descriptor.close(); } catch (Exception ignored) {} renderer = null; }
  cache.evictAll();
  super.onDestroy();
 }
}
