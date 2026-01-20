import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Razorpay from "razorpay";
import crypto from "crypto";
import admin from "firebase-admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");

const initAdminDb = () => {
  try {
    if (!admin.apps.length) {
      // Try to load from file first
      const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
      if (existsSync(serviceAccountPath)) {
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
    return admin.firestore();
  } catch (err) {
    console.error("Firebase admin init error:", err);
    return null;
  }
};

const adminDb = initAdminDb();

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

app.use(cors());

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
          wordLimit: 2000,
          credits: 50000,
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

app.use(express.json({ limit: "1mb" }));

const WORD_LIMIT = 2000;

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

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

    const amountInRupees = Number(req.body?.amount ?? 500);
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
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const requestedPlanId = req.body?.planId;
    const requestedPeriod = String(req.body?.period || "monthly");
    const period = ["daily", "weekly", "monthly", "yearly"].includes(requestedPeriod)
      ? requestedPeriod
      : "monthly";
    const interval = Math.max(1, Number(req.body?.interval ?? 1));
    let planId = requestedPlanId || process.env.RAZORPAY_PLAN_ID;

    if (!planId) {
      const plan = await razorpay.plans.create({
        period,
        interval,
        item: {
          name: "CorrectNow Pro",
          amount: 100,
          currency: "INR",
          description: "Monthly subscription",
        },
      });
      planId = plan.id;
    }

    const totalCount = Number(req.body?.totalCount ?? 12);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { plan: "pro" },
    });

    return res.json(subscription);
  } catch (err) {
    console.error("Razorpay subscription error:", err);
    return res.status(500).json({ message: "Failed to create subscription" });
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
    const prompt = `Detect the language of the text and return ONLY a JSON object with one field "code".
  Allowed codes: ${allowed.join(", ")}.
  Return the closest matching code. If unsure, return "auto".
  Important: Distinguish closely related languages carefully.
  Examples that commonly look like English (DO NOT return "en" for these):
  - French: "Ce document contient des informations importantes concernant l’organisation du système."
  - German: "Dieses Dokument erklärt die Struktur und Funktion des Organisationssystems."
  - Dutch: "Dit document beschrijft de structuur en organisatie van het systeem."
  - Afrikaans: "Hierdie dokument verduidelik die struktuur en funksie van die organisasie."
  - Spanish: "Este documento explica la estructura y organización del sistema."
  - Portuguese: "Este documento explica a estrutura e organização do sistema."
  - Italian: "Questo documento spiega la struttura e l’organizzazione del sistema."
  Very confusing for detectors:
  - Norwegian: "Dette dokumentet forklarer strukturen og organiseringen av systemet."
  - Swedish: "Detta dokument förklarar strukturen och organisationen av systemet."
  - Danish: "Dette dokument forklarer strukturen og organisationen af systemet."
  - Romanian: "Acest document explică structura și organizarea sistemului."
  - Czech: "Tento dokument vysvětluje strukturu a organizaci systému."
  - Polish: "Ten dokument wyjaśnia strukturę i organizację systemu."
  - Hungarian: "Ez a dokument elmagyarázza a rendszer struktúráját és szervezését."
  Asian languages in Latin script:
  - Indonesian: "Dokumen ini menjelaskan struktur dan organisasi sistem."
  - Malay: "Dokumen ini menerangkan struktur dan organisasi sistem."
  - Filipino/Tagalog: "Ipinapaliwanag ng dokumentong ito ang istruktura at organisasyon ng sistema."
  Control languages (NEVER English):
  - Tamil: "இந்த ஆவணம் அமைப்பின் கட்டமைப்பை விளக்குகிறது."
  - Hindi: "यह दस्तावेज़ प्रणाली की संरचना को समझाता है।"
  - Arabic: "تشرح هذه الوثيقة هيكل وتنظيم النظام."
  - Chinese: "本文件解释了系统的结构和组织。"
  - French often includes: "je", "tu", "être", "réveillé", "bureau", "réunion", "très", accents (à â ç é è ê ë î ï ô ù û ü).
  - Spanish often includes: "yo", "tú", "porque", "reunión", "oficina", "muy", and ¿ ¡ punctuation.
  - Portuguese often includes: "você", "não", "obrigado", "amanhã".
  - Turkish includes: ç, ğ, ı, ö, ş, ü and words like "teşekkür".
  - Polish includes: ą, ć, ę, ł, ń, ó, ś, ź, ż.
  - Romanian includes: ă, â, î, ș, ț.
  - Hindi/Marathi share script; prefer Marathi for common Marathi words.
  - Urdu/Persian use Arabic script; use common Urdu/Persian words to distinguish.
  - Only return Tagalog (tl) when multiple Tagalog words appear (e.g., "salamat", "ikaw", "hindi", "bukas", "ngayon").
  - If text is generic Latin script without strong language-specific words, prefer "en".
  Text:\n"""${text}"""`;

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
    return res.json({ code: allowed.includes(code) ? code : "auto" });
  } catch (err) {
    console.error("Detect-language server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

const buildPrompt = (text, language) => {
  const languageInstruction =
    language && language !== "auto"
      ? `Language: ${language}.`
      : "Auto-detect language.";

  return `You are a senior professional editor providing publication-ready proofreading.
${languageInstruction}
Task: Produce a clean, professional version with correct grammar, punctuation, and clarity.
Rules:
- Fix ALL errors: spelling, grammar, punctuation, verb tenses, articles, prepositions, subject-verb agreement.
- Improve awkward phrasing and non-native expressions for natural fluency.
- Enhance sentence structure and flow while keeping meaning and tone unchanged.
- Do NOT add new facts, change names, or alter numbers.
- Keep the original voice (formal/informal) and avoid unnecessary rewriting.
- For Tamil: Keep natural spoken style; do NOT translate to formal literary Tamil.
- For mixed language text (Tanglish): Keep code-switching natural but fix grammar around it.
- List EVERY correction in the changes array, even minor punctuation.
- Each changes.original must be an exact substring from the input text.
- Explanations must be concise (max 12 words) and describe the fix.
- If no corrections are needed, return corrected_text identical to input and an empty changes array.
Return ONLY valid JSON in this format:
{
  "corrected_text": "...",
  "changes": [
    { "original": "...", "corrected": "...", "explanation": "..." }
  ]
}
Text:
"""
${text}
"""`;
};

app.post("/api/proofread", async (req, res) => {
  try {
    const { text, language } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "Text is required" });
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length > WORD_LIMIT) {
      return res.status(400).json({ message: `Text exceeds ${WORD_LIMIT} words` });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Missing GEMINI_API_KEY" });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-pro";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(text, language) }],
          },
        ],
        generationConfig: {
          temperature: 0,
          topP: 0.9,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
        systemInstruction: {
          parts: [{ text: "Return the JSON response directly in the output. Do not use internal reasoning mode." }],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return res.status(500).json({ message: "Gemini API error", details: errorText });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      console.error("Gemini response missing content:", JSON.stringify(data));
      return res.status(500).json({ message: "Invalid Gemini response" });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", raw, parseError);
      return res.status(500).json({ message: "Failed to parse Gemini response" });
    }

    const correctedText =
      typeof parsed.corrected_text === "string" && parsed.corrected_text.trim().length
        ? parsed.corrected_text
        : text;

    const changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((change) => {
          if (!change || typeof change !== "object") return false;
          if (typeof change.original !== "string" || change.original.length === 0) return false;
          if (typeof change.corrected !== "string") return false;
          return text.includes(change.original);
        })
      : [];

    return res.json({
      corrected_text: correctedText,
      changes,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Serve frontend in production (or when dist exists)
if (existsSync(distPath)) {
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
