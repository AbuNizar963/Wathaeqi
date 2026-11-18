import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "build/main.js",
  tsconfig: "../../../tsconfig.json",
  nodePaths: ["node_modules"],
});
