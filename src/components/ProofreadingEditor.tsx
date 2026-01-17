import { useState, useRef, useEffect } from "react";
import { Send, Copy, Check, RotateCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LanguageSelector from "./LanguageSelector";
import WordCounter from "./WordCounter";
import LoadingDots from "./LoadingDots";
import { Change } from "./ChangeLogTable";
import { toast } from "sonner";

const WORD_LIMIT = 2000;
const DETECT_DEBOUNCE_MS = 400;

const detectLanguage = (text: string): string => {
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

const highlightText = (
  text: string,
  changeList: Change[],
  kind: "original" | "corrected"
) => {
  let safeText = escapeHtml(text);
  if (!changeList.length) return safeText;

  changeList.forEach((change) => {
    const target = kind === "original" ? change.original : change.corrected;
    if (!target) return;
    const escapedTarget = escapeHtml(target);
    const regex = new RegExp(escapeRegExp(escapedTarget), "gi");
    const className = kind === "original" ? "change-error" : "change-corrected";
    safeText = safeText.replace(regex, `<span class="${className}">${escapedTarget}</span>`);
  });

  return safeText;
};

interface ProofreadingEditorProps {
  editorRef: React.RefObject<HTMLDivElement>;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [matchRanges, setMatchRanges] = useState<
    Array<{ start: number; end: number; index: number }>
  >([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  const wordCount = countWords(inputText);
  const isOverLimit = wordCount > WORD_LIMIT;
  const accuracyScore = wordCount
    ? Math.max(0, Math.min(100, Math.round((1 - changes.length / wordCount) * 100)))
    : 0;
  const pendingCount = changes.filter((change) => change.status !== "accepted" && change.status !== "ignored").length;

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

  const handleCheck = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to check");
      return;
    }

    if (isOverLimit) {
      toast.error(`Text exceeds ${WORD_LIMIT} word limit`);
      return;
    }

    setIsLoading(true);
    setHasResults(false);
    try {
      const response = await fetch("/api/proofread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
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

      setCorrectedText(data.corrected_text);
      const nextChanges = Array.isArray(data.changes)
        ? data.changes.map((change: Change) => ({ ...change, status: "pending" }))
        : [];
      setBaseText(inputText);
      setChanges(nextChanges);
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

  const handleAccept = (index: number) => {
    const updated = changes.map((change, idx) =>
      idx === index ? { ...change, status: "accepted" } : change
    );
    setChanges(updated);
    updateInputWithAccepted(updated);
  };

  const handleIgnore = (index: number) => {
    const updated = changes.map((change, idx) =>
      idx === index ? { ...change, status: "ignored" } : change
    );
    setChanges(updated);
  };

  const handleAcceptAll = () => {
    const updated = changes.map((change) => ({ ...change, status: "accepted" }));
    setChanges(updated);
    updateInputWithAccepted(updated);
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
    const timeout = window.setTimeout(() => {
      const detected = detectLanguage(inputText);
      if (!inputText.trim()) {
        setLanguage("auto");
        return;
      }
      if (detected !== "auto") {
        setLanguage(detected);
      }
    }, DETECT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [inputText, languageMode]);

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
              <CardHeader className="pb-4">
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
                        changes.filter((change) => change.status !== "accepted" && change.status !== "ignored"),
                        "original"
                      ),
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    spellCheck={false}
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
                    <Button
                      variant="accent"
                      size="lg"
                      onClick={handleCheck}
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
              </CardContent>
            </Card>

            {/* Suggestions Panel */}
            <Card className="shadow-card">
              <CardContent className="pt-6">
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
                    <p className="text-lg font-medium text-success mb-1">Perfect! 🎉</p>
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProofreadingEditor;
