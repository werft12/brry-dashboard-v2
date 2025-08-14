"use client";
import { collection, deleteField, doc, getDoc, onSnapshot, orderBy, query, setDoc, where, serverTimestamp, updateDoc, getDocs } from "firebase/firestore";
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
  prepared?: boolean;
  preparedAt?: number;
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
        let preparedAt: number | undefined = undefined;
        if (v?.preparedAt?.seconds) preparedAt = v.preparedAt.seconds * 1000;
        else if (typeof v?.preparedAt === "number") preparedAt = v.preparedAt;
        const result = {
          done: !!v?.done,
          doneAt,
          prepared: v?.prepared === true,
          preparedAt,
          assignedTo: v?.assignedTo,
          notes: v?.notes,
        };
        // Debug logging for prepared state
        if (v?.prepared !== undefined) {
          console.log("🔍 Firestore normalize prepared:", { raw: v?.prepared, normalized: result.prepared, fullObject: v });
        }
        return result;
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
        // Read custom services from the correct root path `custom.*`.
        // Keep backward compatibility with legacy `services.custom`.
        custom: normalizeCustom(data?.custom ?? data?.services?.custom),
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
      let preparedAt: number | undefined = undefined;
      if (v?.preparedAt?.seconds) preparedAt = v.preparedAt.seconds * 1000;
      else if (typeof v?.preparedAt === "number") preparedAt = v.preparedAt;
      return {
        done: !!v?.done,
        doneAt,
        prepared: v?.prepared === true,
        preparedAt,
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
      // Read custom services from the correct root path `custom.*`.
      // Keep backward compatibility with legacy `services.custom`.
      custom: normalizeCustom(data?.custom ?? data?.services?.custom),
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
// Two-checkbox system functions
export async function setMarketingServicePrepared(customerId: string, ym: string, service: MarketingServiceKey, prepared: boolean) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  
  let prev: any = undefined;
  try {
    const before = await getDoc(ref);
    prev = before.exists() ? before.data()?.services?.[service] : undefined;
    console.log('🧪 BEFORE setMarketingServicePrepared', {
      id,
      service,
      done: prev?.done,
      prepared: prev?.prepared,
      full: prev
    });
  } catch (e) {
    console.warn('⚠️ BEFORE getDoc failed setMarketingServicePrepared', e);
  }

  const now = Date.now();
  const keepDone = !!prev?.done;
  const updateData = {
    customerId,
    ym,
    services: {
      [service]: {
        // Wichtig: Rules verlangen 'done' als bool, wenn service im Payload enthalten ist
        done: prepared ? keepDone : false,
        ...(prepared
          ? (keepDone ? { doneAt: (typeof prev?.doneAt === 'number' ? prev.doneAt : now) } : {})
          : { doneAt: deleteField() }
        ),
        prepared,
        preparedAt: prepared ? now : deleteField(),
      },
    },
    updatedAt: now,
  } as any;
  console.log('🔥 Firestore setMarketingServicePrepared:', { id, updateData });
  await setDoc(ref, updateData, { merge: true });
  console.log('🔥 Firestore setMarketingServicePrepared completed');

  try {
    const after = await getDoc(ref);
    const s: any = after.exists() ? after.data()?.services?.[service] : undefined;
    console.log('🧪 AFTER setMarketingServicePrepared', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ AFTER getDoc failed setMarketingServicePrepared', e);
  }
}

export async function setMarketingServiceCompleted(customerId: string, ym: string, service: MarketingServiceKey, completed: boolean) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  
  try {
    const before = await getDoc(ref);
    const s: any = before.exists() ? before.data()?.services?.[service] : undefined;
    console.log('🧪 BEFORE setMarketingServiceCompleted', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ BEFORE getDoc failed setMarketingServiceCompleted', e);
  }

  const updateData: any = {
    customerId,
    ym,
    services: {
      [service]: {
        done: completed,
        doneAt: completed ? Date.now() : deleteField(),
        ...(completed ? { prepared: true, preparedAt: Date.now() } : {}),
      },
    },
    updatedAt: Date.now(),
  };
  console.log('🔥 Firestore setMarketingServiceCompleted:', { id, updateData });
  await setDoc(ref, updateData, { merge: true });
  console.log('🔥 Firestore setMarketingServiceCompleted completed');

  try {
    const after = await getDoc(ref);
    const s: any = after.exists() ? after.data()?.services?.[service] : undefined;
    console.log('🧪 AFTER setMarketingServiceCompleted', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ AFTER getDoc failed setMarketingServiceCompleted', e);
  }
}

export async function setCustomMarketingServicePrepared(
  customerId: string,
  ym: string,
  service: string,
  label: string,
  prepared: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  
  try {
    const before = await getDoc(ref);
    const s: any = before.exists() ? (before.data()?.custom?.[service] ?? before.data()?.services?.custom?.[service]) : undefined;
    console.log('🧪 BEFORE setCustomMarketingServicePrepared', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ BEFORE getDoc failed setCustomMarketingServicePrepared', e);
  }

  const updateData = {
    customerId,
    ym,
    custom: {
      [service]: {
        label,
        prepared,
        preparedAt: prepared ? Date.now() : deleteField(),
        ...(prepared ? {} : { done: false, doneAt: deleteField() }),
      },
    },
    updatedAt: Date.now(),
  } as any;
  console.log('🔥 Firestore setCustomMarketingServicePrepared:', { id, updateData });
  await setDoc(ref, updateData, { merge: true });
  console.log('🔥 Firestore setCustomMarketingServicePrepared completed');

  try {
    const after = await getDoc(ref);
    const s: any = after.exists() ? (after.data()?.custom?.[service] ?? after.data()?.services?.custom?.[service]) : undefined;
    console.log('🧪 AFTER setCustomMarketingServicePrepared', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ AFTER getDoc failed setCustomMarketingServicePrepared', e);
  }
}

export async function setCustomMarketingServiceCompleted(customerId: string, ym: string, service: string, label: string, completed: boolean) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  
  try {
    const before = await getDoc(ref);
    const s: any = before.exists() ? (before.data()?.custom?.[service] ?? before.data()?.services?.custom?.[service]) : undefined;
    console.log('🧪 BEFORE setCustomMarketingServiceCompleted', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ BEFORE getDoc failed setCustomMarketingServiceCompleted', e);
  }

  const updateData: any = {
    customerId,
    ym,
    custom: {
      [service]: {
        label,
        done: completed,
        doneAt: completed ? Date.now() : deleteField(),
        ...(completed ? { prepared: true, preparedAt: Date.now() } : {}),
      },
    },
    updatedAt: Date.now(),
  };
  console.log('🔥 Firestore setCustomMarketingServiceCompleted:', { id, updateData });
  await setDoc(ref, updateData, { merge: true });
  console.log('🔥 Firestore setCustomMarketingServiceCompleted completed');

  try {
    const after = await getDoc(ref);
    const s: any = after.exists() ? (after.data()?.custom?.[service] ?? after.data()?.services?.custom?.[service]) : undefined;
    console.log('🧪 AFTER setCustomMarketingServiceCompleted', {
      id,
      service,
      done: s?.done,
      prepared: s?.prepared,
      full: s
    });
  } catch (e) {
    console.warn('⚠️ AFTER getDoc failed setCustomMarketingServiceCompleted', e);
  }
}
