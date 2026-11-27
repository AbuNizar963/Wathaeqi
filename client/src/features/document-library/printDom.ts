import {
  throwIfAborted,
  type DocumentOperationOptions,
} from "../document-progress/documentProgress";

export const PRINT_ROOT_ID = "wathaeqi-print-root";
let activeCleanup: (() => void) | undefined;

/** Scope generated document styles so .grid/.cell/body never alter the app. */
export function scopePrintCss(css: string): string {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const scope = `#${PRINT_ROOT_ID}`;
  function serialize(rules: CSSRuleList): string {
    return Array.from(rules)
      .map(rule => {
        if (rule instanceof CSSStyleRule) {
          const selectors = rule.selectorText
            .split(",")
            .map(selector => {
              const normalized = selector
                .trim()
                .replace(/^(?:html|body)(?=\b)/, scope);
              return normalized.startsWith(scope)
                ? normalized
                : `${scope} ${normalized}`;
            })
            .join(", ");
          return `${selectors}{${rule.style.cssText}}`;
        }
        if (rule instanceof CSSMediaRule)
          return `@media ${rule.conditionText}{${serialize(rule.cssRules)}}`;
        if (rule instanceof CSSPageRule) return rule.cssText;
        if (rule instanceof CSSFontFaceRule) return rule.cssText;
        return "";
      })
      .join("\n");
  }
  return serialize(sheet.cssRules);
}

export function createPrintRoot(title: string, css = "", widthMm = 210) {
  if (activeCleanup)
    throw new Error("واجهة طباعة أخرى قيد التجهيز أو العرض؛ أغلقها أولاً");
  const root = document.createElement("div");
  root.id = PRINT_ROOT_ID;
  root.dir = "rtl";
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = `position:absolute;left:-100000px;top:0;width:${widthMm}mm;min-height:297mm;background:#fff;color:#0f172a;direction:rtl;`;
  const style = document.createElement("style");
  style.dataset.wathaeqiPrint = "true";
  style.textContent = `${scopePrintCss(css)}
    @media print {
      html, body { width:${widthMm}mm!important; min-width:${widthMm}mm!important; margin:0!important; padding:0!important; height:auto!important; overflow:visible!important; background:#fff!important; }
      body > *:not(#${PRINT_ROOT_ID}) { display:none!important; }
      #${PRINT_ROOT_ID} { position:static!important; inset:auto!important; display:block!important; width:${widthMm}mm!important; max-width:none!important; height:auto!important; min-height:0!important; margin:0!important; padding:0!important; overflow:visible!important; background:#fff!important; }
      #${PRINT_ROOT_ID}, #${PRINT_ROOT_ID} * { visibility:visible!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    }`;
  const previousTitle = document.title;
  const releases = new Set<() => void>();
  let disposed = false;
  const media = window.matchMedia("print");
  let printMediaSeen = false;
  let lostFocus = false;
  const invoked = () => root.dataset.printInvoked === "true";
  const mediaChanged = (event: MediaQueryListEvent) => {
    if (!invoked()) return;
    if (event.matches) printMediaSeen = true;
    else if (printMediaSeen) cleanup();
  };
  const blurred = () => {
    if (invoked()) lostFocus = true;
  };
  const focused = () => {
    if (invoked() && lostFocus && !media.matches) cleanup();
  };
  const visibilityChanged = () => {
    if (!invoked()) return;
    if (document.visibilityState === "hidden") lostFocus = true;
    else focused();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("afterprint", cleanup);
    window.removeEventListener("pagehide", cleanup);
    media.removeEventListener("change", mediaChanged);
    window.removeEventListener("blur", blurred);
    window.removeEventListener("focus", focused);
    document.removeEventListener("visibilitychange", visibilityChanged);
    style.remove();
    root.remove();
    document.title = previousTitle;
    for (const release of releases) release();
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  activeCleanup = cleanup;
  document.head.append(style);
  document.body.append(root);
  document.title = title;
  window.addEventListener("afterprint", cleanup, { once: true });
  window.addEventListener("pagehide", cleanup, { once: true });
  media.addEventListener("change", mediaChanged);
  window.addEventListener("blur", blurred);
  window.addEventListener("focus", focused);
  document.addEventListener("visibilitychange", visibilityChanged);
  return {
    root,
    cleanup,
    addCleanup: (release: () => void) => releases.add(release),
  };
}

export async function waitForPrintAssets(
  root: HTMLElement,
  options: DocumentOperationOptions = {}
): Promise<void> {
  throwIfAborted(options.signal);
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(async image => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            image.removeEventListener("load", loaded);
            image.removeEventListener("error", failed);
            options.signal?.removeEventListener("abort", aborted);
            error ? reject(error) : resolve();
          };
          const loaded = () => finish();
          const failed = () =>
            finish(new Error("تعذر تحميل صورة مطلوبة للطباعة"));
          const aborted = () =>
            finish(new DOMException("تم إلغاء تجهيز الطباعة", "AbortError"));
          image.addEventListener("load", loaded, { once: true });
          image.addEventListener("error", failed, { once: true });
          options.signal?.addEventListener("abort", aborted, { once: true });
          if (options.signal?.aborted) aborted();
          else if (image.complete) loaded();
        });
      }
      if (image.naturalWidth <= 0)
        throw new Error("صورة الطباعة تالفة أو غير متاحة");
      await image.decode?.();
    })
  );
  await document.fonts?.ready;
  throwIfAborted(options.signal);
  await new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  throwIfAborted(options.signal);
}

/** Browser APIs cannot tell successful printing from user cancellation. */
export async function invokePagePrint(
  root: HTMLElement,
  options: DocumentOperationOptions = {}
): Promise<void> {
  options.onProgress?.({
    phase: "preparation",
    message: "جارٍ تحميل صور وخطوط الطباعة…",
    stagePercent: 90,
  });
  await waitForPrintAssets(root, options);
  options.onProgress?.({
    phase: "ready",
    message: "اكتمل تجهيز جميع صفحات الطباعة",
  });
  throwIfAborted(options.signal);
  options.onProgress?.({
    phase: "print-dialog",
    message:
      "جارٍ عرض خيارات الطباعة؛ لا يمكن تأكيد الطباعة أو الإلغاء من المتصفح",
  });
  root.dataset.printInvoked = "true";
  window.print();
}
