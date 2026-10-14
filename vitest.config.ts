import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = path.resolve(rootDir, "packages");

export default defineConfig({
  resolve: {
    // Mirrors apps/web/vite.config.ts so tests resolve workspace packages from source.
    alias: {
      "@": path.resolve(rootDir, "apps/web/src"),
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
  test: {
    environment: "node",
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/web/src/**/*.test.{ts,tsx}",
    ],
    // Rules tests need the Firestore emulator and run via `npm run test:rules`.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/rules/**"],
  },
});
