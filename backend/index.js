import dotenv from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import nodemailer from "nodemailer";
import { ActivityLog, Notification, Project, ProjectChangeRequest, ProjectMember, ProjectNote, ProgressUpdate, resources, serialize, Task, Team, TeamCredit, User } from "./models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === "production";
const webOrigins = (process.env.WEB_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173").split(",").map((v) => v.trim()).filter(Boolean);
const orgName = process.env.ORG_NAME || "Northlight";
const jwtSecret = process.env.JWT_SECRET || "development-only-change-this-secret-before-production";
const cookieName = "northlight_session";

if (isProduction && (!process.env.MONGO_URI || !process.env.JWT_SECRET || jwtSecret.length < 32 || !process.env.BOOTSTRAP_ADMIN_EMAIL || !process.env.BOOTSTRAP_ADMIN_PASSWORD)) {
  throw new Error("Production requires MONGO_URI, a 32+ character JWT_SECRET, and bootstrap super admin credentials.");
}
if (isProduction && (!process.env.WEB_ORIGIN || !process.env.APP_BASE_URL || !process.env.SMTP_URL || !process.env.CLOUDINARY_URL)) {
  throw new Error("Production also requires WEB_ORIGIN, APP_BASE_URL, SMTP_URL, and CLOUDINARY_URL.");
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"] } } }));
app.use(cors({ origin(origin, callback) { if (!origin || webOrigins.includes(origin)) return callback(null, true); callback(new Error("Origin is not allowed")); }, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.get("origin") && !webOrigins.includes(req.get("origin"))) return res.status(403).json({ error: "Request origin is not allowed" });
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please wait and try again." } });
const password = (value) => bcrypt.hash(value, 12);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const actorView = (user) => ({ id: String(user._id), profileId: String(user._id), name: user.full_name, email: user.email, role: user.role, team_id: user.team_id ?? null });
const safeProfile = (user) => serialize("profiles", user);

function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, jwtSecret, { expiresIn: "12h", issuer: "northlight-api", audience: "northlight-web" });
  res.cookie(cookieName, token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 12 * 60 * 60 * 1000, path: "/" });
}
function clearSession(res) { res.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" }); }

async function auth(req, res, next) {
  try {
    const token = req.cookies[cookieName];
    if (!token) return res.status(401).json({ error: "Sign in required." });
    const claims = jwt.verify(token, jwtSecret, { issuer: "northlight-api", audience: "northlight-web" });
    const user = await User.findById(claims.sub).select("-invite_hash -reset_hash");
    if (!user || !user.is_active || !user.password_hash) { clearSession(res); return res.status(401).json({ error: "This account is inactive or not ready." }); }
    user.password_hash = undefined;
    user.unmarkModified("password_hash");
    req.user = user;
    next();
  } catch { clearSession(res); res.status(401).json({ error: "Session expired. Please sign in again." }); }
}

const isAdmin = (u) => ["admin", "super_admin"].includes(u.role);
const isPrivileged = (u) => ["admin", "super_admin", "team_leader"].includes(u.role);
const requireRole = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "You do not have permission to do that." });

