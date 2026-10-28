import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask, updateTask, type Actor } from "@/lib/mutations";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  type Person,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
} from "@/lib/workspace";

const NONE = "__none__";

export function TaskFormDialog({
  actor,
  projects,
  people,
  task,
  trigger,
  mode = "manage",
  onSaved,
}: {
  actor: Actor;
  projects: Project[];
  people: Person[];
  task?: Task;
  trigger: ReactNode;
  /** "manage" = admin/leader assignment form, "request" = user task request. */
  mode?: "manage" | "request";
  onSaved: () => void;
}) {
  const leaders = people.filter((p) => p.role === "team_leader");
  const assignees = people.filter((p) => p.role === "member" || p.role === "team_leader");

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? projects[0]?.id ?? "");
  const [assignee, setAssignee] = useState(task?.assigned_member_id ?? NONE);
  const [leader, setLeader] = useState(task?.team_leader_id ?? NONE);
  const [startDate, setStartDate] = useState(task?.start_date ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(
    task?.status ?? (mode === "request" ? "pending_approval" : "assigned"),
  );
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [attachments, setAttachments] = useState((task?.attachments ?? []).join(", "));
  const [notes, setNotes] = useState(task?.notes ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }
    if (!projectId) {
      toast.error("Pick a project.");
      return;
    }
    const numericProgress = Math.min(100, Math.max(0, Number(progress) || 0));

    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId,
      assigned_member_id: assignee === NONE ? null : assignee,
      team_leader_id: leader === NONE ? null : leader,
      priority,
      status,
      progress: numericProgress,
      start_date: startDate || null,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      attachments: attachments
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };

    try {
      if (task) await updateTask(actor, task, payload);
      else await createTask(actor, payload);
      toast.success(task ? "Task updated." : mode === "request" ? "Request submitted." : "Task assigned.");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {task ? "Edit task" : mode === "request" ? "Request a task" : "Assign a task"}
          </DialogTitle>
          <DialogDescription>
            {mode === "request"
              ? "Your request goes to your team leader for approval before it becomes an assigned task."
              : "Assign work to a team member, set the priority and track progress."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-title">Task title</Label>
            <Input
              id="task-title"
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Develop login API"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "manage" && (
            <>
              <div className="space-y-2">
                <Label>Assigned user</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {assignees.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team leader</Label>
                <Select value={leader} onValueChange={setLeader}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {leaders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-start">Start date</Label>
            <Input
              id="task-start"
              type="date"
              value={startDate ?? ""}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due">
              {mode === "request" ? "Suggested due date" : "Due date"}
            </Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {mode === "manage" && (
            <>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-progress">Progress (%)</Label>
                <Input
                  id="task-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-attach">Attachments (comma separated links)</Label>
            <Input
              id="task-attach"
              value={attachments}
              onChange={(e) => setAttachments(e.target.value)}
              placeholder="https://drive.example.com/spec.pdf"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-notes">Additional notes</Label>
            <Textarea
              id="task-notes"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {task ? "Save changes" : mode === "request" ? "Submit request" : "Assign task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
