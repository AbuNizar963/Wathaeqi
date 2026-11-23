import { existsSync } from "node:fs";
import sparticuzChromium from "@sparticuz/chromium";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";

const chromiumPath =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

describe.skipIf(
  !chromiumPath && !(process.platform === "linux" && process.arch === "x64")
)("signed document URL query in Chromium", () => {
  it("does not inherit the global polling interval but can refresh explicitly", async () => {
    const bundle = await build({
      stdin: {
        contents: `
          import { QueryClient, QueryObserver } from '@tanstack/react-query';
          import { signedFileQueryOptions } from './client/src/features/document-library/signedFileQueryOptions';
          export async function run() {
            let controlCalls = 0;
            let signedCalls = 0;
            const client = new QueryClient({defaultOptions:{queries:{refetchInterval:30,refetchIntervalInBackground:true,retry:false}}});
            const control = new QueryObserver(client,{queryKey:['control'],queryFn:async()=>++controlCalls});
            const signed = new QueryObserver(client,{queryKey:['signed'],queryFn:async()=>++signedCalls,...signedFileQueryOptions});
            const stopControl = control.subscribe(()=>{});
            const stopSigned = signed.subscribe(()=>{});
            await new Promise(resolve=>setTimeout(resolve,250));
            const beforeExplicit = signedCalls;
            await signed.refetch();
            stopControl(); stopSigned(); client.clear();
            return {controlCalls,beforeExplicit,afterExplicit:signedCalls};
          }`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: "signedQueryTest",
      platform: "browser",
    });
    const browser = await chromium.launch({
      executablePath:
        chromiumPath ?? (await sparticuzChromium.executablePath()),
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent("<html><body></body></html>");
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      const result = await page.evaluate(() =>
        (
          window as unknown as {
            signedQueryTest: {
              run(): Promise<{
                controlCalls: number;
                beforeExplicit: number;
                afterExplicit: number;
              }>;
            };
          }
        ).signedQueryTest.run()
      );
      expect(result.controlCalls).toBeGreaterThan(1);
      expect(result.beforeExplicit).toBe(1);
      expect(result.afterExplicit).toBe(2);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
