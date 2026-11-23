import React from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  List,
  Type,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  editablePlainText,
  formatPlainTextParagraph,
  type ParagraphFormatting,
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

function previewParagraphs(content: EditorContentValue): React.ReactNode {
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

function FormatButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="sm"
      className="h-9 min-w-9 shrink-0 gap-1 px-2 text-xs"
      aria-label={label}
      title={label}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
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
  const textareaRef = { current: null as HTMLTextAreaElement | null };
  const cursorPositionRef = { current: 0 };
  const currentParagraph = Math.max(
    0,
    text.slice(0, cursorPositionRef.current).split("\n").length - 1
  );

  function applyFormatting(formatting: ParagraphFormatting) {
    if (!canEditText) return;
    onChange(
      formatPlainTextParagraph(
        content,
        text,
        cursorPositionRef.current,
        formatting
      )
    );
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function insertBullet() {
    if (!canEditText) return;
    const lines = text.split("\n");
    const paragraph = Math.min(
      lines.length - 1,
      Math.max(
        0,
        text.slice(0, cursorPositionRef.current).split("\n").length - 1
      )
    );
    if (!lines[paragraph]?.startsWith("• "))
      lines[paragraph] = `• ${lines[paragraph] ?? ""}`;
    const nextText = lines.join("\n");
    onChange(updatePlainTextDocument(content, nextText));
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

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
        <div
          className="document-editor-mobile-toolbar document-studio-no-print flex gap-1 overflow-x-auto border-b bg-slate-50/80 p-2"
          role="toolbar"
          aria-label="تنسيق الفقرة"
        >
          <FormatButton
            label="محاذاة يمين"
            active={contentHasAlign(content, currentParagraph, "right")}
            onClick={() => applyFormatting({ textAlign: "right" })}
          >
            <AlignRight className="size-4" />
          </FormatButton>
          <FormatButton
            label="توسيط"
            active={contentHasAlign(content, currentParagraph, "center")}
            onClick={() => applyFormatting({ textAlign: "center" })}
          >
            <AlignCenter className="size-4" />
          </FormatButton>
          <FormatButton
            label="محاذاة يسار"
            active={contentHasAlign(content, currentParagraph, "left")}
            onClick={() => applyFormatting({ textAlign: "left" })}
          >
            <AlignLeft className="size-4" />
          </FormatButton>
          <FormatButton
            label="ضبط النص"
            active={contentHasAlign(content, currentParagraph, "justify")}
            onClick={() => applyFormatting({ textAlign: "justify" })}
          >
            <AlignJustify className="size-4" />
          </FormatButton>
          <FormatButton
            label="عنوان الفقرة"
            onClick={() => applyFormatting({ blockType: "heading" })}
          >
            <Type className="size-4" />
            <span>عنوان</span>
          </FormatButton>
          <FormatButton label="قائمة نقطية" onClick={insertBullet}>
            <List className="size-4" />
          </FormatButton>
          <select
            aria-label="تباعد الأسطر"
            value={contentParagraphLineHeight(content, currentParagraph)}
            onChange={event =>
              applyFormatting({
                lineHeight: event.target
                  .value as ParagraphFormatting["lineHeight"],
              })
            }
            className="h-9 shrink-0 rounded-md border bg-background px-2 text-xs"
          >
            <option value="normal">عادي</option>
            <option value="relaxed">مريح</option>
            <option value="loose">واسع</option>
          </select>
        </div>
      ) : null}
      {canEditText ? (
        <Textarea
          ref={textareaRef}
          value={text}
          onSelect={event => {
            cursorPositionRef.current = event.currentTarget.selectionStart;
          }}
          onClick={event => {
            cursorPositionRef.current = event.currentTarget.selectionStart;
          }}
          onKeyUp={event => {
            cursorPositionRef.current = event.currentTarget.selectionStart;
          }}
          onChange={event => {
            cursorPositionRef.current =
              (event.target as HTMLTextAreaElement).selectionStart ?? 0;
            onChange(updatePlainTextDocument(content, event.target.value));
          }}
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

function contentHasAlign(
  content: EditorContentValue,
  paragraphIndex: number,
  align: string
): boolean {
  if (content.type !== "doc" || !Array.isArray(content.content))
    return align === "right";
  const node = content.content[paragraphIndex] as
    Record<string, unknown> | undefined;
  const attrs = node?.attrs as Record<string, unknown> | undefined;
  return String(attrs?.textAlign ?? "right") === align;
}

function contentParagraphLineHeight(
  content: EditorContentValue,
  paragraphIndex: number
): string {
  if (content.type !== "doc" || !Array.isArray(content.content))
    return "normal";
  const node = content.content[paragraphIndex] as
    Record<string, unknown> | undefined;
  const attrs = node?.attrs as Record<string, unknown> | undefined;
  return String(attrs?.lineHeight ?? "normal");
}
