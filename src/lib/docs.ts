import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from "@/lib/firebase";
import {
  collection,
  doc as firestoreDoc,
  getDocs as getFirestoreDocs,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export interface DocItem {
  id: string;
  title: string;
  preview: string;
  text: string;
  updatedAt: string;
}

const STORAGE_KEY = "correctnow:docs";
const DOC_LIMIT = 50;

export const getDocs = (): DocItem[] => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDocs = (docs: DocItem[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
};

export const upsertDoc = (text: string, id?: string): DocItem => {
  const docs = getDocs();
  const content = text.trim();
  const title = content.split("\n")[0]?.slice(0, 60) || "Untitled";
  const preview = content.slice(0, 180);
  const updatedAt = new Date().toISOString();

  const doc: DocItem = {
    id: id || `doc-${Date.now()}`,
    title,
    preview,
    text: content,
    updatedAt,
  };

  const next = [doc, ...docs.filter((d) => d.id !== doc.id)].slice(0, DOC_LIMIT);
  saveDocs(next);

  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (auth?.currentUser && db) {
    const ref = firestoreDoc(db, `users/${auth.currentUser.uid}/docs/${doc.id}`);
    setDoc(ref, doc, { merge: true }).catch(() => {
      // keep local fallback if network fails
    });
  }

  return doc;
};

export const getDocById = (id: string): DocItem | undefined => {
  return getDocs().find((doc) => doc.id === id);
};

export const formatUpdated = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Edited just now";
  if (diffMin < 60) return `Edited ${diffMin} min ago`;
  if (diffHr < 24) return `Edited ${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `Edited ${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return `Edited ${date.toLocaleDateString()}`;
};

export const sectionForDate = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return "Today";
  return "Yesterday";
};

export const initDocsSync = () => {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const snap = await getFirestoreDocs(collection(db, `users/${user.uid}/docs`));
      const remote = snap.docs
        .map((docSnap) => ({
          ...(docSnap.data() as DocItem),
          id: docSnap.id,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, DOC_LIMIT);

      if (remote.length) {
        saveDocs(remote);
        window.dispatchEvent(new Event("correctnow:docs-updated"));
      }
    } catch {
      // ignore sync errors
    }
  });
};
