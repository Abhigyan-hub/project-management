import { db, supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/workspace";

export type ProjectRow = {
  id: string;
  name: string;
  client_name: string | null;
  category: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status:
    | "not_started"
    | "planning"
    | "in_progress"
    | "under_review"
    | "completed"
    | "on_hold"
    | "cancelled";
  progress: number;
  deadline: string | null;
};

export type TaskRow = {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  assigned_admin_id: string | null;
  assigned_member_id: string | null;
  completed_at: string | null;
  created_at: string;
};

export type UpdateRow = {
  id: string;
  project_id: string;
  author_id: string;
  work_title: string;
  module_name: string | null;
  progress_from: number;
  progress_to: number;
  status: string;
  github_url: string | null;
  live_url: string | null;
  screenshots: string[];
  created_at: string;
};

export type PersonRow = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  role: "super_admin" | "admin" | "team_leader" | "member";
};

export const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  planning: "Planning",
  in_progress: "In progress",
  under_review: "Under review",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
  pending: "Pending",
  started: "Started",
  rejected: "Rejected",
  blocked: "Blocked",
};

/** Organisation metrics source. Same return shape the dashboard and reports expect. */
export async function fetchOrganisationData() {
  const [projectRows, taskRows, updateRows, profileRows, roleRows] = await Promise.all([
    db(
      supabase
        .from("projects")
        .select("id, name, client_name, category, priority, status, progress, deadline, is_archived, created_at")
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
    ),
    db(
      supabase
        .from("tasks")
        .select(
          "id, project_id, status, progress, assigned_admin_id, assigned_member_id, completed_at, created_at",
        ),
    ),
    db(
      supabase
        .from("progress_updates")
        .select(
          "id, project_id, author_id, work_title, module_name, progress_from, progress_to, status, github_url, live_url, screenshots, created_at",
        )
        .order("created_at", { ascending: false }),
    ),
    db(
      supabase
        .from("profiles")
        .select("id, full_name, email, job_title, department, is_active, last_seen_at"),
    ),
    db(supabase.from("user_roles").select("profile_id, role")),
  ]);

  const roleByProfile = new Map<string, PersonRow["role"]>(
    (roleRows ?? []).map((r) => [r.profile_id as string, r.role as PersonRow["role"]]),
  );

  const people: PersonRow[] = (profileRows ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    job_title: p.job_title,
    department: p.department,
    is_active: p.is_active,
    last_seen_at: p.last_seen_at,
    role: roleByProfile.get(p.id) ?? "member",
  }));

  const projects: ProjectRow[] = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    client_name: p.client_name,
    category: p.category,
    priority: p.priority,
    status: p.status,
    progress: p.progress,
    deadline: p.deadline,
  }));

  return {
    projects,
    tasks: (taskRows ?? []) as TaskRow[],
    updates: (updateRows ?? []) as UpdateRow[],
    people,
  };
}

export type OrganisationData = Awaited<ReturnType<typeof fetchOrganisationData>>;

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export function deriveMetrics(data: OrganisationData) {
  const { projects, tasks, updates, people } = data;
  const today = new Date();

  const delayedProjects = projects.filter(
    (p) => p.deadline && new Date(p.deadline) < today && p.status !== "completed",
  );

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter((t) => t.status !== "completed");

  const since = (n: number) => updates.filter((u) => new Date(u.created_at) >= daysAgo(n)).length;

  const statusDistribution = Object.entries(
    projects.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value }));

  const peopleById = new Map(people.map((p) => [p.id, p]));

  const contributorPerformance = people
    .filter((p) => p.role !== "super_admin")
    .map((person) => {
      const authored = updates.filter((u) => u.author_id === person.id);
      const owned = tasks.filter(
        (t) => t.assigned_admin_id === person.id || t.assigned_member_id === person.id,
      );
      const done = owned.filter((t) => t.status === "completed").length;
      return {
        id: person.id,
        name: person.full_name,
        role: person.role,
        updates: authored.length,
        tasks: owned.length,
        completed: done,
        avgProgress: owned.length
          ? Math.round(owned.reduce((s, t) => s + t.progress, 0) / owned.length)
          : 0,
      };
    })
    .sort((a, b) => b.updates - a.updates);

  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = daysAgo(13 - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const inWindow = (iso: string) => {
      const d = new Date(iso);
      return d >= day && d < next;
    };
    return {
      day: formatDate(day),
      updates: updates.filter((u) => inWindow(u.created_at)).length,
      tasksCompleted: completedTasks.filter((t) => t.completed_at && inWindow(t.completed_at))
        .length,
    };
  });

  const projectProgress = projects
    .slice()
    .sort((a, b) => b.progress - a.progress)
    .map((p) => ({ name: p.name, progress: p.progress }));

  const online = people.filter(
    (p) => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60 * 1000,
  ).length;

  return {
    totals: {
      projects: projects.length,
      active: projects.filter((p) =>
        ["in_progress", "planning", "under_review"].includes(p.status),
      ).length,
      completed: projects.filter((p) => p.status === "completed").length,
      delayed: delayedProjects.length,
      admins: people.filter((p) => p.role === "admin").length,
      members: people.filter((p) => p.role === "member").length,
      tasks: tasks.length,
      pendingTasks: pendingTasks.length,
      completedTasks: completedTasks.length,
      daily: since(1),
      weekly: since(7),
      monthly: since(30),
      online,
      avgProgress: projects.length
        ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
        : 0,
    },
    statusDistribution,
    contributorPerformance,
    trend,
    projectProgress,
    delayed: delayedProjects,
    recentUpdates: updates.slice(0, 8).map((u) => ({
      ...u,
      authorName: peopleById.get(u.author_id)?.full_name ?? "Unknown",
      authorRole: peopleById.get(u.author_id)?.role ?? "member",
      projectName: projects.find((p) => p.id === u.project_id)?.name ?? "Project",
    })),
  };
}
