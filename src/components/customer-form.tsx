"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Customer, CustomerStatus } from "@/lib/types";

const statuses: CustomerStatus[] = ["aktiv", "onboarding", "inaktiv"];

export interface CustomerFormProps {
  initial?: Partial<Customer>;
  onSubmit: (data: {
    name: string;
    branches: number;
    status: CustomerStatus;
    baseFee: number;
    marketingActive: boolean;
    monthlyRevenue: number;
  }) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  // Optional visibility flags (default: true)
  showStatus?: boolean;
  showBaseFee?: boolean;
  showMonthlyRevenue?: boolean;
}

export default function CustomerForm({ initial, onSubmit, onCancel, submitLabel = "Speichern", showStatus = true, showBaseFee = true, showMonthlyRevenue = true }: CustomerFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [branches, setBranches] = useState(initial?.branches ?? 1);
  const [status, setStatus] = useState<CustomerStatus>(initial?.status ?? "onboarding");
  const [baseFee, setBaseFee] = useState(initial?.baseFee ?? 0);
  const [marketingActive, setMarketingActive] = useState(initial?.marketingActive ?? false);
  const [monthlyRevenue, setMonthlyRevenue] = useState(initial?.monthlyRevenue ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // keep form in sync when editing different customer
    setName(initial?.name ?? "");
    setBranches(initial?.branches ?? 1);
    setStatus((initial?.status as CustomerStatus) ?? "onboarding");
    setBaseFee(initial?.baseFee ?? 0);
    setMarketingActive(initial?.marketingActive ?? false);
    setMonthlyRevenue(initial?.monthlyRevenue ?? 0);
  }, [initial?.name, initial?.branches, initial?.status, initial?.baseFee, initial?.marketingActive, initial?.monthlyRevenue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit({ name, branches: Number(branches), status, baseFee: Number(baseFee), marketingActive, monthlyRevenue: Number(monthlyRevenue) });
    } catch (err: any) {
      setError(err?.message || "Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-1 text-sm">
        <label className="text-gray-300">Name</label>
        <input className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-1 text-sm">
        <label className="text-gray-300">Filialen</label>
        <input type="number" min={0} className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20" value={branches} onChange={(e) => setBranches(Number(e.target.value))} required />
      </div>
      {showStatus && (
        <div className="grid gap-1 text-sm">
          <label className="text-gray-300">Status</label>
          <select className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20" value={status} onChange={(e) => setStatus(e.target.value as CustomerStatus)}>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      {showBaseFee && (
        <div className="grid gap-1 text-sm">
          <label className="text-gray-300">Grundgebühr (€/Monat)</label>
          <input type="number" min={0} step="1" className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20" value={baseFee} onChange={(e) => setBaseFee(Number(e.target.value))} />
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <input id="mk" type="checkbox" className="size-4" checked={marketingActive} onChange={(e) => setMarketingActive(e.target.checked)} />
        <label htmlFor="mk" className="text-gray-300">Marketing aktiv</label>
      </div>
      {showMonthlyRevenue && (
        <div className="grid gap-1 text-sm">
          <label className="text-gray-300">Monatlicher Umsatz (€)</label>
          <input type="number" min={0} step="1" className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20" value={monthlyRevenue} onChange={(e) => setMonthlyRevenue(Number(e.target.value))} />
        </div>
      )}
      {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={loading} className="h-10 px-4 rounded-md bg-white/10 text-white hover:bg-white/20 disabled:opacity-50">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-md border border-white/10 hover:bg-neutral-800">Abbrechen</button>
        )}
      </div>
    </form>
  );
}
