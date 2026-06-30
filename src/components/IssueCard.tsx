import React from "react";
import { AlertTriangle, MapPin, Eye, ThumbsUp, ThumbsDown, ShieldCheck, Heart, Clock, UserCheck } from "lucide-react";
import { Issue, IssueCategory } from "../types";
import ImageWithFallback from "./ImageWithFallback";

interface IssueCardProps {
  key?: string;
  issue: Issue;
  currentUserId?: string;
  onSelect: (issue: Issue) => void;
  onVerify?: (issueId: string, type: "confirm" | "disagree" | "fake") => void;
}

export default function IssueCard({ issue, currentUserId, onSelect, onVerify }: IssueCardProps) {
  // Safe helper to check active votes
  const userVote = currentUserId && issue.votes ? issue.votes[currentUserId] : null;

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "submitted":
        return { text: "text-amber-400 bg-amber-400/10 border-amber-400/20", label: "Submitted" };
      case "verified":
        return { text: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", label: "Community Verified" };
      case "assigned":
        return { text: "text-sky-400 bg-sky-400/10 border-sky-400/20", label: "Assigned" };
      case "in_progress":
        return { text: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20", label: "In Progress" };
      case "completed":
        return { text: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", label: "Resolved" };
      default:
        return { text: "text-slate-400 bg-slate-400/10 border-slate-400/20", label: "Inactive" };
    }
  };

  const statusInfo = getStatusStyle(issue.status);

  // Trust color
  const getTrustColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "high":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "medium":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700/50";
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700/80 transition-all hover:scale-[1.01] flex flex-col group shadow-lg">
      {/* Visual Thumbnail & Category Overlay */}
      <div className="relative h-44 bg-slate-950 overflow-hidden">
        <ImageWithFallback 
          src={issue.images[0]} 
          alt={issue.title}
          fallbackText={issue.category}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500 opacity-90"
        />
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-800/80 text-sky-300">
            {issue.category}
          </span>
          <span className={`text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full border backdrop-blur-md ${getSeverityStyle(issue.severity)}`}>
            {issue.severity}
          </span>
        </div>

        {/* Live Trust Banner */}
        <div className="absolute bottom-3 right-3 bg-slate-950/95 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800/60 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10px] text-slate-400 font-medium">
            Trust: <strong className={getTrustColor(issue.trustScore)}>{issue.trustScore}%</strong>
          </span>
        </div>
      </div>

      {/* Main Card Body */}
      <div className="p-5 flex-1 flex flex-col">
        {/* Status Indicator Bar */}
        <div className="flex items-center justify-between mb-3.5">
          <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md border ${statusInfo.text}`}>
            {statusInfo.label}
          </span>
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(issue.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Title and Short Description */}
        <h4 className="text-sm font-bold text-slate-100 mb-2 group-hover:text-white transition-colors line-clamp-1">
          {issue.title}
        </h4>
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4 flex-1">
          {issue.description}
        </p>

        {/* Geographical Address */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-4 border-t border-slate-800/60 pt-3">
          <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{issue.location.address}</span>
        </div>

        {/* Live Verifications Status and Quick Actions */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/30">
          <button
            onClick={() => onSelect(issue)}
            className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 group/btn cursor-pointer"
          >
            <Eye className="h-4 w-4 group-hover/btn:scale-110 transition-transform" />
            Inspect Details
          </button>

          {/* Quick Verification Panel */}
          {onVerify && (
            <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-850">
              <button
                onClick={() => onVerify(issue.id, "confirm")}
                title="Confirm Issue Exists"
                className={`p-1.5 rounded-lg transition-all ${
                  userVote === "up" 
                    ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/20" 
                    : "text-slate-400 hover:text-emerald-400 hover:bg-slate-850"
                }`}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onVerify(issue.id, "fake")}
                title="Mark as Fake/Fraud"
                className={`p-1.5 rounded-lg transition-all ${
                  userVote === "down" 
                    ? "bg-red-500/25 text-red-400 border border-red-500/20" 
                    : "text-slate-400 hover:text-red-400 hover:bg-slate-850"
                }`}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
