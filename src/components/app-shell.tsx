import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CalendarDays,
  BarChart3,
  LogOut,
  ListChecks,
  UsersRound,
  ClipboardList,
  History,
  UserCog,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/people", label: "People", icon: Users },
  { to: "/users", label: "User management", icon: UserCog },
  { to: "/teams", label: "Teams", icon: UsersRound },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/history", label: "Activity history", icon: History },
] as const;

const LEADER_NAV = [
  { to: "/team", label: "My team", icon: UsersRound },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/history", label: "Activity history", icon: History },
  { to: "/my-work", label: "My work", icon: ListChecks },
] as const;

const MEMBER_NAV = [{ to: "/my-work", label: "My work", icon: ListChecks }] as const;

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  team_leader: "Team Leader",
  member: "Team Member",
};

export function AppShell({
  children,
  userName,
  role,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  userName: string;
  role: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = role === "super_admin" || role === "admin";
  const isLeader = role === "team_leader";
  const nav = isAdmin ? ADMIN_NAV : isLeader ? LEADER_NAV : MEMBER_NAV;
  const portalLabel = isAdmin ? "Admin portal" : isLeader ? "Team leader portal" : "Team portal";

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function signOut() {
    await supabase.auth.signOut();
    navigate(isAdmin ? "/admin-login" : "/auth", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <span className="bg-gradient-amber grid size-8 place-items-center rounded-md font-display text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">
            Northlight
          </span>
        </Link>
        <p className="mb-3 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {portalLabel}
        </p>

        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {active && <span className="ml-auto h-4 w-1 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                {initials || "NL"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-3 w-full justify-start" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-xl font-semibold">{title}</h1>
              <Badge variant="outline" className="border-primary/40 text-primary">
                {ROLE_LABEL[role] ?? role}
              </Badge>
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background/70 px-3 py-2 lg:hidden">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                pathname === to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={signOut}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </nav>

        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
