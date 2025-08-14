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
import {
  setMarketingServicePrepared,
  setMarketingServiceCompleted,
  setCustomMarketingServicePrepared,
  setCustomMarketingServiceCompleted,
} from "@/lib/marketing-checklist";
import { TwoCheckbox } from "@/components/ui/two-checkbox";

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
  const [heartbeat, setHeartbeat] = useState(0);
  // Expand/Collapse state per customer (persisted per month)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Debounce/flush timers and dirty sets
  const debounceTimersRef = useRef<Record<string, any>>({});

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
    localPreparedRef.current = {};
    localCustomRef.current = {} as any;
    localCustomPreparedRef.current = {};
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
          } else {
            // New item only in snapshot
            merged.push(b);
          }
        });
        setLocalTick((x) => x + 1);
        return merged;
      });
      setLoading(false);
    });
    return () => { u(); };
    // No local state initialization needed - using only Firestore data
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

  // ... rest of the code remains the same ...

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Marketing-Services</h1>
      
      {checklists.map((checklist) => (
        <div key={checklist.id} className="mb-4 border rounded-lg">
          <div 
            className="p-4 cursor-pointer bg-gray-50 hover:bg-gray-100"
            onClick={() => setExpanded(prev => ({ ...prev, [checklist.customerId]: !prev[checklist.customerId] }))}
          >
            <h2 className="font-semibold">Customer {checklist.customerId}</h2>
          </div>
          
          {expanded[checklist.customerId] && (
            <div className="p-4 border-t">
              {/* Standard Services */}
              {SERVICES.map(({ key, label }) => {
                const service = checklist.services[key as keyof typeof checklist.services];
                const prepared = !!service?.prepared;
                const completed = !!service?.done;
                
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span>{label}</span>
                    <TwoCheckbox
                      prepared={prepared}
                      completed={completed}
                      onPreparedChange={(prepared) => toggleServicePrepared(checklist.customerId, key, prepared)}
                      onCompletedChange={(completed) => toggleServiceCompleted(checklist.customerId, key, completed)}
                    />
                  </div>
                );
              })}
              
              {/* Custom Services */}
              {Object.entries(checklist.custom || {}).map(([key, service]) => {
                const prepared = !!service.prepared;
                const completed = !!service.done;
                
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span>{service.label}</span>
                    <TwoCheckbox
                      prepared={prepared}
                      completed={completed}
                      onPreparedChange={(prepared) => toggleCustomServicePrepared(checklist.customerId, key, service.label, prepared)}
                      onCompletedChange={(completed) => toggleCustomServiceCompleted(checklist.customerId, key, service.label, completed)}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {(savedUntilRef.current[checklist.customerId] || 0) > Date.now() && (
            <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Gespeichert
            </div>
          )}
        </div>
      ))}
      })}
    </div>
  );
}
