"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const items: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    href: "/customers",
    label: "Kunden",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 1114 0v1H5v-1z" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    href: "/marketing",
    label: "Marketing",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M3 12l7-4 11-5v14l-11 5-7-4V12z" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M3 7h18M3 12h12M3 17h6" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    href: "/settings",
    label: "Einstellungen",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06A2 2 0 013 17.88l.06-.06A1.65 1.65 0 003.39 16a1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06A2 2 0 015.04 2.4l.06.06A1.65 1.65 0 006.92 2.8 1.65 1.65 0 008.43 1.3H8.5a2 2 0 014 0h.09a1.65 1.65 0 001.51 1.51 1.65 1.65 0 001.82-.33l.06-.06A2 2 0 0121.6 5.04l-.06.06A1.65 1.65 0 0021.2 6.92c.21.58.21 1.21 0 1.79.29.42.45.92.45 1.43s-.16 1.01-.45 1.43z" stroke="currentColor" strokeWidth="1.2"/></svg>
    ),
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000); // update alle 10s (Sekunden werden nicht angezeigt)
    return () => clearInterval(id);
  }, []);
  const dateLabel = React.useMemo(() => {
    try {
      const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(now).replace(",", "").trim();
      const dateStr = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(now);
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      return `${weekday} ${dateStr} | ${hh}.${mm} Uhr`;
    } catch {
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      return `${now.toLocaleDateString("de-DE")} | ${hh}.${mm} Uhr`;
    }
  }, [now]);
  return (
    <div className="min-h-screen bg-neutral-950 text-gray-100 flex">
      {/* Sidebar - desktop */}
      <aside className="sticky top-0 hidden md:block h-screen w-64 border-r border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="h-16 flex items-center gap-2 px-4 border-b border-white/10">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-400 to-teal-500" />
          <div className="text-lg font-semibold tracking-tight">BRRY Dashboard</div>
        </div>
        <nav className="p-2 space-y-1">
          {items.map((it) => {
            const active = pathname?.startsWith(it.href);
            return (
              <Link onClick={close} key={it.href} href={it.href} className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
                ${active ? "bg-white/[0.06] ring-1 ring-white/10" : "hover:bg-white/[0.04]"}`}>
                <span className="text-white/70 group-hover:text-white transition-colors">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 md:hidden ${open ? "" : "pointer-events-none"}`}>
        <div onClick={close} className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
        <aside className={`absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-neutral-950/95 backdrop-blur p-2 transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="h-14 flex items-center gap-2 px-2 border-b border-white/10">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-400 to-teal-500" />
            <div className="text-base font-semibold tracking-tight">BRRY Dashboard</div>
          </div>
          <nav className="p-2 space-y-1">
            {items.map((it) => {
              const active = pathname?.startsWith(it.href);
              return (
                <Link onClick={close} key={it.href} href={it.href} className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
                  ${active ? "bg-white/[0.06] ring-1 ring-white/10" : "hover:bg-white/[0.04]"}`}>
                  <span className="text-white/70 group-hover:text-white transition-colors">{it.icon}</span>
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="h-16 sticky top-0 z-30 border-b border-white/10 bg-neutral-950/70 backdrop-blur flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 hover:bg-white/5">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <div className="hidden sm:block text-sm md:text-base lg:text-lg text-white/60">{pathname}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded-md border border-white/10 text-xs md:text-sm lg:text-base text-white/80 font-medium">
              {dateLabel}
            </div>
          </div>
        </header>
        <main className="mx-auto p-4 md:p-6 max-w-[120rem]">{children}</main>
      </div>
    </div>
  );
}
