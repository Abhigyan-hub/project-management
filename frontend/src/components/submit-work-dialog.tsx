import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Github, ExternalLink, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { uploadScreenshots } from "@/lib/work-uploads";
import { submitWork, type Actor } from "@/lib/mutations";
import type { Project, Task, TaskStatus } from "@/lib/workspace";
import { STATUS_LABEL } from "@/lib/workspace";

const SUBMIT_STATUSES: TaskStatus[] = ["in_progress", "under_review", "completed", "blocked"];

export function SubmitWorkDialog({
  actor,
  tasks,
  projects,
  trigger,
}: {
  actor: Actor;
  tasks: Task[];
  projects: Project[];
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [taskId, setTaskId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [description, setDescription] = useState("");
  const [github, setGithub] = useState("");
  const [live, setLive] = useState("");
  const [status, setStatus] = useState<TaskStatus>("in_progress");
  const [progress, setProgress] = useState(50);
  const [files, setFiles] = useState<File[]>([]);

  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId]);
  const resolvedProject = task?.project_id ?? projectId;

  function reset() {
    setTaskId("");
    setProjectId("");
    setTitle("");
    setModuleName("");
    setDescription("");
    setGithub("");
    setLive("");
    setStatus("in_progress");
    setProgress(50);
    setFiles([]);
  }

  function pickTask(id: string) {
    setTaskId(id);
    const t = tasks.find((x) => x.id === id);
    if (t) {
      setProjectId(t.project_id);
      setProgress(t.progress || 0);
      if (!title) setTitle(t.title);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const tooBig = picked.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      toast.error("Each screenshot must be under 5 MB");
      return;
    }
    setFiles((prev) => [...prev, ...picked].slice(0, 6));
  }

  const validUrl = (v: string) => !v || /^https?:\/\/\S+$/i.test(v.trim());

  async function handleSubmit() {
    if (!resolvedProject) {
      toast.error("Choose a task or project");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a work title");
      return;
    }
    if (!validUrl(github) || !validUrl(live)) {
      toast.error("Links must start with http:// or https://");
      return;
    }

    setBusy(true);
    try {
      const paths = files.length ? await uploadScreenshots(actor.profileId, files) : [];
      await submitWork(
        actor,
        {
          project_id: resolvedProject,
          task_id: taskId || null,
          work_title: title.trim().slice(0, 120),
          work_description: description.trim().slice(0, 1000) || null,
          module_name: moduleName.trim().slice(0, 80) || null,
          progress_from: task?.progress ?? 0,
          progress_to: progress,
          status,
          github_url: github.trim() || null,
          live_url: live.trim() || null,
          screenshots: paths,
        },
        task,
      );
      toast.success("Work submitted to your team");
      await qc.invalidateQueries();
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit work");
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
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Upload className="mr-2 size-4" /> Upload work
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload your work</DialogTitle>
          <DialogDescription>
            Share your hosted link, GitHub repository and screenshots with your team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Task</Label>
            <Select value={taskId} onValueChange={pickTask}>
              <SelectTrigger>
                <SelectValue placeholder="Select an assigned task (optional)" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!taskId && (
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
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
          )}

          <div className="grid gap-2">
            <Label htmlFor="work-title">Work title</Label>
            <Input
              id="work-title"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Checkout flow — payment integration"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="module">Module</Label>
              <Input
                id="module"
                maxLength={80}
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="Payments"
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMIT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="host-link" className="flex items-center gap-2">
              <ExternalLink className="size-3.5" /> Hosted / live link
            </Label>
            <Input
              id="host-link"
              inputMode="url"
              value={live}
              onChange={(e) => setLive(e.target.value)}
              placeholder="https://my-feature.vercel.app"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="github-link" className="flex items-center gap-2">
              <Github className="size-3.5" /> GitHub repository
            </Label>
            <Input
              id="github-link"
              inputMode="url"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="https://github.com/team/repo"
            />
          </div>

          <div className="grid gap-2">
            <Label>Screenshots (up to 6)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 size-4" /> Choose screenshots
            </Button>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="relative size-16 overflow-hidden rounded-md border border-border"
                  >
                    <img
                      src={URL.createObjectURL(f)}
                      alt={`Screenshot preview ${i + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove screenshot"
                      onClick={() => setFiles((prev) => prev.filter((_, x) => x !== i))}
                      className="absolute right-0 top-0 rounded-bl bg-background/90 p-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Progress: {progress}%</Label>
            <Slider
              value={[progress]}
              onValueChange={(v) => setProgress(v[0] ?? 0)}
              max={100}
              step={5}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="work-notes">Notes for your team</Label>
            <Textarea
              id="work-notes"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you complete? Anything blocking you?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Submit work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
