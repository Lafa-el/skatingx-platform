import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const packagesDir = path.resolve(rootDir, "packages");

// Security Rules tests. Run through `npm run test:rules`, which starts the
// Firestore emulator first. Do not run this config directly against a real project.
export default defineConfig({
  resolve: {
    // Repository tests run the real repository code against the emulator, so workspace
    // packages resolve from source, same as vitest.config.ts.
    alias: {
      "@skatingx/schema": path.resolve(packagesDir, "schema/src/index.ts"),
      "@skatingx/skating-domain": path.resolve(
        packagesDir,
        "skating-domain/src/index.ts",
      ),
      "@skatingx/firebase-client": path.resolve(
        packagesDir,
        "firebase-client/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.rules.test.ts"],
    // One emulator instance and shared state: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
