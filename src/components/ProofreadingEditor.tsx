import { useState, useRef, useEffect } from "react";
import { Send, Copy, Check, RotateCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LanguageSelector from "./LanguageSelector";
import WordCounter from "./WordCounter";
import LoadingDots from "./LoadingDots";
import ChangeLogTable, { Change } from "./ChangeLogTable";
import { toast } from "sonner";

const WORD_LIMIT = 2000;

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
  const [correctedText, setCorrectedText] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [copied, setCopied] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = countWords(inputText);
  const isOverLimit = wordCount > WORD_LIMIT;
  const accuracyScore = wordCount
    ? Math.max(0, Math.min(100, Math.round((1 - changes.length / wordCount) * 100)))
    : 0;

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
      setChanges(Array.isArray(data.changes) ? data.changes : []);
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
    setCorrectedText("");
    setChanges([]);
    setHasResults(false);
    textareaRef.current?.focus();
  };

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(
        200,
        textareaRef.current.scrollHeight
      )}px`;
    }
  }, [inputText]);

  return (
    <section
      ref={editorRef}
      className="relative -mt-10 md:-mt-14 py-14 md:py-20 bg-gradient-to-b from-background to-secondary/40"
    >
      <div className="container">
        <div className="max-w-4xl mx-auto">
          {/* Input Section */}
          <Card className="shadow-elevated mb-6">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  Your Text
                </CardTitle>
                <div className="flex items-center gap-4">
                  <LanguageSelector value={language} onChange={setLanguage} />
                  <WordCounter count={wordCount} limit={WORD_LIMIT} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    Original
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste or type your text here... We'll check spelling and grammar while preserving your original meaning."
                    className="editor-textarea"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    Corrected
                  </div>
                  <div className="editor-textarea bg-card/70">
                    {correctedText ? (
                      <div
                        className="whitespace-pre-wrap text-base leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: highlightText(correctedText, changes, "corrected"),
                        }}
                      />
                    ) : (
                      <div className="text-muted-foreground">
                        Corrected text will appear here after you check.
                      </div>
                    )}
                  </div>
                </div>
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

          {/* Results Section */}
          {hasResults && (
            <Card className="shadow-card animate-slide-up">
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

                <Tabs defaultValue="changes" className="w-full">
                  <TabsList className="grid w-full grid-cols-1 mb-6">
                    <TabsTrigger value="changes">
                      Changes ({changes.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="changes" className="mt-0">
                    <ChangeLogTable changes={changes} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProofreadingEditor;
