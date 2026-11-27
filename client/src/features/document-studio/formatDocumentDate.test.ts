import { describe, expect, it } from "vitest";
import { formatDocumentDate } from "./formatDocumentDate";

describe("formatDocumentDate", () => {
  it("formats year-first numeric dates with the selected separators", () => {
    expect(formatDocumentDate("2026-11-25T12:00:00.000Z", "yyyy/MM/dd")).toBe(
      "2026/11/25"
    );
    expect(formatDocumentDate("2026-11-25T12:00:00.000Z", "dd.MM.yyyy")).toBe(
      "25.11.2026"
    );
  });

  it("supports Arabic month names and month-first order", () => {
    expect(formatDocumentDate("2026-11-25T12:00:00.000Z", "d MMMM yyyy")).toBe(
      "25 نوفمبر 2026"
    );
    expect(formatDocumentDate("2026-11-25T12:00:00.000Z", "MMMM d, yyyy")).toBe(
      "نوفمبر 25, 2026"
    );
  });

  it("shows Gregorian and Umm al-Qura Hijri dates together", () => {
    expect(
      formatDocumentDate("2026-11-25T12:00:00.000Z", "both:yyyy/MM/dd")
    ).toBe("2026/11/25 م — 1448/06/15 هـ");
    expect(
      formatDocumentDate("2026-11-25T12:00:00.000Z", "both:dd/MM/yyyy")
    ).toBe("25/11/2026 م — 15/06/1448 هـ");
    expect(
      formatDocumentDate("2026-11-25T12:00:00.000Z", "both:d MMMM yyyy")
    ).toBe("25 نوفمبر 2026 م — 15 جمادى الآخرة 1448 هـ");
  });

  it("returns an invalid input unchanged", () => {
    expect(formatDocumentDate("not-a-date")).toBe("not-a-date");
  });
});
