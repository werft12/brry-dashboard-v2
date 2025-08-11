"use client";
import React, { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { createCustomer } from "@/lib/db";

// Optional: nur eine erlaubte E-Mail zulassen
const ALLOWED_EMAIL = process.env.NEXT_PUBLIC_ALLOWED_EMAIL;

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    const allowed = user && (!ALLOWED_EMAIL || user.email === ALLOWED_EMAIL);
    if (!allowed) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [user, loading, router, pathname]);

  // One-time auto seed: ensure three demo customers exist (idempotent by name)
  useEffect(() => {
    async function seedIfEmpty() {
      if (loading) return;
      if (!user) return;
      try {
        const seededKey = "brry_seed_done";
        if (typeof window !== "undefined" && localStorage.getItem(seededKey) === "1") return;
        const ref = collection(db, "customers");
        const items = [
          { name: "MAXMO Apotheke", branches: 22 },
          { name: "apotheca", branches: 6 },
          { name: "Weber Apotheken", branches: 5 },
        ];
        for (const it of items) {
          const snap = await getDocs(query(ref, where("name", "==", it.name), limit(1)));
          if (snap.empty) {
            await createCustomer({
              name: it.name,
              branches: it.branches,
              status: "aktiv",
              baseFee: 0,
              marketingActive: true,
              monthlyRevenue: 0,
            } as any);
          }
        }
        localStorage.setItem(seededKey, "1");
      } catch (e) {
        // silent
      }
    }
    seedIfEmpty();
  }, [user, loading]);

  // Always ensure these two customers exist as requested
  useEffect(() => {
    async function ensureSpecific() {
      if (loading || !user) return;
      const ref = collection(db, "customers");
      const targets = [
        { name: "apotheca", branches: 6 },
        { name: "Weber Apotheken", branches: 5 },
      ];
      for (const t of targets) {
        const snap = await getDocs(query(ref, where("name", "==", t.name), limit(1)));
        if (snap.empty) {
          await createCustomer({
            name: t.name,
            branches: t.branches,
            status: "aktiv",
            baseFee: 0,
            marketingActive: true,
            monthlyRevenue: 0,
          } as any);
        }
      }
    }
    ensureSpecific();
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-400">Lade…</div>
    );
  }

  if (!user) return null; // Redirect wird oben ausgelöst

  return (
    <Shell>
      {children}
    </Shell>
  );
}
