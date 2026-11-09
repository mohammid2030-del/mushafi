package com.mushafi.app;
import java.net.URI;
import java.io.*;
import java.security.MessageDigest;
/** Strict release metadata and byte checks, independent of UI/network implementation. */
public final class AppUpdatePolicy {
 public static final String HOST="mushafi.mohammedasif241.chatgpt.site",ORIGIN="https://"+HOST,MANIFEST=ORIGIN+"/api/app-update";
 public final int code,minSdk;public final String version,url,sha256;public final long size;
 public AppUpdatePolicy(int code,String version,int minSdk,String url,String sha256,long size){
  if(code<1||version==null||!version.matches("[0-9]{1,4}(\\.[0-9]{1,4}){1,3}")||minSdk<23||minSdk>100||size<1000000||size>250L*1024*1024||sha256==null||!sha256.matches("[0-9a-f]{64}"))throw new IllegalArgumentException("Invalid release metadata");
  URI uri=URI.create(url);if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost())||uri.getPort()!=-1||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!uri.getRawPath().equals("/download/Mushafi-"+version+".apk"))throw new IllegalArgumentException("Untrusted release URL");
  this.code=code;this.version=version;this.minSdk=minSdk;this.url=url;this.sha256=sha256;this.size=size;
 }
 public boolean newerThan(long installed,int sdk){return code>installed&&minSdk<=sdk;}
 public void verify(File file)throws Exception{if(file.length()!=size)throw new IOException("Release size mismatch");MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)digest.update(bytes,0,n);}if(!sha256.equals(hex(digest.digest())))throw new IOException("Release checksum mismatch");}
 public static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.US,"%02x",b&255));return out.toString();}
}
