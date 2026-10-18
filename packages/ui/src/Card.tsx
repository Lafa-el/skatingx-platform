import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  /**
   * `raised` is the everyday card; `hero` is flame-to-energy, so everything on it is navy
   * (white fails on the energy end).
   */
  variant?: "raised" | "hero";
};

const looks = {
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

export function Card({ title, children, className = "", variant = "raised" }: CardProps) {
  const look = looks[variant];
  return (
    <article className={`${look.card} ${className}`.trim()}>
      <h3 className={look.title}>{title}</h3>
      {children ? <div className={look.body}>{children}</div> : null}
    </article>
  );
}
