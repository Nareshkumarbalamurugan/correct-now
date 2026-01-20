import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Users,
  FileText,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
  Settings,
  LogOut,
  Search,
  Download,
  Filter,
  MessageSquare,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { collection, collectionGroup, getDocs, doc, updateDoc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  fetchRemoteSuggestions,
  getSuggestions,
  mergeSuggestions,
  updateSuggestionStatus,
  type SuggestionItem,
} from "@/lib/suggestions";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  wordLimit?: number;
  credits?: number;
  subscriptionStatus?: string;
  updatedAt?: string;
  createdAt?: string;
};

const Admin = () => {
  const auth = getFirebaseAuth();
  const [user, loading] = useAuthState(auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "suggestions" | "billing" | "settings"
  >("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

  // User limit management
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [limitType, setLimitType] = useState<"unlimited" | "limited" | "disabled">("limited");
  const [wordLimitValue, setWordLimitValue] = useState("2000");
  const [creditsValue, setCreditsValue] = useState("50000");

  // All hooks must be called before any conditional returns
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuggestions = useMemo(() => {
    if (!suggestionSearch.trim()) return suggestions;
    const query = suggestionSearch.toLowerCase();
    return suggestions.filter(
      (item) =>
        item.message.toLowerCase().includes(query) ||
        (item.email || "").toLowerCase().includes(query)
    );
  }, [suggestions, suggestionSearch]);

  const proUsers = users.filter((user) => user.plan === "Pro").length;
  const totalUsers = users.length;
  const conversionRate = totalUsers ? Math.round((proUsers / totalUsers) * 100) : 0;
  const monthlyRevenue = proUsers * 500;
  const isToday = (iso?: string) => {
    if (!iso) return false;
    const date = new Date(iso);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  };
  const newUsersToday = users.filter((user) => isToday(user.createdAt) || isToday(user.updatedAt)).length;

  const billingRows = useMemo(() => {
    return users
      .filter((user) => user.plan === "Pro" || user.subscriptionStatus)
      .map((user) => {
        const statusRaw = String(user.subscriptionStatus || "").toLowerCase();
        const statusLabel = statusRaw
          ? statusRaw === "active"
            ? "Paid"
            : statusRaw === "past_due"
              ? "Past Due"
              : "Cancelled"
          : user.plan === "Pro"
            ? "Paid"
            : "Free";
        return {
          name: user.email || user.name,
          plan: user.plan,
          amount: user.plan === "Pro" ? "₹500" : "₹0",
          status: statusLabel,
          date: user.updatedAt || user.createdAt || new Date().toISOString(),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [users]);

  useEffect(() => {
    if (!user) return; // Don't load data if not logged in
    
    const loadUsers = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      const snap = await getDocs(collection(db, "users"));
      const list: AdminUser[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        return {
          id: docSnap.id,
          name: data?.name || "User",
          email: data?.email || "",
          plan: String(data?.plan || "free").toLowerCase() === "pro" ? "Pro" : "Free",
          wordLimit: data?.wordLimit,
          credits: data?.credits,
          subscriptionStatus: data?.subscriptionStatus,
          updatedAt: data?.updatedAt,
          createdAt: data?.createdAt,
        };
      });
      setUsers(list);

      const docsSnap = await getDocs(collectionGroup(db, "docs"));
      setTotalDocs(docsSnap.size);

      let words = 0;
      docsSnap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        const text = typeof data?.text === "string" ? data.text : "";
        words += text.trim().split(/\s+/).filter(Boolean).length;
      });
      setTotalWords(words);
    };

    loadUsers();

    const loadSuggestions = async () => {
      try {
        const local = getSuggestions();
        const remote = await fetchRemoteSuggestions();
        setSuggestions(mergeSuggestions(local, remote));
      } catch (error) {
        console.error("Failed to load suggestions:", error);
        // Use local suggestions only if remote fails
        setSuggestions(getSuggestions());
      }
    };
    loadSuggestions();

    const handleStorage = () => loadSuggestions();
    window.addEventListener("correctnow:suggestions-updated", handleStorage);
    return () => window.removeEventListener("correctnow:suggestions-updated", handleStorage);
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setLoginError(error.message || "Failed to login");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleEditUser = (userId: string, userData: AdminUser) => {
    setEditingUserId(userId);
    setWordLimitValue(String(userData.wordLimit || 2000));
    setCreditsValue(String(userData.credits || 50000));
    if (userData.wordLimit === 999999) {
      setLimitType("unlimited");
    } else if (userData.wordLimit === 0) {
      setLimitType("disabled");
    } else {
      setLimitType("limited");
    }
  };

  const handleSaveUserLimits = async () => {
    if (!editingUserId) return;
    
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const updates: any = {};
      
      if (limitType === "unlimited") {
        updates.wordLimit = 999999;
        updates.credits = 999999;
        updates.plan = "pro";
      } else if (limitType === "disabled") {
        updates.wordLimit = 0;
        updates.credits = 0;
        updates.plan = "free";
      } else {
        const wordLimit = parseInt(wordLimitValue);
        const credits = parseInt(creditsValue);
        updates.wordLimit = isNaN(wordLimit) ? 2000 : wordLimit;
        updates.credits = isNaN(credits) ? 50000 : credits;
      }

      updates.updatedAt = new Date().toISOString();

      const userRef = doc(db, "users", editingUserId);
      await updateDoc(userRef, updates);

      // Reload users
      const snap = await getDocs(collection(db, "users"));
      const list: AdminUser[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        return {
          id: docSnap.id,
          name: data?.name || "User",
          email: data?.email || "",
          plan: String(data?.plan || "free").toLowerCase() === "pro" ? "Pro" : "Free",
          wordLimit: data?.wordLimit,
          credits: data?.credits,
          subscriptionStatus: data?.subscriptionStatus,
          updatedAt: data?.updatedAt,
          createdAt: data?.createdAt,
        };
      });
      setUsers(list);
      setEditingUserId(null);
    } catch (error) {
      console.error("Failed to update user limits:", error);
      alert("Failed to update user limits");
    }
  };

  // Show login form if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="w-full max-w-md p-8">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center mb-2">Admin Login</h1>
            <p className="text-center text-muted-foreground mb-8">
              Sign in to access the admin panel
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {loginError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loggingIn}
              >
                {loggingIn ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent">
                <CheckCircle className="w-5 h-5 text-accent-foreground" />
              </div>
              <span className="text-xl font-semibold text-foreground">
                CorrectNow
              </span>
            </Link>
            <Badge variant="secondary">Admin</Badge>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-medium text-accent-foreground">A</span>
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
                { id: "overview", icon: BarChart3, label: "Dashboard" },
                { id: "users", icon: Users, label: "Users" },
                { id: "suggestions", icon: MessageSquare, label: "Suggestions" },
                { id: "billing", icon: CreditCard, label: "Billing & Plans" },
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
                onClick={() => auth.signOut()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Admin Dashboard
                  </h1>
                  <p className="text-muted-foreground">
                    Overview of platform activity and metrics
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Total Users
                      </span>
                      <Users className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {totalUsers.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Total registered users
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Active Today
                      </span>
                      <Activity className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {proUsers}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pro subscribers
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Checks Today
                      </span>
                      <CheckCircle className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {totalDocs.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Total checks stored
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Words Processed
                      </span>
                      <FileText className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {(totalWords / 1000).toFixed(0)}K
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Today</p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Pro Subscribers
                      </span>
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {proUsers}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {conversionRate}% conversion
                    </p>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">
                        Monthly Revenue
                      </span>
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      ₹{monthlyRevenue.toLocaleString("en-IN")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Based on active Pro users
                    </p>
                  </div>
                </div>

                {/* Daily Stats Table */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-foreground">
                      Daily Activity
                    </h2>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">
                            Checks
                          </th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">
                            Words
                          </th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">
                            New Users
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border last:border-0">
                          <td className="py-3 text-sm text-foreground">Today</td>
                          <td className="py-3 text-sm text-foreground">{totalDocs}</td>
                          <td className="py-3 text-sm text-foreground">{(totalWords / 1000).toFixed(0)}K</td>
                          <td className="py-3 text-sm text-foreground">+{newUsersToday}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Users
                    </h1>
                    <p className="text-muted-foreground">
                      Manage all registered users
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export Users
                  </Button>
                </div>

                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button variant="outline">
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </Button>
                </div>

                {/* Users Table */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            User
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Plan
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Credits
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Word Limit
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Joined
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                                  <span className="text-xs font-medium text-accent-foreground">
                                    {user.name.charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {user.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <Badge
                                variant={
                                  user.plan === "Pro"
                                    ? "default"
                                    : user.plan === "Team"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {user.plan}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {user.credits ? user.credits.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-6 text-sm text-foreground">
                              {user.wordLimit ? user.wordLimit.toLocaleString() : "—"}
                            </td>
                            <td className="py-4 px-6 text-sm text-muted-foreground">
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : user.updatedAt
                                ? new Date(user.updatedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditUser(user.id, user)}
                              >
                                Manage Limits
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Edit User Limits Dialog */}
                {editingUserId && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl">
                      <h3 className="text-lg font-semibold text-foreground mb-4">
                        Manage User Limits
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Limit Type</label>
                          <select
                            value={limitType}
                            onChange={(e) => setLimitType(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                          >
                            <option value="limited">Limited</option>
                            <option value="unlimited">Unlimited</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>

                        {limitType === "limited" && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-2">Word Limit</label>
                              <Input
                                type="number"
                                value={wordLimitValue}
                                onChange={(e) => setWordLimitValue(e.target.value)}
                                placeholder="2000"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2">Credits</label>
                              <Input
                                type="number"
                                value={creditsValue}
                                onChange={(e) => setCreditsValue(e.target.value)}
                                placeholder="50000"
                              />
                            </div>
                          </>
                        )}

                        {limitType === "unlimited" && (
                          <p className="text-sm text-muted-foreground">
                            User will have unlimited word limit and credits
                          </p>
                        )}

                        {limitType === "disabled" && (
                          <p className="text-sm text-destructive">
                            User will be unable to use the service
                          </p>
                        )}
                      </div>

                      <div className="flex gap-3 mt-6">
                        <Button onClick={handleSaveUserLimits} className="flex-1">
                          Save Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingUserId(null)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "suggestions" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">
                      Suggestions
                    </h1>
                    <p className="text-muted-foreground">
                      User ideas and product feedback
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search suggestions..."
                      value={suggestionSearch}
                      onChange={(e) => setSuggestionSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Message
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            User
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSuggestions.length ? (
                          filteredSuggestions.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-4 px-6 text-sm text-foreground max-w-xl">
                                {item.message}
                              </td>
                              <td className="py-4 px-6 text-sm text-muted-foreground">
                                {item.email || "Anonymous"}
                              </td>
                              <td className="py-4 px-6">
                                <Badge
                                  variant={
                                    item.status === "resolved"
                                      ? "secondary"
                                      : item.status === "reviewed"
                                      ? "default"
                                      : "outline"
                                  }
                                >
                                  {item.status}
                                </Badge>
                              </td>
                              <td className="py-4 px-6 text-sm text-muted-foreground">
                                {new Date(item.createdAt).toLocaleString()}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateSuggestionStatus(item.id, "reviewed")}
                                  >
                                    Mark reviewed
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateSuggestionStatus(item.id, "resolved")}
                                  >
                                    Resolve
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>
                              No suggestions yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "billing" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Billing & Plans
                  </h1>
                  <p className="text-muted-foreground">
                    Manage subscriptions, payments, and revenue
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">MRR</span>
                      <CreditCard className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">₹{monthlyRevenue.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-1">Based on active Pro users</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Active Subscriptions</span>
                      <Users className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{proUsers.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-1">Active Pro plans</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Churn</span>
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{conversionRate}%</p>
                    <p className="text-sm text-muted-foreground mt-1">Pro conversion</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Refunds</span>
                      <FileText className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">₹0</p>
                    <p className="text-sm text-muted-foreground mt-1">No refunds tracked</p>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-foreground">
                      Recent Payments
                    </h2>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">Customer</th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">Plan</th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">Amount</th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-3 text-sm font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingRows.length ? (
                          billingRows.map((payment) => (
                            <tr key={`${payment.name}-${payment.date}`} className="border-b border-border last:border-0">
                              <td className="py-3 text-sm text-foreground">{payment.name}</td>
                              <td className="py-3 text-sm text-foreground">{payment.plan}</td>
                              <td className="py-3 text-sm text-foreground">{payment.amount}</td>
                              <td className="py-3 text-sm">
                                <Badge variant="secondary">{payment.status}</Badge>
                              </td>
                              <td className="py-3 text-sm text-muted-foreground">
                                {new Date(payment.date).toLocaleDateString()}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>
                              No billing activity yet.
                            </td>
                          </tr>
                        )}
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
                    Platform configuration and preferences
                  </p>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    API Configuration
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Gemini API Status
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-foreground">Connected</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Update API Key
                    </Button>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    Rate Limits
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Free Plan - Words/Check
                      </label>
                      <p className="text-foreground font-medium">500</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Free Plan - Checks/Day
                      </label>
                      <p className="text-foreground font-medium">10</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Pro Plan - Words/Check
                      </label>
                      <p className="text-foreground font-medium">2,000</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">
                        Pro Plan - Checks/Day
                      </label>
                      <p className="text-foreground font-medium">Unlimited</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-4">
                    Edit Limits
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Admin;
