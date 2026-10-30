import { isRaceDayEnabled } from "@/app/features";
import { BiomechanicsPage } from "@/modules/analysis/biomechanics/BiomechanicsPage";
import { RaceVideoBannerGate } from "@/modules/analysis/biomechanics/RaceVideoBannerGate";

export function AnalysisBiomechanicsPage() {
  // The flag is a build-time constant: with it off the gate and the banner are not in the build,
  // and nothing here reads Race Day data (ADR-010).
  if (!isRaceDayEnabled()) return <BiomechanicsPage />;

  return (
    <div className="grid gap-6">
      <RaceVideoBannerGate />
      <BiomechanicsPage />
    </div>
  );
}
