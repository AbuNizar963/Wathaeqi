import { describe, expect, it } from "vitest";
import { parseSavedDocumentViews, savedDocumentViewsKey } from "./savedViews";

describe("saved document views", () => {
  it("scopes saved searches to the signed-in user", () => {
    expect(savedDocumentViewsKey(7)).toBe("wathaeqi:saved-document-views:7");
    expect(savedDocumentViewsKey("8")).not.toBe(savedDocumentViewsKey(7));
  });

  it("accepts valid saved filters and ignores malformed storage", () => {
    const views = [
      {
        id: "v1",
        name: "بانتظار الاعتماد",
        search: "تقرير",
        category: "report",
        status: "issued",
      },
    ];
    expect(parseSavedDocumentViews(JSON.stringify(views))).toEqual(views);
    expect(parseSavedDocumentViews("invalid")).toEqual([]);
    expect(parseSavedDocumentViews(JSON.stringify([{ id: 1 }]))).toEqual([]);
  });

  it("limits corrupted or oversized storage to thirty views", () => {
    const views = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      name: `عرض ${index}`,
      search: "",
      category: "",
      status: "",
    }));
    expect(parseSavedDocumentViews(JSON.stringify(views))).toHaveLength(30);
  });
});
