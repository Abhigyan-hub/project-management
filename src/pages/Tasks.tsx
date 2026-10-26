import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckSquare,
  Download,
  Pencil,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { AuthGate, STAFF_ROLES } from "@/components/auth-gate";
import { ConfirmDelete } from "@/components/confirm-delete";
import { NotificationBell } from "@/components/notification-bell";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { CompletionBar, PriorityBadge, TaskTicks } from "@/components/task-ui";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveTask,
  bulkApproveTasks,
  bulkSetDueDate,
  deleteTask,
  reassignTask,
  rejectTask,
  type Actor,
} from "@/lib/mutations";
import { downloadCsv, downloadPdf } from "@/lib/reports";
import {
  effectiveStatus,
  fetchWorkspace,
  formatDate,
  nameOf,
  STATUS_LABEL,
  TASK_STATUSES,
  taskStats,
  type Task,
} from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const ALL = "__all__";

export default function TasksPage() {
  useDocumentTitle(
    "Tasks — Northlight",
    "Assign, approve, track and export every task across projects, teams and members.",
  );

  return (
    <AuthGate allow={STAFF_ROLES} portal="admin">
      {(user) => <TasksContent actor={user} />}
    </AuthGate>
  );
}

function TasksContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [projectId, setProjectId] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState<Date | undefined>();

  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const tasks = data?.tasks ?? [];
  const people = data?.people ?? [];
  const projects = data?.projects ?? [];

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (status !== ALL && effectiveStatus(t) !== status) return false;
        if (projectId !== ALL && t.project_id !== projectId) return false;
        if (assignee !== ALL && t.assigned_member_id !== assignee) return false;
        return true;
      }),
    [tasks, search, status, projectId, assignee],
  );

  const stats = taskStats(filtered);
  const selectedTasks = filtered.filter((t) => selected.has(t.id));
  const selectedPendingCount = selectedTasks.filter((t) => t.status === "pending_approval").length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((t) => t.id)) : new Set());
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkDate(undefined);
  }

  const columns = [
    { header: "Task", value: (t: Task) => t.title },
    {
      header: "Project",
      value: (t: Task) => projects.find((p) => p.id === t.project_id)?.name ?? "—",
    },
    { header: "Assignee", value: (t: Task) => nameOf(people, t.assigned_member_id) },
    { header: "Team leader", value: (t: Task) => nameOf(people, t.team_leader_id) },
    { header: "Priority", value: (t: Task) => t.priority },
    { header: "Status", value: (t: Task) => STATUS_LABEL[effectiveStatus(t)] ?? t.status },
    { header: "Progress", value: (t: Task) => `${t.progress}%` },
    { header: "Due", value: (t: Task) => formatDate(t.due_date) },
  ];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Tasks"
      subtitle="Assign work, approve requests and track delivery"
      actions={
        <div className="flex items-center gap-2">
          <NotificationBell profileId={actor.profileId} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("tasks-report", columns, filtered)}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPdf("Task report", columns, filtered)}
          >
            <Download className="size-4" /> PDF
          </Button>
          <TaskFormDialog
            actor={actor}
            projects={projects}
            people={people}
            onSaved={refresh}
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> Assign task
              </Button>
            }
          />
        </div>
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total tasks", value: stats.total },
              { label: "Completed", value: stats.completed },
              { label: "Overdue", value: stats.overdue },
              { label: "Awaiting approval", value: stats.pendingApproval },
            ].map((s) => (
              <div key={s.label} className="panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="panel flex flex-wrap items-center gap-2 p-3">
            <Input
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-56"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All assignees</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk-action toolkit — appears once one or more tasks are checked */}
          {selected.size > 0 && (
            <div className="panel flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {selected.size} task{selected.size === 1 ? "" : "s"} selected
              </span>

              <Button
                size="sm"
                variant="outline"
                disabled={selectedPendingCount === 0}
                onClick={async () => {
                  await bulkApproveTasks(actor, selectedTasks);
                  await refresh();
                  toast.success(`Approved ${selectedPendingCount} task${selectedPendingCount === 1 ? "" : "s"}`);
                  clearSelection();
                }}
              >
                <Check className="size-4 text-emerald-500" /> Admin confirm
                {selectedPendingCount > 0 ? ` (${selectedPendingCount})` : ""}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    Set due date
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkDate}
                    onSelect={async (date) => {
                      if (!date) return;
                      setBulkDate(date);
                      await bulkSetDueDate(actor, selectedTasks, date.toISOString());
                      await refresh();
                      toast.success(`Due date set on ${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}`);
                      clearSelection();
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="size-4" /> Clear
              </Button>
            </div>
          )}

          <div className="panel overflow-x-auto p-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9">
                    <button
                      type="button"
                      aria-label="Select all"
                      onClick={() => toggleAll(!allFilteredSelected)}
                      className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="size-4 text-primary" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => (
                  <TableRow key={task.id} className={selected.has(task.id) ? "bg-primary/5" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(task.id)}
                        onCheckedChange={(checked) => toggleOne(task.id, checked === true)}
                        aria-label={`Select ${task.title}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Leader: {nameOf(people, task.team_leader_id)}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {projects.find((p) => p.id === task.project_id)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={task.assigned_member_id ?? ""}
                        onValueChange={async (memberId) => {
                          await reassignTask(actor, task, memberId);
                          await refresh();
                          toast.success(`Reassigned to ${nameOf(people, memberId)}`);
                        }}
                      >
                        <SelectTrigger className="h-8 w-40 text-sm">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          {people
                            .filter((p) => p.role === "member" || p.id === task.assigned_member_id)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.full_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={task.priority} />
                    </TableCell>
                    <TableCell>
                      <TaskTicks status={effectiveStatus(task)} />
                    </TableCell>
                    <TableCell>
                      <CompletionBar value={task.progress} showLabel={false} />
                      <span className="text-xs text-muted-foreground">{task.progress}%</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(task.due_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {task.status === "pending_approval" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Approve"
                              onClick={async () => {
                                await approveTask(actor, task);
                                await refresh();
                                toast.success("Task approved");
                              }}
                            >
                              <Check className="size-4 text-emerald-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reject"
                              onClick={async () => {
                                await rejectTask(actor, task);
                                await refresh();
                                toast.success("Task rejected");
                              }}
                            >
                              <X className="size-4 text-red-500" />
                            </Button>
                          </>
                        )}
                        <TaskFormDialog
                          actor={actor}
                          projects={projects}
                          people={people}
                          task={task}
                          onSaved={refresh}
                          trigger={
                            <Button size="icon" variant="ghost" title="Edit">
                              <Pencil className="size-4" />
                            </Button>
                          }
                        />
                        <ConfirmDelete
                          title="Delete task"
                          description={`"${task.title}" will be removed for everyone.`}
                          onConfirm={async () => {
                            await deleteTask(actor, task);
                            await refresh();
                            toast.success("Task deleted");
                          }}
                          trigger={
                            <Button size="icon" variant="ghost" title="Delete">
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No tasks match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
