"use client";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type MarketingStatus = "offen" | "in_arbeit" | "fertig";

export interface MarketingTask {
  id: string;
  customerId: string;
  title: string;
  dueDate?: number; // ms timestamp
  status: MarketingStatus;
  progress: number; // 0..100
  assignedTo?: string;
  createdAt: number;
  updatedAt: number;
}

const tasksRef = collection(db, "marketingTasks");

export function listenMarketingTasks(cb: (items: MarketingTask[]) => void, customerId?: string) {
  const q = customerId
    ? query(tasksRef, where("customerId", "==", customerId), orderBy("createdAt", "desc"))
    : query(tasksRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const items: MarketingTask[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        customerId: data.customerId,
        title: data.title,
        dueDate: data.dueDate?._seconds ? data.dueDate.seconds * 1000 : data.dueDate,
        status: (data.status as MarketingStatus) ?? "offen",
        progress: Number(data.progress ?? 0),
        assignedTo: data.assignedTo,
        createdAt: data.createdAt?._seconds ? data.createdAt.seconds * 1000 : data.createdAt,
        updatedAt: data.updatedAt?._seconds ? data.updatedAt.seconds * 1000 : data.updatedAt,
      };
    });
    cb(items);
  });
}

export async function createMarketingTask(data: Omit<MarketingTask, "id" | "createdAt" | "updatedAt">) {
  return addDoc(tasksRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMarketingTask(id: string, data: Partial<MarketingTask>) {
  const ref = doc(db, "marketingTasks", id);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteMarketingTask(id: string) {
  const ref = doc(db, "marketingTasks", id);
  await deleteDoc(ref);
}
