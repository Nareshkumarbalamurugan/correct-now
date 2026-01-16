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

  // Mock proofreading function - will be replaced with actual AI call
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

    // Simulate API call - will be replaced with actual Gemini AI integration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock response for demonstration
    const mockChanges: Change[] = [
      {
        original: "teh",
        corrected: "the",
        explanation: "Common spelling error",
      },
      {
        original: "recieve",
        corrected: "receive",
        explanation: "Spelling: 'i' before 'e' except after 'c'",
      },
      {
        original: "their going",
        corrected: "they're going",
        explanation: "Grammar: Contraction needed for 'they are'",
      },
    ];

    // For demo, just return the input with a note
    setCorrectedText(
      inputText
        .replace(/teh/gi, "the")
        .replace(/recieve/gi, "receive")
        .replace(/their going/gi, "they're going")
    );
    setChanges(mockChanges);
    setIsLoading(false);
    setHasResults(true);
    toast.success("Text checked successfully!");
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
    <section ref={editorRef} className="py-12 md:py-20 bg-background">
      <div className="container">
        <div className="max-w-4xl mx-auto">
          {/* Input Section */}
          <Card className="shadow-card mb-6">
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
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste or type your text here... We'll check spelling and grammar while preserving your original meaning."
                className="editor-textarea"
                disabled={isLoading}
              />
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
                <Tabs defaultValue="corrected" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="corrected">Corrected Text</TabsTrigger>
                    <TabsTrigger value="changes">
                      Changes ({changes.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="corrected" className="mt-0">
                    <div className="relative">
                      <div className="p-4 bg-muted/50 rounded-lg min-h-[200px] text-base leading-relaxed whitespace-pre-wrap">
                        {correctedText}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        className="absolute top-3 right-3"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>

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
