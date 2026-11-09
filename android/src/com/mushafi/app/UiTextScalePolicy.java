package com.mushafi.app;
/** System font scaling for UI. Fixed page readers provide their own fit/size controls. */
final class UiTextScalePolicy {
 static int percent(float scale, boolean fixedPageReader) {
  if(fixedPageReader || Float.isNaN(scale) || Float.isInfinite(scale) || scale<=0) return 100;
  return Math.max(50, Math.min(300, Math.round(scale*100)));
 }
}
