package com.mushafi.app;

import android.animation.*;
import android.app.Activity;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.os.*;
import android.util.TypedValue;
import android.view.*;
import android.widget.*;

/** Full-screen ring for صحبة الفجر, shown over the lock screen. */
public class WakeCallActivity extends Activity {
 static final String CLOSE = "com.mushafi.app.WAKE_CLOSE";
 private String callId;
 private final BroadcastReceiver closer = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { finish(); } };

 private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

 @Override protected void onCreate(Bundle state) {
  super.onCreate(state);
  if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
  else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  getWindow().setStatusBarColor(Color.parseColor("#0b0b10"));
  getWindow().setNavigationBarColor(Color.parseColor("#1d1b24"));
  callId = getIntent().getStringExtra("callId");
  String name = getIntent().getStringExtra("name"); if (name == null || name.isEmpty()) name = UiLocale.text(this, "صحبة الفجر");
  if (callId == null || !callId.equals(getSharedPreferences("wake", 0).getString("ringing", ""))) { finish(); return; }

  int gold = Color.parseColor("#e6cf9a"), ink = Color.parseColor("#f4ead2");
  FrameLayout root = new FrameLayout(this);
  root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Color.parseColor("#0b0b10"), Color.parseColor("#17161f"), Color.parseColor("#2a2633")}));
  root.setLayoutDirection(UiLocale.rtl(this) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);

  LinearLayout col = new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL); col.setGravity(Gravity.CENTER_HORIZONTAL);
  col.setPadding(dp(24), dp(90), dp(24), dp(56));
  root.addView(col, new FrameLayout.LayoutParams(-1, -1));

  TextView kicker = text(UiLocale.text(this, "صحبة الفجر"), 15, gold, Typeface.BOLD); col.addView(kicker);

  FrameLayout orb = new FrameLayout(this);
  LinearLayout.LayoutParams orbLp = new LinearLayout.LayoutParams(dp(200), dp(200)); orbLp.topMargin = dp(40); col.addView(orb, orbLp);
  View pulse = new View(this); GradientDrawable pd = new GradientDrawable(); pd.setShape(GradientDrawable.OVAL); pd.setColor(Color.argb(46, 230, 207, 154)); pulse.setBackground(pd);
  orb.addView(pulse, new FrameLayout.LayoutParams(dp(200), dp(200), Gravity.CENTER));
  TextView face = text(initials(name), 44, Color.parseColor("#211b12"), Typeface.BOLD);
  GradientDrawable fd = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{Color.parseColor("#f0dcae"), Color.parseColor("#c9a45f")}); fd.setShape(GradientDrawable.OVAL); face.setBackground(fd); face.setGravity(Gravity.CENTER);
  orb.addView(face, new FrameLayout.LayoutParams(dp(128), dp(128), Gravity.CENTER));
  ObjectAnimator sx = ObjectAnimator.ofFloat(pulse, "scaleX", .7f, 1.05f), sy = ObjectAnimator.ofFloat(pulse, "scaleY", .7f, 1.05f), al = ObjectAnimator.ofFloat(pulse, "alpha", 1f, 0f);
  for (ObjectAnimator a : new ObjectAnimator[]{sx, sy, al}) { a.setRepeatCount(ValueAnimator.INFINITE); a.setDuration(1600); }
  AnimatorSet set = new AnimatorSet(); set.playTogether(sx, sy, al); set.start();

  TextView who = text(name, 30, ink, Typeface.BOLD); LinearLayout.LayoutParams whoLp = new LinearLayout.LayoutParams(-2, -2); whoLp.topMargin = dp(28); col.addView(who, whoLp);
  TextView sub = text(UiLocale.text(this, "يصحّيك للفجر"), 17, Color.argb(200, 244, 234, 210), Typeface.NORMAL); LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(-2, -2); subLp.topMargin = dp(6); col.addView(sub, subLp);
  TextView verse = text("﴿وَقُرْآنَ الْفَجْرِ إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا﴾", 17, Color.argb(190, 230, 207, 154), Typeface.NORMAL);
  try { verse.setTypeface(Typeface.createFromAsset(getAssets(), "quran.ttf")); } catch (Exception ignored) {}
  LinearLayout.LayoutParams vLp = new LinearLayout.LayoutParams(-2, -2); vLp.topMargin = dp(22); col.addView(verse, vLp);

  View spacer = new View(this); col.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

  LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER);
  row.addView(button(UiLocale.text(this, "رفض"), Color.parseColor("#b4553f"), Color.WHITE, false, v -> act("declined")));
  View gap = new View(this); row.addView(gap, new LinearLayout.LayoutParams(dp(90), 1));
  row.addView(button(UiLocale.text(this, "ردّ"), gold, Color.parseColor("#211b12"), true, v -> act("answered")));
  col.addView(row, new LinearLayout.LayoutParams(-1, -2));
  setContentView(root);
  if (Build.VERSION.SDK_INT >= 33) registerReceiver(closer, new IntentFilter(CLOSE), Context.RECEIVER_NOT_EXPORTED); else registerReceiver(closer, new IntentFilter(CLOSE));
 }

 private TextView text(String s, float size, int color, int style) { TextView t = new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color); t.setTypeface(Typeface.DEFAULT, style); t.setGravity(Gravity.CENTER); return t; }

 private View button(String label, int bg, int fg, boolean answer, View.OnClickListener click) {
  LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER_HORIZONTAL);
  ImageView circle = new ImageView(this);
  GradientDrawable d = new GradientDrawable(); d.setShape(GradientDrawable.OVAL); d.setColor(bg); circle.setBackground(d);
  circle.setImageDrawable(new PhoneGlyph(fg, !answer)); circle.setPadding(dp(20), dp(20), dp(20), dp(20));
  circle.setOnClickListener(click); circle.setContentDescription(label);
  box.addView(circle, new LinearLayout.LayoutParams(dp(76), dp(76)));
  TextView t = text(label, 15, Color.argb(220, 244, 234, 210), Typeface.BOLD); LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2); lp.topMargin = dp(10); box.addView(t, lp);
  return box;
 }

 private static String initials(String name) { String[] w = name.trim().split("\\s+"); String a = w.length > 0 && !w[0].isEmpty() ? w[0].substring(0, 1) : "؟"; String b = w.length > 1 && !w[1].isEmpty() ? w[1].substring(0, 1) : ""; return a + b; }

 private void act(String state) {
  WakeRing.stopRinging(this, callId);
  WakeClient.respond(this, callId, state);
  if ("answered".equals(state)) Toast.makeText(this, UiLocale.text(this, "جزاك الله خيرًا، قم للصلاة"), Toast.LENGTH_LONG).show();
  finish();
 }

 @Override protected void onDestroy() { try { unregisterReceiver(closer); } catch (Exception ignored) {} super.onDestroy(); }
 @Override public void onBackPressed() { /* answer or decline */ }

 /** A simple handset glyph; tilted down for decline. */
 static final class PhoneGlyph extends Drawable {
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); private final boolean down;
  PhoneGlyph(int color, boolean down) { p.setColor(color); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND); this.down = down; }
  @Override public void draw(Canvas c) {
   Rect b = getBounds(); float w = b.width(), h = b.height(); p.setStrokeWidth(w * .09f);
   c.save(); c.translate(b.left, b.top); if (down) c.rotate(135, w / 2, h / 2);
   Path path = new Path();
   path.moveTo(w * .22f, h * .16f); path.lineTo(w * .36f, h * .16f); path.lineTo(w * .44f, h * .36f); path.lineTo(w * .34f, h * .44f);
   path.cubicTo(w * .4f, h * .58f, w * .48f, h * .66f, w * .58f, h * .68f);
   path.lineTo(w * .64f, h * .56f); path.lineTo(w * .84f, h * .64f); path.lineTo(w * .84f, h * .78f);
   path.cubicTo(w * .84f, h * .84f, w * .8f, h * .86f, w * .74f, h * .86f);
   path.cubicTo(w * .42f, h * .84f, w * .16f, h * .58f, w * .14f, h * .26f);
   path.cubicTo(w * .14f, h * .2f, w * .17f, h * .16f, w * .22f, h * .16f); path.close();
   c.drawPath(path, p); c.restore();
  }
  @Override public void setAlpha(int a) { p.setAlpha(a); }
  @Override public void setColorFilter(ColorFilter f) { p.setColorFilter(f); }
  @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
 }
}
