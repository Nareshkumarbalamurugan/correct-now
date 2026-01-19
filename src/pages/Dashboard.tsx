import { useEffect, useState } from "react";
import {
  CheckCircle,
  FileText,
  Clock,
  TrendingUp,
  Settings,
  LogOut,
  Crown,
  ChevronRight,
  Calendar,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const mockHistory = [
  {
    id: 1,
    date: "2024-01-15",
    time: "14:32",
    words: 1250,
    changes: 8,
    language: "English",
  },
  {
    id: 2,
    date: "2024-01-15",
    time: "10:15",
    words: 890,
    changes: 5,
    language: "Hindi",
  },
  {
    id: 3,
    date: "2024-01-14",
    time: "16:45",
    words: 2000,
    changes: 12,
    language: "English",
  },
  {
    id: 4,
    date: "2024-01-14",
    time: "09:20",
    words: 450,
    changes: 3,
    language: "Spanish",
  },
  {
    id: 5,
    date: "2024-01-13",
    time: "11:30",
    words: 1800,
    changes: 15,
    language: "English",
  },
];

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "settings">("overview");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const navigate = useNavigate();
  
  const plan = "Free";
  const wordsUsedToday = 0;
  const wordLimitToday = 10000;
  const checksToday = 0;
  const totalChecks = 0;
  const memberSince = "2024";

  const usagePercentage = (wordsUsedToday / wordLimitToday) * 100;

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (current) => {
      if (!current) {
        navigate("/auth");
        return;
      }
      setUser({
        name: current.displayName || "User",
        email: current.email || "",
      });
    });
    return () => unsub();
  }, [navigate]);

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent">
              <CheckCircle className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">
              CorrectNow
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                New Check
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-sm font-medium text-accent-foreground">
                  {user?.name?.charAt(0) ?? "U"}
                </span>
              </div>
              <span className="text-sm font-medium text-foreground hidden sm:block">
                {user?.name ?? "User"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 shrink-0">
            <nav className="space-y-1">
              {[
                { id: "overview", icon: BarChart3, label: "Overview" },
                { id: "history", icon: Clock, label: "Check History" },
                { id: "settings", icon: Settings, label: "Settings" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={handleSignOut}
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>

            {/* Upgrade Card */}
            {plan === "Free" && (
              <div className="mt-8 p-4 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20">
                <Crown className="w-8 h-8 text-accent mb-3" />
                <h3 className="font-semibold text-foreground mb-1">
                  Upgrade to Pro
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Get unlimited checks and advanced features
                </p>
                <Link to="/pricing">
                  <Button variant="accent" size="sm" className="w-full">
                    View Plans
                  </Button>
                </Link>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-8">
                {/* Welcome */}
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Welcome back, {user?.name?.split(" ")[0] ?? "User"}!
                  </h1>
                  <p className="text-muted-foreground">
                    Here's your proofreading activity summary
                  </p>
                </div>

                {/* Stats Cards */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Words Today
                      </span>
                      <FileText className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {wordsUsedToday.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      of {wordLimitToday.toLocaleString()} limit
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Checks Today
                      </span>
                      <CheckCircle className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {checksToday}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {plan === "Pro" ? "Unlimited" : "10 remaining"}
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Total Checks
                      </span>
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {totalChecks}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All time
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Current Plan
                      </span>
                      <Crown className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {plan}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Since {memberSince}
                    </p>
                  </div>
                </div>

                {/* Usage Progress */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      Daily Usage
                    </h2>
                    <Badge variant="secondary">
                      {Math.round(usagePercentage)}% used
                    </Badge>
                  </div>
                  <Progress value={usagePercentage} className="h-3 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {(wordLimitToday - wordsUsedToday).toLocaleString()}{" "}
                    words remaining today
                  </p>
                </div>

                {/* Recent Activity */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      Recent Checks
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("history")}
                    >
                      View all
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {mockHistory.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-3 border-b border-border last:border-0"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {item.words.toLocaleString()} words · {item.changes}{" "}
                              corrections
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.language} · {item.date} at {item.time}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Check History
                  </h1>
                  <p className="text-muted-foreground">
                    View your past proofreading sessions
                  </p>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Words
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Corrections
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Language
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {mockHistory.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-foreground">
                                  {item.date}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {item.time}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {item.words.toLocaleString()}
                            </td>
                            <td className="py-4 px-6">
                              <Badge variant="secondary">{item.changes}</Badge>
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {item.language}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <Button variant="ghost" size="sm">
                                View Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Settings
                  </h1>
                  <p className="text-muted-foreground">
                    Manage your account and preferences
                  </p>
                </div>

                {/* Profile Section */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    Profile
                  </h2>
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">
                          Full Name
                        </label>
                        <p className="text-foreground font-medium">{user.name}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">
                          Email
                        </label>
                        <p className="text-foreground font-medium">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Edit Profile
                    </Button>
                  </div>
                </div>

                {/* Subscription Section */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    Subscription
                  </h2>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-foreground font-medium">
                        {user.plan} Plan
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.plan === "Pro"
                          ? "Billed monthly · Next billing: Feb 15, 2024"
                          : "Free forever"}
                      </p>
                    </div>
                    <Link to="/pricing">
                      <Button variant="outline" size="sm">
                        {user.plan === "Pro" ? "Manage" : "Upgrade"}
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-card rounded-xl border border-destructive/30 p-6">
                  <h2 className="text-lg font-semibold text-destructive mb-4">
                    Danger Zone
                  </h2>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-foreground font-medium">
                        Delete Account
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all data
                      </p>
                    </div>
                    <Button variant="destructive" size="sm">
                      Delete Account
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
