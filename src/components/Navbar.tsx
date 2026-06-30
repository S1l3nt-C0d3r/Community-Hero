import React from "react";
import { User, Shield, LogOut, Award, Star, Activity, UserCircle } from "lucide-react";
import { User as UserType } from "../types";
import ImageWithFallback from "./ImageWithFallback";

interface NavbarProps {
  user: UserType | null;
  onLogout: () => void;
  onNavigate: (view: "home" | "report" | "citizen-dash" | "admin-dash" | "leaderboard" | "announcements") => void;
  activeView: string;
}

export default function Navbar({ user, onLogout, onNavigate, activeView }: NavbarProps) {
  // Helper to determine active styling
  const navItemClass = (view: string) => {
    const isActive = activeView === view;
    return `text-xs font-semibold px-4 py-2 rounded-xl transition-all ${
      isActive 
        ? "bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-500/30 text-sky-400 font-bold shadow-sm shadow-sky-500/5"
        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-950/75 backdrop-blur-md border-b border-slate-900/80 px-4 py-3 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* App Branding */}
        <div 
          onClick={() => onNavigate("home")} 
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-all">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-slate-100 tracking-tight group-hover:text-white transition-colors">
              COMMUNITY HERO
            </span>
            <span className="block text-[9px] text-slate-500 font-mono tracking-wider">
              HYPERLOCAL PROBLEM SOLVER
            </span>
          </div>
        </div>

        {/* Global Navigation Links */}
        <nav className="flex items-center gap-1.5 overflow-x-auto max-w-full no-scrollbar pb-1 md:pb-0">
          <button onClick={() => onNavigate("home")} className={navItemClass("home")}>
            Home
          </button>
          <button onClick={() => onNavigate("report")} className={navItemClass("report")}>
            Report Issue
          </button>
          <button onClick={() => onNavigate("leaderboard")} className={navItemClass("leaderboard")}>
            Leaderboard
          </button>
          <button onClick={() => onNavigate("announcements")} className={navItemClass("announcements")}>
            Announcements
          </button>

          {user && user.role === "citizen" && (
            <button onClick={() => onNavigate("citizen-dash")} className={navItemClass("citizen-dash")}>
              Citizen Dash
            </button>
          )}

          {user && user.role === "admin" && (
            <button onClick={() => onNavigate("admin-dash")} className={navItemClass("admin-dash")}>
              Admin Portal
            </button>
          )}
        </nav>

        {/* User Account / CTA Menu */}
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              {/* Gamification Indicator */}
              {user.role === "citizen" && (
                <div className="hidden lg:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl px-3 py-1.5">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                      Lvl {user.level}
                    </span>
                    <span className="text-xs font-black text-slate-200">{user.points} XP</span>
                  </div>
                  <div className="h-7 w-[1px] bg-slate-800" />
                  <div className="flex -space-x-1">
                    {(user.badges || []).slice(0, 2).map((b, i) => (
                      <div 
                        key={i} 
                        title={b} 
                        className="h-6 w-6 rounded-full bg-slate-950 border border-amber-500/40 flex items-center justify-center bg-gradient-to-tr from-amber-500/10 to-indigo-500/10"
                      >
                        <Award className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Profile Avatar Trigger */}
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="block text-xs font-bold text-slate-200">{user.name}</span>
                  <span className="block text-[9px] font-semibold text-sky-400 uppercase tracking-wider">{user.role}</span>
                </div>
                <ImageWithFallback 
                  src={user.profilePicture} 
                  alt={user.name} 
                  isAvatar={true}
                  referrerPolicy="no-referrer"
                  className="h-8.5 w-8.5 rounded-full object-cover border border-slate-800 shadow-inner"
                />
              </div>

              {/* Logout Button */}
              <button 
                onClick={onLogout}
                title="Logout Securely"
                className="h-8.5 w-8.5 rounded-xl border border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-all cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onNavigate("citizen-dash")}
                className="text-xs font-semibold text-slate-300 hover:text-white px-4 py-2 transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button 
                onClick={() => onNavigate("report")}
                className="text-xs font-bold text-slate-950 bg-gradient-to-r from-sky-400 to-indigo-400 hover:from-sky-500 hover:to-indigo-500 px-4 py-2 rounded-xl transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
              >
                Report Emergency
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
