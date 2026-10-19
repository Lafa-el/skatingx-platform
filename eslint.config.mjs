import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "**/coverage/**",
    ".firebase/**",
    // Generated or vendored from legacy sources; not maintainable source (AGENTS.md).
    "packages/content/src/academy-legacy-raw.cjs",
    "packages/content/src/academy-stages.generated.ts",
    "apps/web/public/mediapipe/**",
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    // `no-empty` (in js recommended) already forbids empty catch blocks.
    // `no-explicit-any` (in ts recommended) enforces "no unjustified any".
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  {
    files: ["packages/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  {
    files: ["*.{js,mjs,cjs,ts}", "scripts/**/*.{js,mjs}", "packages/*/scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
]);