function withId(row) { return { ...row, id: String(row.id ?? row._id) }; }
function objectFor(resource, row) {
  if (resource === "user_roles") return { profile_id: String(row._id), role: row.role };
  return serialize(resource, row);
}
function projectFields(row, requested) {
  if (!requested || requested === "*") return row;
  const picked = {};
  for (const field of requested.split(",").map((v) => v.trim()).filter(Boolean)) if (field in row) picked[field] = row[field];
  if ("id" in row && !("id" in picked)) picked.id = row.id;
  return picked;
}
function scalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
function convertFilter(resource, key) {
  if (key === "id") return "_id";
  if (resource === "user_roles" && key === "profile_id") return "_id";
  return key;
}
async function scopeFilter(resource, user) {
  if (isAdmin(user)) return {};
  if (user.role === "team_leader") {
    const teams = await Team.find({ leader_id: String(user._id) }).select("_id").lean();
    const teamIds = teams.map((team) => String(team._id));
    const projectIds = await Project.find({ team_id: { $in: teamIds } }).distinct("_id");
    const base = {
      profiles: { $or: [{ team_id: { $in: teamIds } }, { _id: user._id }] },
      user_roles: { $or: [{ team_id: { $in: teamIds } }, { _id: user._id }] },
      teams: { _id: { $in: teamIds } },
      projects: { team_id: { $in: teamIds } },
      tasks: { team_leader_id: String(user._id) },
      activity_logs: { project_id: { $in: projectIds.map(String) } },
      progress_updates: { project_id: { $in: projectIds.map(String) } },
      team_credits: { team_id: { $in: teamIds } },
      project_members: { project_id: { $in: projectIds.map(String) } },
      project_notes: { project_id: { $in: projectIds.map(String) } },
      project_change_requests: { project_id: { $in: projectIds.map(String) } },
      notifications: { profile_id: String(user._id) },
    };
    return base[resource] ?? { _id: { $in: [] } };
  }
  const teamId = user.team_id;
  const teammateIds = teamId ? await User.find({ team_id: teamId, is_active: true }).distinct("_id") : [user._id];
  const projectIds = await Task.find({ assigned_member_id: String(user._id) }).distinct("project_id");
  const base = {
    profiles: { $or: [{ _id: user._id }, { _id: { $in: teammateIds } }] },
    user_roles: { $or: [{ _id: user._id }, { _id: { $in: teammateIds } }] },
    teams: teamId ? { _id: teamId } : { _id: { $in: [] } },
    projects: { _id: { $in: projectIds } },
    tasks: { assigned_member_id: String(user._id) },
    activity_logs: { project_id: { $in: projectIds.map(String) } },
    progress_updates: { project_id: { $in: projectIds.map(String) } },
    team_credits: teamId ? { team_id: teamId } : { profile_id: String(user._id) },
    project_members: { project_id: { $in: projectIds.map(String) } },
    project_notes: { project_id: { $in: projectIds.map(String) } },
    project_change_requests: { project_id: { $in: projectIds.map(String) } },
    notifications: { profile_id: String(user._id) },
  };
  return base[resource] ?? { _id: { $in: [] } };
}
function combine(a, b) { return Object.keys(a).length ? { $and: [a, b] } : b; }
const writableFields = {
  profiles: ["full_name", "email", "job_title", "department", "team_id", "is_active"],
  teams: ["name", "description", "leader_id"],
  projects: ["name", "description", "client_name", "category", "team_id", "priority", "status", "progress", "start_date", "end_date", "deadline", "is_archived", "github_url", "vercel_url", "backend_url"],
  tasks: ["project_id", "title", "description", "assigned_admin_id", "assigned_member_id", "team_leader_id", "created_by", "priority", "status", "progress", "notes", "attachments", "start_date", "due_date", "completed_at"],
};

async function addCredit({ profileId, teamId, source, points, reason, taskId = null, actorId = null }) {
  const session = await mongoose.startSession();
  let actual = 0;
  try {
    await session.withTransaction(async () => {
      const lockTeam = await Team.findByIdAndUpdate(teamId, { $inc: { credit_revision: 1 } }, { new: true, session });
      if (!lockTeam) return;
      const checks = [];
      if (taskId) checks.push({ source: "task", task_id: taskId });
      let commendMonth;
      if (source === "commendation") {
        const now = new Date();
        commendMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        checks.push({ source, awarded_by: String(actorId), profile_id: String(profileId), commend_month: commendMonth });
      }
      if (checks.length && await TeamCredit.exists({ $or: checks }).session(session)) return;
      const currentTeamMembers = (await User.find({ team_id: String(teamId), is_active: true }).session(session).distinct("_id")).map(String);
      if (!currentTeamMembers.includes(String(profileId))) currentTeamMembers.push(String(profileId));
      const scores = await TeamCredit.aggregate([{ $match: { profile_id: { $in: currentTeamMembers } } }, { $group: { _id: "$profile_id", total: { $sum: "$points" } } }]).session(session);
      const otherHighest = scores.filter((s) => s._id !== String(profileId)).reduce((max, s) => Math.max(max, s.total), 0);
      const current = scores.find((s) => s._id === String(profileId))?.total ?? 0;
      actual = points;
      if (points > 0 && otherHighest > 0) actual = Math.min(points, Math.max(0, Math.floor(otherHighest * 1.2) - current));
      if (!actual && source !== "commendation" && source !== "task") return;
      await TeamCredit.create([{ profile_id: String(profileId), team_id: String(teamId), source, points: actual, reason: reason.slice(0, 500), task_id: taskId, awarded_by: actorId ? String(actorId) : null, commend_month: commendMonth }], { session });
    });
    return actual;
  } catch (error) { if (error?.code === 11000) return 0; throw error; }
  finally { await session.endSession(); }
}

