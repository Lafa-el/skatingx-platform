import { describe, expect, it } from "vitest";

import {
  CATALOG_SCHEMA_VERSION,
  CATALOG_STATUSES,
  INITIAL_REVIEW_STATUS,
  REVIEW_STATUSES,
  canTransitionStatus,
  nextContentVersion,
  publishCatalogVersion,
  revokeCatalogApproval,
  type CatalogObject,
  type CatalogStatus,
  type CatalogVersion,
  type ReviewStatus,
} from "./catalog-object";

const ALLOWED: ReadonlyArray<readonly [CatalogStatus, CatalogStatus]> = [
  ["draft", "in_review"],
  ["in_review", "approved"],
  ["in_review", "draft"],
  ["approved", "published"],
  ["published", "deprecated"],
  ["deprecated", "archived"],
];

describe("catalog enums", () => {
  it("pins both enums and the initial review status", () => {
    expect(INITIAL_REVIEW_STATUS).toBe("pending");
    expect([...CATALOG_STATUSES]).toEqual([
      "draft",
      "in_review",
      "approved",
      "published",
      "deprecated",
      "archived",
    ]);
    expect([...REVIEW_STATUSES]).toEqual([
      "pending",
      "in_review",
      "approved",
      "rejected",
    ]);
    const review: ReviewStatus = INITIAL_REVIEW_STATUS;
    expect(REVIEW_STATUSES).toContain(review);
  });
});

