import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCardNamesQueryKey,
  getGetJuniorCardNamesQueryKey,
  getGetSocialSettingsQueryKey,
  useGetCardNames,
  useGetJuniorCardNames,
  useSetCardCompetitionLabel,
  useSetCardTeamCrest,
  useSetCardTeamName,
  useSetJuniorCardCompetitionLabel,
  useSetJuniorCardTeamCrest,
  useSetJuniorCardTeamName,
  type CardCompetitionLabel,
  type CardNamesListing,
  type CardTeamNameRow,
  type JuniorCardCompetitionLabel,
  type JuniorCardNamesListing,
  type JuniorCardTeamName,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RotateCcw } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { CrestBadge, CrestControl, type CrestChoiceUpdate } from "./crest-control";

/** The longest name a card takes (the API enforces it too). */
const MAX_NAME = 40;

/**
 * Team and competition names (ADR-010 P1). Square cards print a short name
 * for every team: the club's own, else an automatic one ("SJ Blues Senior
 * Women" → "SJ Blues"), with its crest. Here the club sees each name and crest
 * as cards print them and can change them once for every future card. A name
 * is saved when the field loses focus or on Enter; clearing it, or Reset, goes
 * back to the automatic name. Seniors and Juniors are separate lists, stored
 * apart: junior names only ever reach junior cards.
 */
export function CardNamesSection() {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-3" aria-labelledby="card-names-heading">
      <h2 id="card-names-heading" className="text-lg font-semibold">
        Team and competition names
      </h2>
      <p className="text-sm text-muted-foreground">
        The names and crests your cards print for each club and grade. Each one starts from
        PlayHQ&rsquo;s. Change one here and every new card uses it. Click a crest to upload your
        own, pick a known one, or use the initials badge.
      </p>
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="seniors" onValueChange={() => setError(null)}>
        <TabsList>
          <TabsTrigger value="seniors">Seniors</TabsTrigger>
          <TabsTrigger value="juniors">Juniors</TabsTrigger>
        </TabsList>
        <TabsContent value="seniors" className="mt-3">
          <SeniorNames onError={setError} />
        </TabsContent>
        <TabsContent value="juniors" className="mt-3">
          <JuniorNames onError={setError} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading names…
    </p>
  );
}

function LoadFailed() {
  return (
    <p className="text-sm text-destructive">Couldn&rsquo;t load the names. Try again shortly.</p>
  );
}

// ── Seniors ─────────────────────────────────────────────────────────────────

