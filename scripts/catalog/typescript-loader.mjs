// Lets the plain-node import CLI load the frozen TypeScript catalog package.
// Vitest transforms those imports itself; this hook is only for run-import.mjs.
import { transformSync } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function fromParent(specifier, parentURL) {
  return path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
}

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith(".");
  const explicitTypeScript = specifier.endsWith(".ts") || specifier.endsWith(".mts");
  if (relative || explicitTypeScript) {
    const exact = explicitTypeScript || specifier.endsWith(".js") || specifier.endsWith(".mjs");
    const candidates = exact
      ? [fromParent(specifier, context.parentURL)]
      : [".ts", ".mts", ".js", ".mjs"].map((extension) => fromParent(specifier + extension, context.parentURL));
    for (const candidate of candidates) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".mts")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const transformed = transformSync(source, { loader: "ts", format: "esm", target: "es2022" });
    return { format: "module", source: transformed.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
