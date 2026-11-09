import com.mushafi.app.AppUpdatePolicy;
import com.mushafi.app.AppUpdateNoticePolicy;
import com.mushafi.app.AppUpdatePushPayload;
import java.util.*;
public final class PushPayloadChecks {
 static void need(boolean yes,String name){if(!yes)throw new AssertionError(name);}
 static Map<String,String> valid(){Map<String,String>d=new HashMap<>();d.put("kind","app_update");d.put("packageName","com.mushafi.app");d.put("available","true");d.put("versionCode","169");d.put("versionName","3.1.19");d.put("minSdk","23");d.put("url","https://mushafi.mohammedasif241.chatgpt.site/download/Mushafi-3.1.19.apk");d.put("size","119000000");d.put("sha256",String.join("",Collections.nCopies(64,"a")));return d;}
 static void blocked(String key,String value){Map<String,String>d=valid();d.put(key,value);try{need(AppUpdatePushPayload.parse(d)==null,"must reject "+key);}catch(IllegalArgumentException expected){}}
 public static void main(String[] args){AppUpdatePolicy release=AppUpdatePushPayload.parse(valid());need(release.code==169,"valid push");need(AppUpdateNoticePolicy.shouldNotify(release,168,36,168,true,true),"new release posts");need(!AppUpdateNoticePolicy.shouldNotify(release,169,36,168,true,true),"own installed version suppressed");need(!AppUpdateNoticePolicy.shouldNotify(release,168,36,169,true,true),"FCM and job race deduplicated");blocked("kind","download_now");blocked("packageName","another.app");blocked("available","false");blocked("versionCode","nonsense");blocked("minSdk","1");blocked("url","https://evil.example/Mushafi-3.1.19.apk");blocked("sha256","no");blocked("size","1");System.out.println("PASS push payload: valid release, no own-version alert, FCM/job dedup, wrong package/kind, untrusted URL, malformed metadata and unpublished release rejected");}
}
