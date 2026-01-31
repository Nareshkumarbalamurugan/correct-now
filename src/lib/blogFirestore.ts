import { getFirebaseDb } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

export type FirestoreBlogPost = {
  id: string;
  title: string;
  slug?: string;
  contentHtml: string;
  contentText?: string;
  coverImageUrl?: string;
  imageUrls?: string[];
  imagePaths?: string[];
  views?: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const mapBlogDoc = (id: string, data: Record<string, any>): FirestoreBlogPost => {
  const contentHtml = String(data?.contentHtml || data?.content || "");
  const contentText = String(data?.contentText || "").trim();
  const imageUrls: string[] = Array.isArray(data?.imageUrls)
    ? data.imageUrls
    : data?.imageUrl
      ? [String(data.imageUrl)]
      : [];
  const imagePaths: string[] = Array.isArray(data?.imagePaths)
    ? data.imagePaths
    : data?.imagePath
      ? [String(data.imagePath)]
      : [];

  return {
    id,
    title: String(data?.title || ""),
    slug: data?.slug ? String(data.slug) : undefined,
    contentHtml,
    contentText,
    imageUrls,
    imagePaths,
    coverImageUrl: String(data?.coverImageUrl || imageUrls[0] || ""),
    views: typeof data?.views === "number" && Number.isFinite(data.views) ? data.views : 0,
    publishedAt: data?.publishedAt ? String(data.publishedAt) : undefined,
    createdAt: data?.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data?.updatedAt ? String(data.updatedAt) : undefined,
  };
};

export const fetchBlogPosts = async (max = 50): Promise<FirestoreBlogPost[]> => {
  const db = getFirebaseDb();
  if (!db) return [];

  const q = query(collection(db, "blogs"), orderBy("publishedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapBlogDoc(d.id, d.data() as Record<string, any>));
};

export const fetchBlogPostById = async (id: string): Promise<FirestoreBlogPost | null> => {
  const db = getFirebaseDb();
  if (!db) return null;

  const ref = doc(db, "blogs", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapBlogDoc(snap.id, snap.data() as Record<string, any>);
};

export const fetchBlogPostBySlug = async (slug: string): Promise<FirestoreBlogPost | null> => {
  const db = getFirebaseDb();
  if (!db) return null;

  const s = slug.trim();
  if (!s) return null;

  const q = query(collection(db, "blogs"), where("slug", "==", s), limit(1));
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) return null;
  return mapBlogDoc(first.id, first.data() as Record<string, any>);
};
