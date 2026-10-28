import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, db, supabase } from "@/lib/api";

export type AppRole = "super_admin" | "admin" | "team_leader" | "member";
type Session = { user: { id: string; email?: string } };

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export function useCurrentProfile(session: Session | null) {
  return useQuery({
    queryKey: ["current-profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const current = await apiRequest<{ profile: Record<string, unknown>; user: { role: AppRole } }>("/api/auth/session");
      await supabase.rpc("touch_last_seen");
      return { profile: current.profile, role: current.user.role };
    },
  });
}

export async function accessForUser(userId: string) {
  const current = await apiRequest<{ user: { id: string; profileId: string; role: AppRole } }>("/api/auth/session");
  return current.user.id === userId ? { profileId: current.user.profileId, role: current.user.role } : null;
}

export async function claimAdminAccess() {
  const role = await db(supabase.rpc("claim_admin_access"));
  return { role: role as AppRole };
}
