"use client";
import { deleteField, doc, serverTimestamp, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ensureMarketingChecklist, MarketingServiceKey } from "./marketing-checklist";

// Two-checkbox system functions
export async function setMarketingServicePrepared(
  customerId: string,
  ym: string,
  service: MarketingServiceKey,
  prepared: boolean
) {
  const docRef = doc(db, "marketing-checklists", `${customerId}-${ym}`);
  
  const updateData = {
    [`services.${service}.prepared`]: prepared,
    [`services.${service}.preparedAt`]: prepared ? serverTimestamp() : deleteField(),
    updatedAt: serverTimestamp(),
  };
  
  console.log("🔥 Firestore WRITE prepared:", { customerId, ym, service, prepared, updateData });
  await updateDoc(docRef, updateData);
  console.log("✅ Firestore WRITE prepared SUCCESS");
}

export async function setMarketingServiceCompleted(
  customerId: string,
  ym: string,
  service: MarketingServiceKey,
  completed: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await ensureMarketingChecklist(customerId, ym);
  
  // When completing, also set prepared to true
  const updates: any = {
    customerId,
    ym,
    [`services.${service}.done`]: completed,
    [`services.${service}.doneAt`]: completed ? Date.now() : deleteField(),
    updatedAt: Date.now(),
  };
  
  if (completed) {
    updates[`services.${service}.prepared`] = true;
    updates[`services.${service}.preparedAt`] = Date.now();
  }
  
  await setDoc(ref, updates, { merge: true });
}

export async function setCustomMarketingServicePrepared(
  customerId: string,
  ym: string,
  key: string,
  label: string,
  prepared: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await ensureMarketingChecklist(customerId, ym);
  await setDoc(
    ref,
    {
      customerId,
      ym,
      // Keep custom service state under services.custom for consistency
      [`services.custom.${key}.label`]: label,
      [`services.custom.${key}.prepared`]: prepared,
      [`services.custom.${key}.preparedAt`]: prepared ? Date.now() : deleteField(),
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
}

export async function setCustomMarketingServiceCompleted(
  customerId: string,
  ym: string,
  key: string,
  label: string,
  completed: boolean
) {
  const id = `${customerId}_${ym}`;
  const ref = doc(db, "marketingChecklists", id);
  await ensureMarketingChecklist(customerId, ym);
  
  // When completing, also set prepared to true
  const updates: any = {
    customerId,
    ym,
    // Keep custom service state under services.custom for consistency
    [`services.custom.${key}.label`]: label,
    [`services.custom.${key}.done`]: completed,
    [`services.custom.${key}.doneAt`]: completed ? Date.now() : deleteField(),
    updatedAt: Date.now(),
  };
  
  if (completed) {
    updates[`services.custom.${key}.prepared`] = true;
    updates[`services.custom.${key}.preparedAt`] = Date.now();
  }
  
  await setDoc(ref, updates, { merge: true });
}
