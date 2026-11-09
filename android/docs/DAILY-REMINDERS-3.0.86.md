# Rotating supplications and personal reminders — 3.0.86

Home's old heading is removed. The card rotates through 22 distinct Quran/Sunnah supplications at device-local 08:00 and 20:00; no duplicate within the 22-slot cycle. A tap opens the specific dua and its citation in a themed sheet, not the Azkar reader. Both native notification and WebView selection use the same bundled JSON pool and civil-day arithmetic. Scripture text and existing Quran resources are unchanged.

Independent native one-shot reminders: daily 05:00 morning, 17:00 evening, 22:30 daily remembrance/Al-Mulk, and 08:00/20:00 dua; Friday 09:00 full Quran 33:56 and 15 minutes before selected-location Maghrib a varied dua. Friday-before-Maghrib reuses PrayerCalculator/source/cache/user offsets. Weekly dua index rotates across the pool. Fixed reminders follow device time, while Maghrib follows selected prayer location. Personal times do not define religiously prescribed windows.

DailyReminderReceiver handles alarm delivery, boot, package replacement, time/timezone and exact-alarm grant changes. PrayerScheduler also refreshes these independent alarms even if prayer notifications are disabled. One pending alarm, stable event IDs, bounded sent-ID retention and fresh-event validation suppress duplicates and stale/changed-location events. At most two minutes of scheduled catch-up on foreground rescheduling. Missing exact permission falls back to Android's inexact idle scheduling; missing notification/channel permission prevents notification posting. Existing prayer/audio flags and files are unchanged.

More → daily reminders exposes seven device-local toggles and permission readiness. Disabling a type cancels its existing notice. Native intent consumption opens the specific posted dua, salawat verse, morning/evening remembrance, or a nighttime menu; page position changes only after explicit reading actions.

Friday in-app guide is allowed only Friday 07:30 inclusive to 12:00 exclusive. Native MainActivity.onStart counts qualifying foreground entries (not tab/Home redraws); first/fourth/seventh/tenth visits are eligible. Shown-visit token prevents repeat display on reload. UI waits for setup/tour or another sheet, and closes the guide at noon and on visibility/time recheck. Browser fallback mirrors visit behavior for QA.

Verified content references (checked 2026-10-30):
- Bath/cleanliness/siwak/perfume for men, early attendance and sermon etiquette: Sahih Al-Bukhari 880/881/883, https://sunnah.com/bukhari:883 .
- Blessing the Prophet and tenfold reward: Sahih Muslim 408, https://sunnah.com/muslim:408 .
- Al-Kahf may be read throughout Friday; no disputed specific reward is asserted: https://binbaz.org.sa/fatwas/9398/تحديد-قراءة-سورة-الكهف-يوم-الجمعة .
- Nail trimming is fitrah, not Friday-specific; forty-night maximum: Muslim 258 and https://saadalkhathlan.com/fatwas/5147 .
- Hope for answered prayer after Asr; 15-minute alert is a chosen reminder, not a religious definition: https://binbaz.org.sa/fatwas/5153/وقت-تحري-ساعة-الاجابة-من-يوم-الجمعة .
- New general supplications: Muslim 2697b (including wa 'afini), 2739, 2720, 2716a. Actual references were checked; 2724/2725a were not reused from unverified recollection. Remaining pool entries reuse already cited app content. Quran 33:56 is copied verbatim from bundled chapters.

Validation: pure JVM test in Thai default locale covers four timezones, Friday window, entries 1/4/7/10, all fixed times, 22 half-day items, DST uniqueness. Browser test covers old-label removal, no Azkar redirect, exact half-day boundary, Friday count/noon expiry, specific-notification deep link, seven opt-outs, AR/EN light/dark and three viewport sizes, unchanged reading anchor and charity/audio adjacency. Existing charity and welcome suites passed. Screenshots visually inspected. Seven Android release gates, signed APK/AAB asset and DEX parity checked. No physical-device overnight alarm delivery claim; Android permissions/Doze/OEM restrictions still apply.
