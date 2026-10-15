import { Navigate, Route, Routes } from "react-router-dom";

import { RaceDayLayout } from "./RaceDayLayout";
import { SectionPlaceholderPage } from "./pages/SectionPlaceholderPage";
import { SetupPage } from "./pages/SetupPage";

/**
 * Entry point of the Race Day module. It is the default export so the app can load the whole
 * module (layout, pages, text) as one lazy chunk (ADR-001 D3). Paths here are relative to
 * `/race-day`.
 */
export default function RaceDayModule() {
  return (
    <Routes>
      <Route element={<RaceDayLayout />}>
        <Route index element={<SectionPlaceholderPage titleKey="raceDay.tab.today" />} />
        <Route path="schedule" element={<SectionPlaceholderPage titleKey="raceDay.tab.schedule" />} />
        <Route path="results" element={<SectionPlaceholderPage titleKey="raceDay.tab.results" />} />
        <Route path="videos" element={<SectionPlaceholderPage titleKey="raceDay.tab.videos" />} />
        <Route path="summary" element={<SectionPlaceholderPage titleKey="raceDay.tab.summary" />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/race-day" replace />} />
      </Route>
    </Routes>
  );
}
