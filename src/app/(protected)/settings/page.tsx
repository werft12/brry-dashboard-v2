"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppSettings, DefaultRoute, DefaultCustomerStatus, readAppSettings, writeAppSettings, exportCustomersCsv, exportMarketingChecklistCsv, exportAllData, importAllData, importAllDataDryRun, FullExport, snapshotNow, listSnapshots, fetchSnapshot } from "@/lib/settings";

const ROUTES: { value: DefaultRoute; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "customers", label: "Kunden" },
  { value: "marketing", label: "Marketing" },
  { value: "onboarding", label: "Onboarding" },
];

const STATUSES: { value: DefaultCustomerStatus; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // value format YYYY-MM
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      type="month"
      className="bg-neutral-900 border border-white/10 rounded-md px-2 py-1 text-sm text-white/90"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [app, setApp] = useState<AppSettings>({});
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [snapshots, setSnapshots] = useState<{ name: string; path: string; url: string }[]>([]);
  const [ym, setYm] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<AppSettings>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await readAppSettings();
        if (mounted) setApp(data || {});
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const items = await listSnapshots();
        setSnapshots(items);
      } catch {}
    })();
  }, []);

  const defaultRoute = app.dashboard?.defaultRoute ?? "dashboard";
  const baseFeeDefault = app.pricing?.baseFeeDefault ?? true;
  const defaultStatus = app.customers?.defaultStatus ?? "onboarding";
  const baseFeeAmount = app.pricing?.baseFeeAmount ?? 50;
  const onboardingFee = app.pricing?.onboardingFee ?? 750;
  const marketingBase = app.pricing?.marketing?.base ?? 180;
  const marketingExtra = app.pricing?.marketing?.extraBranch ?? 60;

  async function savePatch(patch: Partial<AppSettings>) {
    setSaving(true);
    try {
      await writeAppSettings(patch);
      setApp((prev) => ({ ...prev, ...patch }));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  function scheduleSavePricing(partial: Partial<AppSettings["pricing"]>) {
    // Merge into a pending patch to avoid overwriting other pricing fields
    const currentPricing = (pendingPatchRef.current.pricing as AppSettings["pricing"]) || (app.pricing || {});
    pendingPatchRef.current = {
      ...pendingPatchRef.current,
      pricing: { ...currentPricing, ...partial },
    } as Partial<AppSettings>;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const patch = pendingPatchRef.current;
      pendingPatchRef.current = {};
      savePatch(patch);
    }, 500);
  }

  function resetExpandPersistence() {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("expand:")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      alert(`Persistente Panel-Zustände zurückgesetzt (${keys.length})`);
    } catch (e) {
      console.warn("resetExpandPersistence failed", e);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-10 w-40 rounded-md bg-white/5 animate-pulse" />
        <div className="mt-4 h-24 rounded-lg bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">Einstellungen</h1>
        <div className="flex items-center gap-3">
          {saving && <div className="text-xs text-white/60">Speichere…</div>}
          {justSaved && !saving && (
            <span className="text-xs rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">Gespeichert</span>
          )}
        </div>
      </div>

      {/* Dashboard/UX */}
      <section className="rounded-xl border border-white/10 bg-neutral-950/60 p-3 md:p-4">
        <h2 className="text-base font-semibold mb-2">Dashboard & UX</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-white/70">Standard-Startseite</div>
            <select
              className="w-full bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
              value={defaultRoute}
              onChange={(e) => savePatch({ dashboard: { ...(app.dashboard || {}), defaultRoute: e.target.value as DefaultRoute } })}
            >
              {ROUTES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {/* removed auto-follow block as requested */}
        </div>
        <div className="mt-3">
          <button
            onClick={resetExpandPersistence}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
          >
            Persistente Panel-Zustände zurücksetzen
          </button>
        </div>
      </section>

      {/* Vollständiger Daten-Import/Export */}
      <section className="rounded-xl border border-white/10 bg-neutral-950/60 p-3 md:p-4">
        <h2 className="text-base font-semibold mb-2">Gesamter Datenbestand</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-white/70">Vollständiger Export (JSON)</div>
            <button
              onClick={() => exportAllData()}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
            >
              Export starten
            </button>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Vollständiger Import (JSON)</div>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const text = await f.text();
                const parsed: FullExport = JSON.parse(text);
                if (dryRun) {
                  setImporting(true);
                  const res = await importAllDataDryRun(parsed);
                  alert(`Dry-Run Ergebnis:\nKunden total: ${res.customers.total} (überschreibt: ${res.customers.overwrite}, neu: ${res.customers.create})\nMarketing total: ${res.marketingChecklists.total} (überschreibt: ${res.marketingChecklists.overwrite}, neu: ${res.marketingChecklists.create})\nMetrics total: ${res.metrics.total} (überschreibt: ${res.metrics.overwrite}, neu: ${res.metrics.create})`);
                  return;
                }
                const proceed = confirm(`Datei: ${f.name}\n\nImport starten? Dies überschreibt Dokumente mit identischen IDs.`);
                if (!proceed) return;
                setImporting(true);
                const res = await importAllData(parsed);
                alert(`Import abgeschlossen:\nKunden: ${res.customers}\nMarketing: ${res.marketingChecklists}\nMetrics: ${res.metrics}`);
              } catch (err) {
                console.error("importAllData failed", err);
                alert("Import fehlgeschlagen. Bitte JSON prüfen.");
              } finally {
                setImporting(false);
                if (e.currentTarget) e.currentTarget.value = "";
              }
            }} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
                disabled={importing}
              >
                {importing ? "Import läuft…" : "JSON wählen & importieren"}
              </button>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry-Run
              </label>
            </div>
            <div className="text-xs text-white/50">Achtung: Import überschreibt bestehende Dokumente mit identischen IDs in den betroffenen Collections.</div>
          </div>
        </div>
      </section>

      {/* Manuelle Snapshots */}
      <section className="rounded-xl border border-white/10 bg-neutral-950/60 p-3 md:p-4">
        <h2 className="text-base font-semibold mb-2">Snapshots</h2>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={async () => {
              try {
                const res = await snapshotNow();
                alert(`Snapshot gespeichert: ${res.path}`);
                const items = await listSnapshots();
                setSnapshots(items);
              } catch (e) {
                alert("Snapshot fehlgeschlagen.");
              }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
          >
            Snapshot jetzt erstellen
          </button>
        </div>
        <div className="space-y-1.5">
          {snapshots.length === 0 && <div className="text-sm text-white/50">Keine Snapshots vorhanden.</div>}
          {snapshots.map((s) => (
            <div key={s.path} className="flex items-center justify-between text-sm">
              <div className="truncate">{s.name}</div>
              <div className="flex items-center gap-2">
                <a href={s.url} target="_blank" className="underline text-white/80">Download</a>
                <button
                  className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs"
                  onClick={async () => {
                    try {
                      const data = await fetchSnapshot(s.path);
                      const proceed = confirm(`Snapshot wiederherstellen? Dies überschreibt Dokumente mit identischen IDs.`);
                      if (!proceed) return;
                      const res = await importAllData(data);
                      alert(`Wiederhergestellt: Kunden ${res.customers}, Marketing ${res.marketingChecklists}, Metrics ${res.metrics}`);
                    } catch (e) {
                      alert("Wiederherstellung fehlgeschlagen.");
                    }
                  }}
                >
                  Wiederherstellen
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Preise & Defaults */}
      <section className="rounded-xl border border-white/10 bg-neutral-950/60 p-3 md:p-4">
        <h2 className="text-base font-semibold mb-2">Preise & Defaults</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-white/70">Basisgebühr (50 €) standardmäßig aktiv</div>
            <label className="inline-flex items-center gap-2 select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={baseFeeDefault}
                onChange={(e) => savePatch({ pricing: { ...(app.pricing || {}), baseFeeDefault: e.target.checked } })}
              />
              <span className="text-sm">Als Default für neue Kunden verwenden</span>
            </label>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Default-Status neuer Kunden</div>
            <select
              className="w-full bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
              value={defaultStatus}
              onChange={(e) => savePatch({ customers: { ...(app.customers || {}), defaultStatus: e.target.value as DefaultCustomerStatus } })}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Grundgebühr (€)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-32 bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
                value={baseFeeAmount}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setApp((prev) => ({ ...prev, pricing: { ...(prev.pricing || {}), baseFeeAmount: v } }));
                    scheduleSavePricing({ baseFeeAmount: v });
                  }
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Onboarding-Bonus (€)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-32 bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
                value={onboardingFee}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setApp((prev) => ({ ...prev, pricing: { ...(prev.pricing || {}), onboardingFee: v } }));
                    scheduleSavePricing({ onboardingFee: v });
                  }
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Marketing-Basis (€ pro Marke)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-32 bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
                value={marketingBase}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setApp((prev) => ({ ...prev, pricing: { ...(prev.pricing || {}), marketing: { ...(prev.pricing?.marketing || {}), base: v } } }));
                    scheduleSavePricing({ marketing: { ...(app.pricing?.marketing || {}), base: v } as any });
                  }
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Marketing-Zusatz je weitere Filiale (€)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-32 bg-neutral-900 border border-white/10 rounded-md px-2 py-1.5 text-sm"
                value={marketingExtra}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setApp((prev) => ({ ...prev, pricing: { ...(prev.pricing || {}), marketing: { ...(prev.pricing?.marketing || {}), extraBranch: v } } }));
                    scheduleSavePricing({ marketing: { ...(app.pricing?.marketing || {}), extraBranch: v } as any });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CSV Export */}
      <section className="rounded-xl border border-white/10 bg-neutral-950/60 p-3 md:p-4">
        <h2 className="text-base font-semibold mb-2">Datenexport (CSV)</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-white/70">Kunden</div>
            <button
              onClick={() => exportCustomersCsv()}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
            >
              Kunden exportieren
            </button>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-white/70">Marketing-Checklisten (Monat)</div>
            <div className="flex items-center gap-2">
              <MonthPicker value={ym} onChange={setYm} />
              <button
                onClick={() => ym && exportMarketingChecklistCsv(ym)}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-sm"
              >
                Exportieren
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
