package com.mushafi.app;
/** Full recitation always completes the current chapter; ayah practice is independent. */
final class SurahPlaybackMode {
 static String normalize(String mode){return "random".equals(mode)?"random":"continuous";}
}
