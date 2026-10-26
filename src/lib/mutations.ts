import { db, supabase } from "@/lib/supabase";
import type { AppRole, Priority, Project, Task, TaskStatus } from "@/lib/workspace";

export type Actor = { profileId: string; name: string; role: AppRole };

function onlyDefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function required<T extends { id: string }>(row: T | null, label: string): T {
  if (!row) throw new Error(`${label} failed.`);
  return row;
}

export async function logActivity(input: {
  actorId: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db(
    supabase.from("activity_logs").insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      project_id: input.projectId ?? null,
      metadata: input.metadata ?? {},
    }),
  );
}

export async function notify(
  profileIds: (string | null | undefined)[],
  message: string,
  type = "info",
  entity?: { type: string; id: string },
) {
  const targets = [...new Set(profileIds.filter(Boolean) as string[])];
  if (!targets.length) return;
  await db(
    supabase.from("notifications").insert(
      targets.map((profile_id) => ({
        profile_id,
        message,
        type,
        entity_type: entity?.type ?? null,
        entity_id: entity?.id ?? null,
        read: false,
      })),
    ),
  );
}

/** Recomputes a project's progress + status from its tasks. */
export async function recalcProject(projectId: string) {
  await db(supabase.rpc("recalc_project", { target_project: projectId }));
}

export type TaskInput = {
  title: string;
  description?: string | null;
  project_id: string;
  assigned_member_id?: string | null;
  team_leader_id?: string | null;
  priority: Priority;
  status: TaskStatus;
  progress?: number;
  start_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  attachments?: string[];
};

export async function createTask(actor: Actor, input: TaskInput) {
  const task = await db(
    supabase
      .from("tasks")
      .insert({
        project_id: input.project_id,
        title: input.title,
        description: input.description ?? null,
        assigned_admin_id: null,
        assigned_member_id: input.assigned_member_id ?? null,
        team_leader_id: input.team_leader_id ?? null,
        created_by: actor.profileId,
        priority: input.priority,
        status: input.status,
        progress: input.progress ?? 0,
        notes: input.notes ?? null,
        attachments: input.attachments ?? [],
        start_date: input.start_date ?? null,
        due_date: input.due_date ?? null,
        completed_at: null,
      })
      .select("*")
      .single(),
  );

  const requested = input.status === "pending_approval";
  await logActivity({
    actorId: actor.profileId,
    action: requested ? `requested task "${task.title}"` : `created task "${task.title}"`,
    entityType: "task",
    entityId: task.id,
    projectId: task.project_id,
    metadata: { new_status: task.status, priority: task.priority },
  });

  if (requested) {
    await notify(
      [input.team_leader_id],
      `${actor.name} submitted a task request: ${task.title}`,
      "request",
      { type: "task", id: task.id },
    );
  } else {
    await notify([input.assigned_member_id], `New task assigned: ${task.title}`, "assignment", {
      type: "task",
      id: task.id,
    });
  }
  await recalcProject(task.project_id);
  return task as Task;
}

export async function updateTask(
  actor: Actor,
  task: Task,
  patch: Partial<TaskInput> & { status?: TaskStatus; progress?: number },
) {
  const next: Record<string, unknown> = onlyDefined({ ...patch });
  if (patch.status === "completed") {
    next.completed_at = new Date().toISOString();
    next.progress = 100;
  }

  const row = await db(
    supabase.from("tasks").update(next).eq("id", task.id).select("*").maybeSingle(),
  );
  if (!row) throw new Error("Task not found.");

  const statusChanged = Boolean(patch.status && patch.status !== task.status);
  const assigneeChanged = patch.assigned_member_id !== undefined && patch.assigned_member_id !== task.assigned_member_id;
  await logActivity({
    actorId: actor.profileId,
    action: assigneeChanged
      ? `reassigned task "${task.title}"`
      : statusChanged
      ? `changed task "${task.title}" to ${patch.status}`
      : `updated task "${task.title}"`,
    entityType: "task",
    entityId: task.id,
    projectId: task.project_id,
    metadata: {
      previous_status: task.status,
      new_status: patch.status ?? task.status,
      progress: patch.progress ?? task.progress,
      ...(assigneeChanged ? { previous_assignee: task.assigned_member_id, new_assignee: patch.assigned_member_id } : {}),
    },
  });

  if (statusChanged) {
    const audience = [task.assigned_member_id, task.team_leader_id, task.created_by].filter(
      (id) => id !== actor.profileId,
    );
    await notify(audience, `Task "${task.title}" is now ${patch.status}`, "status", {
      type: "task",
      id: task.id,
    });
  }
  await recalcProject(task.project_id);
}

