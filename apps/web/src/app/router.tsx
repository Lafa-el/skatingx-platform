import { Navigate, Route, Routes } from "react-router-dom";

import { RaceDayRoute } from "@/app/RaceDayRoute";
import { AppShell } from "@/layouts/AppShell";
import { AnalysisLayout } from "@/layouts/AnalysisLayout";
import { TrainingLayout } from "@/layouts/TrainingLayout";
import { AiCoachPage } from "@/pages/AiCoachPage";
import { AnalysisBiomechanicsPage } from "@/pages/analysis/AnalysisBiomechanicsPage";
import { AnalysisEquipmentPage } from "@/pages/analysis/AnalysisEquipmentPage";
import { AnalysisHubPage } from "@/pages/analysis/AnalysisHubPage";
import { AnalysisPacingPage } from "@/pages/analysis/AnalysisPacingPage";
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
        <Route path="biomechanics" element={<AnalysisBiomechanicsPage />} />
        <Route path="pacing" element={<AnalysisPacingPage />} />
        <Route path="equipment" element={<AnalysisEquipmentPage />} />
      </Route>

      <Route path="/race-day/*" element={<RaceDayRoute />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
