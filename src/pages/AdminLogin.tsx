import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { accessForUser, claimAdminAccess } from "@/hooks/useAuth";
import { DEMO_PASSWORD } from "@/lib/demo";
import { homeForRole } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

async function resolveHome(userId: string) {
  const access = await accessForUser(userId);
  if (!access) return "/dashboard";
  return homeForRole(access.role);
}

export default function AdminLogin() {
  useDocumentTitle(
    "Admin sign in — Northlight Project Control",
    "Restricted admin portal sign in and admin account registration for Northlight super admins and project admins.",
  );

  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) navigate(await resolveHome(data.session.user.id), { replace: true });
    });
  }, [navigate]);

  async function handleSignIn() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Sign in failed.");
      return;
    }

    const access = await accessForUser(data.user.id);
    const admin = access?.role === "admin" || access?.role === "super_admin";
    const home = access ? homeForRole(access.role) : "/dashboard";
    setBusy(false);

    if (!admin) {
      toast.info("Signed in as a team member — taking you to your workspace.");
    }

    navigate(home, { replace: true });
  }

  async function handleSignUp() {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, portal: "admin" } },
    });

    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create account.");
      return;
    }

    if (!data.session) {
      setBusy(false);
      toast.error("Confirm your email, then sign in. Turn off email confirmation in Supabase for instant admin signup.");
      return;
    }

    try {
      await claimAdminAccess();
      setBusy(false);
      toast.success("Admin account created.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setBusy(false);
      await supabase.auth.signOut();
      toast.error(err instanceof Error ? err.message : "Could not grant admin access.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") await handleSignIn();
    else await handleSignUp();
  }

  async function handleReset() {
    if (!email) {
      toast.error("Enter your admin email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin-login`,
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
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" /> Admin portal
          </div>
          <h1 className="font-display text-2xl font-semibold">Administrator access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in with your admin account." : "Register a new admin ID."}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create admin ID
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="admin-name">Full name</Label>
                <Input
                  id="admin-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin email</Label>
              <Input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
              {mode === "signin" ? "Enter admin portal" : "Create admin account"}
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
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Create admin ID" : "Back to sign in"}
            </button>
          </div>

          <p className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Demo accounts (password: <code className="font-mono">{DEMO_PASSWORD}</code>):{" "}
            <code className="font-mono">priya.super@northlight.io</code> (super admin) or{" "}
            <code className="font-mono">marcus.admin@northlight.io</code> (admin). Team member and
            team leader accounts can sign in here too — you&apos;ll be sent straight to your own
            workspace. Creating a new account here grants admin access immediately.
          </p>
        </div>

        <Link
          to="/auth"
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          <Users className="size-4 text-primary" /> Team member? Go to team portal
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
