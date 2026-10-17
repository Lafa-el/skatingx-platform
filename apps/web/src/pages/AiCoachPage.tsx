import { PagePlaceholder } from "@/components/PagePlaceholder";
import { useLocale } from "@/hooks/useLocale";
import { tAiCoach } from "@/shared/i18n/ai-coach-messages";

export function AiCoachPage() {
  const locale = useLocale();

  return (
    <PagePlaceholder
      title={tAiCoach(locale, "aiCoach.title")}
      description={tAiCoach(locale, "aiCoach.description")}
    />
  );
}
