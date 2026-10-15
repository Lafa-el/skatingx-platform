/**
 * Firestore with offline persistence resolves a write only after the server acknowledged it.
 * At a venue with bad signal that can take minutes, and a form stuck on "saving" is worse than
 * useless. The write itself is safe (it is queued locally and shown immediately), so after a
 * short wait we tell the user it is saved on the device and will sync later, and keep watching
 * the promise: if the server later refuses it, `onLateError` must surface that, because the
 * entry will disappear from the list when Firestore rolls the local write back.
 */

export type WriteOutcome = { kind: "saved" } | { kind: "queued" };

export const QUEUED_AFTER_MS = 4000;

export function settleWrite(
  write: Promise<unknown>,
  options: { queuedAfterMs?: number; onLateError: (error: unknown) => void },
): Promise<WriteOutcome> {
  const queuedAfterMs = options.queuedAfterMs ?? QUEUED_AFTER_MS;

  return new Promise<WriteOutcome>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ kind: "queued" });
    }, queuedAfterMs);

    write.then(
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ kind: "saved" });
        }
      },
      (error: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        } else {
          options.onLateError(error);
        }
      },
    );
  });
}
