import { useState, useRef, useEffect } from "react";
import { Send, Copy, Check, RotateCcw, FileText, Bold, Italic, Underline, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LanguageSelector from "./LanguageSelector";
import WordCounter from "./WordCounter";
import LoadingDots from "./LoadingDots";
import { Change } from "./ChangeLogTable";
import { toast } from "sonner";
import html2pdf from "html2pdf.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const WORD_LIMIT = 2000;
const DETECT_DEBOUNCE_MS = 600;

const detectLanguageLocal = (text: string): string => {
  if (!text.trim()) return "auto";

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

  const hasFrench = /[àâçéèêëîïôùûüÿœæ]/i.test(text);
  const hasFrenchWords = /\b(je|tu|il|elle|nous|vous|ils|elles|mon|ma|mes|être|était|suis|pas|très|réveillé|bureau|alarme|réunion)\b/i.test(text);
  if (hasFrench || hasFrenchWords) return "fr";

  const hasSpanish = /[ñÑáÁéÉíÍóÓúÚüÜ¿¡]/.test(text);
  const hasSpanishWords = /\b(yo|tú|él|ella|nosotros|vosotros|ellos|ellas|para|porque|muy|alarma|reunión|oficina)\b/i.test(text);
  if (hasSpanish || hasSpanishWords) return "es";

  const hasEnglish = /[A-Za-z]/.test(text);
  if (hasEnglish) return "en";

  return "auto";
};

const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter(Boolean).length;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  changeList.forEach((change) => {
    const target = change.original;
    if (!target) return;
    const escapedTarget = escapeHtml(target);
    const regex = new RegExp(escapeRegExp(escapedTarget), "gi");
    safeText = safeText.replace(regex, `<span class="change-error">${escapedTarget}</span>`);
  });

  return safeText;
};

