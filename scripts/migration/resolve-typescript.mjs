import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const packages = {
  "@skatingx/skating-domain": "packages/skating-domain/src/index.ts",
  "@skatingx/schema": "packages/schema/src/index.ts",
  "@skatingx/content": "packages/content/src/index.ts",
  "@skatingx/firebase-client": "packages/firebase-client/src/index.ts",
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(packages, specifier)) {
    return nextResolve(pathToFileURL(path.join(root, packages[specifier])).href, context);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const known = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);
    const ext = path.extname(specifier);
    if (!known.has(ext)) {
      const parent = context.parentURL ? fileURLToPath(context.parentURL) : root;
      const base = path.resolve(path.dirname(parent), specifier);
      for (const suffix of [".ts", ".tsx", ".js", ".mjs", ".json", ""]) {
        const candidate = `${base}${suffix}`;
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
