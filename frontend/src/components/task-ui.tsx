import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority } from "@/lib/workspace";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  high: "border-orange-500/50 bg-orange-500/15 text-orange-400",
  critical: "border-red-500/50 bg-red-500/15 text-red-400",
};

const PRIORITY_DOT: Record<Priority, string> = {
  low: "🟢",
  medium: "🟠",
  high: "🔴",
  critical: "🔴",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", PRIORITY_STYLES[priority])}>
      <span aria-hidden>{PRIORITY_DOT[priority]}</span>
      {PRIORITY_LABEL[priority].toUpperCase()}
    </Badge>
  );
}

const STATUS_STYLES: Record<string, string> = {
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  started: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  assigned: "border-primary/40 bg-primary/10 text-primary",
  pending_approval: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  pending: "border-muted-foreground/30 bg-muted text-muted-foreground",
  under_review: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  rejected: "border-red-500/40 bg-red-500/10 text-red-400",
  blocked: "border-red-500/40 bg-red-500/10 text-red-400",
  overdue: "border-red-500/50 bg-red-500/15 text-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        STATUS_STYLES[status] ?? "border-muted-foreground/30 bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** Green when complete, red while anything is outstanding. */
export function CompletionBar({
  value,
  showLabel = true,
  className,
}: {
  value: number;
  showLabel?: boolean;
  className?: string;
}) {
  const complete = value >= 100;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            complete ? "bg-emerald-500" : "bg-red-500",
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className={complete ? "text-emerald-400" : "text-red-400"}>
            {complete ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
          </span>
          <span className={cn("font-medium", complete ? "text-emerald-400" : "text-red-400")}>
            {value}% · {complete ? "COMPLETED" : "IN PROGRESS"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * WhatsApp-style tick progression for a task's lifecycle:
 *  - one grey tick   → assigned to the team, not started
 *  - two grey ticks  → work under way (in progress / under review)
 *  - two blue ticks  → completed
 * Anything else (pending approval, blocked, rejected, overdue) falls back
 * to a small dot + label instead of ticks, since those aren't "progress".
 */
export function TaskTicks({ status, className }: { status: string; className?: string }) {
  const label =
    STATUS_LABEL[status] ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  if (status === "completed") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-sky-500", className)} title={label}>
        <TickPair />
        <span className="text-xs font-medium">{label}</span>
      </span>
    );
  }

  if (status === "in_progress" || status === "under_review" || status === "started") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
        title={label}
      >
        <TickPair />
        <span className="text-xs font-medium">{label}</span>
      </span>
    );
  }

  if (status === "assigned" || status === "pending") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
        title={label}
      >
        <TickSingle />
        <span className="text-xs font-medium">{label}</span>
      </span>
    );
  }

  // pending_approval / blocked / rejected / overdue — not part of the tick progression
  return <StatusBadge status={status} />;
}

function TickSingle() {
  return (
    <svg viewBox="0 0 16 12" className="size-3.5 shrink-0" fill="none" aria-hidden>
      <path
        d="M1 6.2 5 10l9-9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TickPair() {
  return (
    <svg viewBox="0 0 20 12" className="size-4 shrink-0" fill="none" aria-hidden>
      <path
        d="M1 6.2 5 10l9-9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6.2 10 10l9-9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
