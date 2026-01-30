export type CorrectNowSettings = {
  enabled: boolean;
  language: string; // 'auto' or language name/code
  autoCheck: boolean;
  apiBaseUrl: string;
  apiKey?: string;
};

export const DEFAULT_SETTINGS: CorrectNowSettings = {
  enabled: true,
  language: "auto",
  autoCheck: false,
  apiBaseUrl: "https://correctnow.app",
  apiKey: "",
};

const KEY = "correctnow.settings";

export const loadSettings = async (): Promise<CorrectNowSettings> => {
  const result = await chrome.storage.sync.get(KEY);
  const value = (result?.[KEY] ?? {}) as Partial<CorrectNowSettings>;
  return { ...DEFAULT_SETTINGS, ...value };
};

export const saveSettings = async (settings: CorrectNowSettings): Promise<void> => {
  await chrome.storage.sync.set({ [KEY]: settings });
};
