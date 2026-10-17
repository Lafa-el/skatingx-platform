import { PagePlaceholder } from "@/components/PagePlaceholder";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis } from "@/shared/i18n/analysis-messages";

export function AnalysisHubPage() {
  const locale = useLocale();

  return (
    <PagePlaceholder
      title={tAnalysis(locale, "analysis.hub.title")}
      description={tAnalysis(locale, "analysis.hub.description")}
    />
  );
}