export async function approveTask(actor: Actor, task: Task, assignTo?: string | null) {
  await updateTask(actor, task, {
    status: "assigned",
    assigned_member_id: assignTo ?? task.assigned_member_id ?? task.created_by,
  });
  await notify([task.created_by], `Your task request "${task.title}" was approved`, "approval", {
    type: "task",
    id: task.id,
  });
}

export async function rejectTask(actor: Actor, task: Task) {
  await updateTask(actor, task, { status: "rejected" });
  await notify([task.created_by], `Your task request "${task.title}" was rejected`, "approval", {
    type: "task",
    id: task.id,
  });
}

/**
 * Bulk admin actions — the "toolkit" that appears once one or more tasks
 * are checkbox-selected: approve every selected pending request at once,
 * or push a new due date onto every selected task at once.
 */
export async function bulkApproveTasks(actor: Actor, tasks: Task[]) {
  for (const task of tasks) {
    if (task.status === "pending_approval") {
      await approveTask(actor, task);
    }
  }
}

export async function bulkSetDueDate(actor: Actor, tasks: Task[], dueDate: string) {
  for (const task of tasks) {
    await updateTask(actor, task, { due_date: dueDate });
  }
}

/** Quick reassignment — hand a task to a different team member. */
export async function reassignTask(actor: Actor, task: Task, memberId: string) {
  await updateTask(actor, task, { assigned_member_id: memberId });
  await notify([memberId], `You were assigned: ${task.title}`, "assignment", {
    type: "task",
    id: task.id,
  });
}

export async function deleteTask(actor: Actor, task: Task) {
  await db(supabase.from("tasks").delete().eq("id", task.id));
  await logActivity({
    actorId: actor.profileId,
    action: `deleted task "${task.title}"`,
    entityType: "deleted",
    entityId: task.id,
    projectId: task.project_id,
    metadata: { previous_status: task.status },
  });
  await recalcProject(task.project_id);
}

export type WorkSubmission = {
  project_id: string;
  task_id?: string | null;
  work_title: string;
  work_description?: string | null;
  module_name?: string | null;
  progress_from: number;
  progress_to: number;
  status: TaskStatus;
  github_url?: string | null;
  live_url?: string | null;
  screenshots: string[];
  notes?: string | null;
};

/** Posts a progress update, syncs the linked task and notifies the team. */
export async function submitWork(actor: Actor, input: WorkSubmission, task?: Task | null) {
  const status = (["in_progress", "under_review", "completed", "blocked"] as const).includes(
    input.status as never,
  )
    ? input.status
    : "in_progress";

  await db(
    supabase.from("progress_updates").insert({
      project_id: input.project_id,
      task_id: input.task_id ?? null,
      author_id: actor.profileId,
      work_title: input.work_title,
      work_description: input.work_description ?? null,
      module_name: input.module_name ?? null,
      progress_from: input.progress_from,
      progress_to: input.progress_to,
      status,
      github_url: input.github_url || null,
      live_url: input.live_url || null,
      screenshots: input.screenshots,
      notes: input.notes ?? null,
    }),
  );

  if (task) {
    await updateTask(actor, task, {
      progress: input.progress_to,
      status: input.status,
    });
  }

  await logActivity({
    actorId: actor.profileId,
    action: `submitted work "${input.work_title}"`,
    entityType: "progress_update",
    entityId: input.task_id ?? null,
    projectId: input.project_id,
    metadata: {
      github_url: input.github_url ?? null,
      live_url: input.live_url ?? null,
      screenshots: input.screenshots.length,
      progress_to: input.progress_to,
    },
  });

  await notify(
    [task?.team_leader_id, task?.assigned_admin_id, task?.created_by].filter(
      (id) => id && id !== actor.profileId,
    ),
    `${actor.name} submitted work: ${input.work_title} (${input.progress_to}%)`,
    "update",
    { type: "project", id: input.project_id },
  );
}

