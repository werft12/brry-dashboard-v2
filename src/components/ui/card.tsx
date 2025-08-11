"use client";
import React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };

export default function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div className={"card border border-white/10 bg-neutral-900 " + className} {...props}>
      {children}
    </div>
  );
}
