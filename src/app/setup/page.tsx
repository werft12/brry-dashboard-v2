"use client";
import React, { Suspense, useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";

function SetupInner() {
  const search = useSearchParams();
  const token = search?.get("token");
  const allowed = useMemo(() => token === (process.env.NEXT_PUBLIC_SETUP_TOKEN || "ok"), [token]);

  const [email, setEmail] = useState("info@werft12.de");
  const [password, setPassword] = useState("Del13uxe!");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Setup gesperrt</h1>
          <p className="text-gray-400">Rufe die Seite mit einem gültigen Token auf, z. B. /setup?token=ok</p>
        </div>
      </div>
    );
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setMessage("Benutzer wurde erstellt. Du kannst dich jetzt auf /login anmelden.");
    } catch (err: any) {
      setError(err?.message || "Fehler beim Anlegen des Benutzers");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-4">Einmaliges Setup: Benutzer anlegen</h1>
        <form onSubmit={createUser} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-300">E-Mail</span>
            <input
              type="email"
              className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-300">Passwort</span>
            <input
              type="text"
              className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {message && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded p-2">{message}</div>}
          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="h-10 rounded-md bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? "Erstelle…" : "Benutzer anlegen"}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-4">Sicherheit: Nach erfolgreichem Anlegen diese Seite wieder entfernen.</p>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center p-6">Laden…</div>}>
      <SetupInner />
    </Suspense>
  );
}
