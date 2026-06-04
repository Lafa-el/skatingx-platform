import { useFirestoreStatus } from "@/hooks/firestore";

type FirestoreStatusBannerProps = {
  className?: string;
};

export function FirestoreStatusBanner({
  className = "",
}: FirestoreStatusBannerProps) {
  const { ready, connectivityError } = useFirestoreStatus();

  if (!ready && !connectivityError) {
    return (
      <p
        className={`text-sm text-slate-500 ${className}`.trim()}
        aria-live="polite"
      >
        Loading your data…
      </p>
    );
  }

  if (connectivityError) {
    return (
      <p
        className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`.trim()}
        role="alert"
      >
        Unable to connect to Firestore: {connectivityError}
      </p>
    );
  }

  return null;
}
