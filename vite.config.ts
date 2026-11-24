import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createReadStream } from "node:fs";
import { cp } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

function pdfCMaps(): Plugin {
  const source = path.resolve(
    import.meta.dirname,
    "node_modules/pdfjs-dist/cmaps"
  );
  let outputDirectory = "";
  return {
    name: "local-pdf-cmaps",
    configResolved(config) {
      outputDirectory = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use("/pdfjs/cmaps", (request, response, next) => {
        const name =
          (request.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "";
        if (!/^[A-Za-z0-9_-]+\.bcmap$/.test(name)) return next();
        response.setHeader("Content-Type", "application/octet-stream");
        createReadStream(path.join(source, name))
          .on("error", () => {
            response.statusCode = 404;
            response.end();
          })
          .pipe(response);
      });
    },
    async writeBundle() {
      await cp(source, path.join(outputDirectory, "pdfjs/cmaps"), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), jsxLocPlugin(), pdfCMaps()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  optimizeDeps: {
    include: [
      "@tanstack/react-query",
      "@trpc/client",
      "@trpc/react-query",
      "lucide-react",
      "react",
      "react-dom",
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            /[/\\]node_modules[/\\](?:react|react-dom|scheduler)(?:[@/\\]|$)/.test(
              id
            )
          ) {
            return "react-vendor";
          }
          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "ui-vendor";
          }
          if (id.includes("@tanstack") || id.includes("@trpc")) {
            return "data-vendor";
          }
          if (id.includes("recharts")) return "charts-vendor";
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
