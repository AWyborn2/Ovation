import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { AdminNavGroup } from "@/lib/admin-nav";

/**
 * Jump to any admin page (⌘K / Ctrl+K). Lists every group and tab the
 * tenant's plan includes; choosing one navigates there.
 */
export function AdminJumpTo({
  nav,
  open,
  onOpenChange,
}: {
  nav: AdminNavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to…" />
      <CommandList>
        <CommandEmpty>No admin page matches.</CommandEmpty>
        {nav.map((group) =>
          group.tabs.length === 0 ? (
            <CommandGroup key={group.key} heading={group.label}>
              <CommandItem value={group.label} onSelect={() => go(group.href)}>
                <group.icon className="mr-2 h-4 w-4" aria-hidden />
                {group.label}
              </CommandItem>
            </CommandGroup>
          ) : (
            <CommandGroup key={group.key} heading={group.label}>
              {group.tabs.map((tab) => (
                <CommandItem
                  key={tab.path}
                  value={`${group.label} ${tab.label}`}
                  onSelect={() => go(tab.path)}
                >
                  <group.icon className="mr-2 h-4 w-4" aria-hidden />
                  {tab.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ),
        )}
      </CommandList>
    </CommandDialog>
  );
}
