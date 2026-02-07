import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Razorpay from "razorpay";
import Stripe from "stripe";
import crypto from "crypto";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { createProxyMiddleware } from "http-proxy-middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");
const publicPath = path.join(__dirname, "..", "public");

const initAdminDb = () => {
  try {
    if (!admin.apps.length) {
      // Try to load from explicit env path first
      const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const resolvedEnvPath = envPath
        ? path.isAbsolute(envPath)
          ? envPath
          : path.join(__dirname, "..", envPath)
        : null;
      const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

      if (resolvedEnvPath && existsSync(resolvedEnvPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(resolvedEnvPath),
        });
      } else if (existsSync(serviceAccountPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Fallback to env variable
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        });
      } else {
        return null;
      }
    }
    const db = admin.firestore();
    // Enable ignoreUndefinedProperties to prevent Firestore errors
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  } catch (err) {
    console.error("Firebase admin init error:", err);
    return null;
  }
};

const adminDb = initAdminDb();

/**
 * Verify Firebase auth token
 * @param {string} token - Firebase ID token
 * @returns {Promise<DecodedIdToken|null>} Decoded token or null if invalid
 */
const verifyAuthToken = async (token) => {
  try {
    if (!admin.apps.length) {
      console.error('Firebase admin not initialized');
      return null;
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying auth token:', error.message);
    return null;
  }
};

/**
 * Get user data from Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object|null>} User data or null
 */
const getUserData = async (userId) => {
  try {
    if (!adminDb) {
      console.error('Firestore not initialized');
      return null;
    }
    
    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return null;
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

/**
 * Update user's daily check count
 * @param {string} userId - Firebase user ID
 * @returns {Promise<boolean>} Success status
 */
const incrementUserCheck = async (userId) => {
  try {
    if (!adminDb) {
      console.error('Firestore not initialized');
      return false;
    }
    
    const userRef = adminDb.collection('users').doc(userId);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Get current data
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    // Reset daily count if it's a new day
    if (userData.lastCheckDate !== today) {
      await userRef.set({
        ...userData,
        dailyChecksUsed: 1,
        lastCheckDate: today
      }, { merge: true });
    } else {
      // Increment daily count
      await userRef.update({
        dailyChecksUsed: admin.firestore.FieldValue.increment(1)
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error incrementing user check:', error);
    return false;
  }
};

/**
 * Get user entitlements (similar to frontend entitlements.ts)
 * @param {Object} userData - User data from Firestore
 * @returns {Object} Entitlements object
 */
const getUserEntitlements = (userData) => {
  if (!userData) {
    return {
      plan: 'free',
      isPro: false,
      checksLimit: 5, // Free limit: 5 per day
      checksUsed: 0
    };
  }

  const planField = String(userData?.plan || '').trim().toLowerCase();
  const wordLimit = Number(userData?.wordLimit) || 0;
  const isPro = wordLimit >= 5000 || planField === 'pro';
  
  const subscriptionStatus = String(userData?.subscriptionStatus || '').trim().toLowerCase();
  const updatedAtRaw = userData?.subscriptionUpdatedAt;
  const updatedAt = updatedAtRaw ? new Date(String(updatedAtRaw)) : null;
  const isRecent = updatedAt
    ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31 // 31 days
    : false;
  const isActive = subscriptionStatus === 'active' && (updatedAt ? isRecent : true);
  
  const effectiveIsPro = subscriptionStatus ? (isActive && isPro) : isPro;
  
  // Get today's date for daily check reset
  const today = new Date().toISOString().split('T')[0];
  const lastCheckDate = userData?.lastCheckDate;
  const dailyChecksUsed = lastCheckDate === today ? (userData?.dailyChecksUsed || 0) : 0;
  
  return {
    plan: effectiveIsPro ? 'pro' : 'free',
    isPro: effectiveIsPro,
    checksLimit: effectiveIsPro ? -1 : 5, // Pro: unlimited, Free: 5/day
    checksUsed: dailyChecksUsed,
    subscriptionStatus: subscriptionStatus || 'inactive'
  };
};

/**
 * Increment usage count for authenticated user
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
const incrementUsageCount = async (userId) => {
  try {
    await incrementUserCheck(userId);
  } catch (error) {
    console.error('Error incrementing usage:', error);
  }
};

// Simple in-memory cache to reduce latency and cost
const cacheStore = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const getCache = (key) => {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (key, value) => {
  cacheStore.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: "2024-11-20.acacia" });
};

const getBrevoTransporter = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const smtpUser = process.env.BREVO_SMTP_USER || "apikey";
  const smtpPass = process.env.BREVO_SMTP_PASS || apiKey;
  if (!smtpPass) return null;
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
};

const sendBrevoEmail = async ({ to, subject, html }) => {
  const transporter = getBrevoTransporter();
  if (!transporter) {
    throw new Error("Brevo SMTP is not configured");
  }
  const fromEmail = process.env.BREVO_FROM_EMAIL || "no-reply@yourdomain.com";
  const fromName = process.env.BREVO_FROM_NAME || "CorrectNow";
  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const toStripeAmount = (amount, currency) => {
  const code = String(currency || "").toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.has(code)
    ? Math.round(amount)
    : Math.round(amount * 100);
};

const updateUsersBySubscriptionId = async (subscriptionId, updates) => {
  if (!adminDb || !subscriptionId) return;
  const snapshot = await adminDb
    .collection("users")
    .where("subscriptionId", "==", subscriptionId)
    .get();
  if (snapshot.empty) return;

  const batch = adminDb.batch();
  snapshot.forEach((doc) => {
    batch.set(doc.ref, updates, { merge: true });
  });
  await batch.commit();
};

// IP tracking for rate limiting non-authenticated users
const ipCheckCount = new Map(); // { ip: { count: number, resetAt: timestamp } }
const IP_CHECK_LIMIT = 5;
const IP_RESET_HOURS = 24;
// Daily word limit for logged-in free users (also enforced per IP)
const freeIpWordCount = new Map(); // { key: { count: number, resetAt: timestamp } }

app.use(cors());

// CRITICAL: Process webhook routes BEFORE any body parsing middleware
// Stripe webhook - MUST use raw body
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("=== STRIPE WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    console.log("Has signature:", !!sig);
    console.log("Has webhook secret:", !!webhookSecret);
    console.log("Body type:", typeof req.body);
    console.log("Body is Buffer:", Buffer.isBuffer(req.body));
    
    if (!sig || !webhookSecret) {
      console.error("ERROR: Missing signature or webhook secret");
      return res.status(400).json({ error: "Missing signature or webhook secret" });
    }

    const stripe = getStripe();
    if (!stripe) {
      console.error("ERROR: Stripe not configured");
      return res.status(500).json({ error: "Stripe not configured" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log("✓ Webhook signature verified successfully");
    } catch (err) {
      console.error("ERROR: Stripe webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log("Event type:", event.type);
    console.log("Event ID:", event.id);

    try {
      const nowIso = new Date().toISOString();
      
      switch (event.type) {
        case "checkout.session.completed": {
          console.log("--- Processing checkout.session.completed ---");
          const session = event.data.object;
          const customerId = session.customer;
          const subscriptionId = session.subscription;
          const metadata = session.metadata || {};
          const userId = metadata.userId;
          
          console.log("Customer ID:", customerId);
          console.log("Subscription ID:", subscriptionId);
          console.log("User ID from metadata:", userId);
          console.log("Metadata type:", metadata.type);
          console.log("AdminDb available:", !!adminDb);
          
          if (!userId) {
            console.error("ERROR: No userId in metadata");
            break;
          }
          
          if (!adminDb) {
            console.error("ERROR: AdminDb not initialized");
            break;
          }
          
          const userRef = adminDb.collection("users").doc(userId);
          console.log("User reference path:", `users/${userId}`);
          
          if (metadata.type === "credits") {
            console.log("Processing CREDIT purchase");
            const credits = Number(metadata.credits || 0);
            console.log("Credits to add:", credits);
            
            const userSnap = await userRef.get();
            const data = userSnap.exists ? userSnap.data() : {};
            const currentAddon = Number(data?.addonCredits || 0) || 0;
            const currentExpiry = data?.addonCreditsExpiryAt;
            const now = new Date();
            const isCurrentValid = currentExpiry ? new Date(String(currentExpiry)).getTime() > now.getTime() : false;
            const nextAddon = (isCurrentValid ? currentAddon : 0) + credits;
            const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            console.log("Current addon credits:", currentAddon);
            console.log("New addon credits:", nextAddon);
            
            await userRef.set({
              addonCredits: nextAddon,
              addonCreditsExpiryAt: expiry,
              creditsUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
            console.log("✓ Credits updated successfully");
          } else {
            console.log("Processing SUBSCRIPTION purchase");
            const updateData = {
              plan: "pro",
              wordLimit: 5000,
              credits: 50000,
              creditsUsed: 0,
              creditsResetDate: nowIso,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: "active",
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            };
            console.log("Update data:", JSON.stringify(updateData, null, 2));
            
            await userRef.set(updateData, { merge: true });
            console.log("✓ Subscription updated successfully");
            
            // Verify the update
            const verifySnap = await userRef.get();
            if (verifySnap.exists) {
              console.log("✓ Verification - User document exists");
              console.log("Updated user data:", JSON.stringify(verifySnap.data(), null, 2));
            } else {
              console.error("ERROR: User document not found after update");
            }
          }
          break;
        }
        
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          console.log("--- Processing subscription update/delete ---");
          const subscription = event.data.object;
          const subscriptionId = subscription.id;
          const status = subscription.status;
          
          console.log("Subscription ID:", subscriptionId);
          console.log("Subscription status:", status);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users with this subscription:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          const updates = {};
          
          if (status === "active") {
            updates.plan = "pro";
            updates.wordLimit = 5000;
            updates.credits = 50000;
            updates.creditsUsed = 0;
            updates.creditsResetDate = nowIso;
            updates.subscriptionStatus = "active";
          } else if (["canceled", "unpaid"].includes(status)) {
            updates.plan = "free";
            updates.wordLimit = 200;
            updates.credits = 0;
            updates.creditsUsed = 0;
            updates.subscriptionStatus = status;
          } else if (status === "past_due") {
            updates.subscriptionStatus = "past_due";
          }
          
          updates.subscriptionUpdatedAt = nowIso;
          updates.updatedAt = nowIso;
          
          console.log("Update data:", JSON.stringify(updates, null, 2));
          
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, updates, { merge: true });
          });
          
          await batch.commit();
          console.log("✓ Batch update completed");
          break;
        }
        
        case "invoice.payment_succeeded": {
          console.log("--- Processing invoice.payment_succeeded ---");
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          console.log("Subscription ID:", subscriptionId);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, {
              plan: "pro",
              wordLimit: 5000,
              credits: 50000,
              creditsUsed: 0,
              creditsResetDate: nowIso,
              subscriptionStatus: "active",
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          });
          
          await batch.commit();
          console.log("✓ Batch update completed");
          break;
        }
        
        case "invoice.payment_failed": {
          console.log("--- Processing invoice.payment_failed ---");
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          console.log("Subscription ID:", subscriptionId);
          
          if (!adminDb || !subscriptionId) {
            console.error("ERROR: No adminDb or subscriptionId");
            break;
          }
          
          const snapshot = await adminDb
            .collection("users")
            .where("stripeSubscriptionId", "==", subscriptionId)
            .get();
          
          console.log("Found users:", snapshot.size);
            
          if (snapshot.empty) {
            console.error("ERROR: No users found with subscription ID:", subscriptionId);
            break;
          }
          
          const batch = adminDb.batch();
          snapshot.forEach((doc) => {
            console.log("Updating user:", doc.id);
            batch.set(doc.ref, {
              subscriptionStatus: "past_due",
              subscriptionUpdatedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          });
          
          await batch.commit();
          console.log("✓ Batch update completed");
          break;
        }
        
        default:
          console.log("Unhandled event type:", event.type);
      }
      
      console.log("=== WEBHOOK PROCESSING COMPLETED SUCCESSFULLY ===");
      res.json({ received: true });
    } catch (error) {
      console.error("=== WEBHOOK ERROR ===");
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

// Razorpay webhook - MUST use raw body
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  if (!secret || !signature) {
    return res.status(500).json({ message: "Webhook secret or signature missing" });
  }

  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  if (expected !== signature) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  try {
    const event = JSON.parse(req.body.toString("utf8"));
    const eventName = event?.event || "unknown";
    console.log("Razorpay webhook:", eventName);

    const subscriptionId =
      event?.payload?.subscription?.entity?.id ||
      event?.payload?.payment?.entity?.subscription_id ||
      event?.payload?.invoice?.entity?.subscription_id ||
      event?.payload?.subscription?.id ||
      "";

    if (adminDb && subscriptionId) {
      const nowIso = new Date().toISOString();
      if (eventName === "subscription.charged") {
        await updateUsersBySubscriptionId(subscriptionId, {
          plan: "pro",
          wordLimit: 5000,
          credits: 50000,
          creditsUsed: 0,
          creditsResetDate: nowIso,
          subscriptionStatus: "active",
          subscriptionUpdatedAt: nowIso,
          updatedAt: nowIso,
        });
      } else if (eventName === "payment.failed") {
        await updateUsersBySubscriptionId(subscriptionId, {
          plan: "free",
          wordLimit: 200,
          credits: 0,
          subscriptionStatus: "past_due",
          updatedAt: nowIso,
        });
      } else if (
        [
          "subscription.halted",
          "subscription.cancelled",
          "subscription.paused",
          "subscription.completed",
        ].includes(eventName)
      ) {
        await updateUsersBySubscriptionId(subscriptionId, {
          plan: "free",
          wordLimit: 200,
          credits: 0,
          subscriptionStatus: "inactive",
          updatedAt: nowIso,
        });
      }
    }
  } catch {
    return res.status(400).json({ message: "Invalid webhook payload" });
  }

  return res.status(200).json({ status: "ok" });
});

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("=== STRIPE WEBHOOK RECEIVED ===");
  console.log("Timestamp:", new Date().toISOString());
  
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  console.log("Has signature:", !!sig);
  console.log("Has webhook secret:", !!webhookSecret);
  
  if (!sig || !webhookSecret) {
    console.error("ERROR: Missing signature or webhook secret");
    console.log("Signature present:", !!sig);
    console.log("Webhook secret present:", !!webhookSecret);
    return res.status(400).json({ error: "Missing signature or webhook secret" });
  }

  const stripe = getStripe();
  if (!stripe) {
    console.error("ERROR: Stripe not configured");
    return res.status(500).json({ error: "Stripe not configured" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("✓ Webhook signature verified successfully");
  } catch (err) {
    console.error("ERROR: Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log("Event type:", event.type);
  console.log("Event ID:", event.id);

  try {
    const nowIso = new Date().toISOString();
    
    switch (event.type) {
      case "checkout.session.completed": {
        console.log("--- Processing checkout.session.completed ---");
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const metadata = session.metadata || {};
        const userId = metadata.userId;
        
        console.log("Customer ID:", customerId);
        console.log("Subscription ID:", subscriptionId);
        console.log("User ID from metadata:", userId);
        console.log("Metadata type:", metadata.type);
        console.log("AdminDb available:", !!adminDb);
        
        if (!userId) {
          console.error("ERROR: No userId in metadata");
          break;
        }
        
        if (!adminDb) {
          console.error("ERROR: AdminDb not initialized");
          break;
        }
        
        const userRef = adminDb.collection("users").doc(userId);
        console.log("User reference path:", `users/${userId}`);
        
        if (metadata.type === "credits") {
          console.log("Processing CREDIT purchase");
          const credits = Number(metadata.credits || 0);
          console.log("Credits to add:", credits);
          
          const userSnap = await userRef.get();
          const currentCredits = userSnap.exists ? Number(userSnap.data()?.credits || 0) : 0;
          console.log("Current credits:", currentCredits);
          console.log("New total credits:", currentCredits + credits);
          
          await userRef.set({
            credits: currentCredits + credits,
            creditsUpdatedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
          console.log("✓ Credits updated successfully");
        } else {
          console.log("Processing SUBSCRIPTION purchase");
          const updateData = {
            plan: "pro",
            wordLimit: 5000,
            credits: 50000,
            creditsUsed: 0,
            creditsResetDate: nowIso,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: "active",
            subscriptionUpdatedAt: nowIso,
            updatedAt: nowIso,
          };
          console.log("Update data:", JSON.stringify(updateData, null, 2));
          
          await userRef.set(updateData, { merge: true });
          console.log("✓ Subscription updated successfully");
          
          // Verify the update
          const verifySnap = await userRef.get();
          if (verifySnap.exists) {
            console.log("✓ Verification - User document exists");
            console.log("Updated user data:", JSON.stringify(verifySnap.data(), null, 2));
          } else {
            console.error("ERROR: User document not found after update");
          }
        }
        break;
      }
      
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        console.log("--- Processing subscription update/delete ---");
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        const status = subscription.status;
        
        console.log("Subscription ID:", subscriptionId);
        console.log("Subscription status:", status);
        
        if (!adminDb || !subscriptionId) {
          console.error("ERROR: No adminDb or subscriptionId");
          break;
        }
        
        const snapshot = await adminDb
          .collection("users")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .get();
        
        console.log("Found users with this subscription:", snapshot.size);
          
        if (snapshot.empty) {
          console.error("ERROR: No users found with subscription ID:", subscriptionId);
          break;
        }
        
        const batch = adminDb.batch();
        const updates = {};
        
        if (status === "active") {
          updates.plan = "pro";
          updates.wordLimit = 5000;
          updates.credits = 50000;
          updates.creditsUsed = 0;
          updates.creditsResetDate = nowIso;
          updates.subscriptionStatus = "active";
        } else if (["canceled", "unpaid"].includes(status)) {
          updates.plan = "free";
          updates.wordLimit = 200;
          updates.credits = 0;
          updates.creditsUsed = 0;
          updates.subscriptionStatus = status;
        } else if (status === "past_due") {
          updates.subscriptionStatus = "past_due";
        }
        
        updates.subscriptionUpdatedAt = nowIso;
        updates.updatedAt = nowIso;
        
        console.log("Updates to apply:", JSON.stringify(updates, null, 2));
        
        snapshot.forEach((doc) => {
          console.log("Updating user:", doc.id);
          batch.set(doc.ref, updates, { merge: true });
        });
        
        await batch.commit();
        console.log("✓ Batch update completed");
        break;
      }
      
      case "invoice.payment_succeeded": {
        console.log("--- Processing invoice.payment_succeeded ---");
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        console.log("Subscription ID:", subscriptionId);
        
        if (!adminDb || !subscriptionId) {
          console.error("ERROR: No adminDb or subscriptionId");
          break;
        }
        
        const snapshot = await adminDb
          .collection("users")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .get();
        
        console.log("Found users:", snapshot.size);
          
        if (snapshot.empty) {
          console.error("ERROR: No users found with subscription ID:", subscriptionId);
          break;
        }
        
        const batch = adminDb.batch();
        snapshot.forEach((doc) => {
          console.log("Updating user:", doc.id);
          batch.set(doc.ref, {
            plan: "pro",
            wordLimit: 5000,
            credits: 50000,
            creditsUsed: 0,
            creditsResetDate: nowIso,
            subscriptionStatus: "active",
            subscriptionUpdatedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });
        
        await batch.commit();
        console.log("✓ Batch update completed");
        break;
      }
      
      case "invoice.payment_failed": {
        console.log("--- Processing invoice.payment_failed ---");
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        console.log("Subscription ID:", subscriptionId);
        
        if (!adminDb || !subscriptionId) {
          console.error("ERROR: No adminDb or subscriptionId");
          break;
        }
        
        const snapshot = await adminDb
          .collection("users")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .get();
        
        console.log("Found users:", snapshot.size);
          
        if (snapshot.empty) {
          console.error("ERROR: No users found with subscription ID:", subscriptionId);
          break;
        }
        
        const batch = adminDb.batch();
        snapshot.forEach((doc) => {
          console.log("Updating user:", doc.id);
          batch.set(doc.ref, {
            subscriptionStatus: "past_due",
            subscriptionUpdatedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });
        
        await batch.commit();
        console.log("✓ Batch update completed");
        break;
      }
      
      default:
        console.log("Unhandled event type:", event.type);
    }
    
    console.log("=== WEBHOOK PROCESSING COMPLETED SUCCESSFULLY ===");
    res.json({ received: true });
  } catch (error) {
    console.error("=== WEBHOOK ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

app.use(express.json({ limit: "1mb" }));

// Optional WordPress blog proxy (legacy). Keep it off `/blog` so the SPA can own `/blog`.
// If you still need WordPress, it will be reachable at `/blog-wp`.
const BLOG_PROXY_TARGET = process.env.BLOG_PROXY_TARGET || "https://blog.correctnow.app";
app.use(
  "/blog-wp",
  createProxyMiddleware({
    target: BLOG_PROXY_TARGET,
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      "^/blog-wp": "",
    },
  })
);

const WORD_LIMIT = 5000;
const FREE_DAILY_WORD_LIMIT = 300;

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Set admin claim and create user if needed (SECURE THIS IN PRODUCTION)
app.post("/api/set-admin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    let user;
    try {
      // Try to get existing user
      user = await admin.auth().getUserByEmail(email);
    } catch (error) {
      // User doesn't exist, create it
      if (password) {
        user = await admin.auth().createUser({
          email,
          password,
          emailVerified: true,
        });
        console.log(`Created new user: ${email}`);
      } else {
        return res.status(400).json({ error: "Password required for new user" });
      }
    }

    // Set admin claim
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Admin claim set for ${email} (${user.uid})`);

    res.json({ 
      success: true, 
      message: `Admin claim set for ${email}`,
      uid: user.uid
    });
  } catch (error) {
    console.error("Set admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new user (admin only)
app.post("/api/admin/create-user", async (req, res) => {
  try {
    const { name, email, phone, category, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const phoneValue = String(phone || "").trim();
    const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;
    if (phoneValue && !phoneRegex.test(phoneValue)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    if (!adminDb) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    // Check if user already exists in Auth
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "User with this email already exists" });
      }
    } catch (error) {
      // If error code is 'auth/user-not-found', user doesn't exist - continue
      if (error.code !== 'auth/user-not-found') {
        // Some other error occurred
        console.error("Error checking user existence:", error);
        return res.status(500).json({ error: "Failed to check if user exists" });
      }
      // User doesn't exist, continue with creation
    }

    // Check if user already exists in Firestore by querying email field
    const existingUserQuery = await adminDb.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (!existingUserQuery.empty) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: name,
    });

    console.log(`Created new user: ${email} (${userRecord.uid})`);

    // Create user document in Firestore
    const nowIso = new Date().toISOString();
    const userData = {
      uid: userRecord.uid,
      email: email,
      name: name,
      plan: "free",
      wordLimit: 200,
      credits: 0,
      creditsUsed: 0,
      subscriptionStatus: "inactive",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    
    // Only add phone and category if they have values
    if (phoneValue) {
      userData.phone = phoneValue;
    }
    if (category && String(category).trim()) {
      userData.category = String(category).trim();
    }
    
    await adminDb.collection("users").doc(userRecord.uid).set(userData);

    console.log(`Created Firestore document for user: ${userRecord.uid}`);

    // Build response object without undefined values
    const responseData = {
      success: true, 
      message: `User created successfully: ${email}`,
      uid: userRecord.uid,
      email: email,
      name: name,
    };
    
    if (phoneValue) {
      responseData.phone = phoneValue;
    }
    if (category && String(category).trim()) {
      responseData.category = String(category).trim();
    }
    
    res.json(responseData);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only) - deletes from both Auth and Firestore
app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!adminDb) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(userId);
      console.log(`Deleted user from Auth: ${userId}`);
    } catch (error) {
      // If user doesn't exist in Auth, continue to delete from Firestore
      console.warn(`User not found in Auth (${userId}), continuing to delete from Firestore:`, error.message);
    }

    // Delete from Firestore
    try {
      await adminDb.collection("users").doc(userId).delete();
      console.log(`Deleted user document from Firestore: ${userId}`);
    } catch (error) {
      console.warn(`Failed to delete Firestore document for ${userId}:`, error.message);
    }

    res.json({ 
      success: true, 
      message: `User deleted successfully: ${userId}`
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/razorpay/key", (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(500).json({ message: "Missing RAZORPAY_KEY_ID" });
  }
  return res.json({ keyId });
});

app.post("/api/razorpay/order", async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const percent = Number(req.body?.discountPercent || 0);
    const baseAmount = Number(req.body?.amount ?? 499);
    const amountInRupees = percent > 0
      ? Math.max(1, Number((baseAmount * (1 - percent / 100)).toFixed(2)))
      : baseAmount;

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return res.status(400).json({ message: "Invalid subscription amount" });
    }
    const credits = Number(req.body?.credits ?? 0);
    const amount = Math.round(amountInRupees * 100);
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { plan: "pro", credits: credits || undefined },
    });

    return res.json(order);
  } catch (err) {
    console.error("Razorpay order error:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

app.post("/api/razorpay/subscription", async (req, res) => {
  try {
    console.log("Razorpay subscription request received");
    console.log("Environment check:", {
      hasKeyId: !!process.env.RAZORPAY_KEY_ID,
      hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpay = getRazorpay();
    if (!razorpay) {
      console.error("Razorpay not configured - missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
      return res.status(500).json({ 
        message: "Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables." 
      });
    }

    const requestedPlanId = req.body?.planId;
    const requestedPeriod = String(req.body?.period || "monthly");
    const period = ["daily", "weekly", "monthly", "yearly"].includes(requestedPeriod)
      ? requestedPeriod
      : "monthly";
    const interval = Math.max(1, Number(req.body?.interval ?? 1));
    const percent = Number(req.body?.discountPercent || 0);
    const baseAmount = Number(req.body?.amount ?? 499);
    const amountInRupees = percent > 0
      ? Math.max(1, Number((baseAmount * (1 - percent / 100)).toFixed(2)))
      : baseAmount;
    let planId = requestedPlanId || process.env.RAZORPAY_PLAN_ID;

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return res.status(400).json({ message: "Invalid subscription amount" });
    }

    if (Number.isFinite(amountInRupees) && amountInRupees > 0 && percent > 0) {
      planId = undefined;
    }

    if (!planId) {
      console.log("Creating new Razorpay plan");
      const plan = await razorpay.plans.create({
        period,
        interval,
        item: {
          name: "CorrectNow Pro",
          amount: Math.round(amountInRupees * 100),
          currency: "INR",
          description: "Monthly Pro subscription - 2000 word limit, 50,000 credits",
        },
      });
      planId = plan.id;
      console.log("Plan created:", planId);
    }

    console.log("Creating subscription with plan:", planId);
    const totalCount = Number(req.body?.totalCount ?? 12);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { plan: "pro" },
    });

    console.log("Subscription created successfully:", subscription.id);
    return res.json(subscription);
  } catch (err) {
    console.error("Razorpay subscription error:", err);
    console.error("Error details:", {
      message: err.message,
      statusCode: err.statusCode,
      error: err.error,
    });
    return res.status(500).json({ 
      message: "Failed to create subscription",
      error: err.message,
      details: err.error?.description || err.error?.reason || "Unknown error"
    });
  }
});

app.post("/api/auth/send-verification", async (req, res) => {
  try {
    const { email, continueUrl } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email is required" });

    if (!admin.apps.length) {
      return res.status(500).json({ message: "Firebase admin not initialized" });
    }

    const link = await admin.auth().generateEmailVerificationLink(String(email), {
      url: String(continueUrl || process.env.CLIENT_URL || "http://localhost:5173"),
      handleCodeInApp: false,
    });

    await sendBrevoEmail({
      to: String(email),
      subject: "Verify your email",
      html: `
        <h2>Welcome to CorrectNow</h2>
        <p>Please verify your email address to activate your account:</p>
        <p><a href="${link}">Verify Email</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Send verification error:", err);
    return res.status(500).json({ message: "Failed to send verification email" });
  }
});

app.post("/api/auth/send-password-reset", async (req, res) => {
  try {
    const { email, continueUrl } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email is required" });

    if (!admin.apps.length) {
      return res.status(500).json({ message: "Firebase admin not initialized" });
    }

    const link = await admin.auth().generatePasswordResetLink(String(email), {
      url: String(continueUrl || process.env.CLIENT_URL || "http://localhost:5173"),
      handleCodeInApp: false,
    });

    await sendBrevoEmail({
      to: String(email),
      subject: "Reset your password",
      html: `
        <h2>Reset your password</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${link}">Reset Password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Send reset error:", err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
});

app.get("/api/stripe/config", (_req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return res.status(500).json({ message: "Missing STRIPE_PUBLISHABLE_KEY" });
  }
  return res.json({ publishableKey });
});

app.get("/api/coupons/validate", async (req, res) => {
  try {
    const code = String(req.query?.code || "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ message: "Coupon code required" });
    }
    if (!adminDb) {
      return res.status(500).json({ message: "Admin DB not configured" });
    }
    const docSnap = await adminDb.collection("coupons").doc(code).get();
    if (!docSnap.exists) {
      return res.status(404).json({ message: "Invalid coupon code" });
    }
    const data = docSnap.data() || {};
    if (data.active === false) {
      return res.status(400).json({ message: "Coupon is inactive" });
    }
    const percent = Number(data.percent || 0);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return res.status(400).json({ message: "Invalid coupon percentage" });
    }
    return res.json({ code, percent });
  } catch (err) {
    console.error("Coupon validate error:", err);
    return res.status(500).json({ message: "Failed to validate coupon" });
  }
});

app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured" });
    }

    const { userId, userEmail, type, credits, amount, priceId, currency, couponCode, discountPercent } = req.body;
    
    if (!userId || !userEmail) {
      return res.status(400).json({ message: "User ID and email required" });
    }

    // Use the origin from the request or fallback to environment variable
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || process.env.CLIENT_URL || "http://localhost:5173";
    const clientUrl = origin.includes('localhost') ? origin : origin;

    let sessionConfig = {
      payment_method_types: ["card"],
      mode: type === "credits" ? "payment" : "subscription",
      customer_email: userEmail,
      success_url: `${clientUrl}/?payment=success`,
      cancel_url: `${clientUrl}/payment?payment=cancelled${type === "credits" ? "&mode=credits" : ""}`,
      metadata: {
        userId,
      },
    };

    if (type === "credits") {
      // One-time credit purchase
      const creditAmount = Number(amount);
      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        return res.status(400).json({ message: "Invalid credit amount" });
      }
      sessionConfig.line_items = [{
        price_data: {
          currency: String(currency || "inr").toLowerCase(),
          product_data: {
            name: `${credits || 10000} Credits Pack`,
            description: "Credits for extra checks",
          },
          unit_amount: toStripeAmount(creditAmount, currency),
        },
        quantity: 1,
      }];
      sessionConfig.metadata.type = "credits";
      sessionConfig.metadata.credits = String(credits || 10000);
    } else {
      // Subscription
      const percent = Number(discountPercent || 0);
      const baseAmount = Number(amount);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return res.status(400).json({ message: "Invalid subscription amount" });
      }
      const discountedAmount = percent > 0
        ? Math.max(1, Number((baseAmount * (1 - percent / 100)).toFixed(2)))
        : baseAmount;

      let resolvedPriceId = percent > 0 ? undefined : (priceId || process.env.STRIPE_PRICE_ID);
      
      if (!resolvedPriceId) {
        // Create a price if not configured
        const product = await stripe.products.create({
          name: "CorrectNow Pro",
          description: "Monthly subscription",
        });
        
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: toStripeAmount(discountedAmount, currency),
          currency: String(currency || "inr").toLowerCase(),
          recurring: { interval: "month" },
        });
        
        resolvedPriceId = price.id;
      }
      
      sessionConfig.line_items = [{
        price: resolvedPriceId,
        quantity: 1,
      }];
      sessionConfig.metadata.type = "subscription";
      if (couponCode) sessionConfig.metadata.couponCode = String(couponCode);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
});

app.get("/api/models", async (_req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ListModels error:", errorText);
      return res.status(500).json({ message: "ListModels error", details: errorText });
    }

    const data = await response.json();
    return res.json({
      models: Array.isArray(data?.models) ? data.models.map((m) => m.name) : [],
    });
  } catch (err) {
    console.error("ListModels server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/detect-language", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Text is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const model = process.env.GEMINI_DETECT_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const allowed = ["en","hi","ta","te","bn","mr","gu","kn","ml","pa","ur","fa","es","fr","de","pt","it","nl","sv","no","da","fi","pl","ro","tr","el","he","id","ms","th","vi","tl","sw","ru","uk","ja","ko","zh","ar","af","cs","hu","auto"];
    const prompt = `Detect language and return ONLY JSON: {"code":"<code>"}.
Allowed codes: ${allowed.join(", ")}.
Return closest code; if unsure, "auto".
Text:\n"""${text}"""`;

    const detectKey = crypto.createHash("sha256").update(prompt).digest("hex");
    const cachedDetect = getCache(`detect:${detectKey}`);
    if (cachedDetect) {
      return res.json(cachedDetect);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Detect-language error:", errorText);
      return res.status(500).json({ message: "Detect-language error", details: errorText });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return res.status(500).json({ message: "Invalid detect-language response" });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ message: "Failed to parse detect-language response" });
    }

    const code = typeof parsed?.code === "string" ? parsed.code : "auto";
    const result = { code: allowed.includes(code) ? code : "auto" };
    setCache(`detect:${detectKey}`, result);
    return res.json(result);
  } catch (err) {
    console.error("Detect-language server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

const buildPrompt = (text, language, options = {}) => {
  const languageInstruction =
    language && language !== "auto"
      ? `Language: ${language}.`
      : "Auto-detect language.";

  const nameCorrectionsRaw = options?.nameCorrections;
  const nameCorrections = (() => {
    // Accept either { "Rajiv": "Raajiv" } or [{ from, to }, ...]
    if (Array.isArray(nameCorrectionsRaw)) {
      return nameCorrectionsRaw
        .map((x) => ({ from: String(x?.from || "").trim(), to: String(x?.to || "").trim() }))
        .filter((x) => x.from && x.to && x.from !== x.to);
    }
    if (nameCorrectionsRaw && typeof nameCorrectionsRaw === "object") {
      return Object.entries(nameCorrectionsRaw)
        .map(([from, to]) => ({ from: String(from || "").trim(), to: String(to || "").trim() }))
        .filter((x) => x.from && x.to && x.from !== x.to);
    }
    return [];
  })();

  const nameCorrectionsBlock = nameCorrections.length
    ? `
AUTHORITATIVE NAME SPELLINGS (MUST ENFORCE):
- The following name spellings are authoritative. If the input contains the "from" form, you MUST suggest the "to" form.
- This is NOT translation/transliteration; it's a strict spelling correction.
- Apply the correction consistently across the entire text.

Name corrections list:
${nameCorrections.map((p) => `- ${p.from} -> ${p.to}`).join("\n")}
`
    : "";

  return `You are a World-Class Linguistic Expert for CorrectNow.app. Your mission is to fix grammar and spelling with NEWS-GRADE precision.

STRICT INSTRUCTIONS:
1) NO FACT CHANGES: Never alter factual meaning, numbers, dates, or claims.
2) EDUCATIONAL EXPLANATIONS: Provide a brief professional reason for each fix (8-14 words).
   - Avoid confusing symbols like '+' in explanations.
   - Explanation language must match the input language.
3) NO HALLUCINATION: If you don't recognize a specific noun/entity, assume it's correct.

PROPER NOUNS / NAMES (CRITICAL):
- Identify proper nouns (people, places, parties, brands, organizations) and protect them.
- Do NOT translate/transliterate names.
- Do NOT "normalize" name spellings just because you prefer another spelling.
- EXCEPTION (allowed and required): If a proper noun is clearly misspelled (a typo) OR an authoritative name correction list is provided, you MUST suggest the corrected spelling.
  Example typo: "naesh" -> "naresh" (typo correction, not translation).
${nameCorrectionsBlock}

---

You are the World's Most Advanced AI Proofreader, comparable to Grammarly Premium.

CORE MISSION:
- Analyze the provided text and return a flawless, professional-grade version.
- Improve readability WITHOUT changing original intent or meaning.
- Be strict about grammar, spelling/typos, native fluency, and punctuation.

Focus on:
1. PERFECT GRAMMAR: Fix syntax, tense, and subject-verb agreement errors.
2. SPELLING & TYPOS: Identify and correct subtle spelling mistakes.
3. NATIVE FLUENCY: Make it sound natural to a native speaker.
4. PUNCTUATION: Fix missing/mismatched quotes, brackets, commas.
5. CONTEXTUAL FLOW: Improve flow while preserving meaning.

PROPER NOUNS / NAMES (CRITICAL, NEWS-GRADE):
- Identify proper nouns (people, places, parties, brands, orgs) and preserve them.
- BUT: If a proper noun is clearly misspelled (a typo), you MUST suggest the corrected spelling.
  Example: "naesh" → "naresh" (typo correction, not translation).
- Never translate/transliterate names. Keep the same script and casing style.
- If you are NOT confident it is a misspelling, do NOT change it.

SPECIFIC FOR TAMIL:
- Strictly follow 'Valinam Migum/Miga' rules.
- Fix run-on words (Otrumizhal) (e.g., 'இன்னும்கடுமையாக' -> 'இன்னும் கடுமையாக').
- Join postpositions correctly when natural (e.g., "எடப்பாடியுடன்", "என்றெல்லாம்").

OUTPUT FORMAT (MANDATORY):
Return ONLY a valid JSON object in this exact shape:
{
  "corrected_text": "...",
  "changes": [
    { "original": "...", "corrected": "...", "explanation": "Brief reason in the same language as input" }
  ]
}

---

You are the Senior Editor and Linguistic Engine for CorrectNow.app. Your goal is to provide flawless, professional-grade text corrections with Grammarly-level intelligence across all languages.

${languageInstruction}

UNIVERSAL LINGUISTIC RULES (Apply to ALL languages):

1. REDUNDANCY & TAUTOLOGY (Logic Check):
   - Eliminate unnecessary word repetitions and redundant phrases.
   - Examples: "return back" → "return", "free gift" → "gift"
   - Tamil: "A-um B-um iruvarum" → Remove "iruvarum" (both + both = redundant)

2. FLOW & COHERENCE (Connector Words / Discourse Markers):
  - Improve text flow by adding missing or weak connector words BETWEEN consecutive sentences/clauses
    when the logical relationship is clear but not explicitly signposted.
  - Look for these relationships: continuation, addition, contrast, cause–effect, conclusion, time sequence.
  - Suggest only when it clearly improves readability; avoid overusing connectors.
  - Preserve meaning: do NOT introduce new claims, opinions, or facts.
  - Match tone/register:
    - News/academic/formal: prefer formal connectors.
    - Casual/informal: allow conversational connectors.
  - IMPORTANT: For every connector-word suggestion, include a category label in the explanation as one of:
    Addition | Contrast | Cause–Effect | Continuation
    (Map conclusion/time-sequence/continuation into Continuation when needed.)
  - Example (Tamil): "அவர் கடுமையாக விமர்சித்தார். அவர் பின்னர் அழைப்பு ஏற்றார்." →
    "அவர் கடுமையாக விமர்சித்தார். ஆனால், அவர் பின்னர் அழைப்பு ஏற்றார்." (Contrast)

3. STRUCTURAL INTEGRITY (Word Joining/Splitting):
   - Fix errors where words are incorrectly merged or separated.
   - Tamil Sandhi: "செய்வதற்கு சமம்" → "செய்வதற்குச் சமம்" (hard consonant doubling)
  - Tamil Case Endings / Postpositions: "எடப்பாடி உடன்" → "எடப்பாடியுடன்" (join postpositions)
  - Tamil Sandhi/Clitics: "என்று எல்லாம்" → "என்றெல்லாம்" (join natural clitics)
   - English: "alot" → "a lot", "cannot" (keep as one word)

4. PUNCTUATION, QUOTES & TYPOGRAPHY (Be STRICT):
   - Treat punctuation and quotation correctness as critical (do NOT skip).
   - MANDATORY FIRST STEP: Count opening vs closing quotes/brackets in the ENTIRE text.
     * Count: " (opening) vs " (closing), ' vs ', ( vs ), [ vs ], { vs }
     * If counts don't match, you MUST flag it as an error.
     * Example: Text ending with stray " but no opening → suggest removing it.
     * Example input: 'அவர் பின்னர் அழைப்பு ஏற்றார்."' (1 closing quote, 0 opening)
       → Suggest: 'அவர் பின்னர் அழைப்பு ஏற்றார்.' (remove the unmatched ")
   - Ensure ALL quotes, parentheses, and brackets are perfectly balanced and properly nested.
   - Fix duplicated/mismatched quote marks and broken nesting.
     Examples: "''கர்ணன்''" → "'கர்ணன்'" (avoid double-single-quote artifacts)
   - Enforce clean punctuation spacing rules:
     - No extra spaces before punctuation (",", ".", ":", ";", "?", "!")
     - Exactly one space after sentence punctuation where the language uses spaces.
     - No doubled punctuation unless stylistically required; normalize "!!", "??", "..." when inappropriate.
   - Ensure sentences have appropriate ending punctuation (missing full stop/question mark).
   - Ensure commas/colons are used correctly for apposition and lists.
     Example: "சென்னை:" is acceptable for dateline style; otherwise prefer "சென்னை -" or "சென்னை:" consistently.
   - Tamil-specific strictness:
     - If a sentence opens a quote, ensure it closes before attribution verb:
       "..." என்று கூறினார் / "..." என்று பேசினார்
     - Add comma after formal discourse markers when appropriate: "ஆனால்,", "எனவே,", "மேலும்,"
   - English-specific strictness:
     - Add comma after formal discourse markers when appropriate: "However,", "Therefore,", "Moreover,"

5. VOCABULARY VARIATION (Repetition Avoidance):
   - Identify and replace repetitive verbs/adjectives in adjacent sentences with contextually appropriate synonyms.
   - Example: If "பேசியிருந்தார்" appears twice nearby, suggest "விமர்சித்திருந்தார்" for second instance.

6. GRAMMATICAL PRECISION:
   - Fix subject-verb agreement, tense inconsistencies, and case endings/suffixes.
   - Tamil Vibhakti: Ensure nouns and postpositions are joined per morphophonology rules.
  - Tamil Accusative before comparisons: If using "போல/மாதிரி" for comparison,
    apply the required case ending when needed.
    Example: "பகையாளி போல" → "பகையாளியைப் போல" (ஐ-வேற்றுமை)
   
   ENGLISH-SPECIFIC GRAMMAR RULES (MANDATORY):
   - CAPITALIZATION: Always capitalize the pronoun "I" everywhere, including after conjunctions
     * Examples: "i went" → "I went", "but i was" → "but I was", "and i decided" → "and I decided"
   - VERB TENSE CONSISTENCY: Maintain consistent past/present/future tense throughout
     * Past: "decide" → "decided", "wakes" → "woke", "miss" → "missed", "telling" → "told"
     * Progressive: "i feeling" → "I felt", "was starting" → "started" (for simple past actions)
     * Conditional/Subjunctive: When expressing hypothetical future (promises, intentions in past narrative),
       use "would" instead of "will" for consistency with past tense context
       Example: Past narrative: "I promised that I will study" → "I promised that I would study"
   - ARTICLE USAGE: Use "an" before vowel sounds, "a" before consonant sounds
     * Examples: "a online" → "an online", "a hour" → "an hour", "a university" (correct - starts with /j/ sound)
   - INFINITIVE vs GERUND: Use "to + verb" (infinitive) for purpose, not "for + verb"
     * Examples: "for improve" → "to improve", "for study" → "to study"
   - SINGULAR/PLURAL AGREEMENT: Match number with quantity words
     * Examples: "many lesson" → "many lessons", "one skill" → "skills" (when referring to multiple)
   - AUXILIARY VERBS: Use proper helping verbs in negatives and questions
     * Examples: "i not follow" → "I did not follow", "you not know" → "you do not know"
   - AM/PM FORMATTING: Use proper time notation
     * Examples: "9 am" → "9 a.m." or "9 AM", "3 pm" → "3 p.m." or "3 PM"
   - EVERYDAY vs EVERY DAY: Distinguish adjective form from adverbial phrase
     * "everyday" (adjective) = ordinary, common: "everyday problems", "everyday life"
     * "every day" (adverb phrase) = each day, daily: "I study every day", "happens every day"
     * Examples: "I go to school everyday" → "I go to school every day"
   - COMMA PLACEMENT (Critical):
     * After introductory phrases: "Last week, I decided...", "However, I promised..."
     * Before conjunctions joining independent clauses: "I was nervous, but I tried"
     * After transitional words: "Therefore, the plan...", "Moreover, he said..."
     * In lists: "tired, hungry, and upset"

7. WORD SPACING (Otrumizhal):
   - Separate run-on words and normalize spacing.
   - Tamil: "இன்னும்கடுமையாக" → "இன்னும் கடுமையாக"
   - Remove excessive spaces between words.

8. TYPO / SPELLING & TRUNCATION DETECTION (All languages):
  - Actively look for obvious typos, missing letters, swapped letters, and clipped words.
  - If a word looks incomplete or nonstandard in context, correct it to the most likely intended word.
  - Examples (English): "definately" → "definitely", "teh" → "the".
  - Examples (Tamil):
    - "மழ்ச்சியையும்" → "மகிழ்ச்சியையும்" (typo in common word)
    - "சிறந் வசனம்" → "சிறந்த வசனம்" (clipped adjective)
    - "சிறந்தத படம்" → "சிறந்த படம்" (remove stray suffix/extra letter)
    - "இதைடுத்து" → "இதையடுத்து" (orthographic join)

9. LANGUAGE-SPECIFIC REFINEMENTS:
   - Tamil: Apply Valinam Migum/Miga rules (hard consonants: க், ச், த், ப்)
   - English: Fix slang ("u" → "you", "r" → "are"), contractions, and informal texting.
   - Apply proper capitalization, sentence boundaries, and common misspellings.

10. CONTEXTUAL WORD CHOICE (Domain-appropriate wording):
  - Prefer the most natural, commonly used term in the given domain/context.
  - Do NOT invent facts; only improve word choice when meaning is preserved.
  - Tamil (politics): "கூட்டு" → "கூட்டணி" when referring to political alliances.
  - English collocation: "do a mistake" → "make a mistake".

CRITICAL EXECUTION REQUIREMENTS:
- You MUST analyze EVERY SINGLE LINE from first to last - scan the ENTIRE text systematically.
- Do NOT stop after finding a few errors - continue processing ALL remaining lines.
- Process line by line methodically - no skipping or truncation.

PRESERVATION RULES:
- Maintain original tone and style - do NOT rewrite or add new information.
- Strictly preserve proper nouns (names of people, places, brands).
- Fix errors WITHOUT changing the intended meaning.

OUTPUT GUIDELINES:
- For each change, provide a clear, educational explanation (8-14 words) in the same language as the input.
- Explain the "Why" (ஏன்?) behind major fixes to educate the user.
- If no changes needed, return original text and empty changes array.

Return ONLY valid JSON in this exact format:
{
  "corrected_text": "...",
  "changes": [
    { "original": "...", "corrected": "...", "explanation": "..." }
  ]
}

Text to analyze:
"""
${text}
"""`;
};

const parseGeminiJson = (raw) => {
  if (!raw || typeof raw !== "string") return null;

  const extractBalancedJson = (value) => {
    const text = value;
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
    return null;
  };

  const sanitize = (value) => {
    const noFence = value
      .replace(/^\uFEFF/, "")
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();

    const noControlChars = noFence.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const escapeNewlinesInStrings = (text) => {
      let out = "";
      let inString = false;
      let escapeNext = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (escapeNext) {
          out += ch;
          escapeNext = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          if (inString) escapeNext = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          out += ch;
          continue;
        }
        if (inString && (ch === "\n" || ch === "\r")) {
          out += "\\n";
          continue;
        }
        out += ch;
      }
      return out;
    };
    const escaped = escapeNewlinesInStrings(noControlChars);
    const withoutTrailingCommas = escaped.replace(/,(\s*[}\]])/g, "$1");
    return withoutTrailingCommas;
  };

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const cleaned = sanitize(raw);
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  const balanced = extractBalancedJson(cleaned);
  if (balanced) {
    parsed = tryParse(balanced);
    if (parsed) return parsed;
  }

  const fallbackExtract = (value) => {
    // Extract corrected_text - handle both complete and incomplete strings
    let corrected_text = "";
    const correctedMatch = value.match(/"corrected_text"\s*:\s*"([\s\S]*?)"\s*(?:,|\n|$)/);
    if (correctedMatch) {
      corrected_text = correctedMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    
    // Extract changes array - be aggressive with incomplete entries
    const changes = [];
    
    // Match complete change objects (all 3 fields present)
    const completeRegex = /"original"\s*:\s*"([\s\S]*?)"\s*,\s*"corrected"\s*:\s*"([\s\S]*?)"\s*,\s*"explanation"\s*:\s*"([\s\S]*?)"\s*[,}]/g;
    let match;
    while ((match = completeRegex.exec(value)) !== null) {
      changes.push({
        original: match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
        corrected: match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
        explanation: match[3].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      });
    }
    
    // Try to extract incomplete change objects (2 fields only - missing explanation or cut off)
    if (changes.length === 0) {
      const partialRegex = /"original"\s*:\s*"([\s\S]*?)"\s*,\s*"corrected"\s*:\s*"([\s\S]*?)"\s*(?:,|$)/g;
      let partialMatch;
      while ((partialMatch = partialRegex.exec(value)) !== null) {
        changes.push({
          original: partialMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
          corrected: partialMatch[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
          explanation: "Grammar or spelling correction",
        });
      }
    }
    
    // As last resort, try to extract at least the corrected_text by looking for the opening quote
    if (!corrected_text && !changes.length) {
      const textOnlyMatch = value.match(/"corrected_text"\s*:\s*"([\s\S]*)/);
      if (textOnlyMatch) {
        // Take everything after the opening quote, remove trailing incomplete JSON
        let extracted = textOnlyMatch[1];
        // Try to find the end quote (might not exist if truncated)
        const endQuote = extracted.indexOf('",');
        if (endQuote > -1) {
          extracted = extracted.substring(0, endQuote);
        }
        corrected_text = extracted.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    
    if (corrected_text || changes.length) {
      return { corrected_text, changes };
    }
    return null;
  };

  parsed = fallbackExtract(cleaned);
  if (parsed) return parsed;

  return null;
};

// Post-processing safety net: detect unbalanced quotes that Gemini missed
const addMissingQuoteChecks = (text, changes) => {
  const augmented = [...changes];
  
  // Count opening vs closing double quotes (straight and smart)
  const doubleQuoteOpen = (text.match(/["\u201C\u201E]/g) || []).length;
  const doubleQuoteClose = (text.match(/["\u201D]/g) || []).length;
  
  // Count opening vs closing single quotes (straight and smart)
  const singleQuoteOpen = (text.match(/['\u2018\u201A]/g) || []).length;
  const singleQuoteClose = (text.match(/['\u2019]/g) || []).length;
  
  // Check if there's already a suggestion about quotes
  const hasQuoteFix = changes.some(c => 
    c.explanation && 
    (c.explanation.includes('quote') || c.explanation.includes('மேற்கோள்') || c.explanation.includes('"'))
  );
  
  if (!hasQuoteFix) {
    // If unbalanced double quotes
    if (doubleQuoteOpen !== doubleQuoteClose) {
      const diff = doubleQuoteClose - doubleQuoteOpen;
      if (diff > 0) {
        // More closing than opening - likely stray quote at end
        const lastQuoteIdx = Math.max(
          text.lastIndexOf('"'),
          text.lastIndexOf('\u201D')
        );
        if (lastQuoteIdx > 0) {
          const contextStart = Math.max(0, lastQuoteIdx - 15);
          const contextEnd = Math.min(text.length, lastQuoteIdx + 15);
          const before = text.slice(contextStart, lastQuoteIdx);
          const quoteChar = text[lastQuoteIdx];
          const after = text.slice(lastQuoteIdx + 1, contextEnd);
          augmented.push({
            original: before + quoteChar + after,
            corrected: before + after,
            explanation: "மேற்கோள் குறி சமநிலையற்றது; இணையற்ற மூடும் மேற்கோள் குறி அகற்றப்பட்டது. (Unbalanced quote removed)"
          });
        }
      }
    }
    
    // If unbalanced single quotes (only if significant count)
    if (singleQuoteOpen !== singleQuoteClose && singleQuoteOpen > 0) {
      const diff = singleQuoteClose - singleQuoteOpen;
      if (Math.abs(diff) === 1 && diff > 0) {
        const lastQuoteIdx = Math.max(
          text.lastIndexOf("'"),
          text.lastIndexOf('\u2019')
        );
        if (lastQuoteIdx > 0) {
          const contextStart = Math.max(0, lastQuoteIdx - 15);
          const contextEnd = Math.min(text.length, lastQuoteIdx + 15);
          const before = text.slice(contextStart, lastQuoteIdx);
          const quoteChar = text[lastQuoteIdx];
          const after = text.slice(lastQuoteIdx + 1, contextEnd);
          augmented.push({
            original: before + quoteChar + after,
            corrected: before + after,
            explanation: "ஒற்றை மேற்கோள் குறி சமநிலையற்றது; அகற்றப்பட்டது. (Unbalanced single quote removed)"
          });
        }
      }
    }
  }
  
  return augmented;
};

/**
 * Extension: Get user statistics
 */
app.get("/api/user/stats", async (req, res) => {
  try {
    // Verify auth token
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    if (!authToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decodedToken = await verifyAuthToken(authToken);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    const userId = decodedToken.uid;
    const email = decodedToken.email;
    
    // Get user data
    const userData = await getUserData(userId);
    if (!userData) {
      // Return default for new users
      return res.json({
        userId,
        email,
        planType: 'free',
        dailyChecksUsed: 0,
        dailyLimit: 5,
        creditsRemaining: 5
      });
    }
    
    // Calculate credits
    const nowMs = Date.now();
    const planField = String(userData.plan || '').toLowerCase();
    const wordLimit = Number(userData.wordLimit) || 0;
    
    // Pro users have wordLimit >= 50,000 or plan = 'pro'
    // Free users typically have 5,000 or less
    const isPro = wordLimit >= 50000 || planField === 'pro';
    
    // Get credit information
    const creditsUsed = Number(userData.creditsUsed || 0);
    
    // Use actual credits from database, or default based on plan
    // Free users: use their actual credits (typically 5000)
    // Pro users: default to 50000 if not set
    const baseCredits = Number(userData.credits) || (isPro ? 50000 : 5000);
    
    // Handle addon credits
    const rawAddonCredits = Number(userData.addonCredits || 0);
    const addonExpiry = userData.addonCreditsExpiryAt
      ? new Date(String(userData.addonCreditsExpiryAt))
      : null;
    const addonValid = addonExpiry && !Number.isNaN(addonExpiry.getTime())
      ? addonExpiry.getTime() > nowMs
      : false;
    const validAddonCredits = addonValid && Number.isFinite(rawAddonCredits) ? rawAddonCredits : 0;
    
    // Calculate total credits
    const totalCredits = Number(baseCredits) + validAddonCredits;
    const creditsRemaining = Math.max(0, totalCredits - creditsUsed);
    
    res.json({
      userId,
      email,
      planType: isPro ? 'pro' : 'free',
      dailyChecksUsed: creditsUsed,
      dailyLimit: totalCredits,
      creditsRemaining: creditsRemaining
    });
  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh authentication token
app.post("/api/refresh-token", async (req, res) => {
  try {
    // Verify current auth token
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    if (!authToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decodedToken = await verifyAuthToken(authToken);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get fresh token from Firebase (this automatically extends the session)
    // The client should have the Firebase SDK get a fresh token
    // Since we're on the server, we'll return the same token but let the client know it's valid
    // In a production app, you'd use Firebase Admin SDK to create a custom token
    
    // For now, we'll just verify the token is valid and return success
    // The extension should request a new token from the website's Firebase instance
    res.json({ 
      token: authToken, // In production, generate a new token here
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error) {
    console.error('❌ Error refreshing token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post("/api/proofread", async (req, res) => {
  try {
    const { text, language, userId: bodyUserId } = req.body || {};

    // Check for Firebase auth token (Priority 1: Logged-in users)
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    
    let authenticatedUser = null;
    let userId = bodyUserId;

    if (authToken) {
      // Verify Firebase token
      const decodedToken = await verifyAuthToken(authToken);
      if (decodedToken) {
        authenticatedUser = decodedToken;
        userId = decodedToken.uid;
        console.log('✅ Authenticated user:', userId);
        
        // Get user data and check entitlements
        const userData = await getUserData(userId);
        const entitlements = getUserEntitlements(userData);
        
        console.log('📊 User entitlements:', entitlements);
        
        // Track usage
        await incrementUsageCount(userId);
        
        // Check if user exceeded free limit (only for free users)
        if (!entitlements.isPro && entitlements.checksUsed >= entitlements.checksLimit) {
          return res.status(429).json({
            message: "Free limit reached. Upgrade to Pro for unlimited checks.",
            requiresUpgrade: true,
            plan: entitlements.plan,
            checksRemaining: 0,
            checksUsed: entitlements.checksUsed,
            checksLimit: entitlements.checksLimit
          });
        }
        
        // Set usage headers for frontend
        res.setHeader('X-Checks-Used', entitlements.checksUsed.toString());
        res.setHeader('X-Checks-Limit', entitlements.checksLimit === -1 ? 'unlimited' : entitlements.checksLimit.toString());
      } else {
        console.log('⚠️ Invalid auth token');
      }
    }

    // If not authenticated, check for extension API key (Priority 2: Guest users with extension)
    const extensionKey = String(
      req.headers["x-api-key"] || 
      req.headers["x-correctnow-api-key"] || 
      ""
    ).trim();
    const expectedKey = String(process.env.CORRECTNOW_EXTENSION_API_KEY || "").trim();
    const bypassFreeLimit = !!expectedKey && extensionKey === expectedKey;
    
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress;

    // Rate limiting for non-authenticated users (extension key can bypass)
    if (!authenticatedUser && !bypassFreeLimit) {
      const now = Date.now();
      const ipData = ipCheckCount.get(clientIp);
      
      // Reset if past reset time
      if (ipData && now > ipData.resetAt) {
        ipCheckCount.delete(clientIp);
      }
      
      const currentData = ipCheckCount.get(clientIp);
      
      if (currentData && currentData.count >= IP_CHECK_LIMIT) {
        return res.status(429).json({ 
          message: "Free limit reached. Please sign in to continue checking.",
          requiresAuth: true,
          checksRemaining: 0
        });
      }
      
      // Update count
      const resetAt = now + (IP_RESET_HOURS * 60 * 60 * 1000);
      ipCheckCount.set(clientIp, {
        count: (currentData?.count || 0) + 1,
        resetAt: currentData?.resetAt || resetAt
      });
      
      const checksRemaining = IP_CHECK_LIMIT - (currentData?.count || 0) - 1;
      res.setHeader('X-Checks-Remaining', checksRemaining.toString());
    }
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Text is required" });
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length > WORD_LIMIT) {
      return res.status(400).json({ message: `Text exceeds ${WORD_LIMIT} words` });
    }

    let freeDailyContext = null;
    let creditsContext = null;
    if (userId && adminDb) {
      try {
        const userRef = adminDb.collection("users").doc(String(userId));
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const data = userSnap.data() || {};
          const planField = String(data.plan || "").toLowerCase();
          const isPro = planField === "pro" || Number(data.wordLimit) >= 5000;

          const nowMs = Date.now();
          const storedCreditsUsed = Number(data.creditsUsed || 0);
          const creditsUsed = Number.isFinite(storedCreditsUsed) ? storedCreditsUsed : 0;
          const baseCreditsRaw = data.credits ?? (isPro ? 50000 : 0);
          const baseCredits = Number.isFinite(Number(baseCreditsRaw)) ? Number(baseCreditsRaw) : 0;
          const rawAddonCredits = Number(data.addonCredits || 0);
          const addonExpiry = data.addonCreditsExpiryAt
            ? new Date(String(data.addonCreditsExpiryAt))
            : null;
          const addonValid = addonExpiry && !Number.isNaN(addonExpiry.getTime())
            ? addonExpiry.getTime() > nowMs
            : false;
          const validAddonCredits = addonValid && Number.isFinite(rawAddonCredits) ? rawAddonCredits : 0;
          const totalCredits = baseCredits + validAddonCredits;
          const creditsRemaining = totalCredits > 0 ? Math.max(0, totalCredits - creditsUsed) : null;
          const canSpendCredits = totalCredits > 0;

          if (!isPro) {
            const todayKey = new Date().toISOString().slice(0, 10);
            const storedDay = String(data.freeDailyDate || "");
            const storedUsed = Number(data.freeDailyUsed || 0);
            const usedToday = storedDay === todayKey ? storedUsed : 0;
            const remaining = Math.max(0, FREE_DAILY_WORD_LIMIT - usedToday);

            const ipKey = `${clientIp || "unknown"}|${todayKey}`;
            const ipEntry = freeIpWordCount.get(ipKey);
            const ipNow = Date.now();
            if (ipEntry && ipNow > ipEntry.resetAt) {
              freeIpWordCount.delete(ipKey);
            }
            const currentIp = freeIpWordCount.get(ipKey);
            const ipUsed = currentIp ? currentIp.count : 0;
            const ipRemaining = Math.max(0, FREE_DAILY_WORD_LIMIT - ipUsed);

            if (words.length > remaining || words.length > ipRemaining) {
              // After the daily free quota is exhausted, allow add-on credits to be used.
              if (canSpendCredits) {
                if (words.length > (creditsRemaining ?? 0)) {
                  res.setHeader("X-Daily-Words-Remaining", "0");
                  res.setHeader("X-Credits-Remaining", String(creditsRemaining ?? 0));
                  return res.status(429).json({
                    message: "Not enough credits. Please buy add-on credits to continue.",
                    requiresUpgrade: true,
                    dailyRemaining: 0,
                    creditsRemaining: creditsRemaining ?? 0,
                  });
                }
                creditsContext = {
                  userRef,
                  creditsUsedNext: creditsUsed + words.length,
                  creditsRemainingNext: Math.max(0, totalCredits - (creditsUsed + words.length)),
                };
                res.setHeader("X-Daily-Words-Remaining", "0");
                res.setHeader("X-Credits-Remaining", String(creditsRemaining));
              } else {
                res.setHeader("X-Daily-Words-Remaining", "0");
                return res.status(429).json({
                  message: "Daily 300 words per day for free users",
                  requiresUpgrade: true,
                  dailyRemaining: 0,
                });
              }
            } else {
              freeDailyContext = {
                userRef,
                todayKey,
                usedNext: usedToday + words.length,
                remainingNext: Math.max(0, FREE_DAILY_WORD_LIMIT - (usedToday + words.length)),
                ipKey,
                ipUsedNext: ipUsed + words.length,
              };
              res.setHeader("X-Daily-Words-Remaining", remaining.toString());
            }
          } else {
            // Pro users: enforce their credit pool if present.
            if (canSpendCredits) {
              if (words.length > (creditsRemaining ?? 0)) {
                res.setHeader("X-Credits-Remaining", String(creditsRemaining ?? 0));
                return res.status(429).json({
                  message: "Not enough credits. Please buy add-on credits to continue.",
                  requiresUpgrade: true,
                  creditsRemaining: creditsRemaining ?? 0,
                });
              }
              creditsContext = {
                userRef,
                creditsUsedNext: creditsUsed + words.length,
                creditsRemainingNext: Math.max(0, totalCredits - (creditsUsed + words.length)),
              };
              res.setHeader("X-Credits-Remaining", String(creditsRemaining));
            }
          }
        }
      } catch (error) {
        console.error("Failed to enforce free daily limit:", error);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = buildPrompt(text, language, {
      nameCorrections: req.body?.nameCorrections,
    });

    const callGemini = async (maxTokens) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 0.6,
            responseMimeType: "application/json",
            maxOutputTokens: maxTokens,
          },
          systemInstruction: {
            parts: [{ text: "Return ONLY valid JSON. Analyze EVERY line of the input text thoroughly. Do not add extra text." }],
          },
        }),
      });
      return response;
    };

    let response = await callGemini(8192);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error:", errorText);
      return res.status(500).json({ message: "API error" });
    }

    let data = await response.json();
    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      console.error("API response missing content:", JSON.stringify(data));
      return res.status(500).json({ message: "Invalid API response" });
    }
    let parsed = parseGeminiJson(raw);
    if (!parsed) {
      // Retry once with maximum token limit if parsing failed
      console.log("First parse failed, retrying with 16384 tokens...");
      response = await callGemini(16384);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error (retry):", errorText);
        return res.status(500).json({ message: "API error" });
      }
      data = await response.json();
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      parsed = parseGeminiJson(raw);
    }
    if (!parsed) {
      console.error("Failed to parse API response:", raw);
      return res.status(500).json({ message: "Failed to parse API response" });
    }

    const correctedText =
      typeof parsed.corrected_text === "string" && parsed.corrected_text.trim().length
        ? parsed.corrected_text
        : text;

    let changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((change) => {
          if (!change || typeof change !== "object") return false;
          if (typeof change.original !== "string" || change.original.length === 0) return false;
          if (typeof change.corrected !== "string") return false;
          return true;
        })
      : [];

    // Apply post-processing safety net to catch unbalanced quotes
    changes = addMissingQuoteChecks(text, changes);

    const result = {
      corrected_text: correctedText,
      changes,
    };
    if (freeDailyContext) {
      await freeDailyContext.userRef.set(
        {
          freeDailyDate: freeDailyContext.todayKey,
          freeDailyUsed: freeDailyContext.usedNext,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const resetAt = Date.now() + (IP_RESET_HOURS * 60 * 60 * 1000);
      freeIpWordCount.set(freeDailyContext.ipKey, {
        count: freeDailyContext.ipUsedNext,
        resetAt,
      });
      res.setHeader("X-Daily-Words-Remaining", String(freeDailyContext.remainingNext));
    }

    if (creditsContext) {
      await creditsContext.userRef.set(
        {
          creditsUsed: creditsContext.creditsUsedNext,
          creditsUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      res.setHeader("X-Credits-Used", String(creditsContext.creditsUsedNext));
      res.setHeader("X-Credits-Remaining", String(creditsContext.creditsRemainingNext));
    }
    return res.json(result);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Serve frontend in production (or when dist exists)
if (existsSync(distPath)) {
  app.get("/sitemap.xml", (req, res) => {
    const sitemapPath = existsSync(path.join(distPath, "sitemap.xml"))
      ? path.join(distPath, "sitemap.xml")
      : path.join(publicPath, "sitemap.xml");
    return res.sendFile(sitemapPath);
  });

  app.get("/robots.txt", (req, res) => {
    const robotsPath = existsSync(path.join(distPath, "robots.txt"))
      ? path.join(distPath, "robots.txt")
      : path.join(publicPath, "robots.txt");
    return res.sendFile(robotsPath);
  });

  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`CorrectNow API running on http://localhost:${PORT}`);
});
