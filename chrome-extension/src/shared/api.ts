import type { ProofreadRequest, ProofreadResponse } from "./types";

const resolveProofreadUrl = (apiBaseUrl: string): string => {
  const raw = String(apiBaseUrl || "").trim();
  if (!raw) {
    throw new Error("Missing API Base URL");
  }

  // Allow users to paste without a scheme (e.g. localhost:8787)
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
  const looksLocalhost =
    raw.startsWith("localhost") ||
    raw.startsWith("127.0.0.1") ||
    raw.startsWith("0.0.0.0") ||
    raw.startsWith("[::1]") ||
    raw.startsWith("::1");
  const defaultScheme = looksLocalhost ? "http" : "https";
  const withScheme = hasScheme ? raw : `${defaultScheme}://${raw}`;
  const url = new URL(withScheme);

  const path = url.pathname || "/";
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;

  // Accept either base URL or full endpoint.
  if (normalizedPath === "" || normalizedPath === "/") {
    url.pathname = "/api/proofread";
  } else if (normalizedPath === "/api") {
    url.pathname = "/api/proofread";
  } else if (normalizedPath === "/api/proofread") {
    url.pathname = "/api/proofread";
  } else if (normalizedPath.includes("/api/proofread")) {
    url.pathname = "/api/proofread";
  } else {
    // Default to the expected endpoint for this project.
    url.pathname = "/api/proofread";
  }

  url.search = "";
  url.hash = "";
  return url.toString();
};

export const proofread = async (
  apiBaseUrl: string,
  req: ProofreadRequest,
  apiKey?: string
): Promise<ProofreadResponse> => {
  const url = resolveProofreadUrl(apiBaseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = String(apiKey || "").trim();
  if (key) headers["X-CorrectNow-Api-Key"] = key;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: req.text, language: req.language }),
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");

    // Prefer a JSON error message if the server returned one.
    try {
      const parsed = JSON.parse(rawText) as any;
      if (parsed && typeof parsed.message === "string") {
        throw new Error(parsed.message);
      }
    } catch {
      // ignore JSON parse errors
    }

    const lower = rawText.toLowerCase();
    if (lower.includes("<!doctype html") || lower.includes("<html")) {
      throw new Error(
        `API URL is pointing to a website (HTML), not the CorrectNow API. Set "API Base URL" to http://localhost:8787 (dev) or your deployed API host.`
      );
    }

    throw new Error(rawText || `Proofread request failed (${response.status})`);
  }

  const data = (await response.json()) as ProofreadResponse;
  if (!data || typeof data.corrected_text !== "string" || !Array.isArray(data.changes)) {
    throw new Error("Invalid API response shape");
  }
  return data;
};
