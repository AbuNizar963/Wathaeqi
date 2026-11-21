import { useEffect, useMemo } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import {
  extractDocumentText,
  richEditorContent,
  supportsRichDocumentEditing,
} from "./richDocumentContent";

type EditorContentValue = Record<string, unknown>;

type RichDocumentEditorProps = {
  content: EditorContentValue;
  onChange: (content: EditorContentValue) => void;
  editable?: boolean;
  placeholder?: string;
  containerClassName?: string;
};

export default function RichDocumentEditor({
  content,
  onChange,
  editable = true,
  placeholder = "اكتب نص الوثيقة هنا...",
  containerClassName = "",
}: RichDocumentEditorProps) {
  const canRoundTrip = supportsRichDocumentEditing(content);
  const canEdit = editable && canRoundTrip;
  const initialContent = useMemo(() => richEditorContent(content), [content]);
  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: true, inline: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    [placeholder]
  );
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: canEdit,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as EditorContentValue);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit);
  }, [editor, canEdit]);

  useEffect(() => {
    if (!editor || !canRoundTrip) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(initialContent)) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor, canRoundTrip, initialContent]);

  const textFallback = extractDocumentText(content);
  const rootClassName =
    "document-rich-editor rounded-xl border border-slate-200 bg-transparent";
  const containerClass = containerClassName
    ? rootClassName + " " + containerClassName
    : rootClassName;

  return (
    <div
      className={containerClass}
      dir="rtl"
    >
      {editable && !canRoundTrip ? (
        <p
          role="status"
          className="document-editor-warning mb-3 text-sm text-amber-800"
        >
          هذا المحتوى يحتوي على عناصر قديمة أو غير مدعومة للتحرير الآمن. تُعرض
          نسخة نصية للقراءة فقط مع الاحتفاظ بالمحتوى الأصلي دون تغييره.
        </p>
      ) : null}
      {canEdit && editor ? (
        <div
          className="document-studio-no-print document-rich-editor-toolbar"
          role="toolbar"
          aria-label="أدوات تنسيق الوثيقة"
        >
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bold") ? "secondary" : "outline"}
            aria-label="غامق"
            title="غامق"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("italic") ? "secondary" : "outline"}
            aria-label="مائل"
            title="مائل"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("underline") ? "secondary" : "outline"}
            aria-label="تسطير"
            title="تسطير"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("strike") ? "secondary" : "outline"}
            aria-label="يتوسطه خط"
            title="يتوسطه خط"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </Button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          <Button
            type="button"
            size="icon"
            variant={
              editor.isActive("heading", { level: 1 }) ? "secondary" : "outline"
            }
            aria-label="عنوان رئيسي"
            title="عنوان رئيسي"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={
              editor.isActive("heading", { level: 2 }) ? "secondary" : "outline"
            }
            aria-label="عنوان فرعي"
            title="عنوان فرعي"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bulletList") ? "secondary" : "outline"}
            aria-label="قائمة نقطية"
            title="قائمة نقطية"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("orderedList") ? "secondary" : "outline"}
            aria-label="قائمة مرقمة"
            title="قائمة مرقمة"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("blockquote") ? "secondary" : "outline"}
            aria-label="اقتباس"
            title="اقتباس"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="size-4" />
          </Button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="محاذاة لليمين"
            title="محاذاة لليمين"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="توسيط"
            title="توسيط"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="محاذاة لليسار"
            title="محاذاة لليسار"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="إدراج جدول"
            title="إدراج جدول"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Table2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="خط فاصل"
            title="خط فاصل"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="size-4" />
          </Button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="تراجع"
            title="تراجع"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="إعادة"
            title="إعادة"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="size-4" />
          </Button>
        </div>
      ) : null}
      {canRoundTrip ? (
        <EditorContent
          editor={editor}
          className="document-rich-editor-content px-1 py-2"
        />
      ) : (
        <div className="document-editor-copy document-rich-editor-fallback">
          {textFallback}
        </div>
      )}
    </div>
  );
}