interface ProofreadingEditorProps {
  editorRef: React.RefObject<HTMLDivElement>;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

const ProofreadingEditor = ({ editorRef }: ProofreadingEditorProps) => {
  const [inputText, setInputText] = useState("");
  const [baseText, setBaseText] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [languageMode, setLanguageMode] = useState<"auto" | "manual">("auto");
  const [copied, setCopied] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorHtml, setEditorHtml] = useState("");
  const [acceptedTexts, setAcceptedTexts] = useState<string[]>([]);
  const [lastDetectText, setLastDetectText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const speechRef = useRef<any>(null);
  const speechBaseRef = useRef<string>("");
  const speechFinalRef = useRef<string>("");
  
  useEffect(() => {
    const stored = window.localStorage.getItem("correctnow:acceptedTexts");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setAcceptedTexts(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (acceptedTexts.length) {
      window.localStorage.setItem(
        "correctnow:acceptedTexts",
        JSON.stringify(acceptedTexts.slice(-50))
      );
    } else {
      window.localStorage.removeItem("correctnow:acceptedTexts");
    }
  }, [acceptedTexts]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const modalEditorRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [matchRanges, setMatchRanges] = useState<
    Array<{ start: number; end: number; index: number }>
  >([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  const wordCount = countWords(inputText);
  const isOverLimit = wordCount > WORD_LIMIT;
  const pendingCount = changes.filter((change) => change.status !== "accepted" && change.status !== "ignored").length;
  const accuracyScore = wordCount
    ? Math.max(0, Math.min(100, Math.round((1 - pendingCount / wordCount) * 100)))
    : 0;

  const normalizeToken = (value: string) =>
    value.toLowerCase().replace(/[.,!?;:()"'“”‘’]/g, "").trim();

  const scrollToSuggestion = (index: number) => {
    const target = suggestionRefs.current[index];
    if (target) {
      setActiveSuggestionIndex(index);
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleTextareaClick = () => {
    const el = textareaRef.current;
    if (!el) return;
    const position = el.selectionStart || 0;
    const match = matchRanges.find(
      (range) => position >= range.start && position <= range.end
    );
    if (match) {
      scrollToSuggestion(match.index);
    }
  };

  useEffect(() => {
    if (!inputText || changes.length === 0) {
      setMatchRanges([]);
      return;
    }

    const pendingChanges = changes.filter(
      (change) => change.status !== "accepted" && change.status !== "ignored"
    );

    const ranges: Array<{ start: number; end: number; index: number }> = [];
    pendingChanges.forEach((change, changeIndex) => {
      if (!change.original) return;
      const regex = new RegExp(escapeRegExp(change.original), "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(inputText)) !== null) {
        ranges.push({
          start: match.index,
          end: match.index + match[0].length - 1,
          index: changes.indexOf(change),
        });
      }
    });

    setMatchRanges(ranges);
  }, [inputText, changes]);

  const applyAcceptedChanges = (text: string, changeList: Change[]) => {
    return changeList
      .filter((change) => change.status === "accepted")
      .reduce((current, change) => {
        if (!change.original || !change.corrected) return current;
        const regex = new RegExp(escapeRegExp(change.original), "g");
        return current.replace(regex, change.corrected);
      }, text);
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

    const overrideWordCount = countWords(textToCheck);
    if (overrideWordCount > WORD_LIMIT) {
      toast.error(`Text exceeds ${WORD_LIMIT} word limit`);
      return;
    }

    setIsLoading(true);
    setHasResults(false);
    const normalizedInput = textToCheck;
    if (acceptedTexts.some((text) => text.trim() === normalizedInput)) {
      setCorrectedText(textToCheck);
      setBaseText(textToCheck);
      setChanges([]);
      setHasResults(true);
      setIsLoading(false);
      toast.success("No changes needed — 100% accurate.");
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
          wordLimit: WORD_LIMIT,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.message || "Proofreading failed");
      }

      const data = await response.json();
      if (!data?.corrected_text) {
        throw new Error("Invalid response format");
      }

      const normalizedCorrected = String(data.corrected_text || "").trim();
      if (normalizedCorrected === normalizedInput) {
        setCorrectedText(textToCheck);
        setBaseText(textToCheck);
        setChanges([]);
        setAcceptedTexts((prev) => {
          const next = prev.filter((text) => text.trim() !== normalizedInput);
          return [...next, textToCheck].slice(-50);
        });
      } else {
        setCorrectedText(data.corrected_text);
        const nextChanges: Change[] = Array.isArray(data.changes)
          ? data.changes.map((change: Change) => ({ ...change, status: "pending" as const }))
          : [];
        setBaseText(textToCheck);
        setChanges(nextChanges);
      }
      setHasResults(true);
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
      case "ru": return "ru-RU";
      case "ja": return "ja-JP";
      case "ko": return "ko-KR";
      case "zh": return "zh-CN";
      case "ar": return "ar-SA";
      default: return "en-US";
    }
  };

  const toggleRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser");
      return;
    }

    if (isRecording) {
      speechRef.current?.stop?.();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLocale(language === "auto" ? "en" : language);
    recognition.interimResults = true;
    recognition.continuous = true;

    speechBaseRef.current = inputText.trim();
    speechFinalRef.current = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          speechFinalRef.current += `${chunk} `;
        } else {
          interim += chunk;
        }
      }

      const base = speechBaseRef.current;
      const combined = `${base} ${speechFinalRef.current}${interim}`.trim();
      setInputText(combined);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    speechRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

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

  const handleAccept = (index: number) => {
    const updated: Change[] = changes.map((change, idx) =>
      idx === index ? { ...change, status: "accepted" as const } : change
    );
    setChanges(updated);
    const base = baseText || inputText;
    const updatedText = applyAcceptedChanges(base, updated);
    setInputText(updatedText);
    setBaseText(updatedText);
    setCorrectedText(updatedText);
    if (updated.filter((change) => change.status !== "accepted" && change.status !== "ignored").length === 0) {
      setAcceptedTexts((prev) => {
        const next = prev.filter((text) => text.trim() !== updatedText.trim());
        return [...next, updatedText].slice(-50);
      });
    }
  };

  const handleIgnore = (index: number) => {
    const updated: Change[] = changes.map((change, idx) =>
      idx === index ? { ...change, status: "ignored" as const } : change
    );
    setChanges(updated);
  };

  const handleAcceptAll = () => {
    const updated: Change[] = changes.map((change) => ({ ...change, status: "accepted" as const }));
    const base = baseText || inputText;
    const updatedText = applyAcceptedChanges(base, updated);
    setChanges(updated);
    setInputText(updatedText);
    setBaseText(updatedText);
    setCorrectedText(updatedText);
    setAcceptedTexts((prev) => {
      const next = prev.filter((text) => text.trim() !== updatedText.trim());
      return [...next, updatedText].slice(-50);
    });
  };

  useEffect(() => {
    // Auto-resize textarea and sync highlight height
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
  }, [inputText]);

  useEffect(() => {
    if (languageMode !== "auto") return;
    const timeout = window.setTimeout(async () => {
      const trimmed = inputText.trim();
      if (!trimmed) {
        setLanguage("auto");
        setLastDetectText("");
        return;
      }

      if (trimmed === lastDetectText) return;
      setLastDetectText(trimmed);

      // Fast local detection for scripts
      const local = detectLanguageLocal(trimmed);
      if (local !== "auto") {
        setLanguage(local);
        return;
      }

      try {
        const response = await fetch("/api/detect-language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });

        if (!response.ok) return;
        const data = await response.json();
        if (data?.code && data.code !== "auto") {
          setLanguage(data.code);
        }
      } catch {
        // ignore
      }
    }, DETECT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [inputText, languageMode, lastDetectText]);

  useEffect(() => {
    if (modalEditorRef.current) {
      modalEditorRef.current.innerHTML = editorHtml;
    }
  }, [editorHtml]);

  return (
    <section
      ref={editorRef}
      className="relative -mt-10 md:-mt-14 py-14 md:py-20 bg-gradient-to-b from-background to-secondary/40"
    >
      <div className="container">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Input Section */}
            <Card className="shadow-elevated">
              <CardHeader className="pb-4 min-h-[92px]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="w-5 h-5 text-accent" />
                    Your Text
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <LanguageSelector
                      value={language}
                      onChange={(value) => {
                        setLanguage(value);
                        setLanguageMode(value === "auto" ? "auto" : "manual");
                      }}
                    />
                    <WordCounter count={wordCount} limit={WORD_LIMIT} />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleRecording}
                      title={isRecording ? "Stop recording" : "Voice input"}
                    >
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => handleCheck()}
                      disabled={isLoading || !inputText.trim() || isOverLimit}
                    >
                      {isLoading ? (
                        <>
                          Checking
                          <LoadingDots />
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Check Text
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="editor-overlay">
                  <div
                    ref={highlightRef}
                    className="editor-highlight"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(
                        inputText,
                        changes.filter((change) => change.status !== "accepted" && change.status !== "ignored")
                      ),
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    spellCheck={false}
                    onPaste={() => {
                      window.setTimeout(() => {
                        const next = textareaRef.current?.value || "";
                        if (!next.trim()) return;
                        setInputText(next);
                        handleCheck(next);
                      }, 0);
                    }}
                    onClick={handleTextareaClick}
                    onScroll={(e) => {
                      if (highlightRef.current) {
                        highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                        highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    placeholder="Paste or type your text here... We'll check spelling and grammar while preserving your original meaning."
                    className="editor-textarea editor-input"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    {language === "auto"
                      ? "Language will be auto-detected"
                      : `Checking in ${language.toUpperCase()}`}
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openEditor}
                      disabled={!inputText.trim()}
                    >
                      Open Editor
                    </Button>
                    {hasResults && (
                      <Button
                        variant="outline"
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
            <Card className="shadow-card">
              <CardHeader className="pb-4 min-h-[92px]">
                <CardTitle className="text-xl">Suggestions</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="border border-border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                  <div className="text-sm text-muted-foreground">
                    Accuracy score
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-success-muted text-success text-sm font-semibold">
                      {accuracyScore}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {changes.length} change{changes.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="text-sm font-semibold text-foreground">
                    {changes.length} suggestion{changes.length === 1 ? "" : "s"} found
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

                  {hasResults && changes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-lg font-medium text-success mb-1">Perfect! </p>
                    <p className="text-sm">No corrections needed in your text.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[520px] overflow-auto pr-1">
                    {changes.map((change, index) => (
                      <div
                        key={index}
                        ref={(el) => (suggestionRefs.current[index] = el)}
                        className={`rounded-lg border bg-card p-4 transition-all ${
                          activeSuggestionIndex === index
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
                              <Button size="sm" variant="accent" onClick={() => handleAccept(index)}>
                                Accept
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleIgnore(index)}>
                                Ignore
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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
