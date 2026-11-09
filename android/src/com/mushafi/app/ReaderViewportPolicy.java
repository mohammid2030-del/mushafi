package com.mushafi.app;
/** The reader paints edge to edge; search IME is handled by the picker overlay, never by resizing the page. */
final class ReaderViewportPolicy {
 static int top(boolean reading,int barsAndCutout){return reading?0:barsAndCutout;}
 static int bottom(boolean reading,int bars,int ime){return reading?0:Math.max(bars,ime);}
 static int cutoutMode(boolean reading,int api){return api<28?0:reading?(api>=30?3:1):0;}
}
