import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorNameReview,
  usePublishJuniorNames,
  type JuniorNameReview,
  type JuniorNameSelection,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";

function PublicationDescription({ text }: { text: string }) {
  return (
    <span className="block max-h-[50vh] overflow-y-auto whitespace-pre-line [overflow-wrap:anywhere]">
      {text}
    </span>
  );
}

function effect(row: JuniorNameReview, name: string) {
  if (row.withheld)
    return "No public identity: this player remains withheld. Publishing does not change privacy or photo consent.";
  const parts = name.trim().split(/\s+/);
  const publicName =
    row.nameStyle === "first"
      ? parts[0]
      : row.nameStyle === "first_initial"
        ? `${parts[0]} ${parts.at(-1)?.[0] ?? ""}`
        : name;
  return `Public name under the club's current ${row.nameStyle === "full" ? "Full name" : row.nameStyle === "first" ? "First name only" : "First name and surname initial"} setting: ${publicName}. Privacy overrides and photo consent stay unchanged.`;
}

function Evidence({ row }: { row: JuniorNameReview }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        Supporting junior records ({row.evidence.length}) and history ({row.history.length})
      </summary>
      <p className="my-2 break-all text-xs text-muted-foreground">
        Participant ID: {row.participantId}
      </p>
      <div className="max-h-56 space-y-1 overflow-auto">
        {row.evidence.map((e) => (
          <p key={`${e.source}-${e.sourceId}`}>
            <strong>{e.name}</strong> · {e.source} #{e.sourceId} · {e.season ?? "Undated"} ·{" "}
            {e.team ?? "Club team"}
          </p>
        ))}
        {!row.evidence.length && (
          <p>
            No supporting expanded name is required when you personally know this player's identity.
          </p>
        )}
        {row.history.map((h) => (
          <p key={h.id} className="border-t pt-1">
            {h.before ?? "(blank)"} → {h.after} · {h.by ?? "Admin"} ·{" "}
            {new Date(h.at).toLocaleString()} · correction #{h.id}
          </p>
        ))}
      </div>
    </details>
  );
}

export function JuniorFullNameEditor({
  row,
  onChanged,
}: {
  row: JuniorNameReview;
  onChanged: () => void;
}) {
  const [name, setName] = useState(row.currentName);
  const [error, setError] = useState<string | null>(null);
  const publish = usePublishJuniorNames();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = async () => {
    const next = name.trim().replace(/\s+/g, " ");
    if (
      !(await confirm({
        title: "Save and publish full name?",
        description: (
          <PublicationDescription
            text={`${row.currentName || "(blank)"} → ${next}. You confirm this is the person identified by ${row.participantId}, ${row.firstSeason ?? "unknown season"}–${row.lastSeason ?? "present"}. ${effect(row, next)} This correction is recorded with your admin identity and time and can be restored in the corrections journal.`}
          />
        ),
        confirmText: "Save and publish full name",
      }))
    )
      return;
    setError(null);
    publish.mutate(
      {
        data: {
          selections: [
            {
              participantId: row.participantId,
              revision: row.revision,
              name: next,
              mode: "manual",
            },
          ],
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries();
          onChanged();
        },
        onError: (e) => {
          setError(handleAdminMutationError(e));
          qc.invalidateQueries();
        },
      },
    );
  };
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <label className="block space-y-1">
        <span className="text-sm font-semibold">Confirmed full name</span>
        <Input
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          aria-label="Confirmed full name"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Use your own knowledge to resolve missing or conflicting names. Typing, previewing and
        cancelling do not publish anything.
      </p>
      <p className="text-sm break-words">{effect(row, name)}</p>
      <Button
        onClick={save}
        disabled={publish.isPending || !name.trim() || name.trim() === row.currentName}
      >
        Save and publish full name
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Evidence row={row} />
    </section>
  );
}

export function JuniorNameEditorLoader({
  participantId,
  onChanged,
}: {
  participantId: string;
  onChanged: () => void;
}) {
  const q = useListJuniorNameReview();
  const row = q.data?.find((r) => r.participantId === participantId);
  if (q.isError)
    return (
      <Button variant="outline" onClick={() => q.refetch()}>
        Retry loading name evidence
      </Button>
    );
  return row ? (
    <JuniorFullNameEditor key={row.revision} row={row} onChanged={onChanged} />
  ) : (
    <p>Loading name evidence…</p>
  );
}

