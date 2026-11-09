package com.mushafi.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.util.ArrayList;

/** Isolated provider-owned HTTPS pages; deliberately has no application JS bridge. */
public final class CharityBrowserActivity extends Activity {
 private final ArrayList<WebView> windows=new ArrayList<>();
 private FrameLayout stage;private TextView origin,status;private ProgressBar progress;private int ink,bg,accent;private boolean disposed;private long interactionAt;
 private android.window.OnBackInvokedCallback backCallback;
 static JSONObject route(Context context,String id){
  if(id==null||!id.matches("[a-z][a-z0-9-]{0,70}"))return null;
  try(java.io.InputStream in=context.getAssets().open("charity-directory.json");java.util.Scanner scanner=new java.util.Scanner(in,"UTF-8").useDelimiter("\\A")){
   JSONObject r=new JSONObject(scanner.next()).getJSONObject("routes").optJSONObject(id);if(r==null)return null;
   Uri u=Uri.parse(r.getString("url"));String h=u.getHost();if(!https(u)||!("ehsan.sa".equals(h)||"waqfy.sa".equals(h))||"/".equals(u.getPath()))return null;return r;
  }catch(Exception ignored){return null;}
 }
 private static boolean https(Uri uri){return uri!=null&&"https".equalsIgnoreCase(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443);}
 private String text(String ar){return UiLocale.text(this,ar);}
 private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
 private WebView current(){return windows.isEmpty()?null:windows.get(windows.size()-1);}
 @Override public void onCreate(Bundle state){setTheme(getIntent().getBooleanExtra("dark",false)?R.style.MushafiDarkSurfaceTheme:R.style.MushafiBaseTheme);super.onCreate(state);JSONObject r=route(this,getIntent().getStringExtra("route"));if(r==null){finish();return;}
  boolean dark=getIntent().getBooleanExtra("dark",false),english=!UiLocale.rtl(this);bg=Color.parseColor(dark?NightPalette.BACKGROUND_HEX:"#f5f3ed");ink=Color.parseColor(dark?NightPalette.INK_HEX:"#173f33");accent=dark?NightPalette.GOLD:ink;getWindow().setStatusBarColor(bg);getWindow().setNavigationBarColor(bg);getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|(android.os.Build.VERSION.SDK_INT>=26?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0));
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(bg);root.setLayoutDirection(english?View.LAYOUT_DIRECTION_LTR:View.LAYOUT_DIRECTION_RTL);
  LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(8),dp(6),dp(8),dp(6));
  Button back=button(english?"←":"→","رجوع");back.setOnClickListener(v->navigateBack());bar.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));
  LinearLayout labels=new LinearLayout(this);labels.setOrientation(LinearLayout.VERTICAL);labels.setPadding(dp(8),0,dp(8),0);TextView title=new TextView(this);title.setText(text(r.optString("title")));title.setTextColor(ink);title.setTextSize(15);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);labels.addView(title);
  origin=new TextView(this);origin.setTextColor(ink);origin.setAlpha(.75f);origin.setTextSize(11);origin.setMaxLines(1);origin.setTextDirection(View.TEXT_DIRECTION_LTR);origin.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);labels.addView(origin);bar.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
  Button reload=button("↻","إعادة المحاولة");reload.setOnClickListener(v->{WebView w=current();if(w!=null)w.reload();});bar.addView(reload,new LinearLayout.LayoutParams(dp(42),dp(48)));
  Button outside=button("↗","فتح في المتصفح عند الحاجة");outside.setOnClickListener(v->{WebView w=current();if(w==null)return;Uri u=Uri.parse(w.getUrl()==null?"":w.getUrl());if(https(u))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){showStatus("تعذر فتح المتصفح");}});bar.addView(outside,new LinearLayout.LayoutParams(dp(42),dp(48)));
  Button close=button("×","إغلاق");close.setOnClickListener(v->finish());bar.addView(close,new LinearLayout.LayoutParams(dp(42),dp(48)));root.addView(bar);
  progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
  status=new TextView(this);status.setPadding(dp(14),dp(8),dp(14),dp(8));status.setTextColor(ink);status.setTextSize(12);status.setVisibility(View.GONE);root.addView(status);
  stage=new FrameLayout(this);root.addView(stage,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);WebView first=createWindow();first.loadUrl(r.optString("url"));
  if(android.os.Build.VERSION.SDK_INT>=33){backCallback=this::navigateBack;getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,backCallback);}
 }
 private Button button(String label,String description){Button b=new Button(this);b.setText(label);b.setTextSize(22);b.setTextColor(accent);b.setBackgroundColor(Color.TRANSPARENT);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(0,0,0,0);b.setContentDescription(text(description));return b;}
 private void showStatus(String message){if(disposed)return;status.setText(text(message));status.setVisibility(View.VISIBLE);}
 private void updateOrigin(WebView w,String url){if(disposed||w!=current())return;try{Uri u=Uri.parse(url==null?"":url);if(https(u))origin.setText("https://"+java.net.IDN.toASCII(u.getHost()));else origin.setText("");}catch(Exception ignored){origin.setText("");}}
 private WebView createWindow(){
  WebView w=new WebView(this);w.setBackgroundColor(bg);WebSettings s=w.getSettings();s.setJavaScriptEnabled(true);if(android.os.Build.VERSION.SDK_INT>=33)s.setAlgorithmicDarkeningAllowed(getIntent().getBooleanExtra("dark",false));else if(android.os.Build.VERSION.SDK_INT>=29)s.setForceDark(getIntent().getBooleanExtra("dark",false)?WebSettings.FORCE_DARK_ON:WebSettings.FORCE_DARK_OFF);s.setDomStorageEnabled(true);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setGeolocationEnabled(false);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(true);s.setMediaPlaybackRequiresUserGesture(true);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);if(android.os.Build.VERSION.SDK_INT>=26)s.setSafeBrowsingEnabled(true);CookieManager.getInstance().setAcceptThirdPartyCookies(w,true);
  w.setOnTouchListener((v,event)->{if(event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN)interactionAt=android.os.SystemClock.elapsedRealtime();return false;});
  w.setDownloadListener((a,b,c,d,e)->showStatus("تحميل الملفات غير متاح هنا. يمكنك فتح الصفحة في المتصفح عند الحاجة."));
  w.setWebViewClient(new WebViewClient(){
   private boolean allow(String url){if(url==null)return true;if("about:blank".equals(url)||https(Uri.parse(url)))return false;showStatus("هذه الخطوة تحتاج تطبيقًا أو متصفحًا خارجيًا. استخدم زر الفتح الخارجي إذا رغبت.");return true;}
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return allow(request.getUrl().toString());}
   @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return allow(url);}
   @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(view!=current()||disposed)return;status.setVisibility(View.GONE);progress.setVisibility(View.VISIBLE);updateOrigin(view,url);}
   @Override public void onPageFinished(WebView view,String url){if(view==current()&&!disposed){progress.setVisibility(View.GONE);updateOrigin(view,url);}}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();showStatus("توقف الاتصال بسبب مشكلة في شهادة الأمان. لم يتم تجاوز التحقق.");}
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()&&view==current())showStatus("تعذر تحميل صفحة الجهة. تحقق من الاتصال ثم أعد المحاولة.");}
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400&&view==current())showStatus("تعذر تحميل صفحة الجهة. تحقق من الاتصال ثم أعد المحاولة.");}
   @Override public void onSafeBrowsingHit(WebView view,WebResourceRequest request,int type,SafeBrowsingResponse response){response.backToSafety(true);}
  });
  w.setWebChromeClient(new WebChromeClient(){
   @Override public void onProgressChanged(WebView view,int value){if(view==current()&&!disposed){progress.setProgress(value);progress.setVisibility(value<100?View.VISIBLE:View.GONE);updateOrigin(view,view.getUrl());}}
   @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,false,false);}
   @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean gesture,Message result){if(disposed||windows.size()>=4||(!gesture&&(interactionAt==0||android.os.SystemClock.elapsedRealtime()-interactionAt>15000)))return false;WebView popup=createWindow();WebView.WebViewTransport transport=(WebView.WebViewTransport)result.obj;transport.setWebView(popup);result.sendToTarget();return true;}
   @Override public void onCloseWindow(WebView window){if(windows.size()>1&&windows.contains(window))removeWindow(window);}
  });
  WebView old=current();if(old!=null)old.setVisibility(View.GONE);windows.add(w);stage.addView(w,new FrameLayout.LayoutParams(-1,-1));w.requestFocus();return w;
 }
 private void removeWindow(WebView w){windows.remove(w);stage.removeView(w);w.stopLoading();w.setWebChromeClient(null);w.setWebViewClient(new WebViewClient());w.destroy();WebView next=current();if(next!=null){next.setVisibility(View.VISIBLE);next.requestFocus();updateOrigin(next,next.getUrl());}}
 private void navigateBack(){WebView w=current();if(w!=null&&w.canGoBack()){w.goBack();return;}if(windows.size()>1){removeWindow(w);return;}finish();}
 @Override public void onBackPressed(){navigateBack();}
 @Override protected void onPause(){for(WebView w:windows)w.onPause();CookieManager.getInstance().flush();super.onPause();}
 @Override protected void onResume(){super.onResume();for(WebView w:windows)w.onResume();}
 @Override protected void onDestroy(){disposed=true;if(android.os.Build.VERSION.SDK_INT>=33&&backCallback!=null)getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);while(!windows.isEmpty())removeWindow(current());super.onDestroy();}
}
