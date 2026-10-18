import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  /**
   * `default` is the look every page has today. `raised` and `hero` are the UI v1 looks.
   * `hero` is flame-to-energy, so everything on it is navy (white fails on the energy end).
   */
  variant?: "default" | "raised" | "hero";
};

const looks = {
  default: {
    card: "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
    title: "text-sm font-semibold text-slate-900",
    body: "mt-2 text-sm text-slate-600",
  },
  raised: {
    card: "rounded-card border border-brand-navy/10 bg-white p-4 shadow-card",
    title: "text-sm font-semibold text-brand-navy",
    body: "mt-2 text-sm text-brand-navy/80",
  },
  hero: {
    // The slanted stripe is decoration only, drawn with a pseudo-element so it adds no markup.
    card: "relative isolate overflow-hidden rounded-card p-4 text-brand-navy shadow-card sx-energy-gradient before:pointer-events-none before:absolute before:inset-y-0 before:right-[16%] before:-z-10 before:w-8 before:-skew-x-[20deg] before:bg-brand-flame before:content-['']",
    title: "text-sm font-semibold text-brand-navy",
    body: "mt-2 text-sm text-brand-navy",
  },
} as const;

export function Card({ title, children, className = "", variant = "default" }: CardProps) {
  const look = looks[variant];
  return (
    <article className={`${look.card} ${className}`.trim()}>
      <h3 className={look.title}>{title}</h3>
      {children ? <div className={look.body}>{children}</div> : null}
    </article>
  );
}
