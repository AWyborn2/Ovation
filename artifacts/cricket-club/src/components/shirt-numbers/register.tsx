import { useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ShirtNumberSettings,
  ShirtNumberSquadAddResult,
  ShirtNumberWarning,
} from "@workspace/api-client-react";
import { Plus, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditDrawer } from "@/components/admin-ui";
import { QueryError, TableSkeleton } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import {
  conflictOf,
  errorMessage,
  type PickedPerson,
  type RegisterEntryView,
  type ShirtNumberRegisterApi,
} from "./api";
import { ShirtNumberRegisterTable, type SaveOutcome } from "./register-table";
import { ShirtNumberUploadPanel } from "./upload-panel";
import { StartSeasonDialog, startSeasonLabel } from "./start-season-dialog";
import { AddSquadDialog, squadAddSummary } from "./add-squad-dialog";
import { countSeasonStart, currentSeasonStartYear, seasonLabel, seasonOptions } from "./season";
import { isValidShirtNumber } from "./values";
import type { PersonPickerProps } from "./person-picker";
import { invalidateTeamListCarouselSources } from "@/lib/team-list-carousel-cache";

/**
 * A side's whole register screen (R4, R5, R7–R9, R11, F1, F4): season picker
 * (defaulting to the current season), the register table, add person,
 * "Start season" by rollover policy, "Add squad to register" from the club's
 * squad register, and the number-spreadsheet upload. Side-agnostic: the
 * senior page passes `seniorShirtNumberApi` and `SeniorPersonPicker`; a
 * juniors page passes its own adapter and participant picker.
 */
