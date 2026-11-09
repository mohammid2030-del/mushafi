package com.mushafi.app;
import java.util.Random;
/** Shared policy: sequential Quran order, one selected verse, or uniform random chapter starts without immediate repeat. */
public final class RecitationSequence {
 public static String mode(String value){return "single".equals(value)||"random".equals(value)?value:"continuous";}
 public static boolean atBoundary(String mode,boolean playing,boolean seeking,int position,int end,boolean randomPending){return ("single".equals(mode)||("random".equals(mode)&&randomPending))&&playing&&!seeking&&end>0&&position>=end;}
 public static int[] next(String mode,int chapter,int verse,int[] counts,Random random){
  if(chapter<1||chapter>counts.length||verse<1||verse>counts[chapter-1]||"single".equals(mode))return null;
  if(!"random".equals(mode)){if(verse<counts[chapter-1])return new int[]{chapter,verse+1};return chapter<counts.length?new int[]{chapter+1,1}:null;}
  int available=0;for(int i=0;i<counts.length;i++)if(i!=chapter-1&&counts[i]>0)available++;
  if(available==0)return null;int chosen=random.nextInt(available);
  for(int i=0;i<counts.length;i++)if(i!=chapter-1&&counts[i]>0&&chosen--==0)return new int[]{i+1,1};return null;
 }
}
