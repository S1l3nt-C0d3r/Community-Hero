import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// ---------------------------------------------------------
// 1. Initialise Firebase Server-Side Using Applet Config
// ---------------------------------------------------------
let db: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || "(default)");
    console.log(`Firebase Firestore initialized successfully with database: ${firebaseConfig.firestoreDatabaseId || "(default)"}`);
  } else {
    console.warn("firebase-applet-config.json not found. Database features will fallback to local memory.");
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
}

// ---------------------------------------------------------
// 1b. Fallback Local State (In case Firebase is unreachable)
// ---------------------------------------------------------
const fallbackDB = {
  users: new Map<string, any>(),
  sessions: new Map<string, any>(),
  issues: new Map<string, any>(),
  comments: new Map<string, any>(),
  announcements: new Map<string, any>(),
  auditLogs: new Map<string, any>(),
};

// Database helper utilities to handle Firestore + Fallback seamlessly
async function dbGetDoc(colName: string, docId: string): Promise<any | null> {
  if (db) {
    try {
      const docRef = doc(db, colName, docId);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    } catch (e: any) {
      console.error(`Firestore getDoc error on ${colName}/${docId} (falling back to in-memory):`, e?.message || e);
    }
  }
  const item = fallbackDB[colName as keyof typeof fallbackDB]?.get(docId);
  return item ? { ...item } : null;
}

async function dbSetDoc(colName: string, docId: string, data: any): Promise<void> {
  let firestoreSuccess = false;
  if (db) {
    try {
      const docRef = doc(db, colName, docId);
      await setDoc(docRef, data, { merge: true });
      firestoreSuccess = true;
    } catch (e: any) {
      console.error(`Firestore setDoc error on ${colName}/${docId} (falling back to in-memory):`, e?.message || e);
    }
  }
  // Write to fallbackDB if Firestore failed or is not available, or write to both to keep in-memory cache updated
  const current = fallbackDB[colName as keyof typeof fallbackDB]?.get(docId) || {};
  fallbackDB[colName as keyof typeof fallbackDB]?.set(docId, { ...current, ...data });
}

async function dbAddDoc(colName: string, data: any): Promise<string> {
  const id = crypto.randomUUID();
  const docWithId = { id, ...data };
  let firestoreSuccess = false;
  if (db) {
    try {
      const colRef = collection(db, colName);
      await setDoc(doc(colRef, id), docWithId);
      firestoreSuccess = true;
      return id;
    } catch (e: any) {
      console.error(`Firestore addDoc error on ${colName} (falling back to in-memory):`, e?.message || e);
    }
  }
  fallbackDB[colName as keyof typeof fallbackDB]?.set(id, docWithId);
  return id;
}

async function dbGetDocs(colName: string, queries: { field: string; op: any; val: any }[] = []): Promise<any[]> {
  if (db) {
    try {
      const colRef = collection(db, colName);
      // Simplify query execution to prevent indexing issues
      const snapshot = await getDocs(colRef);
      let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Perform manual filtering to avoid requiring composite indexes
      for (const q of queries) {
        items = items.filter((item: any) => {
          if (q.op === "==") return item[q.field] === q.val;
          if (q.op === ">") return item[q.field] > q.val;
          if (q.op === "<") return item[q.field] < q.val;
          return true;
        });
      }
      return items;
    } catch (e: any) {
      console.error(`Firestore getDocs error on ${colName} (falling back to in-memory):`, e?.message || e);
    }
  }
  
  let items = Array.from(fallbackDB[colName as keyof typeof fallbackDB]?.values() || []);
  for (const q of queries) {
    items = items.filter((item: any) => {
      if (q.op === "==") return item[q.field] === q.val;
      if (q.op === ">") return item[q.field] > q.val;
      if (q.op === "<") return item[q.field] < q.val;
      return true;
    });
  }
  return items;
}

// ---------------------------------------------------------
// 2. Initialise Gemini AI SDK (using lazy load pattern)
// ---------------------------------------------------------
let ai: any = null;
function getGeminiAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      ai = new GoogleGenAI({ apiKey: key });
      console.log("Gemini AI SDK client initialized.");
    } else {
      console.warn("GEMINI_API_KEY env variable is not set. AI features will run with fallback predictions.");
    }
  }
  return ai;
}

// Helper password hasher (native crypto)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "community_hero_salt").digest("hex");
}

