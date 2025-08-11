"use client";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { OnboardingEntry, OnboardingTaskSet } from "@/lib/types";

const onboardingsRef = collection(db, "onboardings");

export function listenOnboardings(cb: (items: OnboardingEntry[]) => void) {
  const q = query(onboardingsRef);
  return onSnapshot(q, (snap) => {
    const list: OnboardingEntry[] = snap.docs.map((d) => {
      const data = d.data() as any;
      const tasks: OnboardingTaskSet = {
        webshop: !!data?.tasks?.webshop,
        app: !!data?.tasks?.app,
        marketing: !!data?.tasks?.marketing,
      };
      return {
        id: d.id,
        customerId: data.customerId,
        tasks,
        // Status wird NICHT mehr aus Tasks abgeleitet, sondern ausschließlich manuell/explicit gesetzt
        status: data.status ?? "in_bearbeitung",
        createdAt: data.createdAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
      } as OnboardingEntry;
    });
    cb(list);
  });
}

export async function ensureOnboarding(customerId: string) {
  const ref = doc(db, "onboardings", customerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      customerId,
      tasks: { webshop: false, app: false, marketing: false },
      status: "in_bearbeitung",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }
  // Wenn vorhanden: nichts überschreiben; optional fehlende Felder ergänzen ohne Status zu ändern
  const data = snap.data() as any;
  const patch: any = {};
  if (!data.tasks) patch.tasks = { webshop: false, app: false, marketing: false };
  if (!data.customerId) patch.customerId = customerId;
  if (!data.createdAt) patch.createdAt = Date.now();
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = Date.now();
    await updateDoc(ref, patch);
  }
}

export async function setOnboardingTasks(customerId: string, tasks: Partial<OnboardingTaskSet>) {
  const ref = doc(db, "onboardings", customerId);
  const merged: any = { [`tasks.webshop`]: tasks.webshop, [`tasks.app`]: tasks.app };
  // Marketing fließt nicht mehr in die Onboarding-Fertigstellung ein, aber wir lassen optionales Schreiben zu
  if (typeof tasks.marketing !== 'undefined') merged["tasks.marketing"] = tasks.marketing;
  await updateDoc(ref, { ...merged, updatedAt: Date.now() });
}

export async function setOnboardingStatus(customerId: string, status: "in_bearbeitung" | "abgeschlossen") {
  const ref = doc(db, "onboardings", customerId);
  await updateDoc(ref, { status, updatedAt: Date.now() });
}

// Datenpflege: löscht Onboarding-Dokumente ohne zugehörigen Customer
export async function cleanOrphanOnboardings(validCustomerIds: string[]) {
  const q = query(collection(db, "onboardings"));
  const snap = await getDocs(q);
  const tasks: Promise<any>[] = [];
  snap.forEach((docu) => {
    const d = docu.data() as any;
    if (!validCustomerIds.includes(d.customerId)) {
      tasks.push(deleteDoc(doc(db, "onboardings", docu.id)));
    }
  });
  await Promise.allSettled(tasks);
}

// Einmalige Bereinigung: Schließe Onboardings, deren Kundenstatus nicht 'onboarding' ist
export async function closeOnboardingForNonOnboardingCustomers() {
  const custSnap = await getDocs(query(collection(db, "customers")));
  const obSnap = await getDocs(query(collection(db, "onboardings")));
  const statusById = new Map<string, string>();
  custSnap.forEach((d) => {
    const data = d.data() as any;
    statusById.set(d.id, data.status);
  });
  const tasks: Promise<any>[] = [];
  obSnap.forEach((d) => {
    const data = d.data() as any;
    const s = statusById.get(data.customerId);
    if (!s || s !== 'onboarding') {
      if (data.status !== 'abgeschlossen') {
        tasks.push(updateDoc(doc(db, 'onboardings', d.id), { status: 'abgeschlossen', updatedAt: Date.now() }));
      }
    }
  });
  await Promise.allSettled(tasks);
}
