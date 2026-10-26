import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { PriorityBadge, TaskTicks } from "@/components/task-ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addProjectMember, addProjectNote, approveTask, rejectTask, removeProjectMember, reviewProjectChangeRequest, submitProjectChangeRequest, type Actor } from "@/lib/mutations";
import { effectiveStatus, fetchProjectCollaboration, fetchWorkspace, formatDate, formatDateTime, nameOf, PRIORITY_LABEL, STATUS_LABEL, type Priority, type Project, type ProjectChangeRequest, type Task, type Workspace } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const NONE = "__none__";
const EDITABLE_FIELDS = ["name", "description", "client_name", "category", "priority", "start_date", "deadline"] as const;

export default function ProjectDetailsPage() {
  const { projectId = "" } = useParams();
  useDocumentTitle("Project details — Northlight", "Project overview, delivery, notes, assignments and change requests.");
  return <AuthGate allow={ADMIN_ROLES} portal="admin">{(user) => <ProjectDetailsContent actor={user} projectId={projectId} />}</AuthGate>;
}

function ProjectDetailsContent({ actor, projectId }: { actor: Actor; projectId: string }) {
  const qc = useQueryClient();
  const { data: workspace, isLoading, isError } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: collaboration, isLoading: collaborationLoading, isError: collaborationError } = useQuery({ queryKey: ["project-collaboration", projectId], queryFn: () => fetchProjectCollaboration(projectId), enabled: Boolean(projectId) });
  const [note, setNote] = useState("");
  const project = workspace?.projects.find((item) => item.id === projectId);
  const tasks = useMemo(() => (workspace?.tasks ?? []).filter((task) => task.project_id === projectId), [workspace?.tasks, projectId]);
  const logs = useMemo(() => (workspace?.logs ?? []).filter((log) => log.project_id === projectId), [workspace?.logs, projectId]);
  const members = collaboration?.members ?? [];
  const notes = collaboration?.notes ?? [];
  const changeRequests = collaboration?.changeRequests ?? [];
  const isSuperAdmin = actor.role === "super_admin";
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["workspace"] }),
      qc.invalidateQueries({ queryKey: ["project-collaboration", projectId] }),
    ]);
  };

  if (isLoading || collaborationLoading) return <AppShell userName={actor.name} role={actor.role} title="Project details"><Skeleton className="h-96 rounded-xl" /></AppShell>;
  if (isError || collaborationError) return <AppShell userName={actor.name} role={actor.role} title="Project details"><div className="panel p-6 text-sm text-destructive">Could not load this project. Confirm the project management migration is applied, then try again.</div></AppShell>;
  if (!project) return <AppShell userName={actor.name} role={actor.role} title="Project not found"><div className="panel space-y-4 p-6"><p className="text-muted-foreground">This project does not exist or may have been removed.</p><Button asChild variant="outline"><Link to="/projects"><ArrowLeft className="mr-2 size-4" />Back to projects</Link></Button></div></AppShell>;

  async function postNote() {
    try { await addProjectNote(actor, projectId, note); setNote(""); await refresh(); toast.success("Note added"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not add note."); }
  }

  async function addMember(profileId: string) {
    if (!profileId || profileId === NONE) return;
    try { await addProjectMember(actor, projectId, profileId); await refresh(); toast.success("Project member added"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not add project member."); }
  }

  async function handleRemoveMember(profileId: string) {
    try { await removeProjectMember(actor, projectId, profileId); await refresh(); toast.success("Project member removed"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove project member."); }
  }

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title={project.name}
      subtitle={`${project.client_name || "Internal project"} · ${project.category || "Uncategorised"}`}
      actions={<Button asChild variant="outline" size="sm"><Link to="/projects"><ArrowLeft className="mr-2 size-4" />All projects</Link></Button>}
    >
      <div className="space-y-5">
        <section className="panel space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{project.description || "No project description yet."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{STATUS_LABEL[project.status] ?? project.status}</Badge>
                <PriorityBadge priority={project.priority} />
                {project.deadline && <span className="text-xs text-muted-foreground">Due {formatDate(project.deadline)}</span>}
              </div>
            </div>
            <div className="w-full max-w-xs">
              <div className="mb-2 flex justify-between text-sm"><span>Overall progress</span><span className="font-medium tabular-nums">{project.progress}%</span></div>
              <Progress value={project.progress} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">{tasks.filter((task) => task.status === "completed").length} of {tasks.length} tasks completed</p>
            </div>
          </div>
          <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ProjectFact label="Client" value={project.client_name || "Internal"} />
            <ProjectFact label="Team" value={workspace?.teams.find((team) => team.id === project.team_id)?.name ?? "No team"} />
            <ProjectFact label="Start date" value={formatDate(project.start_date)} />
            <ProjectFact label="Deadline" value={formatDate(project.deadline)} />
          </div>
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks <span className="ml-2 text-xs text-muted-foreground">{tasks.length}</span></TabsTrigger>
            <TabsTrigger value="notes">Notes <span className="ml-2 text-xs text-muted-foreground">{notes.length}</span></TabsTrigger>
            <TabsTrigger value="changes">Change requests <span className="ml-2 text-xs text-muted-foreground">{changeRequests.length}</span></TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
              <section className="panel space-y-4 p-5">
                <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Project team</h2><p className="text-xs text-muted-foreground">{members.length} assigned</p></div>
                  {isSuperAdmin && <Select onValueChange={addMember}><SelectTrigger className="w-44"><SelectValue placeholder="Add member" /></SelectTrigger><SelectContent>
                    {(workspace?.people ?? []).filter((person) => person.is_active && !members.some((member) => member.profile_id === person.id)).map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}
                  </SelectContent></Select>}
                </div>
                {members.length ? <div className="space-y-3">{members.map((member) => <div key={member.id} className="flex items-center gap-3">
                  <PersonAvatar name={nameOf(workspace?.people ?? [], member.profile_id)} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nameOf(workspace?.people ?? [], member.profile_id)}</p><p className="text-xs text-muted-foreground">Added by {nameOf(workspace?.people ?? [], member.assigned_by)} · {formatDateTime(member.created_at)}</p></div>
                  {isSuperAdmin && <Button variant="ghost" size="icon" title="Remove member" onClick={() => handleRemoveMember(member.profile_id)}><Trash2 className="size-4 text-muted-foreground" /></Button>}
                </div>)}</div> : <EmptyState>No project members assigned yet.</EmptyState>}
              </section>
              <section className="panel space-y-4 p-5">
                <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Needs review</h2><p className="text-xs text-muted-foreground">Task requests awaiting an admin decision</p></div><Badge variant="secondary">{tasks.filter((task) => task.status === "pending_approval").length}</Badge></div>
                {tasks.filter((task) => task.status === "pending_approval").length ? tasks.filter((task) => task.status === "pending_approval").map((task) => <TaskReviewItem key={task.id} task={task} workspace={workspace!} actor={actor} refresh={refresh} />) : <EmptyState>No task requests are waiting for review.</EmptyState>}
                {tasks.some((task) => task.status === "under_review") && <div className="border-t pt-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Work submitted for review</p>{tasks.filter((task) => task.status === "under_review").map((task) => <TaskSummary key={task.id} task={task} workspace={workspace!} />)}</div>}
              </section>
            </div>
              <section className="panel space-y-3 p-5"><div><h2 className="font-semibold">Recent activity</h2><p className="text-xs text-muted-foreground">Project updates and decisions</p></div>
              {logs.slice(0, 5).length ? logs.slice(0, 5).map((log) => <ActivityRow key={log.id} log={log} actorName={nameOf(workspace?.people ?? [], log.actor_id)} />) : <EmptyState>No activity recorded yet.</EmptyState>}
            </section>
          </TabsContent>

          <TabsContent value="tasks" className="panel divide-y divide-border/60 p-1">
            <div className="flex items-center justify-between px-4 py-3"><div><h2 className="font-semibold">Project tasks</h2><p className="text-xs text-muted-foreground">Assignments, ownership and delivery status</p></div><TaskFormDialog actor={actor} projects={[project]} people={workspace?.people ?? []} onSaved={() => void refresh()} trigger={<Button size="sm"><Plus className="mr-2 size-4" />Add task</Button>} /></div>
            {tasks.length ? tasks.map((task) => <TaskSummary key={task.id} task={task} workspace={workspace!} />) : <EmptyState>No tasks have been created for this project.</EmptyState>}
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <section className="panel space-y-3 p-5"><div><h2 className="font-semibold">Project notes</h2><p className="text-xs text-muted-foreground">Shared with the admin team and saved in the project record.</p></div><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder="Add an update, decision, or context for the team…" /><div className="flex justify-end"><Button onClick={postNote} disabled={!note.trim()}><MessageSquare className="mr-2 size-4" />Post note</Button></div></section>
            <section className="panel divide-y divide-border/60 p-1">{notes.length ? notes.map((item) => <div key={item.id} className="flex gap-3 px-4 py-4"><PersonAvatar name={nameOf(workspace?.people ?? [], item.author_id)} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="text-sm font-medium">{nameOf(workspace?.people ?? [], item.author_id)}</span><span className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p></div></div>) : <EmptyState>No notes yet. Add the first project update above.</EmptyState>}</section>
          </TabsContent>

          <TabsContent value="changes" className="space-y-4">
            <ProjectChangeRequestForm actor={actor} project={project} onSubmitted={refresh} />
            <section className="panel divide-y divide-border/60 p-1">{changeRequests.length ? changeRequests.map((request) => <ChangeRequestCard key={request.id} request={request} actor={actor} people={workspace?.people ?? []} onReviewed={refresh} />) : <EmptyState>No functionality change requests have been submitted.</EmptyState>}</section>
          </TabsContent>

          <TabsContent value="activity" className="panel divide-y divide-border/60 p-1">
            {logs.length ? logs.map((log) => <ActivityRow key={log.id} log={log} actorName={nameOf(workspace?.people ?? [], log.actor_id)} />) : <EmptyState>No activity recorded yet.</EmptyState>}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function ProjectFact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>; }
function PersonAvatar({ name }: { name: string }) { return <Avatar className="size-9"><AvatarFallback>{name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</AvatarFallback></Avatar>; }

function TaskSummary({ task, workspace }: { task: Task; workspace: Pick<Workspace, "people" | "logs"> }) {
  const assignmentEvents = workspace.logs.filter((log) => log.entity_type === "task" && log.entity_id === task.id && log.metadata.new_assignee);
  const lastAssignment = assignmentEvents[0];
  return <div className="flex flex-wrap items-center gap-3 px-4 py-3">
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">Assigned to {nameOf(workspace.people, task.assigned_member_id)} · Created by {nameOf(workspace.people, task.created_by)}{lastAssignment ? ` · Last assigned by ${nameOf(workspace.people, lastAssignment.actor_id)}` : ""}</p></div>
    <PriorityBadge priority={task.priority} /><TaskTicks status={effectiveStatus(task)} /><div className="w-20 text-right text-xs tabular-nums text-muted-foreground">{task.progress}%</div>
  </div>;
}

function TaskReviewItem({ task, workspace, actor, refresh }: { task: Task; workspace: { people: { id: string; full_name: string }[] }; actor: Actor; refresh: () => Promise<void> }) {
  async function decide(approve: boolean) {
    try { if (approve) await approveTask(actor, task); else await rejectTask(actor, task); await refresh(); toast.success(approve ? "Task request approved" : "Task request rejected"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not review this task."); }
  }
  return <div className="flex flex-wrap items-center gap-3 rounded-md border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">Requested by {nameOf(workspace.people, task.created_by)} · Assigned to {nameOf(workspace.people, task.assigned_member_id)}</p></div>{actor.role === "super_admin" ? <><Button size="sm" variant="outline" onClick={() => decide(true)}><Check className="mr-1 size-4 text-emerald-600" />Approve</Button><Button size="sm" variant="ghost" onClick={() => decide(false)}><X className="mr-1 size-4 text-destructive" />Reject</Button></> : <Badge variant="secondary">Awaiting super-admin review</Badge>}</div>;
}

function ActivityRow({ log, actorName }: { log: { id: string; action: string; created_at: string }; actorName: string }) {
  return <div className="flex items-start gap-3 px-4 py-3"><span className="mt-1 size-2 rounded-full bg-primary/60" /><div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{actorName}</span> <span className="text-muted-foreground">{log.action}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p></div><Clock3 className="size-4 text-muted-foreground" /></div>;
}

function ProjectChangeRequestForm({ actor, project, onSubmitted }: { actor: Actor; project: Project; onSubmitted: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<(typeof EDITABLE_FIELDS)[number], string>>({ name: "", description: "", client_name: "", category: "", priority: "", start_date: "", deadline: "" });
  const [includedFields, setIncludedFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const changes: Record<string, string | null> = {};
    for (const field of includedFields) {
      if (field === "priority" && !values.priority) { toast.error("Choose a priority for the requested change."); return; }
      if (field === "name" && !values.name.trim()) { toast.error("Project name cannot be empty."); return; }
      changes[field] = field === "priority" ? values.priority : values[field as keyof typeof values].trim() || (field === "name" ? "" : null);
    }
    if (!summary.trim() || !reason.trim() || !includedFields.length) { toast.error("Add a title, reason, and select at least one field to change."); return; }
    setBusy(true);
    try { await submitProjectChangeRequest(actor, { projectId: project.id, summary, reason, changes: changes as ProjectChangeRequest["proposed_changes"] }); await onSubmitted(); toast.success("Change request submitted"); setOpen(false); setSummary(""); setReason(""); setIncludedFields([]); setValues({ name: "", description: "", client_name: "", category: "", priority: "", start_date: "", deadline: "" }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit this change request."); }
    finally { setBusy(false); }
  }
  const editableLabels: Record<(typeof EDITABLE_FIELDS)[number], string> = { name: "Project name", description: "Description", client_name: "Client", category: "Category", priority: "Priority", start_date: "Start date", deadline: "Deadline" };
  return <div className="panel flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold">Functionality change requests</h2><p className="text-xs text-muted-foreground">Propose project detail changes for super-admin approval.</p></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Request a change</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Request project changes</DialogTitle><DialogDescription>Fill only the fields you want changed. Approved requests update the project record.</DialogDescription></DialogHeader>
      <div className="space-y-3">{EDITABLE_FIELDS.map((field) => <div key={field} className="grid gap-1.5 rounded-md border p-3"><div className="flex items-center gap-2"><Checkbox id={`include-${field}`} checked={includedFields.includes(field)} onCheckedChange={(checked) => setIncludedFields((current) => checked ? [...current, field] : current.filter((item) => item !== field))} /><Label htmlFor={`include-${field}`}>{editableLabels[field]}</Label></div>{field === "description" ? <Textarea id={`change-${field}`} value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} placeholder="Leave blank to clear" /> : field === "priority" ? <Select value={values.priority || NONE} onValueChange={(value) => setValues((current) => ({ ...current, priority: value === NONE ? "" : value }))}><SelectTrigger><SelectValue placeholder="Choose a priority" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Choose a priority</SelectItem>{(["low", "medium", "high", "critical"] as Priority[]).map((value) => <SelectItem key={value} value={value}>{PRIORITY_LABEL[value]}</SelectItem>)}</SelectContent></Select> : <Input id={`change-${field}`} type={field === "deadline" || field === "start_date" ? "date" : "text"} value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} placeholder={field === "name" ? "Enter project name" : "Leave blank to clear"} />}</div>)}
        <div className="grid gap-1.5"><Label htmlFor="change-summary">Request title</Label><Input id="change-summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={200} placeholder="e.g. Add a client portal phase" /></div><div className="grid gap-1.5"><Label htmlFor="change-reason">Reason / functionality details</Label><Textarea id="change-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={5000} placeholder="Describe the requested functionality and why it is needed." /></div></div>
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={submit} disabled={busy}>Submit request</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function ChangeRequestCard({ request, actor, people, onReviewed }: { request: ProjectChangeRequest; actor: Actor; people: { id: string; full_name: string }[]; onReviewed: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function review() {
    setBusy(true);
    try { await reviewProjectChangeRequest(actor, request.id, decision, feedback); await onReviewed(); toast.success(decision === "approved" ? "Change request approved and applied" : "Change request rejected"); setOpen(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not review this request."); }
    finally { setBusy(false); }
  }
  const changes = Object.entries(request.proposed_changes).filter(([key]) => EDITABLE_FIELDS.includes(key as (typeof EDITABLE_FIELDS)[number]));
  return <article className="space-y-3 px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{request.summary}</p><p className="mt-1 text-xs text-muted-foreground">Requested by {nameOf(people, request.requester_id)} · {formatDateTime(request.created_at)}</p></div><Badge variant={request.status === "approved" ? "default" : request.status === "rejected" ? "destructive" : "secondary"}>{request.status}</Badge></div>
    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.reason}</p><div className="rounded-md bg-muted/50 p-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed fields</p>{changes.map(([field, value]) => <p key={field} className="text-sm"><span className="font-medium">{field.replace(/_/g, " ")}: </span>{String(value ?? "—")}</p>)}</div>
    {request.status !== "pending" && <p className="text-xs text-muted-foreground">{request.status === "approved" ? "Approved" : "Rejected"} by {nameOf(people, request.reviewer_id)} · {request.reviewed_at ? formatDateTime(request.reviewed_at) : ""}{request.review_feedback ? ` · ${request.review_feedback}` : ""}</p>}
    {actor.role === "super_admin" && request.status === "pending" && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm">Review request</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Review change request</DialogTitle><DialogDescription>Approving applies the proposed fields to this project.</DialogDescription></DialogHeader><div className="space-y-3"><Select value={decision} onValueChange={(value) => setDecision(value as "approved" | "rejected")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">Approve and apply changes</SelectItem><SelectItem value="rejected">Reject request</SelectItem></SelectContent></Select><div className="grid gap-1.5"><Label htmlFor={`feedback-${request.id}`}>Review feedback (optional)</Label><Textarea id={`feedback-${request.id}`} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></div></div><DialogFooter><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={review} disabled={busy}>{decision === "approved" ? "Approve changes" : "Reject request"}</Button></DialogFooter></DialogContent></Dialog>}
  </article>;
}
