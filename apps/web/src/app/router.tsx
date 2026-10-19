import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { RaceDayRoute } from "@/app/RaceDayRoute";
import { AppShell } from "@/layouts/AppShell";
import { AnalysisLayout } from "@/layouts/AnalysisLayout";
import { TrainingLayout } from "@/layouts/TrainingLayout";
import { AiCoachPage } from "@/pages/AiCoachPage";
import { AnalysisHubPage } from "@/pages/analysis/AnalysisHubPage";
const AnalysisBiomechanicsPage = lazy(() =>
  import("@/pages/analysis/AnalysisBiomechanicsPage").then((module) => ({
    default: module.AnalysisBiomechanicsPage,
  })),
);
const AnalysisPacingPage = lazy(() =>
  import("@/pages/analysis/AnalysisPacingPage").then((module) => ({ default: module.AnalysisPacingPage })),
);
const AnalysisEquipmentPage = lazy(() =>
  import("@/pages/analysis/AnalysisEquipmentPage").then((module) => ({ default: module.AnalysisEquipmentPage })),
);
import { AthletePage } from "@/pages/AthletePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TrainingAcademyPage } from "@/pages/training/TrainingAcademyPage";
import { TrainingHomePage } from "@/pages/training/TrainingHomePage";
import { TrainingRecordsPage } from "@/pages/training/TrainingRecordsPage";
import { TrainingShopPage } from "@/pages/training/TrainingShopPage";
import { TrainingTasksPage } from "@/pages/training/TrainingTasksPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/athlete" element={<AthletePage />} />
        <Route path="/ai-coach" element={<AiCoachPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/training" element={<TrainingLayout />}>
        <Route index element={<TrainingHomePage />} />
        <Route path="tasks" element={<TrainingTasksPage />} />
        <Route path="academy" element={<TrainingAcademyPage />} />
        <Route path="records" element={<TrainingRecordsPage />} />
        <Route path="shop" element={<TrainingShopPage />} />
      </Route>

      <Route path="/analysis" element={<AnalysisLayout />}>
        <Route index element={<AnalysisHubPage />} />
        <Route
          path="biomechanics"
          element={
            <Suspense fallback={<div className="min-h-11" />}>
              <AnalysisBiomechanicsPage />
            </Suspense>
          }
        />
        <Route
          path="pacing"
          element={
            <Suspense fallback={<div className="min-h-11" />}>
              <AnalysisPacingPage />
            </Suspense>
          }
        />
        <Route
          path="equipment"
          element={
            <Suspense fallback={<div className="min-h-11" />}>
              <AnalysisEquipmentPage />
            </Suspense>
          }
        />
      </Route>

      <Route path="/race-day/*" element={<RaceDayRoute />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
