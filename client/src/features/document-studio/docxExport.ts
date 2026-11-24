import JSZip from "jszip";

export type OfficialDocumentWordInput = {
  title: string;
  subject: string;
  serialCode: string;
  documentDate: string;
  content: Record<string, unknown>;
};

type EditorNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string }>;
  content?: EditorNode[];
};

const WORD_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isEditorNode(value: unknown): value is EditorNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function childrenOf(node: EditorNode): EditorNode[] {
  return Array.isArray(node.content) ? node.content.filter(isEditorNode) : [];
}

function runXml(node: EditorNode): string {
  if (node.type === "hardBreak") {
    return "<w:r><w:br/></w:r>";
  }

  if (typeof node.text !== "string") {
    return childrenOf(node).map(runXml).join("");
  }

  const marks = new Set((node.marks ?? []).map(mark => mark.type));
  const properties = [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
    "<w:rtl/>",
    marks.has("bold") ? "<w:b/><w:bCs/>" : "",
    marks.has("italic") ? "<w:i/><w:iCs/>" : "",
    marks.has("underline") ? '<w:u w:val="single"/>' : "",
    marks.has("strike") ? "<w:strike/>" : "",
  ].join("");

  return (
    `<w:r><w:rPr>${properties}</w:rPr>` +
    `<w:t xml:space="preserve">${xml(node.text)}</w:t></w:r>`
  );
}

function paragraphXml(
  nodes: EditorNode[],
  options: { style?: string; prefix?: string; align?: string } = {}
): string {
  const paragraphProperties = [
    options.style
      ? `<w:pStyle w:val="${options.style}"/>`
      : "",
    "<w:bidi/>",
    '<w:spacing w:after="160" w:line="360" w:lineRule="auto"/>',
    `<w:jc w:val="${options.align ?? "right"}"/>`,
  ].join("");

  const prefix = options.prefix
    ? `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xml(options.prefix)}</w:t></w:r>`
    : "";

  return (
    `<w:p><w:pPr>${paragraphProperties}</w:pPr>` +
    `${prefix}${nodes.map(runXml).join("")}</w:p>`
  );
}

function tableXml(node: EditorNode): string {
  const rows = childrenOf(node)
    .filter(row => row.type === "tableRow")
    .map(row => {
      const cells = childrenOf(row)
        .filter(
          cell =>
            cell.type === "tableCell" || cell.type === "tableHeader"
        )
        .map(cell => {
          const blocks = childrenOf(cell);
          const paragraphs = blocks.length
            ? blocks.map(block => blockXml(block)).join("")
            : paragraphXml([]);

          return (
            '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>' +
            `</w:tcPr>${paragraphs}</w:tc>`
          );
        })
        .join("");

      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return `<w:tbl>
<w:tblPr>
<w:tblW w:w="0" w:type="auto"/>
<w:bidiVisual/>
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="B7B7B7"/>
<w:left w:val="single" w:sz="4" w:color="B7B7B7"/>
<w:bottom w:val="single" w:sz="4" w:color="B7B7B7"/>
<w:right w:val="single" w:sz="4" w:color="B7B7B7"/>
<w:insideH w:val="single" w:sz="4" w:color="B7B7B7"/>
<w:insideV w:val="single" w:sz="4" w:color="B7B7B7"/>
</w:tblBorders>
</w:tblPr>${rows}</w:tbl>`;
}

function blockXml(node: EditorNode): string {
  const children = childrenOf(node);

  switch (node.type) {
    case "paragraph":
      return paragraphXml(children);

    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const style =
        level >= 3 ? "Heading3" : level === 2 ? "Heading2" : "Heading1";

      return paragraphXml(children, { style });
    }

    case "bulletList":
    case "orderedList": {
      let index = Number(node.attrs?.start ?? 1);

      return children
        .filter(item => item.type === "listItem")
        .map(item => {
          const itemBlocks = childrenOf(item);
          const first = itemBlocks[0];
          const rest = itemBlocks.slice(1).map(blockXml).join("");
          const prefix =
            node.type === "bulletList" ? "•  " : `${index++}.  `;
          const firstBlock =
            first?.type === "paragraph"
              ? paragraphXml(childrenOf(first), { prefix })
              : paragraphXml(itemBlocks, { prefix });

          return firstBlock + rest;
        })
        .join("");
    }

    case "blockquote":
      return children.map(blockXml).join("");

    case "table":
      return tableXml(node);

    case "horizontalRule":
      return paragraphXml(
        [{ text: "ــــــــــــــــــــــــــــــــــــــــ" }],
        { align: "center" }
      );

    default:
      return children.length
        ? children.map(blockXml).join("")
        : "";
  }
}

function documentBody(input: OfficialDocumentWordInput): string {
  const metadata = [
    paragraphXml(
      [{ text: input.title }],
      { style: "Title", align: "center" }
    ),
    input.serialCode
      ? paragraphXml([{ text: `الرقم: ${input.serialCode}` }])
      : "",
    input.documentDate
      ? paragraphXml([{ text: `التاريخ: ${input.documentDate}` }])
      : "",
    input.subject
      ? paragraphXml([{ text: `الموضوع: ${input.subject}` }])
      : "",
    '<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>',
  ].join("");

  const root = isEditorNode(input.content) ? input.content : {};
  const body = childrenOf(root).map(blockXml).join("");

  return metadata + body;
}

/**
 * Builds an editable DOCX from the saved editor snapshot. Imported binary
 * attachments are deliberately handled by their original-file download path.
 */
export async function buildOfficialDocumentDocx(
  input: OfficialDocumentWordInput
): Promise<Blob> {
  const zip = new JSZip();
  const body = documentBody(input);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}
<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="360" w:footer="360" w:gutter="0"/>
<w:bidi/>
</w:sectPr>
</w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault>
<w:rPr>
<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
<w:sz w:val="24"/>
<w:szCs w:val="24"/>
<w:lang w:val="ar-SA" w:bidi="ar-SA"/>
</w:rPr>
</w:rPrDefault>
<w:pPrDefault>
<w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>
</w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
<w:name w:val="Normal"/>
</w:style>
<w:style w:type="paragraph" w:styleId="Title">
<w:name w:val="Title"/>
<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
<w:name w:val="heading 1"/>
<w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2">
<w:name w:val="heading 2"/>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3">
<w:name w:val="heading 3"/>
<w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
</w:style>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const packageRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.folder("_rels")!.file(".rels", packageRelationshipsXml);
  zip.folder("word")!.file("document.xml", documentXml);
  zip.folder("word")!.file("styles.xml", stylesXml);
  zip
    .folder("word")!
    .folder("_rels")!
    .file("document.xml.rels", documentRelationshipsXml);

  const bytes = await zip.generateAsync({ type: "arraybuffer" });

  return new Blob([bytes], { type: WORD_MIME });
}

export const OFFICIAL_DOCUMENT_WORD_MIME = WORD_MIME;
