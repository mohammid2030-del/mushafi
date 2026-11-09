package com.mushafi.app;
public final class UiTextScalePolicyTest {
 public static void main(String[] args){
  check(100,UiTextScalePolicy.percent(1,false));check(200,UiTextScalePolicy.percent(2,false));
  check(130,UiTextScalePolicy.percent(1.3f,false));check(100,UiTextScalePolicy.percent(2,true));
  check(100,UiTextScalePolicy.percent(Float.NaN,false));check(100,UiTextScalePolicy.percent(0,false));
  check(300,UiTextScalePolicy.percent(8,false));System.out.println("PASS system UI font scale and fixed reader isolation");
 }
 private static void check(int expected,int actual){if(expected!=actual)throw new AssertionError(expected+" != "+actual);}
}
