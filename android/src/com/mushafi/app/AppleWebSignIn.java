package com.mushafi.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Sign in with Apple inside the app (no browser hand-off). Apple's sign-in page opens in an
 * in-app window; when Apple redirects to the registered return URL, the identity token is read
 * from the URL fragment and handed to Firebase. No scopes are requested, which lets Apple return
 * the token in the fragment (form_post would require leaving the WebView).
 */
final class AppleWebSignIn {
    interface Callback {
        void onToken(String idToken, String rawNonce);
        void onCancel();
        void onError(String code);
    }

    private static final String SERVICES_ID = "com.mohammedasif.mushafi.signin";

    private AppleWebSignIn() {}

    static String returnUrl(Activity activity) {
        int id = activity.getResources().getIdentifier("project_id", "string", activity.getPackageName());
        String project = id == 0 ? "mushafiapp-1b3d7" : activity.getString(id);
        return "https://" + project + ".firebaseapp.com/__/auth/handler";
    }

    static String random(int length) {
        String charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._";
        SecureRandom random = new SecureRandom();
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < length; i++) out.append(charset.charAt(random.nextInt(charset.length())));
        return out.toString();
    }

    static String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return value;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    static void start(Activity activity, Callback callback) {
        final String rawNonce = random(32), state = random(24), redirect = returnUrl(activity);
        String url = Uri.parse("https://appleid.apple.com/auth/authorize").buildUpon()
                .appendQueryParameter("client_id", SERVICES_ID)
                .appendQueryParameter("redirect_uri", redirect)
                .appendQueryParameter("response_type", "code id_token")
                .appendQueryParameter("response_mode", "fragment")
                .appendQueryParameter("nonce", sha256(rawNonce))
                .appendQueryParameter("state", state)
                .appendQueryParameter("locale", UiLocale.language(activity).equals("ar") ? "ar_SA" : "en_US")
                .build().toString();

        final Dialog dialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        final boolean[] finished = {false};
        final float density = activity.getResources().getDisplayMetrics().density;

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setLayoutDirection(UiLocale.rtl(activity) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        root.setFitsSystemWindows(true);

        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Math.round(8 * density), 0, Math.round(16 * density), 0);
        TextView close = new TextView(activity);
        close.setText("✕");
        close.setTextSize(20);
        close.setTextColor(Color.BLACK);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription(UiLocale.text(activity, "إغلاق"));
        bar.addView(close, new LinearLayout.LayoutParams(Math.round(48 * density), Math.round(52 * density)));
        TextView title = new TextView(activity);
        title.setText(UiLocale.text(activity, "تسجيل الدخول باستخدام Apple"));
        title.setTextSize(16);
        title.setTextColor(Color.BLACK);
        try { title.setTypeface(Typeface.createFromAsset(activity.getAssets(), "ui-arabic.ttf"), Typeface.BOLD); } catch (Exception ignored) {}
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(52 * density)));

        FrameLayout frame = new FrameLayout(activity);
        final WebView web = new WebView(activity);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        final ProgressBar progress = new ProgressBar(activity);
        frame.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        FrameLayout.LayoutParams center = new FrameLayout.LayoutParams(Math.round(40 * density), Math.round(40 * density), Gravity.CENTER);
        frame.addView(progress, center);
        root.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        web.setWebViewClient(new WebViewClient() {
            boolean handle(String target) {
                if (target == null || !target.startsWith(redirect)) return false;
                if (finished[0]) return true;
                finished[0] = true;
                web.stopLoading();
                Uri parsed = Uri.parse(target);
                String fragment = parsed.getEncodedFragment();
                Uri values = Uri.parse("https://x/?" + (fragment == null ? "" : fragment) + (parsed.getEncodedQuery() == null ? "" : "&" + parsed.getEncodedQuery()));
                String token = values.getQueryParameter("id_token"), returned = values.getQueryParameter("state"), error = values.getQueryParameter("error");
                dialog.dismiss();
                if ("user_cancelled_authorize".equals(error)) callback.onCancel();
                else if (error != null) callback.onError(error);
                else if (token == null || !state.equals(returned)) callback.onError("invalid_response");
                else callback.onToken(token, rawNonce);
                return true;
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handle(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView view, String target) {
                return handle(target);
            }

            @Override public void onPageStarted(WebView view, String target, Bitmap favicon) {
                if (!handle(target)) progress.setVisibility(View.VISIBLE);
            }

            @Override public void onPageFinished(WebView view, String target) {
                progress.setVisibility(View.GONE);
            }
        });

        close.setOnClickListener(v -> dialog.cancel());
        dialog.setOnCancelListener(d -> {
            if (!finished[0]) { finished[0] = true; callback.onCancel(); }
        });
        dialog.setOnDismissListener(d -> web.destroy());
        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            if (Build.VERSION.SDK_INT >= 21) window.setStatusBarColor(Color.WHITE);
        }
        dialog.show();
        web.loadUrl(url);
    }
}
