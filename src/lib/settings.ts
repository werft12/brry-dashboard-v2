import { db, storage } from "./firebase";
import { doc, getDoc, setDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import { ref as storageRef, uploadString, listAll, getDownloadURL } from "firebase/storage";

export type DefaultRoute = "dashboard" | "customers" | "marketing" | "onboarding";
export type DefaultCustomerStatus = "active" | "onboarding" | "inactive";

export interface AppSettings {
  dashboard?: { defaultRoute?: DefaultRoute };
  features?: { autoFollowMonth?: boolean };
  pricing?: {
    baseFeeDefault?: boolean;
    baseFeeAmount?: number;        // z.B. 50
    onboardingFee?: number;        // z.B. 750
    marketing?: {
      base?: number;               // z.B. 180
      extraBranch?: number;        // z.B. 60
    };
  };
  customers?: { defaultStatus?: DefaultCustomerStatus };
  marketing?: {
    defaultServices?: Record<string, boolean>;
    customTemplates?: Record<string, { label: string; enabled: boolean }>;
  };
  updatedAt?: number;
}

// Full data export/import (selected collections)
type ExportDoc = { id: string; data: any };
export type FullExport = {
  customers?: ExportDoc[];
  marketingChecklists?: ExportDoc[];
  metrics?: ExportDoc[];
};

export async function buildFullExport() {
  const result: FullExport = {};
  // customers
  try {
    const snap = await getDocs(collection(db, "customers"));
    result.customers = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch {}
  // marketingChecklists
  try {
    const snap = await getDocs(collection(db, "marketingChecklists"));
    result.marketingChecklists = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch {}
  // metrics (optional)
  try {
    const snap = await getDocs(collection(db, "metrics"));
    result.metrics = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch {}
  return result;
}

export async function exportAllData() {
  const result = await buildFullExport();

  const pretty = JSON.stringify(result, null, 2);
  const blob = new Blob([pretty], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `brry_export_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importAllData(json: FullExport) {
  // Writes are chunked to batches of up to ~400 docs per collection
  async function putCollection(colName: keyof FullExport) {
    const arr = (json[colName] as ExportDoc[] | undefined) || [];
    if (!arr.length) return 0;
    let written = 0;
    for (let i = 0; i < arr.length; i += 400) {
      const batch = writeBatch(db);
      const slice = arr.slice(i, i + 400);
      slice.forEach(({ id, data }) => {
        const ref = doc(db, colName as string, id);
        batch.set(ref, data);
      });
      await batch.commit();
      written += slice.length;
    }
    return written;
  }
  const c = await putCollection("customers");
  const m = await putCollection("marketingChecklists");
  const x = await putCollection("metrics");
  return { customers: c, marketingChecklists: m, metrics: x };
}

export async function importAllDataDryRun(json: FullExport) {
  async function compare(colName: keyof FullExport) {
    const incoming = (json[colName] as ExportDoc[] | undefined) || [];
    const existing = await getDocs(collection(db, colName as string));
    const existingIds = new Set(existing.docs.map((d) => d.id));
    let overwrite = 0;
    let create = 0;
    incoming.forEach((d) => {
      if (existingIds.has(d.id)) overwrite += 1; else create += 1;
    });
    return { total: incoming.length, overwrite, create };
  }
  return {
    customers: await compare("customers"),
    marketingChecklists: await compare("marketingChecklists"),
    metrics: await compare("metrics"),
  };
}

export async function snapshotNow() {
  const data = await buildFullExport();
  const pretty = JSON.stringify(data, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backups/brry_snapshot_${stamp}.json`;
  const ref = storageRef(storage, path);
  await uploadString(ref, pretty, "raw");
  return { path };
}

export async function listSnapshots() {
  const ref = storageRef(storage, "backups");
  const res = await listAll(ref);
  // Sort by name desc (timestamp embedded)
  const items = await Promise.all(
    res.items
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .map(async (it) => ({ name: it.name, path: it.fullPath, url: await getDownloadURL(it) }))
  );
  return items;
}

export async function fetchSnapshot(path: string): Promise<FullExport> {
  const url = await getDownloadURL(storageRef(storage, path));
  const res = await fetch(url);
  return (await res.json()) as FullExport;
}

export interface UserSettings {
  ui?: {
    preferCollapsedDefault?: boolean;
    numberFormat?: string;
  };
  notifications?: {
    email?: {
      onboarding?: "off" | "daily" | "weekly" | "instant";
      marketing?: "off" | "daily" | "weekly" | "instant";
    };
  };
  updatedAt?: number;
}

const appSettingsRef = doc(db, "appSettings", "default");
export async function readAppSettings(): Promise<AppSettings> {
  const snap = await getDoc(appSettingsRef);
  return (snap.exists() ? (snap.data() as AppSettings) : {}) as AppSettings;
}
export async function writeAppSettings(patch: Partial<AppSettings>) {
  await setDoc(appSettingsRef, { ...patch, updatedAt: Date.now() }, { merge: true });
}

export async function readUserSettings(uid: string): Promise<UserSettings> {
  const ref = doc(db, "userSettings", uid);
  const snap = await getDoc(ref);
  return (snap.exists() ? (snap.data() as UserSettings) : {}) as UserSettings;
}
export async function writeUserSettings(uid: string, patch: Partial<UserSettings>) {
  const ref = doc(db, "userSettings", uid);
  await setDoc(ref, { ...patch, updatedAt: Date.now() }, { merge: true });
}

// CSV helpers
function toCsvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    })
    .join(",");
}
export function downloadCsv(filename: string, header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const csv = [toCsvRow(header), ...rows.map((r) => toCsvRow(r))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Domain exports (collections are assumed as in project)
export async function exportCustomersCsv() {
  const snap = await getDocs(collection(db, "customers"));
  const header = ["id", "name", "branches", "status", "marketingEnabled", "baseFeeDisabled", "notes"];
  const rows: any[] = [];
  snap.forEach((d) => {
    const c: any = d.data();
    rows.push([
      d.id,
      c?.name ?? "",
      c?.branches ?? 0,
      c?.status ?? "",
      c?.marketingEnabled ?? false,
      c?.baseFeeDisabled ?? false,
      c?.notes ?? "",
    ]);
  });
  downloadCsv(`customers_${new Date().toISOString().slice(0,10)}.csv`, header, rows);
}

export async function exportMarketingChecklistCsv(ym: string) {
  const q = query(collection(db, "marketingChecklists"), where("ym", "==", ym));
  const snap = await getDocs(q);
  const header = [
    "id",
    "customerId",
    "ym",
    "handzettel",
    "poster",
    "social",
    "newsletter",
    "customKeys"
  ];
  const rows: any[] = [];
  snap.forEach((d) => {
    const x: any = d.data();
    const s = x?.services || {};
    const custom = s?.custom || {};
    const customKeys = Object.keys(custom).map((k) => `${k}:${custom[k]?.done ? 1 : 0}`).join("|");
    rows.push([
      d.id,
      x?.customerId ?? "",
      x?.ym ?? "",
      s?.handzettel?.done ? 1 : 0,
      s?.poster?.done ? 1 : 0,
      s?.social?.done ? 1 : 0,
      s?.newsletter?.done ? 1 : 0,
      customKeys,
    ]);
  });
  downloadCsv(`marketing_${ym}.csv`, header, rows);
}
