import { useEffect, useState } from "react";

/** Letter when there is no photo, while the photo URL is loading, or when the image fails. */
export function Avatar({
  letter,
  photoUrl,
  size = "sm",
}: {
  letter: string;
  photoUrl?: string | null;
  size?: "sm" | "lg";
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [photoUrl]);
  const box = size === "lg" ? "h-16 w-16 text-lg" : "h-8 w-8 text-xs";
  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${box} shrink-0 rounded-full object-cover`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className={`sx-energy-gradient flex ${box} shrink-0 items-center justify-center rounded-full font-bold text-brand-navy`}
      aria-hidden
    >
      {letter}
    </span>
  );
}
