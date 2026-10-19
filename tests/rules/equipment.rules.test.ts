import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { buildEquipmentHistoryRecord, type EquipmentHistoryRecord } from "@skatingx/skating-domain";
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

const recordId = "equip-1";
const path = `${USERS}/alice/athletes/lindsay/equipment/main/records/${recordId}`;

function equipmentDoc(overrides: Record<string, unknown> = {}): EquipmentHistoryRecord & Record<string, unknown> {
  return {
    ...buildEquipmentHistoryRecord({
      id: recordId,
      ownerUserId: "alice",
      createdAt: "2026-10-19T06:00:00.000Z",
      symptomKey: "slide",
      symptomText: "弯道咬冰不足，弯中有向外侧滑的感觉。",
      height: "150",
      weight: "40",
      bladeLength: "15",
      leftRocker: Array.from({ length: 21 }, (_, index) => ({ point: index - 10, value: "12" })),
      rightRocker: [{ point: 0, value: "11" }],
      offsets: { leftFront: "内2mm", leftRear: "", rightFront: "", rightRear: "" },
      bend: { front: "18", middle: "", rear: "" },
      adjustmentType: "unchanged",
      feedbackRating: "not-skated",
      adjustmentNotes: "",
      missingCore: false,
      ruleHints: ["当前已填数据未触发明显异常规则。建议保存本次记录，结合上冰反馈做调整前后对比。"],
    }),
    ...overrides,
  };
}

describe("athletes/lindsay/equipment/main/records/{recordId}", () => {
  it("lets the owner create, read, update, and delete a contract equipment record", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const created = equipmentDoc();
    await assertSucceeds(setDoc(doc(db, path), created));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(setDoc(doc(db, path), { ...created, adjustmentNotes: "合成复核" }));
    await assertSucceeds(deleteDoc(doc(db, path)));
  });

  it("denies another user and an unauthenticated caller", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), equipmentDoc());
    });
    const other = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(other, path)));
    await assertFails(setDoc(doc(other, path), equipmentDoc({ ownerUserId: "bob" })));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, path)));
  });

  it("denies a record that leaves the equipment history shape", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const created = equipmentDoc();
    await assertFails(setDoc(doc(db, path), equipmentDoc({ athleteId: "other" })));
    await assertFails(setDoc(doc(db, path), equipmentDoc({ createdAt: new Date() })));
    await assertFails(setDoc(doc(db, path), equipmentDoc({ createdAt: "2026-10-19T06:00:00Z" })));
    await assertFails(setDoc(doc(db, path), { ...created, video: "clip.mp4" }));
    await assertFails(
      setDoc(doc(db, path), {
        ...created,
        provenance: { ...created.provenance, algorithmVersion: "other" },
      }),
    );
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
      setDoc(doc(db, `${USERS}/alice/athletes/lindsay/equipment/main/records/Not_Valid`), equipmentDoc({ id: "Not_Valid" })),
    );
    await assertFails(
      setDoc(
        doc(db, path),
        equipmentDoc({
          leftRocker: Array.from({ length: 22 }, (_, index) => ({ point: 0, value: String(index) })),
        }),
      ),
    );
  });

  it("denies changing createdAt or athleteId", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, path), equipmentDoc()));
    await assertFails(setDoc(doc(db, path), equipmentDoc({ createdAt: "2026-10-20T00:00:00.000Z" })));
    await assertFails(setDoc(doc(db, path), equipmentDoc({ athleteId: "other" })));
  });

  it("does not leave another athlete id's equipment history on the broad owner rule", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(db, `${USERS}/alice/athletes/other/equipment/main/records/equip-1`), { n: 1 }),
    );
  });
});
