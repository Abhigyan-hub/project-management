import { useState } from "react";
import { Award, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { commendTeamMember, correctTeamCredit, type Actor } from "@/lib/mutations";
import { formatDateTime, nameOf, type Person, type TeamCredit, type TeamCreditTotal } from "@/lib/workspace";

export function TeamCreditsPanel({
  actor,
  teamId,
  people,
  credits,
  creditTotals,
  onChanged,
}: {
  actor: Actor;
  teamId: string | null;
  people: Person[];
  credits: TeamCredit[];
  creditTotals: TeamCreditTotal[];
  onChanged: () => void | Promise<unknown>;
}) {
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const teammates = people.filter((person) => person.team_id === teamId && person.id !== actor.profileId);
  const teamCredits = credits.filter((credit) => credit.team_id === teamId);
  const lifetime = (profileId: string) => creditTotals.find((total) => total.profile_id === profileId)?.lifetime_points ?? 0;

  async function submitCommendation() {
    if (!recipient || !reason.trim()) return;
    setBusy(true);
    try {
      const awarded = await commendTeamMember(recipient, reason);
      await onChanged();
      toast.success(awarded ? `Commendation awarded: +${awarded} credit` : "Commendation recorded; the credit cap is already reached");
      setRecipient("");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit commendation.");
    } finally {
      setBusy(false);
    }
  }

  async function adjust(profileId: string) {
    const raw = window.prompt("Enter a positive or negative credit adjustment (for example, 2 or -1):");
    if (!raw) return;
    const points = Number(raw);
    if (!Number.isInteger(points) || points === 0) { toast.error("Enter a non-zero whole number."); return; }
    const adjustmentReason = window.prompt("Why is this correction needed?")?.trim();
    if (!adjustmentReason) return;
    setBusy(true);
    try {
      const applied = await correctTeamCredit(profileId, points, adjustmentReason);
      await onChanged();
      toast.success(applied === points ? "Credit correction recorded" : `Credit correction limited to ${applied} by the team cap`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not correct credits.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Award className="size-4 text-primary" />
        <div><h2 className="font-display text-sm font-semibold">Team credits</h2><p className="text-xs text-muted-foreground">Lifetime contribution credits for recognition and review conversations.</p></div>
      </div>
      {actor.role === "member" && teammates.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div className="space-y-1.5"><Label>Recognize a teammate</Label><Select value={recipient} onValueChange={setRecipient}><SelectTrigger><SelectValue placeholder="Choose teammate" /></SelectTrigger><SelectContent>{teammates.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="commend-reason">What did they do?</Label><Textarea id="commend-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Add a short reason for this commendation" className="min-h-10" /></div>
          <Button onClick={submitCommendation} disabled={busy || !recipient || !reason.trim()}><Send className="size-4" /> Commend</Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {people.filter((person) => person.team_id === teamId).map((person) => (
          <div key={person.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <span className="truncate text-sm">{person.full_name}</span>
            <span className="shrink-0 font-display text-lg font-semibold">{lifetime(person.id)} <span className="text-xs font-normal text-muted-foreground">credits</span></span>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent credit history</h3>
        {teamCredits.slice(0, 8).length ? teamCredits.slice(0, 8).map((credit) => (
          <div key={credit.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t pt-2 text-sm">
            <div className="min-w-0"><p className="font-medium">{nameOf(people, credit.profile_id)} <span className="text-muted-foreground">· {credit.reason}</span></p><p className="text-xs text-muted-foreground">{credit.source === "task" ? "Task credit" : credit.source === "commendation" ? `Commended by ${nameOf(people, credit.awarded_by)}` : `Correction by ${nameOf(people, credit.awarded_by)}`} · {formatDateTime(credit.created_at)}</p></div>
            <span className={credit.points > 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>{credit.points > 0 ? "+" : ""}{credit.points}</span>
            {actor.role === "admin" || actor.role === "super_admin" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => adjust(credit.profile_id)}>Correct</Button> : null}
          </div>
        )) : <p className="text-sm text-muted-foreground">No credits yet. Task completions and commendations will appear here.</p>}
      </div>
    </section>
  );
}