describe("canTransitionStatus", () => {
  it("allows only the dictionary transitions", () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`));
    for (const from of CATALOG_STATUSES) {
      for (const to of CATALOG_STATUSES) {
        expect(canTransitionStatus(from, to)).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it("rejects rolling a published version back or editing approved in place", () => {
    expect(canTransitionStatus("published", "draft")).toBe(false);
    expect(canTransitionStatus("published", "in_review")).toBe(false);
    expect(canTransitionStatus("published", "approved")).toBe(false);
    expect(canTransitionStatus("published", "archived")).toBe(false);
    expect(canTransitionStatus("approved", "draft")).toBe(false);
    expect(canTransitionStatus("approved", "in_review")).toBe(false);
    expect(canTransitionStatus("in_review", "draft")).toBe(true);
    expect(canTransitionStatus("published", "deprecated")).toBe(true);
  });
});

describe("nextContentVersion", () => {
  it("increments v1 to v2", () => {
    expect(nextContentVersion("v1")).toBe("v2");
    expect(nextContentVersion("v9")).toBe("v10");
    expect(nextContentVersion("v9007199254740992")).toBe("v9007199254740993");
    expect(nextContentVersion(`v1${"0".repeat(29)}`)).toBe(`v1${"0".repeat(28)}1`);
  });

  it("rejects values that are not v<n>", () => {
    for (const bad of ["1", "v", "v0", "v01", "V1", "v1.0", ""]) {
      expect(() => nextContentVersion(bad)).toThrow(/v<n>/);
    }
  });
});

describe("CatalogObject field table", () => {
  it("includes every dictionary field with the pinned types", () => {
    const object: CatalogObject = {
      id: "EX-SHAPE-001",
      kind: "exercise",
      sportId: "short_track",
      disciplineId: "short_track_500",
      localeContent: {
        zh: { name: "下落跳", description: "中文说明" },
        en: { name: "Drop Jump", description: "English note" },
      },
      schemaVersion: CATALOG_SCHEMA_VERSION,
      contentVersion: "v1",
      status: "draft",
      reviewStatus: INITIAL_REVIEW_STATUS,
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
      createdAt: "2026-11-12T00:00:00.000Z",
      updatedAt: "2026-11-12T00:00:00.000Z",
      sourceLegacyId: "stb_example",
      supersedesVersion: "v0-not-used",
      checksum: "abc",
      publishedVersion: "v1",
      taxonomy: {
        sectionId: "LAND",
        objectiveIds: ["OBJ15"],
        energySystemId: "ANA",
        modality: "Box",
      },
      refs: [{ id: "DR-SHAPE-001", contentVersion: "v1" }],
      legacyAttributes: { Notes: "" },
    };

    expect(Object.keys(object).sort()).toEqual(
      [
        "checksum",
        "contentVersion",
        "createdAt",
        "disciplineId",
        "id",
        "kind",
        "legacyAttributes",
        "localeContent",
        "publishedVersion",
        "refs",
        "reviewStatus",
        "reviewedAt",
        "reviewer",
        "schemaVersion",
        "sourceLegacyId",
        "sportId",
        "status",
        "supersedesVersion",
        "taxonomy",
        "updatedAt",
      ].sort(),
    );
    expect(object.id.startsWith("EX-")).toBe(true);
    expect(object.kind).toBe("exercise");
    expect(object.sportId).toBe("short_track");
    expect(object.schemaVersion).toBe(1);
    expect(object.localeContent.zh.name).toEqual(expect.any(String));
    expect(object.localeContent.en.name).toEqual(expect.any(String));
    expect(object.taxonomy.sectionId).toEqual(expect.any(String));
    expect(object.taxonomy.objectiveIds).toEqual(["OBJ15"]);
    expect(object.refs[0]).toEqual({ id: "DR-SHAPE-001", contentVersion: "v1" });
    expect(object.legacyAttributes).toEqual({ Notes: "" });
    expect(object.reviewer).toEqual(expect.any(String));
    expect(object.publishedVersion).toBe("v1");
    expect("reviewedBy" in object).toBe(false);
  });
});

describe("CatalogVersion invariants", () => {
  it("uses contentVersion as the document id and starts as draft", () => {
    const version: CatalogVersion = {
      contentVersion: "v1",
      status: "draft",
      checksum: "abc",
      localeContent: {
        zh: { name: "下落跳" },
        en: { name: "Drop Jump" },
      },
      taxonomy: { sectionId: "LAND", objectiveIds: [] },
      refs: [],
      legacyAttributes: {},
      schemaVersion: CATALOG_SCHEMA_VERSION,
      reviewStatus: "pending",
    };
    const documentId = version.contentVersion;
    expect(documentId).toBe("v1");
    expect(version.status).toBe("draft");
    expect(version.reviewStatus).toBe("pending");
    expect(version.refs).toEqual([]);
  });
});

describe("revokeCatalogApproval", () => {
  it("returns a draft and clears review fields without using the normal state machine", () => {
    const approved = sampleObject("approved");
    const revoked = revokeCatalogApproval(approved);
    expect(canTransitionStatus("approved", "draft")).toBe(false);
    expect(revoked.status).toBe("draft");
    expect(revoked.reviewStatus).toBe(INITIAL_REVIEW_STATUS);
    expect(revoked.reviewer).toBeUndefined();
    expect(revoked.reviewedAt).toBeUndefined();
    expect("reviewer" in revoked).toBe(false);
    expect("reviewedAt" in revoked).toBe(false);
    expect(revoked.localeContent).toEqual(approved.localeContent);
    expect(revoked.checksum).toBe(approved.checksum);
    expect(revoked.publishedVersion).toBe(approved.publishedVersion);
  });

  it("throws unless the object is approved", () => {
    expect(() => revokeCatalogApproval(sampleObject("draft"))).toThrow(/approved/);
    expect(() => revokeCatalogApproval(sampleObject("published"))).toThrow(/approved/);
  });
});

describe("publishCatalogVersion", () => {
  it("publishes an approved draft without changing content or review records", () => {
    const snapshot: CatalogVersion = {
      ...versionBody(),
      status: "draft",
      reviewStatus: "approved",
      reviewer: "reviewer-1",
      reviewedAt: "2026-11-12T00:00:00.000Z",
    };
    const published = publishCatalogVersion(snapshot);
    expect(published.status).toBe("published");
    expect(published.reviewStatus).toBe("approved");
    expect(published.reviewer).toBe("reviewer-1");
    expect(published.checksum).toBe(snapshot.checksum);
    expect(published.localeContent).toEqual(snapshot.localeContent);
    expect(published.legacyAttributes).toEqual(snapshot.legacyAttributes);
  });

  it("throws unless the snapshot is a draft that is already approved", () => {
    expect(() => publishCatalogVersion({ ...versionBody(), status: "draft", reviewStatus: "pending" })).toThrow(
      /approved/,
    );
    expect(() => publishCatalogVersion({ ...versionBody(), status: "published", reviewStatus: "approved" })).toThrow(
      /approved/,
    );
  });
});

function sampleObject(status: CatalogObject["status"]): CatalogObject {
  return {
    id: "EX-SHAPE-001",
    kind: "exercise",
    sportId: "short_track",
    localeContent: { zh: { name: "下落跳" }, en: { name: "Drop Jump" } },
    schemaVersion: CATALOG_SCHEMA_VERSION,
    contentVersion: "v1",
    status,
    reviewStatus: "approved",
    reviewer: "reviewer-1",
    reviewedAt: "2026-11-12T00:00:00.000Z",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
    checksum: "abc",
    publishedVersion: "v1",
    taxonomy: { sectionId: "LAND", objectiveIds: ["OBJ15"] },
    refs: [],
    legacyAttributes: {},
  };
}

function versionBody(): CatalogVersion {
  return {
    contentVersion: "v1",
    status: "draft",
    reviewStatus: "pending",
    checksum: "abc",
    localeContent: { zh: { name: "下落跳" }, en: { name: "Drop Jump" } },
    taxonomy: { sectionId: "LAND", objectiveIds: [] },
    refs: [],
    legacyAttributes: {},
    schemaVersion: CATALOG_SCHEMA_VERSION,
  };
}
