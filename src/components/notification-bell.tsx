import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { db, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime, type Notification } from "@/lib/workspace";

export function useNotifications(profileId: string) {
  return useQuery({
    queryKey: ["notifications", profileId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const rows = await db(
        supabase
          .from("notifications")
          .select("*")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(50),
      );
      return (rows ?? []) as Notification[];
    },
  });
}

export function NotificationBell({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient();
  const { data = [] } = useNotifications(profileId);
  const unread = data.filter((n) => !n.read).length;

  async function markAllRead() {
    await db(
      supabase
        .from("notifications")
        .update({ read: true })
        .eq("profile_id", profileId)
        .eq("read", false),
    );
    queryClient.invalidateQueries({ queryKey: ["notifications", profileId] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {data.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          )}
          {data.map((n) => (
            <div
              key={n.id}
              className={`border-b border-border/60 px-3 py-2 text-sm last:border-0 ${
                n.read ? "text-muted-foreground" : ""
              }`}
            >
              <p>{n.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