export function JuniorNameReviewPanel() {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Confirm junior full names</h2>
          <p className="text-sm text-muted-foreground">
            Review this club's junior-source evidence. No names change until you confirm
            publication.
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Close review" : "Preview suggested full names"}
        </Button>
      </div>
      {open && <NameReviewQueue />}
    </section>
  );
}

function NameReviewQueue() {
  const q = useListJuniorNameReview();
  const publish = usePublishJuniorNames();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Record<string, JuniorNameSelection>>({});
  const [filter, setFilter] = useState("suggested");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const rows = q.data ?? [];
  const counts = rows.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});
  const chosen = Object.values(selected);
  const save = async () => {
    const descriptions = chosen.map((s) => {
      const row = rows.find((r) => r.participantId === s.participantId)!;
      return `${row.currentName} → ${s.name} (${row.participantId}). ${effect(row, s.name)}`;
    });
    if (
      !(await confirm({
        title: `Publish ${chosen.length} confirmed full names?`,
        description: <PublicationDescription text={descriptions.join("\n\n")} />,
        confirmText: "Save and publish full names",
      }))
    )
      return;
    publish.mutate(
      { data: { selections: chosen } },
      {
        onSuccess: (r) => {
          setMessage(`${r.published} names published; ${r.skipped} already completed.`);
          setSelected({});
          qc.invalidateQueries();
        },
        onError: (e) => {
          setMessage(handleAdminMutationError(e) ?? "Publication failed.");
          setSelected({});
          qc.invalidateQueries();
        },
      },
    );
  };
  if (q.isLoading) return <p>Loading read-only name review…</p>;
  if (q.isError) return <Button onClick={() => q.refetch()}>Retry name review</Button>;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {rows.length} profiles · {counts.suggested ?? 0} unique compatible suggestions ·{" "}
        {rows.filter((r) => r.withheld).length} withheld ·{" "}
        {rows.filter((r) => !["suggested", "protected", "expanded"].includes(r.status)).length}{" "}
        needing identity review.
      </p>
      <p className="text-xs text-muted-foreground">
        Candidate counts are not proof of identity or consent. Names are never matched across
        participants or clubs. Already expanded and manually corrected names are protected from
        suggested approval.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Name review status"
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All profiles</option>
          {[
            "suggested",
            "conflicting",
            "identity_review",
            "abbreviated",
            "missing",
            "protected",
            "expanded",
          ].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")} ({counts[s] ?? 0})
            </option>
          ))}
        </select>
        <Input
          className="sm:max-w-xs"
          placeholder="Find name, season, team or participant ID…"
          aria-label="Search name review"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button disabled={!chosen.length || publish.isPending} onClick={save}>
          Publish selected ({chosen.length})
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSelected({});
            q.refetch();
          }}
        >
          Refresh review
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="max-h-[650px] space-y-3 overflow-auto">
        {rows
          .filter(
            (r) =>
              (filter === "all" || r.status === filter) &&
              `${r.currentName} ${r.suggestedName ?? ""} ${r.firstSeason} ${r.lastSeason} ${r.teams} ${r.participantId}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .map((r) => (
            <article key={r.participantId} className="space-y-2 rounded border p-3">
              <div className="flex items-start gap-2">
                {r.status === "suggested" && (
                  <input
                    type="checkbox"
                    aria-label={`Approve ${r.currentName} (${r.participantId})`}
                    checked={!!selected[r.participantId]}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        if (e.target.checked)
                          next[r.participantId] = {
                            participantId: r.participantId,
                            name: r.suggestedName!,
                            revision: r.revision,
                            mode: "suggestion",
                          };
                        else delete next[r.participantId];
                        return next;
                      })
                    }
                  />
                )}
                <div className="min-w-0 flex-1 break-words">
                  <strong>{r.currentName}</strong>
                  {r.suggestedName && (
                    <>
                      {" "}
                      → <strong>{r.suggestedName}</strong>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {r.firstSeason} – {r.lastSeason} · {r.teams} · {r.status.replace("_", " ")}
                    {r.withheld ? " · WITHHELD" : ""}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">{r.participantId}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(editing === r.participantId ? null : r.participantId)}
                >
                  Edit full name
                </Button>
              </div>
              <p className="text-sm break-words">{effect(r, r.suggestedName ?? r.currentName)}</p>
              {editing === r.participantId ? (
                <JuniorFullNameEditor
                  key={r.revision}
                  row={r}
                  onChanged={() => {
                    setEditing(null);
                    setSelected({});
                  }}
                />
              ) : (
                <Evidence row={r} />
              )}
            </article>
          ))}
      </div>
    </div>
  );
}
