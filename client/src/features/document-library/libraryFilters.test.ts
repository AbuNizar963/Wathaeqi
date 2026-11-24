import { describe, expect, it } from "vitest";
import type { OfficialDocument } from "../../../../shared/documentStudio";
import { filterAndSortDocuments } from "./libraryFilters";

function document(
  id: string,
  title: string,
  status: OfficialDocument["status"],
  updatedAt: string,
  category = "general"
): OfficialDocument {
  return {
    id, ownerId: "owner", organizationId: null, templateId: null,
    templateRevision: null, templateFieldsSnapshot: [], title, category,
    subject: "موضوع تجريبي", content: {}, fieldValues: {}, serialNumber: 1,
    serialCode: `DOC-${id}`, documentDate: updatedAt, status, file: null,
    createdAt: updatedAt, updatedAt, issuedAt: null, archivedAt: null,
  };
}

const documents = [
  document("1", "تقرير ألف", "draft", "2026-01-01T00:00:00.000Z"),
  document("2", "تقرير باء", "issued", "2026-02-01T00:00:00.000Z"),
  document("3", "محضر", "archived", "2026-03-01T00:00:00.000Z"),
];

describe("document library filters", () => {
  it("filters by status, category, and searchable serial code", () => {
    expect(filterAndSortDocuments(documents, { status: "issued" }).map(item => item.id)).toEqual(["2"]);
    expect(filterAndSortDocuments(documents, { category: "personnel" })).toEqual([]);
    expect(filterAndSortDocuments(documents, { search: "DOC-3" }).map(item => item.id)).toEqual(["3"]);
  });

  it("sorts newest, oldest, and Arabic title without mutating the source", () => {
    expect(filterAndSortDocuments(documents).map(item => item.id)).toEqual(["3", "2", "1"]);
    expect(filterAndSortDocuments(documents, { sort: "updated-asc" }).map(item => item.id)).toEqual(["1", "2", "3"]);
    expect(filterAndSortDocuments(documents, { sort: "title-asc" }).map(item => item.id)).toEqual(["3", "1", "2"]);
    expect(documents.map(item => item.id)).toEqual(["1", "2", "3"]);
  });
});
