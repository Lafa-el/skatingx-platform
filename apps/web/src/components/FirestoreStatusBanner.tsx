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
        className={`text-sm text-slate-500 ${className}`.trim()}
        aria-live="polite"
      >
        {tShell(locale, "shell.status.loading")}
      </p>
    );
  }

  if (connectivityError) {
    return (
      <p
        className={`break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`.trim()}
        role="alert"
      >
        {tShell(locale, "shell.status.connectError", { detail: connectivityError })}
      </p>
    );
  }

  return null;
}
