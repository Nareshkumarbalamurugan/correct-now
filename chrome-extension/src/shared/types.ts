export type ProofreadRequest = {
  text: string;
  language: string;
};

export type Change = {
  original: string;
  corrected: string;
  explanation?: string;
};

export type ProofreadResponse = {
  corrected_text: string;
  changes: Change[];
};

export type BackgroundMessage =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: unknown }
  | { type: "PROOFREAD"; request: ProofreadRequest };

export type BackgroundReply =
  | { ok: true; settings?: unknown; data?: unknown }
  | { ok: false; error: string };
