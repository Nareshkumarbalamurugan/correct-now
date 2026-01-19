import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CheckCircle,
  CreditCard,
  Shield,
  ArrowLeft,
  Smartphone,
} from "lucide-react";
import { Link } from "react-router-dom";

const Payment = () => {
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    // Payment integration will be added here
    setTimeout(() => setIsProcessing(false), 2000);
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
              Complete your purchase
            </h1>
            <p className="text-muted-foreground mb-8">
              You're upgrading to the Pro plan
            </p>

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
                <>
                  {/* Card Details */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardName">Name on card</Label>
                      <Input
                        id="cardName"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">Card number</Label>
                      <div className="relative">
                        <Input
                          id="cardNumber"
                          placeholder="1234 5678 9012 3456"
                          className="pr-12"
                          required
                        />
                        <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiry">Expiry date</Label>
                        <Input id="expiry" placeholder="MM/YY" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cvv">CVV</Label>
                        <Input
                          id="cvv"
                          placeholder="123"
                          type="password"
                          maxLength={4}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="upiId">UPI ID</Label>
                    <Input
                      id="upiId"
                      placeholder="yourname@upi"
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You'll receive a payment request on your UPI app
                  </p>
                </div>
              )}

              {/* Billing Address */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Billing Address</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" placeholder="India" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" placeholder="Maharashtra" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" placeholder="123 Main Street" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="Mumbai" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP / Postal code</Label>
                    <Input id="zip" placeholder="400001" required />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full h-12 text-base"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  "Pay ₹9.00"
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
                  <span className="text-foreground">₹9.00/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Billed monthly</span>
                  <span className="text-muted-foreground">Cancel anytime</span>
                </div>
              </div>

              <div className="border-t border-border pt-4 mb-6">
                <div className="flex justify-between text-lg font-semibold">
                  <span className="text-foreground">Total due today</span>
                  <span className="text-foreground">₹9.00</span>
                </div>
              </div>

              <div className="bg-accent/10 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-foreground mb-2">
                  What's included:
                </h3>
                <ul className="space-y-2">
                  {[
                    "2,000 words per check",
                    "Unlimited checks",
                    "Advanced grammar fixes",
                    "Check history (30 days)",
                    "Priority processing",
                  ].map((feature) => (
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