export async function addComment(actor: Actor, taskId: string, _body: string) {
  await logActivity({
    actorId: actor.profileId,
    action: "commented on a task",
    entityType: "task",
    entityId: taskId,
  });
}

/* ---------- Projects ---------- */

export async function saveProject(
  actor: Actor,
  input: {
    id?: string;
    name: string;
    description?: string | null;
    client_name?: string | null;
    category?: string | null;
    team_id?: string | null;
    priority: Priority;
    start_date?: string | null;
    deadline?: string | null;
  },
) {
  if (input.id) {
    const { id, ...fields } = input;
    await db(supabase.from("projects").update(fields).eq("id", id).select("id").single());
    await logActivity({
      actorId: actor.profileId,
      action: `updated project "${input.name}"`,
      entityType: "project",
      entityId: id,
      projectId: id,
    });
    return id;
  }

  const created = required(
    await db(
    supabase
      .from("projects")
      .insert({
        name: input.name,
        description: input.description ?? null,
        client_name: input.client_name ?? null,
        category: input.category ?? null,
        team_id: input.team_id ?? null,
        priority: input.priority,
        status: "not_started",
        progress: 0,
        start_date: input.start_date ?? null,
        end_date: null,
        deadline: input.deadline ?? null,
        is_archived: false,
      })
      .select("id")
      .single(),
  ),
    "Create project",
  );
  await logActivity({
    actorId: actor.profileId,
    action: `created project "${input.name}"`,
    entityType: "project",
    entityId: created.id,
    projectId: created.id,
  });
  return created.id as string;
}

export async function deleteProject(actor: Actor, id: string, name: string) {
  await db(supabase.from("projects").delete().eq("id", id));
  await logActivity({
    actorId: actor.profileId,
    action: `deleted project "${name}"`,
    entityType: "deleted",
    entityId: id,
  });
}

export async function addProjectNote(actor: Actor, projectId: string, body: string) {
  if (actor.role !== "admin" && actor.role !== "super_admin") throw new Error("Only admins can post project notes.");
  await db(supabase.from("project_notes").insert({ project_id: projectId, author_id: actor.profileId, body: body.trim() }));
  await logActivity({ actorId: actor.profileId, action: "added a project note", entityType: "project_note", projectId });
}

export async function addProjectMember(actor: Actor, projectId: string, profileId: string) {
  if (actor.role !== "super_admin") throw new Error("Only super admins can manage project members.");
  await db(supabase.from("project_members").insert({ project_id: projectId, profile_id: profileId, assigned_by: actor.profileId }));
  await logActivity({ actorId: actor.profileId, action: "added a project member", entityType: "project_member", projectId, metadata: { profile_id: profileId } });
}

export async function removeProjectMember(actor: Actor, projectId: string, profileId: string) {
  if (actor.role !== "super_admin") throw new Error("Only super admins can manage project members.");
  await db(supabase.from("project_members").delete().eq("project_id", projectId).eq("profile_id", profileId));
  await logActivity({ actorId: actor.profileId, action: "removed a project member", entityType: "project_member", projectId, metadata: { profile_id: profileId } });
}

type ProjectChangeFields = Partial<Pick<Project, "name" | "description" | "client_name" | "category" | "priority" | "start_date" | "deadline">>;

export async function submitProjectChangeRequest(actor: Actor, input: { projectId: string; summary: string; reason: string; changes: ProjectChangeFields }) {
  if (actor.role !== "admin" && actor.role !== "super_admin") throw new Error("Only admins can submit change requests.");
  if (!Object.keys(input.changes).length) throw new Error("Add at least one proposed project change.");
  const { data, error } = await supabase.from("project_change_requests").insert({
    project_id: input.projectId,
    requester_id: actor.profileId,
    summary: input.summary.trim(),
    reason: input.reason.trim(),
    proposed_changes: input.changes,
  }).select("id").single();
  if (error) throw error;
  await logActivity({ actorId: actor.profileId, action: `requested project change "${input.summary.trim()}"`, entityType: "project_change_request", entityId: data.id, projectId: input.projectId });
}

