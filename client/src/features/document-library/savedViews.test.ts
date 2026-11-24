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
        sort: "updated-desc",
      },
    ];
    expect(parseSavedDocumentViews(JSON.stringify(views))).toEqual(views);
    expect(parseSavedDocumentViews("invalid")).toEqual([]);
    expect(parseSavedDocumentViews(JSON.stringify([{ id: 1 }]))).toEqual([]);
  });

  it("upgrades search-only views from the legacy format", () => {
    const legacy = [
      {
        id: "legacy",
        name: "بحث قديم",
        search: "عقد",
        category: "general",
      },
    ];

    expect(parseSavedDocumentViews(JSON.stringify(legacy))).toEqual([
      {
        ...legacy[0],
        status: "all",
        sort: "updated-desc",
      },
    ]);
  });

  it("defaults a missing sort while preserving a previously saved status", () => {
    const legacy = [
      {
        id: "legacy-status",
        name: "بحث سابق",
        search: "تعميم",
        category: "general",
        status: "issued",
      },
    ];

    expect(parseSavedDocumentViews(JSON.stringify(legacy))).toEqual([
      {
        ...legacy[0],
        sort: "updated-desc",
      },
    ]);
  });

  it("normalizes unknown status and sort values safely", () => {
    const invalid = [
      {
        id: "invalid",
        name: "عرض غير صالح",
        search: "",
        category: "",
        status: "unknown",
        sort: "unknown",
      },
    ];

    expect(parseSavedDocumentViews(JSON.stringify(invalid))).toEqual([
      {
        ...invalid[0],
        status: "all",
        sort: "updated-desc",
      },
    ]);
  });

  it("limits corrupted or oversized storage to thirty views", () => {
    const views = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      name: `عرض ${index}`,
      search: "",
      category: "",
      status: "all",
      sort: "updated-desc",
    }));

    expect(parseSavedDocumentViews(JSON.stringify(views))).toHaveLength(30);
  });
});
