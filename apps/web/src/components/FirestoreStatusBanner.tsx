import { useFirestoreStatus } from "@/hooks/firestore";

type FirestoreStatusBannerProps = {
  className?: string;
};

export function FirestoreStatusBanner({
  className = "",
}: FirestoreStatusBannerProps) {
  const { ready, bootstrapError, persistenceNote } = useFirestoreStatus();

  if (bootstrapError) {
    return (
      <p
        className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`.trim()}
        role="alert"
      >
        Firestore: {bootstrapError}
      </p>
    );
  }

  if (!ready) {
    return (
      <p
        className={`text-sm text-slate-500 ${className}`.trim()}
        aria-live="polite"
      >
        Loading your data…
      </p>
    );
  }

  if (persistenceNote) {
    return (
      <p className={`text-xs text-slate-400 ${className}`.trim()}>
        Offline cache: {persistenceNote}
      </p>
    );
  }

  return null;
}
