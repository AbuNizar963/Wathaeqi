import { readFile } from "node:fs/promises";

const bundlePath = "appwrite/functions/wathaeqi-api/build/main.js";
const bundle = await readFile(bundlePath, "utf8");
const forbiddenImports = [
  /from\s*["']@supabase\/supabase-js["']/,
  /require\(["']@supabase\/supabase-js["']\)/,
];

if (forbiddenImports.some(pattern => pattern.test(bundle))) {
  throw new Error(
    "The Appwrite Owner API bundle must not import the Supabase SDK."
  );
}

const sizeBytes = Buffer.byteLength(bundle);
if (sizeBytes > 8 * 1024 * 1024) {
  throw new Error(
    "The Appwrite Owner API bundle is unexpectedly large: " +
      sizeBytes +
      " bytes."
  );
}

console.log(
  "Appwrite Owner API bundle verified: " +
    Math.round(sizeBytes / 1024) +
    " KiB; no Supabase SDK import."
);
