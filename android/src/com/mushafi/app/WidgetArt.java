package com.mushafi.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.os.SystemClock;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Android counterparts of the iOS widget set (ios/Widgets/*.swift): same content, same
 * rotation formulas and the same bundled Arabic fonts. Each widget is drawn as one bitmap
 * at the exact widget size; live countdowns use a Chronometer overlaid at the bottom.
 */
final class WidgetArt {
    private WidgetArt() {}

    static final String[] KINDS = {"times", "counter", "adhkar", "dua", "page", "dayname", "moon", "occasions", "calendar"};

    static boolean handles(String kind) {
        for (String k : KINDS) if (k.equals(kind)) return true;
        return false;
    }

    // ---------------------------------------------------------------- themes

    static final class Theme {
        final int top, bottom, ink, muted, accent, chip;
        final boolean clear;

        Theme(int top, int bottom, int ink, int muted, int accent, int chip, boolean clear) {
            this.top = top; this.bottom = bottom; this.ink = ink; this.muted = muted;
            this.accent = accent; this.chip = chip; this.clear = clear;
        }
    }

    static final Theme EMERALD = new Theme(0xFF0F4A3A, 0xFF05231B, 0xFFFFFFFF, 0xA8FFFFFF, 0xFFE4C47F, 0x1AFFFFFF, false);
    static final Theme MIDNIGHT = new Theme(0xFF1C2747, 0xFF080D1C, 0xFFFFFFFF, 0x9EFFFFFF, 0xFFE9CE91, 0x17FFFFFF, false);
    static final Theme SAND = new Theme(0xFFFBF5E8, 0xFFEBDDBF, 0xFF3B2A12, 0x993B2A12, 0xFF9C6A1C, 0x1F9C6A1C, false);
    static final Theme PLUM = new Theme(0xFF4A2140, 0xFF1F0C1B, 0xFFFFFFFF, 0xA3FFFFFF, 0xFFF1CDA2, 0x1AFFFFFF, false);
    static final Theme INK = new Theme(0xFF23211D, 0xFF0E0D0B, 0xFFF5EEDD, 0x99F5EEDD, 0xFFD9B56A, 0x14FFFFFF, false);
    static final Theme CLEAR = new Theme(0, 0, 0xFFFFFFFF, 0xC8FFFFFF, 0xFFF0D9A4, 0x26FFFFFF, true);

    /** "dark" keeps each widget's own palette (as on iOS), "light" is parchment, "clear" is transparent. */
    static Theme theme(String kind, String setting) {
        if ("clear".equals(setting)) return CLEAR;
        if ("light".equals(setting)) return SAND;
        switch (kind) {
            case "times": case "calendar": case "moon": return MIDNIGHT;
            case "counter": return INK;
            case "dua": case "occasions": return PLUM;
            case "dayname": return SAND;
            default: return EMERALD;
        }
    }

    // ---------------------------------------------------------------- fonts

    private static Typeface quran, naskh, ui, uiBold, number, numberBold;

    private static synchronized void fonts(Context c) {
        if (quran != null) return;
        quran = Typeface.createFromAsset(c.getAssets(), "quran.ttf");
        naskh = Typeface.createFromAsset(c.getAssets(), "reading-naskh.ttf");
        ui = Typeface.createFromAsset(c.getAssets(), "ui-arabic.ttf");
        uiBold = Build.VERSION.SDK_INT >= 28 ? Typeface.create(ui, 700, false) : Typeface.create(ui, Typeface.BOLD);
        number = Typeface.create("sans-serif-medium", Typeface.NORMAL);
        numberBold = Typeface.create("sans-serif", Typeface.BOLD);
    }

    // ---------------------------------------------------------------- painter

    /** Draws in dp coordinates; text is laid out with StaticLayout so Arabic and digits order correctly. */
    static final class Painter {
        final Canvas canvas;
        final float w, h;
        final boolean rtl;
        final Theme theme;
        final String lang;

        Painter(Canvas canvas, float w, float h, boolean rtl, Theme theme, String lang) {
            this.canvas = canvas; this.w = w; this.h = h; this.rtl = rtl; this.theme = theme; this.lang = lang;
        }

        static final int START = 0, CENTER = 1, END = 2;

        /** Draws text in the box [x, x+bw] starting at y; shrinks to fit maxH. Returns the drawn height. */
        float text(String s, float x, float y, float bw, float size, int color, Typeface tf, int align, int maxLines, float maxH) {
            if (s == null || s.isEmpty() || bw <= 4) return 0;
            TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
            paint.setColor(color);
            paint.setTypeface(tf);
            if (theme.clear) paint.setShadowLayer(3, 0, 1, 0x66000000);
            Layout.Alignment a = align == CENTER ? Layout.Alignment.ALIGN_CENTER
                    : align == END ? Layout.Alignment.ALIGN_OPPOSITE : Layout.Alignment.ALIGN_NORMAL;
            StaticLayout layout;
            float current = size;
            while (true) {
                paint.setTextSize(current);
                layout = StaticLayout.Builder.obtain(s, 0, s.length(), paint, (int) Math.max(1, bw))
                        .setAlignment(a)
                        .setTextDirection(rtl ? TextDirectionHeuristics.RTL : TextDirectionHeuristics.LTR)
                        .setIncludePad(false)
                        .setLineSpacing(1, 1.12f)
                        .setMaxLines(maxLines)
                        .setEllipsize(TextUtils.TruncateAt.END)
                        .build();
                boolean tooWide = maxLines == 1 && layout.getLineWidth(0) > bw + 0.5f;
                if ((layout.getHeight() <= maxH && !tooWide) || current <= 7) break;
                current -= 0.5f;
            }
            canvas.save();
            canvas.translate(x, y);
            layout.draw(canvas);
            canvas.restore();
            return layout.getHeight();
        }

        float line(String s, float x, float y, float bw, float size, int color, Typeface tf, int align) {
            return text(s, x, y, bw, size, color, tf, align, 1, size * 1.6f);
        }

        /** Left edge of column i of n columns, mirrored in RTL. */
        float column(int i, int n, float x0, float bw) {
            float cw = bw / n;
            return rtl ? x0 + bw - (i + 1) * cw : x0 + i * cw;
        }

        void pill(float x, float y, float bw, float bh, float r, int color) {
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(color);
            canvas.drawRoundRect(new RectF(x, y, x + bw, y + bh), r, r, p);
        }

        void stroke(float x, float y, float bw, float bh, float r, int color, float width) {
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(color);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(width);
            canvas.drawRoundRect(new RectF(x, y, x + bw, y + bh), r, r, p);
        }

        /** Highlight like iOS: solid accent on colored themes, translucent pill on clear. */
        int highlight(float x, float y, float bw, float bh, float r) {
            if (theme.clear) {
                pill(x, y, bw, bh, r, 0x33FFFFFF);
                return theme.ink;
            }
            pill(x, y, bw, bh, r, theme.accent);
            return theme.top;
        }

        void background() {
            if (theme.clear) return;
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setShader(new LinearGradient(0, 0, w, h, theme.top, theme.bottom, Shader.TileMode.CLAMP));
            canvas.drawRoundRect(new RectF(0, 0, w, h), 22, 22, p);
            canvas.save();
            Path clip = new Path();
            clip.addRoundRect(new RectF(0, 0, w, h), 22, 22, Path.Direction.CW);
            canvas.clipPath(clip);
            float size = Math.max(w, h) * 0.9f;
            float cx = rtl ? w * 0.08f : w * 0.92f, cy = h * 0.08f;
            star(cx, cy, size / 2, (theme.accent & 0x00FFFFFF) | 0x24000000);
            star(cx, cy, size / 2 * 0.72f, (theme.accent & 0x00FFFFFF) | 0x14000000);
            canvas.restore();
        }

        /** Eight-pointed star outline (two squares), the same ornament as on iOS. */
        void star(float cx, float cy, float radius, int color) {
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(1);
            p.setColor(color);
            for (double rotation : new double[]{0, Math.PI / 4}) {
                Path path = new Path();
                for (int i = 0; i < 4; i++) {
                    double angle = rotation + Math.PI / 4 + i * Math.PI / 2;
                    float px = cx + (float) Math.cos(angle) * radius, py = cy + (float) Math.sin(angle) * radius;
                    if (i == 0) path.moveTo(px, py); else path.lineTo(px, py);
                }
                path.close();
                canvas.drawPath(path, p);
            }
        }

        /** Header: small accent dot + caption, with optional trailing text. */
        float header(String title, String trailing, float pad) {
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(theme.accent);
            float dx = rtl ? w - pad - 3 : pad + 3;
            canvas.drawCircle(dx, pad + 8, 3, dot);
            float tw = w - pad * 2 - 12;
            line(title, rtl ? pad : pad + 12, pad, trailing == null ? tw : tw * 0.6f, 11.5f, theme.muted, ui, START);
            if (trailing != null) line(trailing, pad, pad, w - pad * 2, 10.5f, theme.muted, ui, END);
            return pad + 20;
        }
    }

    // ---------------------------------------------------------------- shared text helpers

    static String t(Context c, String lang, String arabic, Object... args) {
        return UiLocale.textIn(c, lang, arabic, args);
    }

    static String num(String lang, int value) {
        return java.text.NumberFormat.getIntegerInstance(Locale.forLanguageTag(lang)).format(value);
    }

    static String time(Context c, long value, String lang, TimeZone zone) {
        return MushafiWidget.time(c, value, Locale.forLanguageTag(lang), zone);
    }

    static String gregorian(long now, String lang, String pattern) {
        if (Build.VERSION.SDK_INT >= 24) {
            android.icu.text.SimpleDateFormat f = new android.icu.text.SimpleDateFormat(
                    android.icu.text.DateTimePatternGenerator.getInstance(new android.icu.util.ULocale(lang)).getBestPattern(pattern),
                    new android.icu.util.ULocale(lang));
            return f.format(new java.util.Date(now));
        }
        return MushafiWidget.format(now, pattern, Locale.forLanguageTag(lang), TimeZone.getDefault());
    }

    static String hijriText(long now, String lang, String skeleton) {
        if (Build.VERSION.SDK_INT >= 24) {
            android.icu.util.ULocale locale = new android.icu.util.ULocale(lang + "@calendar=islamic-umalqura");
            String pattern = android.icu.text.DateTimePatternGenerator.getInstance(locale).getBestPattern(skeleton);
            android.icu.text.SimpleDateFormat f = new android.icu.text.SimpleDateFormat(pattern, locale);
            return f.format(new java.util.Date(now));
        }
        return MushafiWidget.date(now, Locale.forLanguageTag(lang), TimeZone.getDefault(), true);
    }

    /** Umm al-Qura calendar (API 24+); null on older systems. */
    static android.icu.util.Calendar hijri(long millis) {
        if (Build.VERSION.SDK_INT < 24) return null;
        android.icu.util.IslamicCalendar cal = new android.icu.util.IslamicCalendar();
        cal.setCalculationType(android.icu.util.IslamicCalendar.CalculationType.ISLAMIC_UMALQURA);
        cal.setTimeInMillis(millis);
        return cal;
    }

    static int hijriDay(long millis) {
        android.icu.util.Calendar cal = hijri(millis);
        return cal == null ? 0 : cal.get(android.icu.util.Calendar.DAY_OF_MONTH);
    }

    /** (year × 366 + day of year) mod count — identical to iOS and the original Android widget. */
    static int dailyIndex(int count, long now) {
        if (count <= 0) return 0;
        Calendar day = Calendar.getInstance();
        day.setTimeInMillis(now);
        return (day.get(Calendar.YEAR) * 366 + day.get(Calendar.DAY_OF_YEAR)) % count;
    }

    /** Changes every `hours` hours; same formula as WidgetText.slotIndex on iOS. */
    static int slotIndex(int count, int hours, long now) {
        if (count <= 0) return 0;
        Calendar day = Calendar.getInstance();
        day.setTimeInMillis(now);
        int hour = day.get(Calendar.HOUR_OF_DAY);
        return (int) (((long) dailyIndex(10_000, now) * (24 / hours) + hour / hours) % count);
    }

    // ---------------------------------------------------------------- content

    private static JSONArray devotions;
    private static JSONObject verses;

    static synchronized List<JSONObject> devotions(Context c, String... groups) throws Exception {
        if (devotions == null) devotions = MushafiWidget.read(c, "widget-devotions.json").getJSONArray("items");
        List<JSONObject> result = new ArrayList<>();
        for (int i = 0; i < devotions.length(); i++) {
            JSONObject item = devotions.getJSONObject(i);
            JSONArray g = item.optJSONArray("groups");
            boolean match = false;
            for (int j = 0; g != null && j < g.length() && !match; j++)
                for (String want : groups) if (want.equals(g.optString(j))) { match = true; break; }
            if (match) result.add(item);
        }
        return result;
    }

    static synchronized JSONObject verses(Context c) throws Exception {
        if (verses == null) verses = MushafiWidget.read(c, "widget-daily-verses.json");
        return verses;
    }

    // ---------------------------------------------------------------- prayers

    static final String[] ROW_KEYS = {"fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"};
    static final String[] ROW_NAMES = {"الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"};
    static final long AFTER_WINDOW = 30 * 60_000L;

    static final class Prayer {
        final String key, name;
        final long at;
        final boolean prayer;

        Prayer(String key, String name, long at) {
            this.key = key; this.name = name; this.at = at; this.prayer = !"sunrise".equals(key);
        }
    }

    static final class Prayers {
        boolean configured;
        String city = "";
        TimeZone zone = TimeZone.getDefault();
        final List<Prayer> today = new ArrayList<>();
        Prayer next, previous, following;

        Prayer sinceAdhan(long now) {
            return previous != null && now - previous.at < AFTER_WINDOW ? previous : null;
        }
    }

    static Prayers prayers(Context c, String lang, long now) {
        Prayers result = new Prayers();
        try {
            PrayerSettings settings = PrayerSettings.load(c);
            if (!settings.json.optBoolean("confirmed")) return result;
            result.zone = TimeZone.getTimeZone(settings.json.optString("timezone", TimeZone.getDefault().getID()));
            result.city = settings.json.optString("city", "");
            JSONArray days = PrayerCalculator.snapshot(settings, now).getJSONArray("days");
            List<List<Prayer>> rows = new ArrayList<>();
            List<Prayer> all = new ArrayList<>();
            for (int d = 0; d < days.length(); d++) {
                JSONObject day = days.getJSONObject(d);
                List<Prayer> list = new ArrayList<>();
                for (int i = 0; i < ROW_KEYS.length; i++)
                    if (day.has(ROW_KEYS[i])) list.add(new Prayer(ROW_KEYS[i], t(c, lang, ROW_NAMES[i]), day.getLong(ROW_KEYS[i])));
                rows.add(list);
                for (Prayer p : list) if (p.prayer) all.add(p);
            }
            for (Prayer p : all) {
                if (p.at > now && result.next == null) result.next = p;
                else if (p.at > now && result.next != null && result.following == null) result.following = p;
                if (p.at <= now) result.previous = p;
            }
            List<Prayer> today = rows.isEmpty() ? new ArrayList<Prayer>() : rows.get(rows.size() - 1);
            for (List<Prayer> list : rows) {
                boolean holds = false;
                for (Prayer p : list) if (p.prayer && p.at > now) { holds = true; break; }
                if (holds) { today = list; break; }
            }
            result.today.addAll(today);
            result.configured = result.next != null;
        } catch (Exception ignored) {
        }
        return result;
    }

    // ---------------------------------------------------------------- entry point

    static final class Output {
        long countdownTo = 0;   // > now: count down
        long countUpFrom = 0;   // > 0: count up since
        String route = null;    // MainActivity widget route
        boolean openPrayer = false;
        String description = "";
        float timerSize = 16;
    }

    static RemoteViews render(Context c, int id, String kind, int width, int height, long now) throws Exception {
        fonts(c);
        SharedPreferences prefs = c.getSharedPreferences("widgets", 0);
        String lang = MushafiWidget.language(c, id);
        boolean rtl = lang.equals("ar") || lang.equals("ur");
        Theme theme = theme(kind, prefs.getString(id + ".theme", "dark"));
        float w = Math.max(110, width), h = Math.max(70, height);
        float scale = Math.min(2f, Math.max(1.5f, c.getResources().getDisplayMetrics().density));
        Bitmap bitmap = Bitmap.createBitmap(Math.round(w * scale), Math.round(h * scale), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(scale, scale);
        Painter p = new Painter(canvas, w, h, rtl, theme, lang);
        p.background();
        Output out = new Output();
        switch (kind) {
            case "times": drawTimes(c, p, now, out); break;
            case "counter": drawCounter(c, p, now, out); break;
            case "adhkar": drawAdhkar(c, p, now, out); break;
            case "dua": drawDua(c, p, now, out); break;
            case "page": drawPage(c, p, out); break;
            case "dayname": drawDayName(c, p, now, out); break;
            case "moon": drawMoon(c, p, now, out); break;
            case "occasions": drawOccasions(c, p, now, out); break;
            default: drawCalendar(c, p, now, out); break;
        }

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.mushafi_widget_canvas);
        v.setImageViewBitmap(R.id.widget_art, bitmap);
        v.setContentDescription(R.id.widget_art, out.description);
        boolean exact = MushafiWidget.exact(c);
        if (out.countUpFrom > 0) {
            v.setViewVisibility(R.id.widget_countdown, View.VISIBLE);
            if (Build.VERSION.SDK_INT >= 24) v.setChronometerCountDown(R.id.widget_countdown, false);
            v.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() - (now - out.countUpFrom), null, true);
        } else if (out.countdownTo > now && Build.VERSION.SDK_INT >= 24 && exact) {
            v.setViewVisibility(R.id.widget_countdown, View.VISIBLE);
            v.setChronometerCountDown(R.id.widget_countdown, true);
            v.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() + out.countdownTo - now, null, true);
        } else {
            v.setViewVisibility(R.id.widget_countdown, View.GONE);
        }
        v.setTextColor(R.id.widget_countdown, theme.ink);
        v.setTextViewTextSize(R.id.widget_countdown, android.util.TypedValue.COMPLEX_UNIT_SP, out.timerSize);

        Intent open = new Intent(c, MainActivity.class).setAction("com.mushafi.app.OPEN_WIDGET." + id)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (out.openPrayer) open.putExtra("openPrayer", true);
        if (out.route != null) open.putExtra("widgetRoute", out.route);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 10000 + id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    static boolean small(Painter p) { return p.w < 220 || p.h < 140; }
    static boolean large(Painter p) { return p.h >= 250 && p.w >= 240; }

    static void notConfigured(Context c, Painter p, Output out) {
        String text = t(c, p.lang, "افتح مصحفي لمراجعة الموقع والمواقيت");
        p.text(text, 14, p.h / 2 - 20, p.w - 28, 13, p.theme.ink, ui, Painter.CENTER, 3, 44);
        out.openPrayer = true;
        out.description = text;
    }

    // ---------------------------------------------------------------- prayer times

    static void drawTimes(Context c, Painter p, long now, Output out) {
        Prayers s = prayers(c, p.lang, now);
        out.openPrayer = true;
        if (!s.configured) { notConfigured(c, p, out); return; }
        float pad = 14;
        StringBuilder desc = new StringBuilder();
        if (small(p) || large(p)) {
            boolean big = large(p);
            float y = p.header(t(c, p.lang, "مواقيت الصلاة"), big ? s.city : null, pad);
            if (big) {
                p.line(hijriText(now, p.lang, "EEEEdMMMMy"), pad, y, p.w - pad * 2, 12, p.theme.ink, ui, Painter.START);
                y += 24;
            }
            float rowH = Math.min(big ? 40 : 22, (p.h - y - pad) / s.today.size());
            for (Prayer prayer : s.today) {
                boolean isNext = prayer == s.next;
                int color = isNext ? p.highlight(pad - 4, y, p.w - pad * 2 + 8, rowH - 2, 8) : p.theme.ink;
                int alpha = !isNext && prayer.at <= now ? 0x8C000000 : 0xFF000000;
                color = (color & 0x00FFFFFF) | alpha;
                float size = big ? 16 : 11.5f;
                float ty = y + (rowH - 2 - size * 1.35f) / 2;
                p.line(prayer.name, pad + 2, ty, p.w - pad * 2 - 4, size, color, isNext ? uiBold : ui, Painter.START);
                p.line(time(c, prayer.at, p.lang, s.zone), pad + 2, ty, p.w - pad * 2 - 4, size, color, isNext ? numberBold : number, Painter.END);
                y += rowH;
                desc.append(prayer.name).append(' ').append(time(c, prayer.at, p.lang, s.zone)).append(". ");
            }
        } else {
            float y = p.header(s.city.isEmpty() ? t(c, p.lang, "مواقيت الصلاة") : s.city,
                    t(c, p.lang, "متبقي على {0}", s.next.name), pad);
            float top = y + 4, cellH = p.h - top - 34;
            int n = s.today.size();
            for (int i = 0; i < n; i++) {
                Prayer prayer = s.today.get(i);
                boolean isNext = prayer == s.next;
                float x = p.column(i, n, pad - 4, p.w - pad * 2 + 8);
                float cw = (p.w - pad * 2 + 8) / n;
                p.pill(x + 2, top, cw - 4, cellH, 12, p.theme.chip);
                int color = isNext ? p.highlight(x + 2, top, cw - 4, cellH, 12) : p.theme.ink;
                p.line(prayer.name, x + 2, top + cellH * 0.22f, cw - 4, 11, color, isNext ? uiBold : ui, Painter.CENTER);
                p.line(shortTime(c, prayer.at, p.lang, s.zone), x + 2, top + cellH * 0.55f, cw - 4, 13, color, numberBold, Painter.CENTER);
                desc.append(prayer.name).append(' ').append(time(c, prayer.at, p.lang, s.zone)).append(". ");
            }
            out.countdownTo = s.next.at;
            out.timerSize = 14;
        }
        out.description = desc.toString();
    }

    static String shortTime(Context c, long at, String lang, TimeZone zone) {
        String pattern = android.text.format.DateFormat.is24HourFormat(c) ? "HH:mm" : "h:mm";
        return MushafiWidget.format(at, pattern, Locale.forLanguageTag(lang), zone);
    }

    // ---------------------------------------------------------------- prayer counter

    static void drawCounter(Context c, Painter p, long now, Output out) {
        Prayers s = prayers(c, p.lang, now);
        out.openPrayer = true;
        if (!s.configured) { notConfigured(c, p, out); return; }
        float pad = 14;
        boolean wide = p.w >= 280;
        float leftW = wide ? p.w * 0.5f : p.w;
        float x = wide && p.rtl ? p.w - leftW : 0;
        Prayer passed = s.sinceAdhan(now);
        int done = p.theme.clear ? 0xFFB9F5CF : 0xFF7FD3A0;
        if (passed != null) {
            p.line("✓ " + t(c, p.lang, "حان وقت الصلاة"), x + pad, pad, leftW - pad * 2, 11.5f, p.theme.muted, ui, Painter.START);
            p.line(passed.name, x + pad, pad + 26, leftW - pad * 2, 26, done, uiBold, Painter.START);
            p.line(t(c, p.lang, "مضى على الأذان"), x + pad, pad + 66, leftW - pad * 2, 11, p.theme.muted, ui, Painter.START);
            out.countUpFrom = passed.at;
            out.description = t(c, p.lang, "أُذّن لصلاة {0}", passed.name);
        } else {
            p.line(t(c, p.lang, "متبقي على الأذان"), x + pad, pad, leftW - pad * 2, 11.5f, p.theme.muted, ui, Painter.START);
            p.line(s.next.name, x + pad, pad + 26, leftW - pad * 2, 26, p.theme.accent, uiBold, Painter.START);
            p.line(time(c, s.next.at, p.lang, s.zone), x + pad, pad + 66, leftW - pad * 2, 12, p.theme.muted, number, Painter.START);
            out.countdownTo = s.next.at;
            out.description = t(c, p.lang, "متبقي على {0}", s.next.name);
        }
        out.timerSize = 22;
        if (wide) {
            float lx = p.rtl ? pad : p.w * 0.5f + 4, lw = p.w * 0.5f - pad - 4;
            float rowH = Math.min(22, (p.h - pad * 2) / s.today.size()), y = pad;
            for (Prayer prayer : s.today) {
                boolean isNext = prayer == s.next;
                int color = isNext ? p.highlight(lx - 4, y, lw + 8, rowH - 2, 7) : p.theme.ink;
                if (!isNext && prayer.at <= now) color = (color & 0x00FFFFFF) | 0x8C000000;
                String name = (prayer.at <= now && !isNext ? "✓ " : "") + prayer.name;
                float ty = y + (rowH - 2 - 15) / 2;
                p.line(name, lx, ty, lw, 11, color, isNext ? uiBold : ui, Painter.START);
                p.line(time(c, prayer.at, p.lang, s.zone), lx, ty, lw, 11, color, number, Painter.END);
                y += rowH;
            }
        }
    }

    // ---------------------------------------------------------------- adhkar for the time of day

    static String period(Prayers s, long now) {
        if (s.configured && s.previous != null) {
            switch (s.previous.key) {
                case "fajr": case "dhuhr": return "morning";
                case "asr": case "maghrib": return "evening";
                default: return "sleep";
            }
        }
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        return hour >= 4 && hour < 15 ? "morning" : hour >= 15 && hour < 20 ? "evening" : "sleep";
    }

    static void drawAdhkar(Context c, Painter p, long now, Output out) throws Exception {
        String period = period(prayers(c, p.lang, now), now);
        String title = t(c, p.lang, period.equals("morning") ? "أذكار الصباح" : period.equals("evening") ? "أذكار المساء" : "أذكار النوم");
        List<JSONObject> items = devotions(c, period);
        out.route = "adhkar-" + period;
        out.description = title;
        float pad = 14;
        String mark = period.equals("morning") ? "☀" : period.equals("evening") ? "☾" : "✦";
        p.line(mark + "  " + title, pad, pad - 2, p.w - pad * 2, 15, p.theme.ink, uiBold, Painter.START);
        if (items.isEmpty()) return;
        if (large(p)) {
            float y = pad + 30, boxH = (p.h - y - pad) / Math.min(4, items.size());
            for (int i = 0; i < Math.min(4, items.size()); i++) {
                JSONObject item = items.get(i);
                p.pill(pad - 4, y, p.w - pad * 2 + 8, boxH - 6, 10, p.theme.chip);
                p.line(item.optString("title"), pad + 4, y + 6, p.w - pad * 2 - 8, 11, p.theme.accent, uiBold, Painter.START);
                int count = item.optInt("count");
                if (count > 1) p.line("× " + num(p.lang, count), pad + 4, y + 6, p.w - pad * 2 - 8, 11, p.theme.accent, number, Painter.END);
                p.text(item.optString("text"), pad + 4, y + 24, p.w - pad * 2 - 8, 14, p.theme.ink, naskh, Painter.START, 2, boxH - 34);
                y += boxH;
            }
            return;
        }
        JSONObject item = items.get(slotIndex(items.size(), 2, now));
        int count = item.optInt("count");
        if (count > 1 && !small(p)) p.line("× " + num(p.lang, count), pad, pad, p.w - pad * 2, 11, p.theme.accent, number, Painter.END);
        float y = pad + 28;
        p.text(item.optString("text"), pad, y, p.w - pad * 2, small(p) ? 15 : 18, p.theme.ink, naskh, Painter.START, 6, p.h - y - pad - 18);
        p.line(t(c, p.lang, "اضغط لقراءة الأذكار كاملة"), pad, p.h - pad - 14, p.w - pad * 2, 10, p.theme.muted, ui, Painter.START);
    }

    // ---------------------------------------------------------------- Quranic duas

    static void drawDua(Context c, Painter p, long now, Output out) throws Exception {
        List<JSONObject> items = devotions(c, "quran");
        out.route = "adhkar-quran";
        float pad = 14;
        float y = p.header(t(c, p.lang, "دعاء من القرآن"), null, pad);
        if (items.isEmpty()) return;
        JSONObject item = items.get(slotIndex(items.size(), 4, now));
        float size = large(p) ? 28 : small(p) ? 18 : 22;
        p.text(item.optString("text"), pad, y + 2, p.w - pad * 2, size, p.theme.ink, quran, Painter.CENTER, 8, p.h - y - pad - 22);
        p.line(item.optString("reference"), pad, p.h - pad - 13, p.w - pad * 2, 9.5f, p.theme.accent, ui, Painter.CENTER);
        out.description = item.optString("text");
    }

    // ---------------------------------------------------------------- Mushaf page

    static void drawPage(Context c, Painter p, Output out) {
        out.route = "reader";
        JSONObject state;
        try { state = new JSONObject(c.getSharedPreferences("widgets", 0).getString("reading", "{}")); }
        catch (Exception e) { state = new JSONObject(); }
        boolean started = state.optBoolean("started");
        int page = Math.max(1, Math.min(604, state.optInt("page", 1)));
        int juz = Math.max(1, state.optInt("juz", 1));
        String surah = state.optString("surah", "الفاتحة");
        float pad = 14;
        float y = p.header(t(c, p.lang, started ? "تابع من حيث وصلت" : "ابدأ رحلتك مع القرآن"), null, pad);
        String name = t(c, p.lang, "سورة {0}", surah);
        p.line(name, pad, y + 4, p.w - pad * 2, small(p) ? 24 : 30, p.theme.accent, quran, Painter.START);
        String detail = t(c, p.lang, "صفحة {0} · الجزء {1}", num(p.lang, page), num(p.lang, juz));
        p.line(detail, pad, y + (small(p) ? 46 : 54), p.w - pad * 2, 12, p.theme.ink, ui, Painter.START);
        float barY = p.h - pad - 26;
        p.pill(pad, barY, p.w - pad * 2, 5, 3, p.theme.chip);
        float fill = (p.w - pad * 2) * page / 604f;
        p.pill(p.rtl ? p.w - pad - fill : pad, barY, fill, 5, 3, p.theme.accent);
        p.line(t(c, p.lang, "{0}٪ من المصحف", num(p.lang, Math.round(page * 100f / 604))), pad, barY + 9, p.w - pad * 2, 10, p.theme.muted, ui, Painter.START);
        out.description = name + ". " + detail;
    }

    // ---------------------------------------------------------------- day name

    static void drawDayName(Context c, Painter p, long now, Output out) {
        String day = MushafiWidget.format(now, "EEEE", new Locale("ar"), TimeZone.getDefault());
        float nameSize = p.w >= 280 ? 56 : 42;
        float top = p.h / 2 - nameSize * 0.95f;
        p.line(day, 10, top, p.w - 20, nameSize, p.theme.accent, quran, Painter.CENTER);
        p.line(hijriText(now, p.lang, "dMMMMy"), 10, top + nameSize * 1.45f, p.w - 20, 12.5f, p.theme.ink, uiBold, Painter.CENTER);
        p.line(gregorian(now, p.lang, "dMMMMy"), 10, top + nameSize * 1.45f + 20, p.w - 20, 11, p.theme.muted, ui, Painter.CENTER);
        out.description = day;
    }

    // ---------------------------------------------------------------- moon phase

    static final double SYNODIC = 29.530588853;

    static double moonFraction(long now) {
        double julian = now / 86_400_000.0 + 2_440_587.5;
        double age = (julian - 2_451_550.1) % SYNODIC;
        if (age < 0) age += SYNODIC;
        return age / SYNODIC;
    }

    static String moonName(Context c, String lang, double f) {
        String n = f < 0.03 || f >= 0.97 ? "محاق" : f < 0.22 ? "هلال" : f < 0.28 ? "التربيع الأول" : f < 0.47 ? "أحدب متزايد"
                : f < 0.53 ? "بدر" : f < 0.72 ? "أحدب متناقص" : f < 0.78 ? "التربيع الأخير" : "هلال متناقص";
        return t(c, lang, n);
    }

    /** Lit part of the moon, northern-hemisphere view — same geometry as MoonLitShape on iOS. */
    static void moon(Canvas canvas, float cx, float cy, float r, double f, int lit, int dark) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(dark);
        canvas.drawCircle(cx, cy, r, paint);
        boolean waxing = f <= 0.5;
        double e = Math.cos(2 * Math.PI * f), side = waxing ? 1 : -1;
        Path path = new Path();
        int steps = 48;
        for (int i = 0; i <= steps; i++) {
            double phi = -Math.PI / 2 + Math.PI * i / steps;
            float x = cx + (float) (side * Math.cos(phi)) * r, y = cy + (float) Math.sin(phi) * r;
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        for (int i = 0; i <= steps; i++) {
            double phi = Math.PI / 2 - Math.PI * i / steps;
            path.lineTo(cx + (float) (side * e * Math.cos(phi)) * r, cy + (float) Math.sin(phi) * r);
        }
        path.close();
        paint.setColor(lit);
        canvas.drawPath(path, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(0.6f);
        paint.setColor((lit & 0x00FFFFFF) | 0x59000000);
        canvas.drawCircle(cx, cy, r, paint);
    }

    static void drawMoon(Context c, Painter p, long now, Output out) {
        double f = moonFraction(now);
        int illumination = (int) Math.round((1 - Math.cos(2 * Math.PI * f)) / 2 * 100);
        String name = moonName(c, p.lang, f);
        String lit = t(c, p.lang, "الإضاءة {0}٪", num(p.lang, illumination));
        float pad = 14;
        if (p.w >= 280) {
            float r = Math.min(48, p.h / 2 - pad);
            float cx = p.rtl ? p.w - pad - r : pad + r;
            moon(p.canvas, cx, p.h / 2, r, f, 0xFFF4E7C3, 0x1FFFFFFF);
            float x = p.rtl ? pad : pad * 2 + r * 2, tw = p.w - r * 2 - pad * 3;
            p.line(name, x, pad, tw, 17, p.theme.accent, uiBold, Painter.START);
            p.line(hijriText(now, p.lang, "EEEEdMMMMy"), x, pad + 26, tw, 11, p.theme.ink, ui, Painter.START);
            p.line(lit, x, pad + 44, tw, 11, p.theme.muted, ui, Painter.START);
            long full = nextPhase(now, 0.5), fresh = nextPhase(now, 0);
            p.line("● " + t(c, p.lang, "البدر"), x, p.h - pad - 38, tw, 11, p.theme.ink, ui, Painter.START);
            p.line(gregorian(full, p.lang, "EEEdMMM"), x, p.h - pad - 38, tw, 11, p.theme.muted, ui, Painter.END);
            p.line("○ " + t(c, p.lang, "المحاق"), x, p.h - pad - 18, tw, 11, p.theme.ink, ui, Painter.START);
            p.line(gregorian(fresh, p.lang, "EEEdMMM"), x, p.h - pad - 18, tw, 11, p.theme.muted, ui, Painter.END);
        } else {
            float r = Math.min(31, p.h * 0.2f);
            moon(p.canvas, p.w / 2, pad + r + 4, r, f, 0xFFF4E7C3, 0x1FFFFFFF);
            float y = pad + r * 2 + 12;
            p.line(name, 8, y, p.w - 16, 14, p.theme.accent, uiBold, Painter.CENTER);
            p.line(hijriText(now, p.lang, "dMMMMy"), 8, y + 22, p.w - 16, 11, p.theme.ink, ui, Painter.CENTER);
            p.line(lit, 8, y + 39, p.w - 16, 10, p.theme.muted, ui, Painter.CENTER);
        }
        out.description = name + ". " + lit;
    }

    static long nextPhase(long now, double target) {
        double delta = target - moonFraction(now);
        if (delta <= 0.01) delta += 1;
        return now + (long) (delta * SYNODIC * 86_400_000L);
    }

    // ---------------------------------------------------------------- Ramadan and occasions

    static final int[][] OCCASION_DATES = {{9, 1}, {10, 1}, {12, 1}, {12, 9}, {12, 10}, {1, 1}, {1, 10}};
    static final String[] OCCASION_NAMES = {"رمضان", "عيد الفطر", "عشر ذي الحجة", "يوم عرفة", "عيد الأضحى", "رأس السنة الهجرية", "يوم عاشوراء"};

    static final class Occasion {
        final String name;
        final long date;
        final int days;

        Occasion(String name, long date, int days) { this.name = name; this.date = date; this.days = days; }
    }

    static long startOfDay(long millis) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(millis);
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    static int daysBetween(long from, long to) {
        return (int) Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000.0);
    }

    static List<Occasion> occasions(Context c, String lang, long now) {
        List<Occasion> result = new ArrayList<>();
        android.icu.util.Calendar today = hijri(now);
        if (today == null) return result;
        int year = today.get(android.icu.util.Calendar.EXTENDED_YEAR);
        for (int i = 0; i < OCCASION_DATES.length; i++) {
            for (int y = year; y <= year + 1; y++) {
                android.icu.util.Calendar cal = hijri(now);
                cal.clear();
                cal.set(android.icu.util.Calendar.EXTENDED_YEAR, y);
                cal.set(android.icu.util.Calendar.MONTH, OCCASION_DATES[i][0] - 1);
                cal.set(android.icu.util.Calendar.DAY_OF_MONTH, OCCASION_DATES[i][1]);
                cal.set(android.icu.util.Calendar.HOUR_OF_DAY, 12);
                long date = startOfDay(cal.getTimeInMillis());
                if (date < startOfDay(now)) continue;
                result.add(new Occasion(t(c, lang, OCCASION_NAMES[i]), date, daysBetween(now, date)));
                break;
            }
        }
        java.util.Collections.sort(result, (a, b) -> a.days - b.days);
        return result;
    }

    static void drawOccasions(Context c, Painter p, long now, Output out) {
        float pad = 14;
        android.icu.util.Calendar today = hijri(now);
        if (today == null) {
            p.line(MushafiWidget.date(now, Locale.forLanguageTag(p.lang), TimeZone.getDefault(), true), pad, p.h / 2 - 10, p.w - pad * 2, 13, p.theme.ink, ui, Painter.CENTER);
            return;
        }
        String title, big, unit, detail;
        if (today.get(android.icu.util.Calendar.MONTH) == 8) {
            int day = today.get(android.icu.util.Calendar.DAY_OF_MONTH);
            int left = Math.max(0, today.getActualMaximum(android.icu.util.Calendar.DAY_OF_MONTH) - day);
            title = t(c, p.lang, "رمضان مبارك");
            big = num(p.lang, day);
            unit = t(c, p.lang, "من رمضان");
            detail = t(c, p.lang, "متبقي {0} يومًا على العيد", num(p.lang, left));
        } else {
            List<Occasion> list = occasions(c, p.lang, now);
            if (list.isEmpty()) return;
            Occasion next = list.get(0);
            title = next.name;
            big = next.days == 0 ? t(c, p.lang, "اليوم") : num(p.lang, next.days);
            unit = next.days == 0 ? "" : t(c, p.lang, "يومًا");
            detail = hijriText(next.date, p.lang, "dMMMMy");
        }
        out.description = title + " " + big + " " + unit;
        if (small(p)) {
            float y = p.header(t(c, p.lang, "المناسبة القادمة"), null, pad);
            p.line(title, pad, y + 2, p.w - pad * 2, 24, p.theme.accent, quran, Painter.START);
            p.line(big + "  " + unit, pad, y + 40, p.w - pad * 2, 30, p.theme.ink, numberBold, Painter.START);
            p.line(detail, pad, p.h - pad - 14, p.w - pad * 2, 10.5f, p.theme.muted, ui, Painter.START);
            return;
        }
        p.line(title, pad, pad - 2, p.w * 0.6f, 22, p.theme.accent, quran, Painter.START);
        p.line(big + " " + unit, pad, pad + 2, p.w - pad * 2, 20, p.theme.ink, numberBold, Painter.END);
        List<Occasion> list = occasions(c, p.lang, now);
        float y = pad + 40;
        int limit = large(p) ? 6 : 2;
        float rowH = large(p) ? 36 : 24;
        for (Occasion o : list) {
            if (o.name.equals(title) || limit == 0) continue;
            limit--;
            String chip = o.days == 0 ? t(c, p.lang, "اليوم") : t(c, p.lang, "{0} يومًا", num(p.lang, o.days));
            p.line(o.name, pad, y, p.w - pad * 2, 13, p.theme.ink, ui, Painter.START);
            p.line(hijriText(o.date, p.lang, "dMMMM") + "   " + chip, pad, y, p.w - pad * 2, 11.5f, p.theme.muted, ui, Painter.END);
            y += rowH;
        }
        p.line(detail, pad, p.h - pad - 13, p.w - pad * 2, 10, p.theme.muted, ui, Painter.START);
    }

    // ---------------------------------------------------------------- Hijri month calendar

    static void drawCalendar(Context c, Painter p, long now, Output out) {
        float pad = 14;
        android.icu.util.Calendar hijri = hijri(now);
        p.line(hijriText(now, p.lang, "MMMMy"), pad, pad - 2, p.w - pad * 2 - 30, 17, p.theme.accent, uiBold, Painter.START);
        p.line(gregorian(now, p.lang, "EEEEdMMMMy"), pad, pad + 22, p.w - pad * 2 - 30, 11, p.theme.muted, ui, Painter.START);
        moon(p.canvas, p.rtl ? pad + 13 : p.w - pad - 13, pad + 14, 13, moonFraction(now), 0xFFF4E7C3, 0x1FFFFFFF);
        out.description = hijriText(now, p.lang, "EEEEdMMMMy");
        if (hijri == null) return;
        int count = hijri.getActualMaximum(android.icu.util.Calendar.DAY_OF_MONTH);
        int today = hijri.get(android.icu.util.Calendar.DAY_OF_MONTH);
        long first = now - (today - 1) * 86_400_000L;
        Calendar g = Calendar.getInstance();
        g.setTimeInMillis(first);
        int lead = (g.get(Calendar.DAY_OF_WEEK) - g.getFirstDayOfWeek() + 7) % 7;
        String[] symbols = new java.text.DateFormatSymbols(Locale.forLanguageTag(p.lang)).getShortWeekdays();
        float gridTop = pad + 44, gridW = p.w - pad * 2 + 8, x0 = pad - 4;
        for (int i = 0; i < 7; i++) {
            int weekday = (g.getFirstDayOfWeek() - 1 + i) % 7 + 1;
            String s = symbols[weekday];
            if (s.length() > 3) s = s.substring(0, p.lang.equals("ar") ? 1 : 2);
            p.line(s, p.column(i, 7, x0, gridW), gridTop, gridW / 7, 10, p.theme.muted, uiBold, Painter.CENTER);
        }
        int rows = (lead + count + 6) / 7;
        float top = gridTop + 18, cellH = (p.h - top - pad + 4) / rows, cw = gridW / 7;
        for (int d = 0; d < count; d++) {
            int slot = lead + d, row = slot / 7, col = slot % 7;
            float x = p.column(col, 7, x0, gridW), y = top + row * cellH;
            boolean isToday = d + 1 == today;
            int color = isToday ? p.highlight(x + 1.5f, y + 1, cw - 3, cellH - 2, 8) : p.theme.ink;
            g.setTimeInMillis(first + d * 86_400_000L);
            p.line(num(p.lang, d + 1), x, y + cellH * 0.12f, cw, Math.min(14, cellH * 0.42f), color, isToday ? numberBold : number, Painter.CENTER);
            p.line(num(p.lang, g.get(Calendar.DAY_OF_MONTH)), x, y + cellH * 0.56f, cw, Math.min(8.5f, cellH * 0.26f), (color & 0x00FFFFFF) | 0x99000000, number, Painter.CENTER);
        }
    }
}
