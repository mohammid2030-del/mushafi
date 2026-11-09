# مصحفي على iPhone وiPad — دليل الرفع خطوة بخطوة (بدون ماك)

كل الخطوات تقدر تسويها من **ويندوز** ومن المتصفح. رتّبها بنفس الترتيب، لأن كل خطوة تحتاج اللي قبلها.

| # | المكان | الوقت التقريبي |
|---|---|---|
| 1 | Apple Developer | ١٠ دقائق |
| 2 | Firebase | ١٠ دقائق |
| 3 | App Store Connect | ١٠ دقائق |
| 4 | GitHub | ٢٠ دقيقة + ٣٠ دقيقة بناء |
| 5 | TestFlight على جوالك | ٥ دقائق |

اجمع هذي القيم في ملف ملاحظات وأنت تمشي على الخطوات:
`Team ID` و`Apple Sign-In Key ID` و`ASC Key ID` و`ASC Issuer ID`.

---

## 1) Apple Developer — [developer.apple.com/account](https://developer.apple.com/account)

### 1.1 رقم الفريق (Team ID)
افتح **Membership details** وانسخ **Team ID**. هو 10 خانات، مثل `AB12CD34EF`.

### 1.2 مجموعة التطبيق (App Group)
عشان الويدجت يقرأ مواقيت الصلاة من التطبيق.
1. افتح **Certificates, IDs & Profiles** ثم **Identifiers** ثم زر **+**.
2. اختر **App Groups** ثم Continue.
3. اكتب في Description: `Mushafi`، وفي Identifier: `group.com.mushafi.app`.
4. اضغط Continue ثم Register.

### 1.3 معرّف التطبيق
1. افتح **Identifiers** ثم **+** ثم **App IDs** ثم **App** ثم Continue.
2. اكتب في Description: `Mushafi`.
3. اختر Bundle ID من نوع **Explicit**، واكتب: `com.mohammedasif.mushafi`.
4. فعّل هذي القدرات تحت **Capabilities**:
   - ✅ **App Groups**: اضغط Configure واختر `group.com.mushafi.app`.
   - ✅ **Sign In with Apple**.
   - ✅ **Time Sensitive Notifications**. هذي تخلّي إشعار الأذان يوصل حتى في وضع التركيز.
5. اضغط Continue ثم Register.

> ملاحظة: `com.mushafi.app` كان محجوزاً عند مطوّر آخر في أبل، فاستخدمنا `com.mohammedasif.mushafi` لنسخة iOS. أندرويد يبقى `com.mushafi.app`.

### 1.4 معرّف الويدجت
1. افتح **Identifiers** ثم **+** ثم **App IDs** ثم **App**.
2. اكتب في Description: `Mushafi Widgets`، وفي Bundle ID: `com.mohammedasif.mushafi.widgets`.
3. فعّل ✅ **App Groups**، واضغط Configure واختر `group.com.mushafi.app`.
4. اضغط Register.

### 1.5 مفتاح "تسجيل الدخول بأبل" (يحتاجه Firebase)
1. افتح **Keys** ثم **+**.
2. الاسم: `Mushafi Sign in with Apple`.
3. فعّل ✅ **Sign in with Apple**، ثم اضغط Configure واختر Primary App ID: `com.mohammedasif.mushafi`، ثم Save.
4. اضغط Continue ثم Register ثم **Download**. **الملف يتنزّل مرة وحدة بس**، فاحفظه.
5. سجّل الـ **Key ID** الظاهر.

---

## 2) Firebase — [console.firebase.google.com](https://console.firebase.google.com)

افتح **نفس مشروع Firebase** اللي يستخدمه تطبيق أندرويد، عشان حساب المستخدم يكون واحد على النظامين.

### 2.1 أضف تطبيق iOS
1. افتح ⚙️ **Project settings** ثم **Your apps** ثم **Add app** ثم أيقونة **iOS**.
2. Apple bundle ID: `com.mohammedasif.mushafi`، وApp nickname: `مصحفي iOS`.
3. اضغط **Register app** ثم **Download GoogleService-Info.plist**. ستحتاج هذا الملف في الخطوة 4.3.
4. باقي الخطوات اللي يعرضها Firebase (إضافة الـ SDK والكود) **تخطّاها**، لأنها موجودة في المشروع.

### 2.2 فعّل الدخول بأبل
1. افتح **Authentication** ثم **Sign-in method** ثم **Add new provider** ثم **Apple** ثم Enable.
2. تحت **OAuth code flow configuration** عبّئ:
   - **Apple team ID**: من الخطوة 1.1.
   - **Key ID**: من الخطوة 1.5.
   - **Private key**: افتح ملف `.p8` من الخطوة 1.5 بالمفكرة وانسخ محتواه كاملاً.
3. اترك **Services ID** فاضياً، لأنه للويب فقط. ثم اضغط **Save**.

> هذي الإعدادات لازمة عشان "حذف الحساب" يلغي ربط Apple، وأبل تشترط هذا.

