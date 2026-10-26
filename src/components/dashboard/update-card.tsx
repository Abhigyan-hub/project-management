import { useEffect, useState } from "react";
import { Github, ExternalLink, Images } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { STATUS_LABELS } from "@/lib/analytics";
import { resolveScreenshotUrls } from "@/lib/work-uploads";
import { formatDate } from "@/lib/workspace";


const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Team Member",
};

export type TimelineItem = {
  id: string;
  authorName: string;
  authorRole: string;
  projectName: string;
  work_title: string;
  module_name: string | null;
  progress_from: number;
  progress_to: number;
  status: string;
  github_url: string | null;
  live_url: string | null;
  screenshots: string[];
  created_at: string;
};

export function UpdateCard({ item }: { item: TimelineItem }) {
  const initials = item.authorName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const when = new Date(item.created_at);

  return (
    <article className="panel p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{item.authorName}</span>
            <Badge variant="secondary" className="text-[10px]">
              {ROLE_LABEL[item.authorRole] ?? item.authorRole}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {item.projectName}
              {item.module_name ? ` · ${item.module_name}` : ""}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {formatDate(item.created_at)} · {when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium">{item.work_title}</p>

          <div className="mt-3 flex items-center gap-3">
            <Progress value={item.progress_to} className="h-1.5" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {item.progress_from}% → {item.progress_to}%
            </span>
            <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">
              {STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Chip icon={Github} label={item.github_url ? "Repository" : "GitHub: Not provided"} href={item.github_url} />
            <Chip icon={ExternalLink} label={item.live_url ? "Live demo" : "Live demo: Not provided"} href={item.live_url} />
            <Chip
              icon={Images}
              label={
                item.screenshots.length
                  ? `${item.screenshots.length} screenshot${item.screenshots.length > 1 ? "s" : ""}`
                  : "No screenshots uploaded"
              }
            />
          </div>

          <ScreenshotStrip paths={item.screenshots} />
        </div>
      </div>

    </article>
  );
}

function Chip({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof Github;
  label: string;
  href?: string | null;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${base} border-primary/40 text-primary hover:bg-primary/10`}
      >
        <Icon className="size-3.5" /> {label}
      </a>
    );
  }
  return (
    <span className={`${base} text-muted-foreground`}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

function ScreenshotStrip({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (!paths.length) {
      setUrls([]);
      return;
    }
    resolveScreenshotUrls(paths)
      .then((u) => active && setUrls(u))
      .catch(() => active && setUrls([]));
    return () => {
      active = false;
    };
  }, [paths]);

  if (!urls.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={`Work screenshot ${i + 1}`}
            loading="lazy"
            className="size-20 rounded-md border border-border object-cover transition hover:opacity-80"
          />
        </a>
      ))}
    </div>
  );
}
