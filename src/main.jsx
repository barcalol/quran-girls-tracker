import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Download,
  Edit3,
  Heart,
  Loader2,
  LogOut,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  createDefaultPlan,
  createAssignment,
  createStudentViaFunction,
  deleteStudent,
  getSessionProfile,
  getStudentForProfile,
  listAllAssignments,
  listAssignments,
  listStudents,
  signIn,
  signOut,
  updateAssignment,
  updateStudent,
  upsertAssignment,
} from './lib/repository';
import { formatDate } from './lib/scheduleSeed';
import { defaultSchedule } from './lib/scheduleSeed';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import './styles.css';

const statusLabels = {
  pending: 'بانتظار التسميع',
  ready: 'جاهزة للتسميع',
  completed: 'سُمعت',
  delayed: 'مؤجل',
  needs_review: 'تحتاج مراجعة',
};

const adminStatusOptions = [
  ['pending', statusLabels.pending],
  ['completed', statusLabels.completed],
  ['needs_review', statusLabels.needs_review],
  ['delayed', statusLabels.delayed],
];

function App() {
  const [auth, setAuth] = useState({ loading: true, session: null, profile: null });
  const [toast, setToast] = useState(null);
  const [demoRole, setDemoRole] = useState(null);

  useEffect(() => {
    refreshAuth();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange(() => refreshAuth());
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refreshAuth() {
    try {
      const { session, profile } = await getSessionProfile();
      setAuth({ loading: false, session, profile });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
      setAuth({ loading: false, session: null, profile: null });
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuth({ loading: false, session: null, profile: null });
  }

  if (auth.loading) return <LoadingScreen />;

  return (
    <main className="app">
      <Decor />
      {!auth.profile ? (
        demoRole ? (
          <DemoDashboard role={demoRole} onExit={() => setDemoRole(null)} />
        ) : (
          <LoginScreen onLogin={refreshAuth} onDemo={setDemoRole} setToast={setToast} />
        )
      ) : auth.profile.role === 'admin' ? (
        <AdminDashboard profile={auth.profile} onSignOut={handleSignOut} setToast={setToast} />
      ) : (
        <StudentDashboard profile={auth.profile} onSignOut={handleSignOut} setToast={setToast} />
      )}
      {toast && <div className={`toast ${toast.type || 'success'}`}><Sparkles /> {toast.message}</div>}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="app centerScreen">
      <Loader2 className="spin" />
      <h1>جاري التحميل</h1>
    </main>
  );
}

function LoginScreen({ onLogin, onDemo, setToast }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!hasSupabaseConfig) {
      setToast({ type: 'error', message: 'أضف مفاتيح Supabase في ملف .env أولًا' });
      return;
    }
    setLoading(true);
    try {
      await signIn(username, password);
      await onLogin();
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'تعذر تسجيل الدخول' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="loginShell">
      <div className="loginCard">
        <p className="overline">متابعة يومية ناعمة للبنات</p>
        <h1>متابعة حفظ القرآن</h1>
        <p>دخول الإدارة أو الطالبة باسم مستخدم وكلمة مرور، وكل البيانات محفوظة في Supabase.</p>
        {!hasSupabaseConfig && <div className="warning">لم يتم ربط Supabase بعد. انسخ `.env.example` إلى `.env` وأضف المفاتيح.</div>}
        {!hasSupabaseConfig && (
          <div className="demoActions">
            <button type="button" onClick={() => onDemo('admin')}><Sparkles /> دخول تجريبي كإدارة</button>
            <button type="button" className="ghost" onClick={() => onDemo('student')}><UserRound /> دخول تجريبي كطالبة</button>
          </div>
        )}
        <form onSubmit={submit} className="loginForm">
          <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button disabled={loading}>{loading ? <Loader2 className="spin" /> : <Heart />} دخول</button>
        </form>
      </div>
    </section>
  );
}

function DemoDashboard({ role, onExit }) {
  const students = [
    { id: 'reem', name: 'REEM', profile: { username: 'reem' }, allow_student_notes: false, allow_student_complete: false },
    { id: 'aisha', name: 'AISHA', profile: { username: 'aisha' }, allow_student_notes: false, allow_student_complete: false },
  ];
  const [activeId, setActiveId] = useState(role === 'student' ? 'reem' : 'reem');
  const [rows, setRows] = useState(() =>
    students.flatMap((student) =>
      defaultSchedule.map((item, index) => ({
        ...item,
        id: `${student.id}-${index}`,
        student_id: student.id,
        status: index === 0 ? 'ready' : 'pending',
        grade: index === 0 ? 9 : null,
      })),
    ),
  );
  const activeStudent = students.find((student) => student.id === activeId);
  const activeRows = rows.filter((row) => row.student_id === activeId);
  const stats = computeStats(students, rows);

  function saveDemo(row) {
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)));
  }

  return (
    <>
      <Header
        title={role === 'admin' ? 'لوحة الإدارة التجريبية' : `أهلًا ${activeStudent.name}`}
        subtitle="هذه نسخة تجربة بدون قاعدة بيانات. اربط Supabase لتفعيل الحسابات الحقيقية."
        onSignOut={onExit}
      />
      {role === 'admin' && <StudentRail students={students} activeId={activeId} setActiveId={setActiveId} stats={stats} />}
      <section className="grid two">
        {role === 'admin' && (
          <section className="panel full">
            <PanelTitle icon={<Plus />} title="إضافة ورد جديد" subtitle={`تحكم كامل في سور وصفحات ${activeStudent.name}`} />
            <DemoAssignmentComposer
              student={activeStudent}
              assignments={activeRows}
              onAdd={(row) => setRows((current) => [...current, row])}
            />
          </section>
        )}
        <StudentProgress student={activeStudent} stats={stats[activeId]} />
        <section className="panel">
          <PanelTitle icon={<CalendarDays />} title={`ورد اليوم لـ ${activeStudent.name}`} subtitle="نسخة تجريبية" />
          <AssignmentTable rows={activeRows.slice(0, role === 'admin' ? 6 : 1)} saveAssignment={saveDemo} />
        </section>
        <section className="panel full">
          <PanelTitle icon={<BookOpen />} title="الجدول الكامل" subtitle="بيانات تجريبية من الدخان إلى فصلت" />
          <AssignmentTable rows={activeRows} saveAssignment={saveDemo} />
        </section>
      </section>
    </>
  );
}

