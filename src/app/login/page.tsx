"use client";
import React, { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const { signIn } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-lg">
        {/* App Logo */}
        <div className="flex justify-center mb-6">
          <img 
            src="/icon-192.png" 
            alt="BRRY Dashboard" 
            className="w-16 h-16 rounded-lg shadow-lg"
          />
        </div>
        <h1 className="text-xl font-semibold mb-4 text-center">Anmelden</h1>
        <form onSubmit={onSubmit} className="grid gap-3">
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
              type="password"
              className="h-10 px-3 rounded-md border border-white/10 bg-neutral-800 text-gray-100 outline-none focus:ring-2 focus:ring-white/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-10 rounded-md bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center p-6">Laden…</div>}>
      <LoginInner />
    </Suspense>
  );
}
