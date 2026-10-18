/**
 * Pages already restyled for UI v1 (docs/design/ui-redesign-v1.md, section 4). Only these get the
 * warm-white page colour.
 *
 * Why not every page at once: their small grey text was set for a white or light-grey page, and
 * `text-slate-500` is 4.37:1 on warm white, under the 4.5:1 that small text needs. So a page joins
 * this list in the same change that deepens its small text to the navy tints, and that change adds
 * a test that no old grey text class is left on the page (see `@/test/legacyLook`).
 *
 * An entry matches its own path and everything below it (`/training` covers `/training/shop`).
 */
export const ICE_PAGES: readonly string[] = ["/settings", "/dashboard"];

export function isIcePage(pathname: string): boolean {
  return ICE_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
