import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { AuthGate, LEADER_ROLES } from "@/components/auth-gate";
import { NotificationBell } from "@/components/notification-bell";
import { CompletionBar, PriorityBadge, TaskTicks } from "@/components/task-ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { approveTask, rejectTask, type Actor } from "@/lib/mutations";
import { effectiveStatus, fetchWorkspace, formatDate, nameOf, taskStats } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamPage() {
  useDocumentTitle(
    "My team — Northlight",
    "Your team's members, tasks and pending approval requests in one place.",
  );

  return (
    <AuthGate allow={LEADER_ROLES} portal="admin">
      {(user) => <TeamContent actor={user} />}
    </AuthGate>
  );
}

function TeamContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const myTeam = useMemo(
    () => data?.teams.find((t) => t.leader_id === actor.profileId) ?? null,
    [data, actor.profileId],
  );
  const members = useMemo(
    () => (data?.people ?? []).filter((p) => myTeam && p.team_id === myTeam.id),
    [data, myTeam],
  );
  const teamTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.team_leader_id === actor.profileId),
    [data, actor.profileId],
  );
  const pendingRequests = teamTasks.filter((t) => t.status === "pending_approval");
  const stats = taskStats(teamTasks);
  const people = data?.people ?? [];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="My team"
      subtitle={myTeam ? myTeam.name : "Tasks and members you lead"}
      actions={<NotificationBell profileId={actor.profileId} />}
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Team members", value: members.length },
              { label: "Team tasks", value: stats.total },
              { label: "Completed", value: stats.completed },
              { label: "Awaiting approval", value: stats.pendingApproval },
            ].map((s) => (
              <div key={s.label} className="panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
              </div>
            ))}
          </section>

          {pendingRequests.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pending your approval ({pendingRequests.length})
              </h2>
              <div className="space-y-2">
                {pendingRequests.map((task) => (
                  <div
                    key={task.id}
                    className="panel flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Requested by {nameOf(people, task.created_by)}
                        {task.notes ? ` · "${task.notes}"` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={task.priority} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await approveTask(actor, task);
                          await refresh();
                          toast.success("Task approved");
                        }}
                      >
                        <Check className="size-4 text-emerald-500" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await rejectTask(actor, task);
                          await refresh();
                          toast.success("Task rejected");
                        }}
                      >
                        <X className="size-4 text-red-500" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Team members
            </h2>
            {members.length === 0 && (
              <div className="panel p-8 text-center text-sm text-muted-foreground">
                No one is assigned to your team yet — ask an admin to add members from People.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {members.map((m) => {
                const memberTasks = teamTasks.filter((t) => t.assigned_member_id === m.id);
                return (
                  <div key={m.id} className="panel flex items-center gap-3 p-4">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                        {initials(m.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.job_title ?? "Team member"} · {memberTasks.length} task
                        {memberTasks.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              All team tasks
            </h2>
            {teamTasks.length === 0 && (
              <div className="panel p-8 text-center text-sm text-muted-foreground">
                No tasks assigned to your team yet.
              </div>
            )}
            <div className="space-y-2">
              {teamTasks
                .filter((t) => t.status !== "pending_approval")
                .map((task) => (
                  <div key={task.id} className="panel flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {nameOf(people, task.assigned_member_id)} · Due {formatDate(task.due_date)}
                      </p>
                    </div>
                    <PriorityBadge priority={task.priority} />
                    <TaskTicks status={effectiveStatus(task)} />
                    <div className="w-32">
                      <CompletionBar value={task.progress} showLabel={false} />
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