async function awardTask(task, actorId) {
  if (task.status !== "completed" || !task.assigned_member_id || await TeamCredit.exists({ source: "task", task_id: String(task._id) })) return;
  const member = await User.findById(task.assigned_member_id).select("team_id");
  if (!member?.team_id) return;
  const points = ({ low: 1, medium: 2, high: 3, critical: 5 })[task.priority] ?? 1;
  await addCredit({ profileId: member._id, teamId: member.team_id, source: "task", points, reason: `Completed task: ${task.title}`, taskId: String(task._id), actorId });
}

function makeMailer() {
  if (!process.env.SMTP_URL) return null;
  return nodemailer.createTransport(process.env.SMTP_URL);
}
const mailer = makeMailer();
async function sendTokenEmail(to, subject, url, text) {
  if (!mailer) {
    if (isProduction) throw new Error("Email delivery is not configured. Set SMTP_URL before inviting users or resetting passwords.");
    return url;
  }
  await mailer.sendMail({ from: process.env.MAIL_FROM || `Northlight <no-reply@localhost>`, to, subject, text: `${text}\n\n${url}\n\nThis link expires in 24 hours.` });
  return null;
}

app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ ok: connected, service: "northlight-api", database: connected ? "connected" : "disconnected" });
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !user.password_hash || !user.is_active || !(await bcrypt.compare(String(req.body.password || ""), user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    user.last_seen_at = new Date(); await user.save(); setSession(res, user);
    res.json({ user: actorView(user) });
  } catch (error) { next(error); }
});
app.post("/api/auth/logout", (_req, res) => { clearSession(res); res.status(204).end(); });
app.get("/api/auth/session", auth, (req, res) => res.json({ user: actorView(req.user), profile: safeProfile(req.user) }));
app.post("/api/auth/invite", auth, requireRole("admin", "super_admin"), async (req, res, next) => {
  try {
    const { email, full_name, role = "member", team_id = null, job_title = null, department = null } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) || !full_name || !["admin", "team_leader", "member", "super_admin"].includes(role)) return res.status(400).json({ error: "A name, valid email, and permitted role are required." });
    if (role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Only a super admin can invite another super admin." });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "An account with this email already exists." });
    if (team_id && !(await Team.exists({ _id: String(team_id) }))) return res.status(400).json({ error: "Choose an existing team or leave this person unassigned." });
    if (isProduction && !mailer) return res.status(503).json({ error: "Email delivery is not configured. Set SMTP_URL before inviting users." });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const user = await User.create({ email: normalizedEmail, full_name: String(full_name).trim(), role, team_id, job_title, department, is_active: true, invite_hash: sha256(rawToken), invite_expires: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const inviteUrl = `${process.env.APP_BASE_URL || webOrigins[0]}/accept-invite?token=${rawToken}`;
    const devUrl = await sendTokenEmail(normalizedEmail, `Join ${orgName}`, inviteUrl, `Hello ${user.full_name},\n\nYou have been invited to ${orgName}. Set your password to activate your account.`);
    await ActivityLog.create({ actor_id: String(req.user._id), action: `invited user ${normalizedEmail} (${role})`, entity_type: "user", entity_id: String(user._id), metadata: { role } });
    res.status(201).json({ profileId: String(user._id), ...(devUrl ? { developmentInviteUrl: devUrl } : {}) });
  } catch (error) { next(error); }
});
app.post("/api/auth/accept-invite", async (req, res, next) => {
  try {
    const token = String(req.body.token || ""); const newPassword = String(req.body.password || "");
    if (newPassword.length < 12) return res.status(400).json({ error: "Use a password with at least 12 characters." });
    const user = await User.findOne({ invite_hash: sha256(token), invite_expires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: "This invitation is invalid or expired. Ask an admin for a new one." });
    user.password_hash = await password(newPassword); user.invite_hash = null; user.invite_expires = null; user.last_seen_at = new Date(); await user.save(); setSession(res, user); res.json({ user: actorView(user) });
  } catch (error) { next(error); }
});
app.post("/api/auth/request-password-reset", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase(); const user = await User.findOne({ email, is_active: true });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex"); user.reset_hash = sha256(rawToken); user.reset_expires = new Date(Date.now() + 60 * 60 * 1000); await user.save();
      const url = `${process.env.APP_BASE_URL || webOrigins[0]}/reset-password?token=${rawToken}`;
      await sendTokenEmail(email, `${orgName} password reset`, url, "Use this one-time link to reset your password.");
    }
    res.json({ message: "If that account exists, a password reset link has been sent." });
  } catch (error) { next(error); }
});
app.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const user = await User.findOne({ reset_hash: sha256(String(req.body.token || "")), reset_expires: { $gt: new Date() } });
    const newPassword = String(req.body.password || "");
    if (!user) return res.status(400).json({ error: "This reset link is invalid or expired." });
    if (newPassword.length < 12) return res.status(400).json({ error: "Use a password with at least 12 characters." });
    user.password_hash = await password(newPassword); user.reset_hash = null; user.reset_expires = null; await user.save(); setSession(res, user); res.json({ user: actorView(user) });
  } catch (error) { next(error); }
});

