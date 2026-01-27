import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "sonner";

const SESSION_KEY = "correctnow:sessionId";
const SESSION_CREATED_AT_KEY = "correctnow:sessionCreatedAt";

const createSessionId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const getSessionId = () => {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    const createdAt = window.localStorage.getItem(SESSION_CREATED_AT_KEY);
    if (!createdAt) {
      window.localStorage.setItem(SESSION_CREATED_AT_KEY, Date.now().toString());
    }
    return existing;
  }
  const id = createSessionId();
  window.localStorage.setItem(SESSION_KEY, id);
  window.localStorage.setItem(SESSION_CREATED_AT_KEY, Date.now().toString());
  return id;
};

export const rotateSessionId = () => {
  const id = createSessionId();
  window.localStorage.setItem(SESSION_KEY, id);
  window.localStorage.setItem(SESSION_CREATED_AT_KEY, Date.now().toString());
  return id;
};

export const clearSessionId = () => {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(SESSION_CREATED_AT_KEY);
};

export const writeSessionId = async (user: User, forceNew = false) => {
  const db = getFirebaseDb();
  if (!db) return;
  const sessionId = forceNew ? rotateSessionId() : getSessionId();
  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      sessionId,
      sessionUpdatedAt: new Date().toISOString(),
      status: "active",
    },
    { merge: true }
  );
  return sessionId;
};

export const startSessionEnforcement = () => {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  if (!auth || !db) return () => {};

  let unsubscribeDoc: (() => void) | undefined;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (unsubscribeDoc) {
      unsubscribeDoc();
      unsubscribeDoc = undefined;
    }

    if (!user) {
      clearSessionId();
      return;
    }

    const ref = doc(db, "users", user.uid);
    unsubscribeDoc = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        // New user or admin - initialize session
        await setDoc(
          ref,
          {
            email: user.email || "",
            sessionId: getSessionId(),
            sessionUpdatedAt: new Date().toISOString(),
            status: "active",
          },
          { merge: true }
        );
        return;
      }
      
      const data = snap.data() as { sessionId?: string; status?: string; email?: string };
      const localSessionId = getSessionId();

      // Skip session enforcement for admin emails (check both auth and firestore)
      const userEmail = user.email || data.email || "";
      const isAdmin = userEmail.includes("@correctnow.app") || userEmail.includes("admin");

      if (data.status === "deactivated" && !isAdmin) {
        await signOut(auth);
        toast.error("Your account is deactivated. Contact support to reactivate.");
        return;
      }

      if (data.sessionId && data.sessionId !== localSessionId && !isAdmin) {
        const createdAtRaw = window.localStorage.getItem(SESSION_CREATED_AT_KEY);
        const createdAt = createdAtRaw ? Number(createdAtRaw) : 0;
        const isRecentLocal = createdAt && Date.now() - createdAt < 30_000;

        if (isRecentLocal) {
          await setDoc(
            ref,
            {
              sessionId: localSessionId,
              sessionUpdatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          return;
        }

        await signOut(auth);
        toast.error("You were signed out because your account was used on another device.");
        return;
      }

      if (!data.sessionId) {
        await setDoc(
          ref,
          {
            sessionId: localSessionId,
            sessionUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    });
  });

  return () => {
    if (unsubscribeDoc) unsubscribeDoc();
    unsubscribeAuth();
  };
};
