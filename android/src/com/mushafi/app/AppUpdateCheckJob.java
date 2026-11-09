package com.mushafi.app;
import android.app.job.*;
import android.os.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;
import org.json.JSONObject;
/** Bounded HTTPS metadata request only: no APK download, open Activity, location or account required. */
public final class AppUpdateCheckJob extends JobService {
 private final ConcurrentHashMap<Integer,Check> runs=new ConcurrentHashMap<>();
 private final Handler main=new Handler(Looper.getMainLooper());
 final class Check implements Runnable {
  final JobParameters params;volatile boolean stopped;volatile HttpURLConnection connection;Thread thread;
  Check(JobParameters p){params=p;}
  void stop(){stopped=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();if(thread!=null)thread.interrupt();}
  @Override public void run(){boolean retry=false;try{
   if(!AppUpdateNotifications.permitted(AppUpdateCheckJob.this))return;
   HttpURLConnection c=(HttpURLConnection)new URL(AppUpdatePolicy.MANIFEST).openConnection();connection=c;c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("User-Agent","Mushafi background update check");
   if(stopped)return;if(c.getResponseCode()!=200)throw new IOException("Update service unavailable");JSONObject manifest;
   try(InputStream in=c.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(stopped)return;if(bytes.size()+n>65536)throw new IOException("Manifest too large");bytes.write(buffer,0,n);}manifest=new JSONObject(bytes.toString("UTF-8"));}
   if(!"com.mushafi.app".equals(manifest.optString("packageName")))throw new IOException("Wrong application");
   AppUpdatePolicy release=new AppUpdatePolicy(manifest.getInt("versionCode"),manifest.getString("versionName"),manifest.getInt("minSdk"),manifest.getString("url"),manifest.getString("sha256"),manifest.getLong("size"));
   if(!stopped)AppUpdateNotifications.deliver(AppUpdateCheckJob.this,release,manifest.optBoolean("available",false));
  }catch(Exception ignored){retry=!stopped;}finally{HttpURLConnection c=connection;if(c!=null)c.disconnect();connection=null;final boolean reschedule=retry;main.post(()->{if(runs.remove(params.getJobId(),this)&&!stopped)jobFinished(params,reschedule);});}}
 }
 @Override public boolean onStartJob(JobParameters params){Check check=new Check(params);Check old=runs.put(params.getJobId(),check);if(old!=null)old.stop();check.thread=new Thread(check,"mushafi-update-check");check.thread.start();return true;}
 @Override public boolean onStopJob(JobParameters params){Check check=runs.remove(params.getJobId());if(check!=null)check.stop();return true;}
 @Override public void onDestroy(){for(Check check:runs.values())check.stop();runs.clear();super.onDestroy();}
}
