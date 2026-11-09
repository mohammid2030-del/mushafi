package com.mushafi.app;
/** Normalize publisher-file offsets while keeping transport and displayed verse clocks consistent. */
public final class SurahClock {
 public static int logical(int raw,int offset){return Math.max(0,raw-Math.max(0,offset));}
 public static int raw(int position,int offset){return(int)Math.min(Integer.MAX_VALUE,(long)Math.max(0,position)+Math.max(0,offset));}
 public static int duration(int rawDuration,int offset,int end){int available=logical(rawDuration,offset);return end>0?Math.min(available,end):available;}
}
