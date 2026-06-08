الآن لدي صورة كاملة عن المشروع. سأكتب التقرير الكامل.

---

## تقرير مراجعة — منصة المجتهدين

---

## 🔴 حرج (Critical)

### 1. الطالب لا تستطيع تحديث وردها في قاعدة البيانات — RLS مكسور
**الملف:** `supabase/schema.sql:222-223`

سطر الكود:
```sql
drop policy if exists "assignments_student_limited_update" on public.daily_assignments;
```
السياسة حُذفت ولم تُعَد. النتيجة: لا يوجد **أي** `UPDATE policy` للطالب على `daily_assignments`. حين تحاول الطالب تحديث حالة وردها، يرفض Supabase العملية بصمت (RLS block يسبق تشغيل الـ trigger). الـ trigger `prevent_student_assignment_privilege_escalation` لن يُنفَّذ أصلًا لأن RLS يحجب العملية قبله.

**الأثر:** ميزة السماح للطالب بتحديث حالتها أو إضافة ملاحظة **معطلة كليًا** على مستوى DB.

---

### 2. دالة `studentUpdate` معرّفة لكن لا تُستدعى أبدًا — Dead Code وظيفي
**الملف:** `src/main.jsx:371-387` و `src/main.jsx:396-407`

```jsx
async function studentUpdate(row, patch) { ... }  // معرّفة

// لكن في JSX:
<AssignmentTable rows={assignments} readOnly />  // readOnly دائمًا، ولا يُمرَّر saveAssignment أو update
```

الطالب تشاهد الجدول كاملًا بوضع `readOnly` فقط. لا يوجد مكان في واجهتها تستطيع فيه تحديث شيء. كل منطق الأذونات (`allow_student_complete`, `allow_student_notes`) لا يُختبر أبدًا.

---

### 3. `.avatar` في CSS بدون `background` — الأفاتار غير مرئي
**الملف:** `src/styles.css:535-552`

```css
.avatar {
  color: white;
  font: 900 30px Arial, sans-serif;
  /* ❌ لا يوجد background */
}
```

في تبويب "الطلاب"، كل بطاقة طالب تحتوي على مربع أبيض نص أبيض — النتيجة: الحرف الأول من الاسم غير مرئي تمامًا.

---

## 🟡 مهم (Important)

### 4. تواريخ مثبتة في `createDefaultPlan` — باگ إنتاجي مؤكد
**الملف:** `src/lib/repository.js:148-149`

```js
start_date: '2026-06-07',
end_date: '2026-07-02',
```

أي طالب تُضاف بعد يوليو 2026 تحصل على خطة تاريخها في الماضي. يجب أن تُحسب الأواريخ ديناميكيًا بناءً على تاريخ الإضافة.

---

### 5. التذكير السحابي نصفه مفقود — `reminder_events` لا تُقرأ أبدًا
**الملف:** `supabase/edge-functions/daily-reminder-digest/index.ts` + `src/main.jsx` (كامل)

الـ Edge Function تُدرج سجلات في `reminder_events` بحالة `queued`، لكن:
- لا يوجد في `main.jsx` أي كود يقرأ من `reminder_events`
- الطالب لا ترى أي إشعار أو تذكير حتى بعد تشغيل الـ Function
- جدول `reminder_events` يتراكم فيه بيانات `queued` دون أن تتحول إلى `sent` أبدًا (لا يوجد push notification، لا email، لا رسالة واجهة)

الميزة مبنية نصفها (الجانب السحابي) والنصف الآخر (عرض التذكير للطالب) غائب.

---

### 6. Edge Function بلا حماية من الاستدعاء العشوائي
**الملف:** `supabase/edge-functions/daily-reminder-digest/index.ts:7`

```ts
'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
```

إذا لم يُعيَّن `APP_ORIGIN`، يُقبل الطلب من أي مصدر. لا يوجد `Authorization` header check أو secret مشترك. أي شخص يعرف رابط الـ Function يستطيع استدعاءها وتعبئة `reminder_events`.

