import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteProject, saveProject, saveTeam, type Actor } from "@/lib/mutations";
import {
  fetchWorkspace,
  formatDate,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Priority,
  type Project,
  type Team,
} from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const PRIORITY_TONE: Record<string, string> = {
  critical: "border-destructive/50 text-destructive",
  high: "border-primary/50 text-primary",
  medium: "border-border text-muted-foreground",
  low: "border-border text-muted-foreground",
};

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const ALL = "__all__";
const NO_TEAM = "__no_team__";
const NO_CATEGORY = "__no_category__";
const COMMON_CATEGORIES = ["Web", "Mobile", "Desktop", "Backend/API", "Cloud", "Data & AI", "Design", "Marketing", "Platform", "Other"];

export default function ProjectsPage() {
  useDocumentTitle(
    "Projects — Northlight",
    "Every project in the organisation with client, category, priority, status, progress and deadline.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => <ProjectsContent actor={user} />}
    </AuthGate>
  );
}

function ProjectsContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [priority, setPriority] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [progressRange, setProgressRange] = useState([0, 100]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const projects = data?.projects ?? [];
  const categories = useMemo(
    () => Array.from(new Set([
      ...COMMON_CATEGORIES,
      ...projects.map((project) => project.category?.trim()).filter(Boolean) as string[],
    ])).sort((a, b) => a.localeCompare(b)),
    [projects],
  );
  const statuses = useMemo(
    () => Array.from(new Set(projects.map((project) => project.status))).sort(),
    [projects],
  );
  const filteredProjects = useMemo(
    () => projects.filter((project) => {
      if (priority !== ALL && project.priority !== priority) return false;
      if (category !== ALL && project.category?.trim() !== category) return false;
      if (status !== ALL && project.status !== status) return false;
      if (project.progress < progressRange[0] || project.progress > progressRange[1]) return false;
      return true;
    }),
    [projects, priority, category, status, progressRange],
  );

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Projects"
      subtitle="Portfolio-wide delivery status"
      actions={
        <ProjectFormDialog
          actor={actor}
          teams={data?.teams ?? []}
          categories={categories}
          onSaved={refresh}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> New project
            </Button>
          }
        />
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-3">
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {PRIORITIES.map((item) => <SelectItem key={item} value={item}>{PRIORITY_LABEL[item]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statuses.map((item) => <SelectItem key={item} value={item}>{STATUS_LABEL[item] ?? item}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex w-full items-center gap-3 rounded-md border px-3 py-2 sm:w-80" aria-label="Filter by progress range">
            <span className="shrink-0 text-sm text-muted-foreground">Progress</span>
            <Slider
              min={0}
              max={100}
              step={1}
              minStepsBetweenThumbs={0}
              value={progressRange}
              onValueChange={setProgressRange}
              aria-label="Progress range, lower and upper limits included"
              className="flex-1"
            />
            <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {progressRange[0]}% to {progressRange[1]}%
            </span>
          </div>
          {(priority !== ALL || category !== ALL || status !== ALL || progressRange[0] !== 0 || progressRange[1] !== 100) && (
            <Button variant="ghost" size="sm" onClick={() => { setPriority(ALL); setCategory(ALL); setStatus(ALL); setProgressRange([0, 100]); }}>
              Clear filters
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{filteredProjects.length} of {projects.length} projects</span>
        </div>
        <div className="panel overflow-x-auto p-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-56">Progress</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-64">
                    <Link to={`/projects/${p.id}`} className="block truncate font-medium text-foreground hover:text-primary hover:underline">
                      {p.name}
                    </Link>
                    {p.description && (
                      <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.client_name ?? "Internal"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {data.teams.find((team) => team.id === p.team_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PRIORITY_TONE[p.priority]}>
                      {p.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={p.progress} className="h-1.5" />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {p.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(p.deadline)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <ProjectFormDialog
                        actor={actor}
                        teams={data.teams}
                        categories={categories}
                        project={p}
                        onSaved={refresh}
                        trigger={
                          <Button size="icon" variant="ghost" title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <ConfirmDelete
                        title="Delete project"
                        description={`"${p.name}" and all of its tasks will be removed.`}
                        onConfirm={async () => {
                          await deleteProject(actor, p.id, p.name);
                          await refresh();
                          toast.success("Project deleted");
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
              {!filteredProjects.length && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    {projects.length ? "No projects match these filters." : "No projects yet — create one to get started."}
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

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function ProjectFormDialog({
  actor,
  teams,
  categories,
  project,
  onSaved,
  trigger,
}: {
  actor: Actor;
  teams: Team[];
  categories: string[];
  project?: Project;
  onSaved: () => void | Promise<void>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [clientName, setClientName] = useState(project?.client_name ?? "");
  const [category, setCategory] = useState(project?.category ?? NO_CATEGORY);
  const [teamId, setTeamId] = useState(project?.team_id ?? NO_TEAM);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(project?.priority ?? "medium");
  const [startDate, setStartDate] = useState(toDateInput(project?.start_date));
  const [deadline, setDeadline] = useState(toDateInput(project?.deadline));

  function reset() {
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setClientName(project?.client_name ?? "");
    setCategory(project?.category ?? NO_CATEGORY);
    setTeamId(project?.team_id ?? NO_TEAM);
    setNewTeamOpen(false);
    setNewTeamName("");
    setNewTeamDescription("");
    setPriority(project?.priority ?? "medium");
    setStartDate(toDateInput(project?.start_date));
    setDeadline(toDateInput(project?.deadline));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Project name is required.");
      return;
    }
    setBusy(true);
    try {
      await saveProject(actor, {
        id: project?.id,
        name: name.trim(),
        description: description.trim() || null,
        client_name: clientName.trim() || null,
        category: category === NO_CATEGORY ? null : category,
        team_id: teamId === NO_TEAM ? null : teamId,
        priority,
        start_date: startDate || null,
        deadline: deadline || null,
      });
      toast.success(project ? "Project updated" : "Project created");
      await onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this project.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) {
      toast.error("Team name is required.");
      return;
    }
    setBusy(true);
    try {
      const createdTeamId = await saveTeam(actor, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || null,
      });
      setTeamId(createdTeamId);
      setNewTeamName("");
      setNewTeamDescription("");
      setNewTeamOpen(false);
      await onSaved();
      toast.success("Team created and selected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create this team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {project
              ? "Update this project's details."
              : "Add a new project to the portfolio. It starts at 0% progress and Not started status."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="proj-name">Project name</Label>
            <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="proj-client">Client</Label>
              <Input
                id="proj-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Internal"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue placeholder="Choose a team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>No team</SelectItem>
                {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {newTeamOpen ? (
              <div className="space-y-2 rounded-md border p-3">
                <Input value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="New team name" aria-label="New team name" />
                <Input value={newTeamDescription} onChange={(event) => setNewTeamDescription(event.target.value)} placeholder="Description (optional)" aria-label="New team description" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNewTeamOpen(false)} disabled={busy}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateTeam} disabled={busy}>Create and select</Button>
                </div>
              </div>
            ) : <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNewTeamOpen(true)}>Create a new team</Button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proj-start">Start date</Label>
              <Input
                id="proj-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="proj-deadline">Deadline</Label>
            <Input
              id="proj-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
