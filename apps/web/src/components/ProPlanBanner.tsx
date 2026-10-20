import { Notice } from "@skatingx/ui";

import { tPro } from "@/shared/i18n/pro-messages";
import { tSettingsPage } from "@/shared/i18n/settings-page-messages";
import type { Locale } from "@/shared/i18n/translator";

type ProPlanBannerProps = {
  isPro: boolean;
  locale: Locale;
  className?: string;
};

export function ProPlanBanner({ isPro, locale, className = "" }: ProPlanBannerProps) {
  if (isPro) {
    return (
      <Notice tone="success" title={tSettingsPage(locale, "settings.plan.proTitle")} className={className}>
        <p className="text-xs">{tPro(locale, "pro.banner.active.body")}</p>
      </Notice>
    );
  }

  return (
    <Notice tone="pending" title={tSettingsPage(locale, "settings.plan.freeTag")} className={className}>
      <p className="text-xs">{tPro(locale, "pro.banner.free.body")}</p>
      <p className="text-xs">{tSettingsPage(locale, "settings.plan.manual")}</p>
    </Notice>
  );
}

/** `message` is what the page says about the locked feature, already in the active language. */
export function ProLockedCard({
  locale,
  message,
  className = "",
}: {
  locale: Locale;
  message: string;
  className?: string;
}) {
  return (
    <Notice tone="pending" role="status" title={tPro(locale, "pro.locked.title")} className={className}>
      <p className="text-sm">{message}</p>
      <p className="mt-1 text-xs">{tSettingsPage(locale, "settings.plan.manual")}</p>
    </Notice>
  );
}
