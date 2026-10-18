/**
 * Line icons for the main destinations, drawn here so no icon package is added. They are
 * decoration: every destination also has its text label, which is what a screen reader reads.
 */
const PATHS: Record<string, string> = {
  "/dashboard": "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20",
  "/training": "M13 2 4.5 13.5H11L10 22l9-12h-6.5z",
  "/analysis": "M4 20V10M10 20V4M16 20v-7M21 20H3",
  "/race-day": "M5 21V3M5 4h12l-2.5 4L17 12H5",
  "/ai-coach": "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z",
  "/settings": "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.5-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.5 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.5 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.5 2.4h4l.5-2.4a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.5z",
};

export function NavIcon({ to, className = "size-5" }: { to: string; className?: string }) {
  const d = PATHS[to];
  if (!d) return null;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
