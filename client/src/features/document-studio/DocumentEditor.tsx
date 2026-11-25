import type { ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  editablePlainText,
  updatePlainTextDocument,
} from "./documentEditorContent";

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
  if (node.type === "legacy-text" && typeof node.text === "string")
    return node.text;
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
  if (node.type === "text" && typeof node.text === "string") return node.text;
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
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "");
}

function paragraphText(node: Record<string, unknown>): string {
  return collectText(node).replace(/\n+$/g, "");
}

function previewParagraphs(content: EditorContentValue): ReactNode {
  if (content.type !== "doc" || !Array.isArray(content.content)) return null;
  return content.content.map((rawNode, index) => {
    const node = rawNode as Record<string, unknown>;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const align = String(attrs.textAlign ?? "right");
    const lineHeight = String(attrs.lineHeight ?? "normal");
    const isHeading = attrs.blockType === "heading";
    return (
      <div
        key={index}
        className={
          isHeading
            ? "document-paragraph document-paragraph-heading"
            : "document-paragraph"
        }
        style={{
          textAlign: align as "right" | "center" | "left" | "justify",
          lineHeight:
            lineHeight === "loose" ? 2.25 : lineHeight === "relaxed" ? 2 : 1.85,
        }}
      >
        {isHeading ? (
          <strong>{paragraphText(node) || "\u00a0"}</strong>
        ) : (
          paragraphText(node) || "\u00a0"
        )}
      </div>
    );
  });
}

export default function DocumentEditor({
  content,
  onChange,
  editable = true,
  placeholder = "اكتب نص الوثيقة هنا...",
  containerClassName = "",
}: DocumentEditorProps) {
  const plainText = editablePlainText(content);
  const canEditText = editable && plainText !== null;
  const text = plainText ?? collectText(content);

  return (
    <div
      className={`document-plain-editor rounded-xl border border-slate-200 bg-transparent ${containerClassName}`}
      dir="rtl"
    >
      {editable && !canEditText ? (
        <p
          role="status"
          className="document-editor-warning mb-3 text-sm text-amber-800"
        >
          هذا المحتوى يتضمن تنسيقاً أو بيانات لا يدعم تحريرها المحرر النصي.
          تُعرض معاينة نصية فقط، ويبقى المحتوى الأصلي دون تحويله.
        </p>
      ) : null}
      {canEditText ? (
        <Textarea
          value={text}
          onChange={event =>
            onChange(updatePlainTextDocument(content, event.target.value))
          }
          placeholder={placeholder}
          aria-label="نص الوثيقة"
          className="document-editor-input min-h-[570px] resize-y rounded-none border-0 bg-transparent p-3 text-right text-[15px] leading-8 text-slate-900 shadow-none focus-visible:ring-0"
        />
      ) : null}
      <div
        className={`document-editor-copy text-right text-[15px] text-slate-900 ${canEditText ? "document-editor-print-copy" : ""}`}
        aria-hidden={canEditText ? true : undefined}
      >
        {content.type === "doc" ? previewParagraphs(content) : text}
      </div>
    </div>
  );
}
