package com.mushafi.app;
import android.app.Activity;import android.os.Bundle;import android.widget.FrameLayout;
/** Debug-only native surface; never packaged in the release. */
public class LaunchHarnessActivity extends Activity {
 public FrameLayout root;
 @Override public void onCreate(Bundle state){super.onCreate(state);root=new FrameLayout(this);root.setBackgroundColor(0xff244a9e);setContentView(root);if(android.os.Build.VERSION.SDK_INT>=27){setTurnScreenOn(true);setShowWhenLocked(true);}getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
}
