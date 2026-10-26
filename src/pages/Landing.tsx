import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Landing() {
  useDocumentTitle(
    "Northlight — Enterprise Project Progress Control",
    "Multi-admin project progress management: role-based access, module-level progress, shared timelines and organisation-wide delivery analytics.",
  );

  const navigate = useNavigate();
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="bg-gradient-amber grid size-8 place-items-center rounded-md font-display text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="font-display text-lg font-semibold">Northlight</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin-login">Admin sign in</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Team sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <section className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Enterprise delivery control
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Every project, every admin, every update —{" "}
            <span className="text-gradient-amber">on one timeline.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground">
            Northlight gives super admins organisation-wide analytics while admins and team members
            push module-level progress, GitHub links, live demos and screenshots into a single
            shared record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/admin-login">
                Admin portal <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Team member portal</Link>
            </Button>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          <Feature
            icon={BarChart3}
            title="Live analytics"
            body="Progress, delayed deliveries, completion trends and productivity in real time."
          />
          <Feature
            icon={ShieldCheck}
            title="Role-based access"
            body="Super admins, admins and team members each see exactly what they should."
          />
          <Feature
            icon={Users}
            title="Multi-admin projects"
            body="Several admins collaborate on one project with weighted module progress."
          />
        </section>
      </main>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BarChart3;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-5">
      <Icon className="size-5 text-primary" />
      <h2 className="mt-3 font-display text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
