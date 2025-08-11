"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LogOut } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kunden", label: "Kunden" },
  { href: "/marketing", label: "Marketing" },
  { href: "/onboarding", label: "Onboarding" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { signOutUser } = useAuth();

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-neutral-900/70 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
        <div className="font-semibold tracking-tight">BRRY Dashboard</div>
        <nav className="flex items-center gap-1 text-sm rounded-md p-1 bg-neutral-800/60">
          {nav.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={
                  "px-3 py-1.5 rounded-md transition-colors " +
                  (active ? "bg-white/10 text-white border border-white/20" : "text-gray-300 hover:bg-neutral-700")
                }
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="grow" />
        <button
          onClick={() => signOutUser()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 hover:bg-neutral-800 text-sm text-gray-200"
        >
          <LogOut className="size-4" /> Abmelden
        </button>
      </div>
    </header>
  );
}
