import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/api";
import { accessForUser } from "@/hooks/useAuth";
import { homeForRole } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

async function resolveHome(userId: string) {
  const access = await accessForUser(userId);
  if (!access) return "/my-work";
  return homeForRole(access.role);
}

export default function TeamAuth() {
  useDocumentTitle(
    "Team sign in — Northlight Project Control",
    "Sign in to the Northlight team portal to view assigned tasks, submit progress and track delivery.",
  );

  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) navigate(await resolveHome(data.session.user.id), { replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Sign in failed.");
      return;
    }
    const home = await resolveHome(data.user.id);
    setBusy(false);
    navigate(home, { replace: true });
  }

  async function handleReset() {
    if (!email) {
      toast.error("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) {
      toast.error(error.message ?? "Could not send reset link.");
      return;
    }
    toast.success("Password reset link sent.");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="bg-gradient-amber grid size-8 place-items-center rounded-md font-display text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="font-display text-lg font-semibold">Northlight</span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-2xl font-semibold">Team portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your workspace. New accounts require an invitation from an administrator.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleReset}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </button>
          </div>

          <p className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Ask your team leader or administrator for an invitation if you do not have an account.
          </p>
        </div>

        <Link
          to="/admin-login"
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          <ShieldCheck className="size-4 text-primary" /> Admin? Go to admin portal
        </Link>

        <Link
          to="/"
          className="mt-3 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
