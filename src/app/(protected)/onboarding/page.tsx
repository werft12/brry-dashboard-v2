"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import { createCustomer, listenCustomers, updateCustomer, deleteCustomer } from "@/lib/db";
import { ensureOnboarding, listenOnboardings, setOnboardingStatus, setOnboardingTasks } from "@/lib/onboarding";
import { addOnboardingBonusNow } from "@/lib/metrics";
import Card from "@/components/ui/card";
import CustomerForm from "@/components/customer-form";
import { readAppSettings, type AppSettings } from "@/lib/settings";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface Row {
  customer: Customer;
  tasks: { webshop: boolean; app: boolean; marketing: boolean };
  status: "in_bearbeitung" | "abgeschlossen";
}

export default function OnboardingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [onb, setOnb] = useState<Record<string, { tasks: { webshop: boolean; app: boolean; marketing: boolean }; status: "in_bearbeitung" | "abgeschlossen" }>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [app, setApp] = useState<AppSettings | undefined>(undefined);

  useEffect(() => {
    const u1 = listenCustomers(async (list) => {
      setCustomers(list);
      // Only ensure doc for customers actually in onboarding
      const onlyOnb = list.filter((c) => c.status === 'onboarding');
      await Promise.all(onlyOnb.map((c) => ensureOnboarding(c.id)));
      setLoading(false);
    });
    const u2 = listenOnboardings((obs) => {
      const map: Record<string, { tasks: { webshop: boolean; app: boolean; marketing: boolean }; status: "in_bearbeitung" | "abgeschlossen" }> = {};
      obs.forEach((o) => {
        map[o.customerId] = { tasks: o.tasks, status: o.status };
      });
      setOnb(map);
    });
    return () => {
      u1();
      u2();
    };
  }, [customers.length]);

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

  // Keine automatische Schließung mehr – Abschluss erfolgt manuell per Button

  const rows: Row[] = useMemo(() => {
    return customers.map((c) => {
      const ob = onb[c.id];
      return {
        customer: c,
        tasks: ob?.tasks ?? { webshop: false, app: false, marketing: false },
        status: ob?.status ?? "in_bearbeitung",
      };
    });
  }, [customers, onb]);

  const inProgress = useMemo(() => rows.filter((r) => r.status === "in_bearbeitung" && r.customer.status === 'onboarding'), [rows]);
  const done = useMemo(() => rows.filter((r) => r.status === "abgeschlossen"), [rows]);

  const kpis = useMemo(() => {
    const onboardingCount = inProgress.length;
    // KPI: Anzahl Aufgaben, die noch in Arbeit sind (nur für laufende Onboardings)
    const webshopDone = inProgress.filter((r) => r.tasks.webshop).length;
    const appDone = inProgress.filter((r) => r.tasks.app).length;
    const webshopInArbeit = Math.max(0, onboardingCount - webshopDone);
    const appInArbeit = Math.max(0, onboardingCount - appDone);
    return { onboardingCount, webshopInArbeit, appInArbeit };
  }, [inProgress]);

  async function toggle(cid: string, key: keyof Row["tasks"], value: boolean) {
    const prev = (onb[cid]?.tasks) || { webshop: false, app: false, marketing: false };
    const tasks = { ...prev, [key]: value };
    await setOnboardingTasks(cid, tasks);
  }

  async function changeStatus(cid: string, status: "in_bearbeitung" | "abgeschlossen") {
    const prevStatus = onb[cid]?.status;
    if (prevStatus === status) return; // nichts zu tun
    // Kundenstatus zuerst setzen, dann Onboarding-Status → vermeidet Race mit Reconciliation/Listenern
    const targetCustomerStatus = status === "abgeschlossen" ? "aktiv" : "onboarding";
    await quickSave(cid, { status: targetCustomerStatus } as any);
    await setOnboardingStatus(cid, status);
    try {
      const fee = Number(app?.pricing?.onboardingFee) || 750;
      if (status === "abgeschlossen") {
        // Einmalig addieren
        await addOnboardingBonusNow(fee);
      } else if (prevStatus === "abgeschlossen" && status === "in_bearbeitung") {
        // Reopen: wieder abziehen
        await addOnboardingBonusNow(-fee);
      }
    } catch {}
  }

  async function quickSave(cid: string, patch: Partial<Customer>) {
    try {
      setPending((p) => ({ ...p, [cid]: true }));
      await updateCustomer(cid, patch);
      setSaved((s) => ({ ...s, [cid]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [cid]: false })), 1500);
    } finally {
      setPending((p) => ({ ...p, [cid]: false }));
    }
  }

  async function setMarketing(cid: string, value: boolean) {
    await quickSave(cid, { marketingActive: value } as any);
  }

  async function setBranches(cid: string, value: number) {
    const v = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
    await quickSave(cid, { branches: v } as any);
  }

  async function setNotes(cid: string, value: string) {
    await quickSave(cid, { notes: value } as any);
  }

  async function handleCreate(data: any) {
    await createCustomer({
      name: data.name,
      branches: data.branches,
      status: "onboarding",
      baseFee: 0,
      marketingActive: !!data.marketingActive,
      monthlyRevenue: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      id: "",
    } as unknown as Customer);
    setShowCreate(false);
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Onboarding</h1>
        <button onClick={() => setShowCreate(true)} className="h-10 px-4 rounded-md border border-white/10 bg-neutral-800 text-gray-100 hover:bg-neutral-700 shrink-0">Neue Apotheke</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs leading-tight text-gray-400">Apotheken im<br />Onboarding</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.onboardingCount}</div>
        </Card>
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs leading-tight text-gray-400">Webshops in<br />Arbeit</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.webshopInArbeit}</div>
        </Card>
        <Card className="h-24 flex flex-col items-center justify-center text-center">
          <div className="text-xs leading-tight text-gray-400">Apps in<br />Arbeit</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.appInArbeit}</div>
        </Card>
      </div>

      {loading && (
        <Card className="p-4 text-gray-400">Lade…</Card>
      )}

      {!loading && inProgress.length === 0 && (
        <Card className="p-4 text-gray-400">Keine Apotheken im Onboarding</Card>
      )}

      {!loading && inProgress.map((r) => (
        <Card key={r.customer.id} className="p-4">
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between cursor-pointer select-none gap-2"
            onClick={() => setExpanded((m) => ({ ...m, [r.customer.id]: !m[r.customer.id] }))}
            role="button"
            aria-expanded={!!expanded[r.customer.id]}
            aria-label="Details umschalten"
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate break-words">{r.customer.name}</h2>
              <div className="mt-0.5 text-xs text-white/60">{r.customer.branches} Filiale{r.customer.branches === 1 ? "" : "n"} · Marketing {r.customer.marketingActive ? "aktiv" : "inaktiv"}</div>
            </div>
            <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); changeStatus(r.customer.id, "abgeschlossen"); }}
                className="h-9 px-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-sm shrink-0"
              >Onboarding abschließen</button>
              {confirmId === r.customer.id ? (
                <div className="flex items-center gap-1 flex-wrap sm:justify-end w-full sm:w-auto">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmId(null); }} className="h-9 px-2 rounded-md border border-white/10 text-gray-200 hover:bg-neutral-800 text-sm shrink-0">Abbrechen</button>
                  <button
                    type="button"
                    onClick={async (e) => { e.stopPropagation(); await deleteCustomer(r.customer.id); setConfirmId(null); }}
                    className="h-9 px-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-sm shrink-0"
                    aria-label="Löschen bestätigen"
                  >Löschen</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmId(r.customer.id); }}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0 ml-auto sm:ml-0"
                  aria-label="Kunde löschen"
                >✕</button>
              )}
            </div>
          </div>

          {expanded[r.customer.id] && (
            <div className="mt-3 grid gap-4">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-400 inline-block" />
                  <span>Details</span>
                </div>
                <div className="min-w-[80px] text-right">{saved[r.customer.id] ? <span className="text-teal-300">Gespeichert</span> : pending[r.customer.id] ? <span className="text-gray-400">Speichern…</span> : null}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[.03] hover:bg-white/[.06] transition-colors px-3 py-2">
                  <span>Filialen</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBranches(r.customer.id, Math.max(1, (r.customer.branches || 1) - 1))}
                      className="h-7 w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300 disabled:opacity-50"
                      aria-label="Filialen verringern"
                      disabled={!!pending[r.customer.id]}
                    >−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(r.customer.branches ?? 1)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        const val = Math.max(1, Number(raw || 1));
                        setBranches(r.customer.id, val);
                      }}
                      className="w-16 text-center rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white"
                    />
                    <button
                      onClick={() => setBranches(r.customer.id, Math.max(1, (r.customer.branches || 1) + 1))}
                      className="h-7 w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300 disabled:opacity-50"
                      aria-label="Filialen erhöhen"
                      disabled={!!pending[r.customer.id]}
                    >+</button>
                  </div>
                </div>
                <label className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[.03] hover:bg-white/[.06] transition-colors px-3 py-2">
                  <span>Marketing-Service aktiv</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-500"
                    checked={!!r.customer.marketingActive}
                    onChange={(e) => setMarketing(r.customer.id, e.target.checked)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="space-y-2.5">
                  <div className="text-xs text-white/60">Haken bedeutet: <span className="text-white/80">erledigt</span></div>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[.03] hover:bg-white/[.06] transition-colors px-3 py-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!r.tasks.webshop} onChange={(e) => toggle(r.customer.id, "webshop", e.target.checked)} />
                    <span className="inline-flex items-center gap-2"><span role="img" aria-label="Webshop">🛒</span> Webshop</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[.03] hover:bg-white/[.06] transition-colors px-3 py-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!r.tasks.app} onChange={(e) => toggle(r.customer.id, "app", e.target.checked)} />
                    <span className="inline-flex items-center gap-2"><span role="img" aria-label="App">📱</span> App</span>
                  </label>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[.03] hover:bg-white/[.06] transition-colors px-3 py-2">
                  <div className="text-sm text-gray-300 mb-2">Notiz</div>
                  <textarea
                    className="w-full min-h-[96px] rounded-md bg-white/5 border border-white/10 px-2 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Kurze Notiz, nächster Schritt oder Blocker…"
                    defaultValue={(r.customer as any).notes || ""}
                    onChange={(e) => setNotes(r.customer.id, e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      ))}

      {done.length > 0 && (
        <div className="grid gap-3">
          <h3 className="text-lg font-semibold">Abgeschlossene Apotheken</h3>
          <div className="grid gap-3">
            {done.map((r) => (
              <Card key={r.customer.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{r.customer.name}</div>
                  <select value={r.status} onChange={(e) => changeStatus(r.customer.id, e.target.value as any)} className="h-9 px-2 rounded-md border border-white/10 bg-neutral-800 text-gray-100">
                    <option value="in_bearbeitung">In Bearbeitung</option>
                    <option value="abgeschlossen">Abgeschlossen</option>
                  </select>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Neue Apotheke</h2>
              <button onClick={() => setShowCreate(false)} className="h-9 px-3 rounded-md border border-white/10 hover:bg-neutral-800">Schließen</button>
            </div>
            <CustomerForm submitLabel="Anlegen" onSubmit={handleCreate} onCancel={() => setShowCreate(false)} showStatus={false} showBaseFee={false} showMonthlyRevenue={false} />
          </div>
        </div>
      )}
    </div>
  );
}
