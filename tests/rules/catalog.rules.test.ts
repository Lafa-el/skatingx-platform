import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { catalogAdminContext, createRulesEnv, USERS } from "./helpers";

// §5 of docs/skatingx-v2/firestore-paths.md. Synthetic ids only.
// Published fixtures are written with rules disabled, the Admin SDK path.

const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const EVIDENCE = `${ROOT}/trainingCatalogEvidenceRecords`;
const MEDIA = `${ROOT}/trainingCatalogTeachingMedia`;
const CORRECTIONS = `${ROOT}/trainingCatalogCorrectionRules`;
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const LINKS = `${ROOT}/trainingCatalogLinks`;
const RELEASES = `${ROOT}/trainingCatalogReleases`;
const MIGRATIONS = `${ROOT}/trainingCatalogMigrations`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const PUBLIC_LINKS = `${ROOT}/trainingCatalogPublicLinks`;

const CLIENT_COLLECTIONS = [
  OBJECTS,
  ARTICLES,
  EVIDENCE,
  MEDIA,
  CORRECTIONS,
  POLICIES,
  LINKS,
  RELEASES,
  MIGRATIONS,
  AUDIT,
  PUBLIC_LINKS,
];

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function adminDb() {
  return catalogAdminContext(env, "admin").firestore();
}

