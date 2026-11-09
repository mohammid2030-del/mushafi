package com.mushafi.app;
public final class ReaderViewportPolicyTest {
 private static void need(boolean value){if(!value)throw new AssertionError("Viewport policy regression");}
 public static void main(String[] args){
  for(int api:new int[]{23,28,29,30,35,36}){
   need(ReaderViewportPolicy.top(true,32)==0);need(ReaderViewportPolicy.top(false,32)==32);
   need(ReaderViewportPolicy.bottom(true,48,0)==0);need(ReaderViewportPolicy.bottom(true,48,380)==0);
   need(ReaderViewportPolicy.bottom(false,48,0)==48);need(ReaderViewportPolicy.bottom(false,48,380)==380);
   need(ReaderViewportPolicy.cutoutMode(false,api)==0);
   need(ReaderViewportPolicy.cutoutMode(true,api)==(api<28?0:api<30?1:3));
  }
  System.out.println("PASS: reader excludes reserved top/bottom bars, IME never resizes the reader, non-reader safe insets preserved, cutout policy API 23–36.");
 }
}
