import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children?: ReactNode;
  className?: string;
};

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}
    >
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children ? (
        <div className="mt-2 text-sm text-slate-600">{children}</div>
      ) : null}
    </article>
  );
}
