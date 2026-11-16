import { useEffect, useRef, useState } from "react";
import { Download, File, Paperclip, Trash2, Upload } from "lucide-react";
import { deleteAttachment, getAttachmentDownloadUrl, listAttachments, uploadAttachment, type CloudAttachment } from "../lib/documentRepository";

type Props = { documentId: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentManager({ documentId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Array<CloudAttachment & { downloadUrl: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const rows = await listAttachments(documentId);
      const withUrls = await Promise.all(rows.map(async item => ({ ...item, downloadUrl: await getAttachmentDownloadUrl(item.fileId) })));
      setItems(withUrls);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المرفقات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [documentId]);

  async function uploadSelected(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      await uploadAttachment(documentId, file);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر رفع الملف.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(item: CloudAttachment) {
    if (!window.confirm(`هل تريد حذف المرفق "${item.fileName}"؟`)) return;
    setError("");
    try {
      await deleteAttachment(item.id, item.fileId);
      setItems(current => current.filter(entry => entry.id !== item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف المرفق.");
    }
  }

  return (
    <section className="attachment-manager" dir="rtl">
      <div className="attachment-heading"><div><h3><Paperclip size={16}/> المرفقات</h3><small>ملفات خاصة بهذا المستند · الحد الأقصى 10 ميغابايت للملف</small></div><button className="attachment-upload" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={15}/>{busy ? "جارٍ الرفع..." : "إرفاق ملف"}</button><input ref={inputRef} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={event => void uploadSelected(event.target.files?.[0])}/></div>
      {error && <div className="cloud-error" role="alert">{error}</div>}
      {loading ? <div className="empty-state">جارٍ تحميل المرفقات...</div> : items.length === 0 ? <div className="attachment-empty">لا توجد مرفقات لهذا المستند.</div> : <div className="attachment-list">{items.map(item => <div className="attachment-item" key={item.id}><File size={17}/><div><b>{item.fileName}</b><small>{formatSize(item.size)}</small></div><a href={item.downloadUrl} target="_blank" rel="noreferrer" aria-label="تنزيل المرفق"><Download size={16}/></a><button type="button" onClick={() => void remove(item)} aria-label="حذف المرفق"><Trash2 size={16}/></button></div>)}</div>}
    </section>
  );
}
