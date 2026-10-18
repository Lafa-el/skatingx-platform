import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /**
   * `brand`, `outline` and `danger-outline` are the UI v1 looks; `primary` and `ghost` stay as they
   * were until pages move over. A variant owns its own text and border colours: overriding them
   * with `className` is unreliable, because Tailwind decides which of two colour classes wins.
   */
  variant?: "primary" | "ghost" | "brand" | "outline" | "danger-outline";
};

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  // min-h-11 = 44px: the smallest touch target we accept on a phone, whatever the caller's padding.
  // Corner radius and font weight sit in each variant so one variant can change them without a class clash.
  const base =
    "inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm transition-colors";
  const variants = {
    primary: "rounded-lg font-medium bg-sky-600 text-white hover:bg-sky-700",
    ghost: "rounded-lg font-medium bg-transparent text-slate-700 hover:bg-slate-100",
    // Navy text, not white: white on flame is 3.51:1, navy on flame is 4.88:1.
    brand:
      "rounded-control bg-brand-flame font-semibold text-brand-navy hover:bg-brand-flame-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-flame",
    outline:
      "rounded-control border border-brand-navy/50 bg-transparent font-semibold text-brand-navy hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
    // For a destructive action such as signing out. The red is the error red, never the brand flame.
    "danger-outline":
      "rounded-control border border-status-danger/60 bg-transparent font-semibold text-status-danger hover:bg-status-danger-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-danger disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
  };

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
