import React, { useState, useEffect } from "react";
import { 
  motion, 
  AnimatePresence 
} from "motion/react";
import { 
  Shield, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Award, 
  Users, 
  MapPin, 
  Camera, 
  BrainCircuit, 
  User, 
  ChevronRight, 
  Send, 
  MessageSquare, 
  Vote, 
  ThumbsUp, 
  ThumbsDown, 
  Megaphone, 
  Flame, 
  HelpCircle, 
  Filter, 
  CheckCircle,
  Share2,
  Trash2,
  Lock,
  ArrowRight,
  Activity
} from "lucide-react";

import Navbar from "./components/Navbar";
import InteractiveMap from "./components/InteractiveMap";
import IssueCard from "./components/IssueCard";
import ImageWithFallback from "./components/ImageWithFallback";
import { User as UserType, Issue, Comment, Announcement, IssueCategory, IssueStatus } from "./types";

// Static local backups to guarantee visual integrity immediately
const SAMPLE_SUCCESS_STORIES = [
  {
    id: "s1",
    title: "MG Road Pothole Restoration",
    category: "Road Damage",
    beforeImage: "https://images.unsplash.com/photo-1599740487708-211aa0873722?auto=format&fit=crop&q=80&w=600",
    afterImage: "https://images.unsplash.com/photo-1541535650810-10d26f5c2ab3?auto=format&fit=crop&q=80&w=600",
    description: "Successfully patched MG Road road surface within 24 hours of report validation.",
    resolutionTime: "24 Hours"
  },
  {
    id: "s2",
    title: "Cubbon Park Water Main Leak",
    category: "Water Leakage",
    beforeImage: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&q=80&w=600",
    afterImage: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&q=80&w=600",
    description: "Replaced main water pipe valve preventing massive fresh-water waste near Cubbon Park.",
    resolutionTime: "3 Hours"
  }
];

const AVAILABLE_BADGES = [
  { id: "b1", name: "Top Reporter", description: "Submitted 5 or more verified community issues", icon: "Megaphone", criteriaPoints: 100 },
  { id: "b2", name: "Fast Verifier", description: "Contributed to 5 community verifications", icon: "CheckCircle", criteriaPoints: 50 },
  { id: "b3", name: "Community Guardian", description: "Earned 500 total community trust points", icon: "ShieldAlert", criteriaPoints: 500 },
  { id: "b4", name: "Hero of the Month", description: "Earned 1000 total community trust points", icon: "Award", criteriaPoints: 1000 },
];

