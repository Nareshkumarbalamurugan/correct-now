import { loadSettings, saveSettings } from "./shared/storage";
import { proofread } from "./shared/api";
import type { BackgroundMessage, BackgroundReply, ProofreadRequest } from "./shared/types";

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  const run = async (): Promise<BackgroundReply> => {
    try {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return { ok: false, error: "Invalid message" };
      }

      if (message.type === "GET_SETTINGS") {
        const settings = await loadSettings();
        return { ok: true, settings };
      }

      if (message.type === "SET_SETTINGS") {
        const settings = message.settings as any;
        await saveSettings(settings);
        return { ok: true };
      }

      if (message.type === "PROOFREAD") {
        const settings = await loadSettings();
        if (!settings.enabled) return { ok: false, error: "Extension is disabled" };

        const request = message.request as ProofreadRequest;
        if (!request?.text || typeof request.text !== "string") {
          return { ok: false, error: "Text is required" };
        }

        const data = await proofread(settings.apiBaseUrl, request, settings.apiKey);
        return { ok: true, data };
      }

      return { ok: false, error: "Unknown message type" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: message };
    }
  };

  run().then(sendResponse);
  return true; // keep the channel open
});
