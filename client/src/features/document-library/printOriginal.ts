import { DEFAULT_SHOW_CUT_MARKS, fileKind } from "./types";
import type { PagesPerSheet, PrintLayoutMode, PrintOrientation } from "./types";
import { normalizeCutMarginMm } from "./types";
import {
  createCutMarksMarkup,
  openPrintWindow,
  PRINT_CUT_MARKS_CSS,
} from "./printSheets";
import {
  createPrintRoot,
  invokePagePrint,
  scopePrintCss,
  waitForPrintAssets,
} from "./printDom";
import { fetchDocumentBlob } from "../document-progress/documentTransfer";
import {
  measuredProgress,
  throwIfAborted,
  type DocumentOperationOptions,
} from "../document-progress/documentProgress";
import { canvasToPngObjectUrl, getBoundedPixelRatio } from "./renderQuality";
import { normalizeDocxLayout } from "./normalizeDocxImages";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export async function openOriginalPrintWindow(
  options: {
    url: string;
    fileName: string;
    mimeType: string;
    pagesPerSheet?: PagesPerSheet;
    layoutMode?: PrintLayoutMode;
    copiesPerSheet?: PagesPerSheet;
    orientation?: PrintOrientation;
    marginMm?: number;
    cutMarginMm?: number;
    showPageNumbers?: boolean;
    showCutMarks?: boolean;
    imageTiles?: 1 | 4 | 9 | 16;
    resolveUrl?: () => Promise<string>;
  } & DocumentOperationOptions
): Promise<void> {
  const kind = fileKind(options.fileName, options.mimeType);
  if (kind !== "pdf" && kind !== "word" && kind !== "image") {
    throw new Error("صيغة الملف غير مدعومة للطباعة");
  }

  throwIfAborted(options.signal);
  options.onProgress?.({
    phase: "preparation",
    message: "جارٍ التحقق من رابط الطباعة والصلاحيات…",
  });
  let wordSession: ReturnType<typeof createPrintRoot> | undefined;
  const printImageUrls: string[] = [];
  const layoutOptions = {
    pagesPerSheet: options.pagesPerSheet ?? 1,
    layoutMode: options.layoutMode ?? "sequential",
    copiesPerSheet: options.copiesPerSheet ?? 1,
    orientation: options.orientation ?? "portrait",
    marginMm: options.marginMm ?? 0,
    cutMarginMm: normalizeCutMarginMm(options.cutMarginMm),
    headerText: "",
    footerText: "",
    showPageNumbers: options.showPageNumbers ?? false,
    showCutMarks: options.showCutMarks ?? DEFAULT_SHOW_CUT_MARKS,
  };
  try {
    // Refresh the short-lived URL without creating a popup or changing auth.
    const url = options.resolveUrl ? await options.resolveUrl() : options.url;
    throwIfAborted(options.signal);
    const fileBlob = await fetchDocumentBlob(url, options.fileName, options);

    if (kind === "image") {
      try {
        const imageUrl = URL.createObjectURL(fileBlob);
        printImageUrls.push(imageUrl);
        const image = new Image();
        image.src = imageUrl;
        options.onProgress?.({
          phase: "render",
          message: "جارٍ فك ترميز الصورة للطباعة…",
        });
        await image.decode();
        throwIfAborted(options.signal);
        const tileCount = options.imageTiles ?? 1;
        if (tileCount === 1) {
          await openPrintWindow(
            {
              pages: [
                {
                  src: imageUrl,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                },
              ],
              options: { ...layoutOptions, pagesPerSheet: 1 },
              title: `طباعة ${options.fileName}`,
              onProgress: options.onProgress,
              signal: options.signal,
            },
            window
          );
          return;
        }
        const canvas = window.document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("تعذر تجهيز الصورة للطباعة");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(imageUrl);
        printImageUrls.splice(printImageUrls.indexOf(imageUrl), 1);
        const columns = Math.sqrt(tileCount);
        const rows = columns;
        const sourceTileWidth = canvas.width / columns;
        const sourceTileHeight = canvas.height / rows;
        const pages = [];

        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            throwIfAborted(options.signal);
            const tileCanvas = window.document.createElement("canvas");
            tileCanvas.width = Math.ceil(sourceTileWidth);
            tileCanvas.height = Math.ceil(sourceTileHeight);
            const tileContext = tileCanvas.getContext("2d", { alpha: false });
            if (!tileContext) throw new Error("تعذر تجهيز جزء الصورة للطباعة");
            tileContext.fillStyle = "#ffffff";
            tileContext.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
            tileContext.drawImage(
              canvas,
              column * sourceTileWidth,
              row * sourceTileHeight,
              sourceTileWidth,
              sourceTileHeight,
              0,
              0,
              tileCanvas.width,
              tileCanvas.height
            );
            pages.push({
              src: await canvasToPngObjectUrl(tileCanvas),
              width: tileCanvas.width,
              height: tileCanvas.height,
            });
            printImageUrls.push(pages[pages.length - 1]!.src);
            options.onProgress?.(
              measuredProgress(
                "render",
                "جارٍ تجهيز أجزاء الصورة…",
                pages.length,
                tileCount
              )
            );
            tileCanvas.width = 0;
            tileCanvas.height = 0;
          }
        }
        canvas.width = 0;
        canvas.height = 0;

        await openPrintWindow(
          {
            pages,
            title: `طباعة ${options.fileName}`,
            onProgress: options.onProgress,
            signal: options.signal,
            options: {
              ...layoutOptions,
              pagesPerSheet: 1,
              layoutMode: "sequential",
              copiesPerSheet: 1,
              headerText: "",
              footerText: "",
            },
          },
          window
        );
        return;
      } catch (error) {
        throw error;
      }
    }

    if (kind === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await fileBlob.arrayBuffer()),
        cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
        cMapPacked: true,
      }).promise;
      const pages = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          throwIfAborted(options.signal);
          const page = await pdf.getPage(pageNumber);
          const canvas = window.document.createElement("canvas");
          try {
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = getBoundedPixelRatio(
              baseViewport.width,
              baseViewport.height,
              5
            );
            const viewport = page.getViewport({ scale });
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("تعذر تجهيز صفحات PDF للطباعة");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvas, canvasContext: context, viewport })
              .promise;
            pages.push({
              src: await canvasToPngObjectUrl(canvas),
              width: canvas.width,
              height: canvas.height,
              widthPt: baseViewport.width,
              heightPt: baseViewport.height,
            });
            printImageUrls.push(pages[pages.length - 1]!.src);
            options.onProgress?.(
              measuredProgress(
                "render",
                "جارٍ رسم جميع صفحات PDF…",
                pageNumber,
                pdf.numPages
              )
            );
          } finally {
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
          }
        }
      } finally {
        await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
      }
      await openPrintWindow(
        {
          pages,
          options: layoutOptions,
          title: `طباعة ${options.fileName}`,
          onProgress: options.onProgress,
          signal: options.signal,
        },
        window
      );
      return;
    }

    const buffer = await fileBlob.arrayBuffer();
    throwIfAborted(options.signal);
    options.onProgress?.({
      phase: "render",
      message: "جارٍ تجهيز جميع صفحات Word وتنسيقها…",
    });
    const [{ renderAsync }] = await Promise.all([import("docx-preview")]);
    const orientation = options.orientation ?? "portrait";
    const sheetWidth = orientation === "landscape" ? 297 : 210;
    const sheetHeight = orientation === "landscape" ? 210 : 297;
    const margin = Math.min(20, Math.max(0, options.marginMm ?? 0));
    const wordStyle = document.createElement("style");
    wordStyle.textContent = `
      @page{size:A4 ${orientation};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
      ${PRINT_CUT_MARKS_CSS}
      .wathaeqi-print-docx-wrapper{background:#fff!important;padding:0!important}.wathaeqi-print-docx{box-shadow:none!important;margin:0!important}
      .sheet{width:${sheetWidth}mm;height:${sheetHeight}mm;padding:${margin}mm;display:flex;flex-direction:column;gap:2mm;direction:ltr;page-break-after:always;break-after:page;overflow:hidden;background:#fff}
      .sheet:last-child{page-break-after:auto;break-after:auto}.grid{position:relative;display:grid;flex:1 1 auto;min-height:0;gap:${layoutOptions.cutMarginMm}mm;direction:ltr}
      .per-1{grid-template-columns:1fr;grid-template-rows:1fr}.per-2{grid-template-columns:1fr;grid-template-rows:repeat(2,1fr)}
      .per-4{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}.per-6{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr)}.per-8{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,1fr)}
      .grid.landscape.per-2{grid-template-columns:repeat(2,1fr);grid-template-rows:1fr}.grid.landscape.per-6{grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr)}.grid.landscape.per-8{grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr)}
      .cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#fff;direction:rtl}.cell>.wathaeqi-print-docx{position:absolute;inset:0 auto auto 0;box-shadow:none!important}
      .print-counter{flex:0 0 auto;text-align:left;font:8pt Arial,sans-serif;color:#64748b;padding-top:1mm}
      @media screen{body{background:#e2e8f0;padding:8mm 0}.sheet{margin:0 auto 8mm;box-shadow:0 2mm 8mm #0f172a2e}}
    `;
    wordSession = createPrintRoot(
      `طباعة ${options.fileName}`,
      wordStyle.textContent,
      sheetWidth
    );
    const hostElement = document.createElement("div");
    hostElement.id = "docx-print-host";
    hostElement.dir = "auto";
    wordSession.root.append(hostElement);
    const host = hostElement;
    await renderAsync(buffer, host, undefined, {
      className: "wathaeqi-print-docx",
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });
    await document.fonts?.ready;
    normalizeDocxLayout(host);
    for (const style of host.querySelectorAll("style"))
      style.textContent = scopePrintCss(style.textContent ?? "");
    await waitForPrintAssets(wordSession.root, options);
    arrangeWordPages(document, host, {
      mode: options.layoutMode ?? "sequential",
      count:
        options.layoutMode === "repeat"
          ? (options.copiesPerSheet ?? 1)
          : (options.pagesPerSheet ?? 1),
      orientation,
      showPageNumbers: options.showPageNumbers ?? false,
      cutMarginMm: layoutOptions.cutMarginMm,
      showCutMarks: options.showCutMarks ?? DEFAULT_SHOW_CUT_MARKS,
    });
    await invokePagePrint(wordSession.root, options);
  } catch (error) {
    wordSession?.cleanup();
    printImageUrls.forEach(imageUrl => URL.revokeObjectURL(imageUrl));
    throw error;
  }
}

