import mongoose from "mongoose";

const { Schema, model } = mongoose;
const base = { strict: false, timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false };
const make = (name, collection, fields = {}) => model(name, new Schema(fields, base), collection);

export const User = make("User", "users", {
  full_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, default: null },
  role: { type: String, enum: ["super_admin", "admin", "team_leader", "member"], default: "member" },
  team_id: { type: String, default: null },
  job_title: { type: String, default: null },
  department: { type: String, default: null },
  is_active: { type: Boolean, default: true },
  last_seen_at: { type: Date, default: null },
  invite_hash: { type: String, default: null },
  invite_expires: { type: Date, default: null },
  reset_hash: { type: String, default: null },
  reset_expires: { type: Date, default: null },
});

export const Team = make("Team", "teams", { name: String, description: String, leader_id: String });
export const Project = make("Project", "projects", {
  name: String, description: String, client_name: String, category: String, team_id: String,
  priority: String, status: String, progress: Number, start_date: Date, end_date: Date,
  deadline: Date, is_archived: Boolean, github_url: String, vercel_url: String, backend_url: String,
});
export const Task = make("Task", "tasks", {
  project_id: String, title: String, description: String, assigned_admin_id: String,
  assigned_member_id: String, team_leader_id: String, created_by: String, priority: String,
  status: String, progress: Number, notes: String, attachments: [String], start_date: Date,
  due_date: Date, completed_at: Date,
});
export const ActivityLog = make("ActivityLog", "activity_logs", {
  actor_id: String, project_id: String, action: String, entity_type: String, entity_id: String, metadata: Schema.Types.Mixed,
});
export const Notification = make("Notification", "notifications", {
  profile_id: String, message: String, type: String, entity_type: String, entity_id: String, read: Boolean,
});
export const ProgressUpdate = make("ProgressUpdate", "progress_updates", {
  project_id: String, task_id: String, author_id: String, work_title: String, work_description: String,
  module_name: String, progress_from: Number, progress_to: Number, status: String,
  github_url: String, live_url: String, screenshots: [String], notes: String,
});
export const TeamCredit = make("TeamCredit", "team_credits", {
  profile_id: String, team_id: String, source: String, points: Number, reason: String,
  task_id: String, awarded_by: String, commend_month: String,
});
export const ProjectMember = make("ProjectMember", "project_members", { project_id: String, profile_id: String, assigned_by: String });
export const ProjectNote = make("ProjectNote", "project_notes", { project_id: String, author_id: String, body: String });
export const ProjectChangeRequest = make("ProjectChangeRequest", "project_change_requests", {
  project_id: String, requester_id: String, summary: String, reason: String,
  proposed_changes: Schema.Types.Mixed, status: { type: String, default: "pending" },
  reviewer_id: String, review_feedback: String, reviewed_at: Date,
});

export const resources = {
  profiles: User,
  user_roles: User,
  teams: Team,
  projects: Project,
  tasks: Task,
  activity_logs: ActivityLog,
  notifications: Notification,
  progress_updates: ProgressUpdate,
  team_credits: TeamCredit,
  project_members: ProjectMember,
  project_notes: ProjectNote,
  project_change_requests: ProjectChangeRequest,
};

export function serialize(resource, doc) {
  const row = doc?.toObject ? doc.toObject({ depopulate: true }) : doc;
  if (!row) return row;
  const { _id, __v, password_hash, invite_hash, invite_expires, reset_hash, reset_expires, ...rest } = row;
  const id = String(_id ?? row.id ?? "");
  if (resource === "user_roles") return { profile_id: id, role: row.role };
  const result = { ...rest, id };
  if (resource === "profiles") result.user_id = id;
  return result;
}
