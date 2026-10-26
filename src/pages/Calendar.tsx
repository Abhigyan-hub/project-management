import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { AuthGate, STAFF_ROLES } from "@/components/auth-gate";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge, StatusBadge } from "@/components/task-ui";
import { effectiveStatus, fetchWorkspace, formatDate, nameOf } from "@/lib/workspace";
import type { Actor } from "@/lib/mutations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarPage() {
  useDocumentTitle(
    "Calendar — Northlight",
    "Task due dates and project deadlines across the organisation, laid out by day.",
  );

  return (
    <AuthGate allow={STAFF_ROLES} portal="admin">
      {(user) => <CalendarContent actor={user} />}
    </AuthGate>
  );
}

function CalendarContent({ actor }: { actor: Actor }) {
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [selected, setSelected] = useState<Date>(new Date());

  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];
  const people = data?.people ?? [];

  const taskDueDates = useMemo(
    () => tasks.filter((t) => t.due_date).map((t) => new Date(t.due_date as string)),
    [tasks],
  );
  const deadlineDates = useMemo(
    () => projects.filter((p) => p.deadline).map((p) => new Date(p.deadline as string)),
    [projects],
  );

  const dayTasks = tasks.filter((t) => t.due_date && sameDay(new Date(t.due_date), selected));
  const dayDeadlines = projects.filter((p) => p.deadline && sameDay(new Date(p.deadline), selected));

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Calendar"
      subtitle="Task due dates and project deadlines"
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <div className="panel w-fit p-3">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => d && setSelected(d)}
              modifiers={{ due: taskDueDates, deadline: deadlineDates }}
              modifiersClassNames={{
                due: "relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
                deadline: "relative before:absolute before:top-1 before:left-1/2 before:size-1 before:-translate-x-1/2 before:rounded-full before:bg-destructive",
              }}
            />
            <div className="mt-2 flex items-center gap-4 border-t border-border px-2 pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-primary" /> Task due
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-destructive" /> Project deadline
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {`${selected.toLocaleDateString("en-GB", { weekday: "long" })}, ${formatDate(selected)}`}
              </h2>

              {dayDeadlines.length === 0 && dayTasks.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nothing due on this day.
                </p>
              )}

              {dayDeadlines.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                    Project deadlines
                  </p>
                  {dayDeadlines.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.progress}% complete
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {dayTasks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">
                    Tasks due
                  </p>
                  {dayTasks.map((t) => (
                    <div key={t.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{nameOf(people, t.assigned_member_id)}</span>
                        <StatusBadge status={effectiveStatus(t)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
