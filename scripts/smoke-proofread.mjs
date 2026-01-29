// Usage:
//   node scripts/smoke-proofread.mjs --base http://localhost:8787 --userId <uid> --text "hello world"
// Notes:
// - This hits your running server /api/proofread.
// - For free users: first 300 words/day are free; after that, add-on credits are used if available.

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const base = getArg("base", "http://localhost:8787");
const userId = getArg("userId", "");
const text = getArg("text", "This is a test sentence for CorrectNow.");
const language = getArg("language", "en");

if (!userId) {
  console.error("Missing --userId");
  process.exit(1);
}

const url = new URL("/api/proofread", base).toString();

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text, language, userId }),
});

const headers = {
  dailyRemaining: res.headers.get("X-Daily-Words-Remaining"),
  creditsRemaining: res.headers.get("X-Credits-Remaining"),
  creditsUsed: res.headers.get("X-Credits-Used"),
  checksRemaining: res.headers.get("X-Checks-Remaining"),
};

const bodyText = await res.text();
let body;
try {
  body = bodyText ? JSON.parse(bodyText) : null;
} catch {
  body = bodyText;
}

console.log(JSON.stringify({ ok: res.ok, status: res.status, headers, body }, null, 2));
