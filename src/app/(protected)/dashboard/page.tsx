"use client";
import React, { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/card";
import Stat from "@/components/ui/stat";
import type { Customer, OnboardingEntry } from "@/lib/types";
import { listenCustomers } from "@/lib/db";
import { listenOnboardings, cleanOrphanOnboardings, closeOnboardingForNonOnboardingCustomers } from "@/lib/onboarding";
import { formatEUR, monthlyCustomerFee, priceMarketingForSubscription } from "@/lib/pricing";
import { readAppSettings, type AppSettings } from "@/lib/settings";
import Sparkline from "@/components/charts/Sparkline";
import ReArea from "@/components/charts/ReArea";
import Donut from "@/components/charts/Donut";
import { listenMetrics, seedDemoMetrics, recalcLast12Months, type MonthlyMetric, reconcileOnboardingForCurrentMonth, refreshCurrentMonthBaseMarketing } from "@/lib/metrics";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [metrics, setMetrics] = useState<MonthlyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [onbFilter, setOnbFilter] = useState<"all" | "done" | "open">("all");
  const [onboardingItems, setOnboardingItems] = useState<OnboardingEntry[]>([]);
  const [app, setApp] = useState<AppSettings | undefined>(undefined);

  useEffect(() => {
    const unsub = listenCustomers((list) => {
      setCustomers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load app settings (pricing etc.) + realtime updates
  useEffect(() => {
    readAppSettings().then(setApp).catch(() => setApp(undefined));
    const ref = doc(db, "appSettings", "default");
    const unsub = onSnapshot(ref, (snap) => {
      setApp((snap.exists() ? (snap.data() as AppSettings) : (undefined as any)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = listenOnboardings((items) => {
      setOnboardingItems(items);
    });
    return () => unsub();
  }, []);

  // Einmalige Bereinigung: Onboardings schließen, deren Kunden nicht im Onboarding sind
  useEffect(() => {
    const key = 'brry_cleanup_nononboarding_v1';
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
        closeOnboardingForNonOnboardingCustomers()
          .then(() => {
            console.log('[Cleanup] Closed onboarding docs for non-onboarding customers.');
            localStorage.setItem(key, '1');
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  // Bereinige verwaiste Onboardings (ohne zugehörigen Customer)
  useEffect(() => {
    if (customers.length === 0 || onboardingItems.length === 0) return;
    const validIds = customers.map((c) => c.id);
    const hasOrphans = onboardingItems.some((o) => !validIds.includes(o.customerId));
    if (hasOrphans) {
      cleanOrphanOnboardings(validIds).catch(() => {});
    }
  }, [customers, onboardingItems]);

  // Metrics live-listener
  useEffect(() => {
    const unsub = listenMetrics((items) => setMetrics(items));
    return () => unsub();
  }, []);

  // Automatische Korrektur: onboardingRevenue an onboardingCount angleichen (kein Button nötig)
  useEffect(() => {
    const key = 'brry_reconcile_onboarding_current_month_v1';
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
        reconcileOnboardingForCurrentMonth()
          .then(() => localStorage.setItem(key, '1'))
          .catch(() => {});
      }
    } catch {}
  }, []);

  // Auto-Seed Demo Metrics wenn leer und Kunden vorhanden (einmalig)
  useEffect(() => {
    if (!seeded && customers.length > 0 && metrics.length === 0 && !loading) {
      setSeeded(true);
      // fire and forget
      seedDemoMetrics(customers, 12).catch(() => {});
    }
  }, [seeded, customers, metrics.length, loading]);

  // Preise/Kunden-Änderungen: aktuellen Monatsumsatz (ohne Historie) aktualisieren
  useEffect(() => {
    if (customers.length === 0) return;
    // debounce, um schnelle Änderungen zu bündeln
    const t = setTimeout(() => {
      refreshCurrentMonthBaseMarketing(customers).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [customers, app]);

  const stats = useMemo(() => {
    const baseFeeAmount = Number(app?.pricing?.baseFeeAmount) || 50;
    const mkBase = Number(app?.pricing?.marketing?.base) || 180;
    const mkExtra = Number(app?.pricing?.marketing?.extraBranch) || 60;
    const active = customers.filter((c) => c.status === "aktiv").length;
    const branches = customers.reduce((acc, c) => acc + (Number(c.branches) || 0), 0);
    const base = customers.reduce((acc, c: any) => {
      const isActive = c.status === 'aktiv';
      const defaultBase = monthlyCustomerFee(isActive, baseFeeAmount);
      const rawBase = isActive && typeof c.baseFee === 'number' && c.baseFee > 0 ? c.baseFee : defaultBase;
      const val = !isActive || c.baseFeeDisabled ? 0 : rawBase;
      return acc + val;
    }, 0);
    const coreMarketing = customers.reduce((acc, c) => {
      if (c.status === 'inaktiv') return acc;
      return acc + (c.marketingActive ? priceMarketingForSubscription(c.branches, mkBase, mkExtra) : 0);
    }, 0);
    // 240€ Masterlayout-Basisgebühr einmalig pro Monat, wenn mindestens eine (nicht inaktive) Apotheke Marketing aktiv hat
    const anyMarketingActive = customers.some((c) => c.status !== 'inaktiv' && c.marketingActive);
    const masterLayoutBase = anyMarketingActive ? 240 : 0;
    const extras = customers.reduce((acc, c) => {
      if (c.status === 'inaktiv') return acc;
      return acc + (Array.isArray(c.extraServices) ? c.extraServices.reduce((s, e) => s + (Number(e.price) || 0), 0) : 0);
    }, 0);
    const marketing = masterLayoutBase + coreMarketing + extras;
    // Onboarding-Bonus für aktuellen Monat aus Metrics lesen
    const now = new Date();
    const monthId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMetric = metrics.find((m) => m.monthId === monthId);
    const onboardingBonus = Number(currentMetric?.onboardingRevenue) || 0;
    const onboardingCount = Number(currentMetric?.onboardingCount) || 0;
    const revenue = base + marketing + onboardingBonus;
    return { active, branches, revenue, base, marketing, extras, onboardingBonus, onboardingCount };
  }, [customers, metrics]);

  // Kleine, glatte Demo-Trends auf Basis der aktuellen Kennzahlen
  const openOnboardingsForExisting = useMemo(() => {
    const ids = new Set(customers.map((c) => c.id));
    return onboardingItems.filter((o: OnboardingEntry) => o.status !== "abgeschlossen" && ids.has(o.customerId)).length;
  }, [onboardingItems, customers]);

  const trends = useMemo(() => {
    const mkTrend = (base: number, len = 16) => {
      const arr = Array.from({ length: len }, (_, i) => {
        const drift = Math.sin(i / 2.6) * 0.08 * base;
        const noise = (Math.random() - 0.5) * 0.06 * base;
        return Math.max(0, base + drift + noise);
      });
      return arr;
    };
    return {
      active: mkTrend(Math.max(1, stats.active)),
      branches: mkTrend(Math.max(1, stats.branches)),
      revenue: mkTrend(Math.max(100, stats.revenue)),
      onboardings: mkTrend(Math.max(1, openOnboardingsForExisting)),
    };
  }, [stats.active, stats.branches, stats.revenue, openOnboardingsForExisting]);

  const revenueSeries = useMemo(() => {
    // Erzeuge die letzten 12 Monate (inkl. aktueller Monat) als yyyymm
    const end = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const months: { id: string; label: string }[] = [];
    let cur = new Date(start);
    while (cur <= end) {
      const id = `${cur.getFullYear()}${String(cur.getMonth() + 1).padStart(2, '0')}`;
      const label = cur.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
      months.push({ id, label });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    const dict = new Map(metrics.map(m => [m.monthId, Math.round(m.revenue)]));
    return months.map(m => ({ name: m.label, value: dict.get(m.id) ?? 0 }));
  }, [metrics]);

  const handleRecalc = async () => {
    if (recalcLoading || loading || customers.length === 0) return;
    setRecalcLoading(true);
    try {
      await recalcLast12Months(customers, app);
      // Stelle sicher, dass der aktuelle Monat mit aktuellen Preisen inkl. Onboarding-Anteil gesetzt ist
      await refreshCurrentMonthBaseMarketing(customers);
    } finally {
      setRecalcLoading(false);
    }
  };



  const onboardingDist = useMemo(() => {
    const total = onboardingItems?.length || 0;
    const done = onboardingItems?.filter((o: OnboardingEntry) => o.status === "abgeschlossen").length || 0;
    const inProg = total - done;
    const a = { name: "Abgeschlossen", value: done, color: "#22d3ee" };
    const b = { name: "Offen", value: inProg, color: "#38bdf8" };
    if (onbFilter === "open") return [b, a]; // selektierte Scheibe zuerst -> Prozentanzeige passt
    return [a, b];
  }, [onboardingItems, onbFilter]);

  const filteredOnboardings = useMemo(() => {
    let list: OnboardingEntry[] = onboardingItems;
    if (onbFilter === "done") list = list.filter((o: OnboardingEntry) => o.status === "abgeschlossen");
    if (onbFilter === "open") list = list.filter((o: OnboardingEntry) => o.status !== "abgeschlossen");
    // Neueste zuerst
    list = [...list].sort((a: OnboardingEntry, b: OnboardingEntry) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    // Enrich mit Kundennamen
    return list.map((o: OnboardingEntry) => ({
      ...o,
      customerName: customers.find((c) => c.id === o.customerId)?.name || o.customerId,
    }));
  }, [onboardingItems, onbFilter, customers]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">BRRY Dashboard</h1>

      {/* KPI-Karten */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-gray-400">Aktive Apotheken</div>
              <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
                {loading ? (
                  <div className="h-7 w-16 rounded bg-white/10 animate-pulse" />
                ) : (
                  String(stats.active)
                )}
              </div>
            </div>
            <div className="ml-4">
              {loading ? (
                <div className="h-10 w-24 rounded bg-white/5 animate-pulse" />
              ) : (
                <Sparkline values={trends.active} width={96} height={40} stroke="#22d3ee" fill="rgba(34,211,238,0.15)" />
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-teal-300/80">Live aus Firestore</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-gray-400">Filialen</div>
              <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
                {loading ? (
                  <div className="h-7 w-16 rounded bg-white/10 animate-pulse" />
                ) : (
                  String(stats.branches)
                )}
              </div>
            </div>
            <div className="ml-4">
              {loading ? (
                <div className="h-10 w-24 rounded bg-white/5 animate-pulse" />
              ) : (
                <Sparkline values={trends.branches} width={96} height={40} stroke="#38bdf8" fill="rgba(56,189,248,0.15)" />
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-sky-300/80">inkl. aller Standorte</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-gray-400">Monatsumsatz</div>
              <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
                {loading ? (
                  <div className="h-7 w-24 rounded bg-white/10 animate-pulse" />
                ) : (
                  formatEUR(stats.revenue)
                )}
              </div>
            </div>
            <div className="ml-4">
              {loading ? (
                <div className="h-10 w-24 rounded bg-white/5 animate-pulse" />
              ) : (
                <Sparkline values={trends.revenue} width={96} height={40} stroke="#22d3ee" fill="rgba(34,211,238,0.15)" />
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-teal-300/80">Basis + Marketing + Extras</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-gray-400">Offene Onboardings</div>
              <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
                {loading ? (
                  <div className="h-7 w-16 rounded bg-white/10 animate-pulse" />
                ) : (
                  String(openOnboardingsForExisting)
                )}
              </div>
            </div>
            <div className="ml-4">
              {loading ? (
                <div className="h-10 w-24 rounded bg-white/5 animate-pulse" />
              ) : (
                <Sparkline values={trends.onboardings} width={96} height={40} stroke="#38bdf8" fill="rgba(56,189,248,0.15)" />
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-sky-300/80">in Arbeit</div>
        </Card>
      </section>

      {/* Kosten-Breakdown */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-gray-400">Basis (Kunden)</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? "…" : formatEUR(stats.base)}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">Fixgebühren pro aktivem Kunden</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400">Marketing</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? "…" : formatEUR(stats.marketing)}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">Pakete (180€ + 60€/weitere Filiale) + Zusatzservices</div>
          
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400">Onboardings</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? "…" : formatEUR(stats.onboardingBonus || 0)}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">Einmalig pro Abschluss{!loading && typeof stats.onboardingCount !== 'undefined' ? ` · ${stats.onboardingCount} Abschluss${stats.onboardingCount === 1 ? '' : 'e'}` : ''}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-400">Gesamt pro Monat</div>
          <div className="mt-1 text-2xl font-semibold text-white tracking-tight">
            {loading ? "…" : formatEUR(stats.revenue)}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-teal-400" />Basis</span>
            <span className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-sky-400" />Marketing</span>
            <span className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />Onboardings</span>
          </div>
        </Card>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2 transition-colors hover:bg-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Umsatzentwicklung</div>
            <div className="flex items-center gap-2">
              <button
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${recalcLoading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/10'} border-white/20 text-gray-300`}
                onClick={handleRecalc}
                disabled={recalcLoading}
                title="Alle Metrics löschen und für 12 Monate neu berechnen"
              >
                {recalcLoading ? 'Neuberechnung…' : 'Neu berechnen (12 Monate)'}
              </button>

              <div className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">Monatlich</div>
            </div>
          </div>
          <div className="h-44 sm:h-48 lg:h-56">
            {loading ? (
              <div className="h-full w-full rounded bg-white/5 animate-pulse" />
            ) : (
              <ReArea data={revenueSeries} height="100%" valueFormatter={(v) => formatEUR(v)} xLabelStep={2} />
            )}
          </div>
        </Card>

        <Card className="p-4 transition-colors hover:bg-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Onboarding-Status</div>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">Live</div>
          </div>
          <div className="h-48 sm:h-56 lg:h-64">
            {loading ? (
              <div className="h-full w-full rounded bg-white/5 animate-pulse" />
            ) : (
              <Donut
                data={onboardingDist}
                height="100%"
                innerRadius={60}
                outerRadius={80}
                centerValueFormatter={() => (onbFilter === "done" ? "Abgeschlossen" : onbFilter === "open" ? "Offen" : "Status")}
              />
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 border transition-colors ${
                onbFilter === "done"
                  ? "border-teal-400/40 text-teal-300 bg-teal-400/10"
                  : "border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
              }`}
              onClick={() => setOnbFilter("done")}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#22d3ee" }} />
              Abgeschlossen
            </button>
            <button
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 border transition-colors ${
                onbFilter === "open"
                  ? "border-sky-400/40 text-sky-300 bg-sky-400/10"
                  : "border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
              }`}
              onClick={() => setOnbFilter("open")}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#38bdf8" }} />
              Offen
            </button>
            <button
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 border transition-colors ${
                onbFilter === "all"
                  ? "border-white/30 text-white bg-white/10"
                  : "border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
              }`}
              onClick={() => setOnbFilter("all")}
            >
              Alle
            </button>
          </div>

          {/* Gefilterte Onboarding-Liste */}
          <div className="mt-4 max-h-56 overflow-auto pr-1">
            {filteredOnboardings.length === 0 ? (
              <div className="text-xs text-gray-500">Keine Einträge</div>
            ) : (
              <ul className="space-y-2">
                {filteredOnboardings.map((o) => (
                  <li key={o.id} className="flex items-center justify-between">
                    <div className="truncate text-sm text-white/90">{o.customerName}</div>
                    <div className="ml-3 flex items-center gap-2 text-[10px] text-gray-400">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                          o.status === "abgeschlossen"
                            ? "border-teal-400/40 text-teal-300 bg-teal-400/10"
                            : "border-sky-400/40 text-sky-300 bg-sky-400/10"
                        }`}
                      >
                        {o.status === "abgeschlossen" ? "Abgeschlossen" : "Offen"}
                      </span>
                      {o.updatedAt ? (
                        <span className="text-gray-500">
                          {new Date(o.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