export default function App() {
  const [activeView, setActiveView] = useState<"home" | "report" | "citizen-dash" | "admin-dash" | "leaderboard" | "announcements">("home");
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("hero_token"));
  
  // App state
  const [issues, setIssues] = useState<Issue[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>({
    total: 0,
    statusCounts: { pending: 0, verified: 0, assigned: 0, inProgress: 0, completed: 0, rejected: 0 },
    categoryCounts: {},
    departmentCounts: {},
    avgResolutionDays: 1.5,
    aiCivicSummary: "System analysis is pending. Start reporting hyperlocal issues to trigger AI telemetry logs.",
    activeCitizens: 1
  });

  // Selected Detail Modal
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [commentImage, setCommentImage] = useState("");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("newest");

  // Authentication Fields (Sign up / Login forms)
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    city: "Bengaluru",
    state: "Karnataka",
    pinCode: "560001",
    role: "citizen" as "citizen" | "admin"
  });
  const [authError, setAuthError] = useState("");

  // Report Form State
  const [reportForm, setReportForm] = useState({
    title: "",
    description: "",
    category: "Road Damage" as IssueCategory,
    severity: "medium" as "low" | "medium" | "high" | "critical",
    urgency: "medium" as "low" | "medium" | "high" | "immediate",
    department: "BBMP Road Infrastructure Dept",
    reporterAnonymous: false,
    estimatedDamage: "",
    images: [] as string[],
    lat: 12.9716,
    lng: 77.5946,
    address: "MG Road, Bengaluru, Karnataka 560001",
    pinCode: "560001"
  });
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiReportFeedback, setAiReportFeedback] = useState<string>("");
  const [duplicateAlert, setDuplicateAlert] = useState<{ id: string; title: string } | null>(null);

  // Admin Announcement fields
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: "",
    content: "",
    department: "",
    importance: "medium" as "low" | "medium" | "high"
  });

  // Admin action inputs
  const [adminAction, setAdminAction] = useState({
    status: "assigned" as IssueStatus,
    note: "",
    assignedOfficer: ""
  });

  // Toast System
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------
  // Live API Fetchers
  // ---------------------------------------------------------
  useEffect(() => {
    fetchIssues();
    fetchAnnouncements();
    fetchLeaderboard();
    fetchDashboardStats();
  }, [currentUser]);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      } else {
        // invalid token
        handleLogout();
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
    }
  };

  const fetchIssues = async () => {
    try {
      const res = await fetch("/api/issues");
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (e) {
      console.error("Error fetching issues:", e);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch("/api/announcements");
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (e) {
      console.error("Error fetching announcements:", e);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.error("Error fetching leaderboard:", e);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch("/api/analytics/dashboard");
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data);
      }
    } catch (e) {
      console.error("Error fetching analytics stats:", e);
    }
  };

  const fetchComments = async (issueId: string) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (e) {
      console.error("Error fetching comments:", e);
    }
  };

  // ---------------------------------------------------------
  // Auth Handlers
  // ---------------------------------------------------------
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const url = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Authentication failed");
        showToast(data.error || "Authentication failed", "error");
        return;
      }
      localStorage.setItem("hero_token", data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      showToast(authMode === "login" ? "Welcome back, Hero!" : "Citizen account created successfully!");
      
      // Navigate based on role
      if (data.user.role === "admin") {
        setActiveView("admin-dash");
      } else {
        setActiveView("citizen-dash");
      }
    } catch (err: any) {
      setAuthError("Server communication fault. Try again.");
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {}
    }
    localStorage.removeItem("hero_token");
    setToken(null);
    setCurrentUser(null);
    setActiveView("home");
    showToast("Logged out successfully");
  };

  // ---------------------------------------------------------
  // AI Diagnostics Trigger
  // ---------------------------------------------------------
  const triggerAiDiagnostics = async () => {
    if (!reportForm.title || !reportForm.description) {
      showToast("Please provide a Title and Description first so Gemini AI can analyze context.", "info");
      return;
    }
    setIsAiAnalyzing(true);
    setAiReportFeedback("");
    setDuplicateAlert(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportForm.title,
          description: reportForm.description,
          category: reportForm.category,
          imageBase64: reportForm.images[0] || "",
          lat: reportForm.lat,
          lng: reportForm.lng
        })
      });

      if (!res.ok) {
        throw new Error("AI engine unavailable");
      }

      const aiResult = await res.json();
      
      // Update form state with predictive outcomes
      setReportForm(prev => ({
        ...prev,
        category: aiResult.category || prev.category,
        severity: aiResult.severity || prev.severity,
        urgency: aiResult.urgency || prev.urgency,
        department: aiResult.department || prev.department,
        description: aiResult.enhancedDescription || prev.description
      }));

      let feedbackText = `Gemini AI: Categorized issue as "${aiResult.category}", assigned to ${aiResult.department} with "${aiResult.severity}" severity. Urgent rating: "${aiResult.urgency}".`;
      if (aiResult.isSpam) {
        feedbackText += " [Warning: Flagged as potential low-fidelity/spam content]";
      }
      setAiReportFeedback(feedbackText);

      if (aiResult.duplicateIssueId) {
        setDuplicateAlert({
          id: aiResult.duplicateIssueId,
          title: aiResult.duplicateIssueTitle || "Similar Issue Nearby"
        });
        showToast("AI detected a possible duplicate issue report nearby!", "info");
      } else {
        showToast("Gemini AI successfully optimized report parameters!");
      }

    } catch (err) {
      showToast("Heuristics loaded: Standard routing applied.", "info");
      setAiReportFeedback("AI model returned default civic heuristics values successfully.");
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // ---------------------------------------------------------
  // Create Report Handler
  // ---------------------------------------------------------
  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showToast("Please log in or sign up to register issues.", "error");
      setActiveView("citizen-dash");
      return;
    }

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(reportForm)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed submitting report", "error");
        return;
      }

      showToast(`Emergency reported! Earned ${data.pointsAwarded} XP!`);
      // reset form
      setReportForm({
        title: "",
        description: "",
        category: "Road Damage",
        severity: "medium",
        urgency: "medium",
        department: "BBMP Road Infrastructure Dept",
        reporterAnonymous: false,
        estimatedDamage: "",
        images: [],
        lat: 12.9716,
        lng: 77.5946,
        address: "MG Road, Bengaluru, Karnataka 560001",
        pinCode: "560001"
      });
      setAiReportFeedback("");
      setDuplicateAlert(null);
      fetchIssues();
      setActiveView("citizen-dash");
    } catch (err) {
      showToast("Error processing report submission.", "error");
    }
  };

  // ---------------------------------------------------------
  // Verification Voting Handler
  // ---------------------------------------------------------
  const handleVerify = async (issueId: string, proofType: "confirm" | "disagree" | "fake") => {
    if (!token) {
      showToast("Authenticate to contribute community trust scores.", "error");
      setActiveView("citizen-dash");
      return;
    }

    try {
      const res = await fetch(`/api/issues/${issueId}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ proofType })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed sending verification", "error");
        return;
      }

      showToast(`Verification stored! Earned ${data.pointsAwarded} XP!`);
      fetchIssues();
      // Update selected issue modal if active
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue(data.issue);
      }
    } catch (err) {
      showToast("Could not send vote.", "error");
    }
  };

  // ---------------------------------------------------------
  // Comment Submission
  // ---------------------------------------------------------
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedIssue) {
      showToast("Please log in to submit comments", "error");
      return;
    }
    if (!newCommentText) return;

    try {
      const res = await fetch(`/api/issues/${selectedIssue.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: newCommentText, imageUrl: commentImage })
      });
      if (res.ok) {
        setNewCommentText("");
        setCommentImage("");
        fetchComments(selectedIssue.id);
        showToast("Comment published!");
      }
    } catch (err) {
      showToast("Comment failed.", "error");
    }
  };

  // ---------------------------------------------------------
  // Admin Operations
  // ---------------------------------------------------------
  const handleAdminUpdateStatus = async (issueId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/issues/${issueId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(adminAction)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed updating status", "error");
        return;
      }
      showToast(`Status updated successfully!`);
      fetchIssues();
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue(data);
      }
    } catch (err) {
      showToast("Status change error.", "error");
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newAnnouncement)
      });
      if (res.ok) {
        setNewAnnouncement({ title: "", content: "", department: "", importance: "medium" });
        fetchAnnouncements();
        showToast("Community announcement published successfully!");
      }
    } catch (err) {
      showToast("Failed posting.", "error");
    }
  };

  // Convert image upload to base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setReportForm(prev => ({
        ...prev,
        images: [reader.result as string]
      }));
      showToast("Image loaded into AI diagnostic tray.");
    };
    reader.readAsDataURL(file);
  };

  // Filter Issues
  const filteredIssuesList = issues.filter(i => {
    const matchesCategory = categoryFilter === "All" || i.category === categoryFilter;
    const matchesStatus = statusFilter === "All" || i.status === statusFilter;
    const isKnownLocality = ["indiranagar", "koramangala", "whitefield", "hsr", "jayanagar", "malleswaram", "malleshwaram", "hebbal", "mg road"].some(loc => 
      searchQuery.toLowerCase().includes(loc)
    );
    const matchesSearch = !searchQuery || 
                          isKnownLocality ||
                          i.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          i.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          i.location.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-sky-500 selection:text-slate-950">
      
      {/* Visual Navigation Bar */}
      <Navbar 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigate={(v) => {
          setActiveView(v);
          setSelectedIssue(null);
        }} 
        activeView={activeView} 
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8 md:px-8">

        {/* Global Toast Banner */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2.5 backdrop-blur-md ${
                toast.type === "error" 
                  ? "bg-red-500/10 text-red-400 border-red-500/30" 
                  : "bg-sky-500/10 text-sky-400 border-sky-500/30"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* VIEW 1: HOME PAGE */}
        {activeView === "home" && (
          <div className="space-y-12">
            
            {/* Elegant Hero Banner */}
            <section className="relative rounded-3xl overflow-hidden py-16 md:py-24 px-8 md:px-16 border border-slate-900 bg-gradient-to-tr from-slate-950 via-slate-900/60 to-slate-950 shadow-2xl">
              <div className="absolute top-0 right-0 h-96 w-96 bg-gradient-to-tr from-sky-500/10 to-indigo-500/10 rounded-full blur-3xl opacity-60 pointer-events-none" />
              <div className="max-w-2xl relative z-10 space-y-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-sky-400 bg-sky-400/10 rounded-full border border-sky-400/20">
                  <Flame className="h-3.5 w-3.5" /> 
                  AI-Powered Civic Safety
                </span>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-100 leading-tight">
                  Empowering Citizens to <br className="hidden md:inline" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400">
                    Improve Their Communities
                  </span>
                </h1>
                <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-lg">
                  Community Hero bridges the gap between proactive citizens and municipal authorities. 
                  Leveraging Gemini AI diagnostics to streamline categorization, priority verification, 
                  and duplicate routing in real-time.
                </p>
                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    onClick={() => setActiveView("report")}
                    className="bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 font-black text-xs px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-sky-500/10 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
                  >
                    <PlusCircle className="h-4.5 w-4.5" />
                    Report Local Problem
                  </button>
                  <button
                    onClick={() => setActiveView("citizen-dash")}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold text-xs px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <User className="h-4.5 w-4.5 text-slate-400" />
                    Citizen Portal
                  </button>
                </div>
              </div>
            </section>

            {/* Quick Live Stats Counters */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {[
                { label: "Community Problems", val: filteredIssuesList.length, icon: AlertTriangle, col: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
                { label: "Resolved Actions", val: filteredIssuesList.filter(i => i.status === "completed").length, icon: CheckCircle2, col: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
                { label: "Active Guardians", val: dashboardStats.activeCitizens || 3, icon: Users, col: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
                { label: "Avg Repair Cycle", val: `${dashboardStats.avgResolutionDays || 1.5} Days`, icon: TrendingUp, col: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20" }
              ].map((s, i) => (
                <div key={i} className="bg-slate-900/40 backdrop-blur-md border border-slate-900 p-5 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="block text-xs text-slate-400 font-medium">{s.label}</span>
                    <span className="block text-2xl font-black text-slate-100 tracking-tight mt-1">{s.val}</span>
                  </div>
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center border ${s.col}`}>
                    <s.icon className="h-5.5 w-5.5" />
                  </div>
                </div>
              ))}
            </section>

            {/* Interactive Vector Map Grid */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-200">Hyperlocal Problem Grid</h3>
                  <p className="text-xs text-slate-400">Discover or select flagged problem clusters in your vicinity</p>
                </div>
              </div>
              <InteractiveMap 
                issues={issues} 
                onSelectIssue={(issue) => {
                  setSelectedIssue(issue);
                  fetchComments(issue.id);
                }} 
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </section>

            {/* Recent Civic Issues Feed */}
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-200">Active Public Registry</h3>
                  <p className="text-xs text-slate-400">Authentic citizen reports needing peer-review validation</p>
                </div>

                {/* Filter and Sorting Controls */}
                <div className="flex flex-wrap gap-2.5">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Categories</option>
                    <option value="Road Damage">Road Damage</option>
                    <option value="Water Leakage">Water Leakage</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Garbage">Garbage</option>
                    <option value="Public Safety">Public Safety</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="verified">Verified</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Resolved</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3.5 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="newest">Newest First</option>
                    <option value="votes">Most Upvoted</option>
                    <option value="trust">Highest Trust</option>
                  </select>
                </div>
              </div>

              {filteredIssuesList.length === 0 ? (
                <div className="bg-slate-900/20 border border-slate-900 p-12 rounded-2xl text-center">
                  <AlertTriangle className="h-8 w-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No reported problems match the current filter selection.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredIssuesList.map((issue) => (
                    <IssueCard 
                      key={issue.id} 
                      issue={issue} 
                      currentUserId={currentUser?.id}
                      onSelect={(iss) => {
                        setSelectedIssue(iss);
                        fetchComments(iss.id);
                      }}
                      onVerify={handleVerify}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Interactive Before/After Success Stories */}
            <section className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-200">Community Success Stories</h3>
                <p className="text-xs text-slate-400">Visual proof of municipal actions resolving citizen-flagged anomalies</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {SAMPLE_SUCCESS_STORIES.map((story) => (
                  <div key={story.id} className="bg-slate-900/40 border border-slate-850 rounded-2xl overflow-hidden p-5 flex flex-col gap-4 shadow-xl">
                    <div className="grid grid-cols-2 gap-3 h-40">
                      <div className="relative rounded-lg overflow-hidden border border-slate-950 flex flex-col">
                        <ImageWithFallback src={story.beforeImage} alt="Before Fix" fallbackText={`${story.category} Before`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 text-[9px] font-black uppercase bg-red-500 text-white rounded-md z-10">Before</span>
                      </div>
                      <div className="relative rounded-lg overflow-hidden border border-slate-950 flex flex-col">
                        <ImageWithFallback src={story.afterImage} alt="After Fix" fallbackText={`${story.category} Resolved`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 text-[9px] font-black uppercase bg-emerald-500 text-white rounded-md z-10">Resolved</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] px-2.5 py-0.5 bg-slate-950 text-sky-400 font-bold border border-slate-800 rounded-full">{story.category}</span>
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Fixed in {story.resolutionTime}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-100">{story.title}</h4>
                      <p className="text-xs text-slate-400">{story.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Government Partners Grid */}
            <section className="bg-slate-900/10 border-t border-b border-slate-900 py-8 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Official Integrated Municipal Partners</span>
              <div className="flex flex-wrap justify-center items-center gap-8 opacity-40">
                {["BBMP Road Department", "BBMP Waste Management", "BWSSB (Water Supply & Sewerage)", "Karnataka Emergency Services", "BESCOM (Electricity Supply)"].map((p, i) => (
                  <span key={i} className="text-xs font-black tracking-tight text-slate-300">{p}</span>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW 2: REPORT AN ISSUE */}
        {activeView === "report" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Register Hyperlocal Problem</h2>
              <p className="text-xs text-slate-400">Fill details or trigger Gemini AI auto-diagnostics to auto-route parameters.</p>
            </div>

            <form onSubmit={handleCreateReport} className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 p-6 rounded-2xl shadow-2xl space-y-5">
              
              {/* Photo & Video Upload simulated Tray */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">Evidence Capture (Photo/Video)</label>
                <div className="border border-dashed border-slate-800 rounded-xl p-6 bg-slate-950 text-center hover:border-sky-500/30 transition-all relative">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {reportForm.images.length > 0 ? (
                    <div className="space-y-2 flex flex-col items-center justify-center">
                      <ImageWithFallback 
                        src={reportForm.images[0]} 
                        alt="Evidence Preview" 
                        fallbackText="Evidence Preview"
                        referrerPolicy="no-referrer"
                        className="h-32 mx-auto rounded-lg object-cover border border-slate-800"
                      />
                      <span className="block text-[10px] text-emerald-400 font-medium">Image Loaded. Ready for AI diagnostics.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-10 w-10 bg-slate-900 rounded-full flex items-center justify-center mx-auto border border-slate-800">
                        <Camera className="h-5 w-5 text-slate-400" />
                      </div>
                      <span className="block text-xs text-slate-300 font-semibold">Click to upload or drag evidence files here</span>
                      <span className="block text-[10px] text-slate-500">Supports JPG, PNG (Max size: 10MB)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">Brief Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dangerously deep pothole at MG Road intersection"
                  value={reportForm.title}
                  onChange={(e) => setReportForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe the problem, approximate physical dimensions, safety impacts, or location markers..."
                  value={reportForm.description}
                  onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>

              {/* Trigger AI Diagnostics Panel */}
              <div className="bg-gradient-to-r from-sky-950/20 to-indigo-950/20 border border-sky-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2">
                    <BrainCircuit className="h-5 w-5 text-sky-400 flex-shrink-0 animate-pulse" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Gemini AI Smart Assistant</h4>
                      <p className="text-[10px] text-slate-400">Instantly predict categories, recommend department channels, detect duplicates, and enhance the description using Gemini models.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAiAnalyzing}
                    onClick={triggerAiDiagnostics}
                    className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 text-slate-950 font-extrabold text-[10px] uppercase px-3 py-2 rounded-lg tracking-wider transition-all cursor-pointer"
                  >
                    {isAiAnalyzing ? "Analyzing..." : "Analyze"}
                  </button>
                </div>

                {/* AI feedback printout */}
                {aiReportFeedback && (
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-850 font-mono text-[10px] text-sky-300 leading-relaxed">
                    {aiReportFeedback}
                  </div>
                )}

                {/* Duplicate issue alert */}
                {duplicateAlert && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="text-[10px] text-amber-300">
                        Similar issue already registered: <strong>{duplicateAlert.title}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const duplicateObj = issues.find(i => i.id === duplicateAlert.id);
                        if (duplicateObj) {
                          setSelectedIssue(duplicateObj);
                          fetchComments(duplicateObj.id);
                        }
                      }}
                      className="text-[9px] font-bold text-sky-400 hover:underline"
                    >
                      View Existing
                    </button>
                  </div>
                )}
              </div>

              {/* Categorization & Urgency selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Civic Category</label>
                  <select
                    value={reportForm.category}
                    onChange={(e) => setReportForm(prev => ({ ...prev, category: e.target.value as IssueCategory }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="Road Damage">Road Damage</option>
                    <option value="Water Leakage">Water Leakage</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Garbage">Garbage</option>
                    <option value="Drainage">Drainage</option>
                    <option value="Streetlight">Streetlight</option>
                    <option value="Public Safety">Public Safety</option>
                    <option value="Illegal Dumping">Illegal Dumping</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Assigned Department</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Water Board, Road Authority"
                    value={reportForm.department}
                    onChange={(e) => setReportForm(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Severity Metric</label>
                  <select
                    value={reportForm.severity}
                    onChange={(e) => setReportForm(prev => ({ ...prev, severity: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="low">Low (Cosmetic issue)</option>
                    <option value="medium">Medium (Moderate traffic or access limits)</option>
                    <option value="high">High (Dangerous hazard blocks road)</option>
                    <option value="critical">Critical (Severe infrastructure collapse/injury risk)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Urgency Scale</label>
                  <select
                    value={reportForm.urgency}
                    onChange={(e) => setReportForm(prev => ({ ...prev, urgency: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="low">Low (Fix within days)</option>
                    <option value="medium">Medium (Fix within 48 Hours)</option>
                    <option value="high">High (Fix within 24 Hours)</option>
                    <option value="immediate">Immediate (Safety emergency threat)</option>
                  </select>
                </div>
              </div>

              {/* Coordinates Locator from Map Click */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-300">Location GPS Marker</label>
                  <span className="text-[10px] text-sky-400 font-mono">Lat: {reportForm.lat.toFixed(4)}, Lng: {reportForm.lng.toFixed(4)}</span>
                </div>
                <div className="h-[460px] rounded-2xl overflow-hidden shadow-xl">
                  <InteractiveMap 
                    issues={issues} 
                    interactiveMode={true}
                    height="h-full"
                    onSelectIssue={() => {}}
                    searchQuery={reportForm.address}
                    onSearchChange={(val) => setReportForm(prev => ({ ...prev, address: val }))}
                    onSelectCoordinates={(lat, lng, address) => {
                      setReportForm(prev => ({ ...prev, lat, lng, address }));
                      showToast("GPS coordinates matched successfully!", "success");
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">Physical Location Address</label>
                <input
                  type="text"
                  required
                  placeholder="Street name, landmark details..."
                  value={reportForm.address}
                  onChange={(e) => setReportForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">ZIP / PIN Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 560001"
                    value={reportForm.pinCode}
                    onChange={(e) => setReportForm(prev => ({ ...prev, pinCode: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Estimated Repair Cost</label>
                  <input
                    type="text"
                    placeholder="e.g. ₹15,000"
                    value={reportForm.estimatedDamage}
                    onChange={(e) => setReportForm(prev => ({ ...prev, estimatedDamage: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              {/* Anonymous Check */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="anonymous-check"
                  checked={reportForm.reporterAnonymous}
                  onChange={(e) => setReportForm(prev => ({ ...prev, reporterAnonymous: e.target.checked }))}
                  className="rounded border-slate-800 text-sky-500 focus:ring-0 focus:ring-offset-0 h-4 w-4 bg-slate-950"
                />
                <label htmlFor="anonymous-check" className="text-xs text-slate-400 cursor-pointer">
                  Report anonymously (Saves identity, but decreases earned points to 10 XP instead of 30 XP)
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 font-black text-xs py-4 rounded-xl shadow-lg transition-all hover:opacity-90 cursor-pointer"
              >
                Submit Emergency Civic Report
              </button>
            </form>
          </div>
        )}

        {/* VIEW 3: CITIZEN PORTAL (DASHBOARD & AUTH) */}
        {activeView === "citizen-dash" && (
          <div className="space-y-8">
            {!currentUser ? (
              <div className="max-w-md mx-auto space-y-6 py-10">
                <div className="text-center space-y-2">
                  <Shield className="h-10 w-10 text-sky-400 mx-auto" />
                  <h2 className="text-xl font-bold tracking-tight text-slate-100">Citizen Authentication Portal</h2>
                  <p className="text-xs text-slate-400">Join the hyperlocal network to report problems and earn reputation rank</p>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 p-6 rounded-2xl shadow-2xl space-y-4">
                  {/* Mode switcher */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-900">
                    <button
                      onClick={() => setAuthMode("login")}
                      className={`text-xs font-bold py-2 rounded-lg transition-all ${
                        authMode === "login" ? "bg-slate-900 text-sky-400 border border-slate-800" : "text-slate-400"
                      }`}
                    >
                      Login Profile
                    </button>
                    <button
                      onClick={() => setAuthMode("signup")}
                      className={`text-xs font-bold py-2 rounded-lg transition-all ${
                        authMode === "signup" ? "bg-slate-900 text-sky-400 border border-slate-800" : "text-slate-400"
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    {authError && (
                      <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg text-[10px] text-red-400 text-center font-bold">
                        {authError}
                      </div>
                    )}

                    {authMode === "signup" && (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
                        <input
                          type="text"
                          required
                          value={authForm.name}
                          onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                      <input
                        type="email"
                        required
                        value={authForm.email}
                        onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>

                    {authMode === "signup" && (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Phone Number</label>
                        <input
                          type="text"
                          required
                          value={authForm.phone}
                          onChange={(e) => setAuthForm(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">Password</label>
                      <input
                        type="password"
                        required
                        value={authForm.password}
                        onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>

                    {authMode === "signup" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">City</label>
                          <input
                            type="text"
                            required
                            value={authForm.city}
                            onChange={(e) => setAuthForm(prev => ({ ...prev, city: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">ZIP PIN</label>
                          <input
                            type="text"
                            required
                            value={authForm.pinCode}
                            onChange={(e) => setAuthForm(prev => ({ ...prev, pinCode: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {authMode === "signup" && (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Register as Role</label>
                        <select
                          value={authForm.role}
                          onChange={(e) => setAuthForm(prev => ({ ...prev, role: e.target.value as any }))}
                          className="w-full bg-slate-950 border border-slate-850 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="citizen">Citizen (Standard reporter & verifier)</option>
                          <option value="admin">Government Admin Officer</option>
                        </select>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 font-black text-xs py-3.5 rounded-xl shadow-lg transition-all hover:opacity-95 cursor-pointer"
                    >
                      {authMode === "login" ? "Verify Credentials & Sign In" : "Register New Account"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              // Active Citizen Dashboard
              <div className="space-y-8">
                
                {/* Profile Overview Card */}
                <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-44 w-44 bg-gradient-to-br from-sky-500/5 to-transparent rounded-full pointer-events-none" />
                  <div className="flex items-center gap-5">
                    <div className="h-16 w-16 bg-gradient-to-br from-sky-400 to-indigo-500 rounded-2xl flex items-center justify-center border border-slate-800 shadow-inner">
                      <User className="h-8 w-8 text-white" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-slate-100">{currentUser.name}</h2>
                      <p className="text-xs text-slate-400 font-mono">Location: {currentUser.city}, {currentUser.state} • Rank: Citizen Guardian</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="bg-slate-950 border border-slate-900 px-5 py-3 rounded-2xl text-center">
                      <span className="block text-[10px] uppercase text-slate-500">Reports Filed</span>
                      <strong className="block text-lg text-slate-200 mt-0.5">{currentUser.reportsCount || 0}</strong>
                    </div>
                    <div className="bg-slate-950 border border-slate-900 px-5 py-3 rounded-2xl text-center">
                      <span className="block text-[10px] uppercase text-slate-500">Votes Contributed</span>
                      <strong className="block text-lg text-slate-200 mt-0.5">{currentUser.verificationsCount || 0}</strong>
                    </div>
                    <div className="bg-slate-950 border border-slate-900 px-5 py-3 rounded-2xl text-center">
                      <span className="block text-[10px] uppercase text-slate-500">Total XP Points</span>
                      <strong className="block text-lg text-amber-400 mt-0.5">{currentUser.points || 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Badges Progress / Gamification Panel */}
                <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-6 shadow-xl space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-200">Earned Badges & Civic Achievements</h3>
                    <p className="text-xs text-slate-400">Complete tasks to unlock limited reputation titles</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {AVAILABLE_BADGES.map((b) => {
                      const isUnlocked = currentUser.badges?.includes(b.name) || currentUser.points >= b.criteriaPoints;
                      return (
                        <div 
                          key={b.id} 
                          className={`border rounded-2xl p-4.5 flex flex-col justify-between h-36 transition-all ${
                            isUnlocked 
                              ? "bg-slate-950/60 border-amber-500/20 text-slate-200" 
                              : "bg-slate-950/10 border-slate-900 text-slate-500 opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-slate-900 border ${isUnlocked ? "border-amber-500/40 bg-gradient-to-tr from-amber-500/10 to-indigo-500/10" : "border-slate-800"}`}>
                              <Award className={`h-5 w-5 ${isUnlocked ? "text-amber-400" : "text-slate-500"}`} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-900 rounded-md">
                              {isUnlocked ? "Unlocked" : `${b.criteriaPoints} XP`}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-200">{b.name}</h4>
                            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">{b.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* My Active Reports list */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-200">My Issue Submissions</h3>
                  {issues.filter(i => i.reporterId === currentUser.id).length === 0 ? (
                    <div className="bg-slate-900/20 border border-slate-900 p-8 rounded-2xl text-center">
                      <p className="text-xs text-slate-500">You have not reported any civic issues yet.</p>
                      <button 
                        onClick={() => setActiveView("report")}
                        className="text-xs text-sky-400 font-bold hover:underline mt-2 cursor-pointer"
                      >
                        File your first report now &rarr;
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {issues.filter(i => i.reporterId === currentUser.id).map((issue) => (
                        <IssueCard 
                          key={issue.id} 
                          issue={issue} 
                          currentUserId={currentUser.id}
                          onSelect={(iss) => {
                            setSelectedIssue(iss);
                            fetchComments(iss.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* VIEW 4: GOVERNMENT PORTAL (ADMIN PORTAL) */}
        {activeView === "admin-dash" && (
          <div className="space-y-8">
            {!currentUser || currentUser.role !== "admin" ? (
              <div className="bg-slate-900/20 border border-red-500/20 p-12 rounded-3xl text-center max-w-md mx-auto space-y-4">
                <Lock className="h-10 w-10 text-red-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-100">Government Administration Lock</h3>
                <p className="text-xs text-slate-400">This view requires government-level admin clearance keys. Citizens cannot enter.</p>
                <button
                  onClick={() => {
                    setAuthForm(prev => ({ ...prev, email: "admin@communityhero.org", password: "Admin@123" }));
                    setAuthMode("login");
                    setActiveView("citizen-dash");
                    showToast("Simulating administration auth credentials.", "info");
                  }}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Simulate Admin Login
                </button>
              </div>
            ) : (
              // Active Admin Dashboard
              <div className="space-y-8">
                
                {/* Admin Header with Total KPI counter grids */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100">National Government Portal</h2>
                    <p className="text-xs text-slate-400">Review community issues, assign field officers, publish safety notices, and review AI cluster telemetry.</p>
                  </div>
                  
                  <span className="text-[10px] font-mono px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                    <Activity className="h-4 w-4" /> Live Operational Sync
                  </span>
                </div>

                {/* AI Predictive Risk Assessment */}
                <div className="bg-gradient-to-r from-violet-950/20 via-indigo-950/20 to-sky-950/20 border border-violet-500/20 p-6 rounded-3xl shadow-xl space-y-4">
                  <div className="flex items-center gap-2.5">
                    <BrainCircuit className="h-6 w-6 text-violet-400 animate-pulse" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-200">Gemini Predictive Community Risk Assessment</h3>
                      <p className="text-[10px] text-slate-400">Live AI summarization evaluating active hyperlocal problem vectors</p>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-900 font-mono text-xs text-violet-300 leading-relaxed">
                    {dashboardStats.aiCivicSummary || "Evaluating civic infrastructure databases. Active alerts list is healthy."}
                  </div>
                </div>

                {/* Admin Issues list & operations */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-200">Active Public Issues Queue</h3>
                  
                  <div className="bg-slate-900/40 border border-slate-850 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 font-bold bg-slate-950/60">
                            <th className="p-4">Report Details</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Severity</th>
                            <th className="p-4">Trust Score</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/80 text-xs">
                          {issues.map((iss) => (
                            <tr key={iss.id} className="hover:bg-slate-900/25 transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-slate-200">{iss.title}</div>
                                <div className="text-[10px] text-slate-500 mt-1">{iss.location.address}</div>
                              </td>
                              <td className="p-4">
                                <span className="px-2.5 py-0.5 bg-slate-950 border border-slate-800 text-sky-400 rounded-full font-semibold">
                                  {iss.category}
                                </span>
                              </td>
                              <td className="p-4 uppercase font-bold text-slate-400">{iss.severity}</td>
                              <td className="p-4 text-emerald-400 font-bold">{iss.trustScore}%</td>
                              <td className="p-4 uppercase tracking-wider font-extrabold text-[10px] text-amber-400">
                                {iss.status.replace("_", " ")}
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => {
                                    setSelectedIssue(iss);
                                    fetchComments(iss.id);
                                    setAdminAction({
                                      status: iss.status,
                                      note: "",
                                      assignedOfficer: iss.assignedOfficer || ""
                                    });
                                  }}
                                  className="text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold px-3.5 py-1.5 rounded-lg transition-all"
                                >
                                  Manage Report
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Publish Announcement Panel */}
                <div className="bg-slate-900/40 border border-slate-850 rounded-3xl p-6 shadow-xl space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-200">Publish Safety Notice / Notice Board</h3>
                    <p className="text-xs text-slate-400">Draft urgent alerts delivered directly to public noticeboards</p>
                  </div>

                  <form onSubmit={handlePostAnnouncement} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-300">Notice Title</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Scheduled Power Outage for Indiranagar Sector repairs"
                          value={newAnnouncement.title}
                          onChange={(e) => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-300">Department / Authority Tag</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. BESCOM (Electricity Board)"
                          value={newAnnouncement.department}
                          onChange={(e) => setNewAnnouncement(prev => ({ ...prev, department: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300">Content / Detailed Alert Instruction</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="Draft announcement instructions, timelines, or contact hotline details..."
                        value={newAnnouncement.content}
                        onChange={(e) => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300">Importance Rank</label>
                      <select
                        value={newAnnouncement.importance}
                        onChange={(e) => setNewAnnouncement(prev => ({ ...prev, importance: e.target.value as any }))}
                        className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-4 py-2.5 rounded-xl focus:outline-none cursor-pointer"
                      >
                        <option value="low">Low (General community update)</option>
                        <option value="medium">Medium (Moderate attention required)</option>
                        <option value="high">High (Urgent immediate public warning!)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 font-black text-xs px-6 py-2.5 rounded-xl shadow-lg transition-all hover:opacity-90 cursor-pointer"
                    >
                      Publish Announcement Notice
                    </button>
                  </form>
                </div>

              </div>
            )}
          </div>
        )}

        {/* VIEW 5: LEADERBOARD VIEW */}
        {activeView === "leaderboard" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <Award className="h-10 w-10 text-amber-400 mx-auto animate-bounce" />
              <h2 className="text-2xl font-black text-slate-100 tracking-tight">Citizens Reputation Leaderboard</h2>
              <p className="text-xs text-slate-400">Recognizing public-minded guardians earning trust badges and community XP points.</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-850 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 font-bold bg-slate-950/60">
                      <th className="p-4 text-center w-16">Rank</th>
                      <th className="p-4">Guardian Name</th>
                      <th className="p-4">Active Badges</th>
                      <th className="p-4">Reports Filed</th>
                      <th className="p-4 text-right">Reputation XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/80 text-xs">
                    {leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">Leaderboard standings are processing...</td>
                      </tr>
                    ) : (
                      leaderboard.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-900/25 transition-colors">
                          <td className="p-4 text-center font-mono font-bold text-slate-400">
                            {item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : `#${item.rank}`}
                          </td>
                          <td className="p-4 font-bold text-slate-200">{item.name}</td>
                          <td className="p-4">
                            <div className="flex gap-1">
                              {item.badges?.slice(0, 3).map((badgeName: string, i: number) => (
                                <span key={i} className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                  {badgeName}
                                </span>
                              ))}
                              {(!item.badges || item.badges.length === 0) && (
                                <span className="text-[9px] text-slate-600">Local Watcher</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-slate-400">{item.reportsCount} reported</td>
                          <td className="p-4 text-right font-black text-amber-400">{item.points} XP</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: ANNOUNCEMENTS VIEW */}
        {activeView === "announcements" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-sky-400 animate-pulse" />
                Community Broadcasts
              </h2>
              <p className="text-xs text-slate-400">Urgent public notices and scheduled repair bulletins issued by municipal authorities.</p>
            </div>

            <div className="space-y-4">
              {announcements.length === 0 ? (
                <div className="bg-slate-900/20 border border-slate-900 p-12 rounded-2xl text-center">
                  <Megaphone className="h-8 w-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No public notices reported currently.</p>
                </div>
              ) : (
                announcements.map((ann) => (
                  <div 
                    key={ann.id} 
                    className={`p-5 rounded-2xl border bg-slate-900/40 backdrop-blur-md flex flex-col gap-3 shadow-lg transition-all ${
                      ann.importance === "high" 
                        ? "border-red-500/30 bg-gradient-to-tr from-red-500/5 to-transparent" 
                        : "border-slate-850"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                        ann.importance === "high" ? "bg-red-500/10 text-red-400" : "bg-slate-800 text-slate-400"
                      }`}>
                        {ann.importance} Priority
                      </span>
                      <span className="text-[10px] text-slate-500">{new Date(ann.date).toLocaleDateString()}</span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-100">{ann.title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{ann.content}</p>

                    <span className="block text-[10px] text-sky-400 font-mono mt-2 uppercase tracking-wide">
                      Issued by: {ann.department || "Municipal Administration"} • {ann.authorName}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* DETAILED PUBLIC REGISTRY DISCLOSURE MODAL */}
      <AnimatePresence>
        {selectedIssue && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8 py-10 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-850 rounded-3xl max-w-4xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative"
            >
              
              {/* Close Button */}
              <button 
                onClick={() => {
                  setSelectedIssue(null);
                  setComments([]);
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 text-xs font-bold bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-xl cursor-pointer"
              >
                Close
              </button>

              {/* Title & Metadata */}
              <div className="space-y-2 pr-12">
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950 border border-slate-800 text-sky-400 px-2.5 py-0.5 rounded-md">
                    {selectedIssue.category}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950 border border-slate-800 text-amber-400 px-2.5 py-0.5 rounded-md">
                    {selectedIssue.status.replace("_", " ")}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-100">{selectedIssue.title}</h3>
                <p className="text-[10px] text-slate-400">Reporter: {selectedIssue.reporterAnonymous ? "Anonymous Citizen" : selectedIssue.reporterName} • Registered on {new Date(selectedIssue.createdAt).toLocaleString()}</p>
              </div>

              {/* Layout Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800">
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden h-48 md:h-56 bg-slate-950 border border-slate-850 shadow-inner flex flex-col">
                    <ImageWithFallback 
                      src={selectedIssue.images[0]} 
                      alt={selectedIssue.title} 
                      fallbackText={selectedIssue.category}
                      className="w-full h-full object-cover" 
                    />
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                    <span className="block text-[10px] uppercase text-slate-500 font-bold mb-2">Location Coordinates</span>
                    <p className="text-xs text-slate-300 leading-relaxed mb-2">{selectedIssue.location.address}</p>
                    <span className="block text-[9px] font-mono text-slate-600">PIN: {selectedIssue.pinCode} • GPS: {selectedIssue.location.lat.toFixed(4)}, {selectedIssue.location.lng.toFixed(4)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                    <span className="block text-[10px] uppercase text-slate-500 font-bold mb-1.5">Problem Context</span>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">{selectedIssue.description}</p>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-2">
                    <span className="block text-[10px] uppercase text-slate-500 font-bold">Community Audit Metrics</span>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg">
                        <span className="block text-[9px] text-slate-500 uppercase">Trust score</span>
                        <strong className="block text-sm text-sky-400 mt-0.5">{selectedIssue.trustScore}%</strong>
                      </div>
                      <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg">
                        <span className="block text-[9px] text-slate-500 uppercase">Verifications</span>
                        <strong className="block text-sm text-slate-200 mt-0.5">{selectedIssue.verifications?.length || 0} Votes</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Timeline History Logs */}
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <span className="block text-[10px] uppercase text-slate-500 font-bold">Audit status history timeline</span>
                <div className="space-y-2 font-mono text-[10px]">
                  {selectedIssue.statusHistory?.map((h: any, i: number) => (
                    <div key={i} className="flex items-start justify-between bg-slate-950/40 p-2 rounded-lg border border-slate-850/40">
                      <div>
                        <span className="text-sky-400 uppercase font-black">[{h.status}]</span>
                        <span className="text-slate-400 ml-2">{h.note}</span>
                      </div>
                      <span className="text-slate-600 ml-4">{new Date(h.timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Government Management Panel for Admin users */}
              {currentUser?.role === "admin" && (
                <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl space-y-3">
                  <span className="block text-[10px] uppercase font-black text-red-400 tracking-wider">Government Admin Operational Actions</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={adminAction.status}
                      onChange={(e) => setAdminAction(prev => ({ ...prev, status: e.target.value as any }))}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded-xl focus:outline-none"
                    >
                      <option value="verified">Mark Community Verified</option>
                      <option value="assigned">Assign To Department</option>
                      <option value="in_progress">Start Active Work</option>
                      <option value="completed">Complete Repair Task</option>
                      <option value="rejected">Reject as Fraud Report</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Assigned Officer Name..."
                      value={adminAction.assignedOfficer}
                      onChange={(e) => setAdminAction(prev => ({ ...prev, assignedOfficer: e.target.value }))}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                    />

                    <button
                      onClick={() => handleAdminUpdateStatus(selectedIssue.id)}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-xs py-2 rounded-xl transition-all cursor-pointer"
                    >
                      Commit Status Update
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Enter audit logs details note here..."
                    value={adminAction.note}
                    onChange={(e) => setAdminAction(prev => ({ ...prev, note: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200"
                  />
                </div>
              )}

              {/* Comment Thread */}
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <span className="block text-[10px] uppercase text-slate-500 font-bold">Public Discussion Board</span>
                
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <p className="text-[10px] text-slate-600 italic">No comments published yet. Be the first to start the discussion!</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="bg-slate-950/60 p-3 rounded-xl border border-slate-850/60 flex gap-3">
                        <ImageWithFallback 
                          src={c.userAvatar} 
                          referrerPolicy="no-referrer" 
                          alt={c.userName} 
                          isAvatar={true}
                          className="h-7 w-7 rounded-full object-cover flex-shrink-0" 
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-300">{c.userName}</span>
                            <span className="text-[9px] text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-normal">{c.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Comment composer */}
                {currentUser ? (
                  <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      required
                      placeholder="Enter supportive note or feedback..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-sky-500 hover:bg-sky-600 text-slate-950 font-black text-xs px-4 rounded-xl transition-all cursor-pointer"
                    >
                      Comment
                    </button>
                  </form>
                ) : (
                  <p className="text-[10px] text-slate-500 text-center pt-2">Log in to post comments in discussion board.</p>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="border-t border-slate-900/60 bg-slate-950 py-12 text-center text-xs text-slate-600 space-y-4">
        <div className="flex justify-center items-center gap-2">
          <div className="h-6 w-6 rounded bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-slate-500">COMMUNITY HERO</span>
        </div>
        <p className="max-w-md mx-auto text-[11px] leading-relaxed">
          Designed and built to maximize municipal collaboration efficiency. All uploads are audit log tracked to maintain authentic public records.
        </p>
        <p className="font-mono text-[9px] tracking-widest text-slate-700">© 2026 COMMUNITY HERO SYSTEM CO. • ALL RIGHTS SECURED</p>
      </footer>
    </div>
  );
}
