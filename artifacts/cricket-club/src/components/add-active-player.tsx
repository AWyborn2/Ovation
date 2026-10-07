import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSelectionBoardQueryKey,
  getListSelectionRosterQueryKey,
  getListSquadMembersQueryKey,
  getSearchSquadPlayersQueryKey,
  useActivateSquadMember,
  useCreateSquadMember,
  useListSelectionRoster,
  useSearchSquadPlayers,
  type SquadContactUpdate,
  type SquadMemberInput,
  type SquadPlayerSearchHit,
  type SquadSection,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function errText(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return (e as Error)?.message || "Something went wrong. Try again.";
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const clean = (c: SquadContactUpdate): SquadContactUpdate | undefined => {
  const out: SquadContactUpdate = {};
  if (c.name?.trim()) out.name = c.name.trim();
  if (c.mobile?.trim()) out.mobile = c.mobile.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  return Object.keys(out).length ? out : undefined;
};

function ContactFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: SquadContactUpdate;
  onChange: (c: SquadContactUpdate) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          aria-label={`${legend} name`}
          placeholder="Name"
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <Input
          aria-label={`${legend} mobile`}
          placeholder="Mobile"
          inputMode="tel"
          value={value.mobile ?? ""}
          onChange={(e) => onChange({ ...value, mobile: e.target.value })}
        />
        <Input
          aria-label={`${legend} email`}
          placeholder="Email"
          type="email"
          value={value.email ?? ""}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

function AddForm({ onDone, defaultSection }: { onDone: () => void; defaultSection: SquadSection }) {
  const qc = useQueryClient();
  const roster = useListSelectionRoster();
  const activate = useActivateSquadMember();
  const create = useCreateSquadMember();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const params = { q };
  const search = useSearchSquadPlayers(params, {
    query: { enabled: q.length >= 2, queryKey: getSearchSquadPlayersQueryKey(params) },
  });
  const [picked, setPicked] = useState<SquadPlayerSearchHit | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [section, setSection] = useState<SquadSection>(defaultSection);
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");
  const [account, setAccount] = useState<SquadContactUpdate>({});
  const [g1, setG1] = useState<SquadContactUpdate>({});
  const [g2, setG2] = useState<SquadContactUpdate>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const inactive = useMemo(
    () => (roster.data ?? []).filter((m) => !m.active),
    [roster.data],
  );
  const matches = useMemo(() => {
    const t = q.toLowerCase();
    if (t.length < 2) return [];
    return inactive.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(t));
  }, [inactive, q]);
  const activeIds = useMemo(
    () => new Set((roster.data ?? []).filter((m) => m.active).map((m) => m.id)),
    [roster.data],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListSquadMembersQueryKey() });
    void qc.invalidateQueries({ queryKey: getListSelectionRosterQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSelectionBoardQueryKey() });
    void qc.invalidateQueries({ queryKey: ["/api/squad/player-search"] });
  };
  const finish = (msg: string) => {
    refresh();
    setDone(msg);
    setError(null);
    setQuery("");
    setPicked(null);
    setFirstName("");
    setLastName("");
    setDob("");
    setGrade("");
    setAccount({});
    setG1({});
    setG2({});
  };

  const reactivate = (id: number, name: string) => {
    setError(null);
    activate.mutate(
      { id },
      { onSuccess: () => finish(`${name} is active again.`), onError: (e) => setError(errText(e)) },
    );
  };

  const pickHit = (h: SquadPlayerSearchHit) => {
    if (h.alreadyLinkedTo) {
      if (activeIds.has(h.alreadyLinkedTo.memberId)) {
        setError(`${h.alreadyLinkedTo.name} is already active.`);
        return;
      }
      reactivate(h.alreadyLinkedTo.memberId, h.alreadyLinkedTo.name);
      return;
    }
    setPicked(h);
    const parts = h.displayName.trim().split(/\s+/);
    setFirstName(parts.slice(0, -1).join(" ") || parts[0] || "");
    setLastName(parts.length > 1 ? parts[parts.length - 1]! : "");
    setError(null);
    setDone(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const body: SquadMemberInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      section,
    };
    if (picked) body.linkedPlayerId = picked.playerId;
    if (dob) body.dateOfBirth = dob;
    if (grade.trim()) body.gradeHint = grade.trim();
    const a = clean(account);
    const c1 = clean(g1);
    const c2 = clean(g2);
    if (a) body.account = a;
    if (c1) body.guardian1 = c1;
    if (c2) body.guardian2 = c2;
    const name = `${body.firstName} ${body.lastName}`;
    create.mutate(
      { data: body },
      { onSuccess: () => finish(`${name} added to the active squad.`), onError: (e2) => setError(errText(e2)) },
    );
  };

  const noContact = !clean(account) && !clean(g1) && !clean(g2);
  const hits = q.length >= 2 ? (search.data ?? []) : [];

  return (
    <form onSubmit={submit} className="mt-4 space-y-4" data-testid="add-player-form">
      <div className="space-y-1.5">
        <Label htmlFor="add-player-search">Find a past or inactive player</Label>
        <Input
          id="add-player-search"
          autoComplete="off"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(matches.length > 0 || hits.length > 0) && (
          <ul className="divide-y rounded-md border text-sm" data-testid="add-player-results">
            {matches.map((m) => (
              <li key={`m${m.id}`} className="flex items-center justify-between gap-2 p-2">
                <span>
                  {m.firstName} {m.lastName}{" "}
                  <span className="text-xs text-muted-foreground">not active</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={activate.isPending}
                  onClick={() => reactivate(m.id, `${m.firstName} ${m.lastName}`)}
                >
                  Reactivate
                </Button>
              </li>
            ))}
            {hits.map((h) => (
              <li key={`h${h.playerId}`} className="flex items-center justify-between gap-2 p-2">
                <span>
                  {h.displayName}
                  {h.lastSeason && (
                    <span className="ml-2 text-xs text-muted-foreground">last played {h.lastSeason}</span>
                  )}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => pickHit(h)}>
                  {h.alreadyLinkedTo ? "Reactivate" : "Use"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {q.length >= 2 && !search.isFetching && matches.length === 0 && hits.length === 0 && (
          <p className="text-xs text-muted-foreground">No past players matched. Enter them below as new.</p>
        )}
        {picked && (
          <p className="text-xs" data-testid="add-player-linked">
            Linked to club player {picked.displayName}. Correct the name below if needed.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="add-first">First name</Label>
          <Input id="add-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-last">Last name</Label>
          <Input id="add-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-section">Section</Label>
          <select
            id="add-section"
            className={selectClass}
            value={section}
            onChange={(e) => setSection(e.target.value as SquadSection)}
          >
            <option value="senior">Senior</option>
            <option value="junior">Junior</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-grade">Grade (optional)</Label>
          <Input id="add-grade" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="add-dob">Date of birth (optional)</Label>
          <Input id="add-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          {!dob && (
            <p className="text-xs text-muted-foreground">
              Without a date of birth we can't confirm age, so messages go to the player's own
              contact only for seniors; for juniors add a parent or guardian contact.
            </p>
          )}
        </div>
      </div>

      <ContactFields legend={section === "junior" ? "Player contact" : "Contact"} value={account} onChange={setAccount} />
      <ContactFields legend="Parent or guardian 1" value={g1} onChange={setG1} />
      <ContactFields legend="Parent or guardian 2" value={g2} onChange={setG2} />
      {noContact && (
        <p className="text-xs text-muted-foreground" data-testid="add-player-nocontact">
          No contact details means no availability messages will be sent to this player. You can
          still pick them in the Selection Hub.
        </p>
      )}

      {error && (
        <div role="alert" data-testid="add-player-error" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {done && (
        <p role="status" className="text-sm" data-testid="add-player-done">
          {done}
        </p>
      )}
      {roster.isError && (
        <p className="text-xs text-destructive">
          Couldn't load the roster.{" "}
          <button type="button" className="underline" onClick={() => roster.refetch()}>
            Retry
          </button>
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add active player"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Close
        </Button>
      </div>
    </form>
  );
}

/** Shared "Add active player" button + drawer (Admin → Availability and Selection Hub). */
export function AddActivePlayer({
  section = "senior",
  variant = "outline",
}: {
  section?: SquadSection;
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)} data-testid="button-add-active-player">
        Add active player
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Add active player</SheetTitle>
            <SheetDescription>
              Reactivate someone, link a past club player, or add someone new.
            </SheetDescription>
          </SheetHeader>
          {open && <AddForm defaultSection={section} onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
