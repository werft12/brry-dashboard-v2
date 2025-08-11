"use client";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Customer } from "@/lib/types";

const customersRef = collection(db, "customers");

export function listenCustomers(cb: (items: Customer[]) => void) {
  const q = query(customersRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const items: Customer[] = snap.docs.map((d) => {
      const data = d.data() as any;
      // Normalize status from legacy shapes/values
      const rsRaw = data.status;
      const rs = (typeof rsRaw === 'string') ? (rsRaw as string).toLowerCase() : rsRaw;
      const status: any = ((): 'aktiv' | 'onboarding' | 'inaktiv' => {
        if (rs === true || rs === 'active' || rs === 'aktiv') return 'aktiv';
        if (rs === 'onboarding') return 'onboarding';
        if (rs === false || rs === 'inactive' || rs === 'inaktiv') return 'inaktiv';
        return 'onboarding';
      })();
      return {
        id: d.id,
        name: data.name ?? "",
        branches: Number(data.branches ?? 0),
        status,
        baseFee: (typeof data.baseFee === "number" ? data.baseFee : undefined),
        marketingActive: data.marketingActive ?? false,
        monthlyRevenue: data.monthlyRevenue ?? 0,
        baseFeeDisabled: (typeof data.baseFeeDisabled === 'boolean' ? data.baseFeeDisabled : String(data.baseFeeDisabled) === 'true') || false,
        notes: typeof data.notes === "string" ? data.notes : undefined,
        extraServices: Array.isArray(data.extraServices)
          ? data.extraServices.map((s: any) => ({ name: String(s?.name ?? ""), price: Number(s?.price ?? 0) }))
          : [],
        createdAt: (data.createdAt?._seconds ? data.createdAt.seconds * 1000 : data.createdAt) ?? Date.now(),
        updatedAt: (data.updatedAt?._seconds ? data.updatedAt.seconds * 1000 : data.updatedAt) ?? Date.now(),
      } as Customer;
    });
    cb(items);
  });
}

export async function createCustomer(data: Omit<Customer, "id" | "createdAt" | "updatedAt">) {
  return addDoc(customersRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  const ref = doc(db, "customers", id);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function setCustomer(id: string, data: Customer) {
  const ref = doc(db, "customers", id);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteCustomer(id: string) {
  const ref = doc(db, "customers", id);
  await deleteDoc(ref);
}
