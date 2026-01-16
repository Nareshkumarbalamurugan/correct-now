import { ArrowRight, Check, Globe, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroProps {
  onGetStarted: () => void;
}

const Hero = ({ onGetStarted }: HeroProps) => {
  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative gradient-hero overflow-hidden">
      {/* Subtle pattern + light bloom (professional, not flashy) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:3.25rem_3.25rem]" />
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/10" />

      <div className="container relative z-10 py-20 md:py-28 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Left: copy + CTAs */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 text-white px-4 py-2 text-sm font-medium backdrop-blur-sm border border-white/15 mb-6">
              <Sparkles className="w-4 h-4" />
              AI proofreading — spelling & light grammar
            </div>

            <h1 className="animate-slide-up text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.06] tracking-tight text-white">
              Write with confidence.
              <span className="block mt-2">Proofread instantly.</span>
            </h1>

            <p className="animate-slide-up mt-5 text-lg md:text-xl text-white/90 leading-relaxed max-w-xl mx-auto lg:mx-0">
              CorrectNow fixes spelling mistakes and light grammar issues across 50+ languages
              (including Hindi, Tamil, and Bengali) — without rewriting your tone.
            </p>

            <div className="animate-slide-up mt-7 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                variant="hero"
                onClick={onGetStarted}
                size="lg"
                className="h-14 text-lg font-semibold shadow-2xl hover:shadow-white/15"
              >
                Start Free Check
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="hero-outline"
                onClick={scrollToFeatures}
                size="lg"
                className="h-14 text-lg"
              >
                See How It Works
              </Button>
            </div>

            <div className="animate-fade-in mt-7 flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center lg:justify-start text-white/85 text-sm">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                No rewriting
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                2,000-word checks
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                50+ languages
              </div>
            </div>
          </div>

          {/* Right: live preview (adds “stunning” without gimmicks) */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-white/10 blur-2xl" />
            <div className="relative rounded-2xl bg-white border border-white/30 shadow-elevated p-6 md:p-7">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="text-sm font-semibold text-foreground">Live preview</div>
                <div className="text-xs text-muted-foreground">Spelling + light grammar</div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Original</div>
                  <p className="text-sm md:text-base text-foreground leading-relaxed">
                    Please <span className="underline decoration-warning decoration-2 underline-offset-2">recieve</span> the document and
                    reply when <span className="underline decoration-warning decoration-2 underline-offset-2">your</span> done.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Corrected</div>
                  <p className="text-sm md:text-base text-foreground leading-relaxed">
                    Please <span className="font-semibold text-success">receive</span> the document and reply when <span className="font-semibold text-success">you’re</span> done.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-3">Change log</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">recieve</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">receive</span>

                    <span className="text-muted-foreground">your</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">you’re</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Zap className="w-3.5 h-3.5" />
                    Explanations included for every fix
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