function arrangeWordPages(
  document: Document,
  host: HTMLElement,
  options: {
    mode: PrintLayoutMode;
    count: PagesPerSheet;
    orientation: PrintOrientation;
    showPageNumbers: boolean;
    cutMarginMm: number;
    showCutMarks: boolean;
  }
): void {
  const wrapper = host.querySelector<HTMLElement>(
    ".wathaeqi-print-docx-wrapper"
  );
  const pages = Array.from(
    host.querySelectorAll<HTMLElement>(
      ".wathaeqi-print-docx-wrapper > .wathaeqi-print-docx"
    )
  );
  if (pages.length === 0 || !wrapper)
    throw new Error("لا توجد صفحات Word قابلة للطباعة");
  if (options.count > 1) {
    for (const page of pages) {
      const minHeight = Number.parseFloat(
        document.defaultView?.getComputedStyle(page).minHeight ?? ""
      );
      if (
        !Number.isFinite(minHeight) ||
        minHeight <= 0 ||
        Math.max(page.scrollHeight, page.getBoundingClientRect().height) >
          minHeight + 2
      ) {
        throw new Error(
          "تعذر تحديد صفحات Word المتدفقة بدقة؛ حوّل الملف إلى PDF ثم اطبع عدة صفحات في الورقة."
        );
      }
    }
  }
  const sheets: HTMLElement[][] = [];
  if (options.mode === "repeat") {
    for (const page of pages) {
      sheets.push(
        Array.from({ length: options.count }, (_, copyIndex) =>
          copyIndex === 0 ? page : (page.cloneNode(true) as HTMLElement)
        )
      );
    }
  } else {
    for (let start = 0; start < pages.length; start += options.count) {
      sheets.push(pages.slice(start, start + options.count));
    }
  }
  const fragment = document.createDocumentFragment();
  sheets.forEach((sheetPages, sheetIndex) => {
    const sheet = document.createElement("section");
    sheet.className = "sheet";
    const grid = document.createElement("div");
    grid.className = `grid ${options.orientation} per-${options.count}`;
    sheetPages.forEach(page => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.append(page);
      grid.append(cell);
    });
    if (options.showCutMarks) {
      const cutMarks = createCutMarksMarkup(
        sheetPages.length,
        options.count,
        options.orientation,
        options.cutMarginMm
      );
      if (cutMarks) grid.insertAdjacentHTML("beforeend", cutMarks);
    }
    sheet.append(grid);
    if (options.showPageNumbers) {
      const counter = document.createElement("footer");
      counter.className = "print-counter";
      counter.textContent = `ورقة ${sheetIndex + 1} من ${sheets.length}`;
      sheet.append(counter);
    }
    fragment.append(sheet);
  });
  // The renderer's styles are siblings of the wrapper and must be retained.
  wrapper.replaceWith(fragment);
  for (const page of Array.from(
    host.querySelectorAll<HTMLElement>(".cell > .wathaeqi-print-docx")
  )) {
    const cell = page.parentElement!;
    const pageBounds = page.getBoundingClientRect();
    const cellBounds = cell.getBoundingClientRect();
    const scale = Math.min(
      cellBounds.width / pageBounds.width,
      cellBounds.height / pageBounds.height
    );
    // Unlike transform, zoom also scales the layout before print pagination.
    page.style.zoom = String(scale);
  }
}
