import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentProfile, useSession, type AppRole } from "@/hooks/useAuth";

export type GatedUser = { profileId: string; name: string; role: AppRole };

export const ADMIN_ROLES: AppRole[] = ["super_admin", "admin"];
export const LEADER_ROLES: AppRole[] = ["team_leader"];
export const MEMBER_ROLES: AppRole[] = ["member"];
export const STAFF_ROLES: AppRole[] = ["super_admin", "admin", "team_leader"];
export const ALL_ROLES: AppRole[] = ["super_admin", "admin", "team_leader", "member"];

export function homeForRole(role: AppRole) {
  if (ADMIN_ROLES.includes(role)) return "/dashboard";
  if (role === "team_leader") return "/team";
  return "/my-work";
}

export function AuthGate({
  children,
  allow,
  portal = "member",
}: {
  children: (user: GatedUser) => ReactNode;
  /** Roles allowed into this module. Defaults to everyone signed in. */
  allow?: AppRole[];
  /** Which login screen unauthenticated visitors are sent to. */
  portal?: "admin" | "member";
}) {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { data, isLoading } = useCurrentProfile(session);

  const loginPath = portal === "admin" ? "/admin-login" : "/auth";
  const role = data?.role;
  const allowed = !allow || (role ? allow.includes(role) : false);

  useEffect(() => {
    if (!loading && !session) navigate(loginPath, { replace: true });
  }, [loading, session, navigate, loginPath]);

  useEffect(() => {
    if (role && !allowed) navigate(homeForRole(role), { replace: true });
  }, [role, allowed, navigate]);

  if (loading || !session || isLoading || !data?.profile || !allowed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {children({
        profileId: data.profile.id,
        name: data.profile.full_name,
        role: data.role,
      })}
    </>
  );
}
