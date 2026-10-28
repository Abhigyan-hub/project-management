import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveMetrics, fetchOrganisationData, STATUS_LABELS } from "@/lib/analytics";
import type { PersonRow, ProjectRow } from "@/lib/analytics";
import { downloadCsv, downloadPdf, type Column } from "@/lib/reports";
import {
  fetchWorkspace,
  formatDate,
  nameOf,
  STATUS_LABEL,
  type ActivityLog,
  type Task,
} from "@/lib/workspace";
import type { Actor } from "@/lib/mutations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function ReportsPage() {
  useDocumentTitle(
    "Reports — Northlight",
    "Export projects, tasks, people and activity history as CSV or a printable PDF.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => <ReportsContent actor={user} />}
    </AuthGate>
  );
}

function ReportsContent({ actor }: { actor: Actor }) {
  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ["organisation-data"],
    queryFn: fetchOrganisationData,
  });
  const { data: ws, isLoading: wsLoading } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const isLoading = orgLoading || wsLoading;
  const metrics = org ? deriveMetrics(org) : null;

  const projectColumns: Column<ProjectRow>[] = [
    { header: "Project", value: (p) => p.name },
    { header: "Client", value: (p) => p.client_name ?? "Internal" },
    { header: "Category", value: (p) => p.category ?? "—" },
    { header: "Priority", value: (p) => p.priority },
    { header: "Status", value: (p) => STATUS_LABEL[p.status] ?? p.status },
    { header: "Progress", value: (p) => `${p.progress}%` },
    { header: "Deadline", value: (p) => formatDate(p.deadline) },
  ];

  const taskColumns: Column<Task>[] = ws
    ? [
        { header: "Task", value: (t) => t.title },
        {
          header: "Project",
          value: (t) => ws.projects.find((p) => p.id === t.project_id)?.name ?? "—",
        },
        { header: "Assignee", value: (t) => nameOf(ws.people, t.assigned_member_id) },
        { header: "Priority", value: (t) => t.priority },
        { header: "Status", value: (t) => STATUS_LABEL[t.status] ?? t.status },
        { header: "Progress", value: (t) => `${t.progress}%` },
        { header: "Due", value: (t) => formatDate(t.due_date) },
      ]
    : [];

  const peopleColumns: Column<PersonRow>[] = [
    { header: "Name", value: (p) => p.full_name },
    { header: "Email", value: (p) => p.email },
    { header: "Role", value: (p) => p.role },
    { header: "Job title", value: (p) => p.job_title ?? "—" },
    { header: "Department", value: (p) => p.department ?? "—" },
    { header: "Status", value: (p) => (p.is_active ? "Active" : "Inactive") },
  ];

  const activityColumns: Column<ActivityLog>[] = ws
    ? [
        { header: "When", value: (l) => formatDate(l.created_at) },
        { header: "Who", value: (l) => nameOf(ws.people, l.actor_id) },
        { header: "Action", value: (l) => l.action },
        {
          header: "Project",
          value: (l) => ws.projects.find((p) => p.id === l.project_id)?.name ?? "—",
        },
      ]
    : [];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Reports"
      subtitle="Organisation-wide exports"
    >
      {isLoading || !org || !ws || !metrics ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Projects", value: metrics.totals.projects },
              { label: "Tasks", value: metrics.totals.tasks },
              { label: "People", value: org.people.length },
              { label: "Avg. progress", value: `${metrics.totals.avgProgress}%` },
            ].map((s) => (
              <div key={s.label} className="panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
              </div>
            ))}
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Project status breakdown
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.statusDistribution.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <ReportCard
              icon={FileText}
              title="Projects"
              description={`${org.projects.length} projects with client, priority, status, progress and deadline.`}
              onCsv={() => downloadCsv("northlight-projects", projectColumns, org.projects)}
              onPdf={() => downloadPdf("Projects report", projectColumns, org.projects)}
            />
            <ReportCard
              icon={FileText}
              title="Tasks"
              description={`${ws.tasks.length} tasks with assignee, priority, status and due date.`}
              onCsv={() => downloadCsv("northlight-tasks", taskColumns, ws.tasks)}
              onPdf={() => downloadPdf("Tasks report", taskColumns, ws.tasks)}
            />
            <ReportCard
              icon={FileSpreadsheet}
              title="People"
              description={`${org.people.length} accounts with role, department and status.`}
              onCsv={() => downloadCsv("northlight-people", peopleColumns, org.people)}
              onPdf={() => downloadPdf("People report", peopleColumns, org.people)}
            />
            <ReportCard
              icon={FileSpreadsheet}
              title="Activity history"
              description={`${ws.logs.length} logged actions across every project.`}
              onCsv={() => downloadCsv("northlight-activity", activityColumns, ws.logs)}
              onPdf={() => downloadPdf("Activity history report", activityColumns, ws.logs)}
            />
          </section>
        </div>
      )}
    </AppShell>
  );
}

function ReportCard({
  icon: Icon,
  title,
  description,
  onCsv,
  onPdf,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  onCsv: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-auto flex gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onCsv}>
          <Download className="size-4" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={onPdf}>
          <Download className="size-4" /> PDF
        </Button>
      </div>
    </div>
  );
}
