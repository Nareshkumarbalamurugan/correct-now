import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { doc as firestoreDoc, onSnapshot } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

const Header = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [planName, setPlanName] = useState<"Free" | "Pro">("Free");
  const [credits, setCredits] = useState(0);
  const [wordLimit, setWordLimit] = useState(200);
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [creditsUsed, setCreditsUsed] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const db = getFirebaseDb();
    const unsub = onAuthStateChanged(auth, async (current) => {
      setIsAuthenticated(Boolean(current));
      if (!current) {
        setUserName("");
        setUserEmail("");
        setPlanName("Free");
        setCredits(0);
        setWordLimit(200);
        setSubscriptionStatus("");
        setCreditsUsed(0);
        return;
      }
      setUserName(current.displayName || "User");
      setUserEmail(current.email || "");
      if (db) {
        const ref = firestoreDoc(db, `users/${current.uid}`);
        onSnapshot(ref, (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const planField = String(data?.plan || "").toLowerCase();
          const entitlementPlan =
            Number(data?.wordLimit) >= 5000 || planField === "pro";
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
          setPlanName(plan);
          setCredits(Number(data?.credits || (plan === "Pro" ? 50000 : 0)));
          setWordLimit(Number(data?.wordLimit || (plan === "Pro" ? 5000 : 200)));
          setSubscriptionStatus(String(data?.subscriptionStatus || ""));
          
          // Check if credits should reset (monthly billing cycle)
          const lastResetDate = data?.creditsResetDate
            ? new Date(String(data.creditsResetDate))
            : data?.subscriptionUpdatedAt
            ? new Date(String(data.subscriptionUpdatedAt))
            : data?.creditsUpdatedAt
            ? new Date(String(data.creditsUpdatedAt))
            : null;
          const now = new Date();
          const shouldReset =
            plan === "Pro" &&
            isActive &&
            Boolean(lastResetDate) &&
            now.getTime() - lastResetDate.getTime() > 30 * 24 * 60 * 60 * 1000;

          if (shouldReset) {
            // Reset usage for new billing cycle
            setCreditsUsed(0);
          } else {
            const usedValue = Number(data?.creditsUsed || 0);
            setCreditsUsed(usedValue);
          }
        });
      }
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl flex flex-col gap-3 py-3 md:flex-row md:items-center">
        <div className="flex-1 flex items-center min-w-0">
          <Link to="/" className="flex items-center">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="w-64 h-12 object-contain"
              loading="eager"
            />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
          <Link
            to="/features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
        </nav>


        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-full bg-accent text-accent-foreground text-sm font-semibold">
                  {(userName || "U").charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground truncate">{userName || "User"}</div>
                  <div className="truncate">{userEmail}</div>
                </div>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground space-y-1">
                  <div>Plan: <span className="text-foreground font-medium">{planName}</span></div>
                  <div>Word limit: <span className="text-foreground font-medium">{wordLimit.toLocaleString()}</span></div>
                  {planName === "Pro" && (
                    <div>Credits: <span className="text-foreground font-medium">{credits.toLocaleString()}</span></div>
                  )}
                  {subscriptionStatus && (
                    <div>Status: <span className="text-foreground font-medium">{subscriptionStatus}</span></div>
                  )}
                </div>
                <div className="px-2 pb-2">
                  {planName === "Pro" && (
                    <>
                      <div className="text-xs text-muted-foreground mb-1">
                        Usage: {creditsUsed.toLocaleString()} / {credits.toLocaleString() || "0"}
                      </div>
                      <Progress value={credits ? Math.min(100, (creditsUsed / credits) * 100) : 0} />
                    </>
                  )}
                  {planName === "Pro" && creditsUsed >= credits && String(subscriptionStatus).toLowerCase() === "active" && (
                    <Button
                      variant="accent"
                      size="sm"
                      className="w-full mt-2 text-xs h-7"
                      onClick={() => navigate("/payment?mode=credits")}
                    >
                      Buy More Credits
                    </Button>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/pricing")}>Manage Plan</DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="h-9 px-3">
                  Log in
                </Button>
              </Link>
              <Link to="/auth?mode=register">
                <Button variant="accent" size="sm" className="h-9 px-3">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
