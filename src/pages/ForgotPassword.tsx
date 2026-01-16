import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Mail, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Backend integration will be added here
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent">
              <CheckCircle className="w-6 h-6 text-accent-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">CorrectNow</span>
          </Link>

          {!isSubmitted ? (
            <>
              <h2 className="text-2xl font-bold text-foreground">
                Forgot your password?
              </h2>
              <p className="mt-2 text-muted-foreground">
                No worries, we'll send you reset instructions.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Check your email
              </h2>
              <p className="mt-2 text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="text-foreground font-medium">{email}</span>
              </p>
            </>
          )}
        </div>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="accent"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                "Reset password"
              )}
            </Button>

            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </form>
        ) : (
          <div className="space-y-4">
            <Button
              variant="accent"
              className="w-full"
              onClick={() => window.open("mailto:", "_blank")}
            >
              Open email app
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the email?{" "}
              <button
                onClick={() => setIsSubmitted(false)}
                className="text-accent hover:underline"
              >
                Click to resend
              </button>
            </p>

            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
