# Quran Girls Tracker

موقع عربي RTL لإدارة ومتابعة حفظ القرآن للبنات، بواجهة وردية/بنفسجية ناعمة ولوحات منفصلة للإدارة والطالبة.

## المزايا

- تسجيل دخول حقيقي عبر Supabase Auth.
- أدوار: `admin` و `student`.
- لوحة إدارة للطالبات والخطط والأوراد والتقييمات.
- لوحة طالبة تعرض ورد اليوم والسجل ونسبة التقدم.
- حفظ كل البيانات في Supabase بدل `localStorage`.
- RLS Policies تمنع الطالبة من رؤية بيانات غيرها.
- تعديل السورة والآيات والصفحة والتاريخ والملاحظة والحالة والتقييم.
- تصدير تقرير CSV من لوحة التقارير.
- مجهز للنشر على Vercel أو Netlify.

## التشغيل المحلي

```bash
npm install
cp .env.example .env
npm run dev
```

ثم افتح الرابط الذي يظهر في الطرفية. غالبًا:

```text
http://localhost:5173
```

## إعداد Supabase

1. أنشئ مشروع Supabase جديد.
2. افتح SQL Editor.
3. نفذ الملف:

```text
supabase/schema.sql
```

4. نفذ الملف:

```text
supabase/seed.sql
```

5. من Project Settings > API انسخ:

```text
Project URL
anon public key
```

6. ضعها في `.env`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## إنشاء المستخدمين

استخدم Supabase Edge Function الموجودة في:

```text
supabase/edge-functions/admin-create-user/index.ts
```

هذه الوظيفة تنشئ مستخدمًا في Supabase Auth ثم تنشئ له profile، وإذا كان role = student تنشئ له student.

تحتاج نشرها في Supabase CLI:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set APP_ORIGIN=https://your-domain.com
```

مهم: لا تضع `SUPABASE_SERVICE_ROLE_KEY` داخل الواجهة أو Git.

## حسابات التجربة المطلوبة

أنشئها عبر Supabase Auth أو Edge Function:

- admin / `<ADMIN_PASSWORD>`
- reem / `<REEM_PASSWORD>`
- aisha / `<AISHA_PASSWORD>`

النظام يحول username إلى بريد داخلي بهذا الشكل:

```text
admin@quran-girls.local
reem@quran-girls.local
aisha@quran-girls.local
```

بعد إنشاء حساب الإدارة، أضف صفه في `profiles`:

```sql
insert into public.profiles (auth_user_id, full_name, display_name, username, role)
values ('AUTH_USER_UUID_HERE', 'Admin', 'Admin', 'admin', 'admin');
```

ثم ادخل من التطبيق وأنشئ الطالبات من لوحة الإدارة.

## النشر على Vercel

1. ارفع المشروع إلى GitHub.
2. اربطه بـ Vercel.
3. أضف Environment Variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

4. Build command:

```bash
npm run build
```

5. Output directory:

```text
dist
```

## النشر على Netlify

Build command:

```bash
npm run build
```

Publish directory:

```text
dist
```

## ملاحظات أمنية

- RLS مفعلة على كل الجداول.
- الطالبة تقرأ بياناتها فقط.
- الطالبة لا تستطيع تعديل التقييم أو خطة الحفظ.
- إنشاء المستخدمين يحتاج Edge Function أو إجراء من السيرفر لأن service role لا يجوز وضعه في المتصفح.

## الملفات المهمة

- `src/main.jsx`: الواجهة والمنطق.
- `src/lib/repository.js`: عمليات Supabase.
- `src/lib/supabase.js`: إعداد العميل.
- `src/lib/scheduleSeed.js`: قالب الخطة الافتراضية.
- `supabase/schema.sql`: الجداول والسياسات.
- `supabase/seed.sql`: إعدادات أولية.
- `supabase/edge-functions/admin-create-user/index.ts`: إنشاء حسابات آمنة.
