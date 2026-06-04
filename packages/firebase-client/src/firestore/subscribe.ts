import { onSnapshot, type DocumentReference } from "firebase/firestore";

export type DocSubscription = {
  unsubscribe: () => void;
};

export function subscribeToDocument<T>(
  ref: DocumentReference,
  onData: (data: T | null) => void,
  onError: (message: string) => void,
): DocSubscription {
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as T) : null);
    },
    (error) => {
      onError(error.message);
    },
  );
  return { unsubscribe };
}
