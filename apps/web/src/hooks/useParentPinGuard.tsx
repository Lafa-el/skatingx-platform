import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { ParentPinDialog } from "@/components/ParentPinDialog";
import {
  parentPinAllows,
  parentPinConfigured,
  parentPinMatches,
  readParentPinUnlock,
  writeParentPinUnlock,
  type ParentPinAction,
} from "@/shared/parentPin";

export function useParentPinGuard() {
  const { uid } = useAuth();
  const { data: settings, loading } = useUserSettings();
  const settingsReady = !loading;
  const configured = settingsReady && parentPinConfigured(settings?.parentPinHash, settings?.parentPinSalt);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const guard = useCallback(
    (action: ParentPinAction, run: () => void) => {
      const unlocked = readParentPinUnlock(sessionStorage, uid);
      if (!parentPinAllows({ action, settingsReady, configured, unlocked })) {
        if (!settingsReady) {
          return;
        }
        setWrong(false);
        setPending(() => run);
        return;
      }
      run();
    },
    [configured, settingsReady, uid],
  );

  const cancel = useCallback(() => {
    setPending(null);
    setWrong(false);
  }, []);

  const submit = useCallback(
    async (pin: string) => {
      const hash = settings?.parentPinHash;
      const salt = settings?.parentPinSalt;
      if (!uid || typeof hash !== "string" || typeof salt !== "string") {
        setWrong(true);
        return;
      }
      setBusy(true);
      try {
        const ok = await parentPinMatches(pin, hash, salt);
        if (!ok) {
          setWrong(true);
          return;
        }
        writeParentPinUnlock(sessionStorage, uid);
        const run = pending;
        setPending(null);
        setWrong(false);
        run?.();
      } finally {
        setBusy(false);
      }
    },
    [pending, settings?.parentPinHash, settings?.parentPinSalt, uid],
  );

  const dialog = (
    <ParentPinDialog
      open={pending !== null}
      wrong={wrong}
      busy={busy}
      onCancel={cancel}
      onSubmit={(pin) => {
        void submit(pin);
      }}
    />
  );

  return { guard, dialog, configured };
}
