"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listenCustomers } from "@/lib/db";
import type { Customer } from "@/lib/types";
import Card from "@/components/ui/card";
import {
  listenMarketingChecklistForMonth,
  ensureMarketingChecklist,
  setMarketingService,
  setMarketingServices,
  yearMonthKey,
  type MarketingChecklist,
  type MarketingServiceKey,
  migrateMarketingChecklists,
  setCustomMarketingService,
} from "@/lib/marketing-checklist";

const SERVICES: { key: MarketingServiceKey; label: string }[] = [
  { key: "handzettel", label: "Handzettel" },
  { key: "poster", label: "Poster A1" },
  { key: "social", label: "Social Media" },
  { key: "newsletter", label: "Newsletter" },
];

export default function MarketingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ym, setYm] = useState<string>(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return yearMonthKey(next);
  });
  // Folgemonat automatisch verfolgen; wird bei manueller Navigation deaktiviert
  const [autoFollowNext, setAutoFollowNext] = useState(true);
  const [checklists, setChecklists] = useState<MarketingChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const lastLocalWriteRef = useRef<Record<string, number>>({});
  const localStateRef = useRef<Record<string, Record<MarketingServiceKey, boolean>>>({});
  const localCustomRef = useRef<Record<string, Record<string, boolean>>>({});
  const pendingOverridesRef = useRef<Record<string, Record<string, { value: boolean; until: number }>>>({});
  const [localTick, setLocalTick] = useState(0);
  const savedUntilRef = useRef<Record<string, number>>({});
  const [savedTick, setSavedTick] = useState(0);
  const [heartbeat, setHeartbeat] = useState(0);
  // Expand/Collapse state per customer (persisted per month)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Debounce/flush timers and dirty sets
  const debounceTimersRef = useRef<Record<string, any>>({});
  const dirtyCustomRef = useRef<Record<string, Set<string>>>({});

  // Storage helpers
  const expandedStorageKey = (value: string) => `marketingExpanded:${value}`;
  const loadExpanded = (value: string) => {
    try {
      const raw = localStorage.getItem(expandedStorageKey(value));
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  };

  // Schedules a debounced flush of current local states for a customer
  function scheduleFlush(customerId: string) {
    if (debounceTimersRef.current[customerId]) {
      clearTimeout(debounceTimersRef.current[customerId]);
    }
    debounceTimersRef.current[customerId] = setTimeout(async () => {
      try {
        await ensureMarketingChecklist(customerId, ym);
        const base = localStateRef.current[customerId] || { handzettel: false, poster: false, social: false, newsletter: false };
        await setMarketingServices(customerId, ym, base as any);
        const dirty = Array.from(dirtyCustomRef.current[customerId] || []);
        if (dirty.length) {
          const defs = customDefsByCustomer[customerId] || [];
          for (const key of dirty) {
            const label = defs.find((d) => d.key === key)?.label || key;
            const val = !!(localCustomRef.current[customerId] || {})[key];
            await setCustomMarketingService(customerId, ym, key, label, val);
          }
          dirtyCustomRef.current[customerId]?.clear();
        }
        savedUntilRef.current[customerId] = Date.now() + 1500;
        setSavedTick((x) => x + 1);
      } catch (e) {
        console.error('flush failed', e);
      }
    }, 300);
  }
  

  // Data subscriptions
  useEffect(() => {
    // One-time migration of legacy docs (safe/idempotent)
    migrateMarketingChecklists().then((n) => {
      if (n > 0) console.info(`Marketing migration updated ${n} docs`);
    }).catch((e) => console.warn("Marketing migration skipped", e));

    const u1 = listenCustomers((list) => setCustomers(list));
    return () => { u1(); };
  }, []);

  // Load persisted auto-follow on mount, and persist on change
  useEffect(() => {
    try {
      const raw = localStorage.getItem('marketingAutoFollowNext');
      if (raw !== null) setAutoFollowNext(raw === '1');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem('marketingAutoFollowNext', autoFollowNext ? '1' : '0'); } catch {}
  }, [autoFollowNext]);

  // Heartbeat für Pending-Override-Spinner Ablauf
  useEffect(() => {
    const id = setInterval(() => setHeartbeat((x) => x + 1), 300);
    return () => clearInterval(id);
  }, []);

  // Beim Monatswechsel lokale Optimistic-Refs zurücksetzen, um alte Zustände zu vermeiden
  useEffect(() => {
    localStateRef.current = {};
    localCustomRef.current = {} as any;
    pendingOverridesRef.current = {} as any;
    lastLocalWriteRef.current = {};
    // clear any scheduled flushes when month changes
    try { Object.values(debounceTimersRef.current).forEach((id) => clearTimeout(id)); } catch {}
    debounceTimersRef.current = {};
    dirtyCustomRef.current = {};
    // Load persisted expanded state for the selected month
    setExpanded(loadExpanded(ym));
  }, [ym]);

  useEffect(() => {
    setLoading(true);
    // Clear stale list immediately to avoid showing other month data
    setChecklists([]);
    const u = listenMarketingChecklistForMonth(ym, (list) => {
      setChecklists((prev) => {
        const byIdPrev = new Map(prev.map((p) => [p.id, p] as const));
        const byIdNew = new Map(list.map((p) => [p.id, p] as const));
        const merged: typeof prev = [];
        // Only consider IDs from the NEW snapshot (current month)
        byIdNew.forEach((b, id) => {
          const a = byIdPrev.get(id);
          if (a) {
            const lastLocal = lastLocalWriteRef.current[a.customerId] ?? 0;
            if ((b.updatedAt ?? 0) < lastLocal) {
              merged.push(a);
              return;
            }
            // Trust the latest snapshot entirely to avoid stale doneAt keeping items checked
            merged.push(b);
            localStateRef.current[b.customerId] = {
              handzettel: !!b.services.handzettel?.done,
              poster: !!b.services.poster?.done,
              social: !!b.services.social?.done,
              newsletter: !!b.services.newsletter?.done,
            };
            localCustomRef.current[b.customerId] = Object.fromEntries(Object.entries(b.custom || {}).map(([k, v]) => [k, !!v.done]));
          } else {
            // New item only in snapshot
            merged.push(b);
            localStateRef.current[b.customerId] = {
              handzettel: !!b.services.handzettel?.done,
              poster: !!b.services.poster?.done,
              social: !!b.services.social?.done,
              newsletter: !!b.services.newsletter?.done,
            };
            localCustomRef.current[b.customerId] = Object.fromEntries(Object.entries(b.custom || {}).map(([k, v]) => [k, !!v.done]));
          }
        });
        setLocalTick((x) => x + 1);
        return merged;
      });
      setLoading(false);
    });
    return () => { u(); };
  }, [ym]);

  useEffect(() => {
    localStateRef.current = {};
    localCustomRef.current = {};
    pendingOverridesRef.current = {};
    lastLocalWriteRef.current = {};
  }, [ym]);

  // Persist expanded state for the current month whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(expandedStorageKey(ym), JSON.stringify(expanded));
    } catch {}
  }, [expanded, ym]);

  // Ensure checklist docs exist for all active marketing customers for selected month
  useEffect(() => {
    async function ensureAll() {
      const active = customers.filter((c) => c.marketingActive);
      await Promise.all(active.map((c) => ensureMarketingChecklist(c.id, ym)));
    }
    if (customers.length) ensureAll();
  }, [customers, ym]);

  // Helpers
  const clByCustomer: Record<string, MarketingChecklist> = useMemo(() => {
    const map: Record<string, MarketingChecklist> = {};
    for (const it of checklists) map[it.customerId] = it;
    return map;
  }, [checklists]);

  const activeCustomers = useMemo(() => customers.filter((c) => c.marketingActive), [customers]);

  const slug = (s: string) => s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

  const customDefsByCustomer = useMemo(() => {
    const map: Record<string, { key: string; label: string }[]> = {};
    for (const c of activeCustomers) {
      const defs = (c.extraServices || [])
        .filter((s) => (s.name || '').trim().length > 0)
        .map((s) => ({ key: slug(s.name), label: s.name.trim() }));
      map[c.id] = defs;
    }
    return map;
  }, [activeCustomers]);

  const ymToLabel = (value: string) => {
    const [y, m] = value.split("-").map((v) => parseInt(v, 10));
    const d = new Date(y, (m || 1) - 1, 1);
    return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  };

  // Automatisches Umblättern beim Monatswechsel (zeigt immer den Folgemonat)
  useEffect(() => {
    const check = () => {
      if (!autoFollowNext) return;
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const key = yearMonthKey(next);
      if (key !== ym) setYm(key);
    };
    // Sofort prüfen beim Mount / Dependency-Änderung
    check();
    // Regelmäßig prüfen
    const id = setInterval(check, 60_000);
    // Bei Fokus/Visibility erneut prüfen
    const onFocus = () => check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [autoFollowNext, ym]);

  

  const kpis = useMemo(() => {
    const totalCustomers = activeCustomers.length;
    let totalServices = 0;
    let doneServices = 0;
    for (const c of activeCustomers) {
      const customDefs = customDefsByCustomer[c.id] || [];
      totalServices += SERVICES.length + customDefs.length;
      const local = localStateRef.current[c.id];
      const localCustom = localCustomRef.current[c.id] || {};
      if (local) {
        for (const s of SERVICES) if (local[s.key]) doneServices += 1;
      } else {
        const cl = clByCustomer[c.id];
        if (cl) for (const s of SERVICES) if (cl.services[s.key]?.done) doneServices += 1;
      }
      // custom
      const cl = clByCustomer[c.id];
      for (const def of customDefs) {
        const effective = (localCustom[def.key] !== undefined)
          ? localCustom[def.key]
          : !!cl?.custom?.[def.key]?.done;
        if (effective) doneServices += 1;
      }
    }
    const openTasks = totalServices - doneServices;
    const progress = totalServices === 0 ? 0 : Math.round((doneServices / totalServices) * 100);
    return { totalCustomers, progress, openTasks };
  }, [activeCustomers, clByCustomer, localTick, customDefsByCustomer]);

  function changeMonth(delta: number) {
    const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
    const date = new Date(y, m - 1 + delta, 1);
    setYm(yearMonthKey(date));
    // Bei manueller Navigation Autoverfolgung deaktivieren
    setAutoFollowNext(false);
  }

  async function toggleService(customerId: string, service: MarketingServiceKey, checked: boolean) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("toggleService", { customerId, ym, service, checked });
    }
    lastLocalWriteRef.current[customerId] = Date.now();
    // Setze Pending-Override für sofortige UI-Stabilität (500ms)
    const until = Date.now() + 800;
    pendingOverridesRef.current[customerId] = {
      ...(pendingOverridesRef.current[customerId] || {}),
      [service]: { value: checked, until },
    };
    // 1) Bestimme nextStates deterministisch aus aktuellem Snapshot
    // Ausgangspunkt ist unsere lokale Authoritative State Map
    const currentLocal = localStateRef.current[customerId] || { handzettel: false, poster: false, social: false, newsletter: false };
    const base: Record<MarketingServiceKey, boolean> = { ...currentLocal, [service]: checked } as any;

    // 2) Optimistisches UI-Update auf Basis von nextStates
    setChecklists((prev) => {
      const idx = prev.findIndex((p) => p.customerId === customerId);
      const servicesObj: MarketingChecklist["services"] = {
        handzettel: { done: base.handzettel },
        poster: { done: base.poster },
        social: { done: base.social },
        newsletter: { done: base.newsletter },
      };
      if (idx === -1) {
        const created: MarketingChecklist = {
          id: `${customerId}_${ym}`,
          customerId,
          ym,
          services: servicesObj,
          updatedAt: Date.now(),
        } as MarketingChecklist;
        return [...prev, created];
      } else {
        const copy = [...prev];
        const item = copy[idx];
        copy[idx] = { ...item, services: servicesObj, updatedAt: Date.now() };
        return copy;
      }
    });
    // Update local authoritative state immediately
    localStateRef.current[customerId] = { ...base };
    setLocalTick((x) => x + 1);
    // Debounced flush to Firestore
    scheduleFlush(customerId);
  }

  async function toggleCustomService(customerId: string, key: string, label: string, checked: boolean) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("toggleCustomService", { customerId, ym, key, label, checked });
    }
    lastLocalWriteRef.current[customerId] = Date.now();
    const tag = `custom:${key}`;
    const until = Date.now() + 800;
    pendingOverridesRef.current[customerId] = {
      ...(pendingOverridesRef.current[customerId] || {}),
      [tag]: { value: checked, until },
    };
    const baseStd = localStateRef.current[customerId] || { handzettel: false, poster: false, social: false, newsletter: false };
    const baseCustom = { ...(localCustomRef.current[customerId] || {}), [key]: checked };
    setChecklists((prev) => {
      const idx = prev.findIndex((p) => p.customerId === customerId);
      if (idx === -1) {
        const created: MarketingChecklist = {
          id: `${customerId}_${ym}`,
          customerId,
          ym,
          services: {
            handzettel: { done: baseStd.handzettel },
            poster: { done: baseStd.poster },
            social: { done: baseStd.social },
            newsletter: { done: baseStd.newsletter },
          },
          custom: { [key]: { label, done: checked } },
          updatedAt: Date.now(),
        } as any;
        return [...prev, created];
      } else {
        const copy = [...prev];
        const item = copy[idx];
        copy[idx] = { ...item, custom: { ...(item.custom || {}), [key]: { label, done: checked } }, updatedAt: Date.now() } as any;
        return copy;
      }
    });
    localCustomRef.current[customerId] = baseCustom;
    setLocalTick((x) => x + 1);
    // Persist immediately to avoid revert flicker on snapshots
    try {
      await ensureMarketingChecklist(customerId, ym);
      await setCustomMarketingService(customerId, ym, key, label, checked);
      // mark local write as newest to avoid older snapshots overriding UI
      lastLocalWriteRef.current[customerId] = Date.now();
      savedUntilRef.current[customerId] = Date.now() + 1500;
      setSavedTick((x) => x + 1);
    } catch (e) {
      console.error("toggleCustomService immediate write failed", e);
    }
  }

  return (
    <div className="grid gap-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Marketing-Services</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="h-10 px-3 rounded-md border border-white/10 hover:bg-neutral-800">←</button>
          <div className="px-3 py-2 rounded-md border border-white/10 bg-neutral-900 tabular-nums">{ymToLabel(ym)}</div>
          <button onClick={() => changeMonth(1)} className="h-10 px-3 rounded-md border border-white/10 hover:bg-neutral-800">→</button>
          {autoFollowNext ? null : (
            <button
              onClick={() => setAutoFollowNext(true)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20"
              title="Automatik wieder aktivieren"
            >
              Auto an
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-sm text-gray-400">Apotheken mit Marketing</div><div className="text-2xl font-semibold">{activeCustomers.length}</div></Card>
        <Card className="p-4"><div className="text-sm text-gray-400">Fortschritt</div><div className="text-2xl font-semibold">{kpis.progress}%</div></Card>
        <Card className="p-4"><div className="text-sm text-gray-400">Offene Aufgaben</div><div className="text-2xl font-semibold">{kpis.openTasks}</div></Card>
      </div>

      {/* Gesamt-Fortschritt Balken */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-400">Gesamt-Fortschritt</div>
          <div className="text-sm text-gray-300 tabular-nums">{kpis.progress}%</div>
        </div>
        <div className="h-2 w-full rounded bg-white/10 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${kpis.progress}%` }} />
        </div>
      </Card>

      {loading && (
        <Card className="p-4 text-gray-400">Lade…</Card>
      )}
      {!loading && activeCustomers.map((c) => {
        const cl = clByCustomer[c.id];
        // Fortschritt berechnen
        const baseDone = SERVICES.reduce(
          (n, s) => n + ((localStateRef.current[c.id]?.[s.key] ?? (cl?.services?.[s.key]?.done ?? false)) ? 1 : 0),
          0
        );
        const customDefs = customDefsByCustomer[c.id] || [];
        const customDone = customDefs.reduce((n, def) => n + (
          (localCustomRef.current[c.id]?.[def.key] ?? (cl?.custom?.[def.key]?.done ?? false)) ? 1 : 0
        ), 0);
        const doneCount = baseDone + customDone;
        const totalCount = SERVICES.length + customDefs.length;
        const progressPct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
        const isExpanded = expanded[c.id] ?? false;
        const toggleExpand = () => setExpanded((prev) => ({ ...prev, [c.id]: !(prev[c.id] ?? false) }));

        return (
          <Card key={c.id} className="p-3 min-w-0 overflow-hidden">
            {/* Header als Toggle */}
            <button
              type="button"
              onClick={toggleExpand}
              className="w-full flex items-center justify-between gap-3 mb-2 text-left hover:bg-white/5 rounded-md px-3 pt-3 pb-2 transition-colors min-w-0"
              title={`${doneCount}/${totalCount} erledigt`}
            >
              <div className="min-w-0 flex items-center">
                <h2 className="text-base font-medium truncate leading-[1]">{c.name}</h2>
              </div>
              <div className="flex items-center gap-2 h-full">
                <div className="hidden sm:flex items-center text-xs text-gray-400 leading-[1] whitespace-nowrap shrink-0">{ymToLabel(ym)}</div>
                <div className="h-[6px] w-24 sm:w-28 rounded bg-white/10 overflow-hidden shrink-0">
                  <div className="h-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="text-[10px] text-gray-400 tabular-nums leading-[1]">{progressPct}%</div>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-gray-300 tabular-nums" aria-label={`${doneCount} von ${totalCount} erledigt`}>{doneCount}/{totalCount}</span>
                </div>
              </div>
            </button>

            {/* Body */}
            {isExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 px-1">
                {SERVICES.map(({ key, label }) => {
                  const local = localStateRef.current[c.id];
                  const svc = cl?.services?.[key];
                  const po = pendingOverridesRef.current[c.id]?.[key];
                  const now = Date.now();
                  const effective = local ? local[key] : (svc?.done ?? false);
                  const checked = po && po.until > now ? po.value : effective;
                  return (
                    <label
                      key={key}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors hover:border-white/20 text-sm min-w-0 ${checked ? 'border border-emerald-500/30 bg-emerald-500/10' : 'border border-white/10 bg-neutral-900'}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          {label}
                          {po && po.until > now && (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/70" aria-label="wird gespeichert" />
                          )}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-500"
                        checked={checked}
                        onChange={(e) => toggleService(c.id, key, e.target.checked)}
                      />
                    </label>
                  );
                })}
                {customDefs.map(({ key, label }) => {
                  const po = pendingOverridesRef.current[c.id]?.[`custom:${key}`];
                  const now = Date.now();
                  const localC = localCustomRef.current[c.id] || {};
                  const svc = cl?.custom?.[key];
                  const effective = (localC[key] !== undefined) ? localC[key] : !!svc?.done;
                  const checked = po && po.until > now ? po.value : effective;
                  return (
                    <label
                      key={`custom-${key}`}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors hover:border-white/20 text-sm min-w-0 ${checked ? 'border border-emerald-500/30 bg-emerald-500/10' : 'border border-white/10 bg-neutral-900'}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2">
                          {label}
                          {po && po.until > now && (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/70" aria-label="wird gespeichert" />
                          )}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-500"
                        checked={checked}
                        onChange={(e) => toggleCustomService(c.id, key, label, e.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
            {(savedUntilRef.current[c.id] || 0) > Date.now() && (
              <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Gespeichert
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
