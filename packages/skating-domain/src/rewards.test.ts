import { describe, expect, it } from "vitest";

import { localizeRedemptionName } from "./rewards";

const catalog = [
  { id: "movie", nameZh: "电影之夜", nameEn: "Movie night" },
  { id: "blank-en", nameZh: "只有中文", nameEn: "  " },
];

describe("localizeRedemptionName", () => {
  it("shows the catalog name in the language asked for, not the name stored when it was redeemed", () => {
    const redemption = { rewardId: "movie", rewardName: "Movie night" };
    expect(localizeRedemptionName(redemption, catalog, "zh")).toBe("电影之夜");
    expect(localizeRedemptionName(redemption, catalog, "en")).toBe("Movie night");
    expect(localizeRedemptionName({ rewardId: "movie", rewardName: "电影之夜" }, catalog, "en")).toBe(
      "Movie night",
    );
  });

  it("keeps the stored name for a reward that is not in the catalog any more", () => {
    const redemption = { rewardId: "removed", rewardName: "Old reward" };
    expect(localizeRedemptionName(redemption, catalog, "zh")).toBe("Old reward");
    expect(localizeRedemptionName(redemption, [], "en")).toBe("Old reward");
  });

  it("keeps the stored name when the catalog has no name in that language", () => {
    const redemption = { rewardId: "blank-en", rewardName: "只有中文" };
    expect(localizeRedemptionName(redemption, catalog, "en")).toBe("只有中文");
  });

  it("matches by id only, never by name", () => {
    const redemption = { rewardId: "other", rewardName: "Movie night" };
    expect(localizeRedemptionName(redemption, catalog, "zh")).toBe("Movie night");
  });
});