function DemoAssignmentComposer({ student, assignments, onAdd }) {
  const [newRow, setNewRow] = useState(() => makeEmptyAssignment(student, assignments));

  useEffect(() => {
    setNewRow(makeEmptyAssignment(student, assignments));
  }, [student.id, assignments.length]);

  function addDemoAssignment() {
    if (!newRow.surah_name || !newRow.from_ayah || !newRow.to_ayah || !newRow.assignment_date) return;
    onAdd({
      ...newRow,
      id: `demo-${student.id}-${Date.now()}`,
      student_id: student.id,
      from_ayah: Number(newRow.from_ayah),
      to_ayah: Number(newRow.to_ayah),
      grade: newRow.grade === '' ? null : Number(newRow.grade),
      sort_order: assignments.length + 1,
    });
  }

  return (
    <div className="assignmentComposer">
      <div className="editGrid">
        <input value={newRow.assignment_date} type="date" onChange={(e) => setNewRow({ ...newRow, assignment_date: e.target.value })} />
        <input value={newRow.surah_name} placeholder="اسم السورة" onChange={(e) => setNewRow({ ...newRow, surah_name: e.target.value })} />
        <input value={newRow.from_ayah} type="number" placeholder="من آية" onChange={(e) => setNewRow({ ...newRow, from_ayah: e.target.value })} />
        <input value={newRow.to_ayah} type="number" placeholder="إلى آية" onChange={(e) => setNewRow({ ...newRow, to_ayah: e.target.value })} />
        <input value={newRow.page_or_face} placeholder="رقم الوجه/الصفحة" onChange={(e) => setNewRow({ ...newRow, page_or_face: e.target.value })} />
        <select value={newRow.status} onChange={(e) => setNewRow({ ...newRow, status: e.target.value })}>{adminStatusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={newRow.grade ?? ''} onChange={(e) => setNewRow({ ...newRow, grade: e.target.value })}><option value="">بدون تقييم</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}/10</option>)}</select>
        <input value={newRow.admin_note} placeholder="ملاحظة تظهر للطالبة" onChange={(e) => setNewRow({ ...newRow, admin_note: e.target.value })} />
      </div>
      <button className="doneButton" onClick={addDemoAssignment}><Plus /> إضافة الورد</button>
    </div>
  );
}