app.get("/api/data/:resource", auth, async (req, res, next) => {
  try {
    const resource = req.params.resource;
    if (!resources[resource]) return res.status(404).json({ error: "Unknown data collection." });
    const Model = resources[resource];
    if (resource === "user_roles" && !isPrivileged(req.user)) return res.status(403).json({ error: "Role directory is restricted." });
    const filter = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (["select", "order", "limit", "upsert"].includes(key)) continue;
      if (!Model.schema.path(key) && !(key === "id" || resource === "user_roles" && key === "profile_id")) return res.status(400).json({ error: `Unsupported filter: ${key}` });
      filter[convertFilter(resource, key)] = scalar(String(value));
    }
    let query = combine(await scopeFilter(resource, req.user), filter);
    if (resource === "user_roles") query = combine(query, { role: { $exists: true } });
    let cursor = Model.find(query);
    if (req.query.order) {
      const [field, direction] = String(req.query.order).split(".");
      if (Model.schema.path(field) || field === "_id") cursor = cursor.sort({ [field]: direction === "desc" ? -1 : 1 });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000);
    const rows = await cursor.limit(limit).lean();
    const data = rows.map((row) => projectFields(objectFor(resource, row), req.query.select));
    res.json({ data });
  } catch (error) { next(error); }
});

async function writePermission(resource, action, user, body, ids) {
  if (["team_credits", "notifications"].includes(resource)) return false;
  if (resource === "activity_logs") return action === "insert" && (Array.isArray(body) ? body.every((r) => String(r.actor_id) === String(user._id)) : String(body.actor_id) === String(user._id));
  if (["projects", "teams", "profiles", "user_roles"].includes(resource)) {
    if (!isAdmin(user)) return false;
    if (resource === "profiles") return action === "update";
    if (resource === "user_roles") {
      if (!new Set(["insert", "update"]).has(action)) return false;
      const rows = Array.isArray(body) ? body : [body];
      return rows.every((row) => ["member", "team_leader", "admin", "super_admin"].includes(row.role) && (row.role !== "super_admin" || user.role === "super_admin"));
    }
    return true;
  }
  if (resource === "tasks") {
    if (["admin", "super_admin", "team_leader"].includes(user.role)) return true;
    if (action === "insert") return (Array.isArray(body) ? body : [body]).every((row) => row.status === "pending_approval" && String(row.created_by) === String(user._id));
    if (action === "update") return ids.assigned_member_id === String(user._id);
    return false;
  }
  if (resource === "progress_updates") return action === "insert" && (Array.isArray(body) ? body.every((r) => String(r.author_id) === String(user._id)) : String(body.author_id) === String(user._id));
  if (resource === "project_members") return user.role === "super_admin";
  if (resource === "project_notes") return action === "insert" && isAdmin(user) && String(body.author_id) === String(user._id);
  if (resource === "project_change_requests") return action === "insert" && isAdmin(user) && String(body.requester_id) === String(user._id);
  if (resource === "notifications") return false;
  return false;
}

