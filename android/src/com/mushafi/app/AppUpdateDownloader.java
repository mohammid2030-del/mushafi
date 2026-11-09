package com.mushafi.app;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
/** Three bounded ranges, durable per-release chunks, and retry/resume without trusting partial bytes. */
public final class AppUpdateDownloader {
 public interface ConnectionFactory {HttpURLConnection open(String url)throws IOException;}
 public interface Listener {void progress(long received,long total,long bytesPerSecond);}
 private final AppUpdatePolicy release;private final File root,parts;private final ConnectionFactory factory;private final Listener listener;
 private final Set<HttpURLConnection> connections=Collections.newSetFromMap(new ConcurrentHashMap<HttpURLConnection,Boolean>());
 private final AtomicLong received=new AtomicLong();private volatile boolean cancelled,failed;private long lastReport,lastBytes,startTime;
 public AppUpdateDownloader(AppUpdatePolicy release,File root,ConnectionFactory factory,Listener listener){this.release=release;this.root=root;this.factory=factory;this.listener=listener;parts=new File(root,"partial-"+release.sha256);}
 public void cancel(){cancelled=true;for(HttpURLConnection c:connections)c.disconnect();}
 private void active()throws InterruptedIOException{if(cancelled||failed||Thread.currentThread().isInterrupted())throw new InterruptedIOException("Download paused");}
 private HttpURLConnection connect()throws IOException{active();HttpURLConnection c=factory.open(release.url);c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setRequestProperty("Accept-Encoding","identity");connections.add(c);try{active();return c;}catch(IOException e){close(c);throw e;}}
 private void close(HttpURLConnection c){connections.remove(c);c.disconnect();}
 private synchronized void report(boolean force){long now=System.nanoTime()/1000000;if(!force&&now-lastReport<300)return;long total=received.get(),elapsed=now-startTime,speed=elapsed>0?Math.max(0,(total-lastBytes)*1000/elapsed):0;lastReport=now;listener.progress(total,release.size,speed);}
 public File download()throws Exception{
  if(!root.exists()&&!root.mkdirs()||!parts.exists()&&!parts.mkdirs())throw new IOException("Storage unavailable");parts.setLastModified(System.currentTimeMillis());boolean ranges=false;HttpURLConnection probe=connect();try{probe.setRequestMethod("HEAD");int status=probe.getResponseCode();if(status==200){String length=probe.getHeaderField("Content-Length");if(length!=null&&Long.parseLong(length)!=release.size)throw new IOException("Length mismatch");ranges="bytes".equalsIgnoreCase(probe.getHeaderField("Accept-Ranges"));}else if(status!=405)throw new IOException("Release unavailable");}finally{close(probe);}
  int count=ranges&&release.size>=3*1024*1024?3:1;long chunk=(release.size+count-1)/count,totalSaved=0;for(int i=0;i<count;i++){long length=Math.min(chunk,release.size-i*chunk);File f=part(i,ranges);if(f.length()>length||!ranges&&f.length()!=length)f.delete();totalSaved+=f.length();}if(root.getUsableSpace()<release.size+(release.size-totalSaved)+8*1024*1024L)throw new IOException("Storage full");received.set(totalSaved);lastBytes=totalSaved;startTime=System.nanoTime()/1000000;report(true);
  ExecutorService pool=Executors.newFixedThreadPool(count);CompletionService<Void> complete=new ExecutorCompletionService<>(pool);for(int i=0;i<count;i++){final int index=i;final boolean ranged=ranges;final long start=i*chunk,end=Math.min(release.size,(i+1)*chunk)-1;complete.submit(()->{transfer(part(index,ranged),start,end,ranged);return null;});}
  try{for(int i=0;i<count;i++)complete.take().get();}catch(Exception e){failed=true;for(HttpURLConnection c:connections)c.disconnect();throw e;}finally{pool.shutdownNow();pool.awaitTermination(35,TimeUnit.SECONDS);}
  active();File merged=new File(root,"update.part");try(OutputStream out=new BufferedOutputStream(new FileOutputStream(merged),262144)){byte[] buffer=new byte[262144];for(int i=0;i<count;i++){active();try(InputStream in=new BufferedInputStream(new FileInputStream(part(i,ranges)),262144)){int n;while((n=in.read(buffer))!=-1){active();out.write(buffer,0,n);}}}}catch(Exception e){merged.delete();throw e;}if(merged.length()!=release.size){merged.delete();throw new IOException("Merged length mismatch");}report(true);active();return merged;
 }
 private File part(int index,boolean ranged){return new File(parts,(ranged?"range-":"single-")+index+".chunk");}
 private void transfer(File file,long start,long end,boolean ranged)throws Exception{long length=end-start+1;for(int attempt=0;attempt<3;attempt++){active();long saved=file.length();if(saved==length)return;if(saved>length||!ranged&&saved>0){file.delete();received.addAndGet(-saved);saved=0;}HttpURLConnection c=connect();try{long offset=start+saved;if(ranged)c.setRequestProperty("Range","bytes="+offset+"-"+end);int status=c.getResponseCode();if(ranged){if(status!=206||!("bytes "+offset+"-"+end+"/"+release.size).equals(c.getHeaderField("Content-Range")))throw new IOException("Invalid range response");}else if(status!=200)throw new IOException("Release unavailable");String declared=c.getHeaderField("Content-Length");if(declared!=null&&Long.parseLong(declared)!=length-saved)throw new IOException("Range length mismatch");try(InputStream in=new BufferedInputStream(c.getInputStream(),131072);OutputStream out=new BufferedOutputStream(new FileOutputStream(file,true),131072)){byte[] bytes=new byte[131072];int n;long written=saved;while((n=in.read(bytes))!=-1){active();if(written+n>length)throw new IOException("Oversized response");out.write(bytes,0,n);written+=n;received.addAndGet(n);report(false);}}if(file.length()!=length)throw new EOFException("Interrupted transfer");return;}catch(Exception e){active();if(attempt==2)throw e;Thread.sleep(300L*(attempt+1));}finally{close(c);}}}
 /** Called only after full checksum and APK signing identity verification. */
 public void verified(){delete(parts);}
 public void discard(){delete(parts);new File(root,"update.part").delete();}
 public static void delete(File file){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);file.delete();}
}
