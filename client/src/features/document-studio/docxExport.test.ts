import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildOfficialDocumentDocx } from "./docxExport";

describe("official document DOCX export", () => {
  it("creates a valid editable Word package with Arabic RTL content", async () => {
    const blob = await buildOfficialDocumentDocx({
      title: "كتاب رسمي",
      subject: "طلب تزويد",
      serialCode: "ص/١٢/٢٠٢٦",
      documentDate: "24 نوفمبر 2026",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "يرجى التفضل " },
              {
                type: "text",
                text: "بالاطلاع",
                marks: [{ type: "bold" }],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "التفاصيل" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "البند الأول" }],
                  },
                ],
              },
            ],
          },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "الجهة" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")!.async("text");
    const stylesXml = await zip.file("word/styles.xml")!.async("text");

    expect(documentXml).toContain("w:bidi");
    expect(documentXml).toContain("بالاطلاع");
    expect(documentXml).toContain("الرقم: ص/١٢/٢٠٢٦");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("•");
    expect(stylesXml).toContain('w:val="ar-SA"');
  });

  it("escapes text instead of allowing it to become Word markup", async () => {
    const blob = await buildOfficialDocumentDocx({
      title: "اختبار",
      subject: "",
      serialCode: "",
      documentDate: "",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "<w:del>نص & آمن</w:del>" }],
          },
        ],
      },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")!.async("text");
    expect(documentXml).toContain("&lt;w:del&gt;نص &amp; آمن&lt;/w:del&gt;");
    expect(documentXml).not.toContain("<w:del>");
  });
});
