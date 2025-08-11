import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBtPBnuB0cPvn7qyMZhfrFlwmhbaerkvRE",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "brry-dashboard-v2.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "brry-dashboard-v2",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "brry-dashboard-v2.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "723513981850",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:723513981850:web:6f34eb1762af501bcc1823",
};

// Ensure single app instance in Next.js (RSC/SSR/client)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable offline persistence in the browser (safe no-op on server)
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err: any) => {
    // Ignore common cases: failed-precondition (multiple tabs), unimplemented (private mode)
    if (process.env.NODE_ENV !== "production") {
      console.warn("Firestore persistence not enabled:", err?.code || err);
    }
  });
}
