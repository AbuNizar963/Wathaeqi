import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";

type EditorContentValue = Record<string, unknown>;

type DocumentEditorProps = {
  content: EditorContentValue;
  onChange: (content: EditorContentValue) => void;
  editable?: boolean;
  placeholder?: string;
  containerClassName?: string;
};

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectText).join("");
  if (!value || typeof value !== "object") return "";

  const node = value as Record<string, unknown>;
  if (node.type === "legacy-text" && typeof node.text === "string") {
    return node.text;
  }
  if (node.type === "legacy-html" && typeof node.html === "string") {
    return node.html
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }

  const children = Array.isArray(node.content) ? node.content : [];
  return children
    .map(child => {
      const text = collectText(child);
      const childType =
        child && typeof child === "object"
          ? (child as Record<string, unknown>).type
          : undefined;
      return ["paragraph", "heading", "listItem"].includes(String(childType))
        ? `${text}\n`
        : text;
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "");
}

export default function DocumentEditor({
  content,
  onChange,
  editable = true,
  placeholder = "اكتب نص الوثيقة هنا...",
  containerClassName = "",
}: DocumentEditorProps) {
  const text = useMemo(() => collectText(content), [content]);

  return (
    <div
      className={`document-plain-editor overflow-hidden rounded-xl border
        border-slate-200 bg-white ${containerClassName}`}
      dir="rtl"
    >
      <Textarea
        value={text}
        onChange={event =>
          onChange({ type: "legacy-text", text: event.target.value })
        }
        readOnly={!editable}
        placeholder={placeholder}
        aria-label="نص الوثيقة"
        className="min-h-[760px] resize-y rounded-none border-0 bg-transparent
          px-[18mm] py-[16mm] text-right text-[15px] leading-8 text-slate-900
          shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
