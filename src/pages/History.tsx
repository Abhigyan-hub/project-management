import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, History as HistoryIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate, STAFF_ROLES } from "@/components/auth-gate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv, type Column } from "@/lib/reports";
import { fetchWorkspace, formatDateTime, nameOf, type ActivityLog } from "@/lib/workspace";
import type { Actor } from "@/lib/mutations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const ALL = "__all__";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function HistoryPage() {
  useDocumentTitle(
    "Activity history — Northlight",
    "A full audit trail of every task, project and user change across the organisation.",
  );

  return (
    <AuthGate allow={STAFF_ROLES} portal="admin">
      {(user) => <HistoryContent actor={user} />}
    </AuthGate>
  );
}

function HistoryContent({ actor }: { actor: Actor }) {
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState(ALL);
  const [actorId, setActorId] = useState(ALL);

  const logs = data?.logs ?? [];
  const projects = data?.projects ?? [];
  const people = data?.people ?? [];

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (search && !l.action.toLowerCase().includes(search.toLowerCase())) return false;
        if (projectId !== ALL && l.project_id !== projectId) return false;
        if (actorId !== ALL && l.actor_id !== actorId) return false;
        return true;
      }),
    [logs, search, projectId, actorId],
  );

  const columns: Column<ActivityLog>[] = [
    { header: "When", value: (l) => formatDateTime(l.created_at) },
    { header: "Who", value: (l) => nameOf(people, l.actor_id) },
    { header: "Action", value: (l) => l.action },
    { header: "Project", value: (l) => projects.find((p) => p.id === l.project_id)?.name ?? "—" },
  ];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Activity history"
      subtitle="Full audit trail across every project"
      actions={
        <Button variant="outline" size="sm" onClick={() => downloadCsv("activity-history", columns, filtered)}>
          <Download className="size-4" /> CSV
        </Button>
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-4">
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            <Input
              placeholder="Search actions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-56"
            />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actorId} onValueChange={setActorId}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="panel divide-y divide-border/60 p-1">
            {filtered.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                <Avatar className="mt-0.5 size-7 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                    {initials(nameOf(people, log.actor_id))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{nameOf(people, log.actor_id)}</span>{" "}
                    <span className="text-muted-foreground">{log.action}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {projects.find((p) => p.id === log.project_id)?.name ?? "No project"} ·{" "}
                    {formatDateTime(log.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
                <HistoryIcon className="size-6" />
                <p className="text-sm">No activity matches these filters.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
