import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, ContactRound, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  deleteContact, deleteTemplate, listContacts, listTemplates, saveContact, saveTemplate,
  type CloudContact, type CloudTemplate,
} from "../lib/documentRepository";

type Props = { type: "templates" | "contacts"; onUseTemplate?: (content: string) => void };

export default function ResourceManager({ type, onUseTemplate }: Props) {
  const isTemplates = type === "templates";
  const [templates, setTemplates] = useState<CloudTemplate[]>([]);
  const [contacts, setContacts] = useState<CloudContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("كتاب رسمي");
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      if (isTemplates) setTemplates(await listTemplates());
      else setContacts(await listContacts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [type]);

  function resetForm() {
    setEditingId(undefined);
    setTitle(""); setCategory("كتاب رسمي"); setContent("");
    setName(""); setEmail(""); setPhone(""); setOrganization("");
  }

  function editTemplate(item: CloudTemplate) {
    setEditingId(item.id); setTitle(item.title); setCategory(item.category); setContent(item.content);
  }

  function editContact(item: CloudContact) {
    setEditingId(item.id); setName(item.name); setEmail(item.email); setPhone(item.phone); setOrganization(item.organization);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (isTemplates) await saveTemplate({ title: title.trim(), category: category.trim(), content }, editingId);
      else await saveContact({ name, email, phone, organization }, editingId);
      resetForm();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ البيانات.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("هل تريد حذف هذا السجل نهائياً؟")) return;
    setError("");
    try {
      if (isTemplates) await deleteTemplate(id);
      else await deleteContact(id);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف السجل.");
    }
  }

  return (
    <section className="resource-manager" dir="rtl">
      <div className="resource-heading">
        <div className="resource-title-icon">{isTemplates ? <BookOpen size={22}/> : <ContactRound size={22}/>}</div>
        <div><h2>{isTemplates ? "القوالب الرسمية" : "جهات الاتصال"}</h2><p>{isTemplates ? "احفظ نماذج الكتب المتكررة وأعد استخدامها عند الحاجة." : "احتفظ ببيانات الجهات والأشخاص المرتبطين بمراسلاتك."}</p></div>
      </div>
      {error && <div className="cloud-error" role="alert">{error}</div>}
      <div className="resource-grid">
        <form className="resource-form" onSubmit={submit}>
          <div className="resource-form-heading"><h3>{editingId ? "تعديل السجل" : isTemplates ? "إضافة قالب جديد" : "إضافة جهة اتصال"}</h3>{editingId && <button type="button" className="resource-cancel" onClick={resetForm}><X size={15}/> إلغاء</button>}</div>
          {isTemplates ? <>
            <label>اسم القالب<input required maxLength={256} value={title} onChange={event => setTitle(event.target.value)} placeholder="مثال: كتاب طلب موافقة"/></label>
            <label>التصنيف<input required maxLength={100} value={category} onChange={event => setCategory(event.target.value)} placeholder="كتاب رسمي"/></label>
            <label>محتوى القالب<textarea required rows={9} value={content} onChange={event => setContent(event.target.value)} placeholder="اكتب محتوى القالب أو الصقه هنا..."/></label>
          </> : <>
            <label>اسم الشخص أو الجهة<input required maxLength={256} value={name} onChange={event => setName(event.target.value)} placeholder="اسم الجهة أو الشخص"/></label>
            <label>البريد الإلكتروني<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
            <label>رقم الهاتف<input maxLength={32} value={phone} onChange={event => setPhone(event.target.value)} placeholder="+90 ..."/></label>
            <label>المؤسسة أو الدائرة<input maxLength={256} value={organization} onChange={event => setOrganization(event.target.value)} placeholder="اسم المؤسسة"/></label>
          </>}
          <button className="resource-save" disabled={busy} type="submit"><Save size={16}/>{busy ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "حفظ"}</button>
        </form>
        <div className="resource-list">
          <div className="resource-list-heading"><h3>{isTemplates ? "القوالب المحفوظة" : "جهات الاتصال المحفوظة"}</h3><span>{isTemplates ? templates.length : contacts.length}</span></div>
          {loading ? <div className="empty-state">جارٍ التحميل من Appwrite...</div> : isTemplates ? templates.map(item => <article className="resource-item" key={item.id}><div className="resource-item-main"><b>{item.title}</b><small>{item.category}</small></div><div className="resource-item-actions">{onUseTemplate && <button title="استخدام القالب" onClick={() => onUseTemplate(item.content)}><Plus size={16}/></button>}<button title="تعديل" onClick={() => editTemplate(item)}><Pencil size={15}/></button><button title="حذف" onClick={() => void remove(item.id)}><Trash2 size={15}/></button></div></article>) : contacts.map(item => <article className="resource-item" key={item.id}><div className="resource-item-main"><b>{item.name}</b><small>{[item.organization,item.email,item.phone].filter(Boolean).join(" · ") || "لا توجد تفاصيل إضافية"}</small></div><div className="resource-item-actions"><button title="تعديل" onClick={() => editContact(item)}><Pencil size={15}/></button><button title="حذف" onClick={() => void remove(item.id)}><Trash2 size={15}/></button></div></article>)}
          {!loading && (isTemplates ? templates.length === 0 : contacts.length === 0) && <div className="empty-state">لا توجد سجلات بعد. أضف أول سجل من النموذج.</div>}
        </div>
      </div>
    </section>
  );
}
