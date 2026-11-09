package com.mushafi.app;
import android.app.Activity;
import android.webkit.WebView;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import java.net.*;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.JSONObject;
/** Firebase credentials go directly to our fixed API; never into WebView JavaScript. */
final class ChallengeClient {
 static final String BASE="https://mushafi-challenge.mohammedasif241.chatgpt.site";
 private final Activity activity;private final WebView web;
 private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,2,20,TimeUnit.SECONDS,new ArrayBlockingQueue<>(8));
 private volatile boolean closed;
 ChallengeClient(Activity activity,WebView web){this.activity=activity;this.web=web;}
 static boolean validPath(String path){return path!=null&&(path.equals("/v1/profile")||path.equals("/v1/rooms")||path.equals("/v1/join")||path.equals("/v1/queue")||path.matches("/v1/room/[a-f0-9-]{36}(/(answer|start|leave))?"));}
 static boolean validMethod(String method,String path){if(method==null||!validPath(path))return false;if(path.equals("/v1/profile"))return method.equals("GET")||method.equals("DELETE");if(path.matches("/v1/room/[a-f0-9-]{36}"))return method.equals("GET");return method.equals("POST");}
 void request(String id,String method,String path,String body){if(closed||id==null||!id.matches("ch[0-9]{1,12}"))return;if(!validMethod(method,path)||body==null||body.getBytes(StandardCharsets.UTF_8).length>4096){reply(id,400,error("طلب منافسة غير صالح"),null);return;}FirebaseUser user;try{user=FirebaseAuth.getInstance().getCurrentUser();}catch(Exception e){reply(id,401,error("سجّل الدخول للمنافسة"),null);return;}if(user==null){reply(id,401,error("سجّل الدخول للمنافسة"),null);return;}send(user,user.getUid(),id,method,path,body,false);}
 private void send(FirebaseUser user,String uid,String id,String method,String path,String body,boolean refreshed){user.getIdToken(refreshed).addOnSuccessListener(result->{if(closed)return;if(!sameUser(uid)){reply(id,401,error("تغيّر الحساب، أعد فتح الغرفة"),null);return;}try{executor.execute(()->{try{Result r=call(result.getToken(),method,path,body);if(r.status==401&&!refreshed&&sameUser(uid)){send(user,uid,id,method,path,body,true);return;}reply(id,r.status,r.data,uid);}catch(Exception e){reply(id,503,error("تعذر الاتصال بخدمة التحدّي، تحقق من الإنترنت وأعد المحاولة"),uid);}});}catch(RejectedExecutionException e){reply(id,429,error("انتظر قليلًا ثم أعد المحاولة"),uid);}}).addOnFailureListener(e->reply(id,401,error("تعذر التحقق من الحساب، أعد تسجيل الدخول"),uid));}
 static final class Result{final int status;final JSONObject data;Result(int s,JSONObject d){status=s;data=d;}}
 static Result call(String token,String method,String path,String body)throws Exception{HttpsURLConnection c=(HttpsURLConnection)new URL(BASE+path).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(8000);c.setReadTimeout(10000);c.setRequestMethod(method);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Accept","application/json");try{if(method.equals("POST")){byte[] bytes=body.getBytes(StandardCharsets.UTF_8);c.setRequestProperty("Content-Type","application/json");c.setDoOutput(true);c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}}int status=c.getResponseCode();InputStream stream=status<400?c.getInputStream():c.getErrorStream();if(stream==null)return new Result(status,error("خدمة المنافسات غير متاحة"));ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=stream){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>1500000)throw new IOException("size");bytes.write(buffer,0,n);}}JSONObject json;try{json=new JSONObject(bytes.toString("UTF-8"));}catch(Exception e){json=error("تعذر الوصول إلى خدمة المنافسات");if(status<400)status=503;}return new Result(status,json);}finally{c.disconnect();}}
 private boolean sameUser(String uid){try{FirebaseUser u=FirebaseAuth.getInstance().getCurrentUser();return u!=null&&uid.equals(u.getUid());}catch(Exception e){return false;}}
 private static JSONObject error(String text){try{return new JSONObject().put("error",text);}catch(Exception e){return new JSONObject();}}
 private void reply(String id,int status,JSONObject data,String uid){activity.runOnUiThread(()->{if(closed||activity.isFinishing())return;if(uid!=null&&!sameUser(uid)){statusReply(id,401,error("تغيّر الحساب، أعد فتح الغرفة"));return;}statusReply(id,status,data);});}
 private void statusReply(String id,int status,JSONObject data){try{JSONObject r=new JSONObject().put("requestId",id).put("status",status).put("data",data);web.evaluateJavascript("window.onChallengeResponse&&window.onChallengeResponse("+r.toString().replace("<","\\u003c").replace("\u2028","\\u2028").replace("\u2029","\\u2029")+")",null);}catch(Exception ignored){}}
 static void eraseBeforeAccount(Activity activity,FirebaseUser user,Runnable success,Runnable failure){user.getIdToken(true).addOnSuccessListener(result->new Thread(()->{try{Result r=call(result.getToken(),"DELETE","/v1/profile","{}");activity.runOnUiThread(()->{if(r.status>=200&&r.status<300){success.run();}else failure.run();});}catch(Exception e){activity.runOnUiThread(failure);}},"challenge-delete").start()).addOnFailureListener(e->failure.run());}
 void destroy(){closed=true;executor.shutdownNow();}
}
