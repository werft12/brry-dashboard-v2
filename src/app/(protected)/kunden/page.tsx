"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import { createCustomer, deleteCustomer, listenCustomers, updateCustomer } from "@/lib/db";
import CustomerForm from "@/components/customer-form";
import { monthlyCustomerFee, priceMarketingForSubscription, formatEUR } from "@/lib/pricing";
import Card from "@/components/ui/card";
import Stat from "@/components/ui/stat";
import Badge from "@/components/ui/badge";

export default function KundenPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenCustomers((list) => {
      setItems(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const kpis = useMemo(() => {
    const active = items.filter((c) => c.status === "aktiv").length;
    const baseSum = items.reduce((acc, c) => acc + monthlyCustomerFee(c.status === "aktiv"), 0);
    const marketingSum = items.reduce((acc, c) => acc + (c.marketingActive ? priceMarketingForSubscription(c.branches) : 0), 0);
    const total = baseSum + marketingSum; // Zusatzservices später
    return { active, baseSum, marketingSum, total };
  }, [items]);

  async function handleCreate(data: any) {
    await createCustomer({
      name: data.name,
      branches: data.branches,
      status: data.status,
      baseFee: data.baseFee,
      marketingActive: data.marketingActive,
      monthlyRevenue: data.monthlyRevenue,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      id: "",
    } as unknown as Customer);
    setShowCreate(false);
  }

  async function handleUpdate(id: string, data: any) {
    await updateCustomer(id, data);
    setEditing(null);
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kundenübersicht</h1>
        <button onClick={() => setShowCreate(true)} className="h-10 px-4 rounded-md border border-white/10 bg-neutral-800 text-gray-100 hover:bg-neutral-700">Neue Apotheke</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Aktive Kunden" value={`${kpis.active}`} />
        <Stat label="Marketing/Monat" value={formatEUR(kpis.marketingSum)} />
        <Stat label="Gesamt/Monat" value={formatEUR(kpis.total)} />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <input
            placeholder="Apotheke suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-white/20 w-full max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-300 border-b border-white/10">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Filialen</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Marketing</th>
                <th className="py-2 pr-3">Kosten/Monat</th>
                <th className="py-2 pr-3 w-40">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Lade…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Keine Einträge</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-white/10 last:border-0">
                  <td className="py-2 pr-3 font-medium text-white">{c.name}</td>
                  <td className="py-2 pr-3">{c.branches}</td>
                  <td className="py-2 pr-3">
                    {c.status === "aktiv" && <Badge variant="success">Aktiv</Badge>}
                    {c.status === "onboarding" && <Badge variant="warning">Onboarding</Badge>}
                    {c.status === "inaktiv" && <Badge variant="muted">Inaktiv</Badge>}
                  </td>
                  <td className="py-2 pr-3">{c.marketingActive ? "Aktiv" : "Inaktiv"}</td>
                  <td className="py-2 pr-3">
                    {(() => {
                      const base = monthlyCustomerFee(c.status === "aktiv");
                      const marketing = c.marketingActive ? priceMarketingForSubscription(c.branches) : 0;
                      const total = base + marketing; // Zusatzservices folgen später
                      return formatEUR(total);
                    })()}
                  </td>
                  <td className="py-2 pr-3">
                    {confirmId === c.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="h-9 px-3 rounded-md border border-white/10 text-gray-200 hover:bg-neutral-800"
                        >Abbrechen</button>
                        <button
                          type="button"
                          onClick={async () => { await deleteCustomer(c.id); setConfirmId(null); }}
                          className="h-9 px-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                        >Löschen</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setEditing(c)} className="h-9 px-3 rounded-md border border-white/10 hover:bg-neutral-800">Bearbeiten</button>
                        <button type="button" onClick={() => setConfirmId(c.id)} className="h-9 px-3 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">Löschen</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-40 bg-black/30 grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Neue Apotheke</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="h-9 px-3 rounded-md border border-white/10 hover:bg-neutral-800">Schließen</button>
            </div>
            <CustomerForm submitLabel="Anlegen" onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
          </div>
        </div>
      )}

      {/* Inline-Confirm ersetzt Overlay-Modal für Löschen */}

      {editing && (
        <div className="fixed inset-0 z-40 bg-black/30 grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Bearbeiten: {editing.name}</h2>
              <button type="button" onClick={() => setEditing(null)} className="h-9 px-3 rounded-md border border-white/10 hover:bg-neutral-800">Schließen</button>
            </div>
            <CustomerForm initial={editing} submitLabel="Speichern" onCancel={() => setEditing(null)} onSubmit={(data) => handleUpdate(editing.id, data)} />
          </div>
        </div>
      )}
    </div>
  );
}
