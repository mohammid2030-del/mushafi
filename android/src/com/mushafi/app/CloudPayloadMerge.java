package com.mushafi.app;
import org.json.*;
import java.util.*;

/** Three-way merge of actual edits, never a maximum-page merge. A committed local edit
 * wins a simultaneous edit of the same field; untouched fields keep the server value. */
final class CloudPayloadMerge {
 static final String EMPTY="{\"format\":\"mushafi-backup\",\"version\":1,\"data\":{}}";
 static boolean same(Object a,Object b){return canonical(a).equals(canonical(b));}
 static String canonical(Object o){if(o==null)return "<missing>";if(o instanceof JSONObject){JSONObject j=(JSONObject)o;List<String> keys=new ArrayList<>();Iterator<String> it=j.keys();while(it.hasNext())keys.add(it.next());Collections.sort(keys);StringBuilder b=new StringBuilder("{");for(String k:keys)b.append(JSONObject.quote(k)).append(':').append(canonical(j.opt(k))).append(',');return b.append('}').toString();}if(o instanceof JSONArray){StringBuilder b=new StringBuilder("[");JSONArray j=(JSONArray)o;for(int i=0;i<j.length();i++)b.append(canonical(j.opt(i))).append(',');return b.append(']').toString();}return o.getClass().getName()+":"+o.toString();}
 static Object decode(Object o){if(!(o instanceof String))return o;try{return new JSONTokener((String)o).nextValue();}catch(Exception e){return o;}}
 static Set<String> keys(JSONObject... objects){Set<String> result=new TreeSet<>();for(JSONObject o:objects)if(o!=null){Iterator<String> it=o.keys();while(it.hasNext())result.add(it.next());}return result;}
 static Object mergeValue(Object base,Object local,Object remote,String path)throws JSONException{
  if(same(local,base))return remote;if(same(remote,base)||same(local,remote))return local;
  if(local instanceof JSONObject&&remote instanceof JSONObject){JSONObject l=(JSONObject)local,r=(JSONObject)remote,b=base instanceof JSONObject?(JSONObject)base:new JSONObject();
   if(path.equals("khatmaPlan")&&!same(l.opt("id"),r.opt("id")))return local;
   JSONObject out=new JSONObject();boolean progress=path.equals("khatmaPlan")&&(!same(l.opt("position"),b.opt("position"))||!same(l.opt("progressPage"),b.opt("progressPage"))||!same(l.opt("wardIndex"),b.opt("wardIndex"))||!same(l.opt("read"),b.opt("read")));
   for(String k:keys(b,l,r)){boolean linked=progress&&Arrays.asList("position","progressPage","wardIndex","read").contains(k);Object v=linked?l.opt(k):mergeValue(b.opt(k),l.opt(k),r.opt(k),path+"/"+k);if(v!=null)out.put(k,v);}return out;
  }
  // These arrays are sets: preserve additions on either device and explicit removals.
  if(local instanceof JSONArray&&remote instanceof JSONArray&&(path.equals("bookmarks")||path.equals("duaFavorites")||path.startsWith("wardData/"))){JSONArray l=(JSONArray)local,r=(JSONArray)remote,b=base instanceof JSONArray?(JSONArray)base:new JSONArray(),out=new JSONArray();Map<String,Object> vals=new TreeMap<>();Set<String> bs=new HashSet<>(),ls=new HashSet<>(),rs=new HashSet<>();JSONArray[] arrays={b,l,r};List<Set<String>> sets=Arrays.asList(bs,ls,rs);for(int n=0;n<3;n++)for(int i=0;i<arrays[n].length();i++){Object v=arrays[n].opt(i);String k=canonical(v);sets.get(n).add(k);vals.put(k,v);}for(String k:vals.keySet())if(ls.contains(k)!=bs.contains(k)?ls.contains(k):rs.contains(k))out.put(vals.get(k));return out;}
  return local; // Includes deletion (missing local key), not a union/max of scalar progress.
 }
 static String merge(String baseline,String local,String remote)throws JSONException{
  JSONObject b=new JSONObject(baseline==null||baseline.isEmpty()?EMPTY:baseline).getJSONObject("data"),l=new JSONObject(local).getJSONObject("data"),r=new JSONObject(remote==null||remote.isEmpty()?EMPTY:remote).getJSONObject("data"),out=new JSONObject();
  boolean reading=!same(l.opt("lastPage"),b.opt("lastPage"))||!same(l.opt("last"),b.opt("last"));
  for(String k:keys(b,l,r)){Object v=reading&&(k.equals("last")||k.equals("lastPage"))?l.opt(k):mergeValue(decode(b.opt(k)),decode(l.opt(k)),decode(r.opt(k)),k);if(v!=null)out.put(k,v instanceof String?v:v.toString());}
  return new JSONObject().put("format","mushafi-backup").put("version",1).put("data",out).toString();
 }

 static boolean applied(String remote,String op){try{int at=op.lastIndexOf(':');if(at<1)return false;JSONObject seen=new JSONObject(remote).optJSONObject("syncSeen");return seen!=null&&seen.optLong(op.substring(0,at),0)>=Long.parseLong(op.substring(at+1));}catch(Exception ignored){return false;}}
 static String record(String merged,String remote,String op)throws JSONException{JSONObject seen=null;try{seen=new JSONObject(remote).optJSONObject("syncSeen");}catch(Exception ignored){}if(seen==null)seen=new JSONObject();int at=op.lastIndexOf(':');if(at>0)try{String device=op.substring(0,at);seen.put(device,Math.max(seen.optLong(device,0),Long.parseLong(op.substring(at+1))));}catch(NumberFormatException ignored){}return new JSONObject(merged).put("syncSeen",seen).toString();}
 static String nextOperation(android.content.SharedPreferences prefs){long next=prefs.getLong("operationCounter",0)+1;prefs.edit().putLong("operationCounter",next).commit();return prefs.getString("device","background")+":"+next;}
}
