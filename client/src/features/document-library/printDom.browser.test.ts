import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

describe.skipIf(!chromiumPath)("same-page print lifecycle", () => {
  it("isolates styles and preserves application DOM, then cleans only after print media exits", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-library/printDom.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "printDomTest",
      platform: "browser",
    });
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<title>Application title</title><style>.grid{width:42px;height:20px}</style><main id="application-fixture"><div class="grid">App</div></main>'
      );
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const result = await page.evaluate(async () => {
        const api = (
          window as unknown as {
            printDomTest: {
              createPrintRoot: (
                title: string,
                css: string
              ) => { root: HTMLElement; cleanup: () => void };
              invokePagePrint: (
                root: HTMLElement,
                options?: unknown
              ) => Promise<void>;
            };
          }
        ).printDomTest;
        window.open = () => {
          throw new Error("No popup allowed");
        };
        let calls = 0;
        window.print = () => {
          calls += 1;
        };
        const session = api.createPrintRoot(
          "Print title",
          "@page {size:A4;margin:0} .grid{width:200px;height:40px}"
        );
        session.root.innerHTML = '<div class="grid">Print</div>';
        await api.invokePagePrint(session.root);
        window.dispatchEvent(new Event("focus"));
        return {
          calls,
          appWidth: document
            .querySelector("main .grid")!
            .getBoundingClientRect().width,
          rootWidth: session.root
            .querySelector(".grid")!
            .getBoundingClientRect().width,
          connected: session.root.isConnected,
          iframes: document.querySelectorAll("iframe").length,
        };
      });
      expect(result).toEqual({
        calls: 1,
        appWidth: 42,
        rootWidth: 200,
        connected: true,
        iframes: 0,
      });
      expect(await page.title()).toBe("Print title");
      await page.emulateMedia({ media: "print" });
      expect(await page.locator("#application-fixture").isVisible()).toBe(
        false
      );
      expect(await page.locator("#wathaeqi-print-root").isVisible()).toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await page.emulateMedia({ media: "screen" });
      await page.waitForFunction(
        () => !document.getElementById("wathaeqi-print-root")
      );
      expect(await page.locator("#wathaeqi-print-root").count()).toBe(0);
      expect(await page.title()).toBe("Application title");
      expect(await page.locator("#application-fixture").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });
  it("cleans after post-invocation blur/focus, propagates print failure and abort, and allows a next print", async () => {
    const bundle = await build({
      entryPoints: [
        resolve("client/src/features/document-library/printDom.ts"),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "printDomTest",
      platform: "browser",
    });
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent("<title>Application title</title><main>App</main>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const result = await page.evaluate(async () => {
        const api = (
          window as unknown as {
            printDomTest: {
              createPrintRoot: (title: string) => {
                root: HTMLElement;
                cleanup: () => void;
              };
              invokePagePrint: (
                root: HTMLElement,
                options?: unknown
              ) => Promise<void>;
            };
          }
        ).printDomTest;
        window.print = () => undefined;
        const first = api.createPrintRoot("Print title");
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
        const noInitialCleanup = first.root.isConnected;
        await api.invokePagePrint(first.root);
        window.dispatchEvent(new Event("focus"));
        const noUnpairedCleanup = first.root.isConnected;
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
        const focusedCleanup = !first.root.isConnected;
        const second = api.createPrintRoot("Failure title");
        let failure = false;
        window.print = () => {
          throw new Error("synthetic printer failure");
        };
        try {
          await api.invokePagePrint(second.root);
        } catch {
          failure = true;
          second.cleanup();
        }
        const failedCleanup = !second.root.isConnected;
        const third = api.createPrintRoot("Abort title");
        let printCalls = 0;
        window.print = () => {
          printCalls += 1;
        };
        const controller = new AbortController();
        controller.abort();
        let aborted = false;
        try {
          await api.invokePagePrint(third.root, { signal: controller.signal });
        } catch (error) {
          aborted = (error as Error).name === "AbortError";
          third.cleanup();
        }
        return {
          noInitialCleanup,
          noUnpairedCleanup,
          focusedCleanup,
          failure,
          failedCleanup,
          aborted,
          printCalls,
          title: document.title,
          roots: document.querySelectorAll("#wathaeqi-print-root").length,
        };
      });
      expect(result).toEqual({
        noInitialCleanup: true,
        noUnpairedCleanup: true,
        focusedCleanup: true,
        failure: true,
        failedCleanup: true,
        aborted: true,
        printCalls: 0,
        title: "Application title",
        roots: 0,
      });
    } finally {
      await browser.close();
    }
  });
});
