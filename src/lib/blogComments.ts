import { getFirebaseDb } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

export type FirestoreBlogComment = {
  id: string;
  name: string;
  message: string;
  createdAtIso: string;
};

export const fetchBlogComments = async (
  blogId: string,
  max = 100
): Promise<FirestoreBlogComment[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  const q = query(
    collection(db, "blogs", blogId, "comments"),
    orderBy("createdAtIso", "asc"),
    limit(max)
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, any>;
    return {
      id: d.id,
      name: String(data?.name || "Anonymous"),
      message: String(data?.message || ""),
      createdAtIso: String(data?.createdAtIso || ""),
    };
  });
};

export const addBlogComment = async (
  blogId: string,
  input: { name: string; message: string }
) => {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase is not configured");

  const name = input.name.trim().slice(0, 60) || "Anonymous";
  const message = input.message.trim().slice(0, 2000);
  if (!message) throw new Error("Comment cannot be empty");

  await addDoc(collection(db, "blogs", blogId, "comments"), {
    name,
    message,
    createdAtIso: new Date().toISOString(),
  });
};
