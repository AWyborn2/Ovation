import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCardNamesQueryKey,
  getGetSocialSettingsQueryKey,
  useGetCardNames,
  useSetCardCompetitionLabel,
  useSetCardTeamName,
  type CardCompetitionLabel,
  type CardNamesListing,
  type CardTeamName,
  type CardTeamNameRow,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

/** The longest name a card takes (the API enforces it too). */
const MAX_NAME = 40;

/**
 * Team and competition names (ADR-010 P1). Square cards print a short name
 * for every team: the club's own, else an automatic one ("SJ Blues Senior
 * Women" → "SJ Blues"). Here the club sees each name as cards print it and can
 * change it once for every future card. A name is saved when the field loses
 * focus or on Enter; clearing it, or Reset, goes back to the automatic name.
 */
export function CardNamesSection() {
  const queryClient = useQueryClient();
  const namesQ = useGetCardNames();
  const [error, setError] = useState<string | null>(null);

  const onSaved = (listing: CardNamesListing) => {
    setError(null);
    queryClient.setQueryData(getGetCardNamesQueryKey(), listing);
    // Previews read the names from the settings bundle.
    void queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
  };
  const mutation = {
    onSuccess: onSaved,
    onError: (e: unknown) => setError(handleAdminMutationError(e)),
  };
  const teamM = useSetCardTeamName({ mutation });
  const compM = useSetCardCompetitionLabel({ mutation });

  const listing = namesQ.data;
  return (
    <section className="space-y-3" aria-labelledby="card-names-heading">
      <h2 id="card-names-heading" className="text-lg font-semibold">
        Team and competition names
      </h2>
      <p className="text-sm text-muted-foreground">
        The names your cards print for each club and grade. Each one starts as a short name made
        from PlayHQ&rsquo;s. Change one here and every new card uses it.
      </p>
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {namesQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading names…
        </p>
      ) : namesQ.isError ? (
        <p className="text-sm text-destructive">
          Couldn&rsquo;t load the names. Try again shortly.
        </p>
      ) : !listing?.available ? (
        <p className="text-sm text-muted-foreground">
          Names appear here once your club&rsquo;s match data is connected.
        </p>
      ) : (
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
                    saving={teamM.isPending}
                    onSave={(gradeKey, shortName) =>
                      teamM.mutate({
                        data: { centralClubId: row.centralClubId, gradeKey, shortName },
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
      )}
    </section>
  );
}

/** The crest a card shows, or the monogram that stands in for it. */
function Crest({ name }: { name: CardTeamName }) {
  if (name.crestUrl) {
    return (
      <img
        src={name.crestUrl}
        alt=""
        className="h-8 w-8 flex-none rounded bg-white object-contain p-0.5"
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
    >
      {name.monogram}
    </span>
  );
}

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
}: {
  row: CardTeamNameRow;
  saving: boolean;
  onSave: (gradeKey: string | null, shortName: string | null) => void;
}) {
  const [open, setOpen] = useState(() => row.grades.some((g) => g.overrideName));
  const playhq = row.teamNames.slice(0, 3).join(", ");
  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <Crest name={row} />
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

function CompetitionRow({
  label,
  saving,
  onSave,
}: {
  label: CardCompetitionLabel;
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
