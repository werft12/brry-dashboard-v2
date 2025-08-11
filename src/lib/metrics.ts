"use client";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, writeBatch, increment, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Customer } from "@/lib/types";
import { monthlyCustomerFee, priceMarketingForSubscription } from "@/lib/pricing";
import { readAppSettings, type AppSettings } from "@/lib/settings";

export type MonthlyMetric = { monthId: string; revenue: number; onboardingRevenue?: number; onboardingCount?: number };

const metricsCol = collection(db, "metrics");

export function listenMetrics(cb: (items: MonthlyMetric[]) => void) {
  // order by document ID (yyyymm)
  const q = query(metricsCol, orderBy("__name__" as any));
  return onSnapshot(q, (snap) => {
    const list: MonthlyMetric[] = snap.docs
      .map((d) => {
        const data: any = d.data();
        return {
          monthId: (data?.monthId as string) || d.id,
          revenue: Number(data?.revenue) || 0,
          onboardingRevenue: Number(data?.onboardingRevenue) || 0,
          onboardingCount: Number(data?.onboardingCount) || 0,
        };
      })
      .filter((m) => /^\d{6}$/.test(m.monthId));
    cb(list);
  });
}

// Aktualisiert den Umsatz des aktuellen Monats basierend auf Kundenstand und App-Preisen.
// Erhält vorhandene Onboarding-Anteile und setzt revenue = base+marketing+extras + onboardingRevenue.
export async function refreshCurrentMonthBaseMarketing(customers: Customer[]) {
  // Pricing aus App-Settings
  let baseFeeAmount = 50;
  let mkBase = 180;
  let mkExtra = 60;
  try {
    const app = await readAppSettings();
    const bf = Number(app?.pricing?.baseFeeAmount);
    const mb = Number(app?.pricing?.marketing?.base);
    const me = Number(app?.pricing?.marketing?.extraBranch);
    if (Number.isFinite(bf) && bf >= 0) baseFeeAmount = bf;
    if (Number.isFinite(mb) && mb >= 0) mkBase = mb;
    if (Number.isFinite(me) && me >= 0) mkExtra = me;
  } catch {}

  // Base/Marketing analog zu seedDemoMetrics
  const baseRevenue = customers.reduce((acc, c: any) => {
    const isActive = c.status === 'aktiv';
    const defaultBase = monthlyCustomerFee(true, baseFeeAmount);
    const baseFeeNum = Number(c.baseFee);
    const rawBase = isActive && Number.isFinite(baseFeeNum) && baseFeeNum > 0 ? baseFeeNum : (isActive ? defaultBase : 0);
    const val = !isActive || c.baseFeeDisabled ? 0 : rawBase;
    return acc + val;
  }, 0);
  const coreMarketing = customers.reduce((acc, c: any) => {
    if (c.status === 'inaktiv') return acc;
    const branches = Number(c.branches) || 0;
    return acc + (c.marketingActive ? priceMarketingForSubscription(branches, mkBase, mkExtra) : 0);
  }, 0);
  const anyMarketingActive = customers.some((c) => c.status !== 'inaktiv' && c.marketingActive);
  const masterLayoutBase = anyMarketingActive ? 240 : 0;
  const extras = customers.reduce((acc, c: any) => {
    if (c.status === 'inaktiv') return acc;
    return acc + (Array.isArray(c.extraServices) ? c.extraServices.reduce((s: number, e: any) => s + (Number(e.price) || 0), 0) : 0);
  }, 0);
  const baseMarketing = Math.round(baseRevenue + coreMarketing + masterLayoutBase + extras);

  const now = new Date();
  const monthId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ref = doc(db, 'metrics', monthId);
  const snap = await getDoc(ref);
  const data: any = snap.exists() ? snap.data() : {};
  const onboardingRevenue = Number(data?.onboardingRevenue) || 0;
  const revenue = baseMarketing + onboardingRevenue;
  try {
    await setDoc(ref, { monthId, revenue }, { merge: true });
    if (typeof window !== 'undefined') {
      console.log('[metrics] refreshed current month', { monthId, baseMarketing, onboardingRevenue, revenue });
    }
  } catch (e) {
    if (typeof window !== 'undefined') {
      console.error('[metrics] failed to write current month', e);
    }
    throw e;
  }
}

// Löscht alle Metric-Dokumente
export async function clearAllMetrics() {
  const snap = await getDocs(query(metricsCol));
  const tasks: Promise<any>[] = [];
  snap.forEach((d) => tasks.push(deleteDoc(doc(db, "metrics", d.id))));
  await Promise.allSettled(tasks);
}

// Komfort: vollständige Neuberechnung für die letzten 12 Monate
export async function recalcLast12Months(customers: Customer[], appOverride?: AppSettings) {
  await clearAllMetrics();
  await seedDemoMetrics(customers, 12, appOverride);
}

// Entfernt Metriken vor dem Go-Live (Jan 2025), damit die Umsatzentwicklung erst ab 2025 startet
export async function removeMetricsBeforeJan2025() {
  const snap = await getDocs(query(metricsCol));
  const tasks: Promise<any>[] = [];
  snap.forEach((d) => {
    const id = d.id; // yyyymm
    if (/^\d{6}$/.test(id) && id < "202501") {
      tasks.push(deleteDoc(doc(db, "metrics", id)));
    }
  });
  await Promise.allSettled(tasks);
}

export async function upsertMetric(monthId: string, revenue: number) {
  const ref = doc(db, "metrics", monthId);
  const safe = Number.isFinite(revenue) ? revenue : 0;
  await setDoc(ref, { monthId, revenue: safe }, { merge: true });
}

