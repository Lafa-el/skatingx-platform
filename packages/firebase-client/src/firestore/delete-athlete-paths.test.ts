import { paths } from "@skatingx/schema";
import { describe, expect, it } from "vitest";

import { athleteDeleteCollectionPaths } from "./delete-athlete";

const userId = "user-1";
const athleteId = "lindsay";

describe("athleteDeleteCollectionPaths", () => {
  it("matches the path each live collection ref is built from, and every path has an odd segment count", () => {
    const table = athleteDeleteCollectionPaths(userId, athleteId);
    const live = {
      pointsLedger: paths.pointsLedgerCollection(userId, athleteId),
      taskHistory: paths.taskHistoryCollection(userId, athleteId),
      trainingRecords: paths.trainingRecordsCollection(userId, athleteId),
      redemptions: paths.trainingRedemptionsCollection(userId, athleteId),
      equipmentHistory: paths.equipmentHistoryCollection(userId, athleteId),
      analyses: paths.analysesCollection(userId),
    };

    expect(table).toEqual(live);
    for (const path of Object.values(table)) {
      expect(path.split("/").length % 2).toBe(1);
    }
  });
});
