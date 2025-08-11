"use client";
import { collection, deleteField, doc, onSnapshot, query, setDoc, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type MarketingServiceKey = "handzettel" | "poster" | "social" | "newsletter";

export interface MarketingChecklist {
  id: string; // `${customerId}_${ym}`
  customerId: string;
  ym: string; // YYYY-MM
  services: Record<MarketingServiceKey, ServiceState>;
  // Optional: benutzerdefinierte Services pro Kunde/Monat (key = stabiler Name/Slug)
  custom?: Record<string, CustomServiceState>;
  updatedAt: number;
}

// One-time migration: convert legacy boolean service fields to object format
export async function migrateMarketingChecklists(): Promise<number> {
  const snap = await getDocs(coll);
  let changed = 0;
  for (const d of snap.docs) {
    const data: any = d.data();
    const svc = data?.services || {};
    const updates: any = {};
    const keys: MarketingServiceKey[] = ["handzettel", "poster", "social", "newsletter"];
    let any = false;
    for (const k of keys) {
      const v = svc?.[k];
      if (typeof v === "boolean") {
        updates[k] = { done: v, doneAt: v ? Date.now() : deleteField() };
        any = true;
      }
    }
    // Migrate legacy custom at root to services.custom
    const legacyCustom = data?.custom && typeof data.custom === 'object' ? data.custom : null;
    if (legacyCustom) {
      const customBlock: Record<string, any> = {};
      for (const ck of Object.keys(legacyCustom)) {
        const cv = legacyCustom[ck];
        const done = typeof cv === 'boolean' ? !!cv : !!cv?.done;
        const label = typeof cv?.label === 'string' ? cv.label : ck;
        customBlock[ck] = { label, done, ...(done ? { doneAt: Date.now() } : {}) };
      }
      updates["custom"] = customBlock;
      any = true;
    }
    if (any || typeof data?.updatedAt !== "number") {
      await setDoc(
        doc(db, "marketingChecklists", d.id),
        {
          ...(Object.keys(updates).length ? { services: updates } : {}),
          ...(legacyCustom ? { custom: deleteField() } : {}),
          updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : Date.now(),
        },
        { merge: true }
      );
      changed += 1;
    }
  }
  return changed;
}

export async function setMarketingServices(
  customerId: string,
  ym: string,
  states: Partial<Record<MarketingServiceKey, boolean>>
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  const services: any = {};
  (Object.keys(states) as MarketingServiceKey[]).forEach((k) => {
    const v = states[k];
    if (typeof v === "boolean") {
      services[k] = {
        done: v,
        doneAt: v ? Date.now() : deleteField(),
      };
    }
  });
  const payload: any = { customerId, ym, updatedAt: Date.now(), ...(Object.keys(services).length ? { services } : {}) };
  await setDoc(ref, payload, { merge: true });
}

export interface ServiceState {
  done: boolean;
  doneAt?: number;
  assignedTo?: string;
  notes?: string;
}

export interface CustomServiceState extends ServiceState {
  label: string;
}

const coll = collection(db, "marketingChecklists");

export function yearMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function listenMarketingChecklistForMonth(
  ym: string,
  cb: (items: MarketingChecklist[]) => void
) {
  const q = query(coll, where("ym", "==", ym));
  return onSnapshot(q, (snap) => {
    const list: MarketingChecklist[] = snap.docs.map((d) => {
      const data = d.data() as any;
      const normalize = (v: any): ServiceState => {
        if (typeof v === "boolean") return { done: v };
        let doneAt: number | undefined = undefined;
        if (v?.doneAt?.seconds) doneAt = v.doneAt.seconds * 1000;
        else if (typeof v?.doneAt === "number") doneAt = v.doneAt;
        return {
          done: !!v?.done,
          doneAt,
          assignedTo: v?.assignedTo,
          notes: v?.notes,
        };
      };
      const normalizeCustom = (obj: any): Record<string, CustomServiceState> => {
        const out: Record<string, CustomServiceState> = {};
        if (obj && typeof obj === 'object') {
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            const base = normalize(v) as ServiceState;
            out[k] = { ...base, label: String(v?.label ?? k) };
          }
        }
        return out;
      };
      const services = {
        handzettel: normalize(data?.services?.handzettel),
        poster: normalize(data?.services?.poster),
        social: normalize(data?.services?.social),
        newsletter: normalize(data?.services?.newsletter),
      } as Record<MarketingServiceKey, ServiceState>;
      return {
        id: d.id,
        customerId: data.customerId,
        ym: data.ym,
        services,
        custom: normalizeCustom(data?.services?.custom),
        updatedAt: data?.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : (typeof data?.updatedAt === 'number' ? data.updatedAt : 0),
      };
    });
    cb(list);
  });
}

export function listenMarketingChecklist(
  customerId: string,
  ym: string,
  cb: (item: MarketingChecklist | null) => void
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return cb(null);
    const data = snap.data() as any;
    const normalize = (v: any): ServiceState => {
      if (typeof v === "boolean") return { done: v };
      let doneAt: number | undefined = undefined;
      if (v?.doneAt?.seconds) doneAt = v.doneAt.seconds * 1000;
      else if (typeof v?.doneAt === "number") doneAt = v.doneAt;
      return {
        done: !!v?.done,
        doneAt,
        assignedTo: v?.assignedTo,
        notes: v?.notes,
      };
    };
    const normalizeCustom = (obj: any): Record<string, CustomServiceState> => {
      const out: Record<string, CustomServiceState> = {};
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          const base = normalize(v) as ServiceState;
          out[k] = { ...base, label: String(v?.label ?? k) };
        }
      }
      return out;
    };
    const services = {
      handzettel: normalize(data?.services?.handzettel),
      poster: normalize(data?.services?.poster),
      social: normalize(data?.services?.social),
      newsletter: normalize(data?.services?.newsletter),
    } as Record<MarketingServiceKey, ServiceState>;
    cb({
      id: snap.id,
      customerId: data.customerId,
      ym: data.ym,
      services,
      custom: normalizeCustom(data?.services?.custom),
      updatedAt: data?.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : (typeof data?.updatedAt === 'number' ? data.updatedAt : 0),
    });
  });
}

export async function ensureMarketingChecklist(customerId: string, ym: string) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await setDoc(
    ref,
    { customerId, ym },
    { merge: true }
  );
}

// Custom per-customer service toggle
export async function setCustomMarketingService(
  customerId: string,
  ym: string,
  key: string,
  label: string,
  done: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await setDoc(
    ref,
    {
      customerId,
      ym,
      services: {
        custom: {
          [key]: {
            label,
            done,
            doneAt: done ? Date.now() : deleteField(),
          },
        },
      },
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
}

export async function setMarketingService(
  customerId: string,
  ym: string,
  service: MarketingServiceKey,
  done: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await setDoc(
    ref,
    {
      customerId,
      ym,
      services: {
        [service]: {
          done,
          doneAt: done ? Date.now() : deleteField(),
        },
      },
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
}

export async function setMarketingServiceMeta(
  customerId: string,
  ym: string,
  service: MarketingServiceKey,
  meta: Partial<Pick<ServiceState, "assignedTo" | "notes">>
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await setDoc(
    ref,
    {
      customerId,
      ym,
      ...(meta.assignedTo !== undefined ? { [`services.${service}.assignedTo`]: meta.assignedTo } : {}),
      ...(meta.notes !== undefined ? { [`services.${service}.notes`]: meta.notes } : {}),
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
}
