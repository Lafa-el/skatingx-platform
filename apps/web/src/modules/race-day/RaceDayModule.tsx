import { Navigate, Route, Routes } from "react-router-dom";

import { RaceDayLayout } from "./RaceDayLayout";
import { ResultsPage } from "./pages/ResultsPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SetupPage } from "./pages/SetupPage";
import { SummaryPage } from "./pages/SummaryPage";
import { TodayPage } from "./pages/TodayPage";
import { VideosPage } from "./pages/VideosPage";

/**
 * Entry point of the Race Day module. It is the default export so the app can load the whole
 * module (layout, pages, text) as one lazy chunk (ADR-001 D3). Paths here are relative to
 * `/race-day`.
 */
export default function RaceDayModule() {
  return (
    <Routes>
      <Route element={<RaceDayLayout />}>
        <Route index element={<TodayPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/race-day" replace />} />
      </Route>
    </Routes>
  );
}
