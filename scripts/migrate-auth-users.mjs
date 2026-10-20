/**
 * Copy Firebase Auth users from skatingx-platform to skatingx-prod.
 * Default is a dry run that prints provider counts. The only write target is
 * skatingx-prod, and it requires --write --project skatingx-prod
 * --confirm-production.
 *
 * Source reads use GOOGLE_APPLICATION_CREDENTIALS. Target writes use
 * TARGET_GOOGLE_APPLICATION_CREDENTIALS. A dry run does not need the target
 * key. This file does not open a key path unless that variable is set. Keys
 * stay outside the repository.
 *
 * Project scrypt parameters are not on the user record. They come from
 * Identity Platform projects.getConfig signIn.hashConfig. Per-user
 * passwordHash and passwordSalt come from listUsers. Google returns those
 * fields only to Auth Admin. A viewer still lists users, but the hash config
 * is empty and the password hashes are stripped. When the config is missing,
 * password accounts are still copied and listed for a password reset.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_PROJECT = "skatingx-platform";
export const PRODUCTION_PROJECT = "skatingx-prod";
export const BLOCKED_PROJECTS = new Set(["skatingx-production", "skatingx-platform"]);

const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const SOURCE_CREDENTIAL_HINT =
  "Point it at a key that can list skatingx-platform Auth users and read Identity Platform config. The script will not look up a path by itself.";
const TARGET_CREDENTIAL_HINT =
  "Point it at the skatingx-prod Auth write key. The script will not look up a path by itself.";
const HASH_CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${SOURCE_PROJECT}/config`;
const IMPORT_BATCH = 100;

export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationStop";
  }
}

function stop(message) {
  throw new MigrationStop(message);
}

export function parseArgs(argv) {
  const args = {
    write: false,
    project: null,
    target: null,
    fixture: null,
    confirmProduction: false,
    pauseMs: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--dry-run") args.write = false;
    else if (token === "--write") args.write = true;
    else if (token === "--confirm-production") args.confirmProduction = true;
    else if (token === "--target") {
      args.target = next;
      index += 1;
    } else if (token === "--project") {
      args.project = next;
      index += 1;
    } else if (token === "--fixture") {
      args.fixture = next;
      index += 1;
    } else if (token === "--pause-ms") {
      args.pauseMs = Number(next);
      index += 1;
    } else stop(`unknown argument ${token}`);
  }
  if (args.target !== null && args.target !== "production") stop(`target "${args.target}" is refused.`);
  if (args.project && BLOCKED_PROJECTS.has(args.project)) {
    stop(`project "${args.project}" is refused. This script does not write the source project or the path prefix.`);
  }
  if (args.project && args.project !== PRODUCTION_PROJECT) stop(`project "${args.project}" is refused.`);
  if (args.write) {
    if (args.project !== PRODUCTION_PROJECT || !args.confirmProduction) {
      stop("production needs --write --project skatingx-prod --confirm-production");
    }
    if (args.fixture) stop("production write requires a live source dry-run, not --fixture");
  }
  if (!Number.isInteger(args.pauseMs) || args.pauseMs < 0) stop("--pause-ms must be a non-negative integer");
  return args;
}

function isInsideRepo(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

function credentialLocationFailure(env, name, hint) {
  const configured = env[name];
  if (!configured) return `${name} is unset. ${hint}`;
  if (isInsideRepo(configured)) return `${name} is inside the repository. Move the key outside the repo.`;
  return null;
}

function credentialMaterialFailure(env, name) {
  const resolved = path.resolve(env[name]);
  let info;
  try {
    info = statSync(resolved);
  } catch {
    return `${name} does not point at a key file.`;
  }
  if (!info.isFile()) return `${name} does not point at a key file.`;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    return `${name} is not a readable service account key.`;
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    return `${name} is not a service account key.`;
  }
  return null;
}

function credentialGate(args, env) {
  if (args.fixture) return;
  const sourceLocation = credentialLocationFailure(env, SOURCE_CREDENTIAL_ENV, SOURCE_CREDENTIAL_HINT);
  if (sourceLocation) stop(sourceLocation);
  if (!args.write) return;
  const sourceMaterial = credentialMaterialFailure(env, SOURCE_CREDENTIAL_ENV);
  if (sourceMaterial) stop(sourceMaterial);
  const targetLocation = credentialLocationFailure(env, TARGET_CREDENTIAL_ENV, TARGET_CREDENTIAL_HINT);
  if (targetLocation) stop(targetLocation);
  const targetMaterial = credentialMaterialFailure(env, TARGET_CREDENTIAL_ENV);
  if (targetMaterial) stop(targetMaterial);
}

function assertLiveHost(env) {
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
    stop("unset FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST before a live auth read or production write");
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

export function normalizeHashConfig(hash) {
  if (!hash || typeof hash !== "object") {
    return { available: false, reason: "identity toolkit config has no scrypt signer key" };
  }
  if (hash.algorithm !== "SCRYPT") {
    const algorithm = typeof hash.algorithm === "string" ? hash.algorithm : "missing";
    return { available: false, reason: `identity toolkit config algorithm is ${algorithm}` };
  }
  if (!nonEmpty(hash.signerKey)) {
    return { available: false, reason: "identity toolkit config has no scrypt signer key" };
  }
  if (typeof hash.saltSeparator !== "string") {
    return { available: false, reason: "identity toolkit config has no salt separator" };
  }
  if (!Number.isInteger(hash.rounds) || !Number.isInteger(hash.memoryCost)) {
    return { available: false, reason: "identity toolkit config is missing scrypt rounds or memory cost" };
  }
  return {
    available: true,
    algorithm: "SCRYPT",
    signerKey: hash.signerKey,
    saltSeparator: hash.saltSeparator,
    rounds: hash.rounds,
    memoryCost: hash.memoryCost,
  };
}

export function scryptImportOptions(hashConfig) {
  const normalized = hashConfig?.available ? hashConfig : null;
  if (!normalized) stop("scrypt parameters are unavailable");
  return {
    hash: {
      algorithm: "SCRYPT",
      key: Buffer.from(normalized.signerKey, "base64"),
      saltSeparator: normalized.saltSeparator.length > 0 ? Buffer.from(normalized.saltSeparator, "base64") : Buffer.alloc(0),
      rounds: normalized.rounds,
      memoryCost: normalized.memoryCost,
    },
  };
}

function providerIds(user) {
  const data = user.providerData ?? [];
  if (!Array.isArray(data)) stop(`uid "${user.uid}" providerData is not a list`);
  return data.map((item) => {
    if (!nonEmpty(item?.providerId)) stop(`uid "${user.uid}" has a provider with no id`);
    return item.providerId;
  });
}

function copyProvider(user, item) {
  if (!nonEmpty(item?.uid)) stop(`uid "${user.uid}" has a provider with no uid`);
  const copy = { uid: item.uid, providerId: item.providerId };
  if (nonEmpty(item.displayName)) copy.displayName = item.displayName;
  if (nonEmpty(item.email)) copy.email = item.email;
  if (nonEmpty(item.photoURL)) copy.photoURL = item.photoURL;
  if (nonEmpty(item.phoneNumber)) copy.phoneNumber = item.phoneNumber;
  return copy;
}

function importRecord(user, hashConfig) {
  const creationTime = user.metadata?.creationTime;
  if (!nonEmpty(creationTime)) stop(`uid "${user.uid}" has no creation time`);
  const record = {
    uid: user.uid,
    disabled: user.disabled === true,
    metadata: { creationTime },
  };
  if (nonEmpty(user.email)) record.email = user.email;
  if (nonEmpty(user.email)) record.emailVerified = user.emailVerified === true;
  if (nonEmpty(user.displayName)) record.displayName = user.displayName;
  const providers = (user.providerData ?? []).map((item) => copyProvider(user, item));
  if (providers.length > 0) record.providerData = providers;
  const hashReady = hashConfig?.available === true;
  if (hashReady && nonEmpty(user.passwordHash) && nonEmpty(user.passwordSalt)) {
    record.passwordHash = Buffer.from(user.passwordHash, "base64");
    record.passwordSalt = Buffer.from(user.passwordSalt, "base64");
  }
  return record;
}

export function planAuth(users, options = {}) {
  if (!Array.isArray(users)) stop("source users is not a list");
  const existingUids = options.existingUids ?? new Set();
  const hashConfig = options.hashConfig ?? { available: false, reason: "identity toolkit config has no scrypt signer key" };
  const seen = new Set();
  const create = [];
  const existing = [];
  const passwordReset = [];
  const counts = { total: users.length, anonymous: 0, password: 0, other: {}, create: 0, existing: 0, passwordReset: 0 };
  for (const user of users) {
    if (!nonEmpty(user?.uid)) stop("a source user has no uid");
    if (seen.has(user.uid)) stop(`uid "${user.uid}" appears twice`);
    seen.add(user.uid);
    const providers = providerIds(user);
    const passwordAccount = providers.includes("password") || nonEmpty(user.passwordHash);
    if (providers.length === 0) counts.anonymous += 1;
    if (passwordAccount) counts.password += 1;
    for (const provider of providers) {
      if (provider === "password") continue;
      counts.other[provider] = (counts.other[provider] ?? 0) + 1;
    }
    const alreadyThere = existingUids.has(user.uid);
    const record = importRecord(user, hashConfig);
    const keptHash = record.passwordHash instanceof Buffer;
    if (passwordAccount && !keptHash) {
      if (!nonEmpty(user.email)) stop(`uid "${user.uid}" has a password and no email`);
      passwordReset.push({ email: user.email, state: alreadyThere ? "existing" : "create" });
    }
    if (alreadyThere) existing.push(user.uid);
    else create.push(record);
  }
  counts.create = create.length;
  counts.existing = existing.length;
  counts.passwordReset = passwordReset.length;
  return { create, existing, passwordReset, counts, hash: { available: hashConfig.available === true, reason: hashConfig.reason ?? "" } };
}

export function assertImportSucceeded(result, records) {
  if (!result || result.failureCount > 0 || result.successCount !== records.length) {
    const first = result?.errors?.[0];
    const index = first?.index;
    const uid = Number.isInteger(index) ? records[index]?.uid : "unknown";
    const message = first?.error?.message ?? "import failed";
    stop(`import failed for ${uid}: ${message}`);
  }
}

function printPlan(plan) {
  console.log(`provider anonymous ${plan.counts.anonymous}`);
  console.log(`provider password ${plan.counts.password}`);
  for (const name of Object.keys(plan.counts.other).sort()) console.log(`provider ${name} ${plan.counts.other[name]}`);
  const hashLine = plan.hash.available ? "hash: available" : `hash: unavailable ${plan.hash.reason}`;
  console.log(hashLine);
  console.log(`create ${plan.counts.create}`);
  console.log(`existing ${plan.counts.existing}`);
  console.log(`password-reset ${plan.counts.passwordReset}`);
  for (const item of plan.passwordReset) console.log(`password-reset ${item.state} ${item.email}`);
}

function loadFixture(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    stop(`fixture ${filePath} is not readable json`);
  }
  if (!Array.isArray(parsed?.users)) stop("fixture users is not a list");
  return { users: parsed.users, hashConfig: normalizeHashConfig(parsed.hashConfig) };
}

function authFailure(error) {
  const code = error?.code ? `${error.code} ` : "";
  const message = error instanceof Error ? error.message : "auth request failed";
  return `${code}${message}`.slice(0, 300);
}

async function readHashConfig() {
  const { applicationDefault } = await import("firebase-admin/app");
  let token;
  try {
    const access = await applicationDefault().getAccessToken();
    token = access?.access_token;
  } catch (error) {
    return { available: false, reason: `identity toolkit config was denied (${authFailure(error)})` };
  }
  if (!nonEmpty(token)) return { available: false, reason: "identity toolkit config was denied (no access token)" };
  let response;
  try {
    response = await fetch(HASH_CONFIG_URL, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return { available: false, reason: `identity toolkit config was denied (${authFailure(error)})` };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : "request failed";
    return { available: false, reason: `identity toolkit config was denied (${response.status} ${message})` };
  }
  return normalizeHashConfig(body?.signIn?.hashConfig);
}

async function readLiveSource(env) {
  assertLiveHost(env);
  console.log(`read auth source start ${SOURCE_PROJECT}`);
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ credential: applicationDefault(), projectId: SOURCE_PROJECT }, "auth-source");
  const auth = getAuth(app);
  const users = [];
  let pageToken;
  try {
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const user of page.users) {
        users.push({
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          displayName: user.displayName,
          providerData: user.providerData.map((item) => ({
            uid: item.uid,
            providerId: item.providerId,
            displayName: item.displayName,
            email: item.email,
            photoURL: item.photoURL,
            phoneNumber: item.phoneNumber,
          })),
          metadata: { creationTime: user.metadata?.creationTime },
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
        });
      }
      pageToken = page.pageToken;
      console.log(`read auth users ${users.length}`);
    } while (pageToken);
  } catch (error) {
    stop(`source auth list failed: ${authFailure(error)}`);
  }
  const hashConfig = await readHashConfig();
  return { users, hashConfig };
}

async function listTargetUids(auth) {
  const uids = new Set();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) uids.add(user.uid);
    pageToken = page.pageToken;
    console.log(`read target users ${uids.size}`);
  } while (pageToken);
  return uids;
}

async function targetAuth(env) {
  assertLiveHost(env);
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ credential: cert(env[TARGET_CREDENTIAL_ENV]), projectId: PRODUCTION_PROJECT }, "auth-target");
  return getAuth(app);
}

export async function importPlanned(auth, plan, hashConfig, args) {
  const pending = plan.create;
  const needsHash = pending.some((record) => record.passwordHash);
  const options = needsHash ? scryptImportOptions(hashConfig) : undefined;
  let written = 0;
  for (let index = 0; index < pending.length; index += IMPORT_BATCH) {
    const batch = pending.slice(index, index + IMPORT_BATCH);
    const result = await auth.importUsers(batch, options);
    assertImportSucceeded(result, batch);
    written += batch.length;
    console.log(`wrote auth users ${written}/${pending.length}`);
    if (args.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, args.pauseMs));
  }
  for (let index = 0; index < pending.length; index += IMPORT_BATCH) {
    const batch = pending.slice(index, index + IMPORT_BATCH);
    const replay = await auth.getUsers(batch.map((record) => ({ uid: record.uid })));
    const missing = replay.notFound[0];
    if (missing) stop(`wrote ${missing.uid ?? "unknown"} but it did not read back`);
  }
  if (written !== pending.length) stop(`recount mismatch ${written}/${pending.length}`);
  return written;
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  credentialGate(args, env);
  const source = args.fixture ? loadFixture(args.fixture) : await (deps.readLiveSource ?? readLiveSource)(env);
  if (!args.write) {
    const plan = planAuth(source.users, { hashConfig: source.hashConfig });
    console.log("mode: dry-run");
    printPlan(plan);
    console.log("dry-run: no users written");
    return plan;
  }
  const auth = await (deps.targetAuth ?? targetAuth)(env);
  const existingUids = await listTargetUids(auth);
  const plan = planAuth(source.users, { existingUids, hashConfig: source.hashConfig });
  console.log("mode: write");
  console.log(`target: production project ${PRODUCTION_PROJECT}`);
  printPlan(plan);
  const written = await importPlanned(auth, plan, source.hashConfig, args);
  console.log(`recount matches the plan ${written}`);
  return plan;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : "auth migration failed";
    console.error(message);
    process.exit(1);
  });
}
