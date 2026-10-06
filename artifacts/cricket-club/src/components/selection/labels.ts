import type {
  SelectionEvent,
  SelectionGapReason,
  SelectionMemberStatus,
} from "@workspace/api-client-react";

/** Availability as glyph, words and colour (R22): never colour alone. */
export const STATUS: Record<
  SelectionMemberStatus,
  { glyph: string; label: string; mark: string; bar: string }
> = {
  yes: {
    glyph: "✓",
    label: "Available",
    mark: "bg-[var(--win-bg)] text-[var(--win-fg)]",
    bar: "bg-[var(--win-fg)]",
  },
  maybe: {
    glyph: "?",
    label: "Maybe",
    mark: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  no: {
    glyph: "✕",
    label: "Unavailable",
    mark: "bg-[var(--loss-bg)] text-[var(--loss-fg)]",
    bar: "bg-[var(--loss-fg)]",
  },
  none: {
    glyph: "…",
    label: "No reply",
    mark: "border-[1.5px] border-dashed border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300",
    bar: "bg-violet-500",
  },
};

export const STATUS_ORDER: SelectionMemberStatus[] = ["yes", "maybe", "no", "none"];

/** The reason half of an open slot's "was <name> · <reason>" (R17). */
export const GAP_REASON: Record<SelectionGapReason, string> = {
  no: "unavailable",
  maybe: "said Maybe",
  no_reply: "no reply",
  not_on_register: "not on register",
  withdrew: "can't make it",
};

const PERTH = "Australia/Perth";

/** "Mon 13 Oct, 6:00pm" in Perth time. */
export function perthDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-AU", {
    timeZone: PERTH,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${date}, ${perthTime(iso)}`;
}

/** "6:00pm" in Perth time. */
export function perthTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-AU", { timeZone: PERTH, hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "")
    .toLowerCase();
}

/** "weekend of 18–19 Oct 2026" from the round's Saturday (YYYY-MM-DD). */
export function weekendLabel(saturday: string): string {
  const [y, m, d] = saturday.split("-").map(Number);
  if (!y || !m || !d) return saturday;
  const sat = new Date(Date.UTC(y, m - 1, d));
  const sun = new Date(Date.UTC(y, m - 1, d + 1));
  const month = (x: Date) => x.toLocaleDateString("en-AU", { timeZone: "UTC", month: "short" });
  const left = month(sat) === month(sun) ? `${d}` : `${d} ${month(sat)}`;
  return `weekend of ${left}–${sun.getUTCDate()} ${month(sun)} ${sun.getUTCFullYear()}`;
}

type Named = { id?: number; name?: string } | null | undefined;
type RoleChange = { from?: Named; to?: Named } | undefined;

const names = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (x && typeof x === "object" ? (x as { name?: unknown }).name : undefined))
        .filter((n): n is string => typeof n === "string")
    : [];

/** One change-log line for a board event (R29). */
export function eventText(e: SelectionEvent): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const g = e.grade || "A side";
  switch (e.action) {
    case "draft":
      return `${g} draft built from the side's last game`;
    case "finalise": {
      const n = typeof d.players === "number" ? d.players : null;
      return n != null ? `${g} finalised with ${n} players` : `${g} finalised`;
    }
    case "reopen":
      return `${g} re-opened for changes`;
    case "withdraw": {
      const who = typeof d.name === "string" ? d.name : "A player";
      return `${who} can't make it; their ${g} slot is open again`;
    }
    case "update": {
      const bits: string[] = [];
      const added = names(d.added);
      const removed = names(d.removed);
      if (added.length) bits.push(`${added.join(", ")} in`);
      if (removed.length) bits.push(`${removed.join(", ")} out`);
      if (d.reordered) bits.push("order changed");
      const cleared = new Set(
        Array.isArray(d.rolesCleared)
          ? (d.rolesCleared as { role?: string }[]).map((r) => r.role)
          : [],
      );
      for (const [key, word] of [
        ["captain", "captain"],
        ["keeper", "keeper"],
      ] as const) {
        const c = d[key] as RoleChange;
        if (!c) continue;
        if (c.to?.name) bits.push(`${c.to.name} named ${word}`);
        else if (cleared.has(key))
          bits.push(`no ${word} (${c.from?.name ?? "holder"} left the side)`);
        else bits.push(`${word} cleared`);
      }
      return bits.length ? `${g}: ${bits.join("; ")}` : `${g} updated`;
    }
    default:
      return `${g} ${e.action}`;
  }
}
