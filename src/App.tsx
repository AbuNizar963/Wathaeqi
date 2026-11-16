import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { PageBreak } from "./lib/PageBreak";
import {
  Archive, Bell, BookOpen, Check, ChevronDown,
  ClipboardList, Cloud, ContactRound, FilePlus2, FileText, FolderOpen, LayoutDashboard,
  Menu, MoreHorizontal, Printer, Search, Settings2, ShieldCheck,
  Table2, Wifi, WifiOff,
} from "lucide-react";
import { appwriteConfigured } from "./lib/appwrite";
import AuthScreen from "./components/AuthScreen";
import ResourceManager from "./components/ResourceManager";
import { createDocument, deleteDocument, getCurrentUser, listDocuments, signOut, updateDocument } from "./lib/documentRepository";
import { getA4DocumentLayoutCss } from "./lib/documentPrintLayout";
import { getDocumentWatermarkStyle } from "./lib/documentWatermark";
import { useReactToPrint } from "react-to-print";

type Draft = { id: string; title: string; category: string; updatedAt: string; content: string };
type SessionUser = { $id: string; name: string; email: string };
const starterContent = `<h2>بسم الله الرحمن الرحيم</h2><p>العدد: ....................</p><p>التاريخ: .... / .... / ........</p><p><strong>إلى /</strong> ................................................</p><p><strong>الموضوع /</strong> ............................................</p><p>تحية طيبة...</p><p>يرجى التفضل بالاطلاع واتخاذ ما يلزم بشأن الموضوع أعلاه، مع التقدير.</p><p>وتفضلوا بقبول فائق الاحترام.</p><p><strong>التوقيع:</strong> ............................</p>`;

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  async function refreshUser() {
    try {
      const current = await getCurrentUser();
      setUser(current ? { $id: current.$id, name: current.name, email: current.email } : null);
    } catch {
      setUser(null);
    } finally {
      setCheckingSession(false);
    }
  }

  useEffect(() => { void refreshUser(); }, []);

  async function handleSignOut() {
    try { await signOut(); } finally { setUser(null); }
  }

  if (checkingSession) return <div className="auth-loading" dir="rtl">جارٍ التحقق من جلسة الدخول...</div>;
  if (!user) return <AuthScreen onAuthenticated={() => { void refreshUser(); }} />;
  return <Workspace user={user} onSignOut={() => { void handleSignOut(); }} />;
}

