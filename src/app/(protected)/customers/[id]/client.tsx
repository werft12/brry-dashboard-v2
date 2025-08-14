"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/ui/card";
import type { Customer, ExtraService } from "@/lib/types";
import { listenCustomers, updateCustomer, deleteCustomer } from "@/lib/db";
import { formatEUR, monthlyCustomerFee, priceMarketingForSubscription } from "@/lib/pricing";

export default function CustomerDetailsClient() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

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
    const extras = (customer.extraServices || []).reduce((acc, s) => acc + s.price, 0);
    return { base, marketing, extras, total: base + marketing + extras };
  }, [customer]);

  const handleUpdate = async (updates: Partial<Customer>) => {
    if (!customer || pending) return;
    setPending(true);
    try {
      await updateCustomer(customer.id, updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Update failed:", error);
    } finally {
      setPending(false);
    }
  };

  const handleAddExtraService = (service: ExtraService) => {
    if (!customer) return;
    const updated = [...(customer.extraServices || []), service];
    handleUpdate({ extraServices: updated });
  };

  const handleRemoveExtraService = (index: number) => {
    if (!customer) return;
    const updated = (customer.extraServices || []).filter((_, i) => i !== index);
    handleUpdate({ extraServices: updated });
  };

  const handleUpdateExtraService = (index: number, service: ExtraService) => {
    if (!customer) return;
    const updated = [...(customer.extraServices || [])];
    updated[index] = service;
    handleUpdate({ extraServices: updated });
  };

  const handleDelete = async () => {
    if (!customer || pending) return;
    if (!confirm(`Kunde "${customer.name}" wirklich löschen?`)) return;
    setPending(true);
    try {
      await deleteCustomer(customer.id);
      router.push("/customers");
    } catch (error) {
      console.error("Delete failed:", error);
      setPending(false);
    }
  };

  const handleStartEditName = () => {
    setNewName(customer?.name || "");
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!customer || !newName.trim() || pending) return;
    await handleUpdate({ name: newName.trim() });
    setEditingName(false);
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNewName("");
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Kunde</h1>
        </div>
        <Card>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-700 rounded w-1/4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="grid gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Kunde</h1>
          <button
            onClick={() => router.back()}
            className="h-10 px-4 rounded-md border border-white/10 bg-neutral-800 text-gray-100 hover:bg-neutral-700"
          >
            Zurück
          </button>
        </div>
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-400">Kunde nicht gefunden</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-center sm:text-left">Kunde</h1>
        <button
          onClick={() => router.back()}
          className="h-10 px-4 rounded-md border border-white/10 bg-neutral-800 text-gray-100 hover:bg-neutral-700"
        >
          Zurück
        </button>
      </div>

      {/* Status & Basic Info */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{customer.name}</h2>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-green-400">Gespeichert</span>}
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                customer.status === "aktiv" 
                  ? "bg-teal-400/10 text-teal-400" 
                  : customer.status === "inaktiv"
                  ? "bg-red-400/10 text-red-400"
                  : "bg-yellow-400/10 text-yellow-400"
              }`}>
                {customer.status}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <select
                value={customer.status}
                onChange={(e) => handleUpdate({ status: e.target.value as Customer["status"] })}
                disabled={pending}
                className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="aktiv">Aktiv</option>
                <option value="inaktiv">Inaktiv</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Filialen</label>
              <input
                type="number"
                value={customer.branches || 1}
                onChange={(e) => handleUpdate({ branches: parseInt(e.target.value) || 1 })}
                disabled={pending}
                min="1"
                className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={customer.marketingActive || false}
                onChange={(e) => handleUpdate({ marketingActive: e.target.checked })}
                disabled={pending}
                className="rounded border-white/10 bg-neutral-800 text-teal-500 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-300">Marketing aktiv</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Costs Overview */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Kostenübersicht</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-sm text-gray-400">Basis</div>
              <div className="text-lg font-semibold text-white">{formatEUR(costs.base)}</div>
            </div>
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-sm text-gray-400">Marketing</div>
              <div className="text-lg font-semibold text-white">{customer.marketingActive ? formatEUR(costs.marketing) : "—"}</div>
            </div>
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-sm text-gray-400">Extras</div>
              <div className="text-lg font-semibold text-white">{costs.extras > 0 ? formatEUR(costs.extras) : "—"}</div>
            </div>
            <div className="text-center p-3 bg-teal-900/20 border border-teal-500/20 rounded-lg">
              <div className="text-sm text-teal-400">Gesamt</div>
              <div className="text-lg font-semibold text-teal-400">{formatEUR(costs.total)}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Customer Details */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Stammdaten</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={customer.name}
                onChange={(e) => handleUpdate({ name: e.target.value })}
                disabled={pending}
                className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Filialen</label>
              <input
                type="number"
                value={customer.branches || 1}
                onChange={(e) => handleUpdate({ branches: parseInt(e.target.value) || 1 })}
                disabled={pending}
                min="1"
                className="w-full px-3 py-2 bg-neutral-800 border border-white/10 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {customer.createdAt && (
            <div className="text-sm text-gray-400">
              Erstellt: {new Date(customer.createdAt * 1000).toLocaleDateString('de-DE')}
            </div>
          )}
        </div>
      </Card>

      {/* Einstellungen */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Einstellungen</h2>
          
          {/* Kundenname bearbeiten */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">Kundenname</label>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={pending}
                  className="flex-1 px-3 py-2 bg-neutral-800 border border-white/10 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Kundenname eingeben..."
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={pending || !newName.trim()}
                  className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-50 text-sm"
                >
                  Speichern
                </button>
                <button
                  onClick={handleCancelEditName}
                  disabled={pending}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md disabled:opacity-50 text-sm"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                <div>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-sm text-gray-400">Aktueller Kundenname</div>
                </div>
                <button
                  onClick={handleStartEditName}
                  disabled={pending}
                  className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md disabled:opacity-50"
                >
                  Bearbeiten
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Extra Services */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Zusatzleistungen</h2>
            <button
              onClick={() => {
                const name = prompt("Name der Zusatzleistung:");
                const priceStr = prompt("Monatlicher Preis (€):");
                if (name && priceStr) {
                  const price = parseFloat(priceStr);
                  if (!isNaN(price)) {
                    handleAddExtraService({ name, price });
                  }
                }
              }}
              disabled={pending}
              className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-50"
            >
              + Hinzufügen
            </button>
          </div>
          
          {customer.extraServices && customer.extraServices.length > 0 ? (
            <div className="space-y-2">
              {customer.extraServices.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-400">{formatEUR(s.price)}/Monat</div>
                  </div>
                  <button
                    onClick={() => handleRemoveExtraService(i)}
                    disabled={pending}
                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
                  >
                    Entfernen
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-400">
              Keine Zusatzleistungen
            </div>
          )}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-red-400">Gefahrenbereich</h2>
          <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-500/20 rounded-lg">
            <div>
              <div className="font-medium text-red-400">Kunde löschen</div>
              <div className="text-sm text-gray-400">Diese Aktion kann nicht rückgängig gemacht werden.</div>
            </div>
            <button
              onClick={handleDelete}
              disabled={pending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50"
            >
              {pending ? "Lösche..." : "Löschen"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
