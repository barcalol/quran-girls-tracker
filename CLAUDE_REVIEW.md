الآن لديّ صورة كاملة. سأكتب التقرير الشامل.

---

# تقرير المراجعة الهندسية — Quran Girls Tracker

**التاريخ:** 2026-06-07 | **الحالة:** قيد المراجعة قبل النشر  
**التقنيات:** React 19 · Vite 7 · Supabase Auth/RLS/Edge Functions · vanilla CSS

---

## 🔴 Critical — مشاكل تمنع النشر الآمن

---

### C-1: كلمة المرور الافتراضية مكشوفة في واجهة تسجيل الدخول
**الملف:** `src/main.jsx` السطران 108–109

```jsx
const [username, setUsername] = useState('admin');
const [password, setPassword] = useState('Admin123456');
```

حقلا الاسم وكلمة المرور يُملآن مسبقًا ببيانات admin. أي شخص يفتح التطبيق يرى الحساب ويدخل بنقرة واحدة.

**الإصلاح:** احذف القيم الافتراضية (`useState('')`)، واحتفظ بها في README فقط للتطوير المحلي.

---

### C-2: حذف الطالبة لا يحذف حسابها من Supabase Auth
**الملف:** `src/lib/repository.js` السطور 102–108

```js
export async function deleteStudent(student) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', student.profile_id); // يحذف profile فقط!
}
```

يُحذَف السجل من `profiles` (ويتسلسل إلى `students`)، لكن **حساب `auth.users` يبقى حيًّا**. الطالبة المحذوفة تستطيع تسجيل الدخول مجددًا، لكنها ستعلق في loading-loop لأن `getSessionProfile` يجد session بدون profile.

**الإصلاح:** أضف Edge Function أو وسّع `admin-create-user` لتدعم الحذف عبر `adminClient.auth.admin.deleteUser(authUserId)`.

---

### C-3: خطأ منطقي في RLS — الطالبة لا تستطيع التحديث بعد التقييم
**الملف:** `supabase/schema.sql` السطور 175–181

```sql
create policy "assignments_student_limited_update" ...
with check (
  student_id = public.current_student_id()
  and status in ('ready', 'completed', 'pending')
  and grade is null   ← المشكلة هنا
);
```

`WITH CHECK` يتحقق من الصف **بعد** التحديث. إذا وضع الأدمن تقييمًا (`grade = 7`)، أي محاولة من الطالبة لتغيير الحالة أو إضافة ملاحظة ستفشل لأن الصف الناتج سيحمل `grade = 7` وليس `null`.

**الإصلاح:**
```sql
with check (
  student_id = public.current_student_id()
  and status in ('ready', 'completed', 'pending')
  -- لا تشترط grade is null
);
```
وافصل منطق منع تعديل التقييم إلى شرط `USING` يمنع تغيير عمود `grade` مباشرةً.

---

### C-4: خطأ صامت في `listPlans` — الفلترة لا تعمل
**الملف:** `src/lib/repository.js` السطور 63–69

```js
const query = supabase.from('memorization_plans').select('*').order(...);
if (studentId) query.eq('student_id', studentId); // ← النتيجة تُتجاهل
const { data, error } = await query;
```

`supabase-js` غير قابل للتحوير (immutable) — `query.eq(...)` يُعيد query جديدة لكن نتيجتها لا تُحفظ. إذا استُدعيت هذه الدالة (غير مستخدمة حاليًا)، ستُعيد **كل الخطط لكل الطالبات** لأي مستخدم.

**الإصلاح:**
```js
let query = supabase.from('memorization_plans').select('*').order(...);
if (studentId) query = query.eq('student_id', studentId);
```

---

### C-5: إحصائيات التقارير خاطئة — تعتمد على بيانات الطالبة النشطة فقط
**الملف:** `src/main.jsx` السطر 154

```jsx
const stats = useMemo(() => computeStats(students, assignments), [students, assignments]);
```

`assignments` تحتوي **فقط** على أوراد الطالبة المحددة حاليًا. `computeStats` تفلتر حسب `student_id`، لذا باقي الطالبات ستظهر بـ `0/0` في التقارير وشريط الطالبات.

**الإصلاح:** إما تحميل كل الأوراد مرة واحدة، أو حفظ stats لكل طالبة عند تحميلها وتجميعها في Map منفصل.

---

## 🟠 Important — مشاكل وظيفية تؤثر على التجربة

---

### I-1: لا يمكن للأدمن تعطيل `allow_student_complete` من الواجهة
**الملف:** `src/main.jsx` السطر 389

زر `studentCard` يبدّل `allow_student_notes` فقط. لا يوجد زر مقابل لـ `allow_student_complete` رغم أن الحقل موجود في قاعدة البيانات والمنطق موجود في `StudentDashboard` (السطر 255).

**الإصلاح:** أضف زرًا ثانيًا:
```jsx
<button onClick={() => updateStudent(student.id, { allow_student_complete: !student.allow_student_complete }).then(reload)}>
  {student.allow_student_complete ? 'إيقاف تأكيد الإنجاز' : 'تفعيل تأكيد الإنجاز'}
</button>
```

