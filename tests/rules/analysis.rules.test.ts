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

  describe("distance and the segment times", () => {
    const makeFor = (distance: "500" | "777" | "1000", id: string) => {
      const series = pacingDistanceConfigs[distance].defaults;
      const result = calculatePacingAnalysis(distance, [...series], series);
      if (!result.ok) throw new Error(result.message);
      return buildPaceAnalysisRecord({
        id,
        ownerUserId: "alice",
        createdAt: "2026-10-19T04:59:13.497Z",
        distance,
        splits: [...series],
        benchmark: series,
        analysis: result.analysis,
      });
    };

    it("lets the owner write a complete record for each of the three distances", async () => {
      const db = env.authenticatedContext("alice").firestore();
      for (const distance of ["500", "777", "1000"] as const) {
        const id = `pace-${distance}-ok`;
        await assertSucceeds(setDoc(doc(db, `${USERS}/alice/analyses/${id}`), makeFor(distance, id)));
      }
    });

    it("denies a record with no distance, or a distance outside the three", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const { distance: _removed, ...withoutDistance } = paceDoc();
      await assertFails(setDoc(doc(db, path), withoutDistance));
      await assertFails(setDoc(doc(db, path), paceDoc({ distance: "800" })));
      await assertFails(setDoc(doc(db, path), paceDoc({ distance: 500 })));
    });

    it("denies a pace output with no splits or no benchmark (an old app writing under the new rules)", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const created = paceDoc();
      const { splits: _s, ...noSplits } = created.pace;
      const { benchmark: _b, ...noBenchmark } = created.pace;
      await assertFails(setDoc(doc(db, path), { ...created, pace: noSplits }));
      await assertFails(setDoc(doc(db, path), { ...created, pace: noBenchmark }));
    });

    it("denies splits and benchmark of different lengths", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const created = paceDoc();
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, benchmark: [8, 10.3, 10.4, 10.5] } }));
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, splits: [7.2, 9.3, 9.5, 10.4, 11.2, 1] } }));
    });

    it("denies a length that does not match the distance, both ways", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const created = paceDoc();
      await assertFails(setDoc(doc(db, path), paceDoc({ distance: "777" })));
      const long = makeFor("1000", "pace-500-abc");
      await assertFails(setDoc(doc(db, path), { ...long, distance: "500" }));
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, splits: [], benchmark: [] } }));
    });

    it("denies an entry that is not a number, at the first and the last index", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const created = paceDoc();
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, splits: ["7.2", 9.3, 9.5, 10.4, 11.2] } }));
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, benchmark: [8, 10.3, 10.4, 10.5, null] } }));
      const nineth = makeFor("1000", "pace-1000-bad");
      const splitsWithBadLast = [...nineth.pace.splits.slice(0, 8), "10.9"];
      await assertFails(
        setDoc(doc(db, `${USERS}/alice/analyses/pace-1000-bad`), {
          ...nineth,
          pace: { ...nineth.pace, splits: splitsWithBadLast },
        }),
      );
    });

    it("denies a stray extra key next to the new ones", async () => {
      const db = env.authenticatedContext("alice").firestore();
      const created = paceDoc();
      await assertFails(setDoc(doc(db, path), { ...created, pace: { ...created.pace, extra: 1 } }));
    });
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
