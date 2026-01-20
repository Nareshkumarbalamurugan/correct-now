import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CheckCircle,
  CreditCard,
  Shield,
  ArrowLeft,
  Smartphone,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { doc as firestoreDoc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const Payment = () => {
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [cardProvider, setCardProvider] = useState("razorpay");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<"Free" | "Pro">("Free");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [selectedCreditPack, setSelectedCreditPack] = useState<"basic" | "saver">("basic");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const isCreditPurchase = searchParams.get("mode") === "credits";
  const creditPacks = {
    basic: { credits: 10000, price: 50, label: "Basic Pack" },
    saver: { credits: 25000, price: 100, label: "Ultra Saver" }
  };
  const creditPack = creditPacks[selectedCreditPack];
  const canBuyCredits = currentPlan === "Pro" && String(subscriptionStatus).toLowerCase() === "active";

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
        setSubscriptionStatus("");
        return;
      }
      const ref = firestoreDoc(db, `users/${user.uid}`);
      snapUnsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const planField = String(data?.plan || "").toLowerCase();
        const entitlementPlan = Number(data?.wordLimit) >= 2000 || planField === "pro";
        const status = String(data?.subscriptionStatus || "").toLowerCase();
        const updatedAt = data?.subscriptionUpdatedAt
          ? new Date(String(data.subscriptionUpdatedAt))
          : null;
        const isRecent = updatedAt
          ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31
          : false;
        const isActive = status === "active" && (updatedAt ? isRecent : true);
        setCurrentPlan(isActive && entitlementPlan ? "Pro" : "Free");
        setSubscriptionStatus(status);
      });
    });

    return () => {
      if (snapUnsub) snapUnsub();
      unsub();
    };
  }, []);

  const loadRazorpay = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const scriptLoaded = await loadRazorpay();
      if (!scriptLoaded) {
        throw new Error("Razorpay SDK failed to load");
      }

      const keyRes = await fetch(`${apiBase}/api/razorpay/key`);
      if (!keyRes.ok) throw new Error("Unable to fetch payment key");
      const { keyId } = await keyRes.json();

      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      const db = getFirebaseDb();

      if (isCreditPurchase) {
        if (!user || !db) {
          throw new Error("Please sign in to buy credits");
        }
        if (!canBuyCredits) {
          throw new Error("Credits add-ons are available for active Pro plans only");
        }

        const orderRes = await fetch(`${apiBase}/api/razorpay/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: creditPack.price, credits: creditPack.credits }),
        });
        if (!orderRes.ok) throw new Error("Unable to create order");
        const order = await orderRes.json();

        const options = {
          key: keyId,
          order_id: order.id,
          name: "CorrectNow",
          description: `${creditPack.credits.toLocaleString()} credits pack`,
          image: "/Icon/correctnow logo final2.png",
          method: paymentMethod === "upi" ? { upi: true } : { card: true, upi: false },
          prefill: {
            name: user?.displayName || "",
            email: user?.email || "",
          },
          theme: { color: "#2563EB" },
          handler: async () => {
            const ref = firestoreDoc(db, `users/${user.uid}`);
            const snap = await getDoc(ref);
            const currentCredits = Number(snap.exists() ? snap.data()?.credits : 0) || 0;
            await setDoc(
              ref,
              {
                credits: currentCredits + creditPack.credits,
                creditsUpdatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            toast.success("Credits added successfully");
            navigate("/");
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", (response: any) => {
          toast.error(response?.error?.description || "Payment failed");
        });
        rzp.open();
        return;
      }

      const subRes = await fetch(`${apiBase}/api/razorpay/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalCount: 1, period: "daily", interval: 1 }),
      });
      if (!subRes.ok) throw new Error("Unable to create subscription");
      const subscription = await subRes.json();

      const options = {
        key: keyId,
        subscription_id: subscription.id,
        name: "CorrectNow",
        description: "Pro plan subscription",
        image: "/Icon/correctnow logo final2.png",
        method: paymentMethod === "upi" ? { upi: true } : { card: true, upi: false },
        prefill: {
          name: user?.displayName || "",
          email: user?.email || "",
        },
        theme: { color: "#2563EB" },
        handler: async () => {
          if (user && db) {
            const ref = firestoreDoc(db, `users/${user.uid}`);
            await setDoc(
              ref,
              {
                plan: "pro",
                wordLimit: 2000,
                credits: 50000,
                subscriptionId: subscription?.id || "",
                subscriptionStatus: "active",
                subscriptionUpdatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
          toast.success("Payment successful");
          navigate("/");
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        toast.error(response?.error?.description || "Payment failed");
      });
      rzp.open();
    } catch (error: any) {
      toast.error(error?.message || "Payment failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent">
              <CheckCircle className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">
              CorrectNow
            </span>
          </Link>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto py-12 px-4">
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to pricing
        </Link>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Payment Form */}
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {isCreditPurchase ? "Buy add-on credits" : "Complete your purchase"}
            </h1>
            <p className="text-muted-foreground mb-8">
              {isCreditPurchase
                ? "Add extra credits to keep checking without interruptions"
                : "You're upgrading to the Pro plan"}
            </p>

            {isCreditPurchase && !canBuyCredits && (
              <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Credits add-ons are available only for active Pro subscribers.
                <div className="mt-2">
                  <Link to="/payment" className="text-accent hover:underline">
                    Start Pro subscription
                  </Link>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Payment Method Selection */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Payment Method</Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  className="grid grid-cols-2 gap-4"
                >
                  <Label
                    htmlFor="card"
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      paymentMethod === "card"
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <RadioGroupItem value="card" id="card" />
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                    <span>Credit/Debit Card</span>
                  </Label>
                  <Label
                    htmlFor="upi"
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      paymentMethod === "upi"
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <RadioGroupItem value="upi" id="upi" />
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <span>UPI</span>
                  </Label>
                </RadioGroup>
              </div>

              {paymentMethod === "card" ? (
                <div className="space-y-4">
                  <Label className="text-base font-medium">Card Provider</Label>
                  <RadioGroup
                    value={cardProvider}
                    onValueChange={setCardProvider}
                    className="grid grid-cols-2 gap-4"
                  >
                    <Label
                      htmlFor="razorpay"
                      className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                        cardProvider === "razorpay"
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <RadioGroupItem value="razorpay" id="razorpay" />
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                      <span>Razorpay</span>
                    </Label>
                    <Label
                      htmlFor="stripe"
                      className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                        cardProvider === "stripe"
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <RadioGroupItem value="stripe" id="stripe" />
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                      <span>Stripe</span>
                    </Label>
                  </RadioGroup>
                  {cardProvider === "stripe" && (
                    <p className="text-sm text-muted-foreground">
                      Stripe checkout will be enabled once Stripe keys are configured.
                    </p>
                  )}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="accent"
                className="w-full h-12 text-base"
                disabled={
                  isProcessing ||
                  (paymentMethod === "card" && cardProvider === "stripe") ||
                  (isCreditPurchase && !canBuyCredits)
                }
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  `Pay ₹${isCreditPurchase ? creditPack.price : 1}`
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4" />
                <span>Secured by 256-bit SSL encryption</span>
              </div>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:pl-12">
            <div className="sticky top-8 bg-card rounded-2xl border border-border p-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pro Plan</span>
                  <span className="text-foreground">₹1/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Billed monthly</span>
                  <span className="text-muted-foreground">Cancel anytime</span>
                </div>
              </div>

              <div className="border-t border-border pt-4 mb-6">
                <div className="flex justify-between text-lg font-semibold">
                  <span className="text-foreground">Total due today</span>
                  <span className="text-foreground">
                    ₹{isCreditPurchase ? creditPack.price : 1}
                  </span>
                </div>
              </div>

              {isCreditPurchase && (
                <div className="mb-6">
                  <h3 className="font-medium text-foreground mb-3">Select Credit Pack</h3>
                  <RadioGroup value={selectedCreditPack} onValueChange={(value: any) => setSelectedCreditPack(value)}>
                    <div className="flex items-center space-x-2 p-4 border border-border rounded-lg hover:border-accent transition-colors cursor-pointer">
                      <RadioGroupItem value="basic" id="basic" />
                      <Label htmlFor="basic" className="flex-1 cursor-pointer">
                        <div className="font-medium text-foreground">Basic Pack - ₹50</div>
                        <div className="text-sm text-muted-foreground">10,000 credits</div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-4 border border-border rounded-lg hover:border-accent transition-colors cursor-pointer bg-accent/5">
                      <RadioGroupItem value="saver" id="saver" />
                      <Label htmlFor="saver" className="flex-1 cursor-pointer">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          Ultra Saver - ₹100
                          <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded">Best Value</span>
                        </div>
                        <div className="text-sm text-muted-foreground">25,000 credits</div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div className="bg-accent/10 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-foreground mb-2">
                  {isCreditPurchase ? "Credits pack" : "What's included:"}
                </h3>
                <ul className="space-y-2">
                  {(isCreditPurchase
                    ? [
                        `${creditPack.credits.toLocaleString()} credits added`,
                        "Use credits for extra checks",
                        "Credits never expire",
                      ]
                    : [
                        "2,000 words per check",
                        "Unlimited checks",
                        "Advanced grammar fixes",
                        "Check history (30 days)",
                        "Priority processing",
                      ]
                  ).map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle className="w-4 h-4 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                By confirming your payment, you agree to our{" "}
                <Link to="/terms" className="text-accent hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Payment;
