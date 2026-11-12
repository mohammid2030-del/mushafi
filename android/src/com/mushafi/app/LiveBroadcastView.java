package com.mushafi.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;

/** Isolated video WebView in the caller's window. The app DOM stays attached and resumed. */
public final class LiveBroadcastView {
 private final Activity activity;
 private final Runnable onClosed;
 private final FrameLayout root;
 private final LinearLayout content,errorPanel,toolbar;
 private final ProgressBar progress;
 private final WebView player;
 private final TextView title,message;
 private final Button backButton,retry;
 private View fullScreen;
 private WebChromeClient.CustomViewCallback fullScreenCallback;
 private String pageUrl;
 private boolean dark,open,disposed;
 private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
 static boolean validCity(String city){return "makkah".equals(city)||"madinah".equals(city);}
 static boolean playerPage(Uri uri,String expected){return uri!=null&&expected!=null&&"https".equals(uri.getScheme())&&uri.getPort()==-1&&"go.mushafi.workers.dev".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().equals(Uri.parse(expected).getPath());}
 static boolean officialBroadcastEmbed(Uri uri){return uri!=null&&"https".equals(uri.getScheme())&&uri.getPort()==-1&&"aloula.sba.sa".equals(uri.getHost())&&("/ar/live/quran".equals(uri.getPath())||"/ar/live/sunna".equals(uri.getPath()))&&"true".equals(uri.getQueryParameter("embed"));}
 LiveBroadcastView(Activity owner,FrameLayout parent,Runnable closed){
  activity=owner;onClosed=closed;root=new FrameLayout(owner);root.setClickable(true);root.setVisibility(View.GONE);
  content=new LinearLayout(owner);content.setOrientation(LinearLayout.VERTICAL);root.addView(content,new FrameLayout.LayoutParams(-1,-1));
  toolbar=new LinearLayout(owner);toolbar.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);toolbar.setGravity(Gravity.CENTER_VERTICAL);toolbar.setPadding(dp(12),dp(6),dp(12),dp(6));
  backButton=new Button(owner);backButton.setText("→");backButton.setTextSize(25);backButton.setBackgroundColor(Color.TRANSPARENT);backButton.setContentDescription(UiLocale.text(owner,"رجوع إلى قائمة البث"));backButton.setOnClickListener(v->back());toolbar.addView(backButton,new LinearLayout.LayoutParams(dp(52),dp(52)));
  title=new TextView(owner);title.setTextSize(18);title.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);toolbar.addView(title,new LinearLayout.LayoutParams(0,-2,1));content.addView(toolbar,new LinearLayout.LayoutParams(-1,-2));
  progress=new ProgressBar(owner,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);content.addView(progress,new LinearLayout.LayoutParams(-1,dp(2)));
  FrameLayout area=new FrameLayout(owner);content.addView(area,new LinearLayout.LayoutParams(-1,0,1));player=new WebView(owner);area.addView(player,new FrameLayout.LayoutParams(-1,-1));
  WebSettings settings=player.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setGeolocationEnabled(false);settings.setMediaPlaybackRequiresUserGesture(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);if(android.os.Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);CookieManager.getInstance().setAcceptThirdPartyCookies(player,false);
  // Never add AndroidReader (or any JavaScript interface) to internet content.
  errorPanel=new LinearLayout(owner);errorPanel.setOrientation(LinearLayout.VERTICAL);errorPanel.setGravity(Gravity.CENTER);errorPanel.setPadding(dp(28),dp(28),dp(28),dp(28));
  message=new TextView(owner);message.setText(UiLocale.text(owner,"تعذر تحميل البث الآن\nتحقق من اتصالك بالإنترنت وأعد المحاولة."));message.setGravity(Gravity.CENTER);message.setTextSize(17);message.setLineSpacing(dp(7),1);errorPanel.addView(message,new LinearLayout.LayoutParams(-1,-2));
  retry=new Button(owner);retry.setText(UiLocale.text(owner,"إعادة المحاولة"));retry.setOnClickListener(v->{if(open)player.loadUrl(pageUrl);});LinearLayout.LayoutParams retrySize=new LinearLayout.LayoutParams(-2,dp(52));retrySize.topMargin=dp(22);errorPanel.addView(retry,retrySize);area.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));errorPanel.setVisibility(View.GONE);
  player.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView web,WebResourceRequest request){return !(request.isForMainFrame()?playerPage(request.getUrl(),pageUrl):officialBroadcastEmbed(request.getUrl()));}
   @Override public boolean shouldOverrideUrlLoading(WebView web,String url){Uri uri=Uri.parse(url);return !playerPage(uri,pageUrl)&&!officialBroadcastEmbed(uri);}
   @Override public void onReceivedSslError(WebView web,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();failed();}
   @Override public void onPageStarted(WebView web,String url,android.graphics.Bitmap icon){if(open&&playerPage(Uri.parse(url),pageUrl)){errorPanel.setVisibility(View.GONE);progress.setVisibility(View.VISIBLE);}}
   @Override public void onPageFinished(WebView web,String url){progress.setVisibility(View.GONE);if(playerPage(Uri.parse(url),pageUrl))localizeWrapper();if(!open&&!disposed)pausePage();}
   @Override public void onReceivedError(WebView web,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())failed();}
   @Override public void onReceivedHttpError(WebView web,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)failed();}
  });
  player.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,false,false);}
   @Override public void onShowCustomView(View view,CustomViewCallback callback){if(!open||fullScreen!=null){callback.onCustomViewHidden();return;}fullScreen=view;fullScreenCallback=callback;content.setVisibility(View.GONE);root.addView(view,new FrameLayout.LayoutParams(-1,-1));applySystemBars();}
   @Override public void onHideCustomView(){hideFullscreen();}
  });
  parent.addView(root,new FrameLayout.LayoutParams(-1,-1));
 }
 void setSafeInsets(int top,int bottom){content.setPadding(0,Math.max(0,top),0,Math.max(0,bottom));}
 public boolean isOpen(){return open&&!disposed;}
 public void open(String city,boolean isDark){if(disposed||!validCity(city))return;hideFullscreen();dark=isDark;open=true;int bg=Color.parseColor(dark?NightPalette.BACKGROUND_HEX:"#f5f3ed"),ink=Color.parseColor(dark?NightPalette.INK_HEX:"#173f33");root.setBackgroundColor(bg);player.setBackgroundColor(bg);errorPanel.setBackgroundColor(bg);title.setTextColor(ink);message.setTextColor(ink);backButton.setTextColor(dark?NightPalette.GOLD:ink);retry.setTextColor(Color.parseColor(dark?NightPalette.GOLD_HEX:"#b99a5c"));retry.setBackgroundTintList(dark?android.content.res.ColorStateList.valueOf(NightPalette.SURFACE):null);boolean english=!UiLocale.rtl(activity);toolbar.setLayoutDirection(english?View.LAYOUT_DIRECTION_LTR:View.LAYOUT_DIRECTION_RTL);title.setGravity((english?Gravity.LEFT:Gravity.RIGHT)|Gravity.CENTER_VERTICAL);backButton.setText(english?"←":"→");backButton.setContentDescription(UiLocale.text(activity,"رجوع إلى قائمة البث"));retry.setText(UiLocale.text(activity,"إعادة المحاولة"));message.setText(UiLocale.text(activity,"تعذر تحميل البث الآن\nتحقق من اتصالك بالإنترنت وأعد المحاولة."));title.setText(UiLocale.text(activity,city.equals("makkah")?"بث مباشر مكة المكرمة":"بث مباشر المدينة المنورة"));pageUrl="https://go.mushafi.workers.dev/live/"+city+"?theme="+(dark?"dark":"light");errorPanel.setVisibility(View.GONE);progress.setVisibility(View.VISIBLE);root.setVisibility(View.VISIBLE);root.bringToFront();player.onResume();player.requestFocus();applySystemBars();player.loadUrl(pageUrl);}
 private void localizeWrapper(){if(UiLocale.language(activity).equals("ar"))return;try(java.io.InputStream in=activity.getAssets().open("live-ui-language.js");java.util.Scanner scanner=new java.util.Scanner(in,"UTF-8").useDelimiter("\\A")){org.json.JSONObject dictionary=new org.json.JSONObject();for(String text:new String[]{"المسجد الحرام","المسجد النبوي","اضغط تشغيل لمشاهدة البث","متوقف مؤقتًا","إعادة المحاولة","المصدر: قناة القرآن الكريم عبر منصة الأولى","المصدر: قناة السنة النبوية عبر منصة الأولى","حقوق البث محفوظة لهيئة الإذاعة والتلفزيون السعودية.","بث مباشر مكة المكرمة","بث مباشر المدينة المنورة"})dictionary.put(text,UiLocale.text(activity,text));if(scanner.hasNext())player.evaluateJavascript(scanner.next()+"\nwindow.applyMushafiLiveEnglish("+dictionary.toString()+",\""+UiLocale.language(activity)+"\");",null);}catch(Exception ignored){}}
 private void failed(){if(open){progress.setVisibility(View.GONE);errorPanel.setVisibility(View.VISIBLE);}}
 private void hideFullscreen(){if(fullScreen==null)return;View outgoing=fullScreen;fullScreen=null;root.removeView(outgoing);content.setVisibility(View.VISIBLE);WebChromeClient.CustomViewCallback callback=fullScreenCallback;fullScreenCallback=null;if(callback!=null)callback.onCustomViewHidden();applySystemBars();}
 public void applySystemBars(){if(!open)return;if(android.os.Build.VERSION.SDK_INT>=30){WindowInsetsController c=activity.getWindow().getInsetsController();if(c!=null){c.setSystemBarsAppearance(dark?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);if(fullScreen!=null){c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);c.hide(WindowInsets.Type.systemBars());}else c.show(WindowInsets.Type.systemBars());}}else activity.getWindow().getDecorView().setSystemUiVisibility(fullScreen!=null?View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY:View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|(android.os.Build.VERSION.SDK_INT>=26?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0)));}
 private void pausePage(){player.evaluateJavascript("window.pauseLiveBroadcast&&window.pauseLiveBroadcast()",null);}
 public void pause(){if(disposed)return;hideFullscreen();pausePage();player.onPause();}
 public void resume(){if(isOpen()){player.onResume();player.evaluateJavascript("window.resumeLiveBroadcast&&window.resumeLiveBroadcast()",null);applySystemBars();}}
 public void back(){if(!isOpen())return;if(fullScreen!=null){hideFullscreen();return;}close();}
 private void close(){if(!open)return;hideFullscreen();open=false;pausePage();player.stopLoading();root.setVisibility(View.GONE);onClosed.run();}
 public void destroy(){if(disposed)return;open=false;disposed=true;hideFullscreen();player.stopLoading();player.setWebChromeClient(null);player.setWebViewClient(new WebViewClient());if(root.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)root.getParent()).removeView(root);if(player.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)player.getParent()).removeView(player);player.destroy();}
}