### 2.3 تأكد من قوقل
تحت **Sign-in method** لازم يكون **Google** مفعّلاً، وهو مفعّل أصلاً لتطبيق أندرويد. قواعد Firestore ما تحتاج أي تغيير.

---

## 3) App Store Connect — [appstoreconnect.apple.com](https://appstoreconnect.apple.com)

### 3.1 أنشئ التطبيق
1. افتح **Apps** ثم **+** ثم **New App**.
2. عبّئ الحقول:
   - Platforms: ✅ iOS.
   - Name: `مصحفي`. إذا كان محجوزاً جرّب `مصحفي - Mushafi`.
   - Primary Language: **Arabic**.
   - Bundle ID: `com.mohammedasif.mushafi`.
   - SKU: `mushafi-ios`.
   - User Access: Full Access.
3. اضغط **Create**.

### 3.2 مفتاح API للبناء من GitHub
1. افتح **Users and Access** ثم **Integrations** ثم **App Store Connect API**. أول مرة يطلب منك Request Access، فوافق عليه.
2. افتح **Team Keys** ثم **+**.
3. الاسم: `GitHub CI`، والصلاحية: **Admin**. لازم تكون Admin عشان أبل تنشئ شهادات التوقيع تلقائياً بدون ماك.
4. اضغط **Generate**.
5. اضغط **Download API Key** ونزّل `AuthKey_XXXXXXXXXX.p8`. **يتنزّل مرة وحدة بس.**
6. سجّل **Key ID** من الجدول، و**Issuer ID** من أعلى الصفحة.

---

## 4) GitHub — [github.com](https://github.com)

