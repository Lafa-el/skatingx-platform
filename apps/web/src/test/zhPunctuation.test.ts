import { describe, expect, it } from "vitest";

import { halfWidthPunctuation } from "./zhPunctuation";

describe("halfWidthPunctuation", () => {
  it("finds a half-width mark on either side of a Chinese character", () => {
    expect(halfWidthPunctuation("数据服务:{detail}")).toEqual(["务:"]);
    expect(halfWidthPunctuation("目标(选填)")).toEqual(["标(", "填)"]);
    expect(halfWidthPunctuation("Heat,下一组")).toEqual([",下"]);
    expect(halfWidthPunctuation("删除?")).toEqual(["除?"]);
    expect(halfWidthPunctuation("真的吗?好")).toEqual(["吗?"]);
  });

  it("accepts full-width marks and marks that do not touch Chinese", () => {
    expect(halfWidthPunctuation("数据服务：{detail}")).toEqual([]);
    expect(halfWidthPunctuation("目标（选填）")).toEqual([]);
    expect(halfWidthPunctuation("示例：49.80、0:49.80、1:44.23 或 M:SS.xx")).toEqual([]);
    expect(halfWidthPunctuation("以 http:// 或 https:// 开头")).toEqual([]);
    expect(halfWidthPunctuation("版本:race-summary/1")).toEqual(["本:"]);
  });
});
