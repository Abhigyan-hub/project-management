import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, supabase } from "@/lib/api";
import { homeForRole } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountTokenPage({ mode }: { mode: "invite" | "reset" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const token = params.get("token") || "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 12) { toast.error("Use at least 12 characters for your password."); return; }
    if (password !== confirm) { toast.error("The passwords do not match."); return; }
    if (!token) { toast.error("This link is missing its token. Ask an administrator for a new link."); return; }
    setBusy(true);
    try {
      const endpoint = mode === "invite" ? "/api/auth/accept-invite" : "/api/auth/reset-password";
      const { user } = await apiRequest<{ user: { id: string; role: string } }>(endpoint, { method: "POST", body: JSON.stringify({ token, password }) });
      await supabase.auth.getSession();
      toast.success(mode === "invite" ? "Your account is ready." : "Your password has been updated.");
      navigate(homeForRole(user.role as never), { replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : "This link could not be used."); }
    finally { setBusy(false); }
  }

  return <div className="grid min-h-screen place-items-center bg-background px-4 py-10"><div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
    <Link to="/" className="mb-6 block text-center font-display text-lg font-semibold">Northlight</Link>
    <h1 className="font-display text-2xl font-semibold">{mode === "invite" ? "Finish setting up your account" : "Choose a new password"}</h1>
    <p className="mt-1 text-sm text-muted-foreground">Use a strong password with at least 12 characters.</p>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" minLength={12} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" minLength={12} autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
      <Button className="w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{mode === "invite" ? "Activate account" : "Reset password"}</Button>
    </form>
  </div></div>;
}
