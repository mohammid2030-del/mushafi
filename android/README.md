# مصحفي — مشروع أندرويد 3.1.31

افتح هذا المجلد في Android Studio.

المتطلبات: JDK 21، Android SDK 36 وBuild Tools 36.0.0. نسخة Gradle Wrapper: 8.11.1.

لبناء نسخة تطوير:

```sh
./gradlew assembleDebug
```

في Windows استخدم `gradlew.bat assembleDebug`. توجد النتيجة داخل `gradle-build/outputs/apk/debug/`.

لتوقيع إصدار نشر: انسخ `signing/upload.properties.example` إلى `signing/upload.properties` واضبط مسار مفتاحك وكلمات المرور، ثم شغّل `./gradlew assembleRelease`. لبناء تحديث يتوافق مع التطبيق المثبّت يجب استخدام مفتاح التوقيع الأصلي، وهو غير مضمن في هذه الحزمة.

ملف `local.properties` غير مضمن لأنه خاص بمسار SDK على جهازك؛ ينشئه Android Studio. بيانات Firebase العامة الخاصة بتطبيق العميل محفوظة؛ ملف حساب الخدمة الخاص ومفاتيح التوقيع مستبعدة.

توجد خدمة التحدي في `services/challenge/`، والاختبارات في `qa/`، ومصادر البيانات وتحقق التوقيت في `docs/sources/`. بعض أدوات الفحص التاريخية تشير إلى مسارات بيئة التطوير؛ اختبارات المتصفح الصوتية تحتاج تنزيل عيناتها كما هو موضح في `qa/audio/README.md`.
