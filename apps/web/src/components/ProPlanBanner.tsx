import { Link } from "react-router-dom";

import { tPro } from "@/shared/i18n/pro-messages";
import type { Locale } from "@/shared/i18n/translator";

type ProPlanBannerProps = {
  isPro: boolean;
  locale: Locale;
  className?: string;
};

export function ProPlanBanner({ isPro, locale, className = "" }: ProPlanBannerProps) {
  if (isPro) {
    return (
      <div
        className={`rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className}`}
      >
        <p className="text-sm font-semibold text-emerald-900">
          {tPro(locale, "pro.banner.active.title")}
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {tPro(locale, "pro.banner.active.body")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}
    >
      <p className="text-sm font-semibold text-amber-900">
        {tPro(locale, "pro.banner.free.title")}
      </p>
      <p className="mt-1 text-xs text-amber-800">
        {tPro(locale, "pro.banner.free.body")}
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-amber-900 underline"
      >
        {tPro(locale, "pro.banner.free.settings")}
      </Link>
    </div>
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
    <div
      className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 ${className}`}
      role="status"
    >
      <p className="text-sm font-semibold text-amber-900">
        {tPro(locale, "pro.locked.title")}
      </p>
      <p className="mt-1 text-sm text-amber-800">{message}</p>
      <Link
        to="/settings"
        className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-amber-900 underline"
      >
        {tPro(locale, "pro.locked.settings")}
      </Link>
    </div>
  );
}