export function ShirtNumberRegister({
  api,
  settings,
  initialSeason,
  PersonPicker,
  requirePerson = false,
}: {
  api: ShirtNumberRegisterApi;
  settings: ShirtNumberSettings;
  /** Defaults to the current season (July–June, Perth time). */
  initialSeason?: number;
  /** Picker for the add form and, on sides with held entries, "Link to player". */
  PersonPicker?: ComponentType<PersonPickerProps>;
  /** The add form needs a picked person (juniors key on a participant). */
  requirePerson?: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const current = currentSeasonStartYear();
  const [season, setSeason] = useState(initialSeason ?? current);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ShirtNumberWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [addingSquad, setAddingSquad] = useState(false);
  const [squadResult, setSquadResult] = useState<ShirtNumberSquadAddResult | null>(null);

  const register = useQuery({
    queryKey: api.registerQueryKey(season),
    queryFn: () => api.fetchRegister(season),
  });
  const carry = settings.rolloverPolicy === "carry";
  const previous = useQuery({
    queryKey: api.registerQueryKey(season - 1),
    queryFn: () => api.fetchRegister(season - 1),
    enabled: carry,
  });

  const invalidate = (...seasons: number[]) => {
    for (const s of seasons.length ? seasons : [season]) {
      void queryClient.invalidateQueries({ queryKey: api.registerQueryKey(s) });
    }
    if (api.side === "senior") void invalidateTeamListCarouselSources(queryClient);
  };
  const report = (message: string | null, w: ShirtNumberWarning[] = []) => {
    setError(null);
    setNotice(message);
    setWarnings(w);
  };

  const start = useMutation({ mutationFn: api.startSeason });
  const addSquad = useMutation({ mutationFn: api.addSquad });
  const remove = useMutation({ mutationFn: api.deleteEntry });

  const entries = register.data?.entries ?? [];
  const options = seasonOptions(register.data?.seasons ?? [], current);
  const startCount = !carry
    ? 0
    : register.data && previous.data
      ? countSeasonStart(previous.data.entries, register.data.entries, settings.rolloverPolicy)
      : null;

  const onSaveNumber = async (
    entry: RegisterEntryView,
    number: string | null,
  ): Promise<SaveOutcome> => {
    try {
      const res = await api.updateEntry(entry.id, { number });
      invalidate();
      report(
        number === null ? `Cleared ${entry.name}'s number.` : `${entry.name} now wears #${number}.`,
        res.warnings,
      );
      return { ok: true, warnings: res.warnings };
    } catch (e) {
      const c = conflictOf(e);
      return { ok: false, message: c ? c.error : errorMessage(e), warnings: c?.warnings };
    }
  };

  const onLink = async (entry: RegisterEntryView, person: PickedPerson) => {
    try {
      const res = await api.updateEntry(entry.id, {
        playerId: person.playerId ?? null,
        ...(person.participantId ? { participantId: person.participantId } : {}),
      });
      invalidate();
      report(`Linked ${entry.name} to ${person.name}.`, res.warnings);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async (entry: RegisterEntryView) => {
    if (
      !(await confirm({
        title: "Remove from register",
        description: `Remove ${entry.name}${entry.number ? ` (#${entry.number})` : ""} from the ${seasonLabel(season)} register?`,
        confirmText: "Remove",
        destructive: true,
      }))
    )
      return;
    remove.mutate(entry.id, {
      onSuccess: () => {
        invalidate();
        report(`Removed ${entry.name}.`);
      },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  const onStart = () => {
    start.mutate(season, {
      onSuccess: (res) => {
        setStarting(false);
        invalidate(season, res.fromSeason);
        report(
          res.created === 0
            ? `Nothing to carry forward into ${seasonLabel(res.season)}.`
            : `Started ${seasonLabel(res.season)}: ${res.created} added from ${seasonLabel(res.fromSeason)} (${res.numbered} with numbers).`,
          res.warnings,
        );
      },
      onError: (e) => {
        setStarting(false);
        setError(errorMessage(e));
      },
    });
  };

  const onAddSquad = () => {
    addSquad.mutate(season, {
      onSuccess: (res) => {
        setSquadResult(res);
        invalidate(res.season);
        report(
          `Squad added to ${seasonLabel(res.season)}: ${squadAddSummary(res)}` +
            (res.unmatched.length > 0 ? ` ${res.unmatched.length} not matched.` : ""),
          res.warnings,
        );
      },
      onError: (e) => {
        setAddingSquad(false);
        setError(errorMessage(e));
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`shirt-season-${api.side}`}>Season</Label>
        <select
          id={`shirt-season-${api.side}`}
          value={season}
          onChange={(e) => {
            setSeason(parseInt(e.target.value, 10));
            report(null);
            setUploading(false);
          }}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium"
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
              {s === current ? " (current)" : ""}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? "person" : "people"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={start.isPending || !register.data}
            onClick={() => setStarting(true)}
          >
            {startSeasonLabel(settings.rolloverPolicy, season - 1)}
          </Button>
          <Button
            variant="outline"
            disabled={addSquad.isPending || !register.data}
            onClick={() => {
              setSquadResult(null);
              setAddingSquad(true);
            }}
          >
            <Users className="mr-1.5 h-4 w-4" aria-hidden />
            Add squad to register
          </Button>
          <Button
            variant="outline"
            aria-expanded={uploading}
            onClick={() => setUploading((u) => !u)}
          >
            <Upload className="mr-1.5 h-4 w-4" aria-hidden />
            {uploading ? "Close upload" : "Upload file"}
          </Button>
        </div>
      </div>

      {(notice || warnings.length > 0) && (
        <div role="status" className="space-y-1 text-sm">
          {notice && <p className="m-0 text-[var(--win-fg)]">{notice}</p>}
          {warnings.map((w, i) => (
            <p key={`${w.number}-${i}`} className="m-0 font-medium text-foreground">
              Warning: {w.message}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {uploading && (
        <ShirtNumberUploadPanel
          api={api}
          season={season}
          onCommitted={(res) => {
            setUploading(false);
            invalidate();
            report(
              `Upload applied: ${res.created} added, ${res.updated} updated, ${res.linked} linked, ${res.held} held, ${res.discarded} discarded.`,
              res.warnings,
            );
          }}
        />
      )}

      {register.isError ? (
        <QueryError onRetry={() => register.refetch()} />
      ) : register.isLoading ? (
        <TableSkeleton />
      ) : (
        <ShirtNumberRegisterTable
          label={`${seasonLabel(season)} shirt number register`}
          entries={entries}
          supportsHeld={api.supportsHeld}
          onSaveNumber={onSaveNumber}
          onDelete={(e) => void onDelete(e)}
          renderLinkControl={
            api.supportsHeld && PersonPicker
              ? (entry, done) => (
                  <div className="space-y-1">
                    <PersonPicker
                      value={null}
                      onChange={(p) => {
                        if (!p) return;
                        done();
                        void onLink(entry, p);
                      }}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={done}>
                      Cancel
                    </Button>
                  </div>
                )
              : undefined
          }
          toolbarAction={
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add person
            </Button>
          }
        />
      )}

      <EditDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add to register"
        description={seasonLabel(season)}
      >
        {adding && (
          <AddEntryForm
            PersonPicker={PersonPicker}
            requirePerson={requirePerson}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              try {
                const res = await api.createEntry({ ...values, season });
                setAdding(false);
                invalidate();
                report(`Added ${values.name} to ${seasonLabel(season)}.`, res.warnings);
                return null;
              } catch (e) {
                const c = conflictOf(e);
                return c ? c.error : errorMessage(e);
              }
            }}
          />
        )}
      </EditDrawer>

      <StartSeasonDialog
        open={starting}
        onOpenChange={setStarting}
        fromSeason={season - 1}
        toSeason={season}
        count={startCount}
        rolloverPolicy={settings.rolloverPolicy}
        pending={start.isPending}
        onConfirm={onStart}
      />

      <AddSquadDialog
        open={addingSquad}
        onOpenChange={setAddingSquad}
        side={api.side}
        season={season}
        pending={addSquad.isPending}
        result={squadResult}
        onConfirm={onAddSquad}
      />
    </div>
  );
}

function AddEntryForm({
  PersonPicker,
  requirePerson,
  onSubmit,
  onCancel,
}: {
  PersonPicker?: ComponentType<PersonPickerProps>;
  requirePerson: boolean;
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (values: PickedPerson & { number: string | null }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const displayName = name.trim() || person?.name || "";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = number.trim();
    if (n !== "" && !isValidShirtNumber(n)) {
      setError("Use 1 to 3 digits, or leave the number empty.");
      return;
    }
    if (!displayName || (requirePerson && !person)) return;
    setPending(true);
    setError(null);
    const message = await onSubmit({
      name: displayName,
      playerId: person?.playerId ?? null,
      participantId: person?.participantId ?? null,
      number: n === "" ? null : n,
    });
    setPending(false);
    if (message) setError(message);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {PersonPicker && (
        <div className="space-y-1">
          <Label>{requirePerson ? "Player" : "Player (optional)"}</Label>
          <PersonPicker value={person} onChange={setPerson} />
          {!requirePerson && (
            <p className="text-xs text-muted-foreground">
              Leave empty to add someone who hasn't played yet; they stay held until they do.
            </p>
          )}
        </div>
      )}
      {!requirePerson && (
        <div className="space-y-1">
          <Label htmlFor="shirt-add-name">Name</Label>
          <Input
            id="shirt-add-name"
            value={name}
            placeholder={person?.name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="shirt-add-number">Number</Label>
        <Input
          id="shirt-add-number"
          inputMode="numeric"
          maxLength={3}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-24 tabular-nums"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !displayName || (requirePerson && !person)}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
