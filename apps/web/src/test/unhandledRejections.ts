/**
 * Collects promise rejections that nothing handled while a test runs. A click handler that awaits
 * an action and does not catch leaves one behind ("Uncaught (in promise)" in the browser), and
 * the test would otherwise pass without noticing.
 */
export function watchUnhandledRejections() {
  const reasons: unknown[] = [];
  const onRejection = (reason: unknown) => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  return {
    /** Waits long enough for Node to report a rejection nobody handled, then returns them. */
    async settled(): Promise<unknown[]> {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return reasons;
    },
    stop() {
      process.off("unhandledRejection", onRejection);
    },
  };
}

/** The error a failed Firestore write throws: a message and a code. */
export const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
