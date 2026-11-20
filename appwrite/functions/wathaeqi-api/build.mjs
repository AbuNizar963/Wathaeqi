import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["@sparticuz/chromium", "playwright-core", "docx-preview", "jszip"],
  outfile: "build/main.cjs",
  tsconfig: "../../../tsconfig.json",
  nodePaths: ["node_modules"],
});