export async function reviewProjectChangeRequest(actor: Actor, requestId: string, decision: "approved" | "rejected", feedback: string) {
  if (actor.role !== "super_admin") throw new Error("Only super admins can review project changes.");
  await db(supabase.rpc("review_project_change_request", {
    request_id: requestId,
    decision,
    feedback: feedback.trim() || null,
  }));
}

/* ---------- People ---------- */

export async function savePerson(
  actor: Actor,
  input: {
    id?: string;
    full_name: string;
    email: string;
    job_title?: string | null;
    department?: string | null;
    team_id?: string | null;
    is_active?: boolean;
  },
  role: AppRole,
) {
  let profileId = input.id;

  if (profileId) {
    const { id: _id, ...fields } = input;
    await db(supabase.from("profiles").update(fields).eq("id", profileId).select("id").single());
  } else {
    const created = required(
      await db(
        supabase
          .from("profiles")
          .insert({
            user_id: null,
            full_name: input.full_name,
            email: input.email,
            job_title: input.job_title ?? null,
            department: input.department ?? null,
            team_id: input.team_id ?? null,
            is_active: input.is_active ?? true,
          })
          .select("id")
          .single(),
      ),
      "Add person",
    );
    profileId = created.id;
  }

  await db(
    supabase.from("user_roles").upsert({ profile_id: profileId, role }, { onConflict: "profile_id" }),
  );

  await logActivity({
    actorId: actor.profileId,
    action: `${input.id ? "updated" : "added"} user "${input.full_name}" (${role})`,
    entityType: "user",
    entityId: profileId,
  });
  return profileId;
}

export async function deletePerson(actor: Actor, id: string, name: string) {
  await db(supabase.rpc("delete_person", { target_id: id }));
  await logActivity({
    actorId: actor.profileId,
    action: `deleted user "${name}"`,
    entityType: "deleted",
    entityId: id,
  });
}

export async function setPersonActive(actor: Actor, id: string, name: string, active: boolean) {
  await db(supabase.from("profiles").update({ is_active: active }).eq("id", id).select("id").single());
  await logActivity({
    actorId: actor.profileId,
    action: `${active ? "activated" : "deactivated"} user "${name}"`,
    entityType: "user",
    entityId: id,
  });
}

export async function setPersonRole(actor: Actor, id: string, name: string, role: AppRole) {
  await db(
    supabase.from("user_roles").upsert({ profile_id: id, role }, { onConflict: "profile_id" }),
  );
  await logActivity({
    actorId: actor.profileId,
    action: `changed "${name}"'s role to ${role}`,
    entityType: "user",
    entityId: id,
  });
}

export async function setPersonTeam(
  actor: Actor,
  id: string,
  name: string,
  teamId: string | null,
) {
  await db(supabase.from("profiles").update({ team_id: teamId }).eq("id", id).select("id").single());
  await logActivity({
    actorId: actor.profileId,
    action: teamId ? `assigned "${name}" to a team` : `removed "${name}" from their team`,
    entityType: "user",
    entityId: id,
  });
}

/* ---------- Teams ---------- */

export async function saveTeam(
  actor: Actor,
  input: { id?: string; name: string; description?: string | null; leader_id?: string | null },
) {
  let teamId = input.id;
  if (teamId) {
    const { id, ...fields } = input;
    await db(supabase.from("teams").update(fields).eq("id", id).select("id").single());
  } else {
    const created = required(
      await db(
        supabase
          .from("teams")
          .insert({
            name: input.name,
            description: input.description ?? null,
            leader_id: input.leader_id ?? null,
          })
          .select("id")
          .single(),
      ),
      "Create team",
    );
    teamId = created.id;
  }
  await logActivity({
    actorId: actor.profileId,
    action: `${input.id ? "updated" : "created"} team "${input.name}"`,
    entityType: "team",
    entityId: teamId,
  });
  return teamId;
}

export async function deleteTeam(actor: Actor, id: string, name: string) {
  await db(supabase.from("teams").delete().eq("id", id));
  await logActivity({
    actorId: actor.profileId,
    action: `deleted team "${name}"`,
    entityType: "deleted",
    entityId: id,
  });
}
