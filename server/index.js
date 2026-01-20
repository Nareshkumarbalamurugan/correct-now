import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Razorpay from "razorpay";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");

app.use(cors());

app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), (req, res) => {
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
    console.log("Razorpay webhook:", event?.event || "unknown");
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
    const amount = Math.round(amountInRupees * 100);
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { plan: "pro" },
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
    let planId = requestedPlanId || process.env.RAZORPAY_PLAN_ID;

    if (!planId) {
      const plan = await razorpay.plans.create({
        period: "monthly",
        interval: 1,
        item: {
          name: "CorrectNow Pro",
          amount: 50000,
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

    const allowed = ["en","hi","ta","te","bn","mr","gu","kn","ml","pa","es","fr","de","pt","it","ru","ja","ko","zh","ar","auto"];
    const prompt = `Detect the language of the text and return ONLY a JSON object with one field "code".
  Allowed codes: ${allowed.join(", ")}.
  Return the closest matching code. If unsure, return "auto".
  Important: Distinguish French vs Spanish carefully.
  - French often includes: "je", "tu", "être", "réveillé", "bureau", "réunion", "très", accents (à â ç é è ê ë î ï ô ù û ü).
  - Spanish often includes: "yo", "tú", "porque", "reunión", "oficina", "muy", and ¿ ¡ punctuation.
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
