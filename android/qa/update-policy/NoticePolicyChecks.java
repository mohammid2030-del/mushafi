import com.mushafi.app.AppUpdatePolicy;
import com.mushafi.app.AppUpdateNoticePolicy;
public final class NoticePolicyChecks {
 static void need(boolean yes,String name){if(!yes)throw new AssertionError(name);}
 public static void main(String[] args){AppUpdatePolicy r=new AppUpdatePolicy(167,"3.1.17",23,"https://mushafi.mohammedasif241.chatgpt.site/download/Mushafi-3.1.17.apk","a".repeat(64),118000000);
 need(AppUpdateNoticePolicy.shouldNotify(r,166,36,0,true,true),"new compatible release");
 need(!AppUpdateNoticePolicy.shouldNotify(r,166,36,167,true,true),"dismissed release does not repeat");
 need(!AppUpdateNoticePolicy.shouldNotify(r,166,36,168,true,true),"older than notified release");
 need(!AppUpdateNoticePolicy.shouldNotify(r,167,36,0,true,true),"already installed");
 need(!AppUpdateNoticePolicy.shouldNotify(r,168,36,0,true,true),"no downgrade");
 need(!AppUpdateNoticePolicy.shouldNotify(r,166,22,0,true,true),"unsupported Android");
 need(!AppUpdateNoticePolicy.shouldNotify(r,166,36,0,false,true),"unpublished release");
 need(!AppUpdateNoticePolicy.shouldNotify(r,166,36,0,true,false),"permission and channel respected");
 need(AppUpdateNoticePolicy.shouldNotify(r,166,36,166,true,true),"next release after earlier alert");
 System.out.println("PASS update notifications: new release, persistent deduplication, withdrawal, installed version, SDK and permission gates");
 }
}