function Workspace({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(true);
  const [cloudError, setCloudError] = useState("");
  const lastSaved = useRef(new Map<string, string>());
  const [activeId, setActiveId] = useState("d-1");
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<"documents" | "templates" | "contacts">("documents");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(true);
  const printableRef = useRef<HTMLDivElement>(null);
  const activeDraft = drafts.find((draft) => draft.id === activeId) ?? drafts[0];
  const handlePrint = useReactToPrint({ contentRef: printableRef, documentTitle: activeDraft?.title || "وثائقي", pageStyle: getA4DocumentLayoutCss(".document-paper") });

  const editor = useEditor({
    extensions: [
      StarterKit,
      PageBreak,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
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
    let cancelled = false;
    async function loadCloudDocuments() {
      try {
        const rows = await listDocuments();
        if (!cancelled) {
          setDrafts(rows.map((row) => ({ id: row.id, title: row.title, category: row.category, updatedAt: row.updatedAt, content: row.content })));
          lastSaved.current = new Map(rows.map((row) => [row.id, JSON.stringify({ title: row.title, category: row.category, content: row.content })]));
          if (rows[0]) setActiveId(rows[0].id);
          setCloudError("");
        }
      } catch (error) {
        if (!cancelled) setCloudError(error instanceof Error ? error.message : "تعذر تحميل المستندات من Appwrite.");
      } finally {
        if (!cancelled) setLoadingCloud(false);
      }
    }
    void loadCloudDocuments();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loadingCloud || drafts.length === 0) return;
    const changed = drafts.filter((draft) => {
      const snapshot = JSON.stringify({ title: draft.title, category: draft.category, content: draft.content });
      return lastSaved.current.get(draft.id) !== snapshot;
    });
    if (changed.length === 0) return;

    const timeout = window.setTimeout(async () => {
      try {
        await Promise.all(changed.map(async (draft) => {
          const snapshot = JSON.stringify({ title: draft.title, category: draft.category, content: draft.content });
          await updateDocument(draft.id, {
            title: draft.title,
            category: draft.category,
            content: draft.content,
            updatedAt: new Date().toISOString(),
          });
          lastSaved.current.set(draft.id, snapshot);
        }));
        setSaved(true);
        setCloudError("");
      } catch (error) {
        setSaved(false);
        setCloudError(error instanceof Error ? error.message : "تعذر حفظ التعديلات في Appwrite.");
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [drafts, loadingCloud]);

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

  async function createDraft() {
    try {
      const created = await createDocument({
        title: "كتاب رسمي جديد",
        category: "مسودة",
        content: starterContent,
        updatedAt: new Date().toISOString(),
      });
      const draft: Draft = { ...created };
      lastSaved.current.set(draft.id, JSON.stringify({ title: draft.title, category: draft.category, content: draft.content }));
      setDrafts((current) => [draft, ...current]);
      setActiveId(draft.id);
      editor?.commands.setContent(starterContent);
      setCloudError("");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "تعذر إنشاء المستند في Appwrite.");
    }
  }

  async function removeActiveDraft() {
    if (!activeDraft || !window.confirm("هل تريد حذف هذا المستند نهائياً؟")) return;
    try {
      await deleteDocument(activeDraft.id);
      setDrafts((current) => current.filter((draft) => draft.id !== activeDraft.id));
      const next = drafts.find((draft) => draft.id !== activeDraft.id);
      setActiveId(next?.id ?? "");
      setCloudError("");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "تعذر حذف المستند.");
    }
  }

  function updateTitle(title: string) {
    setSaved(false);
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
          <a href="#dashboard" onClick={() => setActiveSection("documents")}><LayoutDashboard size={18}/> لوحة التحكم</a>
          <a className={activeSection === "documents" ? "active" : ""} href="#documents" onClick={() => setActiveSection("documents")}><FolderOpen size={18}/> مستنداتي <span className="nav-count">{drafts.length}</span></a>
          <a className={activeSection === "templates" ? "active" : ""} href="#templates" onClick={() => setActiveSection("templates")}><BookOpen size={18}/> القوالب الرسمية</a>
          <a className={activeSection === "contacts" ? "active" : ""} href="#contacts" onClick={() => setActiveSection("contacts")}><ContactRound size={18}/> جهات الاتصال</a>
          <a href="#archive"><Archive size={18}/> الأرشيف</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={19}/><span><b>مساحة عمل آمنة</b><small>إعدادات الحماية والنسخ الاحتياطي</small></span></div>
          <a href="#settings"><Settings2 size={18}/> الإعدادات</a>
          <div className="profile"><div className="profile-avatar">{(user.name || user.email).slice(0,1)}</div><span><b>{user.name || "المستخدم"}</b><small>{user.email}</small></span><button className="profile-logout" onClick={onSignOut}>خروج</button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="فتح القائمة" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={20}/></button>
          <div className="breadcrumbs"><span>الرئيسية</span><b>/</b><strong>{activeSection === "templates" ? "القوالب الرسمية" : activeSection === "contacts" ? "جهات الاتصال" : "مستنداتي"}</strong></div>
          <div className="top-actions">
            <span className={`connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={15}/> : <WifiOff size={15}/>} {online ? "متصل" : "دون اتصال"}</span>
            <button className="icon-button" aria-label="الإشعارات"><Bell size={19}/></button>
            <div className="top-avatar">م</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow">مساحة العمل الرقمية</div><h1>{activeSection === "templates" ? "إدارة القوالب الرسمية" : activeSection === "contacts" ? "إدارة جهات الاتصال" : "إدارة الوثائق والكتب الرسمية"}</h1><p>{activeSection === "templates" ? "أنشئ قوالبك واحفظها لإعادة استخدامها." : activeSection === "contacts" ? "نظّم بيانات الجهات والأشخاص المرتبطين بمراسلاتك." : "أنشئ مستنداتك، نظّم مراسلاتك، وجهّز كتبك للطباعة من مكان واحد."}</p></div>
            {activeSection === "documents" && <button className="primary-button" onClick={createDraft}><FilePlus2 size={18}/> إنشاء مستند جديد</button>}
          </section>

          {activeSection === "documents" && <section className="stats-grid">
            <article className="stat-card"><span className="stat-icon blue"><FileText size={20}/></span><div><small>إجمالي المستندات</small><strong>{drafts.length}</strong><em>محفوظة في حسابك</em></div></article>
            <article className="stat-card"><span className="stat-icon green"><Check size={20}/></span><div><small>مستندات مكتملة</small><strong>18</strong><em>جاهزة للأرشفة</em></div></article>
            <article className="stat-card"><span className="stat-icon amber"><FilePlus2 size={20}/></span><div><small>مسودات قيد العمل</small><strong>{drafts.length}</strong><em>في Appwrite السحابي</em></div></article>
            <article className="stat-card"><span className="stat-icon violet"><Cloud size={20}/></span><div><small>حالة المزامنة</small><strong>{appwriteConfigured ? "Appwrite" : "غير مهيأ"}</strong><em>{appwriteConfigured ? "متصل بالخدمة السحابية" : "أضف إعدادات Appwrite"}</em></div></article>
          </section>}
          {activeSection !== "documents" ? <ResourceManager type={activeSection} onUseTemplate={async (templateContent) => {
            try {
              const created = await createDocument({ title: "مستند من قالب", category: "مسودة", content: templateContent, updatedAt: new Date().toISOString() });
              const draft: Draft = { ...created };
              lastSaved.current.set(draft.id, JSON.stringify({ title: draft.title, category: draft.category, content: draft.content }));
              setDrafts(current => [draft, ...current]); setActiveId(draft.id); setActiveSection("documents"); setCloudError("");
            } catch (error) { setCloudError(error instanceof Error ? error.message : "تعذر إنشاء مستند من القالب."); }
          }} /> : <section className="workspace-grid">
            <div className="panel documents-panel">
              <div className="panel-heading"><div><h2>أحدث المستندات</h2><p>تابع آخر ما عملت عليه</p></div><button className="text-button">عرض الكل</button></div>
              <div className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن مستند..." /></div>
              <div className="document-list">
                {filteredDrafts.map((draft) => <button key={draft.id} className={`document-row ${activeId === draft.id ? "selected" : ""}`} onClick={() => setActiveId(draft.id)}><span className="file-icon"><FileText size={19}/></span><span className="document-info"><b>{draft.title}</b><small>{draft.category} · {draft.updatedAt}</small></span><MoreHorizontal size={18}/></button>)}
                {filteredDrafts.length === 0 && !loadingCloud && <div className="empty-state">لا توجد مستندات بعد. أنشئ مستنداً جديداً للبدء.</div>}
              </div>
            </div>

            <div className="panel editor-panel">
              <div className="panel-heading editor-heading"><div><h2>محرر المستند</h2><p>تحرير وتنسيق الكتاب الرسمي</p></div><div className="editor-heading-actions">{activeDraft && <button className="delete-document-button" onClick={() => void removeActiveDraft()}>حذف المستند</button>}<div className="editor-status">{saved ? <Check size={14}/> : <span className="saving-dot"/>}{saved ? "تم الحفظ سحابياً" : "جارٍ الحفظ..."}</div></div></div>
              <input className="document-title" aria-label="عنوان المستند" value={activeDraft?.title ?? ""} onChange={(event) => updateTitle(event.target.value)} />
              <div className="toolbar">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="عريض"><b>B</b></button>
                <button onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="مائل"><i>I</i></button>
                <button onClick={() => editor?.chain().focus().toggleUnderline().run()} aria-label="تسطير"><u>U</u></button>
                <button onClick={() => editor?.chain().focus().setTextAlign("right").run()} aria-label="محاذاة لليمين">≡</button>
                <button onClick={() => editor?.chain().focus().setTextAlign("center").run()} aria-label="توسيط">☰</button>
                <button onClick={() => editor?.chain().focus().setTextAlign("justify").run()} aria-label="ضبط النص">▤</button>
                <button onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="قائمة">•</button>
                <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="قائمة مرقمة">1.</button>
                <button onClick={() => editor?.chain().focus().insertContent({ type: "pageBreak" }).run()} aria-label="إدراج فاصل صفحة" title="إدراج فاصل صفحة">↵</button>
                <span></span>
                <button onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} aria-label="إدراج جدول"><Table2 size={17}/></button>
                <button onClick={() => handlePrint()} aria-label="طباعة"><Printer size={17}/></button>
              </div>
              {cloudError && <div className="cloud-error" role="alert">{cloudError}</div>}{loadingCloud && <div className="cloud-loading">جارٍ تحميل مستنداتك من Appwrite...</div>}<div className="paper-wrap"><div className="paper document-paper" ref={printableRef}><div className="document-watermark" style={getDocumentWatermarkStyle({ opacity: 0.1 })} aria-hidden="true">وثائقي</div><div className="document-paper-content"><div className="paper-letterhead"><div className="letterhead-mark">شعار الجهة</div><div><b>اسم الجهة الرسمية</b><small>القسم / الشعبة الإدارية</small></div><div className="letterhead-number">العدد: ........<br/>التاريخ: .... / .... / ....</div></div><EditorContent editor={editor}/><div className="paper-footer">وثائقي · نموذج أولي قابل للتخصيص</div></div></div></div>
              <div className="editor-footer"><span><Check size={15}/> يتم حفظ المستند في حسابك السحابي</span><button className="print-button" onClick={() => handlePrint()}><Printer size={16}/> طباعة A4</button></div>
            </div>
          </section>}
          <footer className="app-footer">وثائقي <span>·</span> منصة تنظيم وإعداد الوثائق الرسمية</footer>
        </div>
      </main>
    </div>
  );
}