// Emulator-only idempotency check. It may resume a demo- run. It does not open production.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { resumeIdempotency } = await import("./verify-catalog.mjs");
const { assertDemoProjectId } = await import("./import-core.mjs");

const rootDir = path.resolve(here, "../..");

function parseArgs(argv) {
  const args = { runId: "", target: "", project: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--runId") args.runId = argv[(index += 1)] ?? "";
    else if (token === "--target") args.target = argv[(index += 1)] ?? "";
    else if (token === "--project") args.project = argv[(index += 1)] ?? "";
    else if (token === "--execute") throw new Error("refusing to run: this entry always resumes through its own emulator call");
    else throw new Error(`unknown argument ${token}`);
  }
  if (args.runId.trim() === "") throw new Error("refusing to run: --runId is required");
  if (args.target !== "emulator") throw new Error("refusing to run: --target must be emulator");
  if (args.project.trim() === "") throw new Error("refusing to run: --project is required");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertDemoProjectId(args.project);
  const result = resumeIdempotency({ runId: args.runId, projectId: args.project, rootDir });
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
