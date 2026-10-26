import { db, supabase } from "@/lib/supabase";

export type AppRole = "super_admin" | "admin" | "team_leader" | "member";

export type TaskStatus =
  | "pending_approval"
  | "pending"
  | "assigned"
  | "started"
  | "in_progress"
  | "under_review"
  | "completed"
  | "rejected"
  | "blocked"
  | "overdue";

export type Priority = "low" | "medium" | "high" | "critical";

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assigned_admin_id: string | null;
  assigned_member_id: string | null;
  team_leader_id: string | null;
  created_by: string | null;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  notes: string | null;
  attachments: string[];
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  category: string | null;
  team_id: string | null;
  priority: Priority;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  deadline: string | null;
  is_archived: boolean;
  created_at: string;
};

export type ProjectNote = {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  profile_id: string;
  assigned_by: string;
  created_at: string;
};

export type ProjectChangeRequest = {
  id: string;
  project_id: string;
  requester_id: string;
  summary: string;
  reason: string;
  proposed_changes: Partial<Pick<Project, "name" | "description" | "client_name" | "category" | "priority" | "start_date" | "deadline">>;
  status: "pending" | "approved" | "rejected";
  reviewer_id: string | null;
  review_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type Person = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  team_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  role: AppRole;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  leader_id: string | null;
};

export type ActivityLog = {
  id: string;
  actor_id: string | null;
  project_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  profile_id: string;
  message: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
};

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending approval",
  pending: "Pending",
  assigned: "Assigned",
  started: "Started",
  in_progress: "In progress",
  under_review: "Under review",
  completed: "Completed",
  rejected: "Rejected",
  blocked: "Blocked",
  overdue: "Overdue",
  not_started: "Not started",
  planning: "Planning",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const TASK_STATUSES: TaskStatus[] = [
  "pending_approval",
  "assigned",
  "in_progress",
  "under_review",
  "completed",
  "blocked",
  "rejected",
];

export function isOverdue(task: Pick<Task, "due_date" | "status">) {
  if (!task.due_date || task.status === "completed" || task.status === "rejected") return false;
  const due = new Date(task.due_date);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

/** Effective status: derives "overdue" from the due date without mutating the row. */
export function effectiveStatus(task: Task): TaskStatus {
  return isOverdue(task) ? "overdue" : task.status;
}

export function projectCompletion(tasks: Task[]) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "completed").length;
  return Math.round((done / tasks.length) * 100);
}

export function taskStats(tasks: Task[]) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const pendingApproval = tasks.filter((t) => t.status === "pending_approval").length;
  const pending = tasks.length - completed;
  return {
    total: tasks.length,
    completed,
    pending,
    overdue,
    pendingApproval,
    highPriority: tasks.filter((t) => t.priority === "high" || t.priority === "critical").length,
    completion: projectCompletion(tasks),
  };
}

export type ProgressUpdate = {
  id: string;
  project_id: string;
  task_id: string | null;
  author_id: string;
  work_title: string;
  work_description: string | null;
  module_name: string | null;
  progress_from: number;
  progress_to: number;
  status: string;
  github_url: string | null;
  live_url: string | null;
  screenshots: string[];
  notes: string | null;
  created_at: string;
};

/**
 * Loads the organisation workspace from Supabase.
 * Pages keep the same return shape they used with the in-memory database.
 */
export async function fetchWorkspace() {
  const [projects, tasks, profiles, roles, teams, logs] = await Promise.all([
    db(supabase.from("projects").select("*").order("created_at", { ascending: false })),
    db(supabase.from("tasks").select("*").order("created_at", { ascending: false })),
    db(supabase.from("profiles").select("*").order("full_name", { ascending: true })),
    db(supabase.from("user_roles").select("profile_id, role")),
    db(supabase.from("teams").select("*").order("name", { ascending: true })),
    db(
      supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
  ]);

  const roleByProfile = new Map<string, AppRole>(
    (roles ?? []).map((r) => [r.profile_id as string, r.role as AppRole]),
  );

  const people: Person[] = (profiles ?? []).map((p) => ({
    ...(p as Person),
    role: roleByProfile.get(p.id) ?? "member",
  }));

  return {
    projects: (projects ?? []) as Project[],
    tasks: (tasks ?? []) as Task[],
    people,
    teams: (teams ?? []) as Team[],
    logs: (logs ?? []) as ActivityLog[],
  };
}

export async function fetchProjectCollaboration(projectId: string) {
  const [notes, members, changeRequests] = await Promise.all([
    db(supabase.from("project_notes").select("*").eq("project_id", projectId).order("created_at", { ascending: false })),
    db(supabase.from("project_members").select("*").eq("project_id", projectId).order("created_at", { ascending: true })),
    db(supabase.from("project_change_requests").select("*").eq("project_id", projectId).order("created_at", { ascending: false })),
  ]);
  return {
    notes: (notes ?? []) as ProjectNote[],
    members: (members ?? []) as ProjectMember[],
    changeRequests: (changeRequests ?? []) as ProjectChangeRequest[],
  };
}

export async function fetchMyUpdates(profileId: string) {
  const rows = await db(
    supabase
      .from("progress_updates")
      .select("*")
      .eq("author_id", profileId)
      .order("created_at", { ascending: false }),
  );
  return (rows ?? []) as ProgressUpdate[];
}

export type Workspace = Awaited<ReturnType<typeof fetchWorkspace>>;

export function nameOf(people: Array<{ id: string; full_name: string }>, id: string | null | undefined) {
  if (!id) return "—";
  return people.find((p) => p.id === id)?.full_name ?? "Unknown";
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
