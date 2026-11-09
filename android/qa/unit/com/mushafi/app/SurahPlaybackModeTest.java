package com.mushafi.app;
public class SurahPlaybackModeTest {
 public static void main(String[] args){for(String old:new String[]{null,"single","continuous","","bad"})if(!"continuous".equals(SurahPlaybackMode.normalize(old)))throw new AssertionError(old);if(!"random".equals(SurahPlaybackMode.normalize("random")))throw new AssertionError();System.out.println("PASS old verse-only modes migrate to uninterrupted full recitation; explicit random mode preserved");}
}
