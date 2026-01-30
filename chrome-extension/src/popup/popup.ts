import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../shared/storage";
import type { CorrectNowSettings } from "../shared/storage";

const getEl = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};

const setStatus = (value: string) => {
  const el = getEl<HTMLDivElement>("status");
  el.textContent = value;
  window.setTimeout(() => {
    if (el.textContent === value) el.textContent = "";
  }, 2000);
};

const readForm = (): CorrectNowSettings => {
  return {
    enabled: getEl<HTMLInputElement>("enabled").checked,
    autoCheck: getEl<HTMLInputElement>("autoCheck").checked,
    language: getEl<HTMLSelectElement>("language").value || "auto",
    apiBaseUrl: getEl<HTMLInputElement>("apiBaseUrl").value || DEFAULT_SETTINGS.apiBaseUrl,
    apiKey: getEl<HTMLInputElement>("apiKey").value || "",
  };
};

const writeForm = (settings: CorrectNowSettings) => {
  getEl<HTMLInputElement>("enabled").checked = !!settings.enabled;
  getEl<HTMLInputElement>("autoCheck").checked = !!settings.autoCheck;
  getEl<HTMLSelectElement>("language").value = settings.language || "auto";
  getEl<HTMLInputElement>("apiBaseUrl").value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  getEl<HTMLInputElement>("apiKey").value = settings.apiKey || "";
};

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();
  writeForm(settings);

  getEl<HTMLButtonElement>("save").addEventListener("click", async () => {
    const next = readForm();
    await saveSettings(next);
    setStatus("Saved");
  });
});
