"use client";
import { useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createCustomer, updateCustomer } from "@/lib/db";

async function upsertCustomer(name: string, branches: number) {
  const ref = collection(db, "customers");
  const snap = await getDocs(query(ref, where("name", "==", name), limit(1)));
  if (snap.empty) {
    await createCustomer({
      // fields required by createCustomer
      name,
      branches,
      status: "aktiv",
      baseFee: 0,
      marketingActive: true,
      monthlyRevenue: 0,
    } as any);
    return `+ Angelegt: ${name} (${branches} Filialen, Marketing aktiv)`;
  } else {
    const id = snap.docs[0].id;
    await updateCustomer(id, { branches, status: "aktiv", marketingActive: true });
    return `✓ Aktualisiert: ${name} → ${branches} Filialen, Marketing aktiv`;
  }
}

export default function AddCustomersPage() {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setLog(["Starte…"]);
    try {
      const msgs: string[] = [];
      msgs.push(await upsertCustomer("apotheca", 6));
      msgs.push(await upsertCustomer("Weber Apotheken", 5));
      setLog(["Fertig:", ...msgs, "Öffne /kunden zum Prüfen."]);
    } catch (e: any) {
      setLog((l) => [...l, `Fehler: ${e?.message || e}`]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-4">
      <h1 className="text-2xl font-semibold">Tools: apotheca & Weber anlegen</h1>
      <p className="text-sm text-gray-300">Lege die beiden Kunden an oder aktualisiere sie, falls vorhanden.</p>
      <button
        disabled={loading}
        onClick={run}
        className="px-4 py-2 rounded-md border border-white/10 bg-neutral-900 hover:bg-neutral-800"
      >
        {loading ? "Läuft…" : "Jetzt anlegen/aktualisieren"}
      </button>
      <div className="card p-4 text-sm space-y-1">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