---

### I-2: ورد اليوم يُظهر أول ورد قديم إذا لم يكن هناك ورد لليوم
**الملف:** `src/main.jsx` السطر 272

```js
const todayAssignment = assignments.find(...) || assignments[0];
```

إذا لم يكن هناك ورد لليوم، تُعرض بيانات أول ورد في الخطة للطالبة. يُضلل الطالبة ويجعلها تعتقد أن هذا هو ورد اليوم.

**الإصلاح:** إذا لم يُوجد ورد اليوم، اعرض رسالة "لا يوجد ورد مجدول اليوم" بدلًا من الـ fallback.

---

### I-3: `confirm()` بالإنجليزية لحذف الطالبة
**الملف:** `src/main.jsx` السطر 198

```js
if (!confirm(`حذف ${student.name}؟`)) return;
```

`confirm()` حوار نظام التشغيل يظهر بالإنجليزية مع واجهة RTL عربية — تناقض في التجربة.

**الإصلاح:** أضف حوار تأكيد مخصص داخل React.

---

### I-4: Toast لا يُفرّق بين النجاح والخطأ
**الملف:** `src/main.jsx` السطر 93

```jsx
{toast && <div className="toast"><Sparkles /> {toast}</div>}
```

نفس اللون (بنفسجي داكن) وأيقونة `Sparkles` لرسائل النجاح والأخطاء. المستخدم لا يعلم إذا كانت العملية نجحت أم فشلت.

**الإصلاح:** اجعل `toast` object يحمل `{ message, type: 'success' | 'error' }` وغيّر اللون والأيقونة تبعًا للنوع.

---

### I-5: `defaultSchedule` تواريخ ثابتة في الكود
**الملف:** `src/lib/scheduleSeed.js` السطر 2

التواريخ مشفرة بدءًا من `2026-06-07`. إذا أُضيفت طالبة جديدة بعد عدة أشهر، سيُنشأ لها جدول بأوراد في الماضي.

**الإصلاح:** احسب التواريخ نسبيًا من تاريخ اليوم عند الاستدعاء.

---

### I-6: لا يوجد `favicon` ولا manifest
**الملف:** `public/` — فارغ تمامًا

لا favicon، لا `manifest.json`، لا `robots.txt`. التطبيق في المتصفح يظهر بالأيقونة الافتراضية وعنوان الصفحة وحسب.

---

## 🔒 Security — مخاوف أمنية

---

### S-1: CORS مفتوح على `*` في Edge Function
**الملف:** `supabase/edge-functions/admin-create-user/index.ts` السطران 3–6

```ts
'Access-Control-Allow-Origin': '*',
```

الدالة محمية بـ JWT + فحص الدور، لذا الخطر محدود. لكن في production يجب تقييده بنطاق موقعك:

```ts
'Access-Control-Allow-Origin': 'https://your-domain.com',
```

---

### S-2: كلمات المرور الافتراضية في `seed.sql` و `README.md`
**الملفات:** `supabase/seed.sql:2-4`، `README.md:84-86`

```sql
-- admin / Admin123456
-- reem / Reem123456
```

إذا أصبح المستودع عامًا، هذه بيانات حقيقية. استبدلها بـ `<ADMIN_PASSWORD>` في التوثيق.

---

### S-3: `username` في Edge Function يقبل أي محرف
**الملف:** `supabase/edge-functions/admin-create-user/index.ts` السطر 36

```ts
const username = String(body.username || '').trim().toLowerCase();
```

لا يوجد تحقق من صيغة username (طول أدنى، أحرف مسموحة). اسم مستخدم مثل `../admin` أو `a@b` لن يُكسر الكود لكن يُلوث البيانات.

**الإصلاح:** أضف regex مثل `/^[a-z0-9_]{3,30}$/`.

---

### S-4: `app_settings` مرئية لكل المستخدمين الموثقين
**الملف:** `supabase/schema.sql` السطور 195–197

```sql
create policy "settings_read_authenticated" on public.app_settings
for select using (auth.uid() is not null);
```

أي طالبة مسجّلة تستطيع قراءة كل إعدادات التطبيق. إذا أضفت مستقبلًا إعدادات حساسة (مفاتيح API داخلية، إلخ) ستُكشف.

---

## 🎨 UX/UI — تجربة المستخدم والتصميم

---

### UX-1: أيقونة الحرف الأول في شريط الطالبات بدون خلفية
**الملف:** `src/styles.css` السطور 254–263

```css
.studentChip span {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  /* لا background-color! */
}
```

الحرف الأول يظهر أبيض اللون على خلفية بيضاء (شفاف). يجب إضافة `background: var(--pink-dark)` مثلًا.

---

### UX-2: محرر الأوراد (editGrid) يحتوي 8 عناصر متراصة على الجوال
**الملف:** `src/styles.css` السطر 579–583

على الجوال الصغير يتحول إلى عمود واحد — 8 حقول إدخال متراصة بدون grouping بصري. يصعب التمييز بينها.

**الإصلاح:** قسّمها إلى مجموعتين منطقيتين (معلومات الورد / الحالة والتقييم) واعرضها في بطاقتين.

