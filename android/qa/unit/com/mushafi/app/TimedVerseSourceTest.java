package com.mushafi.app;
import org.json.*;import java.nio.file.*;import java.util.Random;
/** Regression: structurally valid publisher timing must not authorize mismatched verse playback. */
public class TimedVerseSourceTest {
 static void need(boolean b){if(!b)throw new AssertionError();}
 interface Task{void run()throws Exception;}static void rejects(Task t)throws Exception{try{t.run();throw new AssertionError("accepted unverified metadata");}catch(AssertionError e){throw e;}catch(Exception expected){}}
 public static void main(String[] args)throws Exception{
  JSONObject data=new JSONObject(new String(Files.readAllBytes(Paths.get(args[0])),"UTF-8"));JSONObject full=new JSONObject(new String(Files.readAllBytes(Paths.get(args[1])),"UTF-8")).getJSONObject("1005");JSONObject spec=data.getJSONObject("1005");need(!spec.getBoolean("verseTimingVerified"));need(spec.getJSONArray("unavailable").length()==6236);int[] counts=new int[114];
  for(int c=1;c<=114;c++){JSONObject t=full.getJSONObject("chapters").getJSONObject(""+c);need(!t.getBoolean("verseTimingVerified")&&!t.getBoolean("trimToTimings")&&t.getInt("audioOffsetMs")==0&&t.getJSONArray("timings").length()==0);counts[c-1]=t.getInt("verseCount");}
  for(int i=0;i<6236;i++){String key=spec.getJSONArray("unavailable").getString(i);rejects(()->TimedVerseSource.bounds(data,1005,key));}
  for(int c=1;c<=114;c++){int[] next=RecitationSequence.next("continuous",c,counts[c-1],counts,new Random(2));need(c==114?next==null:next[0]==c+1&&next[1]==1);need(RecitationSequence.next("single",c,counts[c-1],counts,new Random())==null);int[] random=RecitationSequence.next("random",c,counts[c-1],counts,new Random(c));need(random[0]!=c&&random[1]==1);}
  spec.put("sourceVersion","mp3quran-nafees-v1").put("segments",new JSONObject().put("2:1",new JSONArray("[2,59720,69880]")));rejects(()->TimedVerseSource.bounds(data,1005,"2:1"));
  System.out.println("PASS: all 6236 unverified verse requests rejected, even injected publisher timing; 114 files uncut at zero; sequential/random/single completion policies retain chapter starts.");
 }
}
