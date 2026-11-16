import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Archive, Bell, BookOpen, Check, ChevronDown,
  ClipboardList, Cloud, FilePlus2, FileText, FolderOpen, LayoutDashboard,
  Menu, MoreHorizontal, Printer, Search, Settings2, ShieldCheck,
  Table2, Wifi, WifiOff,
} from "lucide-react";
import { firebaseConfigured } from "./lib/firebase";

type Draft = { id: string; title: string; category: string; updatedAt: string; content: string };
const STORAGE_KEY = "wathaeqi:drafts:v1";
const starterContent = `<h2>بسم الله الرحمن الرحيم</h2><p>العدد: ....................</p><p>التاريخ: .... / .... / ........</p><p><strong>إلى /</strong> ................................................</p><p><strong>الموضوع /</strong> ............................................</p><p>تحية طيبة...</p><p>يرجى التفضل بالاطلاع واتخاذ ما يلزم بشأن الموضوع أعلاه، مع التقدير.</p><p>وتفضلوا بقبول فائق الاحترام.</p><p><strong>التوقيع:</strong> ............................</p>`;

const initialDrafts: Draft[] = [
  { id: "d-1", title: "طلب تجهيز مستلزمات إدارية", category: "كتاب صادر", updatedAt: "اليوم، 09:42", content: starterContent },
  { id: "d-2", title: "محضر اجتماع لجنة العمل", category: "محضر", updatedAt: "أمس، 13:15", content: starterContent },
  { id: "d-3", title: "خطة توزيع المهام الأسبوعية", category: "ورقة عمل", updatedAt: "12 نوفمبر", content: starterContent },
];

function readDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft[]) : initialDrafts;
  } catch {
    return initialDrafts;
  }
}

