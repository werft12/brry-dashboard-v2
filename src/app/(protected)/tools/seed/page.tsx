"use client";
import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { createCustomer } from "@/lib/db";
import type { Customer } from "@/lib/types";

const CUSTOMERS: Array<Pick<Customer, "name" | "branches">> = [
  { name: "MAXMO Apotheke", branches: 22 },
  { name: "apotheca", branches: 6 },
  { name: "Weber Apotheken", branches: 5 },
];

export default function SeedPage() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function ensureCustomerByName(name: string, branches: number) {
    const ref = collection(db, "customers");
    const q = query(ref, where("name", "==", name));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setLog((l) => [
        ...l,
        `✓ Kunde existiert bereits: ${name} (${branches} Filialen)`,
      ]);
      return;
    }
    await createCustomer({
      id: "temp", // wird im Helper ignoriert
      name,
      branches,
      status: "aktiv",
      baseFee: 0,
      marketingActive: true, // Marketing gebucht
      monthlyRevenue: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
    setLog((l) => [...l, `+ Kunde angelegt: ${name} (${branches} Filialen, Marketing aktiv)`]);
  }

  async function run() {
    try {
      setRunning(true);
      setLog(["Starte Seeding…"]);
      for (const c of CUSTOMERS) {
        await ensureCustomerByName(c.name, c.branches);
      }
      setLog((l) => [...l, "Fertig. Navigiere zu /kunden, um zu prüfen."]);
    } catch (e: any) {
      setLog((l) => [...l, `Fehler: ${e?.message || e}`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold text-center sm:text-left">Tools: Seed-Daten</h1>
      <p className="text-sm text-gray-400">
        Legt 3 Beispielkunden an (einmalig). Erfordert Login.
      </p>
      <button
        disabled={running}
        onClick={run}
        className="px-4 py-2 rounded-md border border-white/10 bg-white/10 hover:bg-white/20"
      >
        {running ? "Läuft…" : "Seed anlegen"}
      </button>
      <div className="card border border-white/10 bg-neutral-900 p-4 text-sm space-y-1">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
