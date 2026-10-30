import { parseRaceVideoLink, RACE_VIDEO_PARAM } from "@skatingx/skating-domain";
import { lazy, Suspense, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useIsPro } from "@/hooks/useIsPro";

// The banner reads Race Day data, so its code (and the repository readers it pulls in) is only
// downloaded once every gate below has passed. `@__PURE__` lets the bundler drop this whole file,
// banner chunk included, when the feature flag is off and nothing references the gate.
const RaceVideoBanner = /* @__PURE__ */ lazy(() => import("./RaceVideoBanner"));

/**
 * The gates in front of the Race Day video banner (ADR-010), in order, each before any read:
 * a well-formed `raceVideo` link, then PRO. The caller has already checked the feature flag.
 *
 * These are UX gates, not security boundaries (ADR-001 D4): `isPro` is client-writable and the
 * rules are unchanged. They keep non-PRO users from seeing PRO content by typing the link, and
 * from causing reads they have no way to use. A failed gate shows nothing and the page works.
 */
export function RaceVideoBannerGate() {
  // `useLocation` is already in the main bundle; `useSearchParams` would add ~0.9 kB to it.
  const { search } = useLocation();
  const raw = useMemo(() => new URLSearchParams(search).get(RACE_VIDEO_PARAM), [search]);
  const link = useMemo(() => parseRaceVideoLink(raw), [raw]);
  const { isPro, loading, error } = useIsPro();

  if (!link) return null;
  if (loading || error || !isPro) return null;

  return (
    <Suspense fallback={null}>
      <RaceVideoBanner link={link} />
    </Suspense>
  );
}
