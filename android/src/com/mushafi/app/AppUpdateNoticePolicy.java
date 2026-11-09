package com.mushafi.app;
/** One notification per compatible published release, independent of UI sessions. */
public final class AppUpdateNoticePolicy {
 public static boolean shouldNotify(AppUpdatePolicy release,long installed,int sdk,long notified,boolean available,boolean permission){
  return available&&permission&&release.newerThan(installed,sdk)&&release.code>notified;
 }
 private AppUpdateNoticePolicy(){}
}
