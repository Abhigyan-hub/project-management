import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users as UsersIcon, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { saveTeam, deleteTeam, setPersonTeam, type Actor } from "@/lib/mutations";
import { fetchWorkspace, nameOf, type Person, type Team } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const NO_LEADER = "__none__";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamsPage() {
  useDocumentTitle(
    "Teams — Northlight",
    "Create teams, assign a team leader and manage which people belong to each team.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => <TeamsContent actor={user} />}
    </AuthGate>
  );
}

function TeamsContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const teams = data?.teams ?? [];
  const people = data?.people ?? [];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="Teams"
      subtitle="Group people under a team leader"
      actions={
        <TeamFormDialog
          actor={actor}
          people={people}
          onSaved={refresh}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> New team
            </Button>
          }
        />
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const members = people.filter((p) => p.team_id === team.id);
            return (
              <div key={team.id} className="panel space-y-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-semibold">{team.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Led by {nameOf(people, team.leader_id)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <TeamFormDialog
                      actor={actor}
                      people={people}
                      team={team}
                      onSaved={refresh}
                      trigger={
                        <Button size="icon" variant="ghost" title="Edit team">
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    <ConfirmDelete
                      title="Delete team"
                      description={`"${team.name}" will be deleted. Members keep their accounts but become unassigned.`}
                      onConfirm={async () => {
                        await deleteTeam(actor, team.id, team.name);
                        await refresh();
                        toast.success("Team deleted");
                      }}
                      trigger={
                        <Button size="icon" variant="ghost" title="Delete team">
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      }
                    />
                  </div>
                </div>

                {team.description && (
                  <p className="text-sm text-muted-foreground">{team.description}</p>
                )}

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <UsersIcon className="size-3.5" /> Members ({members.length})
                  </p>
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  )}
                  <ul className="space-y-1.5">
                    {members.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                            {initials(m.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm">{m.full_name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          title={`Remove ${m.full_name}`}
                          onClick={async () => {
                            try {
                              await setPersonTeam(actor, m.id, m.full_name, null);
                              await refresh();
                              toast.success(`${m.full_name} removed from ${team.name}`);
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not remove this person.");
                            }
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>

                <AddMember
                  actor={actor}
                  team={team}
                  people={people}
                  teams={teams}
                  onSaved={refresh}
                />
              </div>
            );
          })}

          {!teams.length && (
            <div className="panel col-span-full p-10 text-center text-sm text-muted-foreground">
              No teams yet — create one to start organising people.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function AddMember({
  actor,
  team,
  people,
  teams,
  onSaved,
}: {
  actor: Actor;
  team: Team;
  people: Person[];
  teams: Team[];
  onSaved: () => void | Promise<unknown>;
}) {
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const candidates = people.filter((person) => person.team_id !== team.id);

  async function add(personId: string) {
    const person = people.find((item) => item.id === personId);
    if (!person) return;
    setBusy(true);
    try {
      await setPersonTeam(actor, person.id, person.full_name, team.id);
      await onSaved();
      toast.success(
        person.team_id
          ? `${person.full_name} moved to ${team.name}`
          : `${person.full_name} added to ${team.name}`,
      );
      setPickerKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this person.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <Label className="text-xs">Add a person to this team</Label>
      <Select key={pickerKey} onValueChange={add} disabled={busy || candidates.length === 0}>
        <SelectTrigger className="h-8">
          <SelectValue
            placeholder={candidates.length ? "Choose a person" : "Everyone is already on this team"}
          />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((person) => {
            const current = teams.find((item) => item.id === person.team_id);
            return (
              <SelectItem key={person.id} value={person.id}>
                {person.full_name}
                {current ? ` · ${current.name}` : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function TeamFormDialog({
  actor,
  people,
  team,
  onSaved,
  trigger,
}: {
  actor: Actor;
  people: Person[];
  team?: Team;
  onSaved: () => void | Promise<void>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [leaderId, setLeaderId] = useState(team?.leader_id ?? NO_LEADER);

  function reset() {
    setName(team?.name ?? "");
    setDescription(team?.description ?? "");
    setLeaderId(team?.leader_id ?? NO_LEADER);
  }

  const leaderOptions = people.filter((p) => p.role === "team_leader" || p.id === team?.leader_id);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Team name is required.");
      return;
    }
    setBusy(true);
    try {
      await saveTeam(actor, {
        id: team?.id,
        name: name.trim(),
        description: description.trim() || null,
        leader_id: leaderId === NO_LEADER ? null : leaderId,
      });
      toast.success(team ? "Team updated" : "Team created");
      await onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "New team"}</DialogTitle>
          <DialogDescription>
            Give the team a name, an optional description and a team leader.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="t-name">Team name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team own?"
            />
          </div>
          <div className="grid gap-2">
            <Label>Team leader</Label>
            <Select value={leaderId} onValueChange={setLeaderId}>
              <SelectTrigger>
                <SelectValue placeholder="No leader" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEADER}>Unassigned</SelectItem>
                {leaderOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!leaderOptions.length && (
              <p className="text-xs text-muted-foreground">
                No one has the Team Leader role yet — assign it from User management first.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {team ? "Save changes" : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
