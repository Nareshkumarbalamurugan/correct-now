import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Search } from "lucide-react";
import { formatUpdated, getDocs, sectionForDate } from "@/lib/docs";
import Footer from "@/components/Footer";
import { addSuggestion } from "@/lib/suggestions";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";

const Index = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [docs, setDocs] = useState(() =>
    getDocs().map((doc) => ({
      ...doc,
      section: sectionForDate(doc.updatedAt),
      updated: formatUpdated(doc.updatedAt),
    }))
  );
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);

  useEffect(() => {
    const loadDocs = () =>
      setDocs(
        getDocs().map((doc) => ({
          ...doc,
          section: sectionForDate(doc.updatedAt),
          updated: formatUpdated(doc.updatedAt),
        }))
      );

    loadDocs();

    const handleFocus = () => loadDocs();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "correctnow:docs") {
        loadDocs();
      }
    };
    const handleDocsUpdated = () => loadDocs();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("correctnow:docs-updated", handleDocsUpdated);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("correctnow:docs-updated", handleDocsUpdated);
    };
  }, [location.key]);

  const filtered = useMemo(
    () =>
      docs.filter((doc) =>
        `${doc.title} ${doc.preview}`.toLowerCase().includes(query.toLowerCase())
      ),
    [docs, query]
  );

  const sections = useMemo(
    () =>
      ["Today", "Yesterday"].filter((section) =>
        filtered.some((doc) => doc.section === section)
      ),
    [filtered]
  );

  const openDoc = (id: string) => {
    navigate("/editor", { state: { id } });
  };

  const handleSubmitSuggestion = async () => {
    if (!suggestionText.trim()) {
      toast.error("Please enter a suggestion.");
      return;
    }
    setIsSubmittingSuggestion(true);
    try {
      const auth = getFirebaseAuth();
      await addSuggestion({
        message: suggestionText,
        email: auth?.currentUser?.email || "",
        userId: auth?.currentUser?.uid || "",
      });
      setSuggestionText("");
      setIsSuggestionOpen(false);
      toast.success("Thanks! Your suggestion was submitted.");
    } catch {
      toast.error("Unable to submit suggestion.");
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-lg bg-accent/10">
                <img
                  src="/Icon/correctnow logo final2.png"
                  alt="CorrectNow"
                  className="w-48 h-16 object-contain p-2"
                  loading="eager"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="accent" onClick={() => navigate("/editor")}>New doc</Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="Search docs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 py-10">
        <section className="mb-10">
          <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-white shadow-[0_30px_80px_rgba(34,147,253,0.35)]">
            <div className="absolute inset-0 opacity-25">
              <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-white/25 blur-3xl" />
              <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
            </div>
            <div className="container relative py-16 md:py-24">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90">
                      <img
                        src="/Icon/correctnow logo final2.png"
                        alt="CorrectNow"
                        className="w-5 h-5 object-contain"
                        loading="eager"
                      />
                    </span>
                    AI proofreading — clean, professional grammar
                  </div>
                  <h1 className="text-4xl md:text-6xl font-bold leading-tight mt-5 tracking-tight">
                    Write with confidence. Proofread instantly.
                  </h1>
                  <p className="text-white/90 text-lg md:text-xl mt-4 leading-relaxed">
                    CorrectNow fixes spelling mistakes and grammar issues across global
                    languages — without rewriting your tone.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-7">
                    <Button
                      className="rounded-full bg-white text-primary px-7 py-5 text-base font-semibold shadow-[0_12px_30px_rgba(255,255,255,0.25)] hover:bg-white/95"
                      onClick={() => navigate("/editor")}
                    >
                      Start Free Check
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-white/50 bg-transparent text-white px-7 py-5 text-base font-semibold hover:bg-white/10"
                      onClick={() => navigate("/editor")}
                    >
                      See How It Works
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-6 mt-7 text-sm text-white/85">
                    <span className="inline-flex items-center gap-2">✓ No rewriting</span>
                    <span className="inline-flex items-center gap-2">✓ 2,000-word checks</span>
                    <span className="inline-flex items-center gap-2">✓ Global languages</span>
                  </div>
                </div>

                <Card className="bg-white/95 text-foreground rounded-2xl shadow-[0_20px_60px_rgba(15,30,80,0.3)]">
                  <CardContent className="p-6 md:p-7">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <span className="font-semibold">Live preview</span>
                      <span>Professional proofreading</span>
                    </div>

                    <div className="rounded-xl border border-border bg-white p-4">
                      <div className="text-xs font-semibold text-muted-foreground">Original</div>
                      <div className="text-sm text-foreground mt-2">
                        Please <span className="text-red-500 underline">recieve</span> the document and reply when <span className="text-red-500 underline">your</span> done.
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-white p-4 mt-4">
                      <div className="text-xs font-semibold text-muted-foreground">Corrected</div>
                      <div className="text-sm text-foreground mt-2">
                        Please <span className="text-emerald-600 font-semibold">receive</span> the document and reply when <span className="text-emerald-600 font-semibold">you’re</span> done.
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-white p-4 mt-4">
                      <div className="text-xs font-semibold text-muted-foreground">Change log</div>
                      <div className="text-sm text-foreground mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">recieve</span>
                          <span className="font-medium">receive</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">your</span>
                          <span className="font-medium">you’re</span>
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          Explanations included for every fix
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-sm font-semibold text-muted-foreground">Documents</div>
              <div className="text-2xl font-semibold text-foreground">Recent docs</div>
            </div>
            <Button variant="outline" onClick={() => navigate("/editor")}>New doc</Button>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No documents found.</div>
          ) : (
            sections.map((section) => (
              <div key={section} className="mb-8">
                <div className="text-sm font-semibold text-muted-foreground mb-3">{section}</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {filtered
                    .filter((doc) => doc.section === section)
                    .map((doc) => (
                      <div key={doc.id} className="flex justify-end">
                        <Card className="hover:shadow-card transition-shadow w-full">
                          <CardContent className="p-5 min-h-[150px]">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                                <FileText className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <button
                                  className="text-left text-base font-semibold text-foreground hover:text-primary transition-colors"
                                  onClick={() => openDoc(doc.id)}
                                >
                                  {doc.title}
                                </button>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {doc.preview}
                                </p>
                                <div className="text-xs text-muted-foreground mt-2">{doc.updated}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}

          <div className="mt-12">
            <Card className="border border-border bg-secondary/40">
              <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/10">
                    <img
                      src="/Icon/correctnow logo final2.png"
                      alt="CorrectNow"
                      className="w-6 h-6 object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-foreground">
                      Help us improve CorrectNow
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Share an idea or request a feature — we read every suggestion.
                    </div>
                  </div>
                </div>
                <Button
                  variant="accent"
                  onClick={() => setIsSuggestionOpen(true)}
                >
                  Suggest an improvement
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Dialog open={isSuggestionOpen} onOpenChange={setIsSuggestionOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share your suggestion</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Tell us what you want improved..."
            value={suggestionText}
            onChange={(e) => setSuggestionText(e.target.value)}
            className="min-h-[120px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsSuggestionOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmitSuggestion} disabled={isSubmittingSuggestion}>
              {isSubmittingSuggestion ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default Index;