function SeniorNames({ onError }: { onError: (message: string | null) => void }) {
  const queryClient = useQueryClient();
  const namesQ = useGetCardNames();
  const onSaved = (listing: CardNamesListing) => {
    onError(null);
    queryClient.setQueryData(getGetCardNamesQueryKey(), listing);
    // Previews read the names from the settings bundle.
    void queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
  };
  const mutation = {
    onSuccess: onSaved,
    onError: (e: unknown) => onError(handleAdminMutationError(e)),
  };
  const teamM = useSetCardTeamName({ mutation });
  const crestM = useSetCardTeamCrest({ mutation });
  const compM = useSetCardCompetitionLabel({ mutation });
  const saving = teamM.isPending || crestM.isPending;

  const listing = namesQ.data;
  if (namesQ.isLoading) return <Loading />;
  if (namesQ.isError) return <LoadFailed />;
  if (!listing?.available)
    return (
      <p className="text-sm text-muted-foreground">
        Names appear here once your club&rsquo;s match data is connected.
      </p>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-1 pt-6">
          <h3 className="mb-2 text-sm font-medium">Teams</h3>
          {listing.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches yet this season or last.</p>
          ) : (
            listing.teams.map((row) => (
              <TeamNameRow
                key={row.centralClubId}
                row={row}
                saving={saving}
                onSave={(gradeKey, shortName) =>
                  teamM.mutate({
                    data: { centralClubId: row.centralClubId, gradeKey, shortName },
                  })
                }
                onCrest={(choice) =>
                  crestM.mutate({
                    data: {
                      centralClubId: row.centralClubId,
                      crestSource: choice?.crestSource ?? null,
                      crestUrl: choice?.crestUrl ?? null,
                    },
                  })
                }
              />
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-1 pt-6">
          <h3 className="mb-2 text-sm font-medium">Competitions</h3>
          {listing.competitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No grades yet this season or last.</p>
          ) : (
            listing.competitions.map((c) => (
              <CompetitionRow
                key={c.gradeKey}
                label={c}
                saving={compM.isPending}
                onSave={(label) => compM.mutate({ data: { gradeKey: c.gradeKey, label } })}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Juniors ─────────────────────────────────────────────────────────────────

function JuniorNames({ onError }: { onError: (message: string | null) => void }) {
  const queryClient = useQueryClient();
  const namesQ = useGetJuniorCardNames();
  const mutation = {
    onSuccess: (listing: JuniorCardNamesListing) => {
      onError(null);
      queryClient.setQueryData(getGetJuniorCardNamesQueryKey(), listing);
    },
    onError: (e: unknown) => onError(handleAdminMutationError(e)),
  };
  const teamM = useSetJuniorCardTeamName({ mutation });
  const crestM = useSetJuniorCardTeamCrest({ mutation });
  const compM = useSetJuniorCardCompetitionLabel({ mutation });
  const saving = teamM.isPending || crestM.isPending;

  const listing = namesQ.data;
  if (namesQ.isLoading) return <Loading />;
  if (namesQ.isError) return <LoadFailed />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Junior cards only. Each opposing club is one row for all its age groups; these names never
        appear on senior cards.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 pt-6">
            <h3 className="mb-2 text-sm font-medium">Junior teams</h3>
            {!listing?.teams.length ? (
              <p className="text-sm text-muted-foreground">
                No junior opponents yet this season or last.
              </p>
            ) : (
              listing.teams.map((row) => (
                <JuniorTeamRow
                  key={row.teamKey}
                  row={row}
                  saving={saving}
                  onSave={(shortName) =>
                    teamM.mutate({ data: { teamKey: row.teamKey, shortName } })
                  }
                  onCrest={(choice) =>
                    crestM.mutate({
                      data: {
                        teamKey: row.teamKey,
                        crestSource: choice?.crestSource ?? null,
                        crestUrl: choice?.crestUrl ?? null,
                      },
                    })
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-6">
            <h3 className="mb-2 text-sm font-medium">Junior competitions</h3>
            {!listing?.competitions.length ? (
              <p className="text-sm text-muted-foreground">
                No junior grades yet this season or last.
              </p>
            ) : (
              listing.competitions.map((c) => (
                <CompetitionRow
                  key={c.gradeKey}
                  label={c}
                  saving={compM.isPending}
                  onSave={(label) => compM.mutate({ data: { gradeKey: c.gradeKey, label } })}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

/**
 * One name, edited in place: shows what cards print, saves on blur or Enter,
 * and an empty field (or Reset) goes back to the automatic name.
 */
function NameField({
  value,
  placeholder,
  overridden,
  label,
  saving,
  onSave,
}: {
  value: string;
  placeholder: string;
  overridden: boolean;
  label: string;
  saving: boolean;
  onSave: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.replace(/\s+/g, " ").trim();
    if (next === value) return;
    // Typing the automatic name back is the same as clearing it.
    onSave(next && next !== placeholder ? next : null);
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        value={draft}
        placeholder={placeholder}
        maxLength={MAX_NAME}
        aria-label={label}
        className="h-8"
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(value);
        }}
      />
      {overridden && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 flex-none"
          aria-label={`Reset ${label} to the automatic name`}
          title="Use the automatic name"
          disabled={saving}
          onClick={() => onSave(null)}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function TeamNameRow({
  row,
  saving,
  onSave,
  onCrest,
}: {
  row: CardTeamNameRow;
  saving: boolean;
  onSave: (gradeKey: string | null, shortName: string | null) => void;
  onCrest: (choice: CrestChoiceUpdate) => void;
}) {
  const [open, setOpen] = useState(() => row.grades.some((g) => g.overrideName));
  const playhq = row.teamNames.slice(0, 3).join(", ");
  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        {row.isOwnClub ? (
          // The club's own crest is its logo, set in Branding.
          <span title="Your club's logo is set in Branding">
            <CrestBadge crestUrl={row.crestUrl} monogram={row.monogram} />
          </span>
        ) : (
          <CrestControl
            teamName={row.name}
            searchSeed={row.autoName}
            crestUrl={row.crestUrl}
            crestSource={row.crestSource}
            autoCrestUrl={row.autoCrestUrl}
            monogram={row.monogram}
            saving={saving}
            onChoose={onCrest}
          />
        )}
        <div className="min-w-0 flex-1">
          <NameField
            value={row.overrideName ?? row.autoName}
            placeholder={row.autoName}
            overridden={!!row.overrideName}
            label={`Card name for ${row.rawName}`}
            saving={saving}
            onSave={(next) => onSave(null, next)}
          />
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={row.teamNames.join(", ")}
          >
            {row.isOwnClub ? "Your club · " : ""}
            {row.rawName}
            {playhq ? ` · PlayHQ: ${playhq}${row.teamNames.length > 3 ? "…" : ""}` : ""}
          </p>
        </div>
        {row.grades.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 flex-none text-xs"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide grades" : "By grade"}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1 pl-11">
          {row.grades.map((g) => (
            <div key={g.gradeKey} className="flex items-center gap-2">
              <span className="w-28 flex-none truncate text-xs text-muted-foreground">
                {g.gradeKey}
              </span>
              <div className="min-w-0 flex-1">
                <NameField
                  value={g.overrideName ?? ""}
                  placeholder={row.overrideName ?? row.autoName}
                  overridden={!!g.overrideName}
                  label={`Card name for ${row.rawName} in ${g.gradeKey}`}
                  saving={saving}
                  onSave={(next) => onSave(g.gradeKey, next)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JuniorTeamRow({
  row,
  saving,
  onSave,
  onCrest,
}: {
  row: JuniorCardTeamName;
  saving: boolean;
  onSave: (shortName: string | null) => void;
  onCrest: (choice: CrestChoiceUpdate) => void;
}) {
  const shown = row.rawNames.slice(0, 3).join(", ");
  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <CrestControl
          teamName={row.name}
          searchSeed={row.autoName}
          crestUrl={row.crestUrl}
          crestSource={row.crestSource}
          autoCrestUrl={row.autoCrestUrl}
          monogram={row.monogram}
          saving={saving}
          onChoose={onCrest}
        />
        <div className="min-w-0 flex-1">
          <NameField
            value={row.overrideName ?? row.autoName}
            placeholder={row.autoName}
            overridden={!!row.overrideName}
            label={`Junior card name for ${row.autoName}`}
            saving={saving}
            onSave={onSave}
          />
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={row.rawNames.join(", ")}
          >
            {shown ? `PlayHQ: ${shown}${row.rawNames.length > 3 ? "…" : ""}` : row.autoName}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompetitionRow({
  label,
  saving,
  onSave,
}: {
  label: CardCompetitionLabel | JuniorCardCompetitionLabel;
  saving: boolean;
  onSave: (label: string | null) => void;
}) {
  return (
    <div className="border-b py-2 last:border-b-0">
      <NameField
        value={label.overrideLabel ?? label.autoLabel}
        placeholder={label.autoLabel}
        overridden={!!label.overrideLabel}
        label={`Card label for ${label.gradeKey}`}
        saving={saving}
        onSave={onSave}
      />
      <p
        className="mt-0.5 truncate text-xs text-muted-foreground"
        title={label.rawLabels.join(", ")}
      >
        {label.gradeKey}
        {label.rawLabels.length ? ` · ${label.rawLabels.join(", ")}` : ""}
      </p>
    </div>
  );
}
