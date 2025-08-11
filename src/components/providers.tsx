"use client";
import React from "react";
import { AuthProvider } from "@/lib/auth-context";
import ThemeProvider from "@/components/theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </AuthProvider>
  );
}
