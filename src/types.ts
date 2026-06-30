export type UserRole = "citizen" | "admin";

export type IssueStatus = "submitted" | "verified" | "assigned" | "in_progress" | "completed" | "rejected";

export type IssueCategory =
  | "Road Damage"
  | "Water Leakage"
  | "Garbage"
  | "Streetlight"
  | "Electricity"
  | "Drainage"
  | "Traffic"
  | "Public Safety"
  | "Illegal Dumping"
  | "Broken Signals"
  | "Parks"
  | "Trees"
  | "Public Property Damage"
  | "Others";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  pinCode: string;
  role: UserRole;
  points: number;
  level: number;
  badges: string[]; // names or IDs of badges
  bio?: string;
  profilePicture?: string;
  reportsCount: number;
  verificationsCount: number;
  socialLinks?: {
    twitter?: string;
    github?: string;
  };
  createdAt: string;
}

export interface StatusHistoryEntry {
  status: IssueStatus;
  timestamp: string;
  note: string;
  updatedBy: string;
}

export interface VerificationProof {
  userId: string;
  userName: string;
  proofType: "confirm" | "disagree" | "fake";
  comment?: string;
  proofPhotoUrl?: string;
  timestamp: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: "low" | "medium" | "high" | "critical";
  urgency: "low" | "medium" | "high" | "immediate";
  department: string;
  reporterId: string;
  reporterName: string;
  reporterAnonymous: boolean;
  estimatedDamage?: string;
  images: string[];
  videos?: string[];
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  pinCode: string;
  votesCount: number;
  votes: {
    [userId: string]: "up" | "down";
  };
  communityVerified: boolean;
  trustScore: number; // calculated trust percentage (0-100)
  status: IssueStatus;
  statusHistory: StatusHistoryEntry[];
  assignedOfficer?: string;
  completionPhotos?: string[];
  feedback?: string;
  verifications: VerificationProof[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  imageUrl?: string;
  likes: string[]; // list of userIds who liked it
  replies?: Comment[];
  pinned?: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  department?: string;
  authorName: string;
  date: string;
  importance: "low" | "medium" | "high";
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  criteriaPoints: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface AIAnalysisResult {
  category: IssueCategory;
  severity: "low" | "medium" | "high" | "critical";
  urgency: "low" | "medium" | "high" | "immediate";
  priorityExplanation: string;
  department: string;
  enhancedDescription: string;
  isSpam: boolean;
  isFake: boolean;
  spamConfidence: number;
  duplicateIssueId?: string; // empty if unique
}
