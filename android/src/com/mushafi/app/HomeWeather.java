package com.mushafi.app;

import org.json.*;
import java.net.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** Fixed-host weather request. Coordinates rounded to city/neighbourhood resolution. */
final class HomeWeather {
 static JSONObject load(double latitude,double longitude,String key) throws Exception {
  if(Double.isNaN(latitude)||Double.isInfinite(latitude)||Math.abs(latitude)>90||Double.isNaN(longitude)||Double.isInfinite(longitude)||Math.abs(longitude)>180)throw new IllegalArgumentException();
  String lat=String.format(Locale.US,"%.2f",latitude),lon=String.format(Locale.US,"%.2f",longitude);
  HttpURLConnection c=(HttpURLConnection)new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat="+lat+"&lon="+lon).openConnection();
  c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setInstanceFollowRedirects(false);
  c.setRequestProperty("User-Agent","Mushafi/3.0.95 https://mohammid2030-del.github.io/mushafi-support/");
  try {
   if(c.getResponseCode()!=200)throw new IOException("weather unavailable");
   ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>524288)throw new IOException("response too large");}}
   return parse(new JSONObject(out.toString("UTF-8")),key,System.currentTimeMillis());
  } finally {c.disconnect();}
 }
 static JSONObject parse(JSONObject root,String key,long now) throws Exception {
  JSONArray series=root.getJSONObject("properties").getJSONArray("timeseries");
  SimpleDateFormat iso=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US);iso.setTimeZone(TimeZone.getTimeZone("UTC"));
  JSONObject chosen=null;long selected=0;
  for(int i=0;i<series.length();i++){JSONObject item=series.getJSONObject(i);long time=iso.parse(item.getString("time")).getTime();if(time<=now&&time>selected){chosen=item;selected=time;}}
  if(chosen==null||now-selected>7200000L)throw new IOException("outdated forecast");
  JSONObject data=chosen.getJSONObject("data");double t=data.getJSONObject("instant").getJSONObject("details").getDouble("air_temperature");
  if(Double.isNaN(t)||Double.isInfinite(t)||t< -100||t>70)throw new IOException("invalid temperature");
  JSONObject period=data.optJSONObject("next_1_hours");if(period==null)period=data.optJSONObject("next_6_hours");
  String symbol=period==null?"":period.getJSONObject("summary").getString("symbol_code");
  return new JSONObject().put("key",key).put("temperature",t).put("symbol",symbol).put("forecastAt",selected).put("fetchedAt",now);
 }
}
