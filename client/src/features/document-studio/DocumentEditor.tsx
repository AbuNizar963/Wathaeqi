import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type EditorContentValue = Record<string, unknown>;

type DocumentEditorProps = {
  content: EditorContentValue;
  onChange: (content: EditorContentValue) => void;
  editable?: boolean;
  placeholder?: string;
};

function normalizeEditorContent(
  content: EditorContentValue
): string | EditorContentValue {
  if (content.type === "legacy-html" && typeof content.html === "string") {
    return content.html;
  }

  if (content.type === "legacy-text" && typeof content.text === "string") {
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: content.text }],
        },
      ],
    };
  }

  return content;
}

export default function DocumentEditor({
  content,
  onChange,
  editable = true,
  placeholder = "اكتب نص الوثيقة هنا...",
}: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({
        table: { resizable: true },
      }),
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
    ],
    content: normalizeEditorContent(content),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        dir: "rtl",
        lang: "ar",
        class:
          "min-h-[760px] px-[18mm] py-[16mm] text-right leading-8 text-slate-900 outline-none [&_p]:mb-3 [&_h1]:mb-5 [&_h1]:mt-7 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:my-3 [&_ol]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-400 [&_td]:p-2 [&_th]:border [&_th]:border-slate-500 [&_th]:bg-slate-100 [&_th]:p-2 [&_img]:mx-auto [&_img]:max-h-[120mm] [&_img]:object-contain",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as unknown as EditorContentValue);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);

    const nextContent = normalizeEditorContent(content);
    if (typeof nextContent === "string") {
      editor.commands.setContent(nextContent, { emitUpdate: false });
      onChange(editor.getJSON() as unknown as EditorContentValue);
      return;
    }

    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextContent)) {
      editor.commands.setContent(
        nextContent as Parameters<typeof editor.commands.setContent>[0],
        { emitUpdate: false }
      );
    }
  }, [content, editable, editor, onChange]);

  const disabled = !editor || !editable;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {editable ? (
        <div
          className="document-editor-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-slate-50 p-2"
          role="toolbar"
          aria-label="أدوات تنسيق الوثيقة"
        >
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("bold") ? "secondary" : "ghost"}
            aria-label="غامق"
            title="غامق"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("italic") ? "secondary" : "ghost"}
            aria-label="مائل"
            title="مائل"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("underline") ? "secondary" : "ghost"}
            aria-label="تحته خط"
            title="تحته خط"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
            aria-label="عنوان رئيسي"
            title="عنوان رئيسي"
            disabled={disabled}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
            aria-label="عنوان فرعي"
            title="عنوان فرعي"
            disabled={disabled}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("bulletList") ? "secondary" : "ghost"}
            aria-label="قائمة نقطية"
            title="قائمة نقطية"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive("orderedList") ? "secondary" : "ghost"}
            aria-label="قائمة مرقمة"
            title="قائمة مرقمة"
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive({ textAlign: "right" }) ? "secondary" : "ghost"}
            aria-label="محاذاة لليمين"
            title="محاذاة لليمين"
            disabled={disabled}
            onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive({ textAlign: "center" }) ? "secondary" : "ghost"}
            aria-label="توسيط"
            title="توسيط"
            disabled={disabled}
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive({ textAlign: "left" }) ? "secondary" : "ghost"}
            aria-label="محاذاة لليسار"
            title="محاذاة لليسار"
            disabled={disabled}
            onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor?.isActive({ textAlign: "justify" }) ? "secondary" : "ghost"}
            aria-label="ضبط النص"
            title="ضبط النص"
            disabled={disabled}
            onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="إدراج جدول"
            title="إدراج جدول"
            disabled={disabled}
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="تراجع"
            title="تراجع"
            disabled={disabled || !editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="إعادة"
            title="إعادة"
            disabled={disabled || !editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
