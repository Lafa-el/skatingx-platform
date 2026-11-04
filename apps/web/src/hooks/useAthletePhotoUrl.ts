import { getFirebaseStorage } from "@skatingx/firebase-client";
import { getDownloadURL, ref } from "firebase/storage";
import { useEffect, useState } from "react";

/** Fresh download URL for the stored path. A missing path or a failed read stays a letter. */
export function useAthletePhotoUrl(storagePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      return;
    }
    const storage = getFirebaseStorage();
    if (!storage) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    getDownloadURL(ref(storage, storagePath))
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return url;
}
