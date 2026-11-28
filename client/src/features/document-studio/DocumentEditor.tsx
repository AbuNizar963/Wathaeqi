import type { CSSProperties, ReactNode } from "react";
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
  textStyle?: CSSProperties;
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

function autoResizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  const resizeToContent = () => {
    textarea.style.height = "auto";
    const minHeight = Number.parseFloat(
      window.getComputedStyle(textarea).minHeight
    );
    textarea.style.height = `${Math.max(
      textarea.scrollHeight,
      Number.isFinite(minHeight) ? minHeight : 0
    )}px`;
    textarea.style.overflowY = "hidden";
  };
  const getLayoutStyle = () => {
    const style = window.getComputedStyle(textarea);
    return [
      style.fontFamily,
      style.fontSize,
      style.fontWeight,
      style.lineHeight,
      style.paddingBlock,
    ].join("|");
  };

  resizeToContent();
  textarea.addEventListener("input", resizeToContent);
  let previousWidth = textarea.clientWidth;
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          const width = textarea.clientWidth;
          if (width === previousWidth) return;
          previousWidth = width;
          resizeToContent();
        });
  resizeObserver?.observe(textarea.parentElement ?? textarea);

  let previousLayoutStyle = getLayoutStyle();
  const styleObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          const layoutStyle = getLayoutStyle();
          if (layoutStyle === previousLayoutStyle) return;
          previousLayoutStyle = layoutStyle;
          resizeToContent();
        });
  styleObserver?.observe(textarea, {
    attributes: true,
    attributeFilter: ["style"],
  });

  return () => {
    textarea.removeEventListener("input", resizeToContent);
    resizeObserver?.disconnect();
    styleObserver?.disconnect();
  };
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
            lineHeight === "loose" ? 2.25 : lineHeight === "relaxed" ? 2 : 2,
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
  placeholder = "اكتب المحتوى هنا...",
  containerClassName = "",
  textStyle,
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
          ref={autoResizeTextarea}
          value={text}
          onChange={event =>
            onChange(updatePlainTextDocument(content, event.target.value))
          }
          placeholder={placeholder}
          aria-label="نص الوثيقة"
          className="document-editor-input min-h-[570px] resize-none overflow-hidden rounded-none border-0 bg-transparent p-3 text-right text-[16px] leading-[2] shadow-none focus-visible:ring-0"
          style={textStyle}
        />
      ) : null}
      <div
        className={`document-editor-copy p-3 text-right text-[16px] leading-[2] ${canEditText ? "document-editor-print-copy" : ""}`}
        style={textStyle}
        aria-hidden={canEditText ? true : undefined}
      >
        {content.type === "doc" ? previewParagraphs(content) : text}
      </div>
    </div>
  );
}
