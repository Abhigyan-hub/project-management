import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Github, ExternalLink, ImageIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate, MEMBER_ROLES } from "@/components/auth-gate";
import { NotificationBell } from "@/components/notification-bell";
import { SubmitWorkDialog } from "@/components/submit-work-dialog";
import { CompletionBar, PriorityBadge, TaskTicks } from "@/components/task-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { effectiveStatus, fetchMyUpdates, fetchWorkspace, formatDate, formatDateTime } from "@/lib/workspace";
import type { Actor } from "@/lib/mutations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function MyWorkPage() {
  useDocumentTitle(
    "My work — Northlight",
    "View tasks assigned to you and submit progress updates, links and screenshots.",
  );

  return (
    <AuthGate allow={MEMBER_ROLES} portal="member">
      {(user) => <MyWorkContent actor={user} />}
    </AuthGate>
  );
}

function MyWorkContent({ actor }: { actor: Actor }) {
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: myUpdates = [] } = useQuery({
    queryKey: ["my-updates", actor.profileId],
    queryFn: () => fetchMyUpdates(actor.profileId),
  });

  const myTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.assigned_member_id === actor.profileId),
    [data, actor.profileId],
  );

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="My work"
      subtitle="Your assigned tasks and submitted updates"
      actions={
        <div className="flex items-center gap-2">
          <NotificationBell profileId={actor.profileId} />
          <SubmitWorkDialog actor={actor} tasks={myTasks} projects={data?.projects ?? []} />
        </div>
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Assigned to you ({myTasks.length})
            </h2>
            {myTasks.length === 0 && (
              <div className="panel p-8 text-center text-sm text-muted-foreground">
                Nothing assigned to you yet.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {myTasks.map((task) => {
                const project = data.projects.find((p) => p.id === task.project_id);
                return (
                  <div key={task.id} className="panel space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project?.name ?? "—"}
                        </p>
                      </div>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <TaskTicks status={effectiveStatus(task)} />
                    <CompletionBar value={task.progress} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Due {formatDate(task.due_date)}</span>
                      <SubmitWorkDialog
                        actor={actor}
                        tasks={[task]}
                        projects={data.projects}
                        trigger={
                          <button className="font-medium text-primary underline-offset-4 hover:underline">
                            Submit update
                          </button>
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your submitted work ({myUpdates.length})
            </h2>
            {myUpdates.length === 0 && (
              <div className="panel p-8 text-center text-sm text-muted-foreground">
                You haven&apos;t submitted any work yet. Use &quot;Upload work&quot; above to log
                progress on a task.
              </div>
            )}
            <div className="space-y-3">
              {myUpdates.map((u) => (
                <div key={u.id} className="panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{u.work_title}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(u.created_at)}
                    </span>
                  </div>
                  {u.work_description && (
                    <p className="mt-1 text-sm text-muted-foreground">{u.work_description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      Progress {u.progress_from}% → {u.progress_to}%
                    </span>
                    {u.github_url && (
                      <a
                        href={u.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <Github className="size-3.5" /> Repo
                      </a>
                    )}
                    {u.live_url && (
                      <a
                        href={u.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> Live
                      </a>
                    )}
                    {u.screenshots.length > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <ImageIcon className="size-3.5" /> {u.screenshots.length} screenshot
                        {u.screenshots.length === 1 ? "" : "s"}
                      </span>
                    )}
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
