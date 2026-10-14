import { defineConfig } from "vitest/config";

// Security Rules tests. Run through `npm run test:rules`, which starts the
// Firestore emulator first. Do not run this config directly against a real project.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.rules.test.ts"],
    // One emulator instance and shared state: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
