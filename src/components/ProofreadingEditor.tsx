import React, { useState, useRef, useEffect, useMemo, useDeferredValue, useCallback, startTransition } from "react";
import { Send, Copy, Check, RotateCcw, FileText, Bold, Italic, Underline, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import LanguageSelector, { LANGUAGE_OPTIONS } from "./LanguageSelector";
import WordCounter from "./WordCounter";
import LoadingDots from "./LoadingDots";
import { Change } from "./ChangeLogTable";
import { toast } from "sonner";
import html2pdf from "html2pdf.js";
import { upsertDoc } from "@/lib/docs";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc as firestoreDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const FREE_WORD_LIMIT = 200;
const PRO_WORD_LIMIT = 5000;
const PRO_CREDITS = 50000;
const DETECT_DEBOUNCE_MS = 600;

const detectLanguageLocal = (text: string): string => {
  if (!text.trim()) return "auto";

  const hasArabicScript = /[\u0600-\u06FF]/.test(text);
  if (hasArabicScript) return "ar";

  const hasUrdu = /[\u0600-\u06FF]/.test(text) && /\b(میں|ہے|نہیں|آپ|اور|ہے)\b/.test(text);
  if (hasUrdu) return "ur";

  const hasPersian = /[\u0600-\u06FF]/.test(text) && /\b(است|نیست|این|برای|شما)\b/.test(text);
  if (hasPersian) return "fa";

  const hasTamil = /[\u0B80-\u0BFF]/.test(text);
  if (hasTamil) return "ta";

  const hasHindi = /[\u0900-\u097F]/.test(text);
  if (hasHindi) return "hi";

  const hasBengali = /[\u0980-\u09FF]/.test(text);
  if (hasBengali) return "bn";

  const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
  if (hasTelugu) return "te";

  const hasKannada = /[\u0C80-\u0CFF]/.test(text);
  if (hasKannada) return "kn";

  const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
  if (hasMalayalam) return "ml";

  const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
  if (hasGujarati) return "gu";

  const hasPunjabi = /[\u0A00-\u0A7F]/.test(text);
  if (hasPunjabi) return "pa";

  const hasMarathi = /[\u0900-\u097F]/.test(text);
  if (hasMarathi) return "mr";

  const hasGreek = /[\u0370-\u03FF]/.test(text);
  if (hasGreek) return "el";

  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (hasHebrew) return "he";

  const hasThai = /[\u0E00-\u0E7F]/.test(text);
  if (hasThai) return "th";

  const countMatches = (patterns: RegExp[]) =>
    patterns.reduce((count, pattern) => count + ((text.match(pattern) || []).length), 0);

  const hasVietnamese = /[ăâđêôơưĂÂĐÊÔƠƯ]/i.test(text);
  const hasVietnameseWords = /\b(voi|ban|toi|khong|va|la|mot)\b/i.test(text);
  if (hasVietnamese || hasVietnameseWords) return "vi";

  const frenchSignals = [
    /\bce document contient\b/i,
    /\borganisation\b/i,
    /\bsystème\b/i,
    /\binformations\b/i,
    /[àâçéèêëîïôùûüÿœæ]/i,
  ];
  if (countMatches(frenchSignals) >= 2) return "fr";

  const germanSignals = [
    /\bdieses dokument\b/i,
    /\berklärt\b/i,
    /\bstruktur\b/i,
    /\bfunktion\b/i,
    /\borganisationssystem\b/i,
    /[äöüß]/i,
  ];
  if (countMatches(germanSignals) >= 2) return "de";

  const dutchSignals = [
    /\bdit document\b/i,
    /\bbeschrijft\b/i,
    /\bstructuur\b/i,
    /\borganisatie\b/i,
  ];
  if (countMatches(dutchSignals) >= 2) return "nl";

  const afrikaansSignals = [
    /\bhierdie dokument\b/i,
    /\bverduidelik\b/i,
    /\bstruktuur\b/i,
    /\borganisasie\b/i,
    /\bfunksie\b/i,
  ];
  if (countMatches(afrikaansSignals) >= 2) return "af";

  const spanishSignals = [
    /\beste documento\b/i,
    /\bexplica\b/i,
    /\bestructura\b/i,
    /\borganización\b/i,
    /[ñÑáÁéÉíÍóÓúÚüÜ¿¡]/,
  ];
  if (countMatches(spanishSignals) >= 2) return "es";

  const portugueseSignals = [
    /\beste documento\b/i,
    /\bexplica\b/i,
    /\bestrutura\b/i,
    /\borganiza(?:ç|c)ão\b/i,
    /\bnão\b/i,
  ];
  if (countMatches(portugueseSignals) >= 2) return "pt";

  const italianSignals = [
    /\bquesto documento\b/i,
    /\bspiega\b/i,
    /\bstruttura\b/i,
    /\borganizzazione\b/i,
  ];
  if (countMatches(italianSignals) >= 2) return "it";

  const norwegianSignals = [
    /\bdette dokumentet\b/i,
    /\bforklarer\b/i,
    /\bstrukturen\b/i,
    /\borganiseringen\b/i,
    /[æøå]/i,
  ];
  if (countMatches(norwegianSignals) >= 2) return "no";

  const swedishSignals = [
    /\bdetta dokument\b/i,
    /\bförklarar\b/i,
    /\bstrukturen\b/i,
    /\borganisationen\b/i,
    /[åäö]/i,
  ];
  if (countMatches(swedishSignals) >= 2) return "sv";

  const danishSignals = [
    /\bdette dokument\b/i,
    /\bforklarer\b/i,
    /\bstrukturen\b/i,
    /\borganisationen\b/i,
    /\baf\b/i,
    /[æøå]/i,
  ];
  if (countMatches(danishSignals) >= 2) return "da";

  const romanianSignals = [
    /\bacest document\b/i,
    /\bexplică\b/i,
    /\bstructura\b/i,
    /\borganizarea\b/i,
    /[ăâîșț]/i,
  ];
  if (countMatches(romanianSignals) >= 2) return "ro";

  const czechSignals = [
    /\btento dokument\b/i,
    /\bvysvětluje\b/i,
    /\bstrukturu\b/i,
    /\borganizaci\b/i,
    /[áčďéěíňóřšťúůýž]/i,
  ];
  if (countMatches(czechSignals) >= 2) return "cs";

  const polishSignals = [
    /\bten dokument\b/i,
    /\bwyjaśnia\b/i,
    /\bstruktur(?:ę|e)\b/i,
    /\borganizację\b/i,
    /[ąćęłńóśźż]/i,
  ];
  if (countMatches(polishSignals) >= 2) return "pl";

  const hungarianSignals = [
    /\bez a dokument\b/i,
    /\belmagyarázza\b/i,
    /\brendszer\b/i,
    /\bszerkezet\b/i,
    /[áéíóöőúüű]/i,
  ];
  if (countMatches(hungarianSignals) >= 2) return "hu";

  const indonesianSignals = [
    /\bdokumen ini\b/i,
    /\bmenjelaskan\b/i,
    /\bstruktur\b/i,
    /\borganisasi\b/i,
  ];
  if (countMatches(indonesianSignals) >= 2) return "id";

  const malaySignals = [
    /\bdokumen ini\b/i,
    /\bmenerangkan\b/i,
    /\bstruktur\b/i,
    /\borganisasi\b/i,
  ];
  if (countMatches(malaySignals) >= 2) return "ms";

  const tagalogSignals = [
    /\bipinapaliwanag\b/i,
    /\bdokumentong ito\b/i,
    /\bistruktura\b/i,
    /\borganisasyon\b/i,
  ];
  if (countMatches(tagalogSignals) >= 2) return "tl";

  const hasTurkish = /[çğıİöşü]/i.test(text) || /\b(ve|değil|teşekkür|lütfen|bugün|yarın)\b/i.test(text);
  if (hasTurkish) return "tr";

  const hasFinnish = /\b(kiitos|hei|tänään|huomenna|en)\b/i.test(text);
  if (hasFinnish) return "fi";

  const tagalogWords = (text.match(/\b(salamat|ikaw|hindi|ngayon|bukas|at|ako|tayo|kayo|sila|wala|meron)\b/gi) || []).length;
  const englishWords = (text.match(/\b(the|and|is|are|was|were|this|that|I|you|we|they|to|for|of|in|on|with)\b/gi) || []).length;
  if (tagalogWords >= 2 && tagalogWords > englishWords * 2) return "tl";

  const hasSwahili = /\b(asante|habari|siku|leo|kesho|na)\b/i.test(text);
  if (hasSwahili) return "sw";

  const hasEnglish = /[A-Za-z]/.test(text);
  if (hasEnglish) return "auto";

  return "auto";
};

const countWords = (text: string): number => {
  // Avoid allocating large arrays (`split`) on big documents.
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isWhitespace =
      code === 32 || // space
      code === 9 || // \t
      code === 10 || // \n
      code === 13 || // \r
      code === 12 || // \f
      code === 11 || // \v
      code === 160; // \u00A0
    if (isWhitespace) {
      inWord = false;
      continue;
    }
    if (!inWord) {
      count++;
      inWord = true;
    }
  }
  return count;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeText = (value: string) => value.trim().normalize("NFC");

// Normalize common typography variants so suggestions can match the input reliably
// even when the model emits straight quotes but the text contains smart quotes (or vice versa).
// IMPORTANT: Keep this as mostly 1:1 character mapping to preserve indices.
const normalizeForSearch = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'")
    .replace(/\u00A0/g, " ");

// Fast non-cryptographic hash for caching/duplicate detection.
// Using a hash avoids persisting huge full texts in localStorage (which can freeze the UI).
const fnv1a32 = (value: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

// Cache regex patterns to avoid rebuilding on every accept (expensive operation)
const regexCache = new Map<string, RegExp>();

const buildLooseRegex = (value: string) => {
  const cached = regexCache.get(value);
  if (cached) return cached;
  
  const chars = value.split("");
  const parts = chars.map((char, index) => {
    if (/\s/.test(char)) return "\\s+";
    const isLast = index === chars.length - 1;
    return isLast
      ? escapeRegExp(char)
      : `${escapeRegExp(char)}[^\\p{L}\\p{N}]*`;
  });
  const regex = new RegExp(parts.join(""), "giu");
  
  // Cap cache size to prevent memory leaks
  if (regexCache.size > 500) {
    const firstKey = regexCache.keys().next().value;
    if (firstKey) regexCache.delete(firstKey);
  }
  regexCache.set(value, regex);
  return regex;
};

const isLikelyNameCorrection = (change: Pick<Change, "original" | "corrected" | "explanation">) => {
  const original = String(change.original || "").trim();
  const corrected = String(change.corrected || "").trim();
  if (!original || !corrected) return false;
  if (/\s/.test(original) || /\s/.test(corrected)) return false; // single token only
  if (original.length < 2 || original.length > 48) return false;
  if (corrected.length < 2 || corrected.length > 64) return false;
  // Must be mostly letters (works for Latin + Tamil + other scripts)
  if (!/\p{L}/u.test(original) || !/\p{L}/u.test(corrected)) return false;

  const startsWithUpper = /^[A-Z]/.test(original) || /^[A-Z]/.test(corrected);
  const hasTamil = /[\u0B80-\u0BFF]/.test(original + corrected);
  // Name corrections are often title-cased or Tamil proper nouns.
  return startsWithUpper || hasTamil;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatText = (text: string) => {
  let safe = escapeHtml(text);
  safe = safe.replace(/\n/g, "<br>");
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/__(.+?)__/g, "<u>$1</u>");
  safe = safe.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return safe;
};

const highlightText = (text: string, changeList: Change[]) => {
  let safeText = formatText(text);
  if (!changeList.length) return safeText;

  // Highlighting is expensive for very large suggestion sets.
  // Cap highlights to keep the UI responsive; the full list still appears in the sidebar.
  const MAX_HIGHLIGHT_CHANGES = 250;

  // Sort changes by length (longest first) to avoid partial replacements
  const sortedChanges = [...changeList].sort((a, b) => 
    (b.original?.length || 0) - (a.original?.length || 0)
  ).slice(0, MAX_HIGHLIGHT_CHANGES);

  sortedChanges.forEach((change) => {
    const target = change.original;
    if (!target) return;
    const escapedTarget = escapeHtml(target);
    // Use a more robust regex that handles Unicode properly
    const pattern = escapeRegExp(escapedTarget).replace(/\s+/g, '\\s+');
    const regex = new RegExp(pattern, "gi");
    safeText = safeText.replace(regex, `<span class="change-error">${escapedTarget}</span>`);
  });

  return safeText;
};

interface ProofreadingEditorProps {
  editorRef: React.RefObject<HTMLDivElement>;
  initialText?: string;
  initialDocId?: string;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

// Memoized suggestion card to prevent re-rendering all cards on each accept
const SuggestionCard = React.memo(({ 
  change, 
  index, 
  isActive, 
  onAccept, 
  onIgnore,
  setRef 
}: { 
  change: Change; 
  index: number; 
  isActive: boolean; 
  onAccept: (idx: number) => void; 
  onIgnore: (idx: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}) => {
  return (
    <div
      ref={setRef}
      className={`rounded-lg border bg-card p-4 transition-all ${
        isActive
          ? "border-2 border-accent shadow-lg ring-4 ring-accent/20"
          : "border-border"
      }`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Original</div>
          <div className="text-base font-medium text-foreground">{change.original}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Suggestion</div>
          <div className="text-base font-medium text-success">{change.corrected}</div>
        </div>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">
        {change.explanation}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {change.status === "accepted" ? (
          <span className="text-xs font-semibold text-success">Accepted</span>
        ) : change.status === "ignored" ? (
          <span className="text-xs font-semibold text-muted-foreground">Ignored</span>
        ) : (
          <>
            <Button size="sm" variant="accent" onClick={() => onAccept(index)}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onIgnore(index)}>
              Ignore
            </Button>
          </>
        )}
      </div>
    </div>
  );
});

SuggestionCard.displayName = 'SuggestionCard';

const ProofreadingEditor = ({ editorRef, initialText, initialDocId }: ProofreadingEditorProps) => {
  const [planName, setPlanName] = useState<"Free" | "Pro">("Free");
  const [wordLimit, setWordLimit] = useState(FREE_WORD_LIMIT);
  const [credits, setCredits] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [addonCredits, setAddonCredits] = useState(0);
  const [addonExpiry, setAddonExpiry] = useState<string | null>(null);
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [inputText, setInputText] = useState("");
  const [baseText, setBaseText] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const [languageMode, setLanguageMode] = useState<"auto" | "manual">("auto");
  const [shouldBlinkInput, setShouldBlinkInput] = useState(false);
  const [shouldBlinkLanguage, setShouldBlinkLanguage] = useState(false);
  const [shouldBlinkCheck, setShouldBlinkCheck] = useState(false);
  const [shouldBlinkNewDoc, setShouldBlinkNewDoc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorHtml, setEditorHtml] = useState("");
  const [acceptedTextHashes, setAcceptedTextHashes] = useState<string[]>([]);
  const [lastDetectText, setLastDetectText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [showLanguageTooltip, setShowLanguageTooltip] = useState(false);
  const [showLanguageDialog, setShowLanguageDialog] = useState(false);
  const [pendingRecording, setPendingRecording] = useState(false);
  const [docId, setDocId] = useState<string | undefined>(initialDocId);
  const initializedRef = useRef(false);
  const languagePromptedRef = useRef(false);
  const checkPromptedRef = useRef(false);
  const newDocPromptedRef = useRef(false);
  const speechRef = useRef<any>(null);
  const shouldContinueRef = useRef(false);
  const speechBaseRef = useRef<string>("");
  const speechFinalRef = useRef<string>("");
  const speechFinalIndexRef = useRef<number>(-1);
  const speechFinalTextRef = useRef<string>("");
  const speechPulseRef = useRef<number | null>(null);
  const speechInterimRef = useRef<string>("");
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const uniqueLanguageOptions = Array.from(
    new Map(LANGUAGE_OPTIONS.map((lang) => [lang.code, lang])).values()
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedLanguage = window.localStorage.getItem("correctnow:language");
      if (storedLanguage) {
        setLanguage(storedLanguage);
        setLanguageMode(storedLanguage === "auto" ? "auto" : "manual");
        setShouldBlinkLanguage(true);
        window.setTimeout(() => setShouldBlinkLanguage(false), 12000);
      } else {
        setShowLanguageDialog(true);
      }
    }
  }, []);

  useEffect(() => {
    if (language) {
      languagePromptedRef.current = false;
      setShowLanguageTooltip(false);
      setShowLanguageDialog(false);
    }
  }, [language]);

  const handleLanguagePick = (value: string) => {
    setLanguage(value);
    setLanguageMode(value === "auto" ? "auto" : "manual");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("correctnow:language", value);
    }
    setIsLanguageOpen(false);
    setShowLanguageDialog(false);
    setShowLanguageTooltip(false);
    setShouldBlinkInput(true);
    setTimeout(() => setShouldBlinkInput(false), 19200);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  useEffect(() => {
    if (!language) {
      checkPromptedRef.current = false;
      setShouldBlinkCheck(false);
      return;
    }

    if (!inputText.trim()) {
      checkPromptedRef.current = false;
      setShouldBlinkCheck(false);
      return;
    }

    if (hasResults || isLoading) {
      setShouldBlinkCheck(false);
      return;
    }

      if (!checkPromptedRef.current) {
      checkPromptedRef.current = true;
      setShouldBlinkCheck(true);
        const timer = window.setTimeout(() => setShouldBlinkCheck(false), 24000);
      return () => window.clearTimeout(timer);
    }
  }, [language, inputText, hasResults, isLoading]);

  useEffect(() => {
    if (hasResults && !isLoading) {
      setShouldBlinkCheck(false);
      if (!newDocPromptedRef.current) {
        newDocPromptedRef.current = true;
        setShouldBlinkNewDoc(true);
        const timer = window.setTimeout(() => setShouldBlinkNewDoc(false), 24000);
        return () => window.clearTimeout(timer);
      }
      return;
    }

    newDocPromptedRef.current = false;
    setShouldBlinkNewDoc(false);
  }, [hasResults, isLoading]);

  useEffect(() => {
    // Prefer hashes (fast + small). Also migrate from legacy full-text storage if present.
    const storedHashes = window.localStorage.getItem("correctnow:acceptedTextHashes");
    if (storedHashes) {
      try {
        const parsed = JSON.parse(storedHashes);
        if (Array.isArray(parsed)) {
          setAcceptedTextHashes(parsed.map((x) => String(x)).slice(-200));
          return;
        }
      } catch {
        // ignore
      }
    }

    const legacy = window.localStorage.getItem("correctnow:acceptedTexts");
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const migrated = parsed
            .map((text) => fnv1a32(normalizeText(String(text))))
            .filter(Boolean);
          setAcceptedTextHashes(migrated.slice(-200));
          window.localStorage.setItem(
            "correctnow:acceptedTextHashes",
            JSON.stringify(migrated.slice(-200))
          );
          window.localStorage.removeItem("correctnow:acceptedTexts");
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPlanName("Free");
        setWordLimit(FREE_WORD_LIMIT);
        setCredits(0);
        setCreditsUsed(0);
        setDailyRemaining(null);
        setUserName("");
        setUserEmail("");
        setCurrentUserId(null);
        return;
      }
      setCurrentUserId(user.uid);
      setUserName(user.displayName || "");
      setUserEmail(user.email || "");
      try {
        const ref = firestoreDoc(db, `users/${user.uid}`);
        onSnapshot(ref, async (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const planField = String(data?.plan || "").toLowerCase();
          const entitlementPlan =
            Number(data?.wordLimit) >= PRO_WORD_LIMIT || planField === "pro";
          const status = String(data?.subscriptionStatus || "").toLowerCase();
          const hasStatus = Boolean(status);
          const updatedAt = data?.subscriptionUpdatedAt
            ? new Date(String(data.subscriptionUpdatedAt))
            : null;
          const isRecent = updatedAt
            ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31
            : false;
          const isActive = status === "active" && (updatedAt ? isRecent : true);
          const plan = (hasStatus ? isActive && entitlementPlan : entitlementPlan) ? "Pro" : "Free";
          const limit = Number(data?.wordLimit || (plan === "Pro" ? PRO_WORD_LIMIT : FREE_WORD_LIMIT));
          const planCredits = Number(data?.credits || (plan === "Pro" ? PRO_CREDITS : 0));
          const rawAddonCredits = Number(data?.addonCredits || 0);
          const addonExpiryDate = data?.addonCreditsExpiryAt
            ? String(data.addonCreditsExpiryAt)
            : null;
          const addonExpiryTime = addonExpiryDate
            ? new Date(addonExpiryDate).getTime()
            : null;
          const addonValid = addonExpiryTime ? addonExpiryTime > Date.now() : false;
          const validAddonCredits = addonValid ? rawAddonCredits : 0;
          
          // Check if credits should reset (monthly billing cycle for Pro users)
          const lastResetDate = data?.creditsResetDate
            ? new Date(String(data.creditsResetDate))
            : data?.subscriptionUpdatedAt
            ? new Date(String(data.subscriptionUpdatedAt))
            : null;
          const now = new Date();
          const daysSinceReset = lastResetDate
            ? (now.getTime() - lastResetDate.getTime()) / (1000 * 60 * 60 * 24)
            : null;
          const shouldReset =
            plan === "Pro" &&
            isActive &&
            daysSinceReset !== null &&
            daysSinceReset >= 30;

          // Persist monthly reset to database
          if (shouldReset) {
            try {
              await updateDoc(ref, {
                creditsUsed: 0,
                creditsResetDate: now.toISOString(),
                updatedAt: now.toISOString(),
              });
              // State will update on next snapshot
              return;
            } catch (error) {
              console.error("Failed to reset credits:", error);
            }
          }

          const usedValue = Number(data?.creditsUsed || 0);
          const totalCredits = planCredits + validAddonCredits;
          
          setPlanName(plan);
          setWordLimit(Number.isFinite(limit) ? limit : FREE_WORD_LIMIT);
          setCredits(Number.isFinite(planCredits) ? planCredits : 0);
          setAddonCredits(Number.isFinite(validAddonCredits) ? validAddonCredits : 0);
          setAddonExpiry(addonValid ? addonExpiryDate : null);
          setCreditsUsed(Number.isFinite(usedValue) ? usedValue : 0);
          if (plan === "Free") {
            const todayKey = new Date().toISOString().slice(0, 10);
            const storedDay = String(data?.freeDailyDate || "");
            const storedUsed = Number(data?.freeDailyUsed || 0);
            const usedToday = storedDay === todayKey ? storedUsed : 0;
            const remaining = Math.max(0, 300 - usedToday);
            setDailyRemaining(remaining);
          } else {
            setDailyRemaining(null);
          }
        });
      } catch {
        setPlanName("Free");
        setWordLimit(FREE_WORD_LIMIT);
        setCredits(0);
        setCreditsUsed(0);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (acceptedTextHashes.length) {
      window.localStorage.setItem(
        "correctnow:acceptedTextHashes",
        JSON.stringify(acceptedTextHashes.slice(-200))
      );
    } else {
      window.localStorage.removeItem("correctnow:acceptedTextHashes");
    }
  }, [acceptedTextHashes]);

  useEffect(() => {
    if (initializedRef.current) return;
    if (typeof initialText === "string" && initialText.length) {
      setInputText(initialText);
      initializedRef.current = true;
    } else if (initialText === "") {
      initializedRef.current = true;
    }
  }, [initialText]);

  useEffect(() => {
    setDocId(initialDocId);
  }, [initialDocId]);

  const persistDoc = (text: string) => {
    if (!text.trim()) return;
    // Wrap in try-catch and make it fully async/non-blocking
    try {
      const saved = upsertDoc(text, docId);
      setDocId(saved.id);
    } catch (error) {
      console.warn('Failed to persist document:', error);
      // Don't block UI on persistence errors
    }
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const modalEditorRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const [selectedWordDialog, setSelectedWordDialog] = useState<{
    open: boolean;
    suggestions: Array<{ change: Change; index: number }>;
    original: string;
  }>({ open: false, suggestions: [], original: "" });
  const [hoverSuggestion, setHoverSuggestion] = useState<{
    open: boolean;
    top: number;
    left: number;
    change?: Change;
    index?: number;
    original: string;
  }>({ open: false, top: 0, left: 0, original: "" });
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const [isHoverPopover, setIsHoverPopover] = useState(false);
  const [hoveredError, setHoveredError] = useState<string | null>(null);
  const [checksRemaining, setChecksRemaining] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const finalOperationsTimerRef = useRef<number | null>(null);

  const visibleChanges = useMemo(
    () => changes.filter((change) => change.status !== "accepted" && change.status !== "ignored"),
    [changes]
  );

  const deferredInputText = useDeferredValue(inputText);
  const deferredVisibleChanges = useDeferredValue(visibleChanges);

  const highlightHtml = useMemo(
    () => highlightText(deferredInputText, deferredVisibleChanges),
    [deferredInputText, deferredVisibleChanges]
  );

  const wordCount = useMemo(() => countWords(inputText), [inputText]);
  const isOverLimit = wordCount > wordLimit;
  const totalCredits = credits + addonCredits;
  const creditsLimitEnabled = totalCredits > 0;
  const creditsRemaining = creditsLimitEnabled
    ? Math.max(0, totalCredits - creditsUsed)
    : null;
  const isOverCredits = creditsLimitEnabled && wordCount > (creditsRemaining ?? 0);
  const isOutOfCredits = creditsLimitEnabled && (creditsRemaining ?? 0) <= 0;
  const pendingCount = visibleChanges.length;
  const accuracyScore = hasResults && wordCount
    ? Math.max(0, Math.min(100, Math.round((1 - pendingCount / wordCount) * 100)))
    : 0;

  useEffect(() => {
    if (isOutOfCredits) {
      setShowCreditsDialog(true);
    }
  }, [isOutOfCredits]);

  const normalizeToken = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    const stripped = trimmed.replace(/[.,!?;:()"'“”‘’]/g, "").trim();
    return stripped || trimmed;
  };

  const scrollToSuggestion = (index: number) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return;
    }
    const target = suggestionRefs.current[index];
    if (target) {
      setActiveSuggestionIndex(index);
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const getSuggestionsForText = (originalText: string) => {
    const normalizedTarget = normalizeToken(originalText);
    return changes
      .map((change, idx) => ({ change, index: idx }))
      .filter(
        ({ change }) =>
          change.original &&
          normalizeToken(change.original) === normalizedTarget &&
          change.status !== "accepted" &&
          change.status !== "ignored"
      );
  };

  const openSuggestionsForText = (originalText: string) => {
    const allSuggestionsForWord = getSuggestionsForText(originalText);
    if (!allSuggestionsForWord.length) return;
    setSelectedWordDialog({
      open: true,
      suggestions: allSuggestionsForWord,
      original: originalText,
    });
  };

  const handleHighlightClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('change-error')) {
      const errorText = target.textContent?.trim() || "";
      if (errorText) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        openSuggestionsForText(errorText);
        // Find and scroll to the matching suggestion
        const normalizedTarget = normalizeToken(errorText);
        const matchIndex = changes.findIndex(
          (change) =>
            change.original &&
            normalizeToken(change.original) === normalizedTarget &&
            change.status !== "accepted" &&
            change.status !== "ignored"
        );
        if (matchIndex !== -1) {
          scrollToSuggestion(matchIndex);
        }
      }
    }
  };

  const handleHighlightMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('change-error')) {
      const errorText = target.textContent?.trim() || "";
      if (errorText && errorText !== hoveredError) {
        setHoveredError(errorText);
        if (hoverCloseTimerRef.current) {
          clearTimeout(hoverCloseTimerRef.current);
          hoverCloseTimerRef.current = null;
        }
        // Clear existing timer
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        // Set new timer for hover trigger
        hoverTimerRef.current = window.setTimeout(() => {
          const suggestions = getSuggestionsForText(errorText);
          if (suggestions.length) {
            const rect = target.getBoundingClientRect();
            const left = Math.min(window.innerWidth - 260, rect.right + 10);
            const top = Math.max(8, rect.top - 8);
            scrollToSuggestion(suggestions[0].index);
            setHoverSuggestion({
              open: true,
              top,
              left,
              change: suggestions[0].change,
              index: suggestions[0].index,
              original: errorText,
            });
          }
          hoverTimerRef.current = null;
        }, 500); // 500ms hover delay
      }
    } else {
      // Mouse left error span
      if (hoveredError) {
        setHoveredError(null);
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
      }
      if (hoverSuggestion.open && !isHoverPopover) {
        hoverCloseTimerRef.current = window.setTimeout(() => {
          setHoverSuggestion((prev) => ({ ...prev, open: false }));
          hoverCloseTimerRef.current = null;
        }, 200);
      }
    }
  };

  const handleHighlightMouseLeave = () => {
    setHoveredError(null);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (hoverSuggestion.open && !isHoverPopover) {
      hoverCloseTimerRef.current = window.setTimeout(() => {
        setHoverSuggestion((prev) => ({ ...prev, open: false }));
        hoverCloseTimerRef.current = null;
      }, 200);
    }
  };



  const applyAcceptedChanges = (text: string, changeList: Change[]) => {
    return changeList
      .filter((change) => change.status === "accepted")
      .reduce((current, change) => {
        if (!change.original || !change.corrected) return current;
        const regex = buildLooseRegex(change.original);
        return current.replace(regex, change.corrected);
      }, text);
  };

  const applySingleAcceptedChange = (text: string, change: Change) => {
    if (!change.original || !change.corrected) return text;

    // If it's likely a name correction (or the same token repeats), apply globally for consistency.
    const occurrences = change.original ? (text.split(change.original).length - 1) : 0;
    if (isLikelyNameCorrection(change) || occurrences > 1) {
      const regex = buildLooseRegex(change.original);
      return text.replace(regex, change.corrected);
    }

    // Otherwise apply a single occurrence (fast path).
    const idx = text.indexOf(change.original);
    if (idx !== -1) {
      return text.slice(0, idx) + change.corrected + text.slice(idx + change.original.length);
    }

    // Fall back to regex when exact match not found (handles quote variants/punctuation).
    const regex = buildLooseRegex(change.original);
    return text.replace(regex, change.corrected);
  };

  const updateInputWithAccepted = (updatedChanges: Change[]) => {
    const base = baseText || inputText;
    const updatedText = applyAcceptedChanges(base, updatedChanges);
    setInputText(updatedText);
  };

  const handleCheck = async (overrideText?: string) => {
    const textToCheck = (overrideText ?? inputText).trim();
    if (!textToCheck) {
      toast.error("Please enter some text to check");
      return;
    }

    if (!language || language === "") {
      setShowLanguageTooltip(true);
      setIsLanguageOpen(false);
      setShowLanguageDialog(true);
      return;
    }

    const overrideWordCount = countWords(textToCheck);
    if (overrideWordCount > wordLimit) {
      toast.error(`Text exceeds ${wordLimit} word limit`);
      return;
    }

    if (creditsLimitEnabled && overrideWordCount > (creditsRemaining ?? 0)) {
      toast.error("Not enough credits. Please buy add-on credits to continue.");
      return;
    }

    setIsLoading(true);
    setHasResults(false);
    const normalizedInput = textToCheck.normalize("NFC");
    const inputHash = fnv1a32(normalizeText(normalizedInput));
    if (acceptedTextHashes.includes(inputHash)) {
      setCorrectedText(normalizedInput);
      setBaseText(normalizedInput);
      setChanges([]);
      setHasResults(true);
      setIsLoading(false);
      persistDoc(normalizedInput);
      toast.success("No changes needed — your text is clean.");
      return;
    }
    
    try {
      const response = await fetch("/api/proofread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToCheck,
          language,
          wordLimit,
          userId: currentUserId,
        }),
      });

      // Check for rate limiting response
      const checksRemainingHeader = response.headers.get('X-Checks-Remaining');
      if (checksRemainingHeader) {
        const remaining = parseInt(checksRemainingHeader, 10);
        setChecksRemaining(remaining);
        
        if (remaining <= 2 && remaining > 0) {
          toast.warning(`Only ${remaining} free check${remaining === 1 ? '' : 's'} remaining. Sign in for unlimited checks!`);
        }
      }

      const dailyRemainingHeader = response.headers.get("X-Daily-Words-Remaining");
      if (dailyRemainingHeader !== null) {
        const remaining = parseInt(dailyRemainingHeader, 10);
        setDailyRemaining(Number.isFinite(remaining) ? remaining : null);
      }

      const creditsUsedHeader = response.headers.get("X-Credits-Used");
      if (creditsUsedHeader !== null) {
        const used = parseInt(creditsUsedHeader, 10);
        if (Number.isFinite(used)) {
          setCreditsUsed(used);
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        
        if (error.requiresAuth) {
          toast.error("Free limit reached. Please sign in to continue.", {
            action: {
              label: "Sign In",
              onClick: () => window.location.href = "/auth",
            },
          });
          setIsLoading(false);
          return;
        }
        
        throw new Error(error?.message || "Proofreading failed");
      }

      const data = await response.json();
      if (!data?.corrected_text) {
        throw new Error("Invalid response format");
      }

      const normalizedCorrected = String(data.corrected_text || "").trim().normalize("NFC");
      if (normalizedCorrected === normalizedInput) {
        setCorrectedText(normalizedInput);
        setBaseText(normalizedInput);
        setChanges([]);
        const inputHash = fnv1a32(normalizeText(normalizedInput));
        setAcceptedTextHashes((prev) => {
          const next = prev.filter((hash) => hash !== inputHash);
          return [...next, inputHash].slice(-200);
        });
      } else {
        setCorrectedText(normalizedCorrected);
        const nextChanges: Change[] = Array.isArray(data.changes)
          ? data.changes
              .map((change: Change) => ({ ...change, status: "pending" as const }))
              .filter((change) => {
                if (!change.original || !change.corrected) return false;
                if (normalizeText(change.original) === normalizeText(change.corrected)) return false;
                // CRITICAL: Only include suggestions whose original text actually exists in the input
                // This prevents crashes when accepting suggestions that can't be found
                if (!normalizedInput.includes(change.original)) {
                  // Try a tolerant search that normalizes smart quotes / apostrophes (common mismatch)
                  const inputSearch = normalizeForSearch(normalizedInput);
                  const originalSearch = normalizeForSearch(change.original);

                  let idx = inputSearch.indexOf(originalSearch);
                  if (idx === -1) {
                    idx = inputSearch.toLowerCase().indexOf(originalSearch.toLowerCase());
                  }

                  if (idx === -1) return false;

                  // Map change.original to the exact substring from the user's input so accept/ignore/highlight works.
                  // This is especially important for punctuation-only fixes (quotes) where codepoint differs.
                  change.original = normalizedInput.slice(idx, idx + change.original.length);
                }
                return true;
              })
          : [];
        setBaseText(normalizedInput);
        setChanges(nextChanges);
      }
      persistDoc(normalizedInput);
      setHasResults(true);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        window.setTimeout(() => {
          suggestionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
      toast.success("Text checked successfully!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(correctedText);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setInputText("");
    setBaseText("");
    setCorrectedText("");
    setChanges([]);
    setHasResults(false);
    setDocId(undefined);
    checkPromptedRef.current = false;
    newDocPromptedRef.current = false;
    setShouldBlinkCheck(false);
    setShouldBlinkNewDoc(false);
    textareaRef.current?.focus();
    if (languageMode === "auto") {
      setLanguage("auto");
    }
  };

  const copyWithFormatting = async (text: string, html?: string) => {
    const rich = html ?? formatText(text);
    try {
      if ("ClipboardItem" in window) {
        const item = new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([rich], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Copied with formatting!");
    } catch {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  };

  const openEditor = () => {
    setEditorDraft(inputText);
    setEditorHtml(formatText(inputText));
    setIsEditorOpen(true);
    requestAnimationFrame(() => {
      if (modalEditorRef.current) {
        modalEditorRef.current.innerHTML = formatText(inputText);
      }
    });
  };

  const getSpeechLocale = (code: string) => {
    switch (code) {
      case "ur": return "ur-PK";
      case "fa": return "fa-IR";
      case "ta": return "ta-IN";
      case "hi": return "hi-IN";
      case "bn": return "bn-IN";
      case "te": return "te-IN";
      case "kn": return "kn-IN";
      case "ml": return "ml-IN";
      case "gu": return "gu-IN";
      case "pa": return "pa-IN";
      case "mr": return "mr-IN";
      case "es": return "es-ES";
      case "fr": return "fr-FR";
      case "de": return "de-DE";
      case "pt": return "pt-PT";
      case "it": return "it-IT";
      case "nl": return "nl-NL";
      case "sv": return "sv-SE";
      case "no": return "nb-NO";
      case "da": return "da-DK";
      case "fi": return "fi-FI";
      case "pl": return "pl-PL";
      case "ro": return "ro-RO";
      case "tr": return "tr-TR";
      case "el": return "el-GR";
      case "he": return "he-IL";
      case "id": return "id-ID";
      case "ms": return "ms-MY";
      case "th": return "th-TH";
      case "vi": return "vi-VN";
      case "tl": return "fil-PH";
      case "sw": return "sw-KE";
      case "ru": return "ru-RU";
      case "uk": return "uk-UA";
      case "ja": return "ja-JP";
      case "ko": return "ko-KR";
      case "zh": return "zh-CN";
      case "ar": return "ar-SA";
      default: return "en-US";
    }
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLocale(language === "auto" ? "en" : language);
    recognition.interimResults = true;
    recognition.continuous = true;

    speechBaseRef.current = inputText.trim();
    speechFinalRef.current = "";
    speechFinalIndexRef.current = -1;
    speechFinalTextRef.current = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          if (i <= speechFinalIndexRef.current) {
            continue;
          }
          speechFinalIndexRef.current = i;
          const trimmedChunk = chunk.trim();
          if (trimmedChunk && trimmedChunk === speechFinalTextRef.current) {
            continue;
          }
          if (trimmedChunk) {
            speechFinalTextRef.current = trimmedChunk;
          }
          finalChunk += `${chunk} `;
        } else {
          interim += chunk;
        }
      }

      if (finalChunk.trim()) {
        speechFinalRef.current = `${speechFinalRef.current}${finalChunk}`.trim() + " ";
        speechInterimRef.current = "";
      }

      const nextInterim = interim.trim();
      if (nextInterim === speechInterimRef.current && !finalChunk.trim()) {
        return;
      }
      speechInterimRef.current = nextInterim;

      setIsSpeaking(true);
      if (speechPulseRef.current) {
        window.clearTimeout(speechPulseRef.current);
      }
      speechPulseRef.current = window.setTimeout(() => {
        setIsSpeaking(false);
      }, 220);

      const base = speechBaseRef.current;
      const combined = `${base} ${speechFinalRef.current}${nextInterim}`.trim();
      setInputText(combined);
    };

    recognition.onerror = () => {
      shouldContinueRef.current = false;
      setIsRecording(false);
      setIsSpeaking(false);
    };

    recognition.onend = () => {
      if (shouldContinueRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // ignore
        }
      }
      setIsRecording(false);
      setIsSpeaking(false);
    };

    speechRef.current = recognition;
    shouldContinueRef.current = true;
    setIsRecording(true);
    recognition.start();
  };

  const toggleRecording = () => {
    if (isRecording) {
      shouldContinueRef.current = false;
      speechRef.current?.stop?.();
      setIsRecording(false);
      return;
    }

    if (!language || language === "") {
      setPendingRecording(true);
      setIsLanguageOpen(true);
      toast.info("Please select a language to start voice input");
      return;
    }

    startRecording();
  };

  useEffect(() => {
    if (!pendingRecording) return;
    if (language && language !== "") {
      setPendingRecording(false);
      startRecording();
    }
  }, [language, pendingRecording]);

  const saveEditor = () => {
    const html = modalEditorRef.current?.innerHTML ?? editorHtml;
    const plain = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ");
    setInputText(plain);
    setIsEditorOpen(false);
  };

  const applyEditorCommand = (command: "bold" | "italic" | "underline") => {
    const target = modalEditorRef.current;
    if (!target) return;
    target.focus();
    document.execCommand(command, false);
    setEditorHtml(target.innerHTML);
    setEditorDraft(target.innerText);
  };

  const handleExportPdf = async () => {
    const target = modalEditorRef.current;
    if (!target) return;
    const options = {
      margin: 10,
      filename: "CorrectNow-Proofread.pdf",
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
    };
    await html2pdf().set(options).from(target).save();
  };

  const handleAccept = useCallback((index: number) => {
    const acceptedChange = changes[index];
    const updated: Change[] = changes.map((change, idx) => {
      // Accept the selected suggestion
      if (idx === index) {
        return { ...change, status: "accepted" as const };
      }
      // Auto-ignore other suggestions with the same original text
      if (change.original === acceptedChange.original && change.status === "pending") {
        return { ...change, status: "ignored" as const };
      }
      return change;
    });

    // Apply ONLY the newly accepted change.
    // Previously this re-applied every accepted change over the full document on each click,
    // which can freeze the browser on long texts.
    const updatedText = applySingleAcceptedChange(inputText, acceptedChange);

    // CRITICAL: After applying the change, re-validate all pending suggestions
    // to check if their original text still exists in the updated text.
    // This prevents showing/accepting orphaned suggestions after text changes.
    const revalidated = updated.map((change) => {
      if (change.status !== "pending") return change;
      
      // Check if this pending suggestion's original text still exists
      if (!change.original || !updatedText.includes(change.original)) {
        // Try case-insensitive as fallback
        const lowerText = updatedText.toLowerCase();
        const lowerOriginal = change.original?.toLowerCase() || "";
        if (!lowerText.includes(lowerOriginal)) {
          // Original text no longer exists - mark as ignored to hide it
          return { ...change, status: "ignored" as const };
        }
      }
      return change;
    });

    const remaining = revalidated.filter(
      (change) => change.status !== "accepted" && change.status !== "ignored"
    ).length;

    // Keep the full list - don't filter. The UI skips rendering accepted/ignored items.
    setChanges(revalidated);
    
    // Batch text updates to trigger only one re-render
    setInputText(updatedText);
    setBaseText(updatedText);
    setCorrectedText(updatedText);

    // Debounce expensive final operations (hash, localStorage)
    // Only execute once after user stops accepting (not on every accept)
    if (remaining === 0) {
      if (finalOperationsTimerRef.current) {
        clearTimeout(finalOperationsTimerRef.current);
      }
      finalOperationsTimerRef.current = window.setTimeout(() => {
        // These operations are expensive on large texts
        const finalHash = fnv1a32(normalizeText(updatedText));
        setAcceptedTextHashes((prev) => {
          const next = prev.filter((hash) => hash !== finalHash);
          return [...next, finalHash].slice(-200);
        });
        // Defer doc persistence to idle time
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => persistDoc(updatedText), { timeout: 2000 });
        } else {
          requestAnimationFrame(() => persistDoc(updatedText));
        }
      }, 300); // Wait 300ms after last accept
    }
  }, [changes, inputText]);

  const handleIgnore = useCallback((index: number) => {
    const updated: Change[] = changes.map((change, idx) =>
      idx === index ? { ...change, status: "ignored" as const } : change
    );
    setChanges(updated);
  }, [changes]);

  const handleAcceptAll = () => {
    const updated: Change[] = changes.map((change) => ({ ...change, status: "accepted" as const }));
    const base = baseText || inputText;
    const updatedText = applyAcceptedChanges(base, updated);
    const trimmedCorrected = correctedText?.trim();
    const finalText = trimmedCorrected && trimmedCorrected !== base.trim()
      ? trimmedCorrected
      : updatedText;
    setChanges(updated);
    setInputText(finalText);
    setBaseText(finalText);
    setCorrectedText(finalText);
    setSelectedWordDialog({ open: false, suggestions: [], original: "" });
    
    // Debounce expensive operations for Accept All too
    if (finalOperationsTimerRef.current) {
      clearTimeout(finalOperationsTimerRef.current);
    }
    finalOperationsTimerRef.current = window.setTimeout(() => {
      const finalHash = fnv1a32(normalizeText(finalText));
      setAcceptedTextHashes((prev) => {
        const next = prev.filter((hash) => hash !== finalHash);
        return [...next, finalHash].slice(-200);
      });
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => persistDoc(finalText), { timeout: 2000 });
      } else {
        requestAnimationFrame(() => persistDoc(finalText));
      }
    }, 300);
  };

  useEffect(() => {
    // Auto-resize textarea and sync highlight height (batched to avoid layout thrash)
    const id = window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.max(
          200,
          textareaRef.current.scrollHeight
        )}px`;
      }
      if (highlightRef.current && textareaRef.current) {
        highlightRef.current.style.height = textareaRef.current.style.height;
      }
    });

    return () => window.cancelAnimationFrame(id);
  }, [inputText]);

  useEffect(() => {
    if (modalEditorRef.current) {
      modalEditorRef.current.innerHTML = editorHtml;
    }
  }, [editorHtml]);

  return (
    <section
      ref={editorRef}
      className="relative -mt-10 md:-mt-14 py-8 md:py-14 lg:py-20 bg-gradient-to-b from-background to-secondary/40"
    >
      <div className="container max-w-[1700px] px-3 sm:px-4 md:px-6 lg:pr-0">
        <div className="w-full mx-auto">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[3fr_1fr]">
            {/* Input Section */}
            <Card className="shadow-elevated">
              <CardHeader className="pb-3 sm:pb-4 min-h-[72px] sm:min-h-[92px] px-3 sm:px-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                    Your Text
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-auto">
                      {showLanguageTooltip && !language && (
                        <div className="absolute -top-12 left-0 right-0 sm:right-auto z-20 rounded-lg border border-destructive/60 bg-destructive px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-destructive-foreground shadow-xl ring-4 ring-destructive/20 animate-pulse">
                          Please select a language first
                          <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r border-destructive/60 bg-destructive" />
                        </div>
                      )}
                      <LanguageSelector
                        value={language}
                        open={isLanguageOpen}
                        onOpenChange={setIsLanguageOpen}
                        showTooltip={showLanguageTooltip}
                        highlight={shouldBlinkLanguage}
                        onChange={(value) => {
                          handleLanguagePick(value);
                        }}
                      />
                    </div>
                    <div className="flex flex-col items-start gap-0.5 sm:gap-1 w-full sm:w-auto">
                      <WordCounter count={wordCount} limit={wordLimit} />
                      {planName === "Free" && currentUserId && (
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          Dialy 300 words per day for free users
                          {dailyRemaining !== null ? ` • Remaining: ${dailyRemaining}` : ""}
                        </div>
                      )}
                      {creditsLimitEnabled && (
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          Credits left: {creditsRemaining?.toLocaleString()}
                          <span className="ml-1 text-muted-foreground/80">(1 word = 1 credit)</span>
                        </div>
                      )}
                      {isOutOfCredits && (
                        <div className="text-[10px] sm:text-xs text-destructive font-semibold flex items-center gap-2">
                          Credits exhausted!
                          <Link to="/payment?mode=credits" className="text-accent hover:underline font-medium">
                            Buy more
                          </Link>
                        </div>
                      )}
                      {isOverCredits && !isOutOfCredits && (
                        <div className="text-[10px] sm:text-xs text-destructive flex items-center gap-2">
                          Not enough credits.
                          <Link to="/payment?mode=credits" className="text-accent hover:underline">
                            Buy credits
                          </Link>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className={`inline-flex sm:hidden md:inline-flex ${
                        isRecording
                          ? isSpeaking
                            ? "border-accent text-accent bg-accent/10 ring-4 ring-accent/40 shadow-[0_0_0_8px_rgba(37,99,235,0.5)] animate-pulse scale-105 transition-transform"
                            : "border-accent text-accent bg-accent/5"
                          : ""
                      }`}
                      onClick={toggleRecording}
                      title={isRecording ? "Stop recording" : "Voice input"}
                    >
                      {isRecording ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      className={`w-full sm:w-auto text-sm${isLoading ? " is-checking" : ""}${shouldBlinkCheck ? " blink-green-slow" : ""}`}
                      onClick={() => handleCheck()}
                      disabled={isLoading || !inputText.trim() || isOverLimit || isOverCredits || isOutOfCredits}
                    >
                      {isLoading ? (
                        <>
                          Checking
                          <LoadingDots />
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Check Text
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
                <div className="editor-overlay">
                  <div
                    ref={highlightRef}
                    className="editor-highlight"
                    onClick={handleHighlightClick}
                    onMouseMove={handleHighlightMouseMove}
                    onMouseLeave={handleHighlightMouseLeave}
                    dangerouslySetInnerHTML={{
                      __html: highlightHtml,
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onMouseDown={() => setShouldBlinkLanguage(false)}
                    onTouchStart={() => setShouldBlinkLanguage(false)}
                    onKeyDown={() => setShouldBlinkLanguage(false)}
                    onPointerDown={() => setShouldBlinkLanguage(false)}
                    onChange={(e) => {
                      // Skip manual updates during voice recording to prevent duplication
                      if (isRecording) {
                        return;
                      }

                      const newText = e.target.value;
                      setInputText(newText);

                      if (!newText.trim()) {
                        languagePromptedRef.current = false;
                        setShowLanguageTooltip(false);
                        return;
                      }

                    }}
                    spellCheck={false}
                    onPaste={() => {
                      setShouldBlinkInput(false);
                      window.setTimeout(() => {
                        const next = textareaRef.current?.value || "";
                        if (!next.trim()) return;
                        setInputText(next);
                      }, 0);
                    }}
                    onScroll={(e) => {
                      if (highlightRef.current) {
                        highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                        highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    placeholder="Welcome! Paste or type your text here, and we’ll proofread it professionally while preserving your meaning and tone."
                    className={`editor-textarea editor-input ${shouldBlinkInput ? 'blink-green' : ''}`}
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={openEditor}
                      disabled={!inputText.trim()}
                    >
                      Open Editor
                    </Button>
                    {hasResults && (
                      <Button
                        variant="outline"
                        className={`w-full sm:w-auto${shouldBlinkNewDoc ? " blink-green-slow" : ""}`}
                        onClick={handleReset}
                        disabled={isLoading}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Suggestions Panel */}
            <Card ref={suggestionsRef} className="shadow-card">
              <CardHeader className="pb-4 min-h-[72px] sm:min-h-[92px]">
                <CardTitle className="text-xl">Suggestions</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {hoverSuggestion.open && hoverSuggestion.change && (
                  <div
                    className="hover-suggestion-popover"
                    style={{ top: hoverSuggestion.top, left: hoverSuggestion.left }}
                    onMouseEnter={() => {
                      setIsHoverPopover(true);
                      if (hoverCloseTimerRef.current) {
                        clearTimeout(hoverCloseTimerRef.current);
                        hoverCloseTimerRef.current = null;
                      }
                    }}
                    onMouseLeave={() => {
                      setIsHoverPopover(false);
                      hoverCloseTimerRef.current = window.setTimeout(() => {
                        setHoverSuggestion((prev) => ({ ...prev, open: false }));
                        hoverCloseTimerRef.current = null;
                      }, 200);
                    }}
                  >
                    <div className="hover-suggestion-arrow" />
                    <div className="text-[11px] text-muted-foreground">Suggestion</div>
                    <button
                      type="button"
                      className="text-sm font-semibold text-success hover:underline text-left"
                      onClick={() => {
                        if (typeof hoverSuggestion.index === "number") {
                          handleAccept(hoverSuggestion.index as number);
                          setHoverSuggestion((prev) => ({ ...prev, open: false }));
                        }
                      }}
                    >
                      {hoverSuggestion.change.corrected}
                    </button>
                  </div>
                )}
                <div className="border border-border rounded-lg p-4">
                  <div className="flex flex-col gap-3 mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">Accuracy score</div>
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded-full bg-success-muted text-success text-sm font-semibold">
                          {accuracyScore}%
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {changes.length} change{changes.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <Progress value={accuracyScore} />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="text-sm font-semibold text-foreground">
                    {pendingCount} suggestion{pendingCount === 1 ? "" : "s"} remaining
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={handleAcceptAll}
                    disabled={pendingCount === 0}
                  >
                    Accept All
                  </Button>
                  </div>

                  {hasResults && pendingCount === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-lg font-medium text-success mb-1">Looks great.</p>
                    <p className="text-sm">No corrections needed.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[520px] overflow-auto pr-1">
                    {changes.map((change, index) => {
                      // Skip accepted and ignored suggestions
                      if (change.status === "accepted" || change.status === "ignored") return null;
                      return (
                        <SuggestionCard
                          key={index}
                          change={change}
                          index={index}
                          isActive={activeSuggestionIndex === index}
                          onAccept={handleAccept}
                          onIgnore={handleIgnore}
                          setRef={(el) => (suggestionRefs.current[index] = el)}
                        />
                      );
                    })}
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={showLanguageDialog} onOpenChange={setShowLanguageDialog}>
        <DialogContent className="sm:max-w-md w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a language</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a language to get accurate corrections. You can change this anytime.
            </p>
            <div className="rounded-lg border border-border bg-card">
              <Command>
                <CommandInput placeholder="Search languages..." />
                <CommandList className="max-h-[50vh] overflow-y-auto">
                  <CommandEmpty>No languages found.</CommandEmpty>
                  <CommandGroup>
                    {uniqueLanguageOptions.map((lang) => (
                      <CommandItem
                        key={lang.code}
                        value={`${lang.name} ${lang.code}`}
                        onSelect={() => handleLanguagePick(lang.code)}
                        className="cursor-pointer"
                      >
                        <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                          {language === lang.code ? "✓" : ""}
                        </span>
                        {lang.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowLanguageDialog(false)}
            >
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedWordDialog.open} onOpenChange={(open) => {
        if (!open) {
          setSelectedWordDialog({ open: false, suggestions: [], original: "" });
        }
      }}>
        <DialogContent className="w-[92vw] max-w-sm sm:max-w-md p-4 sm:p-5 sm:top-24 sm:translate-y-0">
          <DialogHeader>
            <DialogTitle>
              {selectedWordDialog.suggestions.length > 1 ? "Suggestions" : "Suggestion"}
            </DialogTitle>
          </DialogHeader>
          {selectedWordDialog.suggestions.length > 0 && (
            <div className="space-y-4">
              <div className="mb-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Original</div>
                <div className="text-base font-medium text-foreground break-words whitespace-pre-wrap">
                  {selectedWordDialog.original}
                </div>
              </div>
              
              <div className="space-y-3">
                {selectedWordDialog.suggestions.map(({ change, index }, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">Original</div>
                        <div className="text-base font-medium text-foreground break-words whitespace-pre-wrap">
                          {selectedWordDialog.original}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1">Suggestion</div>
                        <div className="text-base font-medium text-success break-words whitespace-pre-wrap">
                          {change.corrected}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-3 break-words whitespace-pre-wrap">
                      {change.explanation}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="accent"
                        onClick={() => {
                          handleAccept(index);
                          setSelectedWordDialog({ open: false, suggestions: [], original: "" });
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleIgnore(index);
                          setSelectedWordDialog({ open: false, suggestions: [], original: "" });
                        }}
                      >
                        Ignore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    selectedWordDialog.suggestions.forEach(({ index }) => {
                      handleIgnore(index);
                    });
                    setSelectedWordDialog({ open: false, suggestions: [], original: "" });
                  }}
                >
                  Ignore All
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog}>
        <DialogContent className="sm:max-w-md w-full">
          <DialogHeader>
            <DialogTitle>Credits exhausted</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-gradient-to-br from-accent/10 to-primary/10 p-4">
            <p className="text-sm text-muted-foreground">
              You’ve used all available credits. Add more credits to continue checking without interruptions.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Credits remaining</span>
              <span className="font-semibold text-foreground">0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Suggested add-on packs</span>
              <span className="font-semibold text-foreground">10K / 25K / 50K</span>
            </div>
          </div>
          <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
            <Link to="/payment?mode=credits" className="w-full">
              <Button variant="accent" className="w-full h-11">
                Buy add-on credits
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => setShowCreditsDialog(false)}
            >
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => applyEditorCommand("bold")}
                aria-label="Bold"
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => applyEditorCommand("italic")}
                aria-label="Italic"
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => applyEditorCommand("underline")}
                aria-label="Underline"
                title="Underline"
              >
                <Underline className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Select text to format
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyWithFormatting(editorDraft, modalEditorRef.current?.innerHTML)}
              disabled={!editorDraft.trim()}
            >
              <Copy className="w-4 h-4" />
              Copy
            </Button>
          </div>
          <div
            ref={modalEditorRef}
            className="editor-textarea rich-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const html = (e.currentTarget as HTMLDivElement).innerHTML;
              setEditorHtml(html);
              setEditorDraft((e.currentTarget as HTMLDivElement).innerText);
            }}
            data-placeholder="Write and format here..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleExportPdf}>
              Export PDF
            </Button>
            <Button variant="accent" onClick={saveEditor}>
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ProofreadingEditor;
