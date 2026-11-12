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
 private TextView pageLabel;
 private ListView pages;
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
  int max = (int) (Runtime.getRuntime().maxMemory() / 6);
  cache = new LruCache<Integer, Bitmap>(max) { @Override protected int sizeOf(Integer k, Bitmap b) { return b.getByteCount(); } };

  LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(bg);
  root.setLayoutDirection(UiLocale.rtl(this) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
  LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setBackgroundColor(surface); bar.setPadding(dp(8), dp(6), dp(14), dp(6));
  TextView close = new TextView(this); close.setText("✕"); close.setTextSize(20); close.setTextColor(ink); close.setGravity(Gravity.CENTER);
  close.setContentDescription(t("إغلاق")); close.setOnClickListener(v -> finish());
  bar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
  TextView title = new TextView(this); title.setText(book.optString("title")); title.setTextColor(ink); title.setTextSize(15); title.setTypeface(Typeface.DEFAULT_BOLD);
  title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END); title.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG);
  bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));
  pageLabel = new TextView(this); pageLabel.setTextColor(gold); pageLabel.setTextSize(13); pageLabel.setTypeface(Typeface.DEFAULT_BOLD); pageLabel.setPadding(dp(10), 0, 0, 0);
  bar.addView(pageLabel);
  root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
  body = new FrameLayout(this); root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));
  setContentView(root);
  root.setOnApplyWindowInsetsListener((v, insets) -> { v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets.consumeSystemWindowInsets(); });

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

 /* ---------- reading ---------- */
 private void open(File f) {
  try {
   descriptor = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
   renderer = new PdfRenderer(descriptor); pageCount = renderer.getPageCount();
   if (pageCount > 0) { PdfRenderer.Page p = renderer.openPage(0); aspect = p.getHeight() / (float) Math.max(1, p.getWidth()); p.close(); }
  } catch (Exception e) { BookStore.delete(this, id); notifyPage(); showMessage(t("تعذر فتح الكتاب"), false, t("إعادة المحاولة"), v -> download()); return; }
  body.removeAllViews();
  pages = new ListView(this); pages.setDivider(new android.graphics.drawable.ColorDrawable(bg)); pages.setDividerHeight(dp(10)); pages.setBackgroundColor(bg);
  pages.setPadding(dp(8), dp(10), dp(8), dp(24)); pages.setClipToPadding(false); pages.setSelector(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
  pages.setAdapter(new BaseAdapter() {
   public int getCount() { return pageCount; }
   public Object getItem(int i) { return i; }
   public long getItemId(int i) { return i; }
   public View getView(int i, View convert, ViewGroup parent) {
    ImageView v = convert instanceof ImageView ? (ImageView) convert : new ImageView(BookReaderActivity.this);
    int w = parent.getWidth() - parent.getPaddingLeft() - parent.getPaddingRight(); if (w <= 0) w = getResources().getDisplayMetrics().widthPixels - dp(16);
    pageWidth = w;
    v.setLayoutParams(new AbsListView.LayoutParams(-1, (int) (w * aspect)));
    v.setScaleType(ImageView.ScaleType.FIT_CENTER); v.setBackgroundColor(Color.WHITE); v.setTag(i);
    v.setContentDescription(UiLocale.text(BookReaderActivity.this, "صفحة {0}", UiLocale.number(BookReaderActivity.this, i + 1)));
    Bitmap b = cache.get(i); v.setImageBitmap(b);
    if (b == null) render(i, v);
    return v;
   }
  });
  pages.setOnScrollListener(new AbsListView.OnScrollListener() {
   public void onScrollStateChanged(AbsListView v, int s) {}
   public void onScroll(AbsListView v, int first, int visible, int total) { updateLabel(); }
  });
  body.addView(pages, new FrameLayout.LayoutParams(-1, -1));
  JSONObject saved = BookStore.find(this, id); int page = saved == null ? 0 : saved.optInt("page", 0);
  if (page > 0 && page < pageCount) pages.setSelection(page);
  updateLabel();
 }
 private void updateLabel() {
  if (pages == null || pageCount == 0) return;
  int first = pages.getFirstVisiblePosition(); View top = pages.getChildAt(0);
  if (top != null && top.getBottom() < pages.getHeight() / 3 && first + 1 < pageCount) first++;
  pageLabel.setText(UiLocale.number(this, first + 1) + " / " + UiLocale.number(this, pageCount));
 }
 private void render(final int index, final ImageView target) {
  final int width = Math.min(Math.max(pageWidth, dp(200)), 1400);
  worker.execute(() -> {
   if (destroyed || renderer == null || cache.get(index) != null) { ui.post(() -> { if (index == (Integer) target.getTag()) target.setImageBitmap(cache.get(index)); }); return; }
   Bitmap bmp = null;
   try { synchronized (this) { PdfRenderer.Page p = renderer.openPage(index); int h = Math.max(1, Math.round(width * p.getHeight() / (float) Math.max(1, p.getWidth())));
     bmp = Bitmap.createBitmap(width, h, Bitmap.Config.ARGB_8888); bmp.eraseColor(Color.WHITE); p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); p.close(); } } catch (Throwable e) { bmp = null; }
   final Bitmap result = bmp;
   if (result != null) cache.put(index, result);
   ui.post(() -> { if (!destroyed && target.getTag() instanceof Integer && (Integer) target.getTag() == index) target.setImageBitmap(result); });
  });
 }

 /** The shell refreshes الكتب when it comes back (MainActivity.onResume). */
 private void notifyPage() {}

 @Override protected void onPause() {
  super.onPause();
  if (pages != null && pageCount > 0) BookStore.setPage(this, id, pages.getFirstVisiblePosition(), pageCount);
 }
 @Override protected void onDestroy() {
  destroyed = true; cancelled = true; worker.shutdownNow();
  synchronized (this) { try { if (renderer != null) renderer.close(); } catch (Exception ignored) {} try { if (descriptor != null) descriptor.close(); } catch (Exception ignored) {} renderer = null; }
  cache.evictAll();
  super.onDestroy();
 }
}