app.post("/api/data/:resource", auth, async (req, res, next) => {
  try {
    const resource = req.params.resource; const Model = resources[resource];
    if (!Model) return res.status(404).json({ error: "Unknown data collection." });
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (!(await writePermission(resource, "insert", req.user, req.body, {}))) return res.status(403).json({ error: "You do not have permission to create these records." });
    if (resource === "user_roles") {
      const docs = [];
      for (const row of rows) { const user = await User.findById(row.profile_id); if (!user) continue; if (user.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Only a super admin can change a super admin role." }); user.role = row.role; await user.save(); docs.push(user); }
      return res.json({ data: docs.map((row) => objectFor(resource, row)) });
    }
    if (resource === "profiles") return res.status(403).json({ error: "Create accounts through the invite flow." });
    if (resource === "team_credits") return res.status(403).json({ error: "Credits can only be awarded through approved actions." });
    if (resource === "projects") {
      for (const row of rows) for (const key of ["github_url", "vercel_url", "backend_url"]) if (row[key] && !/^https:\/\//i.test(row[key])) return res.status(400).json({ error: `${key} must use HTTPS.` });
    }
    const docs = await Model.create(rows);
    if (resource === "tasks") for (const task of (Array.isArray(docs) ? docs : [docs])) { if (task.status === "completed") await awardTask(task, req.user._id); await recalcProject(task.project_id); }
    res.status(201).json({ data: (Array.isArray(docs) ? docs : [docs]).map((row) => objectFor(resource, row)) });
  } catch (error) { next(error); }
});

app.patch("/api/data/:resource", auth, async (req, res, next) => {
  try {
    const resource = req.params.resource; const Model = resources[resource];
    if (!Model || ["activity_logs", "progress_updates", "project_members", "project_notes", "project_change_requests", "team_credits", "notifications"].includes(resource)) return res.status(403).json({ error: "These records cannot be changed directly." });
    const filter = {}; for (const [key, value] of Object.entries(req.query)) { if (!Model.schema.path(key) && key !== "id" && !(resource === "user_roles" && key === "profile_id")) return res.status(400).json({ error: `Unsupported filter: ${key}` }); filter[convertFilter(resource, key)] = scalar(String(value)); }
    const scoped = combine(await scopeFilter(resource, req.user), filter);
    const targets = await Model.find(scoped).limit(100).exec();
    if (!targets.length) return res.json({ data: null });
    for (const target of targets) {
      const ids = { assigned_member_id: target.assigned_member_id };
      if (!(await writePermission(resource, "update", req.user, req.body, ids))) return res.status(403).json({ error: "You do not have permission to change these records." });
      if (resource === "tasks" && req.user.role === "member" && Object.keys(req.body).some((key) => !["status", "progress", "notes", "attachments", "completed_at"].includes(key))) return res.status(403).json({ error: "Team members can update only task progress and work submission details." });
      if (resource === "user_roles") {
        if (!["member", "team_leader", "admin", "super_admin"].includes(req.body.role) || req.body.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Invalid or unauthorized role change." });
        if (target.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Only a super admin can change a super admin role." });
        target.role = req.body.role;
      } else {
        if (resource === "profiles" && Object.hasOwn(req.body, "is_active") && (!req.body.is_active && String(target._id) === String(req.user._id) || target.role === "super_admin" && req.user.role !== "super_admin")) return res.status(403).json({ error: "You cannot deactivate this account." });
        if (resource === "projects") for (const key of ["github_url", "vercel_url", "backend_url"]) if (req.body[key] && !/^https:\/\//i.test(req.body[key])) return res.status(400).json({ error: `${key} must use HTTPS.` });
        const allowed = writableFields[resource] || [];
        for (const [key, value] of Object.entries(req.body)) if (allowed.includes(key)) target.set(key, value);
      }
      await target.save();
      if (resource === "tasks" && target.status === "completed") await awardTask(target, req.user._id);
      if (resource === "tasks") await recalcProject(target.project_id);
    }
    res.json({ data: targets.map((row) => objectFor(resource, row)) });
  } catch (error) { next(error); }
});

app.delete("/api/data/:resource", auth, async (req, res, next) => {
  try {
    const resource = req.params.resource; const Model = resources[resource];
    if (!Model || ["activity_logs", "progress_updates", "team_credits", "notifications"].includes(resource)) return res.status(403).json({ error: "These records cannot be deleted directly." });
    const filter = {}; for (const [key, value] of Object.entries(req.query)) { if (!Model.schema.path(key) && key !== "id") return res.status(400).json({ error: `Unsupported filter: ${key}` }); filter[convertFilter(resource, key)] = scalar(String(value)); }
    const scoped = combine(await scopeFilter(resource, req.user), filter);
    const targets = await Model.find(scoped).limit(100).exec();
    if (!targets.length) return res.json({ data: [] });
    for (const target of targets) if (!(await writePermission(resource, "delete", req.user, {}, { assigned_member_id: target.assigned_member_id }))) return res.status(403).json({ error: "You do not have permission to delete these records." });
    await Model.deleteMany({ _id: { $in: targets.map((row) => row._id) } });
    if (resource === "projects") await Task.deleteMany({ project_id: { $in: targets.map((row) => String(row._id)) } });
    if (resource === "teams") await User.updateMany({ team_id: { $in: targets.map((row) => String(row._id)) } }, { $set: { team_id: null } });
    res.json({ data: [] });
  } catch (error) { next(error); }
});

app.put("/api/data/:resource", auth, async (req, res, next) => {
  try {
    const resource = req.params.resource; const Model = resources[resource];
    if (!Model || resource !== "user_roles" || !isAdmin(req.user)) return res.status(403).json({ error: "Upsert is not permitted for this collection." });
    const rows = Array.isArray(req.body) ? req.body : [req.body]; const docs = [];
    for (const row of rows) { if (!row.profile_id || !["member", "team_leader", "admin", "super_admin"].includes(row.role) || row.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Invalid role change." }); const user = await User.findById(row.profile_id); if (!user) continue; if (user.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Only a super admin can change a super admin role." }); user.role = row.role; await user.save(); docs.push(user); }
    res.json({ data: docs.map((row) => objectFor(resource, row)) });
  } catch (error) { next(error); }
});

async function recalcProject(projectId) {
  const tasks = await Task.find({ project_id: String(projectId) }).select("status").lean();
  if (!tasks.length) return;
  const progress = Math.round(tasks.filter((task) => task.status === "completed").length / tasks.length * 100);
  await Project.findByIdAndUpdate(projectId, { progress, status: progress === 100 ? "completed" : "in_progress" });
}

app.post("/api/notifications", auth, async (req, res, next) => {
  try {
    const { profileIds = [], message, type = "info", entity } = req.body;
    if (!Array.isArray(profileIds) || !message || String(message).length > 500) return res.status(400).json({ error: "Notification details are invalid." });
    const targets = [...new Set(profileIds.map(String))].slice(0, 20);
    const ownTeam = req.user.team_id ? await Team.findById(req.user.team_id).select("leader_id") : null;
    const allowed = new Set([String(req.user._id), ownTeam?.leader_id, ...(await User.find({ role: { $in: ["admin", "super_admin"] }, is_active: true }).distinct("_id")).map(String)].filter(Boolean));
    if (targets.some((id) => !allowed.has(id)) && !isPrivileged(req.user)) return res.status(403).json({ error: "You can notify only your team leader or an administrator." });
    const docs = await Notification.insertMany(targets.map((profile_id) => ({ profile_id, message: String(message), type, entity_type: entity?.type ?? null, entity_id: entity?.id ?? null, read: false })));
    res.status(201).json({ data: docs.map((row) => objectFor("notifications", row)) });
  } catch (error) { next(error); }
});
app.patch("/api/notifications/read", auth, async (req, res, next) => {
  try { await Notification.updateMany({ profile_id: String(req.user._id), read: false }, { $set: { read: true } }); res.status(204).end(); }
  catch (error) { next(error); }
});

app.post("/api/rpc/:name", auth, async (req, res, next) => {
  try {
    const args = req.body || {}; const name = req.params.name;
    if (name === "touch_last_seen") { await User.findByIdAndUpdate(req.user._id, { last_seen_at: new Date() }); return res.json({ data: null }); }
    if (name === "claim_admin_access") return res.status(403).json({ error: "Admin access is assigned by an existing administrator." });
    if (name === "get_team_credit_totals") {
      let profileIds;
      if (isAdmin(req.user)) profileIds = null;
      else if (req.user.role === "team_leader") {
        const teamIds = await Team.find({ leader_id: String(req.user._id) }).distinct("_id");
        profileIds = await User.find({ team_id: { $in: teamIds.map(String) }, is_active: true }).distinct("_id");
      } else profileIds = req.user.team_id ? await User.find({ team_id: req.user.team_id, is_active: true }).distinct("_id") : [req.user._id];
      const filter = profileIds ? { profile_id: { $in: profileIds.map(String) } } : {};
      const rows = await TeamCredit.aggregate([{ $match: filter }, { $group: { _id: "$profile_id", lifetime_points: { $sum: "$points" } } }]);
      return res.json({ data: rows.map((row) => ({ profile_id: row._id, lifetime_points: row.lifetime_points })) });
    }
    if (name === "commend_team_member") {
      if (req.user.role !== "member") return res.status(403).json({ error: "Only team members can commend peers." });
      const recipient = await User.findById(args.target_profile).select("team_id role");
      if (!recipient || !req.user.team_id || recipient.team_id !== req.user.team_id || String(recipient._id) === String(req.user._id)) return res.status(400).json({ error: "Choose a teammate in your team." });
      const reason = String(args.credit_reason || "").trim(); if (!reason || reason.length > 500) return res.status(400).json({ error: "A reason of 1 to 500 characters is required." });
      const awarded = await addCredit({ profileId: recipient._id, teamId: req.user.team_id, source: "commendation", points: 1, reason, actorId: req.user._id });
      if (!awarded && await TeamCredit.exists({ source: "commendation", awarded_by: String(req.user._id), profile_id: String(recipient._id), commend_month: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}` })) return res.status(409).json({ error: "You already commended this teammate this month." });
      return res.json({ data: awarded });
    }
    if (name === "correct_team_credit") {
      if (!isAdmin(req.user)) return res.status(403).json({ error: "Only admins can correct credits." });
      const target = await User.findById(args.target_profile).select("team_id"); const amount = Number(args.requested_points); const reason = String(args.credit_reason || "").trim();
      if (!target?.team_id || !Number.isInteger(amount) || amount === 0 || !reason || reason.length > 500) return res.status(400).json({ error: "Enter a valid non-zero adjustment and reason." });
      let applied = amount;
      if (amount < 0) { const total = await TeamCredit.aggregate([{ $match: { profile_id: String(target._id) } }, { $group: { _id: null, score: { $sum: "$points" } } }]); applied = Math.max(amount, -(total[0]?.score ?? 0)); if (!applied) return res.json({ data: 0 }); await TeamCredit.create({ profile_id: String(target._id), team_id: target.team_id, source: "adjustment", points: applied, reason, awarded_by: String(req.user._id) }); }
      else applied = await addCredit({ profileId: target._id, teamId: target.team_id, source: "adjustment", points: amount, reason, actorId: req.user._id });
      return res.json({ data: applied });
    }
    if (name === "recalc_project") { await recalcProject(args.target_project); return res.json({ data: null }); }
    if (name === "delete_person") {
      if (!isAdmin(req.user) || String(args.target_id) === String(req.user._id)) return res.status(403).json({ error: "You cannot delete this account." });
      const target = await User.findById(args.target_id).select("role");
      if (!target) return res.json({ data: null });
      if (target.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ error: "Only a super admin can delete another super admin." });
      await User.findByIdAndDelete(args.target_id);
      await Team.updateMany({ leader_id: String(args.target_id) }, { $set: { leader_id: null } });
      return res.json({ data: null });
    }
    if (name === "review_project_change_request") {
      if (req.user.role !== "super_admin") return res.status(403).json({ error: "Only super admins can review project changes." });
      const request = await ProjectChangeRequest.findById(args.request_id);
      if (!request || request.status !== "pending" || !["approved", "rejected"].includes(args.decision)) return res.status(400).json({ error: "This change request cannot be reviewed." });
      const allowed = ["name", "description", "client_name", "category", "priority", "start_date", "deadline"];
      const changes = request.proposed_changes || {};
      if (Object.keys(changes).some((key) => !allowed.includes(key))) return res.status(400).json({ error: "The request contains unsupported changes." });
      if (args.decision === "approved") await Project.findByIdAndUpdate(request.project_id, changes);
      request.status = args.decision; request.reviewer_id = String(req.user._id); request.review_feedback = String(args.feedback || "").trim() || null; request.reviewed_at = new Date(); await request.save();
      await ActivityLog.create({ actor_id: String(req.user._id), project_id: request.project_id, action: `${args.decision} project change`, entity_type: "project_change_request", entity_id: String(request._id), metadata: { summary: request.summary } });
      return res.json({ data: null });
    }
    return res.status(404).json({ error: "Unknown server action." });
  } catch (error) { next(error); }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, cb) => cb(null, ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype)) });
app.post("/api/uploads", auth, upload.array("files", 8), async (req, res, next) => {
  try {
    if (!process.env.CLOUDINARY_URL) return res.status(503).json({ error: "Screenshot storage is not configured." });
    const files = req.files || []; const uploaded = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `northlight/${req.user._id}`, resource_type: "image", type: "authenticated" }, (error, result) => error ? reject(error) : resolve(result)); stream.end(file.buffer);
    })));
    res.status(201).json({ paths: uploaded.map((row) => `${row.public_id}.${row.format}`) });
  } catch (error) { next(error); }
});
app.post("/api/uploads/signed", auth, async (req, res, next) => {
  try {
    const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
    const urls = paths.map((publicId) => {
      const path = String(publicId);
      const match = path.match(/^(northlight\/[a-f0-9]{24}\/[^/]+)\.([a-z0-9]+)$/i);
      if (!match) return null;
      const ownerId = path.split("/")[1];
      if (ownerId !== String(req.user._id) && !isPrivileged(req.user)) return null;
      return cloudinary.utils.private_download_url(match[1], match[2], { resource_type: "image", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }).filter(Boolean);
    res.json({ urls });
  } catch (error) { next(error); }
});

app.get("/api/projects/:projectId/collaboration", auth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!isAdmin(req.user) && !(req.user.role === "team_leader" && String(project.team_id) === String((await Team.findOne({ leader_id: String(req.user._id) }))?._id))) return res.status(403).json({ error: "Project access is restricted." });
    const [notes, members, changeRequests] = await Promise.all([
      ProjectNote.find({ project_id: String(project._id) }).sort({ created_at: -1 }).lean(),
      ProjectMember.find({ project_id: String(project._id) }).sort({ created_at: 1 }).lean(),
      ProjectChangeRequest.find({ project_id: String(project._id) }).sort({ created_at: -1 }).lean(),
    ]);
    res.json({ notes: notes.map((row) => serialize("project_notes", row)), members: members.map((row) => serialize("project_members", row)), changeRequests: changeRequests.map((row) => serialize("project_change_requests", row)) });
  } catch (error) { next(error); }
});
app.get("/api/updates/me", auth, async (req, res, next) => {
  try { const rows = await ProgressUpdate.find({ author_id: String(req.user._id) }).sort({ created_at: -1 }).limit(500).lean(); res.json({ data: rows.map((row) => serialize("progress_updates", row)) }); } catch (error) { next(error); }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : "The request could not be completed." }); });

async function bootstrapAdmin() {
  if (await User.exists({ role: "super_admin" })) return;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !rawPassword) return;
  if (rawPassword.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  await User.create({ email, full_name: process.env.BOOTSTRAP_ADMIN_NAME || "Organization Admin", role: "super_admin", password_hash: await password(rawPassword), is_active: true });
}

await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/northlight?replicaSet=rs0");
await Promise.all([
  TeamCredit.collection.createIndex({ source: 1, task_id: 1 }, { unique: true, partialFilterExpression: { source: "task", task_id: { $type: "string" } } }),
  TeamCredit.collection.createIndex({ source: 1, awarded_by: 1, profile_id: 1, commend_month: 1 }, { unique: true, partialFilterExpression: { source: "commendation", commend_month: { $type: "string" } } }),
  TeamCredit.collection.createIndex({ team_id: 1, profile_id: 1, created_at: -1 }),
  TeamCredit.collection.createIndex({ source: 1, awarded_by: 1, profile_id: 1, created_at: -1 }),
  Project.collection.createIndex({ team_id: 1, status: 1 }),
  Task.collection.createIndex({ project_id: 1, status: 1 }),
]);
await bootstrapAdmin();
app.listen(port, () => console.log(`Northlight MERN API listening on ${port}`));