export default function App() {
  const [drafts, setDrafts] = useState<Draft[]>(readDrafts);
  const [activeId, setActiveId] = useState("d-1");
  const [query, setQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(true);
  const activeDraft = drafts.find((draft) => draft.id === activeId) ?? drafts[0];

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: activeDraft?.content ?? starterContent,
    onUpdate: ({ editor: currentEditor }) => {
      setSaved(false);
      const content = currentEditor.getHTML();
      setDrafts((current) => current.map((draft) =>
        draft.id === activeId ? { ...draft, content, updatedAt: "قبل لحظات" } : draft
      ));
    },
    editorProps: { attributes: { "aria-label": "محرر نص الكتاب الرسمي", class: "document-editor" } },
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    setSaved(true);
  }, [drafts]);

  useEffect(() => {
    const handleOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (editor && activeDraft) editor.commands.setContent(activeDraft.content);
  }, [activeId]);

  const filteredDrafts = useMemo(() => drafts.filter((draft) =>
    draft.title.toLocaleLowerCase("ar").includes(query.toLocaleLowerCase("ar"))
  ), [drafts, query]);

  function createDraft() {
    const draft: Draft = {
      id: crypto.randomUUID(),
      title: "كتاب رسمي جديد",
      category: "مسودة",
      updatedAt: "الآن",
      content: starterContent,
    };
    setDrafts((current) => [draft, ...current]);
    setActiveId(draft.id);
    editor?.commands.setContent(starterContent);
  }

  function updateTitle(title: string) {
    setDrafts((current) => current.map((draft) => draft.id === activeId ? { ...draft, title } : draft));
  }

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol"><FileText size={23} /></div>
          <div><strong>وثائقي</strong><span>إدارة الوثائق الرسمية</span></div>
        </div>
        <button className="workspace-switch"><span className="workspace-avatar">و</span><span><b>مساحة العمل</b><small>الإدارة العامة</small></span><ChevronDown size={16} /></button>
        <div className="nav-caption">القائمة الرئيسية</div>
        <nav className="main-nav">
          <a href="#dashboard"><LayoutDashboard size={18}/> لوحة التحكم</a>
          <a className="active" href="#documents"><FolderOpen size={18}/> مستنداتي <span className="nav-count">{drafts.length}</span></a>
          <a href="#templates"><BookOpen size={18}/> القوالب الرسمية</a>
          <a href="#register"><ClipboardList size={18}/> سجل الصادر والوارد</a>
          <a href="#archive"><Archive size={18}/> الأرشيف</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={19}/><span><b>مساحة عمل آمنة</b><small>إعدادات الحماية والنسخ الاحتياطي</small></span></div>
          <a href="#settings"><Settings2 size={18}/> الإعدادات</a>
          <div className="profile"><div className="profile-avatar">م</div><span><b>المستخدم</b><small>مسؤول النظام</small></span><MoreHorizontal size={20}/></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="فتح القائمة" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={20}/></button>
          <div className="breadcrumbs"><span>الرئيسية</span><b>/</b><strong>مستنداتي</strong></div>
          <div className="top-actions">
            <span className={`connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={15}/> : <WifiOff size={15}/>} {online ? "متصل" : "دون اتصال"}</span>
            <button className="icon-button" aria-label="الإشعارات"><Bell size={19}/></button>
            <div className="top-avatar">م</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow">مساحة العمل الرقمية</div><h1>إدارة الوثائق والكتب الرسمية</h1><p>أنشئ مستنداتك، نظّم مراسلاتك، وجهّز كتبك للطباعة من مكان واحد.</p></div>
            <button className="primary-button" onClick={createDraft}><FilePlus2 size={18}/> إنشاء مستند جديد</button>
          </section>

          <section className="stats-grid">
            <article className="stat-card"><span className="stat-icon blue"><FileText size={20}/></span><div><small>إجمالي المستندات</small><strong>{drafts.length + 24}</strong><em>في مساحة العمل</em></div></article>
            <article className="stat-card"><span className="stat-icon green"><Check size={20}/></span><div><small>مستندات مكتملة</small><strong>18</strong><em>جاهزة للأرشفة</em></div></article>
            <article className="stat-card"><span className="stat-icon amber"><FilePlus2 size={20}/></span><div><small>مسودات قيد العمل</small><strong>{drafts.length}</strong><em>محفوظة محلياً</em></div></article>
            <article className="stat-card"><span className="stat-icon violet"><Cloud size={20}/></span><div><small>حالة المزامنة</small><strong>{firebaseConfigured ? "Firebase" : "محلي"}</strong><em>{firebaseConfigured ? "إعداد الاتصال متوفر" : "بانتظار إعداد Firebase"}</em></div></article>
          </section>

          <section className="workspace-grid">
            <div className="panel documents-panel">
              <div className="panel-heading"><div><h2>أحدث المستندات</h2><p>تابع آخر ما عملت عليه</p></div><button className="text-button">عرض الكل</button></div>
              <div className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن مستند..." /></div>
              <div className="document-list">
                {filteredDrafts.map((draft) => <button key={draft.id} className={`document-row ${activeId === draft.id ? "selected" : ""}`} onClick={() => setActiveId(draft.id)}><span className="file-icon"><FileText size={19}/></span><span className="document-info"><b>{draft.title}</b><small>{draft.category} · {draft.updatedAt}</small></span><MoreHorizontal size={18}/></button>)}
                {filteredDrafts.length === 0 && <div className="empty-state">لا توجد مستندات مطابقة للبحث.</div>}
              </div>
            </div>

            <div className="panel editor-panel">
              <div className="panel-heading editor-heading"><div><h2>محرر المستند</h2><p>تحرير وتنسيق الكتاب الرسمي</p></div><div className="editor-status">{saved ? <Check size={14}/> : <span className="saving-dot"/>}{saved ? "تم الحفظ محلياً" : "جارٍ الحفظ..."}</div></div>
              <input className="document-title" aria-label="عنوان المستند" value={activeDraft?.title ?? ""} onChange={(event) => updateTitle(event.target.value)} />
              <div className="toolbar">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="عريض"><b>B</b></button>
                <button onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="مائل"><i>I</i></button>
                <button onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="قائمة">•</button>
                <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="قائمة مرقمة">1.</button>
                <span></span>
                <button onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} aria-label="إدراج جدول"><Table2 size={17}/></button>
                <button onClick={() => window.print()} aria-label="طباعة"><Printer size={17}/></button>
              </div>
              <div className="paper-wrap"><div className="paper"><div className="paper-letterhead"><div className="letterhead-mark">شعار الجهة</div><div><b>اسم الجهة الرسمية</b><small>القسم / الشعبة الإدارية</small></div><div className="letterhead-number">العدد: ........<br/>التاريخ: .... / .... / ....</div></div><EditorContent editor={editor}/><div className="paper-footer">وثائقي · نموذج أولي قابل للتخصيص</div></div></div>
              <div className="editor-footer"><span><Check size={15}/> يتم حفظ المسودة على هذا الجهاز</span><button className="print-button" onClick={() => window.print()}><Printer size={16}/> طباعة A4</button></div>
            </div>
          </section>
          <footer className="app-footer">وثائقي <span>·</span> منصة تنظيم وإعداد الوثائق الرسمية</footer>
        </div>
      </main>
    </div>
  );
}