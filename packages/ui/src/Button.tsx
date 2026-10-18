import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** `brand` is the UI v1 look; `primary` and `ghost` stay as they were until pages move over. */
  variant?: "primary" | "ghost" | "brand";
};

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  // min-h-11 = 44px: the smallest touch target we accept on a phone, whatever the caller's padding.
  // The corner radius sits in each variant so one variant can change it without a class clash.
  const base =
    "inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-medium transition-colors";
  const variants = {
    primary: "rounded-lg bg-sky-600 text-white hover:bg-sky-700",
    ghost: "rounded-lg bg-transparent text-slate-700 hover:bg-slate-100",
    // Navy text, not white: white on flame is 3.51:1, navy on flame is 4.88:1.
    brand:
      "rounded-control bg-brand-flame font-semibold text-brand-navy hover:bg-brand-flame-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-flame",
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