function userDb() {
  return env.authenticatedContext("skater").firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

describe("catalog rules", () => {
  it("scenario 1: signed-out read of a published object is denied", async () => {
    await seed(`${OBJECTS}/obj-1`, { status: "published", kind: "exercise", title: "Jump" });
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${OBJECTS}/obj-1`)));
  });

  it("scenario 2: a signed-in user reads published objects and not drafts", async () => {
    await seed(`${OBJECTS}/obj-pub`, { status: "published", kind: "exercise", title: "Jump" });
    await seed(`${OBJECTS}/obj-draft`, { status: "draft", reviewStatus: "pending", title: "Draft" });
    await assertSucceeds(getDoc(doc(userDb(), `${OBJECTS}/obj-pub`)));
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-draft`)));
  });

  it("scenario 3: a signed-in user cannot write any catalog collection", async () => {
    const db = userDb();
    for (const collectionPath of CLIENT_COLLECTIONS) {
      const path = `${collectionPath}/row-3`;
      await seed(path, { status: "draft", reviewStatus: "pending", title: "Row" });
      await assertFails(setDoc(doc(db, `${collectionPath}/new-3`), { status: "draft", title: "New" }));
      await assertFails(updateDoc(doc(db, path), { title: "Edited" }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    const versionPath = `${OBJECTS}/obj-3/versions/v1`;
    await seed(versionPath, { contentVersion: "v1", status: "draft", reviewStatus: "pending" });
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-3/versions/v2`), { contentVersion: "v2", status: "draft" }));
    await assertFails(updateDoc(doc(db, versionPath), { checksum: "nope" }));
    await assertFails(deleteDoc(doc(db, versionPath)));
  });

  it("scenario 4: an admin can edit an object draft and cannot delete the object", async () => {
    const db = adminDb();
    const path = `${OBJECTS}/obj-4`;
    await assertSucceeds(setDoc(doc(db, path), {
      status: "draft",
      reviewStatus: "pending",
      title: "Draft",
    }));
    await assertSucceeds(updateDoc(doc(db, path), { title: "Edited" }));
    await assertFails(deleteDoc(doc(db, path)));
  });

  it("scenario 5: an admin can create a draft version and cannot change or delete it", async () => {
    const db = adminDb();
    const path = `${OBJECTS}/obj-5/versions/v1`;
    await assertSucceeds(setDoc(doc(db, path), {
      contentVersion: "v1",
      status: "draft",
      reviewStatus: "pending",
      checksum: "abc",
    }));
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-5/versions/v2`), {
      contentVersion: "v1",
      status: "draft",
      reviewStatus: "pending",
    }));
    await assertFails(updateDoc(doc(db, path), { checksum: "other" }));
    await assertFails(deleteDoc(doc(db, path)));
  });

  it("scenario 6: safety policies are admin-only", async () => {
    await seed(`${POLICIES}/policy-6`, { status: "published", policyVersion: "p1", title: "Ice" });
    await assertFails(getDoc(doc(userDb(), `${POLICIES}/policy-6`)));
    await assertSucceeds(getDoc(doc(adminDb(), `${POLICIES}/policy-6`)));
  });

  it("scenario 7: audit logs and migrations are admin-only", async () => {
    await seed(`${AUDIT}/log-7`, { action: "publish" });
    await seed(`${MIGRATIONS}/mig-7`, { state: "dry-run" });
    await assertFails(getDoc(doc(userDb(), `${AUDIT}/log-7`)));
    await assertFails(getDoc(doc(userDb(), `${MIGRATIONS}/mig-7`)));
    await assertSucceeds(getDoc(doc(adminDb(), `${AUDIT}/log-7`)));
    await assertSucceeds(getDoc(doc(adminDb(), `${MIGRATIONS}/mig-7`)));
  });

  it("scenario 8: a user reads the public projection and a published release only", async () => {
    await seed(`${LINKS}/item-8`, { catalogRef: { kind: "exercise", id: "obj-8", contentVersion: "v1" } });
    await seed(`${PUBLIC_LINKS}/item-8`, {
      catalogRef: { kind: "exercise", id: "obj-8", contentVersion: "v1" },
    });
    await seed(`${RELEASES}/rel-pub`, { status: "published", createdAt: Timestamp.fromDate(new Date("2026-11-01T00:00:00Z")) });
    await seed(`${RELEASES}/rel-draft`, { status: "draft", reviewStatus: "pending", title: "Notes" });
    const db = userDb();
    await assertFails(getDoc(doc(db, `${LINKS}/item-8`)));
    await assertSucceeds(getDoc(doc(db, `${PUBLIC_LINKS}/item-8`)));
    await assertSucceeds(getDoc(doc(db, `${RELEASES}/rel-pub`)));
    await assertFails(getDoc(doc(db, `${RELEASES}/rel-draft`)));
  });

  it("scenario 9: the user subtree and profile collection-group list stay as they were", async () => {
    const owner = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(owner, `${USERS}/alice`), { n: 1 }));
    await assertSucceeds(getDoc(doc(owner, `${USERS}/alice`)));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), `${USERS}/alice`)));
    await seed(`${USERS}/alice/athletes/skater/profile/main`, { userId: "alice", displayName: "Skater" });
    await assertSucceeds(getDocs(query(collectionGroup(owner, "profile"), where("userId", "==", "alice"))));
    await assertFails(getDocs(query(
      collectionGroup(env.authenticatedContext("bob").firestore(), "profile"),
      where("userId", "==", "alice"),
    )));
  });

  it("scenario 10: object list requires a published filter except for an admin", async () => {
    await seed(`${OBJECTS}/obj-pub`, { status: "published", kind: "exercise", title: "Jump" });
    await seed(`${OBJECTS}/obj-draft`, { status: "draft", reviewStatus: "pending", kind: "exercise", title: "Draft" });
    const objects = collection(userDb(), OBJECTS);
    await assertSucceeds(getDocs(query(objects, where("status", "==", "published"))));
    await assertFails(getDocs(query(objects)));
    await assertFails(getDocs(query(objects, where("status", "==", "draft"))));
    const adminObjects = collection(adminDb(), OBJECTS);
    await assertSucceeds(getDocs(query(adminObjects)));
    await assertSucceeds(getDocs(query(adminObjects, where("status", "==", "draft"))));
  });

  it("scenario 11: moving the published pointer hides the version, and versions cannot be listed", async () => {
    const versionPath = `${OBJECTS}/obj-11/versions/v1`;
    await seed(`${OBJECTS}/obj-11`, { status: "published", publishedVersion: "v1", kind: "exercise" });
    await seed(versionPath, { contentVersion: "v1", status: "published", checksum: "abc" });
    await assertSucceeds(getDoc(doc(userDb(), versionPath)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `${OBJECTS}/obj-11`), { publishedVersion: "v2" });
    });
    await assertFails(getDoc(doc(userDb(), versionPath)));
    await assertFails(getDocs(collection(userDb(), `${OBJECTS}/obj-11/versions`)));
    await assertSucceeds(getDoc(doc(adminDb(), versionPath)));
    await assertFails(getDocs(collection(adminDb(), `${OBJECTS}/obj-11/versions`)));
  });

  it("scenario 12: withdrawing a projection removes it instead of leaving the old document", async () => {
    await seed(`${PUBLIC_LINKS}/item-12`, {
      catalogRef: { kind: "exercise", id: "obj-12", contentVersion: "v1" },
    });
    await seed(`${LINKS}/item-12`, {
      catalogRef: { kind: "exercise", id: "obj-12", contentVersion: "v1" },
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
    });
    const before = await assertSucceeds(getDoc(doc(userDb(), `${PUBLIC_LINKS}/item-12`)));
    expect(before.exists()).toBe(true);
    await assertFails(getDoc(doc(userDb(), `${LINKS}/item-12`)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `${PUBLIC_LINKS}/item-12`));
    });
    const after = await assertSucceeds(getDoc(doc(userDb(), `${PUBLIC_LINKS}/item-12`)));
    expect(after.exists()).toBe(false);
  });

  it("scenario 13: an admin cannot publish or move the pointer from the client", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-published`), {
      status: "published",
      reviewStatus: "pending",
      title: "Jump",
    }));
    await seed(`${OBJECTS}/obj-13`, { status: "draft", reviewStatus: "pending", title: "Draft" });
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-13`), { status: "published" }));
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-13`), { publishedVersion: "v1" }));
    await assertSucceeds(setDoc(doc(db, `${OBJECTS}/obj-13b`), {
      status: "draft",
      reviewStatus: "pending",
      title: "Other",
    }));
  });

  it("scenario 14: collection-group queries on versions are denied for every identity", async () => {
    await seed(`${OBJECTS}/obj-14`, { status: "published", publishedVersion: "v1" });
    await seed(`${OBJECTS}/obj-14/versions/v1`, { contentVersion: "v1", status: "published" });
    await assertFails(getDocs(collectionGroup(userDb(), "versions")));
    await assertFails(getDocs(collectionGroup(adminDb(), "versions")));
  });

  it("scenario 15: an admin cannot edit a published object", async () => {
    await seed(`${OBJECTS}/obj-15`, { status: "published", title: "Jump", kind: "exercise" });
    await assertFails(updateDoc(doc(adminDb(), `${OBJECTS}/obj-15`), { title: "Renamed" }));
  });

  it("scenario 16: an admin cannot withdraw a published object from the client", async () => {
    await seed(`${OBJECTS}/obj-16`, {
      status: "published",
      publishedVersion: "v1",
      kind: "exercise",
      title: "Jump",
    });
    const db = adminDb();
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-16`), { status: "deprecated" }));
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-16`), { publishedVersion: deleteField() }));
  });

  it("scenario 17: an admin cannot delete a published object or knowledge article", async () => {
    await seed(`${OBJECTS}/obj-17`, { status: "published", title: "Jump" });
    await seed(`${ARTICLES}/art-17`, { status: "published", title: "Note" });
    await assertFails(deleteDoc(doc(adminDb(), `${OBJECTS}/obj-17`)));
    await assertFails(deleteDoc(doc(adminDb(), `${ARTICLES}/art-17`)));
  });

  it("scenario 18: a published snapshot under an unpublished parent is hidden", async () => {
    await seed(`${OBJECTS}/obj-18`, { status: "draft", publishedVersion: "v1", reviewStatus: "pending" });
    await seed(`${OBJECTS}/obj-18/versions/v1`, { contentVersion: "v1", status: "published" });
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-18/versions/v1`)));
  });

  it("scenario 19: a version whose parent is missing or has no pointer is hidden", async () => {
    await seed(`${OBJECTS}/obj-missing/versions/v1`, { contentVersion: "v1", status: "published" });
    await seed(`${OBJECTS}/obj-nopointer`, { status: "published", kind: "exercise" });
    await seed(`${OBJECTS}/obj-nopointer/versions/v1`, { contentVersion: "v1", status: "published" });
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-missing/versions/v1`)));
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-nopointer/versions/v1`)));
  });

  it("scenario 20: a trusted publish moves the pointer and projection together, or moves neither", async () => {
    const parent = `${OBJECTS}/obj-20`;
    const link = `${PUBLIC_LINKS}/item-20`;
    const catalogRef = { kind: "exercise", id: "obj-20", contentVersion: "v1" };
    await seed(parent, { status: "published", publishedVersion: "v0", kind: "exercise" });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await runTransaction(db, async (tx) => {
        tx.update(doc(db, parent), { publishedVersion: "v1" });
        tx.set(doc(db, link), { catalogRef });
      });
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const parentSnap = await getDoc(doc(db, parent));
      const linkSnap = await getDoc(doc(db, link));
      expect(parentSnap.data()?.publishedVersion).toBe("v1");
      expect(linkSnap.data()?.catalogRef).toEqual(catalogRef);
    });

    const failedParent = `${OBJECTS}/obj-20b`;
    const failedLink = `${PUBLIC_LINKS}/item-20b`;
    await seed(failedParent, { status: "published", publishedVersion: "v1", kind: "exercise" });
    await expect(env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await runTransaction(db, async (tx) => {
        tx.update(doc(db, failedParent), { publishedVersion: "v2" });
        tx.set(doc(db, failedLink), {
          catalogRef: { kind: "exercise", id: "obj-20b", contentVersion: "v2" },
        });
        throw new Error("validation failed");
      });
    })).rejects.toThrow(/validation failed/);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      expect((await getDoc(doc(db, failedParent))).data()?.publishedVersion).toBe("v1");
      expect((await getDoc(doc(db, failedLink))).exists()).toBe(false);
    });
  });

  it("scenario 21: a trusted projection contains only catalogRef and a user can read it", async () => {
    const link = `${PUBLIC_LINKS}/item-21`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), link), {
        catalogRef: { kind: "drill", id: "obj-21", contentVersion: "v1" },
      });
    });
    const snap = await assertSucceeds(getDoc(doc(userDb(), link)));
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual(["catalogRef"]);
    expect(Object.keys(snap.data()?.catalogRef as Record<string, unknown>).sort()).toEqual([
      "contentVersion",
      "id",
      "kind",
    ]);
  });

  it("scenario 22: an admin cannot edit approved content", async () => {
    await seed(`${OBJECTS}/obj-22`, {
      status: "approved",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
      title: "Jump",
    });
    await assertFails(updateDoc(doc(adminDb(), `${OBJECTS}/obj-22`), { title: "Renamed" }));
  });

  it("scenario 23: an admin cannot put a published pointer on a release draft", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, `${RELEASES}/rel-23`), {
      status: "draft",
      reviewStatus: "pending",
      publishedVersion: "v1",
      title: "Notes",
    }));
    await seed(`${RELEASES}/rel-23b`, { status: "draft", reviewStatus: "pending", title: "Notes" });
    await assertFails(updateDoc(doc(db, `${RELEASES}/rel-23b`), { publishedVersion: "v1" }));
  });

  it("scenario 24: an admin cannot forge review fields", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-24a`), {
      status: "draft",
      reviewStatus: "approved",
      title: "Jump",
    }));
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-24b`), {
      status: "draft",
      reviewStatus: "pending",
      reviewer: "admin",
      title: "Jump",
    }));
    await seed(`${OBJECTS}/obj-24c`, { status: "draft", reviewStatus: "pending", title: "Jump" });
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-24c`), { reviewStatus: "approved" }));
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-24c`), { reviewer: "admin" }));
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-24c`), { reviewedAt: "2026-11-12T00:00:00.000Z" }));
  });

  it("scenario 25: a user cannot read a version the pointer does not name", async () => {
    await seed(`${OBJECTS}/obj-25`, { status: "published", publishedVersion: "v2", kind: "exercise" });
    await seed(`${OBJECTS}/obj-25/versions/v1`, { contentVersion: "v1", status: "published" });
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-25/versions/v1`)));
  });

  it("scenario 26: a user cannot read a version snapshot that has no status", async () => {
    await seed(`${OBJECTS}/obj-26`, { status: "published", publishedVersion: "v1", kind: "exercise" });
    await seed(`${OBJECTS}/obj-26/versions/v1`, { contentVersion: "v1", checksum: "abc" });
    await assertFails(getDoc(doc(userDb(), `${OBJECTS}/obj-26/versions/v1`)));
  });

  it("scenario 27: an admin cannot edit a link that already has a public projection", async () => {
    await seed(`${PUBLIC_LINKS}/item-27`, {
      catalogRef: { kind: "exercise", id: "obj-27", contentVersion: "v1" },
    });
    await seed(`${LINKS}/item-27`, {
      catalogRef: { kind: "exercise", id: "obj-27", contentVersion: "v1" },
    });
    await assertFails(updateDoc(doc(adminDb(), `${LINKS}/item-27`), {
      catalogRef: { kind: "exercise", id: "obj-27", contentVersion: "v2" },
    }));
  });

  it("scenario 28: an admin cannot edit a reviewed link that is not yet public", async () => {
    await seed(`${LINKS}/item-28`, {
      catalogRef: { kind: "exercise", id: "obj-28", contentVersion: "v1" },
      reviewer: "reviewer-1",
    });
    await assertFails(updateDoc(doc(adminDb(), `${LINKS}/item-28`), {
      catalogRef: { kind: "exercise", id: "obj-28", contentVersion: "v2" },
    }));
  });

  it("scenario 29: adding or removing a null protected field is denied", async () => {
    await seed(`${OBJECTS}/obj-29a`, { status: "draft", reviewStatus: "pending", title: "Jump" });
    await seed(`${OBJECTS}/obj-29b`, {
      status: "draft",
      reviewStatus: "pending",
      reviewer: null,
      title: "Jump",
    });
    const db = adminDb();
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-29a`), { reviewer: null }));
    await assertFails(updateDoc(doc(db, `${OBJECTS}/obj-29b`), { reviewer: deleteField() }));
  });

  it("scenario 30: creating a draft with reviewStatus in_review is denied", async () => {
    await assertFails(setDoc(doc(adminDb(), `${OBJECTS}/obj-30`), {
      status: "draft",
      reviewStatus: "in_review",
      title: "Jump",
    }));
  });

  it("scenario 31: a release draft cannot carry protected publish fields", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, `${RELEASES}/rel-31a`), {
      status: "draft",
      reviewStatus: "pending",
      publishedVersion: "v1",
    }));
    await assertFails(setDoc(doc(db, `${RELEASES}/rel-31b`), {
      status: "draft",
      reviewStatus: "pending",
      reviewer: "admin",
    }));
  });

  it("scenario 32: a link with only reviewedAt is locked", async () => {
    await seed(`${LINKS}/item-32`, {
      catalogRef: { kind: "exercise", id: "obj-32", contentVersion: "v1" },
      reviewedAt: "2026-11-12T00:00:00.000Z",
    });
    const db = adminDb();
    await assertFails(updateDoc(doc(db, `${LINKS}/item-32`), {
      catalogRef: { kind: "drill", id: "obj-32", contentVersion: "v1" },
    }));
    await assertFails(deleteDoc(doc(db, `${LINKS}/item-32`)));
  });

  it("scenario 33: a new version snapshot cannot be approved or archived", async () => {
    const db = adminDb();
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-33/versions/v1`), {
      contentVersion: "v1",
      status: "approved",
      reviewStatus: "pending",
    }));
    await assertFails(setDoc(doc(db, `${OBJECTS}/obj-33/versions/v2`), {
      contentVersion: "v2",
      status: "archived",
      reviewStatus: "pending",
    }));
  });

  it("scenario 34: an object create without reviewStatus is denied", async () => {
    await assertFails(setDoc(doc(adminDb(), `${OBJECTS}/obj-34`), {
      status: "draft",
      title: "Jump",
    }));
  });

  it("scenario 35: a version create without reviewStatus is denied", async () => {
    await assertFails(setDoc(doc(adminDb(), `${OBJECTS}/obj-35/versions/v1`), {
      contentVersion: "v1",
      status: "draft",
      checksum: "abc",
    }));
  });

  it("queries the kind and release indexes from section 4", async () => {
    await seed(`${OBJECTS}/obj-ex`, { status: "published", kind: "exercise", title: "Jump" });
    await seed(`${OBJECTS}/obj-dr`, { status: "published", kind: "drill", title: "Start" });
    await seed(`${OBJECTS}/obj-ex-draft`, { status: "draft", reviewStatus: "pending", kind: "exercise", title: "Draft" });
    const listed = await assertSucceeds(getDocs(query(
      collection(userDb(), OBJECTS),
      where("kind", "==", "exercise"),
      where("status", "==", "published"),
    )));
    expect(listed.docs.map((row) => row.id)).toEqual(["obj-ex"]);

    const older = Timestamp.fromDate(new Date("2026-11-01T00:00:00Z"));
    const newer = Timestamp.fromDate(new Date("2026-11-12T00:00:00Z"));
    await seed(`${RELEASES}/rel-old`, { status: "published", createdAt: older, title: "Old" });
    await seed(`${RELEASES}/rel-new`, { status: "published", createdAt: newer, title: "New" });
    await seed(`${RELEASES}/rel-draft`, { status: "draft", reviewStatus: "pending", createdAt: newer, title: "Draft" });
    const releases = await assertSucceeds(getDocs(query(
      collection(userDb(), RELEASES),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
    )));
    expect(releases.docs.map((row) => row.id)).toEqual(["rel-new", "rel-old"]);
  });
});
