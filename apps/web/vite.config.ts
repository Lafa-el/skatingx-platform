import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = path.resolve(rootDir, "../../packages");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "@skatingx/schema": path.resolve(packagesDir, "schema/src/index.ts"),
      "@skatingx/skating-domain": path.resolve(
        packagesDir,
        "skating-domain/src/index.ts",
      ),
      "@skatingx/firebase-client": path.resolve(
        packagesDir,
        "firebase-client/src/index.ts",
      ),
      "@skatingx/content": path.resolve(packagesDir, "content/src/index.ts"),
      "@skatingx/ui": path.resolve(packagesDir, "ui/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
