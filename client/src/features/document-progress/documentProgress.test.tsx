import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentOperationProgress from "./DocumentOperationProgress";
import { measuredProgress } from "./documentProgress";

describe("document progress", () => {
  it("measures only completed bytes or pages when a real total is known", () => {
    expect(measuredProgress("transfer", "نقل", 40, 100)).toMatchObject({
      percent: 40,
      total: 100,
      loaded: 40,
    });
    expect(measuredProgress("render", "صفحات", 2, 8).percent).toBe(25);
    expect(measuredProgress("transfer", "نقل", 40).percent).toBeUndefined();
    expect(
      measuredProgress("transfer", "نقل", 40, NaN).percent
    ).toBeUndefined();
    expect(measuredProgress("transfer", "نقل", 40, 0).percent).toBeUndefined();
    expect(measuredProgress("transfer", "نقل", 101, 100).percent).toBe(100);
  });
  it("exposes measured progress with RTL, ARIA and reduced-motion styling", () => {
    const html = renderToStaticMarkup(
      <DocumentOperationProgress
        progress={measuredProgress("transfer", "تنزيل", 40, 100)}
      />
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="26"');
    expect(html).toContain("البيانات المنقولة فعلياً: 40%");
    expect(html).toContain("motion-reduce:transition-none");
  });
  it("labels stage percentages explicitly, without pretending to measure time or printer success", () => {
    const html = renderToStaticMarkup(
      <DocumentOperationProgress
        progress={{ phase: "render", message: "جارٍ الرسم" }}
      />
    );
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("نسبة مراحل التجهيز");
    expect(html).toContain("لا تقدير للوقت ولا تأكيد للطباعة أو الحفظ");
    expect(
      renderToStaticMarkup(<DocumentOperationProgress progress={null} />)
    ).toBe("");
  });
});
