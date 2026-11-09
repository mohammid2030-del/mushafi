package com.mushafi.app;
import java.util.*;
/** Device civil-time reminders. No reading/audio state and no network. */
public final class DailyReminderPlan {
 public static final String[] KINDS={"dua","morning","evening","night","salawat","fridayDua"};
 public static final class Event{public final String kind,id;public final long at;public Event(String k,long t){kind=k;at=t;id=k+"|"+t;}}
 private static long floorDiv(long x,long y){long q=x/y;return x<0&&x%y!=0?q-1:q;}
 private static long floorMod(long x,long y){long r=x%y;return r<0?r+y:r;}
 public static Calendar day(long now,TimeZone zone,int offset){Calendar c=new GregorianCalendar(zone,Locale.US);c.setTimeInMillis(now);c.add(Calendar.DATE,offset);return c;}
 public static long wall(Calendar c,int hour,int minute){c=(Calendar)c.clone();c.set(Calendar.HOUR_OF_DAY,hour);c.set(Calendar.MINUTE,minute);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);return c.getTimeInMillis();}
 public static long civilDay(Calendar c){Calendar u=new GregorianCalendar(TimeZone.getTimeZone("UTC"),Locale.US);u.clear();u.set(c.get(Calendar.YEAR),c.get(Calendar.MONTH),c.get(Calendar.DAY_OF_MONTH));return floorDiv(u.getTimeInMillis(),86400000L);}
 public static long slot(long now,TimeZone zone){Calendar c=day(now,zone,0);int h=c.get(Calendar.HOUR_OF_DAY);return civilDay(c)*2+(h<8?-1:h<20?0:1);}
 public static int duaIndex(long now,TimeZone zone,int size){return(int)floorMod(slot(now,zone),(long)size);}
 public static int fridayIndex(long now,TimeZone zone,int size){return(int)floorMod(floorDiv(civilDay(day(now,zone,0)),7)*5+3,(long)size);}
 public static String dateKey(long now,TimeZone zone){Calendar c=day(now,zone,0);return String.format(Locale.US,"%04d-%02d-%02d",c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DAY_OF_MONTH));}
 public static boolean fridayWindow(long now,TimeZone zone){Calendar c=day(now,zone,0);return c.get(Calendar.DAY_OF_WEEK)==Calendar.FRIDAY&&now>=wall(c,7,30)&&now<wall(c,12,0);}
 public static boolean showVisit(int count){return count>0&&(count-1)%3==0;}
 public static List<Event> fixed(long now,TimeZone zone){List<Event> list=new ArrayList<>();for(int d=-1;d<=8;d++){Calendar c=day(now,zone,d);list.add(new Event("morning",wall(c,5,0)));list.add(new Event("dua",wall(c,8,0)));list.add(new Event("evening",wall(c,17,0)));list.add(new Event("dua",wall(c,20,0)));list.add(new Event("night",wall(c,22,30)));if(c.get(Calendar.DAY_OF_WEEK)==Calendar.FRIDAY)list.add(new Event("salawat",wall(c,9,0)));}return list;}
}