---

### UX-3: نص ثابت `REEM  AISHA` في CSS
**الملف:** `src/styles.css` السطر 86

```css
.hero::before {
  content: "REEM  AISHA";
```

اسمان شخصيان مشفران في ملف CSS. يجب نقله إلى متغير أو إزالته للتعميم.

---

### UX-4: تصدير CSV بدون BOM — مشكلة عربية في Excel
**الملف:** `src/main.jsx` السطور 501–509

```js
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
```

Excel في Windows لا يتعرف على ترميز UTF-8 بدون BOM فيُعرض النص العربي كحروف مكسورة.

**الإصلاح:**
```js
const BOM = '\uFEFF';
const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
```

---

### UX-5: لا يوجد معالج خطأ إذا كان المستخدم في `auth.users` بدون `profiles`
**الملف:** `src/main.jsx` السطر 86

```jsx
{!auth.profile ? <LoginScreen ...> : ...}
```

إذا وُجد session ولم يُجد profile (مثلًا بعد حذف Profile بدون حذف Auth)، يظهر شاشة Login بدون أي رسالة تفسيرية.

---

## 🚀 Deployment — ما يحتاج تجهيزًا قبل النشر

---

### D-1: `dist/` محفوظ في المستودع
**الملف:** `dist/`

مجلد البناء موجود في المشروع ولا يوجد `.gitignore`. هذا يُلوث سجل Git ويزيد الحجم.

**الإصلاح:** أنشئ `.gitignore`:
```
node_modules/
dist/
.env
```

---

### D-2: لا يوجد `vercel.json` أو `netlify.toml`
المشروع يعمل بدون routing ففعليًا هذا ليس مشكلة الآن. لكن إضافة ملف بسيط ممارسة صحية ويمنع مفاجآت مستقبلية:

**`vercel.json`:**
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

---

### D-3: خطوات نشر Edge Function غير موثقة بالكامل
**الملف:** `README.md` السطور 75–78

README يذكر:
```bash
supabase functions deploy admin-create-user
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

لكن لا يذكر:
- ضرورة `supabase login` أولًا
- ضرورة `supabase link --project-ref <id>`
- أن `supabase CLI` يجب تثبيته

---

### D-4: نص README يذكر port خاطئ
**الملف:** `README.md` السطر 26

```
http://localhost:5180
```

Vite يستخدم `5173` افتراضيًا. الـ port الوارد في README (`5180`) غير مطابق.

---

### D-5: خطوط Google Fonts قد تُحجب في بعض المناطق
**الملف:** `src/styles.css` السطر 1

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic...');
```

في بعض البيئات (شبكات مقيدة) يُحجب Google Fonts. البديل: استخدام [fontsource](https://fontsource.org) أو تضمين الخطوط محليًا.

---

## 📝 Nice-to-Have — تحسينات لاحقة

| # | الموضوع | التفاصيل |
|---|---------|----------|
| N-1 | TypeScript | لا يوجد أي نوع. خطأ `listPlans` كان سيُكتشف في وقت التصميم لو كان TS مفعّلًا. |
| N-2 | تغليف الأخطاء (Error Boundary) | لا يوجد `<ErrorBoundary>`. خطأ في رسم أي مكون يسقط كامل التطبيق. |
| N-3 | اختبارات | صفر تغطية. على الأقل اختبار `computeOneStats` و `todayIso`. |
| N-4 | حوار تأكيد مخصص | `window.confirm` بواجهة المتصفح الإنجليزية في تطبيق عربي. |
| N-5 | `aria-label` على أزرار الأيقونات | زر "خروج" و"حفظ" بدون `aria-label` — لا يقرأها برنامج Screen Reader. |
| N-6 | الخطة الافتراضية ثابتة | عنوان الخطة `'خطة الدخان إلى فصلت'` وتواريخها مشفرة. |
| N-7 | React Router | URL لا يتغير عند التنقل بين التبويبات. لا يمكن مشاركة رابط مباشر. |
| N-8 | loading state للعمليات الفردية | `updateStudent` (تبديل الإذن) لا يُظهر loading — قد ينقر المستخدم مرتين. |
| N-9 | لا يوجد وضع داكن | تصميم جميل لكن لا Dark Mode لمن يفضله. |
| N-10 | `vite.config.js` | لا `build.target`، لا chunk splitting، لا sourcemaps config للإنتاج. |

---

## ملخص الأولويات

```
🔴 Critical  → C-1 (كلمة المرور) ، C-2 (حذف auth)، C-3 (RLS bug) — أصلحها قبل أي نشر
🟠 Important → C-4 (listPlans)، C-5 (إحصائيات)، I-1 (allow_complete)، I-4 (toast)
🔒 Security  → S-1 (CORS)، S-2 (passwords in docs)، S-3 (username validation)
🎨 UX/UI     → UX-1 (avatar bg)، UX-4 (CSV BOM)، UX-3 (hardcoded names)
🚀 Deploy    → D-1 (.gitignore)، D-2 (vercel.json)، D-4 (port في README)
```
