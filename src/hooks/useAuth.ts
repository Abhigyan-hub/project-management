import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { db, supabase } from "@/lib/supabase";

export type AppRole = "super_admin" | "admin" | "team_leader" | "member";

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
      const profile = await db(
        supabase.from("profiles").select("*").eq("user_id", session!.user.id).maybeSingle(),
      );
      if (!profile) return { profile: null, role: "member" as AppRole };
      await supabase.rpc("touch_last_seen");
      const roleRow = await db(
        supabase.from("user_roles").select("role").eq("profile_id", profile.id).maybeSingle(),
      );
      return { profile, role: (roleRow?.role ?? "member") as AppRole };
    },
  });
}

export async function accessForUser(userId: string) {
  const profile = await db(
    supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle(),
  );
  if (!profile) return null;
  const roleRow = await db(
    supabase.from("user_roles").select("role").eq("profile_id", profile.id).maybeSingle(),
  );
  return {
    profileId: profile.id as string,
    role: (roleRow?.role ?? "member") as AppRole,
  };
}

export async function claimAdminAccess() {
  const role = await db(supabase.rpc("claim_admin_access"));
  return { role: role as AppRole };
}
