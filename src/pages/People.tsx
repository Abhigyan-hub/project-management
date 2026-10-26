import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { savePerson, deletePerson, setPersonActive, type Actor } from "@/lib/mutations";
import { fetchWorkspace, formatDate, type Person } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const NO_TEAM = "__none__";

export default function PeoplePage() {
  useDocumentTitle(
    "People — Northlight",
    "Directory of every person in the organisation with contact details, department and team assignment.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => <PeopleContent actor={user} />}
    </AuthGate>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PeopleContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [search, setSearch] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const people = data?.people ?? [];
  const teams = data?.teams ?? [];

  const filtered = useMemo(
    () =>
      people.filter((p) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          p.full_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q)
        );
      }),
    [people, search],
  );

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="People"
      subtitle="Everyone in the organisation, at a glance"
      actions={
        <PersonFormDialog
          actor={actor}
          teams={teams}
          onSaved={refresh}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> Add person
            </Button>
          }
        />
      }
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-4">
          <div className="panel flex items-center gap-2 p-3">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="panel overflow-x-auto p-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                            {initials(person.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{person.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {person.job_title ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {person.department ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {teams.find((t) => t.id === person.team_id)?.name ?? "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          person.is_active
                            ? "border-emerald-500/40 text-emerald-500"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }
                      >
                        {person.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(person.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title={person.is_active ? "Deactivate" : "Activate"}
                          onClick={async () => {
                            await setPersonActive(
                              actor,
                              person.id,
                              person.full_name,
                              !person.is_active,
                            );
                            await refresh();
                            toast.success(
                              person.is_active ? "Person deactivated" : "Person activated",
                            );
                          }}
                        >
                          {person.is_active ? (
                            <UserX className="size-4 text-amber-500" />
                          ) : (
                            <UserCheck className="size-4 text-emerald-500" />
                          )}
                        </Button>
                        <PersonFormDialog
                          actor={actor}
                          teams={teams}
                          person={person}
                          onSaved={refresh}
                          trigger={
                            <Button size="icon" variant="ghost" title="Edit">
                              <Pencil className="size-4" />
                            </Button>
                          }
                        />
                        <ConfirmDelete
                          title="Remove person"
                          description={`"${person.full_name}" will be removed from the organisation.`}
                          onConfirm={async () => {
                            await deletePerson(actor, person.id, person.full_name);
                            await refresh();
                            toast.success("Person removed");
                          }}
                          trigger={
                            <Button size="icon" variant="ghost" title="Remove">
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No one matches this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PersonFormDialog({
  actor,
  teams,
  person,
  onSaved,
  trigger,
}: {
  actor: Actor;
  teams: { id: string; name: string }[];
  person?: Person;
  onSaved: () => void | Promise<void>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState(person?.full_name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [jobTitle, setJobTitle] = useState(person?.job_title ?? "");
  const [department, setDepartment] = useState(person?.department ?? "");
  const [teamId, setTeamId] = useState(person?.team_id ?? NO_TEAM);

  function reset() {
    setFullName(person?.full_name ?? "");
    setEmail(person?.email ?? "");
    setJobTitle(person?.job_title ?? "");
    setDepartment(person?.department ?? "");
    setTeamId(person?.team_id ?? NO_TEAM);
  }

  async function handleSave() {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      await savePerson(
        actor,
        {
          id: person?.id,
          full_name: fullName.trim(),
          email: email.trim(),
          job_title: jobTitle.trim() || null,
          department: department.trim() || null,
          team_id: teamId === NO_TEAM ? null : teamId,
          is_active: person?.is_active ?? true,
        },
        person?.role ?? "member",
      );
      toast.success(person ? "Person updated" : "Person added");
      await onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this person.");
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
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>
            {person
              ? "Update this person's details and team assignment."
              : "New people are added as team members — promote them from User management if needed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Full name</Label>
            <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-email">Email</Label>
            <Input
              id="p-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-title">Job title</Label>
              <Input id="p-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-dept">Department</Label>
              <Input
                id="p-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="No team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>Unassigned</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {person ? "Save changes" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