---

### 7. `app_settings` مقروءة من كل المستخدمين المصادق عليهم
**الملف:** `supabase/schema.sql:236-238`

```sql
create policy "settings_read_authenticated" on public.app_settings
for select using (auth.uid() is not null);
```

الطالب تستطيع قراءة إعدادات التذكير (`cloud_reminders`) وأذونات الطلاب (`student_permissions`) مباشرةً من DB. لو وُجدت مفاتيح أو معلومات حساسة في `app_settings` مستقبلًا ستكون مكشوفة.

---

---

### 9. Timezone مثبت في `todayIso()` بينما الإعداد قابل للتغيير
**الملف:** `src/main.jsx:810-817`

```js
function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuwait',  // ← ثابت
```

المستخدم يستطيع تغيير المنطقة الزمنية من شاشة التذكير، لكن `todayIso()` تتجاهل هذا الإعداد تمامًا. إذا غيّر المنطقة إلى `Europe/London` مثلًا، سيختلف "ورد اليوم" الظاهر للطالب عن اليوم الحقيقي.

---

## 🟢 تحسين (Improvement)

### 10. استيراد مزدوج من نفس الملف
**الملف:** `src/main.jsx:39-40`
```js
import { formatDate } from './lib/scheduleSeed';
import { defaultSchedule } from './lib/scheduleSeed';
```
يجب دمجهما في سطر واحد.

---

### 11. أيقونة `<Sparkles>` على رسائل الخطأ
**الملف:** `src/main.jsx:108`
```jsx
{toast && <div className={`toast ${toast.type || 'success'}`}><Sparkles /> {toast.message}</div>}
```
رسائل الخطأ تظهر بأيقونة ✨ بريقة وهي تبليغ عن فشل — يُفضّل تمييز الأيقونة حسب `toast.type`.

---

### 12. `window.confirm()` لتأكيد الحذف
**الملف:** `src/main.jsx:508`
```jsx
onClick={() => window.confirm(`تأكيد حذف ${student.name}...`) && removeStudent(student)}
```
حوار المتصفح الافتراضي لا يتناسق مع تصميم المنصة وقد يُحجب في بعض البيئات. يُفضّل modal داخلي.

---

### 13. جدول `evaluations` موجود في Schema ولا يُستخدم
**الملف:** `supabase/schema.sql:58-66`
جدول كامل بـ RLS policies جاهز لكن لا يوجد في الواجهة أو Repository أي إشارة إليه. يخلق التباسًا: هل التقييم يُخزَّن في `daily_assignments.grade` أم `evaluations.grade`؟ الإجابة الحالية: `daily_assignments.grade` فقط.

---

### 14. أسماء الطلاب في Demo بالإنجليزية
**الملف:** `src/main.jsx:169`
```js
{ id: 'reem', name: 'REEM' }
```
المنصة عربية بالكامل، الأسماء في الوضع التجريبي يُفضّل أن تكون `ريم` و`عائشة`.

---

## ملخص الأولويات

| الرقم | المشكلة | الأولوية | الملف |
|-------|---------|---------|-------|
| 1 | RLS لا يسمح للطالب بالتحديث | 🔴 حرج | schema.sql:222 |
| 2 | `studentUpdate` غير موصولة بالواجهة | 🔴 حرج | main.jsx:371 |
| 3 | `.avatar` بدون background | 🔴 حرج | styles.css:535 |
| 4 | تواريخ مثبتة في createDefaultPlan | 🟡 مهم | repository.js:148 |
| 5 | reminder_events لا تُعرض للطالب | 🟡 مهم | main.jsx (كامل) |
| 6 | Edge Function بدون auth | 🟡 مهم | edge-function/index.ts |
| 7 | app_settings مكشوفة للطالب | 🟡 مهم | schema.sql:236 |
| 9 | timezone ثابت في todayIso | 🟡 مهم | main.jsx:810 |
| 10-14 | تحسينات تجميلية وكودية | 🟢 تحسين | متعددة |
