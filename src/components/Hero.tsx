import { ArrowRight, Sparkles, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroProps {
  onGetStarted: () => void;
}

const Hero = ({ onGetStarted }: HeroProps) => {
  return (
    <section className="gradient-hero text-primary-foreground py-20 md:py-28">
      <div className="container">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 text-sm font-medium mb-6 animate-fade-in">
            <Sparkles className="w-4 h-4" />
            AI-Powered Proofreading
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight animate-slide-up">
            Perfect Your Writing
            <br />
            <span className="text-accent">Instantly</span>
          </h1>

          <p className="text-lg md:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto animate-slide-up">
            Fix spelling and grammar errors in seconds. Supports 50+ languages
            including Hindi, Tamil, Bengali, and more. No rewriting—just clean,
            accurate corrections.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-slide-up">
            <Button variant="hero" onClick={onGetStarted}>
              Start Checking Free
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="hero-outline">
              See How It Works
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-primary-foreground/70 animate-fade-in">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              Instant results
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              50+ languages
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Powered by Gemini AI
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
