// @vitest-environment happy-dom
import type { SavedAnalysisDetail } from "@skatingx/firebase-client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test/dom";

import { AnalysisBiomechDetailPage } from "./AnalysisBiomechDetailPage";

const api = vi.hoisted(() => ({
  getSavedAnalysis: vi.fn(),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  getSavedAnalysis: (...args: unknown[]) => api.getSavedAnalysis(...args),
}));

afterEach(() => {
  api.getSavedAnalysis.mockReset();
});

const record: SavedAnalysisDetail = {
  kind: "biomech",
  id: "bio-1",
  createdAt: "2026-10-18T00:00:00.000Z",
  distance: null,
  findings: [{ code: "biomech.knee.high" }, { code: "biomech.not-mapped" }],
  biomech: { avgKnee: 110, avgLean: 45, readableFrames: 1 },
  pace: null,
  frames: [
    {
      timeSeconds: 1.2,
      kneeAngle: 100,
      leanAngle: 40,
      pelvisHeight: 42.5,
      supportSide: "left",
      supportConfidence: 80,
      readable: true,
      unreadableReason: null,
      manual: true,
    },
    {
      timeSeconds: 2,
      kneeAngle: null,
      leanAngle: null,
      pelvisHeight: null,
      supportSide: "unknown",
      supportConfidence: null,
      readable: false,
      unreadableReason: "occlusion-or-jump",
      manual: false,
    },
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/analysis/biomechanics/bio-1"]}>
      <Routes>
        <Route path="/analysis/biomechanics/:analysisId" element={<AnalysisBiomechDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AnalysisBiomechDetailPage", () => {
  it("lists every saved frame, including an unreadable row and a manual mark", async () => {
    let settle: (value: SavedAnalysisDetail) => void = () => undefined;
    api.getSavedAnalysis.mockReturnValue(new Promise<SavedAnalysisDetail>((resolve) => {
      settle = resolve;
    }));
    renderDetail();
    expect(screen.getByRole("status").textContent).toContain("正在读取…");

    settle(record);
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: "逐帧详情" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回总览" }).getAttribute("href")).toBe("/analysis");
    const summary = document.querySelector("dl")?.textContent ?? "";
    expect(summary).toContain("110°");
    expect(summary).toContain("45°");
    expect(summary).toContain("将本周侧重设为「技术基础与弯道控制」。");
    expect(summary).toContain("biomech.not-mapped");
    expect(screen.getByRole("columnheader", { name: "骨盆实时高度 (Pelvis)" })).toBeTruthy();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("1.20");
    expect(rows[0]?.textContent).toContain("100°");
    expect(rows[0]?.textContent).toContain("40°");
    expect(rows[0]?.textContent).toContain("42.5%");
    expect(rows[0]?.textContent).toContain("左腿 80%");
    expect(rows[0]?.textContent).toContain("可判读 · 人工标记");
    expect(rows[1]?.textContent).toContain("2.00");
    expect(rows[1]?.textContent).toContain("occlusion-or-jump");
    expect(rows[1]?.textContent).not.toContain("遮挡");
    expect(rows[1]?.textContent).not.toContain("人工标记");
  });

  it("shows the missing state when the record is not there", async () => {
    api.getSavedAnalysis.mockResolvedValue(null);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("无此记录");
    });
    expect(screen.getByRole("link", { name: "返回总览" }).getAttribute("href")).toBe("/analysis");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the error state when the read fails", async () => {
    api.getSavedAnalysis.mockRejectedValue(new Error("denied"));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("逐帧详情这次没有读出来。");
    });
    expect(screen.getByRole("link", { name: "返回总览" }).getAttribute("href")).toBe("/analysis");
    expect(screen.queryByRole("table")).toBeNull();
  });
});
