import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useMarkNotificationsRead,
  type NotificationList,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * The admin notification bell (Social Studio KTD5): an unread count, and a
 * list of recent notifications that are marked read when the bell opens.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const listQ = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: (data) => qc.setQueryData(getListNotificationsQueryKey(), data),
    },
  });
  const data = listQ.data as NotificationList | undefined;
  const unread = data?.unreadCount ?? 0;
  // Show what was unread at the moment of opening, even once marked read.
  const [shown, setShown] = useState<NotificationList["items"]>([]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setShown(data?.items ?? []);
          if (unread > 0) markRead.mutate();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</div>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {shown.map((n) => {
              const inner = (
                <>
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{ago(n.createdAt)}</p>
                </>
              );
              return (
                <li key={n.id} className={n.readAt ? undefined : "bg-primary/5"}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-muted/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