### 4.1 أنشئ المستودع
1. افتح [github.com/new](https://github.com/new).
2. Repository name: `mushafi`، واختر **Private**.
3. **لا تختر** أي ملفات افتراضية (لا README ولا .gitignore).
4. اضغط **Create repository**.

### 4.2 ارفع المشروع (من ويندوز)
1. نزّل وثبّت **GitHub Desktop** من [desktop.github.com](https://desktop.github.com) وسجّل دخولك.
2. افتح **File** ثم **Clone repository** ثم اختر `mushafi`، وحدد مجلداً على جهازك، ثم **Clone**.
3. فك ضغط ملف المشروع اللي أرسلته لك، وانسخ **كل محتواه** داخل المجلد. لازم يصير فيه:
   `android/`، `ios/`، `website/`، `.github/`، `.gitignore`، `README-ابدأ-هنا.md`…
   > انتبه: مجلد `.github` يبدأ بنقطة، فتأكد إنه انتسخ.
4. ارجع لـ GitHub Desktop، واكتب في Summary: `Mushafi 3.1.31 + iOS`، ثم **Commit to main** ثم **Push origin**.

### 4.3 أضف ملف Firebase
1. انسخ `GoogleService-Info.plist` (من الخطوة 2.1) إلى المسار:
   `ios/Mushafi/Resources/GoogleService-Info.plist`
2. في GitHub Desktop: اكتب `Add Firebase iOS config`، ثم **Commit** ثم **Push**.

### 4.4 أضف الأسرار الأربعة
افتح المستودع على github.com، ثم **Settings** ثم **Secrets and variables** ثم **Actions** ثم **New repository secret**:

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | Team ID (الخطوة 1.1) |
| `ASC_KEY_ID` | Key ID (الخطوة 3.2) |
| `ASC_ISSUER_ID` | Issuer ID (الخطوة 3.2) |
| `ASC_KEY_P8_BASE64` | محتوى ملف `AuthKey_…p8` بصيغة base64، وطريقته تحت |

لتحويل المفتاح، افتح **PowerShell** والصق هذا الأمر بعد ما تعدّل المسار:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\you\Downloads\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```
النص ينحفظ في الحافظة مباشرة، فالصقه كقيمة للسر.

> ⚠️ لا تخلط بين الملفين: `.p8` حق **App Store Connect** (الخطوة 3.2) يروح لـ GitHub، و`.p8` حق **Sign in with Apple** (الخطوة 1.5) يروح لـ Firebase.

### 4.5 ابنِ وارفع لـ TestFlight
1. افتح **Actions**. أول مرة يطلب منك تفعيل الـ workflows، فوافق.
2. اختر **iOS** ثم **Run workflow**، واختر action: **testflight**، ثم **Run workflow**.
3. انتظر العلامة الخضراء ✅. أول مرة تاخذ تقريباً 30–40 دقيقة، وبعدها أسرع.
4. بعد ما ينجح، أبل تعالج النسخة 10–30 دقيقة قبل ما تظهر في TestFlight.

**إذا فشل البناء ❌:** افتح التشغيل، ثم الخطوة الحمراء، وانسخ سطور `error:`. أو نزّل **ios-release-logs** من أسفل الصفحة، وأرسلها لي وأصلحها.

> 💡 **دقائق الماك محدودة:** في المستودع الخاص على الخطة المجانية تحصل 2000 دقيقة شهرياً، لكن دقيقة الماك تُحسب بـ10 دقائق، يعني فعلياً تقريباً 200 دقيقة ماك. كل رفع ياخذ تقريباً 25–40 دقيقة. وعشان كذا البناء ما يشتغل تلقائياً مع كل تعديل، بس لما تطلبه أنت أو لما تنشئ tag. إذا خلصت الدقائق: تقدر تضيف وسيلة دفع وحد إنفاق في **Settings → Billing**، أو تخلي المستودع عاماً (مجاني بلا حدود، لكن الكود يصير مكشوفاً).

---

## 5) TestFlight على الآيفون والآيباد
1. في App Store Connect افتح **مصحفي** ثم **TestFlight** ثم **Internal Testing** ثم **+**.
2. سمّ المجموعة مثلاً `أنا`، وأضف بريدك، وفعّل **Automatic distribution**.
3. على جوالك نزّل تطبيق **TestFlight** من App Store، وافتح الدعوة اللي توصلك على بريدك، ثم **Install**.
4. أي نسخة جديدة توصلك تلقائياً بعد كل رفع.

> الاختبار الداخلي ما يحتاج مراجعة من أبل.

---

## 6) بعدها: كيف تنزّل تحديثاً للنظامين مع بعض
1. عدّل الواجهة في `android/assets/`. هي **نفسها** على الآيفون والأندرويد.
2. ارفع رقم الإصدار **في مكان واحد فقط**: `versionName` و`versionCode` في `android/build.gradle`. نسخة الآيفون تاخذهم تلقائياً.
3. اعمل Commit ثم Push.
4. أنشئ tag بالرقم الجديد: في GitHub Desktop افتح **History**، واضغط بالزر الأيمن على آخر commit، ثم **Create Tag**، واكتب `v3.1.32`، ثم **Push**. الـ tag يرفع نسخة iOS لـ TestFlight تلقائياً.
5. ابنِ نسخة أندرويد من نفس الـ commit.

---

## ما يحتويه تطبيق iOS الآن

- **الواجهة كاملة** بنفس التصميم واللغات الخمس، وتشتغل على iPhone وiPad وأي مقاس شاشة.
- **تنبيهات الصلاة:**
  - الأذان والتذكير قبل الإقامة والإقامة، بنفس قواعد أندرويد، وبأصوات المؤذنين الأربعة (كل مقطع أقل من 30 ثانية، فيُسمع كاملاً).
  - المواقيت تُحسب بنفس مكتبة Adhan ونفس مصدر AlAdhan الرسمي ونفس الإعدادات.
  - التنبيهات تُجدول 4 أيام قدام، وتتجدد كل ما تفتح التطبيق وفي التحديث بالخلفية.
- **مشغّل السور الأصلي:** شاشة القفل ومركز التحكم وسماعات البلوتوث (تشغيل وإيقاف وتقديم ±15 ثانية وشريط الموضع). تستمر في الخلفية، وتنتقل للسورة التالية أو سورة عشوائية.
- **الحساب والمزامنة:**
  - تسجيل الدخول **بأبل** أو **قوقل**، ومزامنة مع نفس حساب Firebase حق أندرويد.
  - دمج ثلاثي بنفس منطق أندرويد.
  - حذف الحساب مع إلغاء ربط Apple.
  - منافسات التحدّي عبر الإنترنت.
- **الويدجت:**
  - الصلاة القادمة مع عدّاد، بحجم صغير ومتوسط وعلى شاشة القفل.
  - التاريخ الهجري (أم القرى) والميلادي.
  - آية اليوم وذكر اليوم.
- **الباقي:** القبلة بالبوصلة، والطقس، والنسخ الاحتياطي عبر تطبيق الملفات، والمشاركة، والصدقات (تفتح في Safari حسب شرط أبل).
- **تنظيف الواجهة:** أزلت ذكر "أندرويد" من رسائل الواجهة في اللغات الخمس.

## ما بقي قبل النشر العام في App Store

- **تنبيهات الختمة والأذكار اليومية:** الواجهة تعرض "غير متاحة على هذا الجهاز" مؤقتاً.
- **صور المتجر:** iPhone 6.9" وiPad 13". تقدر تاخذها من TestFlight.
- **ملصق الخصوصية في App Store Connect:** البريد، والاسم، ومعرّف المستخدم، ومحتوى المستخدم، وكلها "مرتبطة بالمستخدم" ولـ"وظائف التطبيق" فقط.
- **رابط سياسة الخصوصية:** موجود عندك في `website/public/privacy.html`.

## قيود من أبل
- **صوت الإشعار حده 30 ثانية.** مقاطع الأذان الحالية أقصر من هذا، فتُسمع كاملة.
- **الوضع الصامت:** التنبيه يتبع زر الصامت في الجوال، ولا يمكن تجاوزه بدون إذن خاص من أبل.
- **التحديث الذاتي (APK) غير موجود في iOS.** التحديثات تنزل من المتجر.
