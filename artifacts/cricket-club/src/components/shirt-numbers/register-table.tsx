import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { ShirtNumberWarning } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin-ui";
import { cn } from "@/lib/utils";
import type { RegisterEntryView } from "./api";

export type SaveOutcome =
  | { ok: true; warnings: ShirtNumberWarning[] }
  | { ok: false; message: string; warnings?: ShirtNumberWarning[] };

const NUMBER_RE = /^[0-9]{1,3}$/;

const SOURCE_LABEL: Record<RegisterEntryView["source"], string> = {
  upload: "Upload",
  registration: "Registration",
  lineup: "Team list",
  admin: "Admin",
  rollover: "Carried forward",
};

type FilterId = "linked" | "held" | "unnumbered" | "duplicates";

/**
 * A season's register (R9, R11, R16): search, Linked / Held / Unnumbered /
 * Duplicates filters, inline keyboard-operable number editing (Enter saves,
 * Escape cancels), text duplicate badges, and a "Link to player" control on
 * held rows. Rows stack into cards on narrow screens.
 *
 * `onSaveNumber` resolves to the outcome so a refused save (a block-policy
 * 409) keeps the edit open with the typed value and the server's message.
 */
export function ShirtNumberRegisterTable({
  entries,
  supportsHeld,
  onSaveNumber,
  onDelete,
  renderLinkControl,
  toolbarAction,
  label = "Shirt number register",
}: {
  entries: readonly RegisterEntryView[];
  supportsHeld: boolean;
  onSaveNumber: (entry: RegisterEntryView, number: string | null) => Promise<SaveOutcome>;
  onDelete?: (entry: RegisterEntryView) => void;
  /** The link picker for a held row; `done` closes it. Omit to hide "Link to player". */
  renderLinkControl?: (entry: RegisterEntryView, done: () => void) => ReactNode;
  toolbarAction?: ReactNode;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId | null>(null);
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Focus the number field when an edit opens (keyboard users land in it).
  const focusOnMount = useCallback((el: HTMLInputElement | null) => el?.focus(), []);
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const filters = useMemo<
    { id: FilterId; label: string; predicate: (e: RegisterEntryView) => boolean }[]
  >(
    () => [
      ...(supportsHeld
        ? [
            {
              id: "linked" as const,
              label: "Linked",
              predicate: (e: RegisterEntryView) => !e.held,
            },
            { id: "held" as const, label: "Held", predicate: (e: RegisterEntryView) => e.held },
          ]
        : []),
      { id: "unnumbered", label: "No number", predicate: (e) => e.number === null },
      { id: "duplicates", label: "Duplicates", predicate: (e) => e.duplicate },
    ],
    [supportsHeld],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = filters.find((f) => f.id === filter);
    return entries
      .filter((e) => !active || active.predicate(e))
      .filter((e) => !q || `${e.name} ${e.number ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const an = a.number === null ? Infinity : parseInt(a.number, 10);
        const bn = b.number === null ? Infinity : parseInt(b.number, 10);
        return an - bn || a.name.localeCompare(b.name);
      });
  }, [entries, query, filter, filters]);

  const startEdit = (e: RegisterEntryView) => {
    setEditing({ id: e.id, value: e.number ?? "" });
    setEditError(null);
    setLinkingId(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setEditError(null);
  };
  const save = async (e: RegisterEntryView) => {
    if (!editing || saving) return;
    const value = editing.value.trim();
    if (value !== "" && !NUMBER_RE.test(value)) {
      setEditError("Use 1 to 3 digits, or leave it empty to clear the number.");
      return;
    }
    const next = value === "" ? null : value;
    if (next === e.number) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const outcome = await onSaveNumber(e, next);
      if (outcome.ok) cancelEdit();
      else setEditError(outcome.message);
    } finally {
      setSaving(false);
    }
  };
  const onEditKey = (ev: KeyboardEvent<HTMLInputElement>, e: RegisterEntryView) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      void save(e);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cancelEdit();
    }
  };

  const cellLabel = (text: string) => (
    <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
      {text}
    </span>
  );
  const td = "flex items-center gap-2 px-4 py-1.5 md:table-cell md:py-2 md:align-middle";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or number…"
            aria-label="Filter by name or number"
            className="h-10 pl-9"
          />
        </div>
        {filters.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : f.id)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary-text"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          );
        })}
        {toolbarAction && <div className="ml-auto">{toolbarAction}</div>}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <table className="block w-full border-collapse text-sm md:table" aria-label={label}>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border">
              {["No.", "Name", "Player", "Source", ""].map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {visible.length === 0 ? (
              <tr className="block md:table-row">
                <td
                  colSpan={5}
                  className="block px-4 py-10 text-center text-muted-foreground md:table-cell"
                >
                  {entries.length === 0
                    ? "No one is on this season's register yet."
                    : "No entries match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((e) => {
                const isEditing = editing?.id === e.id;
                return (
                  <tr
                    key={e.id}
                    className="block border-b border-border py-2 last:border-b-0 md:table-row md:py-0"
                  >
                    <td className={cn(td, "md:w-40")}>
                      {cellLabel("No.")}
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <Input
                              ref={focusOnMount}
                              inputMode="numeric"
                              maxLength={3}
                              value={editing.value}
                              aria-label={`Number for ${e.name}`}
                              aria-invalid={editError ? true : undefined}
                              aria-describedby={editError ? `shirt-edit-error-${e.id}` : undefined}
                              readOnly={saving}
                              onChange={(ev) => setEditing({ id: e.id, value: ev.target.value })}
                              onKeyDown={(ev) => onEditKey(ev, e)}
                              className="h-9 w-16 tabular-nums"
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={saving}
                              onClick={() => void save(e)}
                            >
                              {saving ? "Saving…" : "Save"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </div>
                          {editError && (
                            <p
                              id={`shirt-edit-error-${e.id}`}
                              role="alert"
                              className="max-w-xs text-xs text-destructive"
                            >
                              {editError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            aria-label={`Edit number for ${e.name}`}
                            className="min-w-12 rounded-md border border-transparent px-2 py-1 text-left font-bold tabular-nums hover:border-border focus-visible:border-ring focus-visible:outline-none"
                          >
                            {e.number !== null ? (
                              `#${e.number}`
                            ) : (
                              <span className="font-normal italic text-muted-foreground">None</span>
                            )}
                          </button>
                          {e.duplicate && <StatusPill tone="danger">Duplicate</StatusPill>}
                        </div>
                      )}
                    </td>
                    <td className={td}>
                      {cellLabel("Name")}
                      <span className="font-semibold">{e.name}</span>
                    </td>
                    <td className={td}>
                      {cellLabel("Player")}
                      {e.held ? (
                        <StatusPill tone="attention">Held</StatusPill>
                      ) : (
                        <span className="flex items-center gap-2">
                          <StatusPill tone="success">Linked</StatusPill>
                          {e.playerName && e.playerName !== e.name && (
                            <span className="text-muted-foreground">{e.playerName}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {cellLabel("Source")}
                      <span className="text-muted-foreground">{SOURCE_LABEL[e.source]}</span>
                    </td>
                    <td className={cn(td, "flex-wrap md:text-right")}>
                      {supportsHeld && e.held && renderLinkControl && (
                        <>
                          {linkingId === e.id ? (
                            <div className="w-full text-left md:w-72">
                              {renderLinkControl(e, () => setLinkingId(null))}
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setLinkingId(e.id);
                                cancelEdit();
                              }}
                            >
                              Link to player
                            </Button>
                          )}
                        </>
                      )}
                      {onDelete && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Remove ${e.name}`}
                          onClick={() => onDelete(e)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
