import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "build/main.cjs",
  tsconfig: "../../../tsconfig.json",
  nodePaths: ["node_modules"],
});
