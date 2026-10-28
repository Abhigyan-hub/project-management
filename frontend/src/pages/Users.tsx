import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ADMIN_ROLES, AuthGate } from "@/components/auth-gate";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deletePerson, setPersonActive, setPersonRole, type Actor } from "@/lib/mutations";
import { fetchWorkspace, type AppRole } from "@/lib/workspace";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  team_leader: "Team Leader",
  member: "Member",
};

const ROLE_ORDER: AppRole[] = ["super_admin", "admin", "team_leader", "member"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function UsersPage() {
  useDocumentTitle(
    "User management — Northlight",
    "Manage roles, access and account status for every person in the organisation.",
  );

  return (
    <AuthGate allow={ADMIN_ROLES} portal="admin">
      {(user) => <UsersContent actor={user} />}
    </AuthGate>
  );
}

function UsersContent({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const [pending, setPending] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace"] });
  const people = data?.people ?? [];

  return (
    <AppShell
      userName={actor.name}
      role={actor.role}
      title="User management"
      subtitle="Roles, access and account status"
    >
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-4">
          <div className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Changing a role here takes effect immediately — the person will see the new
              portal and permissions next time they load the app.
            </p>
          </div>

          <div className="panel overflow-x-auto p-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const isSelf = person.id === actor.profileId;
                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                              {initials(person.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {person.full_name}
                              {isSelf && (
                                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {person.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={person.role}
                          disabled={isSelf || pending === person.id}
                          onValueChange={async (value) => {
                            setPending(person.id);
                            await setPersonRole(actor, person.id, person.full_name, value as AppRole);
                            await refresh();
                            setPending(null);
                            toast.success(`${person.full_name} is now ${ROLE_LABEL[value as AppRole]}`);
                          }}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_ORDER.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={person.is_active}
                            disabled={isSelf}
                            onCheckedChange={async (checked) => {
                              await setPersonActive(actor, person.id, person.full_name, checked);
                              await refresh();
                              toast.success(checked ? "Account activated" : "Account deactivated");
                            }}
                          />
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
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <ConfirmDelete
                            title="Delete account"
                            description={`"${person.full_name}" will lose access immediately and be removed from the organisation.`}
                            onConfirm={async () => {
                              await deletePerson(actor, person.id, person.full_name);
                              await refresh();
                              toast.success("Account deleted");
                            }}
                            trigger={
                              <Button size="icon" variant="ghost" title="Delete" disabled={isSelf}>
                                <Trash2 className="size-4 text-red-500" />
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
