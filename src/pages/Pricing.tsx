import { useEffect, useState } from "react";
import { Check, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";

const plans = [
  {
    name: "Free",
    icon: Zap,
    price: "₹0",
    period: "forever",
    description: "Perfect for trying out CorrectNow",
    features: [
      "200 words per check",
      "Limited daily checks",
      "Basic spelling correction",
      "Global languages supported",
      "Change log with explanations",
    ],
    limitations: [
      "No history saved",
      "Standard processing speed",
      "Word checks beyond 200 words are Pro-only",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Pro",
    icon: Crown,
    price: "₹500",
    period: "per month",
    description: "For professionals who write daily",
    features: [
      "Unlimited word checks",
      "2,000 words per check",
      "Advanced grammar fixes",
      "All languages supported",
      "Detailed explanations",
      "Check history (30 days)",
      "Priority processing",
      "Export to Word/PDF",
    ],
    limitations: [],
    cta: "Go Pro",
    popular: true,
  },
];

const Pricing = () => {
  const [currentPlan, setCurrentPlan] = useState<"Free" | "Pro">("Free");

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    if (!auth || !db) return;

    let snapUnsub: (() => void) | undefined;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (snapUnsub) {
        snapUnsub();
        snapUnsub = undefined;
      }
      if (!user) {
        setCurrentPlan("Free");
        return;
      }

      const ref = firestoreDoc(db, `users/${user.uid}`);
      snapUnsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const planField = String(data?.plan || "").toLowerCase();
        const entitlementPlan =
          Number(data?.wordLimit) >= 2000 || planField === "pro";
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
        setCurrentPlan(plan);
      });
    });

    return () => {
      if (snapUnsub) snapUnsub();
      unsub();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 px-4">
          <div className="container max-w-6xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Simple, transparent pricing
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Choose your plan
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Start free and upgrade as you grow. No hidden fees, cancel anytime.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="pb-20 px-4">
          <div className="container max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              {plans.map((plan) => {
                const isCurrent = plan.name === currentPlan;
                const canUpgrade = plan.name === "Pro" && currentPlan !== "Pro";
                const ctaLabel = isCurrent
                  ? "Current Plan"
                  : plan.name === "Pro"
                    ? "Go Pro"
                    : "Free Plan";

                return (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border ${
                    isCurrent
                      ? "border-accent bg-accent/10 shadow-lg shadow-accent/20"
                      : plan.popular
                        ? "border-accent bg-accent/5 shadow-lg shadow-accent/10"
                        : "border-border bg-card"
                  } p-8 flex flex-col`}
                >
                  {isCurrent ? (
                    <Badge
                      variant="default"
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground"
                    >
                      Current Plan
                    </Badge>
                  ) : plan.popular ? (
                    <Badge
                      variant="default"
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground"
                    >
                      Most Popular
                    </Badge>
                  ) : null}

                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        plan.popular
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <plan.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">
                      {plan.name}
                    </h3>
                  </div>

                  <div className="mb-4">
                    <span className="text-4xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {plan.period}
                    </span>
                  </div>

                  <p className="text-muted-foreground mb-6">{plan.description}</p>

                  {canUpgrade ? (
                    <Link to="/payment">
                      <Button
                        variant="accent"
                        className="w-full mb-6"
                      >
                        {ctaLabel}
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant={isCurrent ? "accent" : "outline"}
                      className="w-full mb-6"
                      disabled
                    >
                      {ctaLabel}
                    </Button>
                  )}

                  <div className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                    {plan.limitations.map((limitation) => (
                      <div
                        key={limitation}
                        className="flex items-start gap-3 opacity-50"
                      >
                        <Check className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {limitation}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="container max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground text-center mb-12">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {[
                {
                  q: "Can I cancel my subscription anytime?",
                  a: "Yes, you can cancel your subscription at any time. Your access will continue until the end of your billing period.",
                },
                {
                  q: "What payment methods do you accept?",
                  a: "We accept all major credit cards, debit cards, and UPI payments through our secure payment gateway.",
                },
                {
                  q: "Is there a free trial for Pro?",
                  a: "Yes! Pro plan comes with a 7-day free trial. No credit card required to start.",
                },
                {
                  q: "Can I upgrade or downgrade my plan?",
                  a: "Absolutely. You can change your plan at any time. The change will be reflected in your next billing cycle.",
                },
              ].map((faq) => (
                <div
                  key={faq.q}
                  className="bg-card rounded-lg border border-border p-6"
                >
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {faq.q}
                  </h3>
                  <p className="text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
