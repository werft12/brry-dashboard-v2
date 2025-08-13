"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/ui/card";
import type { Customer, ExtraService } from "@/lib/types";
import { listenCustomers, updateCustomer, deleteCustomer } from "@/lib/db";
import { formatEUR, monthlyCustomerFee, priceMarketingForSubscription } from "@/lib/pricing";

// Generate static params for static export
export async function generateStaticParams() {
  // Return empty array for static export - pages will be generated on demand
  return [];
}

export default function CustomerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = listenCustomers((list) => {
      setCustomers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  const costs = useMemo(() => {
    if (!customer) return { base: 0, marketing: 0, extras: 0, total: 0 } as { base: number; marketing: number; extras: number; total: number };
    const base = monthlyCustomerFee(customer.status === "aktiv");
    const marketing = customer.marketingActive ? priceMarketingForSubscription(customer.branches) : 0;
    const extras = Array.isArray(customer.extraServices)
      ? customer.extraServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0)
      : 0;
    return { base, marketing, extras, total: base + marketing + extras } as { base: number; marketing: number; extras: number; total: number };
  }, [customer]);

  async function save(partial: Partial<Customer>) {
    if (!customer) return;
    try {
      setPending(true);
      await updateCustomer(customer.id, partial);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setPending(false);
    }
  }

  function addExtraService() {
    if (!customer) return;
    const next: ExtraService[] = [...(customer.extraServices || []), { name: "", price: 0 }];
    save({ extraServices: next });
  }

  function updateExtraService(idx: number, patch: Partial<ExtraService>) {
    if (!customer) return;
    const list = [...(customer.extraServices || [])];
    const curr = list[idx] || { name: "", price: 0 };
    list[idx] = { ...curr, ...patch } as ExtraService;
    save({ extraServices: list });
  }

  function removeExtraService(idx: number) {
    if (!customer) return;
    const list = [...(customer.extraServices || [])];
    list.splice(idx, 1);
    save({ extraServices: list });
  }

  function changeBranches(delta: number) {
    if (!customer) return;
    const n = Math.max(1, (customer.branches || 1) + delta);
    save({ branches: n });
  }

  async function onDelete() {
    if (!customer) return;
    const ok = window.confirm(`Kunden „${customer.name}” wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);
    if (!ok) return;
    await deleteCustomer(customer.id);
    router.push("/customers");
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Kunde</h1>
        <button
          onClick={() => router.back()}
          className="text-sm rounded-md px-3.5 py-1.5 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors"
        >
          Zurück
        </button>
      </div>

      {loading || !customer ? (
        <Card className="p-6">
          <div className="h-6 w-48 rounded bg-white/10 animate-pulse" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 w-24 rounded bg-white/5 animate-pulse" />
            ))}
          </div>
        </Card>
      ) : (
        <>
          <Card
            className={`p-6 transition-colors ${
              customer.status === 'onboarding'
                ? '!bg-amber-500/25 hover:!bg-amber-500/35 !border-amber-500/40 hover:ring-1 hover:ring-amber-400/40'
                : customer.status === 'inaktiv'
                ? '!bg-rose-500/25 hover:!bg-rose-500/35 !border-rose-500/40 hover:ring-1 hover:ring-rose-400/40'
                : ''
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-xl font-medium text-white/90">{customer.name}</div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span
                    className={`px-2 py-0.5 rounded-full border ${
                      customer.status === "aktiv"
                        ? "border-teal-400/40 text-teal-300 bg-teal-400/10"
                        : customer.status === "onboarding"
                        ? "border-amber-400/40 text-amber-300 bg-amber-400/10"
                        : "border-rose-400/40 text-rose-300 bg-rose-400/10"
                    }`}
                  >
                    {customer.status === "aktiv" ? "Aktiv" : customer.status === "onboarding" ? "Onboarding" : "Inaktiv"}
                  </span>
                  <span className="text-gray-400">{customer.branches} Filialen</span>
                  <span className={`px-2 py-0.5 rounded-full border ${
                    customer.marketingActive
                      ? "border-sky-400/40 text-sky-300 bg-sky-400/10"
                      : "border-white/10 text-gray-400"
                  }`}>
                    Marketing {customer.marketingActive ? "aktiv" : "aus"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Monatlich</div>
                <div className="text-lg font-semibold text-white tracking-tight">{formatEUR(costs.total)}</div>
                <div className="mt-1 text-[13px] text-gray-500">
                  <span className="inline-flex items-center gap-1 mr-3"><span className="h-2 w-2 rounded-full bg-teal-400 inline-block"/>Basis {formatEUR(costs.base)}</span>
                  <span className="inline-flex items-center gap-1 mr-3"><span className="h-2 w-2 rounded-full bg-sky-400 inline-block"/>Marketing {formatEUR(costs.marketing)}</span>
                  {!!costs.extras && costs.extras > 0 && (
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-400 inline-block"/>Extras {formatEUR(costs.extras)}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">Apothekeninformationen</div>
                {saved && <span className="text-teal-300 text-sm">Gespeichert</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/90 items-center">
                <div className="text-gray-400">Name</div>
                <div>{customer.name}</div>
                <div className="text-gray-400">Filialen</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeBranches(-1)}
                    disabled={pending}
                    className="h-7 w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300"
                    aria-label="Minus"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={customer.branches}
                    onChange={(e) => save({ branches: Math.max(1, Number(e.target.value || 1)) })}
                    className="w-16 text-center rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white"
                  />
                  <button
                    onClick={() => changeBranches(1)}
                    disabled={pending}
                    className="h-7 w-7 rounded-md border border-white/10 hover:border-white/20 text-gray-300"
                    aria-label="Plus"
                  >
                    +
                  </button>
                </div>
                <div className="text-gray-400">Status</div>
                <div>
                  <select
                    value={customer.status}
                    onChange={(e) => save({ status: e.target.value as Customer["status"] })}
                    className="text-sm rounded-md bg-white/5 border border-white/10 px-2.5 py-1.5 text-gray-300"
                  >
                    <option value="aktiv">Aktiv</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="inaktiv">Inaktiv</option>
                  </select>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">Marketing-Services</div>
                <button onClick={addExtraService} className="text-sm text-sky-300 hover:text-sky-200">+ Service hinzufügen</button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm text-white/90">
                <span className="text-gray-400">Marketing-Status:</span>
                <button
                  onClick={() => save({ marketingActive: !customer.marketingActive })}
                  disabled={pending}
                  className={`relative h-5 w-9 rounded-full border transition-colors ${
                    customer.marketingActive ? "bg-sky-500/30 border-sky-400/50" : "bg-white/5 border-white/15"
                  } ${pending ? "opacity-60 cursor-not-allowed" : "hover:border-white/30"}`}
                  aria-pressed={customer.marketingActive}
                >
                  <span className={`absolute top-0.5 ${customer.marketingActive ? "left-5" : "left-0.5"} h-4 w-4 rounded-full bg-white shadow transition-all`} />
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(customer.extraServices || []).length === 0 && (
                  <div className="text-sm text-gray-500">Keine Zusatzservices</div>
                )}
                {(customer.extraServices || []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-white/10 px-2 py-2">
                    <input
                      value={s.name}
                      onChange={(e) => updateExtraService(i, { name: e.target.value })}
                      placeholder="Service-Name"
                      className="flex-1 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white placeholder:text-gray-500"
                    />
                    <input
                      type="number"
                      min={0}
                      value={Number(s.price) || 0}
                      onChange={(e) => updateExtraService(i, { price: Number(e.target.value || 0) })}
                      placeholder="Preis €/Monat"
                      className="w-36 text-right rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-white placeholder:text-gray-500"
                    />
                    <button onClick={() => removeExtraService(i)} className="text-gray-400 hover:text-red-300" aria-label="Löschen">×</button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex justify-end">
            <button onClick={onDelete} className="text-sm rounded-md px-3.5 py-1.5 border border-red-500/30 text-red-300 hover:border-red-400/50 hover:text-red-200">
              Löschen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
