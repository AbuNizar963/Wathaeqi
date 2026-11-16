import { Node, mergeAttributes } from "@tiptap/core";

/**
 * An explicit page boundary for long official documents.
 * The node remains part of the TipTap document JSON and is preserved in HTML.
 */
export const PageBreak = Node.create({
  name: "pageBreak",

  group: "block",

  atom: true,

  selectable: true,

  draggable: false,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "true",
        class: "document-page-break",
        contenteditable: "false",
      }),
      [
        "span",
        { class: "document-page-break-label", "aria-hidden": "true" },
        "فاصل صفحة",
      ],
    ];
  },
});
