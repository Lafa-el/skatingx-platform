import { ErrorNotice } from "@skatingx/ui";

import { useFirestoreStatus } from "@/hooks/firestore";
import { useLocale } from "@/hooks/useLocale";
import { tShell } from "@/shared/i18n/shell-messages";

type FirestoreStatusBannerProps = {
  className?: string;
};

export function FirestoreStatusBanner({
  className = "",
}: FirestoreStatusBannerProps) {
  const locale = useLocale();
  const { ready, connectivityError } = useFirestoreStatus();

  if (!ready && !connectivityError) {
    return (
      <p
        className={`text-sm text-brand-navy/70 ${className}`.trim()}
        aria-live="polite"
      >
        {tShell(locale, "shell.status.loading")}
      </p>
    );
  }

  if (connectivityError) {
    return (
      <ErrorNotice className={className}>
        {tShell(locale, "shell.status.connectError", { detail: connectivityError })}
      </ErrorNotice>
    );
  }

  return null;
}
