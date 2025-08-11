"use client";
import React from "react";
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
};

export default function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed";
  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  } as const;
  const variants = {
    primary: "bg-white/10 text-white hover:bg-white/20",
    secondary: "bg-neutral-800 text-gray-100 border border-white/10 hover:bg-neutral-700",
    ghost: "bg-transparent text-gray-200 hover:bg-white/5",
    danger: "bg-red-500/90 text-white hover:bg-red-500",
  } as const;
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}