// Einmalbonus für Onboarding-Abschluss im aktuellen Monat hinzufügen
export async function addOnboardingBonusNow(amount?: number) {
  if (amount === undefined) {
    try {
      const app = await readAppSettings();
      const fee = Number(app?.pricing?.onboardingFee);
      amount = Number.isFinite(fee) && fee > 0 ? fee : 750;
    } catch {
      amount = 750;
    }
  }
  const now = new Date();
  const monthId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ref = doc(db, "metrics", monthId);
  const countDelta = amount >= 0 ? 1 : -1;
  await setDoc(
    ref,
    {
      monthId,
      revenue: increment(amount),
      onboardingRevenue: increment(amount),
      onboardingCount: increment(countDelta),
    },
    { merge: true }
  );
}

// Setzt Onboarding-Anpassungen für einen Monat zurück und korrigiert den Monatsumsatz
export async function resetOnboardingForMonth(monthId: string) {
  const ref = doc(db, "metrics", monthId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data: any = snap.data();
  const onboardAmt = Number(data?.onboardingRevenue) || 0;
  const updates: any = { onboardingRevenue: 0, onboardingCount: 0 };
  // Umsatz um den Onboarding-Betrag reduzieren
  if (onboardAmt !== 0) updates.revenue = increment(-onboardAmt);
  await updateDoc(ref, updates);
}

export async function resetOnboardingForCurrentMonth() {
  const now = new Date();
  const monthId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  await resetOnboardingForMonth(monthId);
}

// Bringt onboardingRevenue mit onboardingCount in Einklang (expected = count * 750)
export async function reconcileOnboardingForCurrentMonth() {
  const now = new Date();
  const monthId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ref = doc(db, "metrics", monthId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data: any = snap.data();
  const count = Number(data?.onboardingCount) || 0;
  const current = Number(data?.onboardingRevenue) || 0;
  let onboardingFee = 750;
  try {
    const app = await readAppSettings();
    const v = Number(app?.pricing?.onboardingFee);
    if (Number.isFinite(v) && v > 0) onboardingFee = v;
  } catch {}
  const expected = count * onboardingFee;
  const delta = expected - current;
  if (delta !== 0) {
    await updateDoc(ref, {
      onboardingRevenue: expected,
      revenue: increment(delta),
    });
  }
}

export async function seedDemoMetrics(customers: Customer[], months = 12, appOverride?: AppSettings) {
  if (!customers || customers.length === 0) return;
  // Pricing aus App-Settings holen (Fallback auf Defaults)
  let baseFeeAmount = 50;
  let mkBase = 180;
  let mkExtra = 60;
  try {
    const src = appOverride ?? (await readAppSettings());
    const bf = Number(src?.pricing?.baseFeeAmount);
    const mb = Number(src?.pricing?.marketing?.base);
    const me = Number(src?.pricing?.marketing?.extraBranch);
    if (Number.isFinite(bf) && bf >= 0) baseFeeAmount = bf;
    if (Number.isFinite(mb) && mb >= 0) mkBase = mb;
    if (Number.isFinite(me) && me >= 0) mkExtra = me;
  } catch {}
  // Base wie im Dashboard: je aktivem Kunden, respektiert baseFeeDisabled und optionale baseFee-Overrides
  const baseRevenue = customers.reduce((acc, c: any) => {
    const isActive = c.status === 'aktiv';
    const defaultBase = monthlyCustomerFee(true, baseFeeAmount);
    const baseFeeNum = Number(c.baseFee);
    const rawBase = isActive && Number.isFinite(baseFeeNum) && baseFeeNum > 0 ? baseFeeNum : (isActive ? defaultBase : 0);
    const val = !isActive || c.baseFeeDisabled ? 0 : rawBase;
    return acc + val;
  }, 0);
  const coreMarketing = customers.reduce((acc, c: any) => {
    if (c.status === 'inaktiv') return acc;
    const branches = Number(c.branches) || 0;
    return acc + (c.marketingActive ? priceMarketingForSubscription(branches, mkBase, mkExtra) : 0);
  }, 0);
  const anyMarketingActive = customers.some((c) => c.status !== 'inaktiv' && c.marketingActive);
  const masterLayoutBase = anyMarketingActive ? 240 : 0;
  const extras = customers.reduce((acc, c: any) => {
    if (c.status === 'inaktiv') return acc;
    return acc + (Array.isArray(c.extraServices) ? c.extraServices.reduce((s: number, e: any) => s + (Number(e.price) || 0), 0) : 0);
  }, 0);
  const marketing = masterLayoutBase + coreMarketing + extras;

  // Wir erzeugen für die letzten `months` Monate Werte:
  // - Vor Jan 2025: 0€
  // - Ab Jan 2025: konstantes Monats-Revenue = baseRevenue + marketing (ohne Drift/Noise)
  const end = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const startFrom = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const goLive = new Date(2025, 0, 1);
  const toSeed: { y: number; m: number }[] = [];
  let cur = new Date(startFrom);
  while (cur <= end) {
    toSeed.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const monthly = Math.round(baseRevenue + marketing);
  for (const { y, m } of toSeed) {
    const monthId = `${y}${String(m).padStart(2, '0')}`;
    const date = new Date(y, m - 1, 1);
    const value = date < goLive ? 0 : monthly;
    await upsertMetric(monthId, Number.isFinite(value) ? value : 0);
  }
}
