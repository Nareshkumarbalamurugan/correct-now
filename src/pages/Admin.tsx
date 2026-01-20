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
import { getFirebaseDb } from "@/lib/firebase";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
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
  const [activeTab, setActiveTab] = useState<
    "overview" | "users" | "logs" | "suggestions" | "billing" | "settings"
  >("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

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

  useEffect(() => {
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
      const local = getSuggestions();
      const remote = await fetchRemoteSuggestions();
      setSuggestions(mergeSuggestions(local, remote));
    };
    loadSuggestions();

    const handleStorage = () => loadSuggestions();
    window.addEventListener("correctnow:suggestions-updated", handleStorage);
    return () => window.removeEventListener("correctnow:suggestions-updated", handleStorage);
  }, []);

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
                { id: "logs", icon: Activity, label: "Activity Logs" },
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
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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
                              <Button variant="ghost" size="sm">
                                View
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

            {activeTab === "logs" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    Activity Logs
                  </h1>
                  <p className="text-muted-foreground">
                    Real-time platform activity monitoring
                  </p>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-foreground">
                      Recent Activity
                    </h2>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Filter className="w-4 h-4 mr-2" />
                        Filter
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        action: "Check completed",
                        user: "john@example.com",
                        details: "1,250 words, 8 corrections",
                        time: "2 min ago",
                      },
                      {
                        action: "New signup",
                        user: "newuser@gmail.com",
                        details: "Free plan",
                        time: "5 min ago",
                      },
                      {
                        action: "Plan upgraded",
                        user: "jane@example.com",
                        details: "Free → Pro",
                        time: "12 min ago",
                      },
                      {
                        action: "Check completed",
                        user: "mike@example.com",
                        details: "890 words, 3 corrections",
                        time: "15 min ago",
                      },
                      {
                        action: "Check completed",
                        user: "sarah@example.com",
                        details: "2,000 words, 15 corrections",
                        time: "18 min ago",
                      },
                    ].map((log, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-3 border-b border-border last:border-0"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              log.action === "New signup"
                                ? "bg-green-500"
                                : log.action === "Plan upgraded"
                                ? "bg-blue-500"
                                : "bg-accent"
                            }`}
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {log.action}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.user} · {log.details}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {log.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
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
                    <p className="text-3xl font-bold text-foreground">₹8,420</p>
                    <p className="text-sm text-green-500 mt-1">+6% MoM</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Active Subscriptions</span>
                      <Users className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">842</p>
                    <p className="text-sm text-muted-foreground mt-1">Free + Paid</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Churn</span>
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">2.1%</p>
                    <p className="text-sm text-muted-foreground mt-1">Last 30 days</p>
                  </div>
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Refunds</span>
                      <FileText className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">₹320</p>
                    <p className="text-sm text-muted-foreground mt-1">This month</p>
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
                        {[
                          { name: "john@example.com", plan: "Pro", amount: "₹9", status: "Paid", date: "Jan 18" },
                          { name: "sarah@example.com", plan: "Team", amount: "₹49", status: "Paid", date: "Jan 17" },
                          { name: "alex@example.com", plan: "Pro", amount: "₹9", status: "Paid", date: "Jan 16" },
                        ].map((payment) => (
                          <tr key={`${payment.name}-${payment.date}`} className="border-b border-border last:border-0">
                            <td className="py-3 text-sm text-foreground">{payment.name}</td>
                            <td className="py-3 text-sm text-foreground">{payment.plan}</td>
                            <td className="py-3 text-sm text-foreground">{payment.amount}</td>
                            <td className="py-3 text-sm">
                              <Badge variant="secondary">{payment.status}</Badge>
                            </td>
                            <td className="py-3 text-sm text-muted-foreground">{payment.date}</td>
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
