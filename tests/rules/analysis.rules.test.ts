import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  buildBiomechAnalysisRecord,
  buildPaceAnalysisRecord,
  calculatePacingAnalysis,
  emptySupportTracker,
  emptyTrackingState,
  landmarksFromPoints,
  pacingDistanceConfigs,
  samplePoseFrame,
  type BiomechAnalysisRecord,
  type PaceAnalysisRecord,
} from "@skatingx/skating-domain";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createRulesEnv, USERS } from "./helpers";

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

const splits = [7.2, 9.3, 9.5, 10.4, 11.2];

function paceDoc(overrides: Record<string, unknown> = {}): PaceAnalysisRecord & Record<string, unknown> {
  const result = calculatePacingAnalysis("500", splits, pacingDistanceConfigs["500"].defaults);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return {
    ...buildPaceAnalysisRecord({
      id: "pace-500-abc",
      ownerUserId: "alice",
      createdAt: "2026-10-19T04:59:13.497Z",
      distance: "500",
      splits,
      benchmark: pacingDistanceConfigs["500"].defaults,
      analysis: result.analysis,
    }),
    ...overrides,
  };
}

const path = `${USERS}/alice/analyses/pace-500-abc`;

describe("analyses/{analysisId}", () => {
  it("lets the owner create, read, update, and delete a contract pace record", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const created = paceDoc();
    await assertSucceeds(setDoc(doc(db, path), created));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(
      setDoc(doc(db, path), {
        ...created,
        pace: { ...created.pace, rating: "excellent" },
      }),
    );
    await assertSucceeds(deleteDoc(doc(db, path)));
  });

  it("denies another user and an unauthenticated caller", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), paceDoc());
    });
    const other = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(other, path)));
    await assertFails(setDoc(doc(other, path), paceDoc({ ownerUserId: "bob" })));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, path)));
  });

  it("denies a record that leaves the AnalysisRecord shape", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const created = paceDoc();
    await assertFails(setDoc(doc(db, path), paceDoc({ athleteId: "other" })));
    await assertFails(setDoc(doc(db, path), paceDoc({ createdAt: new Date() })));
    await assertFails(setDoc(doc(db, path), paceDoc({ createdAt: "2026-10-19T04:59:13Z" })));
    await assertFails(setDoc(doc(db, path), { ...created, paceInput: { distance: "500" } }));
    const { decayPercent: _removed, ...paceWithoutDecay } = created.pace;
    await assertFails(setDoc(doc(db, path), { ...created, pace: paceWithoutDecay }));
    await assertFails(
      setDoc(doc(db, path), {
        ...created,
        provenance: {
          ...created.provenance,
          model: { ...created.provenance.model, modelVersion: "other" },
        },
      }),
    );
    await assertFails(
      setDoc(doc(db, `${USERS}/alice/analyses/Not_Valid`), paceDoc({ id: "Not_Valid" })),
    );
  });

  it("denies changing createdAt or athleteId", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, path), paceDoc()));
    await assertFails(setDoc(doc(db, path), paceDoc({ createdAt: "2026-10-20T00:00:00.000Z" })));
    await assertFails(setDoc(doc(db, path), paceDoc({ athleteId: "other" })));
  });

  it("lets the owner save a biomechanics record and rejects an 11th frame", async () => {
    const sample = samplePoseFrame({
      tracking: emptyTrackingState(),
      support: emptySupportTracker(),
      landmarks: landmarksFromPoints({
        11: { x: 0.42, y: 0.2, visibility: 0.9 },
        12: { x: 0.58, y: 0.2, visibility: 0.9 },
        23: { x: 0.44, y: 0.5, visibility: 0.9 },
        24: { x: 0.56, y: 0.5, visibility: 0.9 },
        25: { x: 0.46, y: 0.7, visibility: 0.9 },
        26: { x: 0.6, y: 0.72, visibility: 0.9 },
        27: { x: 0.48, y: 0.9, visibility: 0.9 },
        28: { x: 0.62, y: 0.92, visibility: 0.9 },
      }),
      timeSeconds: 1.5,
      supportMode: "auto",
    }).sample;
    const record: BiomechAnalysisRecord = buildBiomechAnalysisRecord({
      id: "biomech-abc",
      ownerUserId: "alice",
      createdAt: "2026-10-19T07:00:00.000Z",
      samples: [sample],
    });
    const biomechPath = `${USERS}/alice/analyses/biomech-abc`;
    const db = env.authenticatedContext("alice").firestore();
    const withLandmarks = {
      ...record,
      poseFrames: record.poseFrames.map((frame) => ({
        ...frame,
        landmarks: [{ index: 0, x: 0.1, y: 0.2, ignored: true }],
      })),
    };
    await assertSucceeds(setDoc(doc(db, biomechPath), withLandmarks));
    await assertFails(
      setDoc(doc(db, biomechPath), {
        ...record,
        poseFrames: Array.from({ length: 11 }, () => record.poseFrames[0]),
      }),
    );
    await assertFails(
      setDoc(doc(db, biomechPath), {
        ...record,
        poseFrames: [{ timeSeconds: 1 }],
      }),
    );
    await assertFails(
      setDoc(doc(db, biomechPath), {
        ...record,
        provenance: { ...record.provenance, algorithmVersion: "other" },
      }),
    );
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(setDoc(doc(bob, biomechPath), { ...record, ownerUserId: "bob" }));
  });
});
