"use client";
import React from "react";

type Variant = "success" | "warning" | "danger" | "muted";

export default function Badge({ children, variant = "muted" }: { children: React.ReactNode; variant?: Variant }) {
  const map: Record<Variant, string> = {
    success: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/20",
    warning: "bg-amber-500/15 text-amber-300 border border-amber-400/20",
    danger: "bg-red-500/15 text-red-300 border border-red-400/20",
    muted: "bg-white/5 text-gray-300 border border-white/10",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${map[variant]}`}>{children}</span>;
}
