import type { FeedbackSource } from "@skatingx/skating-domain";
import { onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from "firebase/firestore";

import { analysesCollectionRef } from "./refs";

export type SavedAnalysisSource = FeedbackSource & { readonly kind: "pace" | "biomech" };

function findingCodes(value: unknown): { code: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("code" in item)) return [];
    const code = item.code;
    return typeof code === "string" ? [{ code }] : [];
  });
}

/**
 * Read the saved pace and biomechanics documents. This does not write.
 * The caller unsubscribes when the page goes away.
 */
export function subscribeToSavedAnalyses(
  db: Firestore,
  userId: string,
  onData: (sources: readonly SavedAnalysisSource[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const saved = query(analysesCollectionRef(db, userId), orderBy("createdAt", "desc"));
  return onSnapshot(
    saved,
    (snapshot) => {
      const sources: SavedAnalysisSource[] = [];
      for (const entry of snapshot.docs) {
        const data = entry.data();
        if (typeof data.createdAt !== "string") continue;
        const hasPace = data.pace != null;
        const hasBiomech = data.poseFrames != null;
        const kind: SavedAnalysisSource["kind"] | null = hasPace && !hasBiomech ? "pace" : hasBiomech && !hasPace ? "biomech" : null;
        if (!kind) continue;
        const id = typeof data.id === "string" && data.id.length > 0 ? data.id : entry.id;
        sources.push({ kind, id, createdAt: data.createdAt, findings: findingCodes(data.findings) });
      }
      onData(sources);
    },
    onError,
  );
}
