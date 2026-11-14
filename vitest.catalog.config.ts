import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = path.resolve(rootDir, "packages");

// Catalog import dry run. Run through `npm run test:catalog-dry-run`, which
// starts the Firestore emulator first. Do not point this config at a real project.
export default defineConfig({
  resolve: {
    alias: {
      "@skatingx/schema": path.resolve(packagesDir, "schema/src/index.ts"),
      "@skatingx/skating-domain": path.resolve(packagesDir, "skating-domain/src/index.ts"),
      "@skatingx/firebase-client": path.resolve(packagesDir, "firebase-client/src/index.ts"),
      "@skatingx/training-catalog": path.resolve(packagesDir, "training-catalog/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/catalog/**/*.test.ts"],
    // One emulator and shared catalog documents: do not run files in parallel.
    fileParallelism: false,
    maxWorkers: 1,
    // The dry run prints a structured summary. Show it even when the test passes.
    disableConsoleIntercept: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
