package com.mushafi.app;
import android.content.Context;
import java.util.*;
import java.io.*;
import org.json.JSONObject;
/** Device-local UI language. Never translates Quran or user data. */
public final class UiLocale {
 private static final Set<String> SUPPORTED=new HashSet<>(Arrays.asList("ar","en","ur","bn","tr"));
 private static final Map<String,JSONObject> CACHE=new HashMap<>();
 static String normalize(String code){String value=(code==null?"":code).toLowerCase(Locale.ROOT).split("[-_]",2)[0];return SUPPORTED.contains(value)?value:"en";}
 public static String device(Context c){Locale locale=android.os.Build.VERSION.SDK_INT>=24?c.getResources().getConfiguration().getLocales().get(0):c.getResources().getConfiguration().locale;return normalize(locale.getLanguage());}
 public static boolean rtl(Context c){String lang=language(c);return lang.equals("ar")||lang.equals("ur");}
 public static String language(Context c){String pref=c.getSharedPreferences("ui-language",0).getString("language","system");return "system".equals(pref)?device(c):normalize(pref);}
 public static void save(Context c,String code){if(!"system".equals(code)&&!SUPPORTED.contains(code))return;c.getSharedPreferences("ui-language",0).edit().putString("language",code).commit();MushafiWidget.refresh(c);}
 public static String text(Context c,String source,Object... args){return textIn(c,language(c),source,args);}
 public static String textIn(Context c,String lang,String source,Object... args){String result=source;if(!lang.equals("ar")){try{JSONObject dictionary;synchronized(CACHE){dictionary=CACHE.get(lang);if(dictionary==null){try(InputStream in=c.getAssets().open("locales/"+lang+".json");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)bytes.write(b,0,n);dictionary=new JSONObject(bytes.toString("UTF-8"));CACHE.put(lang,dictionary);}}}result=dictionary.optString(source,source);}catch(Exception ignored){}}for(int i=0;i<args.length;i++)result=result.replace("{"+i+"}",String.valueOf(args[i]));return result;}
 public static String number(Context c,int n){return java.text.NumberFormat.getIntegerInstance(Locale.forLanguageTag(language(c))).format(n);}
 private UiLocale(){}
}
