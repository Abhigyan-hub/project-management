import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlarmClock,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  ShieldCheck,
  Users,
  Activity,
  Gauge,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UpdateCard } from "@/components/dashboard/update-card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveMetrics, fetchOrganisationData, STATUS_LABELS } from "@/lib/analytics";
import { formatDate } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

export default function DashboardPage() {
  useDocumentTitle(
    "Delivery analytics — Northlight",
    "Organisation-wide project analytics: progress, delayed deliveries, admin and team performance, and daily activity trends.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => (
        <AppShell
          userName={user.name}
          role={user.role}
          title="Organisation overview"
          subtitle="Live delivery health across every project, admin and team member"
        >
          <DashboardContent />
        </AppShell>
      )}
    </AuthGate>
  );
}

function DashboardContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["organisation-data"],
    queryFn: fetchOrganisationData,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const m = deriveMetrics(data);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FolderKanban}
          label="Total projects"
          value={m.totals.projects}
          hint={`${m.totals.active} active · ${m.totals.completed} completed`}
        />
        <KpiCard
          icon={AlarmClock}
          label="Delayed projects"
          value={m.totals.delayed}
          tone="destructive"
          hint="Past deadline and not completed"
        />
        <KpiCard
          icon={Gauge}
          label="Average progress"
          value={`${m.totals.avgProgress}%`}
          tone="primary"
          hint="Across all live projects"
        />
        <KpiCard
          icon={Activity}
          label="Updates today"
          value={m.totals.daily}
          hint={`${m.totals.weekly} this week · ${m.totals.monthly} this month`}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Admins"
          value={m.totals.admins}
          hint={`${m.totals.online} people active in the last 15 min`}
        />
        <KpiCard icon={Users} label="Team members" value={m.totals.members} hint="Across all departments" />
        <KpiCard
          icon={ListChecks}
          label="Pending tasks"
          value={m.totals.pendingTasks}
          hint={`${m.totals.tasks} tasks total`}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Completed tasks"
          value={m.totals.completedTasks}
          tone="success"
          hint="All-time completion"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Task completion trend · last 14 days
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.trend}>
                <defs>
                  <linearGradient id="updatesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tasksFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="updates"
                  name="Progress updates"
                  stroke="var(--color-chart-1)"
                  fill="url(#updatesFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="tasksCompleted"
                  name="Tasks completed"
                  stroke="var(--color-chart-3)"
                  fill="url(#tasksFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Project status distribution
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={m.statusDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {m.statusDistribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Overall project progress
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.projectProgress} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Progress"]} />
                <Bar dataKey="progress" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Admin &amp; team performance
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.contributorPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="updates" name="Updates" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Tasks completed" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Activity timeline
          </h2>
          {m.recentUpdates.map((item) => (
            <UpdateCard key={item.id} item={item} />
          ))}
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Deadlines at risk
            </h2>
            <ul className="mt-4 space-y-4">
              {m.delayed.length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing overdue. Nice.</li>
              )}
              {m.delayed.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <Badge variant="outline" className="border-destructive/50 text-destructive">
                      {p.deadline ? formatDate(p.deadline) : "No date"}
                    </Badge>
                  </div>
                  <Progress value={p.progress} className="mt-2 h-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.client_name ?? "Internal"} · {STATUS_LABELS[p.status]} · {p.progress}%
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top contributors
            </h2>
            <ul className="mt-4 space-y-3">
              {m.contributorPerformance.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.updates} updates · {c.avgProgress}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
