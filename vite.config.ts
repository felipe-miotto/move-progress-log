import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const CHUNK_FALLBACK = "vendor-misc";

const REACT_PDF_PACKAGES = new Set([
  "@react-pdf/renderer",
  "@react-pdf/layout",
  "@react-pdf/pdfkit",
  "@react-pdf/font",
  "@react-pdf/primitives",
  "@react-pdf/render",
  "@react-pdf/stylesheet",
  "@react-pdf/textkit",
  "@react-pdf/types",
  "fontkit",
  "pdfkit",
  "yoga-layout",
  "linebreak",
  "unicode-trie",
  "unicode-properties",
]);

const EXCEL_PACKAGES = new Set([
  "exceljs",
  "fast-csv",
  "jszip",
  "saxes",
  "dayjs",
  "archiver",
  "pako",
  "readable-stream",
  "unzipper",
  "tmp",
  "uuid",
]);

const getPackageName = (id: string): string | null => {
  const parts = id.split("node_modules/");
  if (parts.length < 2) return null;

  const modulePath = parts[parts.length - 1];
  const segments = modulePath.split("/");
  if (segments.length === 0) return null;

  if (segments[0].startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }

  return segments[0];
};

const toChunkName = (prefix: string, value: string) =>
  `${prefix}-${value.replace("@", "").replace(/\//g, "-").replace(/[^a-zA-Z0-9-_]/g, "")}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    modulePreload: {
      resolveDependencies: (_url, deps) =>
        deps.filter(
          (dep) =>
            !dep.includes("vendor-excel-") &&
            !dep.includes("vendor-react-pdf-")
        ),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          const packageName = getPackageName(id);
          if (!packageName) return CHUNK_FALLBACK;

          if (REACT_PDF_PACKAGES.has(packageName)) {
            return toChunkName("vendor-react-pdf", packageName);
          }
          if (EXCEL_PACKAGES.has(packageName)) {
            return toChunkName("vendor-excel", packageName);
          }
          if (packageName === "recharts") return "vendor-recharts";
          if (packageName === "@dnd-kit/core" || packageName === "@dnd-kit/sortable" || packageName === "@dnd-kit/utilities") {
            return "vendor-dnd-kit";
          }
          if (packageName === "framer-motion") return "vendor-motion";
          if (packageName === "react-router-dom" || packageName === "react-router") return "vendor-router";
          if (packageName === "@tanstack/react-query") return "vendor-query";
          if (packageName === "@supabase/supabase-js") return "vendor-supabase";

          return undefined;
        },
      },
    },
  },
  test: {
    // Deno edge-function tests live under supabase/functions and run via
    // `deno test`, not vitest (they import jsr:/npm: specifiers).
    exclude: [...configDefaults.exclude, "supabase/functions/**"],
  },
}));