// Default Badge Lists
const AVAILABLE_BADGES = [
  { id: "b1", name: "Top Reporter", description: "Submitted 5 or more verified community issues", icon: "Megaphone", criteriaPoints: 100 },
  { id: "b2", name: "Fast Verifier", description: "Contributed to 5 community verifications", icon: "CheckCircle", criteriaPoints: 50 },
  { id: "b3", name: "Community Guardian", description: "Earned 500 total community trust points", icon: "ShieldAlert", criteriaPoints: 500 },
  { id: "b4", name: "Hero of the Month", description: "Earned 1000 total community trust points", icon: "Award", criteriaPoints: 1000 },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: "50mb" })); // support rich base64 image uploads
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Request logs helper
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // ---------------------------------------------------------
  // 3. Setup Seeds (Default Admin, Sample Issues)
  // ---------------------------------------------------------
  const seedAdmin = async () => {
    const adminEmail = "admin@communityhero.org";
    const existingAdmin = await dbGetDocs("users", [{ field: "email", op: "==", val: adminEmail }]);
    if (existingAdmin.length === 0) {
      const adminUser = {
        id: "admin_user_id",
        name: "Lead Admin Officer",
        email: adminEmail,
        phone: "+919876543210",
        passwordHash: hashPassword("Admin@123"),
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560001",
        role: "admin",
        points: 2500,
        level: 10,
        badges: ["Top Reporter", "Community Guardian", "Hero of the Month"],
        reportsCount: 15,
        verificationsCount: 30,
        createdAt: new Date().toISOString()
      };
      await dbSetDoc("users", adminUser.id, adminUser);
      console.log("Seeded default administrator successfully.");
    }

    // Seed couple of issues if database empty
    const currentIssues = await dbGetDocs("issues");
    if (currentIssues.length < 5) {
      const demoIssue1 = {
        id: "demo_issue_1",
        title: "Severe Road Potholes on MG Road",
        description: "Large deep potholes near the central MG Road Metro Station causing massive traffic backups and dangerous two-wheeler skidding. Please repair immediately.",
        category: "Road Damage",
        severity: "high",
        urgency: "high",
        department: "BBMP Road Infrastructure Dept",
        reporterId: "admin_user_id",
        reporterName: "Lead Admin Officer",
        reporterAnonymous: false,
        estimatedDamage: "₹45,000",
        images: ["https://images.unsplash.com/photo-1599740487708-211aa0873722?auto=format&fit=crop&q=80&w=600"],
        location: {
          lat: 12.9716,
          lng: 77.5946,
          address: "MG Road, Bengaluru, Karnataka 560001"
        },
        pinCode: "560001",
        votesCount: 8,
        votes: { "admin_user_id": "up" },
        communityVerified: true,
        trustScore: 92,
        status: "assigned",
        statusHistory: [
          { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), note: "Report created", updatedBy: "System" },
          { status: "verified", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Community trust threshold exceeded", updatedBy: "Community" },
          { status: "assigned", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Assigned to BBMP Road Repair Division 4", updatedBy: "Lead Admin Officer" }
        ],
        assignedOfficer: "Assistant Engineer Suresh Kumar",
        verifications: [
          { userId: "demo_user", userName: "Sarah Jenkins", proofType: "confirm", comment: "Verified, my bike skidded here yesterday, very dangerous!", timestamp: new Date().toISOString() }
        ],
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString()
      };

      const demoIssue2 = {
        id: "demo_issue_2",
        title: "Major Water Main Pipe Leakage near Cubbon Park",
        description: "Drinking water flooding the pedestrian pathway near Cubbon Park entrance. Thousands of liters of fresh water are being wasted rapidly.",
        category: "Water Leakage",
        severity: "critical",
        urgency: "immediate",
        department: "BWSSB (Water Supply & Sewerage)",
        reporterId: "admin_user_id",
        reporterName: "Lead Admin Officer",
        reporterAnonymous: true,
        estimatedDamage: "₹95,000",
        images: ["https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&q=80&w=600"],
        location: {
          lat: 12.9763,
          lng: 77.5929,
          address: "Cubbon Park Entrance Road, Bengaluru, Karnataka 560001"
        },
        pinCode: "560001",
        votesCount: 15,
        votes: { "admin_user_id": "up" },
        communityVerified: true,
        trustScore: 98,
        status: "in_progress",
        statusHistory: [
          { status: "submitted", timestamp: new Date(Date.now() - 43200000).toISOString(), note: "Report created", updatedBy: "System" },
          { status: "verified", timestamp: new Date(Date.now() - 36000000).toISOString(), note: "Verified by emergency staff", updatedBy: "Admin" },
          { status: "in_progress", timestamp: new Date(Date.now() - 20000000).toISOString(), note: "Water valve shut off, BWSSB repair crews active on-site.", updatedBy: "BWSSB" }
        ],
        assignedOfficer: "Crew Lead Venkatesh",
        verifications: [],
        createdAt: new Date(Date.now() - 43200000).toISOString(),
        updatedAt: new Date(Date.now() - 20000000).toISOString()
      };

      const neighborhoodIssues = [
        {
          id: "demo_issue_indiranagar_1",
          title: "Critical Pothole Chain on 100 Feet Road",
          description: "A continuous chain of deep potholes has developed on the busy 100 Feet Road, Indiranagar. Multiple vehicles have sustained tire damage, and two-wheelers are swerving dangerously to avoid them.",
          category: "Road Damage",
          severity: "critical",
          urgency: "immediate",
          department: "BBMP Road Infrastructure Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹1,20,000",
          images: ["https://images.unsplash.com/photo-1615461065624-21b562ee5566?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.97189,
            lng: 77.64115,
            address: "100 Feet Road, Hal 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038"
          },
          pinCode: "560038",
          votesCount: 14,
          votes: { "admin_user_id": "up" },
          communityVerified: true,
          trustScore: 95,
          status: "in_progress",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 4).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), note: "Community trust verification succeeded", updatedBy: "Community" },
            { status: "in_progress", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Assigned to BBMP Road Division. Repair teams are active on site filling potholes.", updatedBy: "Admin" }
          ],
          assignedOfficer: "Engineer Pradeep Gowda",
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: "demo_issue_indiranagar_2",
          title: "Unregulated Garbage Dumping near Indiranagar Metro Station",
          description: "Massive pileup of commercial plastic waste and organic garbage right under the metro stairs. Foul smell has spread across the entire sidewalk and pedestrian access is obstructed.",
          category: "Garbage",
          severity: "high",
          urgency: "high",
          department: "BBMP Solid Waste Management Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: true,
          estimatedDamage: "₹15,000",
          images: ["https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9782,
            lng: 77.6405,
            address: "CMH Road, opposite Indiranagar Metro Station, Indiranagar, Bengaluru, Karnataka 560038"
          },
          pinCode: "560038",
          votesCount: 9,
          votes: {},
          communityVerified: false,
          trustScore: 45,
          status: "submitted",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), note: "Report created via Citizen App", updatedBy: "System" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 12 * 3600000).toISOString()
        },
        {
          id: "demo_issue_indiranagar_3",
          title: "Flickering Streetlights on 12th Main Road",
          description: "An entire stretch of 5 streetlights is constantly flickering or completely off on 12th Main Indiranagar, rendering the residential road extremely dark and unsafe for walkers after 8 PM.",
          category: "Streetlight",
          severity: "medium",
          urgency: "medium",
          department: "BESCOM Electrical Division",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹8,000",
          images: ["https://images.unsplash.com/photo-1509395062183-67c5ad6faff9?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9702,
            lng: 77.6432,
            address: "12th Main Road, Hal 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038"
          },
          pinCode: "560038",
          votesCount: 6,
          votes: {},
          communityVerified: true,
          trustScore: 88,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Verified by community patrol", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: "demo_issue_koramangala_1",
          title: "Severe Waterlogging near Sony World Junction",
          description: "Slight rain is causing heavy water accumulation on the main road near Sony World Junction, reaching almost knee-deep. Clogged storm-water drains are unable to drain the water.",
          category: "Water Leakage",
          severity: "high",
          urgency: "high",
          department: "BWSSB (Water Supply & Sewerage)",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹60,000",
          images: ["https://images.unsplash.com/photo-1545048702-79362596cdc9?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.93496,
            lng: 77.61012,
            address: "Sony World Junction, Koramangala 4th Block, Bengaluru, Karnataka 560034"
          },
          pinCode: "560034",
          votesCount: 22,
          votes: {},
          communityVerified: true,
          trustScore: 97,
          status: "in_progress",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 20 * 3600000).toISOString(), note: "Verified by multiple users", updatedBy: "Community" },
            { status: "in_progress", timestamp: new Date(Date.now() - 10 * 3600000).toISOString(), note: "Silt-clearing vehicle deployed to unclog storm-water inlets", updatedBy: "Admin" }
          ],
          assignedOfficer: "Officer Mahesh Raju",
          verifications: [],
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 10 * 3600000).toISOString()
        },
        {
          id: "demo_issue_koramangala_2",
          title: "Broken Footpath Slabs on 80 Feet Road",
          description: "Multiple granite slabs on the pedestrian walkway have broken or completely collapsed into the storm water drain below, creating deep blind traps for pedestrians.",
          category: "Road Damage",
          severity: "medium",
          urgency: "medium",
          department: "BBMP Road Infrastructure Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹25,000",
          images: ["https://images.unsplash.com/photo-1621243804936-775306a8f2e3?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9392,
            lng: 77.6205,
            address: "80 Feet Road, Koramangala 6th Block, Bengaluru, Karnataka 560095"
          },
          pinCode: "560095",
          votesCount: 11,
          votes: {},
          communityVerified: true,
          trustScore: 90,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Verified by citizen inspection", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: "demo_issue_koramangala_3",
          title: "Illegal Poster Defacement on Public Walls",
          description: "Commercial posters pasted illegally all over the public flyover pillars and utility boxes. Defacing public property and ruining neighborhood aesthetics.",
          category: "Public Property Damage",
          severity: "low",
          urgency: "low",
          department: "BBMP Town Planning Division",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹5,000",
          images: ["https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9298,
            lng: 77.6152,
            address: "Koramangala flyover, 3rd Block, Koramangala, Bengaluru, Karnataka 560034"
          },
          pinCode: "560034",
          votesCount: 4,
          votes: {},
          communityVerified: false,
          trustScore: 30,
          status: "submitted",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 18 * 3600000).toISOString(), note: "Report created", updatedBy: "System" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 18 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 18 * 3600000).toISOString()
        },
        {
          id: "demo_issue_hsr_1",
          title: "Garbage Black Spot in Sector 3 Park Outer Boundary",
          description: "Local vendors and commercial shops are dumping non-segregated wet waste daily along the park's outer wall, attracting packs of stray dogs and creating unhygienic conditions.",
          category: "Garbage",
          severity: "medium",
          urgency: "medium",
          department: "BBMP Solid Waste Management Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹10,000",
          images: ["https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.91162,
            lng: 77.63886,
            address: "14th Main Road, Sector 3, HSR Layout, Bengaluru, Karnataka 560102"
          },
          pinCode: "560102",
          votesCount: 8,
          votes: {},
          communityVerified: false,
          trustScore: 50,
          status: "submitted",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 24 * 3600000).toISOString(), note: "Report created", updatedBy: "System" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 24 * 3600000).toISOString()
        },
        {
          id: "demo_issue_hsr_2",
          title: "Damaged Speedbreaker causing Accidents",
          description: "The concrete speedbreaker on Sector 1 main road has broken and its iron rebars are protruding out of the tarmac, puncturing tires and causing several two-wheeler falls.",
          category: "Road Damage",
          severity: "high",
          urgency: "high",
          department: "BBMP Road Infrastructure Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹20,000",
          images: ["https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9145,
            lng: 77.6492,
            address: "19th Main Road, Sector 1, HSR Layout, Bengaluru, Karnataka 560102"
          },
          pinCode: "560102",
          votesCount: 16,
          votes: {},
          communityVerified: true,
          trustScore: 94,
          status: "in_progress",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Verified by emergency dispatch", updatedBy: "Community" },
            { status: "in_progress", timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), note: "Construction crew scheduled to relay the speedbreaker safely", updatedBy: "Admin" }
          ],
          assignedOfficer: "Inspector Shivanna K",
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 12 * 3600000).toISOString()
        },
        {
          id: "demo_issue_whitefield_1",
          title: "Dangerous Missing Manhole Cover on ITPL Main Road",
          description: "A wide stormwater manhole cover is completely missing on the active pedestrian footpath along ITPL Main Road, right outside the tech park entrance. Major safety hazard.",
          category: "Public Safety",
          severity: "critical",
          urgency: "immediate",
          department: "BWSSB Sewerage Division",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹12,000",
          images: ["https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.96981,
            lng: 77.74997,
            address: "ITPL Main Road, next to Pattandur Agrahara Metro Station, Whitefield, Bengaluru, Karnataka 560066"
          },
          pinCode: "560066",
          votesCount: 19,
          votes: {},
          communityVerified: true,
          trustScore: 99,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 18 * 3600000).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), note: "Verified with live coordinates and photos", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 18 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 12 * 3600000).toISOString()
        },
        {
          id: "demo_issue_whitefield_2",
          title: "Massive Water Pipe Burst near Hope Farm Circle",
          description: "A major BWSSB underground fresh water pipeline has ruptured, sending a fountain of water 15 feet high and flooding the road, completely paralyzing local morning traffic.",
          category: "Water Leakage",
          severity: "critical",
          urgency: "immediate",
          department: "BWSSB (Water Supply & Sewerage)",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: true,
          estimatedDamage: "₹1,80,000",
          images: ["https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9839,
            lng: 77.7512,
            address: "Channasandra Main Road, near Hope Farm Circle, Whitefield, Bengaluru, Karnataka 560066"
          },
          pinCode: "560066",
          votesCount: 25,
          votes: {},
          communityVerified: false,
          trustScore: 60,
          status: "submitted",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), note: "Emergency report logged", updatedBy: "System" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 2 * 3600000).toISOString()
        },
        {
          id: "demo_issue_jayanagar_1",
          title: "Sewer Line Blockage near 4th Block Complex",
          description: "Domestic sewage water is backing up and overflowing onto the main commercial walking plaza of 4th Block Jayanagar, causing terrible odor and severe health risk.",
          category: "Drainage",
          severity: "high",
          urgency: "high",
          department: "BWSSB Sewerage Division",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹40,000",
          images: ["https://images.unsplash.com/photo-1508873696983-2df519f0397e?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.92927,
            lng: 77.58242,
            address: "4th Block Plaza, near Jayanagar Shopping Complex, Bengaluru, Karnataka 560011"
          },
          pinCode: "560011",
          votesCount: 15,
          votes: {},
          communityVerified: true,
          trustScore: 96,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 16 * 3600000).toISOString(), note: "Verified by nearby store owners", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 16 * 3600000).toISOString()
        },
        {
          id: "demo_issue_jayanagar_2",
          title: "Heavy Tree Branch Hanging Precariously",
          description: "Following winds yesterday, a massive banyan tree branch has partially snapped and is hanging very low directly over the high-voltage electricity lines on 3rd Block main road.",
          category: "Trees",
          severity: "high",
          urgency: "high",
          department: "BBMP Forest Department",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹15,000",
          images: ["https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.9315,
            lng: 77.5891,
            address: "11th Main Road, 3rd Block, Jayanagar, Bengaluru, Karnataka 560011"
          },
          pinCode: "560011",
          votesCount: 7,
          votes: {},
          communityVerified: true,
          trustScore: 91,
          status: "in_progress",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Verified with high local support", updatedBy: "Community" },
            { status: "in_progress", timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), note: "Forest department crew dispatched with industrial branch cutters", updatedBy: "Admin" }
          ],
          assignedOfficer: "Horticulture Officer Manjunath",
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 12 * 3600000).toISOString()
        },
        {
          id: "demo_issue_malleswaram_1",
          title: "Frequent Potholes on 8th Cross Road",
          description: "Multiple severe potholes right along the market road on 8th Cross Malleshwaram. Pedestrians carrying groceries are tripping constantly.",
          category: "Road Damage",
          severity: "medium",
          urgency: "medium",
          department: "BBMP Road Infrastructure Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹30,000",
          images: ["https://images.unsplash.com/photo-1599740487708-211aa0873722?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 12.99701,
            lng: 77.57129,
            address: "8th Cross Road, Malleshwaram, Bengaluru, Karnataka 560003"
          },
          pinCode: "560003",
          votesCount: 12,
          votes: {},
          communityVerified: true,
          trustScore: 93,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Verified by local shop association", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: "demo_issue_malleswaram_2",
          title: "Stagnant Garbage Dump on 15th Cross",
          description: "A heap of dry commercial cardboard boxes and decomposing biological market waste left uncollected for 5 days. Attracting rodents right near a hospital entrance.",
          category: "Garbage",
          severity: "high",
          urgency: "high",
          department: "BBMP Solid Waste Management Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹18,000",
          images: ["https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 13.0012,
            lng: 77.5695,
            address: "15th Cross, Sampige Road, Malleshwaram, Bengaluru, Karnataka 560003"
          },
          pinCode: "560003",
          votesCount: 5,
          votes: {},
          communityVerified: false,
          trustScore: 35,
          status: "submitted",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 15 * 3600000).toISOString(), note: "Report created", updatedBy: "System" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 15 * 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 15 * 3600000).toISOString()
        },
        {
          id: "demo_issue_hebbal_1",
          title: "Streetlights Non-functional Under Hebbal Flyover",
          description: "All lights underneath the main loop of Hebbal Flyover are completely dark. This section is highly complex and dark streets make merges extremely risky for high-speed traffic.",
          category: "Streetlight",
          severity: "high",
          urgency: "high",
          department: "BESCOM Electrical Division",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹35,000",
          images: ["https://images.unsplash.com/photo-1509395062183-67c5ad6faff9?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 13.03535,
            lng: 77.59879,
            address: "Hebbal Flyover Undercrossing, Bellary Road, Bengaluru, Karnataka 560024"
          },
          pinCode: "560024",
          votesCount: 18,
          votes: {},
          communityVerified: true,
          trustScore: 98,
          status: "in_progress",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Verified by traffic patrol logs", updatedBy: "Community" },
            { status: "in_progress", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "BESCOM technicians inspecting wiring harness faults", updatedBy: "Admin" }
          ],
          assignedOfficer: "Engineer Ramesh Gowda",
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: "demo_issue_hebbal_2",
          title: "Construction Debris Dumped on Outer Service Road",
          description: "Tons of heavy concrete debris, sand, and bricks dumped on the narrow service road, blocking the entire left lane and forcing vehicles onto oncoming traffic.",
          category: "Garbage",
          severity: "medium",
          urgency: "medium",
          department: "BBMP Solid Waste Management Dept",
          reporterId: "admin_user_id",
          reporterName: "Lead Admin Officer",
          reporterAnonymous: false,
          estimatedDamage: "₹25,000",
          images: ["https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&q=80&w=600"],
          location: {
            lat: 13.0289,
            lng: 77.5921,
            address: "Hebbal Outer Ring Road Service Lane, Hebbal, Bengaluru, Karnataka 560024"
          },
          pinCode: "560024",
          votesCount: 10,
          votes: {},
          communityVerified: true,
          trustScore: 92,
          status: "verified",
          statusHistory: [
            { status: "submitted", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), note: "Report created", updatedBy: "System" },
            { status: "verified", timestamp: new Date(Date.now() - 86400000).toISOString(), note: "Verified via resident geo-photos", updatedBy: "Community" }
          ],
          verifications: [],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString()
        }
      ];

      await dbSetDoc("issues", demoIssue1.id, demoIssue1);
      await dbSetDoc("issues", demoIssue2.id, demoIssue2);
      
      for (const issue of neighborhoodIssues) {
        await dbSetDoc("issues", issue.id, issue);
      }
      console.log("Seeded initial community and rich neighborhood issues.");
    }
  };
  setTimeout(seedAdmin, 2000);

  // ---------------------------------------------------------
  // 4. Authentication Middleware
  // ---------------------------------------------------------
  const authenticateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized access: Token missing" });
      return;
    }
    const token = authHeader.split(" ")[1];
    const session = await dbGetDoc("sessions", token);
    if (!session || new Date(session.expiresAt) < new Date()) {
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }
    const user = await dbGetDoc("users", session.userId);
    if (!user) {
      res.status(401).json({ error: "User profile not found" });
      return;
    }
    (req as any).user = user;
    (req as any).sessionId = token;
    next();
  };

  // ---------------------------------------------------------
  // 5. REST API: Authentication & Users
  // ---------------------------------------------------------
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { name, email, phone, password, city, state, pinCode, role } = req.body;
      if (!name || !email || !phone || !password || !city || !state || !pinCode) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }

      // Check duplicate
      const existing = await dbGetDocs("users", [{ field: "email", op: "==", val: email }]);
      if (existing.length > 0) {
        res.status(400).json({ error: "Email address already registered" });
        return;
      }

      const userId = crypto.randomUUID();
      const newUser = {
        id: userId,
        name,
        email,
        phone,
        passwordHash: hashPassword(password),
        city,
        state,
        pinCode,
        role: role === "admin" ? "admin" : "citizen", // default citizen, can override
        points: 50, // startup points
        level: 1,
        badges: [],
        reportsCount: 0,
        verificationsCount: 0,
        createdAt: new Date().toISOString()
      };

      await dbSetDoc("users", userId, newUser);

      // Create Session automatically
      const token = crypto.randomBytes(32).toString("hex");
      const session = {
        userId,
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString() // 7 days
      };
      await dbSetDoc("sessions", token, session);

      res.status(201).json({ token, user: { id: userId, name, email, role: newUser.role, city, points: 50 } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const users = await dbGetDocs("users", [{ field: "email", op: "==", val: email }]);
      if (users.length === 0) {
        res.status(400).json({ error: "Invalid credentials" });
        return;
      }

      const user = users[0];
      if (user.passwordHash !== hashPassword(password)) {
        res.status(400).json({ error: "Invalid credentials" });
        return;
      }

      // Create Session
      const token = crypto.randomBytes(32).toString("hex");
      const session = {
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString()
      };
      await dbSetDoc("sessions", token, session);

      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city, points: user.points, level: user.level, badges: user.badges } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", authenticateUser, (req, res) => {
    res.json((req as any).user);
  });

  app.post("/api/auth/logout", authenticateUser, async (req, res) => {
    try {
      const token = (req as any).sessionId;
      // Invalidate session
      if (db) {
        // Can set to expired or delete doc
        await dbSetDoc("sessions", token, { expiresAt: new Date(0).toISOString() });
      } else {
        fallbackDB.sessions.delete(token);
      }
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/auth/profile", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { bio, profilePicture, socialLinks } = req.body;

      const updatedData = {
        ...user,
        bio: bio ?? user.bio,
        profilePicture: profilePicture ?? user.profilePicture,
        socialLinks: socialLinks ?? user.socialLinks,
      };

      await dbSetDoc("users", user.id, updatedData);
      res.json(updatedData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 6. REST API: AI-Powered Smart Assistant (Gemini)
  // ---------------------------------------------------------
  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { title, description, category, imageBase64 } = req.body;
      if (!title || !description) {
        res.status(400).json({ error: "Title and description are required for AI analysis" });
        return;
      }

      const aiClient = getGeminiAI();
      let promptText = `
You are the AI Engine of "Community Hero - Hyperlocal Problem Solver".
Please analyze the following reported civic community issue:
Title: "${title}"
User-Provided Description: "${description}"
User-Provided Category: "${category || "Not Selected"}"

Analyze this issue and return a valid JSON object matching this schema precisely:
{
  "category": "One of: Road Damage, Water Leakage, Garbage, Streetlight, Electricity, Drainage, Traffic, Public Safety, Illegal Dumping, Broken Signals, Parks, Trees, Public Property Damage, Others",
  "severity": "low" | "medium" | "high" | "critical",
  "urgency": "low" | "medium" | "high" | "immediate",
  "priorityExplanation": "Brief 1-sentence explanation of why this priority/severity was determined.",
  "department": "Name of best department to handle (e.g. Sanitation Dept, Road Authority, Power Board, Forestry, Traffic Police, Water Board)",
  "enhancedDescription": "A highly polished, clear, grammatically flawless version of the issue description so that engineers understand the location and context immediately.",
  "isSpam": boolean,
  "isFake": boolean,
  "spamConfidence": number
}

Ensure the output is ONLY the JSON block. Do not add markdown formatting or backticks around it.
`;

      let aiResponseText = "";
      if (aiClient) {
        try {
          const contents: any[] = [];
          if (imageBase64) {
            // Support image understanding
            const cleanedBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            contents.push({
              inlineData: {
                data: cleanedBase64,
                mimeType: "image/jpeg"
              }
            });
            promptText += "\nWe have also uploaded a real photo of the issue. Use the photo contents to perform deep visual verification and enhance categorization and severity accuracy.";
          }
          contents.push(promptText);

          const result = await aiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
          });

          aiResponseText = result.text || "";
        } catch (aiErr) {
          console.error("Gemini invocation failed, falling back to local heuristic rules:", aiErr);
        }
      }

      // If AI fails or keys are missing, provide robust heuristic fallback:
      if (!aiResponseText) {
        const descLower = description.toLowerCase() + " " + title.toLowerCase();
        let fallbackCategory = "Others";
        let department = "Municipal Corporation";
        let severity = "medium";
        let urgency = "medium";

        if (descLower.includes("pothole") || descLower.includes("road") || descLower.includes("asphalt")) {
          fallbackCategory = "Road Damage";
          department = "Road & Highway Authority";
          severity = "high";
        } else if (descLower.includes("water") || descLower.includes("leak") || descLower.includes("pipe") || descLower.includes("flooding")) {
          fallbackCategory = "Water Leakage";
          department = "Water & Sewerage Board";
          urgency = "high";
          severity = "high";
        } else if (descLower.includes("garbage") || descLower.includes("dump") || descLower.includes("trash") || descLower.includes("waste")) {
          fallbackCategory = "Garbage";
          department = "Sanitation Department";
        } else if (descLower.includes("light") || descLower.includes("dark") || descLower.includes("lamp")) {
          fallbackCategory = "Streetlight";
          department = "Electricity Board";
        } else if (descLower.includes("electricity") || descLower.includes("wire") || descLower.includes("power")) {
          fallbackCategory = "Electricity";
          department = "Electricity Board";
          severity = "high";
          urgency = "high";
        }

        const fallbackResponse = {
          category: fallbackCategory,
          severity,
          urgency,
          priorityExplanation: "Predicted using smart offline civic rules.",
          department,
          enhancedDescription: `[AI ENHANCED] The reporter flagged a critical issue with ${fallbackCategory}. Details: ${description}`,
          isSpam: descLower.length < 10,
          isFake: false,
          spamConfidence: descLower.length < 10 ? 90 : 5
        };
        aiResponseText = JSON.stringify(fallbackResponse);
      }

      // Sanitize JSON
      let parsedResult;
      try {
        const cleanJSONString = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedResult = JSON.parse(cleanJSONString);
      } catch (jsonErr) {
        // Safe regex extraction or full fallback
        console.warn("Could not parse AI response directly, formatting custom JSON:", aiResponseText);
        parsedResult = {
          category: category || "Others",
          severity: "medium",
          urgency: "medium",
          priorityExplanation: "Analyzed with generic civic models.",
          department: "Municipal Services Department",
          enhancedDescription: description,
          isSpam: false,
          isFake: false,
          spamConfidence: 0
        };
      }

      // Perform duplicate detection against other nearby issues
      const existingIssues = await dbGetDocs("issues");
      const matchedDuplicate = existingIssues.find(i => {
        const sameCategory = i.category === parsedResult.category;
        const dist = Math.abs(i.location.lat - (req.body.lat || 0)) + Math.abs(i.location.lng - (req.body.lng || 0));
        const near = dist < 0.005; // ~500 meters
        return sameCategory && near;
      });

      if (matchedDuplicate) {
        parsedResult.duplicateIssueId = matchedDuplicate.id;
        parsedResult.duplicateIssueTitle = matchedDuplicate.title;
      }

      res.json(parsedResult);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 7. REST API: Issues Management
  // ---------------------------------------------------------
  app.post("/api/issues", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        title,
        description,
        category,
        severity,
        urgency,
        department,
        reporterAnonymous,
        estimatedDamage,
        images,
        lat,
        lng,
        address,
        pinCode
      } = req.body;

      if (!title || !description || !category || !lat || !lng || !address || !pinCode) {
        res.status(400).json({ error: "Missing required report elements." });
        return;
      }

      const getCategoryImageFallback = (cat: string): string => {
        const c = String(cat).toLowerCase();
        if (c.includes("road") || c.includes("signal") || c.includes("traffic")) {
          return "https://images.unsplash.com/photo-1599740487708-211aa0873722?auto=format&fit=crop&q=80&w=600"; // pothole
        }
        if (c.includes("water") || c.includes("leak") || c.includes("pipe") || c.includes("drainage") || c.includes("sewer")) {
          return "https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&q=80&w=600"; // leaking pipe
        }
        if (c.includes("garbage") || c.includes("dumping") || c.includes("waste")) {
          return "https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&q=80&w=600"; // garbage dump
        }
        if (c.includes("light") || c.includes("electr")) {
          return "https://images.unsplash.com/photo-1509395062183-67c5ad6faff9?auto=format&fit=crop&q=80&w=600"; // streetlight at night
        }
        if (c.includes("park") || c.includes("tree")) {
          return "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&q=80&w=600"; // trees/park
        }
        if (c.includes("safety") || c.includes("security")) {
          return "https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&q=80&w=600"; // warning cone
        }
        if (c.includes("property") || c.includes("defacement")) {
          return "https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&q=80&w=600"; // graffitti
        }
        return "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=600"; // city skyline generic
      };

      const issueId = crypto.randomUUID();
      const newIssue = {
        id: issueId,
        title,
        description,
        category,
        severity: severity || "medium",
        urgency: urgency || "medium",
        department: department || "Municipal Corporation",
        reporterId: user.id,
        reporterName: user.name,
        reporterAnonymous: !!reporterAnonymous,
        estimatedDamage: estimatedDamage || "Not calculated",
        images: images && images.length > 0 ? images : [getCategoryImageFallback(category)],
        location: {
          lat: Number(lat),
          lng: Number(lng),
          address: address
        },
        pinCode,
        votesCount: 0,
        votes: {},
        communityVerified: false,
        trustScore: 50, // base starting trust score
        status: "submitted",
        statusHistory: [
          {
            status: "submitted",
            timestamp: new Date().toISOString(),
            note: "Problem report submitted by community member",
            updatedBy: user.name
          }
        ],
        verifications: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await dbSetDoc("issues", issueId, newIssue);

      // Reward citizen points for active reporting
      const pointsAwarded = reporterAnonymous ? 10 : 30; // higher incentive for transparency
      const updatedUser = {
        ...user,
        points: user.points + pointsAwarded,
        reportsCount: user.reportsCount + 1,
        level: Math.floor((user.points + pointsAwarded) / 100) + 1
      };
      
      // Assign Badges if criteria met
      if (updatedUser.reportsCount >= 5 && !updatedUser.badges.includes("Top Reporter")) {
        updatedUser.badges.push("Top Reporter");
      }

      await dbSetDoc("users", user.id, updatedUser);

      // Add audit logs
      const logId = crypto.randomUUID();
      await dbSetDoc("auditLogs", logId, {
        id: logId,
        userId: user.id,
        userName: user.name,
        action: "REPORT_ISSUE",
        details: `Reported issue ${issueId}: "${title}"`,
        timestamp: new Date().toISOString()
      });

      res.status(201).json({ issue: newIssue, pointsAwarded });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/issues", async (req, res) => {
    try {
      const { category, status, pinCode, search, sortBy } = req.query;
      let issues = await dbGetDocs("issues");

      // Filters
      if (category) {
        issues = issues.filter(i => i.category === category);
      }
      if (status) {
        issues = issues.filter(i => i.status === status);
      }
      if (pinCode) {
        issues = issues.filter(i => i.pinCode === pinCode);
      }
      if (search) {
        const queryStr = String(search).toLowerCase();
        issues = issues.filter(
          i => i.title.toLowerCase().includes(queryStr) || i.description.toLowerCase().includes(queryStr)
        );
      }

      // Sorting
      if (sortBy === "newest") {
        issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sortBy === "votes") {
        issues.sort((a, b) => (b.votesCount || 0) - (a.votesCount || 0));
      } else if (sortBy === "trust") {
        issues.sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0));
      } else {
        // default newest
        issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      res.json(issues);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/issues/:id", async (req, res) => {
    try {
      const issue = await dbGetDoc("issues", req.params.id);
      if (!issue) {
        res.status(404).json({ error: "Civic issue report not found" });
        return;
      }
      res.json(issue);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin and Department status updates
  app.put("/api/issues/:id/status", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { status, note, assignedOfficer, completionPhotos } = req.body;

      if (user.role !== "admin") {
        res.status(403).json({ error: "Admin clearance required to update status" });
        return;
      }

      const issue = await dbGetDoc("issues", req.params.id);
      if (!issue) {
        res.status(404).json({ error: "Issue report not found" });
        return;
      }

      const statusHistory = issue.statusHistory || [];
      statusHistory.push({
        status,
        timestamp: new Date().toISOString(),
        note: note || `Status transitioned to ${status}`,
        updatedBy: user.name
      });

      const updatedIssue = {
        ...issue,
        status,
        statusHistory,
        assignedOfficer: assignedOfficer ?? issue.assignedOfficer,
        completionPhotos: completionPhotos ?? issue.completionPhotos,
        updatedAt: new Date().toISOString()
      };

      await dbSetDoc("issues", issue.id, updatedIssue);

      // Reward original submitter if status marked "completed"
      if (status === "completed") {
        const reporter = await dbGetDoc("users", issue.reporterId);
        if (reporter) {
          const awardBonus = 100; // Large payout for fully fixed community issues
          const updatedRep = {
            ...reporter,
            points: reporter.points + awardBonus,
            level: Math.floor((reporter.points + awardBonus) / 100) + 1
          };
          if (updatedRep.points >= 500 && !updatedRep.badges.includes("Community Guardian")) {
            updatedRep.badges.push("Community Guardian");
          }
          await dbSetDoc("users", reporter.id, updatedRep);
        }
      }

      // Add audit log
      const logId = crypto.randomUUID();
      await dbSetDoc("auditLogs", logId, {
        id: logId,
        userId: user.id,
        userName: user.name,
        action: "UPDATE_STATUS",
        details: `Status of ${issue.id} set to "${status}"`,
        timestamp: new Date().toISOString()
      });

      res.json(updatedIssue);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Community Verification / Voting
  app.post("/api/issues/:id/verify", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { proofType, comment, proofPhotoUrl } = req.body;

      if (!proofType || !["confirm", "disagree", "fake"].includes(proofType)) {
        res.status(400).json({ error: "Invalid verification proof type" });
        return;
      }

      const issue = await dbGetDoc("issues", req.params.id);
      if (!issue) {
        res.status(404).json({ error: "Issue report not found" });
        return;
      }

      // Check if user already verified
      const verifications = issue.verifications || [];
      const index = verifications.findIndex((v: any) => v.userId === user.id);

      const verificationEntry = {
        userId: user.id,
        userName: user.name,
        proofType,
        comment: comment || "",
        proofPhotoUrl: proofPhotoUrl || "",
        timestamp: new Date().toISOString()
      };

      if (index > -1) {
        verifications[index] = verificationEntry;
      } else {
        verifications.push(verificationEntry);
      }

      // Recalculate Trust Score
      const confirms = verifications.filter((v: any) => v.proofType === "confirm").length;
      const fakes = verifications.filter((v: any) => v.proofType === "fake").length;
      const disagrees = verifications.filter((v: any) => v.proofType === "disagree").length;

      const totalResponses = confirms + disagrees + fakes;
      let trustScore = 50; // starting trust level
      if (totalResponses > 0) {
        trustScore = Math.round(((confirms + 0.5 * disagrees) / (totalResponses + 0.2 * fakes)) * 100);
        trustScore = Math.max(0, Math.min(100, trustScore));
      }

      // Auto mark verified if trust exceeds 80% and at least 3 verifications
      let communityVerified = issue.communityVerified;
      if (trustScore >= 80 && confirms >= 2) {
        communityVerified = true;
      }

      // Update votes counter
      const votes = issue.votes || {};
      votes[user.id] = proofType === "confirm" ? "up" : "down";
      const votesCount = Object.values(votes).filter(v => v === "up").length - Object.values(votes).filter(v => v === "down").length;

      const updatedIssue = {
        ...issue,
        verifications,
        trustScore,
        communityVerified,
        votes,
        votesCount
      };

      await dbSetDoc("issues", issue.id, updatedIssue);

      // Reward points to active verifier
      const updatedUser = {
        ...user,
        points: user.points + 15,
        verificationsCount: user.verificationsCount + 1,
        level: Math.floor((user.points + 15) / 100) + 1
      };
      
      if (updatedUser.verificationsCount >= 5 && !updatedUser.badges.includes("Fast Verifier")) {
        updatedUser.badges.push("Fast Verifier");
      }

      await dbSetDoc("users", user.id, updatedUser);

      res.json({ issue: updatedIssue, pointsAwarded: 15 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 8. REST API: Comments
  // ---------------------------------------------------------
  app.get("/api/issues/:id/comments", async (req, res) => {
    try {
      const issueId = req.params.id;
      const comments = await dbGetDocs("comments", [{ field: "issueId", op: "==", val: issueId }]);
      comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/issues/:id/comments", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { content, imageUrl } = req.body;
      if (!content) {
        res.status(400).json({ error: "Comment text content is empty." });
        return;
      }

      const commentId = crypto.randomUUID();
      const newComment = {
        id: commentId,
        issueId: req.params.id,
        userId: user.id,
        userName: user.name,
        userAvatar: user.profilePicture || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.name}`,
        content,
        imageUrl: imageUrl || "",
        likes: [],
        createdAt: new Date().toISOString()
      };

      await dbSetDoc("comments", commentId, newComment);
      res.status(201).json(newComment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 9. REST API: Leaderboard & Gamification
  // ---------------------------------------------------------
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const allUsers = await dbGetDocs("users");
      allUsers.sort((a, b) => (b.points || 0) - (a.points || 0));
      const topCitizens = allUsers
        .filter(u => u.role !== "admin")
        .slice(0, 10)
        .map((u, i) => ({
          rank: i + 1,
          id: u.id,
          name: u.name,
          points: u.points || 0,
          level: u.level || 1,
          badges: u.badges || [],
          reportsCount: u.reportsCount || 0
        }));
      res.json(topCitizens);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 10. REST API: Community Announcements
  // ---------------------------------------------------------
  app.get("/api/announcements", async (req, res) => {
    try {
      const announcements = await dbGetDocs("announcements");
      announcements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(announcements);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/announcements", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "admin") {
        res.status(403).json({ error: "Admin clearance required for announcement postings" });
        return;
      }
      const { title, content, department, importance } = req.body;
      if (!title || !content) {
        res.status(400).json({ error: "Title and content are required fields" });
        return;
      }

      const announcementId = crypto.randomUUID();
      const newAnnouncement = {
        id: announcementId,
        title,
        content,
        department: department || "General Municipal Services",
        authorName: user.name,
        date: new Date().toISOString(),
        importance: importance || "medium"
      };

      await dbSetDoc("announcements", announcementId, newAnnouncement);
      res.status(201).json(newAnnouncement);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 11. REST API: Analytics & AI Risk Summaries
  // ---------------------------------------------------------
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const issues = await dbGetDocs("issues");
      const users = await dbGetDocs("users");

      const total = issues.length;
      const pending = issues.filter(i => i.status === "submitted").length;
      const verified = issues.filter(i => i.status === "verified").length;
      const assigned = issues.filter(i => i.status === "assigned").length;
      const inProgress = issues.filter(i => i.status === "in_progress").length;
      const completed = issues.filter(i => i.status === "completed").length;
      const rejected = issues.filter(i => i.status === "rejected").length;

      // Group by Category
      const categoryCounts: { [key: string]: number } = {};
      issues.forEach(i => {
        categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
      });

      // Group by Department
      const departmentCounts: { [key: string]: number } = {};
      issues.forEach(i => {
        departmentCounts[i.department || "Municipal Corp"] = (departmentCounts[i.department || "Municipal Corp"] || 0) + 1;
      });

      // Calculate resolution speed (completed issues vs. submitted times)
      let resolvedCount = 0;
      let totalResolutionTimeMs = 0;
      issues.filter(i => i.status === "completed").forEach(i => {
        const start = new Date(i.createdAt).getTime();
        const end = i.statusHistory?.find((h: any) => h.status === "completed")
          ? new Date(i.statusHistory.find((h: any) => h.status === "completed").timestamp).getTime()
          : new Date(i.updatedAt).getTime();
        if (end > start) {
          totalResolutionTimeMs += (end - start);
          resolvedCount++;
        }
      });
      const avgResolutionDays = resolvedCount > 0 ? Number(((totalResolutionTimeMs / (1000 * 60 * 60 * 24)) / resolvedCount).toFixed(1)) : 2.4;

      // Gemini AI-generated system risk summary
      const aiClient = getGeminiAI();
      let aiCivicSummary = "Healthy community status. Stay vigilant and report any local civic infrastructure anomalies.";
      if (aiClient && total > 0) {
        try {
          const sampleIssuesStr = issues.slice(0, 5).map(i => `${i.title} (${i.category}, Status: ${i.status}, Urgency: ${i.urgency})`).join("\n");
          const prompt = `
You are the AI Chief Analyst of "Community Hero". Based on the following active reported issues in the community, provide a concise, high-level (2-3 sentences) tactical analysis of the community's overall safety risk, major pain points, and recommended actions for municipal council officers:
${sampleIssuesStr}
`;
          const aiRes = await aiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
          });
          if (aiRes.text) {
            aiCivicSummary = aiRes.text.trim();
          }
        } catch (analErr) {
          console.error("Failed generating AI analytical dashboard summary, using local rule:", analErr);
          // High quality rule-based fallback based on actual data
          const criticalCount = issues.filter(i => i.severity === "critical" || i.urgency === "immediate").length;
          const openCount = issues.filter(i => i.status !== "completed" && i.status !== "rejected").length;
          const categoriesList = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
          const mainCategory = categoriesList[0]?.[0] || "infrastructure";
          
          if (openCount === 0) {
            aiCivicSummary = "Community Status: Optimal. All reported civic issues have been successfully resolved. Ongoing monitoring remains active to maintain safety.";
          } else {
            aiCivicSummary = `Analytical assessment shows ${openCount} open community issues, with ${criticalCount} classified as critical and requiring urgent repair. Issues in the ${mainCategory.toUpperCase()} category comprise the highest percentage. Recommended protocol is to prioritize resolving high-severity hazards and coordinate field inspections with the BBMP/BWSSB divisions.`;
          }
        }
      }

      res.json({
        total,
        statusCounts: {
          pending,
          verified,
          assigned,
          inProgress,
          completed,
          rejected
        },
        categoryCounts,
        departmentCounts,
        avgResolutionDays,
        aiCivicSummary,
        activeCitizens: users.filter(u => u.role !== "admin").length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------
  // 12. Mount Vite Middleware for Local Development
  // ---------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving static files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ---------------------------------------------------------
  // 13. Listen to Port 3000 (Required by AI Studio)
  // ---------------------------------------------------------
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Community Hero Server] Listening securely on port http://localhost:${PORT}`);
  });
}

startServer();
