import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  BLOCKED_PROJECTS,
  MigrationStop,
  importPlanned,
  normalizeHashConfig,
  parseArgs,
  planAuth,
  run,
  scryptImportOptions,
} from "./migrate-auth-users.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "migrate-auth-users.mjs");
const signerKey = Buffer.from("signer-key").toString("base64");
const createdAt = "Tue, 20 Oct 2026 00:00:00 GMT";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stops(label, fn) {
  try {
    const value = fn();
    if (value && typeof value.then === "function") {
      return value.then(
        () => {
          throw new Error(`${label} did not stop`);
        },
        (error) => {
          if (!(error instanceof MigrationStop)) throw new Error(`${label} did not stop the migration`, { cause: error });
          return error.message;
        },
      );
    }
  } catch (error) {
    if (!(error instanceof MigrationStop)) throw new Error(`${label} did not stop the migration`, { cause: error });
    return error.message;
  }
  throw new Error(`${label} did not stop`);
}

function cli(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function users() {
  return [
    {
      uid: "anon-1",
      disabled: false,
      providerData: [],
      metadata: { creationTime: createdAt },
    },
    {
      uid: "email-1",
      email: "skater@example.com",
      emailVerified: true,
      disabled: false,
      displayName: "Skater",
      providerData: [{ uid: "email-1", providerId: "password", email: "skater@example.com", displayName: "Skater" }],
      metadata: { creationTime: createdAt },
      passwordHash: Buffer.from("hash-bytes").toString("base64"),
      passwordSalt: Buffer.from("salt-bytes").toString("base64"),
    },
  ];
}

function hashConfig() {
  return normalizeHashConfig({
    algorithm: "SCRYPT",
    signerKey,
    saltSeparator: Buffer.from("sep").toString("base64"),
    rounds: 8,
    memoryCost: 14,
  });
}

const sourceUsers = users();
const withHash = planAuth(sourceUsers, { hashConfig: hashConfig() });
assert(withHash.counts.anonymous === 1, "anonymous count");
assert(withHash.counts.password === 1, "email count");
assert(withHash.counts.create === 2, "create count");
assert(withHash.passwordReset.length === 0, "hash import still listed a password reset");
const emailRecord = withHash.create.find((record) => record.uid === "email-1");
const anonRecord = withHash.create.find((record) => record.uid === "anon-1");
assert(emailRecord.uid === "email-1", "email uid changed");
assert(anonRecord.uid === "anon-1", "anonymous uid changed");
assert(emailRecord.email === "skater@example.com", "email changed");
assert(emailRecord.emailVerified === true, "emailVerified changed");
assert(emailRecord.disabled === false, "disabled changed");
assert(emailRecord.displayName === "Skater", "displayName changed");
assert(emailRecord.providerData[0].providerId === "password", "providerData changed");
assert(emailRecord.metadata.creationTime === createdAt, "creation time changed");
assert(emailRecord.passwordHash.equals(Buffer.from("hash-bytes")), "password hash was dropped");
assert(emailRecord.passwordSalt.equals(Buffer.from("salt-bytes")), "password salt was dropped");
const options = scryptImportOptions(hashConfig());
assert(options.hash.algorithm === "SCRYPT", "hash algorithm");
assert(options.hash.rounds === 8 && options.hash.memoryCost === 14, "scrypt parameters");
assert(!JSON.stringify(withHash.hash).includes(signerKey), "plan printed the signer key");

const noHash = planAuth(sourceUsers, { hashConfig: normalizeHashConfig(null) });
assert(noHash.create.length === 2, "missing hash dropped a user");
assert(noHash.create.every((record) => !record.passwordHash), "missing hash still attached a password");
assert(noHash.passwordReset.map((item) => item.email).join() === "skater@example.com", "password reset email was not listed");

const again = planAuth(sourceUsers, {
  existingUids: new Set(withHash.create.map((record) => record.uid)),
  hashConfig: hashConfig(),
});
assert(again.create.length === 0, "existing uid was created again");
assert(again.counts.existing === 2, "existing count");

const imported = [];
await importPlanned(
  {
    async importUsers(batch) {
      imported.push(...batch.map((record) => record.uid));
      return { failureCount: 0, successCount: batch.length, errors: [] };
    },
    async getUsers(ids) {
      return { users: ids, notFound: [] };
    },
  },
  withHash,
  hashConfig(),
  { pauseMs: 0 },
);
assert(imported.join() === "anon-1,email-1", "write path changed the uid set");

const failed = await stops("import error", () =>
  importPlanned(
    {
      async importUsers() {
        return { failureCount: 1, successCount: 0, errors: [{ index: 0, error: { message: "already exists" } }] };
      },
      async getUsers() {
        return { users: [], notFound: [] };
      },
    },
    planAuth([sourceUsers[0]], { hashConfig: hashConfig() }),
    hashConfig(),
    { pauseMs: 0 },
  ),
);
assert(failed.includes("anon-1"), "import failure did not name the uid");

stops("duplicate uid", () => planAuth([sourceUsers[0], sourceUsers[0]], { hashConfig: hashConfig() }));
stops("password without email", () =>
  planAuth(
    [{ uid: "email-2", providerData: [{ uid: "email-2", providerId: "password" }], metadata: { creationTime: createdAt } }],
    { hashConfig: normalizeHashConfig(null) },
  ),
);
const wrongAlgorithm = normalizeHashConfig({ algorithm: "BCRYPT", signerKey, saltSeparator: "", rounds: 1, memoryCost: 1 });
assert(wrongAlgorithm.available === false, "non-scrypt config was accepted");
assert(!wrongAlgorithm.reason.includes(signerKey), "rejected hash config echoed the signer key");

const missingConfirm = stops("production without confirm", () => parseArgs(["--write", "--project", "skatingx-prod"]));
assert(missingConfirm.includes("--confirm-production"), "missing production confirm was not named");
const opened = parseArgs(["--write", "--project", "skatingx-prod", "--confirm-production"]);
assert(opened.write && opened.project === "skatingx-prod", "production gate did not open");
stops("fixture write", () => parseArgs(["--write", "--project", "skatingx-prod", "--confirm-production", "--fixture", "users.json"]));
assert(BLOCKED_PROJECTS.has("skatingx-platform") && BLOCKED_PROJECTS.has("skatingx-production"), "block list");
stops("source project", () => parseArgs(["--write", "--project", "skatingx-platform", "--confirm-production"]));
stops("other target", () => parseArgs(["--target", "emulator"]));

const denied = cli(["--write", "--project", "skatingx-prod"]);
assert(denied.status === 1, "missing confirm exited 0");
assert(denied.stderr.includes("--confirm-production"), "cli did not name --confirm-production");

const insideRepo = cli(["--dry-run"], { GOOGLE_APPLICATION_CREDENTIALS: path.join(root, "package.json") });
assert(insideRepo.status === 1, "in-repo key exited 0");
assert(insideRepo.stderr.includes("inside the repository"), "in-repo key was not named");

const fixtureDir = mkdtempSync(path.join(tmpdir(), "auth-migration-"));
const fixturePath = path.join(fixtureDir, "users.json");
writeFileSync(fixturePath, JSON.stringify({ users: sourceUsers, hashConfig: { algorithm: "SCRYPT", signerKey, saltSeparator: "c2Vw", rounds: 8, memoryCost: 14 } }));
const lines = [];
const original = console.log;
console.log = (line) => lines.push(String(line));
try {
  await run(["--fixture", fixturePath], {});
} finally {
  console.log = original;
}
assert(lines.includes("provider anonymous 1"), "dry-run anonymous count");
assert(lines.includes("provider password 1"), "dry-run email count");
assert(lines.includes("hash: available"), "dry-run hash state");
assert(lines.includes("dry-run: no users written"), "dry-run wrote users");
assert(lines.every((line) => !line.includes(signerKey)), "dry-run printed the signer key");

console.log("[test:migration] auth user plan, hash fallback, idempotency, and production gate passed");