function AdminDashboard({ profile, onSignOut, setToast }) {
  const [view, setView] = useState('today');
  const [students, setStudents] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const activeStudent = students.find((student) => student.id === activeId) || students[0];
  const stats = useMemo(() => computeStats(students, allAssignments), [students, allAssignments]);
  const today = todayIso();
  const todayAssignments = allAssignments.filter((item) => item.assignment_date === today);

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    if (activeStudent) loadAssignments(activeStudent.id);
  }, [activeStudent?.id]);

  async function loadStudents() {
    setLoading(true);
    try {
      const rows = await listStudents();
      setStudents(rows);
      setActiveId((id) => id || rows[0]?.id || '');
      setAllAssignments(await listAllAssignments());
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignments(studentId) {
    try {
      setAssignments(await listAssignments(studentId));
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  async function saveAssignment(row) {
    try {
      await upsertAssignment(row);
      await loadAssignments(row.student_id);
      setAllAssignments(await listAllAssignments());
      setToast({ type: 'success', message: 'تم حفظ الورد' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  async function removeStudent(student) {
    try {
      await deleteStudent(student);
      await loadStudents();
      setToast({ type: 'success', message: 'تم حذف الطالبة وحسابها' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  return (
    <>
      <Header title="لوحة إدارة حفظ القرآن" subtitle="إدارة الطالبات، الخطط، التقييمات، والملاحظات." onSignOut={onSignOut} />
      <TopTabs view={view} setView={setView} />
      <StudentRail students={students} activeId={activeStudent?.id} setActiveId={setActiveId} stats={stats} />
      {loading && <LoadingPanel />}
      {!loading && view === 'today' && (
        <AdminToday students={students} stats={stats} todayAssignments={todayAssignments} activeStudent={activeStudent} assignments={assignments} saveAssignment={saveAssignment} />
      )}
      {!loading && view === 'students' && (
        <StudentsManager profile={profile} students={students} stats={stats} reload={loadStudents} removeStudent={removeStudent} setToast={setToast} />
      )}
      {!loading && view === 'schedule' && activeStudent && (
        <AssignmentsEditor student={activeStudent} assignments={assignments} saveAssignment={saveAssignment} reload={() => loadAssignments(activeStudent.id)} setToast={setToast} />
      )}
      {!loading && view === 'reports' && (
        <Reports students={students} stats={stats} assignments={assignments} />
      )}
      {!loading && view === 'reminders' && <ReminderInfo />}
    </>
  );
}

function StudentDashboard({ profile, onSignOut, setToast }) {
  const [student, setStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const row = await getStudentForProfile(profile.id);
      setStudent(row);
      setAssignments(await listAssignments(row.id));
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function studentUpdate(row, patch) {
    try {
      if (patch.status === 'completed' && !student.allow_student_complete) {
        setToast({ type: 'error', message: 'الإدارة لم تسمح بتحديد الإنجاز' });
        return;
      }
      if (patch.student_note && !student.allow_student_notes) {
        setToast({ type: 'error', message: 'ملاحظات الطالبة غير مفعلة' });
        return;
      }
      await updateAssignment(row.id, patch);
      await load();
      setToast({ type: 'success', message: 'تم إرسال التحديث للإدارة' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  const stats = useMemo(() => computeOneStats(assignments), [assignments]);
  const todayAssignment = assignments.find((item) => item.assignment_date === todayIso());

  return (
    <>
      <Header title={`أهلًا ${profile.display_name}`} subtitle="وردك اليومي وسجل تقدمك محفوظان في حسابك." onSignOut={onSignOut} />
      {loading && <LoadingPanel />}
      {!loading && student && (
        <section className="grid two">
          <StudentProgress student={student} stats={stats} />
        <StudentToday assignment={todayAssignment} />
          <section className="panel full">
            <PanelTitle icon={<BookOpen />} title="سجل الحفظ" subtitle="الأيام السابقة والقادمة" />
            <AssignmentTable rows={assignments} readOnly />
          </section>
        </section>
      )}
    </>
  );
}

function Header({ title, subtitle, onSignOut }) {
  return (
    <header className="hero appHero">
      <div>
        <p className="overline">متابعة يومية ناعمة للبنات</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <button className="logoutButton" onClick={onSignOut}><LogOut /> خروج</button>
    </header>
  );
}

function TopTabs({ view, setView }) {
  const items = [
    ['today', CalendarDays, 'اليوم'],
    ['schedule', BookOpen, 'الجدول'],
    ['students', UsersRound, 'الطالبات'],
    ['reports', Star, 'التقارير'],
    ['reminders', Bell, 'التذكير'],
  ];
  return (
    <nav className="tabs">
      {items.map(([key, Icon, label]) => (
        <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}><Icon /> {label}</button>
      ))}
    </nav>
  );
}

function StudentRail({ students, activeId, setActiveId, stats }) {
  return (
    <section className="studentRail">
      {students.map((student) => (
        <button key={student.id} className={`studentChip ${student.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(student.id)}>
          <span>{student.name.slice(0, 1)}</span>
          {student.name}
          <small>{stats[student.id]?.completed || 0}/{stats[student.id]?.total || 0}</small>
        </button>
      ))}
    </section>
  );
}

function AdminToday({ students, stats, todayAssignments, activeStudent, assignments, saveAssignment }) {
  const activeStats = stats[activeStudent?.id] || {};
  return (
    <section className="grid two">
      <section className="panel">
        <PanelTitle icon={<CalendarDays />} title="ملخص اليوم" subtitle="أوراد اليوم لكل الطالبات" />
        <div className="metricGrid">
          <Metric label="عدد الطالبات" value={students.length} />
          <Metric label="أوراد اليوم" value={todayAssignments.length} />
          <Metric label="إنجاز الطالبة" value={`${activeStats.progress || 0}%`} />
          <Metric label="متوسط التقييم" value={activeStats.average || '—'} />
        </div>
      </section>
      <section className="panel">
        <PanelTitle icon={<Heart />} title={`متابعة ${activeStudent?.name || ''}`} subtitle="آخر ورد في الخطة المحددة" />
        <AssignmentTable rows={assignments.slice(0, 5)} saveAssignment={saveAssignment} compact />
      </section>
    </section>
  );
}

function StudentsManager({ profile, students, stats, reload, removeStudent, setToast }) {
  const [form, setForm] = useState({ full_name: '', display_name: '', username: '', password: '' });

  async function addStudent() {
    try {
      const created = await createStudentViaFunction({ ...form, role: 'student' });
      await createDefaultPlan(created.student.id, profile.id);
      setForm({ full_name: '', display_name: '', username: '', password: '' });
      await reload();
      setToast({ type: 'success', message: 'تمت إضافة الطالبة وخطتها' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  return (
    <section className="panel">
      <PanelTitle icon={<UsersRound />} title="الطالبات" subtitle="إضافة وتعديل وإدارة الحسابات" />
      <div className="addBar wide">
        <input placeholder="الاسم الكامل" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <input placeholder="اسم العرض" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <input placeholder="username" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="password" dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button onClick={addStudent}><Plus /> إضافة</button>
      </div>
      <div className="studentCards">
        {students.map((student) => (
          <article key={student.id} className="studentCard">
            <div className="avatar">{student.name.slice(0, 1)}</div>
            <h3>{student.name}</h3>
            <p>@{student.profile?.username} • {stats[student.id]?.progress || 0}% مكتمل • متوسط {stats[student.id]?.average || '—'}</p>
            <div className="cardActions">
              <span className="permissionNote">الطالبة تشاهد النتيجة فقط</span>
              <button className="danger" onClick={() => window.confirm(`تأكيد حذف ${student.name} وحسابها؟`) && removeStudent(student)}><Trash2 /> حذف</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssignmentsEditor({ student, assignments, saveAssignment, reload, setToast }) {
  const [newRow, setNewRow] = useState(() => makeEmptyAssignment(student, assignments));

  useEffect(() => {
    setNewRow(makeEmptyAssignment(student, assignments));
  }, [student?.id, assignments.length]);

  async function addAssignment() {
    try {
      if (!newRow.plan_id) {
        setToast({ type: 'error', message: 'أضف خطة للطالبة أولًا أو استخدم الخطة الافتراضية' });
        return;
      }
      await createAssignment(newRow);
      await reload();
      setToast({ type: 'success', message: 'تمت إضافة الورد' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    }
  }

  return (
    <section className="panel">
      <PanelTitle icon={<Edit3 />} title={`خطة ${student.name}`} subtitle="كل ورد قابل للتعديل من الإدارة" />
      <div className="assignmentComposer">
        <h3>إضافة ورد جديد</h3>
        <div className="editGrid">
          <input value={newRow.assignment_date} type="date" onChange={(e) => setNewRow({ ...newRow, assignment_date: e.target.value })} />
          <input value={newRow.surah_name} placeholder="اسم السورة" onChange={(e) => setNewRow({ ...newRow, surah_name: e.target.value })} />
          <input value={newRow.from_ayah} type="number" placeholder="من آية" onChange={(e) => setNewRow({ ...newRow, from_ayah: e.target.value })} />
          <input value={newRow.to_ayah} type="number" placeholder="إلى آية" onChange={(e) => setNewRow({ ...newRow, to_ayah: e.target.value })} />
          <input value={newRow.page_or_face} placeholder="رقم الوجه/الصفحة" onChange={(e) => setNewRow({ ...newRow, page_or_face: e.target.value })} />
          <select value={newRow.status} onChange={(e) => setNewRow({ ...newRow, status: e.target.value })}>{adminStatusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={newRow.grade ?? ''} onChange={(e) => setNewRow({ ...newRow, grade: e.target.value })}><option value="">بدون تقييم</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}/10</option>)}</select>
          <input value={newRow.admin_note} placeholder="ملاحظة تظهر للطالبة" onChange={(e) => setNewRow({ ...newRow, admin_note: e.target.value })} />
        </div>
        <button className="doneButton" onClick={addAssignment}><Plus /> إضافة الورد</button>
      </div>
      <AssignmentTable rows={assignments} saveAssignment={saveAssignment} editable setToast={setToast} />
    </section>
  );
}

function AssignmentTable({ rows, saveAssignment, editable = false, readOnly = false, compact = false, studentMode = false, update }) {
  if (!rows?.length) return <div className="emptyState">لا توجد أوراد بعد.</div>;
  return (
    <div className={`assignmentList ${compact ? 'compact' : ''}`}>
      {rows.map((row) => (
        <AssignmentRow key={row.id} row={row} editable={editable} readOnly={readOnly} studentMode={studentMode} saveAssignment={saveAssignment} update={update} />
      ))}
    </div>
  );
}

function AssignmentRow({ row, editable, readOnly, studentMode, saveAssignment, update }) {
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);

  if (editable) {
    return (
      <article className={`dayRow ${draft.status}`}>
        <div className="dayNumber">{formatDate(draft.assignment_date).slice(0, 2)}</div>
        <div className="editGrid">
          <input value={draft.assignment_date} type="date" onChange={(e) => setDraft({ ...draft, assignment_date: e.target.value })} />
          <input value={draft.surah_name} onChange={(e) => setDraft({ ...draft, surah_name: e.target.value })} />
          <input value={draft.from_ayah} type="number" onChange={(e) => setDraft({ ...draft, from_ayah: e.target.value })} />
          <input value={draft.to_ayah} type="number" onChange={(e) => setDraft({ ...draft, to_ayah: e.target.value })} />
          <input value={draft.page_or_face || ''} onChange={(e) => setDraft({ ...draft, page_or_face: e.target.value })} />
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{adminStatusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={draft.grade ?? ''} onChange={(e) => setDraft({ ...draft, grade: e.target.value })}><option value="">بدون تقييم</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}/10</option>)}</select>
          <input value={draft.admin_note || ''} onChange={(e) => setDraft({ ...draft, admin_note: e.target.value })} placeholder="ملاحظة الإدارة" />
        </div>
        <button className="iconButton" onClick={() => saveAssignment(draft)}><Save /></button>
      </article>
    );
  }

  return (
    <article className={`dayRow ${row.status}`}>
      <div className="dayNumber">{formatDate(row.assignment_date).slice(0, 2)}</div>
      <div>
        <strong>{formatDate(row.assignment_date)}</strong>
        <h3>سورة {row.surah_name} • من {row.from_ayah} إلى {row.to_ayah}</h3>
        <p>الوجه {row.page_or_face || '—'} • {row.admin_note || 'بدون ملاحظة'}</p>
        <small>{statusLabels[row.status]} {row.grade != null ? `• ${row.grade}/10` : ''}</small>
        {row.student_note && <small>ملاحظة الطالبة: {row.student_note}</small>}
      </div>
      {!readOnly && saveAssignment && (
        <select value={row.status} onChange={(e) => saveAssignment({ ...row, status: e.target.value })}>{adminStatusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      )}
    </article>
  );
}

function StudentToday({ assignment }) {
  if (!assignment) return <section className="panel"><div className="emptyState">لا يوجد ورد اليوم.</div></section>;
  return (
    <section className="panel">
      <PanelTitle icon={<CalendarDays />} title="نتيجة اليوم" subtitle={formatDate(assignment.assignment_date)} />
      <div className="taskCard">
        <strong>سورة {assignment.surah_name}</strong>
        <h3>من الآية {assignment.from_ayah} إلى الآية {assignment.to_ayah}</h3>
        <span>الوجه {assignment.page_or_face} • {assignment.admin_note || 'بدون ملاحظة'}</span>
      </div>
      <div className="resultCard">
        <span>{statusLabels[assignment.status]}</span>
        <strong>{assignment.grade != null ? `${assignment.grade}/10` : 'لم يتم التقييم بعد'}</strong>
      </div>
    </section>
  );
}

function StudentProgress({ student, stats }) {
  return (
    <section className="panel progressPanel">
      <div className="progressRing" style={{ '--progress': `${stats.progress}%` }}><span>{stats.progress}%</span></div>
      <h2>تقدم {student.name}</h2>
      <p>تم إنجاز {stats.completed} من {stats.total} وردًا.</p>
      <div className="scoreLine"><Star /> متوسط التقييم: <strong>{stats.average || '—'}</strong></div>
    </section>
  );
}

function makeEmptyAssignment(student, assignments) {
  return {
    plan_id: assignments[0]?.plan_id || '',
    student_id: student?.id || '',
    assignment_date: todayIso(),
    surah_name: '',
    from_ayah: '',
    to_ayah: '',
    page_or_face: '',
    status: 'pending',
    grade: '',
    admin_note: '',
    sort_order: (assignments.at(-1)?.sort_order || assignments.length) + 1,
  };
}

function Reports({ students, stats }) {
  const rows = students.map((student) => ({ student, stat: stats[student.id] || computeOneStats([]) }));
  function exportCsv() {
    const csv = ['name,progress,completed,total,average', ...rows.map(({ student, stat }) => `${student.name},${stat.progress},${stat.completed},${stat.total},${stat.average}`)].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quran-girls-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="panel">
      <PanelTitle icon={<Download />} title="التقارير" subtitle="تصدير CSV جاهز، ويمكن إضافة PDF لاحقًا" />
      <button className="doneButton" onClick={exportCsv}><Download /> تصدير CSV</button>
      <div className="studentCards">
        {rows.map(({ student, stat }) => (
          <article className="studentCard" key={student.id}>
            <h3>{student.name}</h3>
            <p>{stat.progress}% مكتمل • {stat.completed}/{stat.total} • متوسط {stat.average || '—'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReminderInfo() {
  return (
    <section className="panel reminderPanel">
      <PanelTitle icon={<Bell />} title="التذكير" subtitle="إشعارات المتصفح والتذكير السحابي" />
      <p className="mutedText">النسخة الحالية تحفظ التذكير داخل واجهة التطبيق. للإشعارات السحابية الحقيقية نضيف لاحقًا Supabase Cron + بريد/Push حسب الخدمة التي تختارها.</p>
    </section>
  );
}

function PanelTitle({ icon, title, subtitle }) {
  return (
    <div className="panelTitle">
      {icon}
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function LoadingPanel() {
  return <section className="panel"><Loader2 className="spin" /> جاري تحميل البيانات...</section>;
}

function computeStats(students, assignments) {
  const map = {};
  students.forEach((student) => {
    const rows = assignments.filter((row) => row.student_id === student.id);
    map[student.id] = computeOneStats(rows);
  });
  return map;
}

function computeOneStats(rows) {
  const total = rows.length;
  const completed = rows.filter((row) => row.status === 'completed').length;
  const grades = rows.map((row) => Number(row.grade)).filter((grade) => Number.isFinite(grade));
  const average = grades.length ? Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 10) / 10 : 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, average, progress };
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuwait',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function Decor() {
  return (
    <>
      <div className="sideDecor right">♡ ✿ 🎀</div>
      <div className="sideDecor left">✦ ♡ ✿</div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
