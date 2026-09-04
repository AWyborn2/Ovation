import type { NameMatchCandidate } from "@workspace/api-client-react";
import { PlayerTypeahead } from "@/components/player-typeahead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FINALS_STAGES, type FileResolutionEntry, type RowResolution } from "./resolution";

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-serif">{value}</div>
    </div>
  );
}

export function DebutBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
      Debut
    </span>
  );
}

/**
 * Per-file Round / Final picker shown for batch files whose identity is missing
 * (`needsResolution`) or collides (`duplicate` / `duplicateInBatch`). Defaults to
 * the round/stage parsed from the scorecard; choosing one clears the other so a
 * file is keyed by EITHER a round OR a finals stage, matching match identity.
 */
export function FileIdentityResolver({
  index,
  parsedRound,
  parsedStage,
  resolution,
  onChange,
}: {
  index: number;
  parsedRound: number | null | undefined;
  parsedStage: string | null | undefined;
  resolution: FileResolutionEntry | undefined;
  onChange: (r: FileResolutionEntry) => void;
}) {
  const roundVal = resolution
    ? resolution.round
    : parsedRound != null
      ? String(parsedRound)
      : "";
  const stageVal = resolution ? resolution.stage : (parsedStage ?? "");
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        inputMode="numeric"
        placeholder="Rnd"
        value={roundVal}
        onChange={(e) =>
          onChange({
            round: e.target.value,
            stage: e.target.value ? "" : stageVal,
          })
        }
        disabled={!!stageVal}
        className="h-7 w-16"
        data-testid={`input-file-round-${index}`}
      />
      <select
        value={stageVal}
        onChange={(e) =>
          onChange({
            stage: e.target.value,
            round: e.target.value ? "" : roundVal,
          })
        }
        className="h-7 rounded-md border border-input bg-background px-1 text-xs"
        data-testid={`select-file-stage-${index}`}
      >
        <option value="">Final?</option>
        {FINALS_STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BatchStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ready: "Ready",
    abandoned: "Abandoned",
    duplicate: "Replaces existing",
    duplicateInBatch: "Duplicate in batch",
    needsResolution: "Set round / final",
    missingRound: "No round",
    unmappableGrade: "Unknown grade",
    parseError: "Parse error",
  };
  const ok = status === "ready" || status === "abandoned";
  const warn =
    status === "needsResolution" ||
    status === "duplicate" ||
    status === "duplicateInBatch";
  const cls = ok
    ? "bg-green-600/15 text-green-700 dark:text-green-400"
    : warn
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-destructive/15 text-destructive";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

/**
 * One previewed name with its match status and the controls an admin uses to
 * resolve it: confirm a suggested link, link to a different existing player, or
 * create a new player. Matched names need no decision.
 */
export function PlayerResolutionRow({
  surname,
  givenName,
  status,
  candidates,
  resolution,
  onChange,
  debut,
  meta,
}: {
  surname: string;
  givenName: string;
  status: "matched" | "suggested" | "new";
  candidates: NameMatchCandidate[];
  resolution: RowResolution | undefined;
  onChange: (r: RowResolution | undefined) => void;
  debut: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {surname}, {givenName}
          </span>
          {debut && <DebutBadge />}
        </div>
        {meta && <div className="mt-0.5">{meta}</div>}
      </div>
      <div className="sm:text-right sm:min-w-[18rem]">
        {status === "matched" ? (
          <span className="text-sm text-green-700 dark:text-green-400">
            matched to existing player
          </span>
        ) : resolution?.action === "link" ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="text-sm">
              Link to{" "}
              <span className="font-semibold">
                {resolution.player.surname}, {resolution.player.givenName}
              </span>{" "}
              <span className="text-muted-foreground">#{resolution.player.id}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(status === "new" ? { action: "create" } : undefined)}
            >
              Change
            </Button>
          </div>
        ) : resolution?.action === "create" && status === "new" ? (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <span className="text-sm text-blue-700 dark:text-blue-400">
              will create new player
            </span>
            <div className="w-full sm:w-72">
              <PlayerTypeahead
                value={null}
                placeholder="Or link to an existing player…"
                onChange={(p) => p && onChange({ action: "link", player: p })}
              />
            </div>
          </div>
        ) : (
          // suggested + undecided
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {candidates.length > 0 && (
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                {candidates.map((c) => (
                  <Button
                    key={c.playerId}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start sm:justify-end"
                    onClick={() =>
                      onChange({
                        action: "link",
                        player: {
                          id: c.playerId,
                          surname: c.surname,
                          givenName: c.givenName,
                        },
                      })
                    }
                  >
                    Link to {c.surname}, {c.givenName} ({c.reason})
                  </Button>
                ))}
              </div>
            )}
            <div className="w-full sm:w-72">
              <PlayerTypeahead
                value={null}
                placeholder="Search a different player…"
                onChange={(p) => p && onChange({ action: "link", player: p })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ action: "create" })}
            >
              Create new player instead
            </Button>
          </div>
        )}
        {resolution?.action === "create" && status === "suggested" && (
          <div className="mt-1 flex items-center gap-2 sm:justify-end">
            <span className="text-sm text-blue-700 dark:text-blue-400">
              will create new player
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              Change
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
