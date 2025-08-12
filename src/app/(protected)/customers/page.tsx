"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/card";
import type { Customer, OnboardingEntry } from "@/lib/types";
import { listenCustomers, updateCustomer } from "@/lib/db";
import { listenOnboardings, setOnboardingStatus, setOnboardingTasks, ensureOnboarding } from "@/lib/onboarding";
import { addOnboardingBonusNow } from "@/lib/metrics";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatEUR, monthlyCustomerFee, priceMarketingForSubscription } from "@/lib/pricing";
import { readAppSettings, type AppSettings } from "@/lib/settings";

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "aktiv" | "onboarding" | "inaktiv">("all");
  const [sortKey, setSortKey] = useState<"name" | "status" | "kosten" | "branches" | "marketing" | "revenue">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [onboardings, setOnboardings] = useState<OnboardingEntry[]>([]);
  const [app, setApp] = useState<AppSettings | undefined>(undefined);

  useEffect(() => {
    const unsub = listenCustomers((list) => {
      setCustomers(list);
      setLoading(false);
    });
    const u2 = listenOnboardings((items) => setOnboardings(items));
    return () => { unsub(); u2(); };
  }, []);

  useEffect(() => {
    // initial read (fallback)
    readAppSettings().then(setApp).catch(() => setApp(undefined));
    // realtime updates
    const ref = doc(db, "appSettings", "default");
    const unsub = onSnapshot(ref, (snap) => {
      setApp((snap.exists() ? (snap.data() as AppSettings) : (undefined as any)));
    });
    return () => unsub();
  }, []);

  // Halte Onboarding-Status konsistent mit Kundenstatus (nur Richtung → Kunde:onboarding => Onboarding:in_bearbeitung)
  useEffect(() => {
    if (customers.length === 0) return;
    if (onboardings.length === 0) return;
    const obMap = new Map(onboardings.map((o) => [o.customerId, o] as const));
    const tasks: Promise<any>[] = [];
    customers.forEach((c) => {
      const ob = obMap.get(c.id);
      if (!ob) return; // nur vorhandene Onboardings bearbeiten
      if (c.status === 'onboarding') {
        if (ob.status !== 'in_bearbeitung') tasks.push(setOnboardingStatus(c.id, 'in_bearbeitung' as any));
      }
    });
    if (tasks.length) Promise.allSettled(tasks);
  }, [customers, onboardings]);

  // Reconciliation: Stelle sicher, dass es bei Kundenstatus 'onboarding' ein Onboarding-Dokument gibt.
  useEffect(() => {
    if (customers.length === 0) return;
    if (onboardings.length === 0) return;
    const obMap = new Map(onboardings.map((o) => [o.customerId, o] as const));
    const tasks: Promise<any>[] = [];
    customers.forEach((c) => {
      const ob = obMap.get(c.id);
      // Kein Onboarding-Dokument vorhanden, aber Kunde steht auf onboarding → Onboarding-Dokument sicherstellen
      if (!ob && c.status === 'onboarding') {
        tasks.push(ensureOnboarding(c.id));
        tasks.push(setOnboardingStatus(c.id, 'in_bearbeitung' as any));
        return;
      }
      // Keine automatische Anpassung des Kundenstatus auf Basis des Onboarding-Status
    });
    if (tasks.length) Promise.allSettled(tasks);
  }, [customers, onboardings]);

  const enriched = useMemo(() => {
    const baseFeeAmount = Number(app?.pricing?.baseFeeAmount) || 50;
    const mkBase = Number(app?.pricing?.marketing?.base) || 180;
    const mkExtra = Number(app?.pricing?.marketing?.extraBranch) || 60;
    return customers.map((c) => {
      const isActive = c.status === 'aktiv';
      const defaultBase = monthlyCustomerFee(isActive, baseFeeAmount);
      const rawBase = isActive && (typeof (c as any).baseFee === "number" && (c as any).baseFee > 0) ? (c as any).baseFee : defaultBase;
      const base = !isActive || (c as any).baseFeeDisabled ? 0 : rawBase;
      const marketing = c.status === 'inaktiv' ? 0 : (c.marketingActive ? priceMarketingForSubscription(c.branches, mkBase, mkExtra) : 0);
      const extras = c.status === 'inaktiv' ? 0 : (Array.isArray(c.extraServices) ? c.extraServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0) : 0);
      return { ...c, __base: base, __marketing: marketing, __extras: extras, __total: base + marketing + extras } as Customer & {
        __base: number; __marketing: number; __extras: number; __total: number;
      };
    });
  }, [customers, app]);

  const openOnboardingIds = useMemo(() => {
    const ids = new Set(onboardings.filter((o) => o.status !== "abgeschlossen").map((o) => o.customerId));
    return ids;
  }, [onboardings]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (status !== "all") {
      if (status === "onboarding") {
        list = list.filter((c) => c.status === 'onboarding' && openOnboardingIds.has(c.id));
      } else {
        list = list.filter((c) => c.status === status);
      }
    }
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter((c) => c.name?.toLowerCase().includes(t));
    }
    // sort
    const cmp = (a: typeof list[number], b: typeof list[number]) => {
      let res = 0;
      if (sortKey === "name") {
        res = (a.name || "").localeCompare(b.name || "");
      } else if (sortKey === "status") {
        const order = { aktiv: 0, onboarding: 1, inaktiv: 2 } as const;
        res = (order[a.status as keyof typeof order] ?? 99) - (order[b.status as keyof typeof order] ?? 99);
      } else if (sortKey === "kosten") {
        res = a.__total - b.__total;
      } else if (sortKey === "branches") {
        res = (a.branches || 0) - (b.branches || 0);
      } else if (sortKey === "marketing") {
        res = (a as any).__marketing - (b as any).__marketing;
      } else if (sortKey === "revenue") {
        res = (a as any).__total - (b as any).__total;
      }
      return sortDir === "asc" ? res : -res;
    };
    return [...list].sort(cmp);
  }, [enriched, q, status, sortKey, sortDir]);

  const totalMonthly = useMemo(() => {
    const baseFeeAmount = Number(app?.pricing?.baseFeeAmount) || 50;
    const mkBase = Number(app?.pricing?.marketing?.base) || 180;
    const mkExtra = Number(app?.pricing?.marketing?.extraBranch) || 60;
    const base = customers.reduce((acc, c) => {
      const isActive = c.status === 'aktiv';
      const defaultBase = monthlyCustomerFee(isActive, baseFeeAmount);
      const rawBase = isActive && (typeof (c as any).baseFee === "number" && (c as any).baseFee > 0) ? (c as any).baseFee : defaultBase;
      const val = !isActive || (c as any).baseFeeDisabled ? 0 : rawBase;
      return acc + val;
    }, 0);
    const coreMarketing = customers.reduce((acc, c) => {
      if (c.status === 'inaktiv') return acc;
      return acc + (c.marketingActive ? priceMarketingForSubscription(c.branches, mkBase, mkExtra) : 0);
    }, 0);
    const extras = customers.reduce((acc, c) => {
      if (c.status === 'inaktiv') return acc;
      return acc + (Array.isArray(c.extraServices) ? c.extraServices.reduce((s, e) => s + (Number(e.price) || 0), 0) : 0);
    }, 0);
    const anyMarketingActive = customers.some((c) => c.status !== 'inaktiv' && c.marketingActive);
    const masterLayoutBase = anyMarketingActive ? 240 : 0;
    const marketing = masterLayoutBase + coreMarketing + extras;
    return { base, marketing, extras, masterLayoutBase, total: base + marketing } as const;
  }, [customers, app]);

  async function saveCustomer(id: string, data: Partial<Customer>) {
    try {
      setPending((p) => ({ ...p, [id]: true }));
      await updateCustomer(id, data);
      // Spiegel Onboarding-Status, falls Kundenstatus geändert wurde
      if (typeof data.status === 'string') {
        const s = data.status as 'aktiv' | 'onboarding' | 'inaktiv';
        let prevStatus: 'in_bearbeitung' | 'abgeschlossen' | undefined = onboardings.find((o) => o.customerId === id)?.status as any;
        // Falls der Onboarding-Status lokal noch nicht geladen ist, hole ihn direkt
        if (!prevStatus) {
          try {
            const snap = await getDoc(doc(db, 'onboardings', id));
            prevStatus = (snap.data() as any)?.status;
          } catch {}
        }
        if (s === 'onboarding') {
          await ensureOnboarding(id);
          await setOnboardingStatus(id, 'in_bearbeitung' as any);
          // Wenn vorher abgeschlossen war → Betrag abziehen
          if (prevStatus === 'abgeschlossen') {
            try {
              const fee = Number(app?.pricing?.onboardingFee) || 750;
              await addOnboardingBonusNow(-fee);
            } catch {}
          }
        } else {
          await setOnboardingStatus(id, 'abgeschlossen' as any);
          // Wenn vorher nicht abgeschlossen war → Betrag addieren
          if (prevStatus !== 'abgeschlossen') {
            try {
              const fee = Number(app?.pricing?.onboardingFee) || 750;
              await addOnboardingBonusNow(fee);
            } catch {}
          }
        }
      }
      // Spiegel Marketing-Schalter ins Onboarding (optional)
      if (typeof (data as any).marketingActive === 'boolean') {
        try {
          await setOnboardingTasks(id, { marketing: (data as any).marketingActive });
        } catch {}
      }
      setSaved((s) => ({ ...s, [id]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1500);
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  }

  function addExtraService(c: Customer) {
    const next = [...(c.extraServices || []), { name: "", price: 0 }];
    saveCustomer(c.id, { extraServices: next as any });
  }
  function updateExtraService(c: Customer, idx: number, patch: { name?: string; price?: number }) {
    const list = [...(c.extraServices || [])];
    const curr = list[idx] || { name: "", price: 0 };
    list[idx] = { ...curr, ...patch } as any;
    saveCustomer(c.id, { extraServices: list as any });
  }
  function removeExtraService(c: Customer, idx: number) {
    const list = [...(c.extraServices || [])];
    list.splice(idx, 1);
    saveCustomer(c.id, { extraServices: list as any });
  }

  return (
    <div className="grid gap-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Kunden</h1>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400 inline-block"/>Basis</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400 inline-block"/>Marketing</span>
          <span className="ml-2 text-white/70">Summe: {loading ? "…" : formatEUR(totalMonthly.total)}</span>
        </div>
      </div>

      {/* KPI-Karten: Basis, Marketing, Gesamt */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-gray-400">Basis (Kunden)</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? <div className="h-7 w-20 rounded bg-white/10 animate-pulse" /> : formatEUR(totalMonthly.base)}
          </div>
          <div className="mt-2 text-xs text-gray-500">{Number(app?.pricing?.baseFeeAmount) || 50}€ pro aktivem Kunden (sofern nicht deaktiviert)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400">Marketing</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? <div className="h-7 w-24 rounded bg-white/10 animate-pulse" /> : formatEUR(totalMonthly.marketing)}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {totalMonthly.masterLayoutBase > 0 ? (
              <span>inkl. 240€ Masterlayouts + Filialpreise + Zusatzservices</span>
            ) : (
              <span>Filialpreise + Zusatzservices</span>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400">Gesamt pro Monat</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? <div className="h-7 w-24 rounded bg-white/10 animate-pulse" /> : formatEUR(totalMonthly.total)}
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400 inline-block"/>Basis</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400 inline-block"/>Marketing</span>
          </div>
        </Card>
      </section>

      {/* Controls */}
      <Card className="w-full max-w-full min-w-0 box-border px-[16px] py-[12px] sm:px-[18px] sm:py-[14px] mx-[4px] sm:mx-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center text-[0.95rem] sm:text-base min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche nach Kundenname…"
            className="w-full sm:max-w-xs h-9 sm:h-10 rounded-md bg-white/5 border border-white/10 px-3 text-[0.95rem] sm:text-base text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap min-w-0">
            {(["all","aktiv","onboarding","inaktiv"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`text-sm sm:text-base max-[380px]:text-xs rounded-full px-2.5 py-1 sm:px-3 py-1.5 max-[380px]:px-2.5 border transition-colors shrink-0 ${
                  status === s
                    ? "bg-white/10 text-white border-white/30"
                    : "text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/20"
                }`}
              >
                {s === "all" ? "Alle" : s === "inaktiv" ? "Inaktiv" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-auto overflow-x-auto whitespace-nowrap min-w-0">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className="h-9 sm:h-10 text-[0.95rem] sm:text-base rounded-md bg-white/5 border border-white/10 px-2 sm:px-2.5 py-1.5 text-gray-300"
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="kosten">Kosten</option>
              <option value="branches">Filialen</option>
              <option value="marketing">Marketing</option>
              <option value="revenue">Umsatz/Monat</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="h-9 sm:h-10 aspect-square text-[0.95rem] sm:text-base rounded-md px-2 py-1.5 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors"
              aria-label="Sortierreihenfolge umschalten"
              title={sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </Card>

      {/* Sortierleiste über der Kundenliste */}
      <div className="mt-3 hidden sm:block">
        <Card className="w-full max-w-full min-w-0 box-border px-[14px] py-[10px] mx-[4px] sm:mx-0">
          <div className="grid grid-cols-12 text-sm uppercase tracking-wide text-gray-400 select-none">
            {(
              [
                { key: "name", label: "Name", span: 4 },
                { key: "branches", label: "Filialen", span: 2 },
                { key: "status", label: "Status", span: 2 },
                { key: "marketing", label: "Marketing", span: 2 },
                { key: "revenue", label: "Umsatz/Monat", span: 2 },
              ] as const
            ).map((col) => (
              <button
                key={col.key}
                onClick={() => {
                  if (sortKey === col.key) {
                    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortKey(col.key as any);
                    setSortDir('asc');
                  }
                }}
                className={`col-span-${col.span} text-left flex items-center gap-1 hover:text-gray-300 transition-colors text-base`}
                aria-label={`Nach ${col.label} sortieren`}
                title={`Nach ${col.label} sortieren`}
             >
                <span className={`${sortKey === col.key ? 'text-white' : ''}`}>{col.label}</span>
                {sortKey === col.key && (
                  <span className="text-indigo-300">{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* List */}
      <section className="flex flex-col gap-3 sm:gap-4 w-full max-w-full min-w-0">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="box-border px-[16px] py-[12px] sm:px-[16px] sm:py-[12px] mx-[4px] sm:mx-0">
                <div className="h-5 w-40 rounded bg-white/10 animate-pulse" />
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
                  <div className="h-4 w-28 rounded bg-white/5 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-white/5 animate-pulse" />
                  <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
                </div>
                <div className="mt-4 h-9 w-24 rounded bg-white/10 animate-pulse" />
              </Card>
            ))
          : filtered.map((c) => {
              const hasOpenOnboarding = c.status === 'onboarding' && openOnboardingIds.has(c.id);
              const base = c.__base;
              const marketing = c.__marketing;
              return (
                <Card
                  key={c.id}
                  className={`w-full max-w-full min-w-0 box-border px-[16px] py-[12px] sm:px-[16px] sm:py-[12px] mx-[4px] sm:mx-0 transition-colors overflow-hidden ${
                    c.status === 'onboarding'
                      ? '!bg-amber-500/15 hover:!bg-amber-500/20 !border-amber-500/20 hover:ring-1 hover:ring-amber-400/30'
                      : c.status === 'inaktiv'
                      ? '!bg-rose-500/15 hover:!bg-rose-500/20 !border-rose-500/20 hover:ring-1 hover:ring-rose-400/30'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 cursor-pointer select-none overflow-hidden w-full"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    role="button"
                    aria-expanded={expandedId === c.id}
                    aria-label="Details umschalten"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base sm:text-lg font-medium text-white/90 flex items-center gap-2">
                        <span>{c.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        {hasOpenOnboarding ? (
                          <span className="px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300 bg-amber-400/10">Onboarding</span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full border ${c.status === "aktiv" ? "border-teal-400/40 text-teal-300 bg-teal-400/10" : "border-rose-400/40 text-rose-300 bg-rose-400/10"}`}>
                            {c.status === "aktiv" ? "Aktiv" : "Inaktiv"}
                          </span>
                        )}
                        <span className="text-gray-400">{c.branches} Filialen</span>
                        <span className={`px-2 py-0.5 rounded-full border ${
                          c.marketingActive
                            ? "border-sky-400/40 text-sky-300 bg-sky-400/10"
                            : "border-white/10 text-gray-400"
                        }`}>
                          Marketing {c.marketingActive ? "aktiv" : "aus"}
                        </span>
                        {saved[c.id] && (
                          <span className="ml-1 text-teal-300">Gespeichert</span>
                        )}
                      </div>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto min-w-0">
                      <div className="hidden sm:block text-[13px] text-gray-400">Monatlich</div>
                      <div className="text-base sm:text-lg font-semibold text-white tracking-tight">{formatEUR(base + marketing + (c as any).__extras)}</div>
                      <div className="mt-1 text-[10px] sm:text-[12px] max-[380px]:text-[9px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400 inline-block"/>Basis {formatEUR(base)}</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400 inline-block"/>Marketing {formatEUR(marketing)}</span>
                        {(c as any).__extras > 0 && (
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-400 inline-block"/>Extras {formatEUR((c as any).__extras)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                    {expandedId === c.id && (
                      <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 min-w-0 w-full">
                        {/* Left column: pharmacy info */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-400">Apothekeninformationen</div>
                            {saved[c.id] && <span className="text-teal-300 text-sm">Gespeichert</span>}
                          </div>
                          <div className="mt-3 space-y-3 text-sm text-white/90">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-gray-400">Status</div>
                              <select
                                value={c.status}
                                onChange={(e) => saveCustomer(c.id, { status: e.target.value as any })}
                                disabled={!!pending[c.id]}
                                className="h-8 rounded-md bg-white/5 border border-white/10 px-2 text-white text-sm hover:border-white/20 disabled:opacity-50"
                                aria-label="Kundenstatus ändern"
                              >
                                <option value="aktiv">Aktiv</option>
                                <option value="onboarding">Onboarding</option>
                                <option value="inaktiv">Inaktiv</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-gray-400">Filialen</div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => saveCustomer(c.id, { branches: Math.max(1, (c.branches || 1) - 1) })}
                                  disabled={!!pending[c.id]}
                                  className="h-10 w-10 sm:h-7 sm:w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300"
                                  aria-label="Filialen verringern"
                                >
                                  −
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={String(c.branches ?? 1)}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, "");
                                    const val = Math.max(1, Number(raw || 1));
                                    saveCustomer(c.id, { branches: val });
                                  }}
                                  className="w-20 sm:w-16 text-center rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white"
                                />
                                <button
                                  onClick={() => saveCustomer(c.id, { branches: Math.max(1, (c.branches || 1) + 1) })}
                                  disabled={!!pending[c.id]}
                                  className="h-10 w-10 sm:h-7 sm:w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300"
                                  aria-label="Filialen erhöhen"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-gray-400 flex-1 min-w-0">Grundgebühr (50 €)</div>
                              <button
                                onClick={() => saveCustomer(c.id, { baseFeeDisabled: !((c as any).baseFeeDisabled ?? false) })}
                                disabled={!!pending[c.id]}
                                className={`relative h-5 w-9 rounded-full border transition-colors ${
                                  (c as any).baseFeeDisabled ? "bg-white/5 border-white/15" : "bg-teal-500/30 border-teal-400/50" 
                                } ${pending[c.id] ? "opacity-60 cursor-not-allowed" : "hover:border-white/30"}`}
                                aria-pressed={!((c as any).baseFeeDisabled ?? false)}
                                aria-label="Grundgebühr umschalten"
                              >
                                <span
                                  className={`absolute top-0.5 ${(c as any).baseFeeDisabled ? "left-0.5" : "left-5"} h-4 w-4 rounded-full bg-white shadow transition-all`}
                                />
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-gray-400 flex-1 min-w-0">Marketing-Service</div>
                              <button
                                onClick={() => saveCustomer(c.id, { marketingActive: !c.marketingActive })}
                                disabled={!!pending[c.id]}
                                className={`relative h-5 w-9 rounded-full border transition-colors ${
                                  c.marketingActive ? "bg-teal-500/30 border-teal-400/50" : "bg-white/5 border-white/15" 
                                } ${pending[c.id] ? "opacity-60 cursor-not-allowed" : "hover:border-white/30"}`}
                                aria-pressed={c.marketingActive}
                                aria-label="Marketing-Service umschalten"
                              >
                                <span
                                  className={`absolute top-0.5 ${c.marketingActive ? "left-5" : "left-0.5"} h-4 w-4 rounded-full bg-white shadow transition-all`}
                                />
                              </button>
                            </div>
                            <div>
                              <label className="block text-gray-400 mb-1">Notizen</label>
                              <textarea
                                value={(c as any).notes ?? ""}
                                onChange={(e) => saveCustomer(c.id, { notes: e.target.value } as any)}
                                rows={3}
                                placeholder="Interne Notizen zum Kunden…"
                                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-2 text-white placeholder:text-gray-500"
                              />
                            </div>
                          </div>
                        </div>
                        {/* Right column: marketing services */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm text-gray-400">Marketing-Services</div>
                            <button onClick={() => addExtraService(c)} className="text-sm text-sky-300 hover:text-sky-200 shrink-0 basis-full sm:basis-auto text-right sm:text-left">+ Service hinzufügen</button>
                          </div>
                          <div className="mt-3 space-y-2 w-full">
                            {(c.extraServices || []).length === 0 && (
                              <div className="text-sm text-gray-500">Keine Zusatzservices</div>
                            )}
                            {(c.extraServices || []).map((s, i) => (
                              <div key={`${s.name}-${i}`} className="w-full max-w-full overflow-hidden flex flex-wrap items-center gap-2 rounded-md border border-white/10 px-2 py-2">
                                <input
                                  value={s.name}
                                  onChange={(e) => updateExtraService(c, i, { name: e.target.value })}
                                  placeholder="Service-Name"
                                  className="flex-1 min-w-0 max-w-full basis-full sm:basis-0 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white placeholder:text-gray-500"
                                />
                                <div className="relative w-20 sm:w-36 md:w-40 shrink-0 basis-auto">
                                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    value={(s.price ?? 0).toString()}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/\s/g, "");
                                      const norm = raw.replace(",", ".");
                                      const val = Number(norm);
                                      updateExtraService(c, i, { price: isNaN(val) ? 0 : val });
                                    }}
                                    placeholder="Preis / Monat"
                                    className="w-full max-w-full text-right rounded-md bg-white/5 border border-white/10 pr-2 pl-6 py-1.5 text-white placeholder:text-gray-500"
                                  />
                                </div>
                                <button onClick={() => removeExtraService(c, i)} className="text-gray-400 hover:text-red-300 basis-full sm:basis-auto sm:ml-auto text-right" aria-label="Löschen">×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end sm:col-span-2">
                          <button
                            onClick={() => {
                              if (confirm(`Kunden „${c.name}” wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
                                import("@/lib/db").then(({ deleteCustomer }) => deleteCustomer(c.id));
                              }
                            }}
                            className="text-sm rounded-md px-3.5 py-1.5 border border-red-500/30 text-red-300 hover:border-red-400/50 hover:text-red-200"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                    )}
                    </Card>
                );
              })}
            </section>

            {/* Totals on mobile */}
            <div className="sm:hidden text-sm text-gray-400">
              Summe: {loading ? "…" : formatEUR(totalMonthly.total)}
            </div>
          </div>
        );
}
