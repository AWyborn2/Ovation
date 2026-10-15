import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialSettings,
} from "@workspace/api-client-react";
import {
  POSTING_ROWS,
  POSTING_ROW_DEFS,
  POSTING_STYLES,
  matchingStyle,
  planFromStyle,
  type Packaging,
  type PostingPlan,
  type PostingRow,
  type PostingRowId,
  type PostingStyle,
} from "@workspace/scorecard/posting-plan";
import { Switch } from "@/components/ui/switch";
import { SaveBar } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { DAYS, hourLabel } from "@/components/social-queue/round-schedules-card";
import { GradePicker } from "./grade-picker";
import {
  PACKAGING_LABELS,
  hasGradePicker,
  juniorsUnavailable,
  rowSentence,
  rowSummary,
} from "./plan-text";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

const CENTRAL_REASON =
  "Round carousels for results, ladders and leaderboards need your club's results from the association database.";

function messageOf(err: unknown): string {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string"
    ? data.error
    : "Couldn't save the Posting Plan. Try again.";
}

/** The weekend-wrap / game day / team list time a round carousel row posts at. */
function roundTime(id: PostingRowId, settings: SocialSettings): string | null {
  const s = settings.roundSchedules;
  if (!s) return null;
  const card = id === "gameDay" ? s.gameDay : id === "teamLists" ? s.teamLists : s.weekendWrap;
  return `${DAYS[card.day]} at ${hourLabel(card.hour)}`;
}

/**
 * The Posting Plan (plan 2026-10-07-001 U6): one row per card kind — drafts or
 * not, which grades, each on its own or one round carousel — filled from a
 * posting style and adjusted row by row. A table on desktop; on a phone one
 * summary card per row, one open at a time.
 */
export function PostingPlanEditor({
  settings,
  grades,
}: {
  settings: SocialSettings;
  grades: readonly string[];
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const saved = settings.postingPlan as PostingPlan;
  const central = settings.centralData ?? false;
  const [form, setForm] = useState<PostingPlan>(saved);
  const [open, setOpen] = useState<PostingRowId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstVisit, setFirstVisit] = useState(!settings.postingPlanSaved);
  useEffect(() => setForm(settings.postingPlan as PostingPlan), [settings.postingPlan]);

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: (err) => setError(messageOf(err)),
    },
  });

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const style = useMemo(() => matchingStyle(form), [form]);
  const setRow = (id: PostingRowId, row: PostingRow) =>
    setForm((f) => ({ ...f, styleId: null, rows: { ...f.rows, [id]: row } }));

  const applyStyle = async (target: PostingStyle) => {
    const next = planFromStyle(target);
    const changed = POSTING_ROWS.filter(
      (id) => rowSentence(id, form.rows[id], grades) !== rowSentence(id, next.rows[id], grades),
    );
    if (!style && changed.length > 0) {
      const ok = await confirm({
        title: `Use "${target.label}"?`,
        description: (
          <span className="block space-y-1">
            <span className="block">This replaces your own choices for:</span>
            {changed.map((id) => (
              <span key={id} className="block">
                {rowSentence(id, form.rows[id], grades)} → {rowSummary(id, next.rows[id], grades)}
              </span>
            ))}
          </span>
        ),
        confirmText: "Use this style",
      });
      if (!ok) return;
    }
    setForm(next);
  };

  const packagingControl = (id: PostingRowId, row: PostingRow) => {
    const def = POSTING_ROW_DEFS[id];
    if (def.packaging.length === 1) {
      return (
        <span className="text-sm text-muted-foreground">{PACKAGING_LABELS[def.packaging[0]]}</span>
      );
    }
    return (
      <select
        className={selectClass}
        value={row.packaging}
        disabled={!row.enabled}
        onChange={(e) => setRow(id, { ...row, packaging: e.target.value as Packaging })}
        aria-label={`${def.label}: post as`}
      >
        {def.packaging.map((p) => (
          <option
            key={p}
            value={p}
            disabled={!central && def.roundCentralOnly && p !== "individual"}
          >
            {PACKAGING_LABELS[p]}
          </option>
        ))}
      </select>
    );
  };

  /** Whether the row can be switched on at all for this club. */
  const unavailable = (id: PostingRowId) =>
    !central && POSTING_ROW_DEFS[id].packaging.every((p) => p !== "individual");

  const notes = (id: PostingRowId, row: PostingRow) => {
    const out: string[] = [];
    if (
      unavailable(id) ||
      (!central && POSTING_ROW_DEFS[id].roundCentralOnly && row.packaging !== "individual")
    ) {
      out.push(CENTRAL_REASON);
    }
    if (row.enabled && row.packaging !== "individual") {
      const when = roundTime(id, settings);
      if (when) out.push(`Drafted ${when}, then posts once approved.`);
    }
    return out;
  };

  const gradesControl = (id: PostingRowId, row: PostingRow) =>
    hasGradePicker(id) ? (
      <GradePicker
        label={POSTING_ROW_DEFS[id].label}
        row={row}
        grades={grades}
        juniorsUnavailable={juniorsUnavailable(id, row)}
        onChange={(r) => setRow(id, r)}
      />
    ) : (
      <span className="text-sm text-muted-foreground">Every senior grade</span>
    );

  const toggle = (id: PostingRowId, row: PostingRow) => (
    <Switch
      checked={row.enabled}
      disabled={unavailable(id)}
      onCheckedChange={(on) => setRow(id, { ...row, enabled: on })}
      aria-label={`${POSTING_ROW_DEFS[id].label}: draft automatically`}
    />
  );

  return (
    <div className="space-y-4">
      {firstVisit && (
        <section
          aria-labelledby="posting-plan-first-visit"
          className="space-y-3 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="posting-plan-first-visit" className="text-base font-semibold">
            Choose how your club posts
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick a style to fill every row, then change anything that&rsquo;s different for your
            club. Nothing changes until you save.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {POSTING_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-lg border border-border p-3 text-left hover:bg-accent"
                onClick={() => {
                  setForm(planFromStyle(s));
                  setFirstVisit(false);
                }}
              >
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.description}</span>
              </button>
            ))}
            <button
              type="button"
              className="rounded-lg border border-border p-3 text-left hover:bg-accent"
              onClick={() => {
                update.mutate({ data: { postingPlan: form } });
                setFirstVisit(false);
              }}
            >
              <span className="block text-sm font-medium">Keep my current settings</span>
              <span className="block text-xs text-muted-foreground">
                Save the plan your club drafts with today, unchanged.
              </span>
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="posting-style" className="text-sm font-medium">
          Style
        </label>
        <select
          id="posting-style"
          className={selectClass}
          value={style?.id ?? "custom"}
          onChange={(e) => {
            const target = POSTING_STYLES.find((s) => s.id === e.target.value);
            if (target) void applyStyle(target);
          }}
        >
          {POSTING_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          <option value="custom" disabled>
            {settings.postingPlanSaved ? "Custom" : "Custom (based on your current settings)"}
          </option>
        </select>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {style ? `Using “${style.label}”` : "Custom"}
        </span>
      </div>

      {/* Desktop: one table row per card kind. */}
      <table className="hidden w-full rounded-xl border border-border bg-card text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Card</th>
            <th className="px-4 py-3 font-medium">Draft it</th>
            <th className="px-4 py-3 font-medium">Grades</th>
            <th className="px-4 py-3 font-medium">Post as</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {POSTING_ROWS.map((id) => {
            const row = form.rows[id];
            return (
              <tr key={id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{POSTING_ROW_DEFS[id].label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rowSummary(id, row, grades)}
                  </p>
                  {notes(id, row).map((n) => (
                    <p key={n} className="mt-1 text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </td>
                <td className="px-4 py-3">{toggle(id, row)}</td>
                <td className="px-4 py-3">{row.enabled ? gradesControl(id, row) : null}</td>
                <td className="px-4 py-3">{packagingControl(id, row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phone: one summary card per row, one open at a time. */}
      <ul className="space-y-2 md:hidden" aria-label="Posting Plan">
        {POSTING_ROWS.map((id) => {
          const row = form.rows[id];
          const expanded = open === id;
          return (
            <li key={id} className="rounded-xl border border-border bg-card">
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={expanded}
                  aria-controls={`plan-row-${id}`}
                  onClick={() => setOpen(expanded ? null : id)}
                >
                  <span className="block text-sm font-medium">{POSTING_ROW_DEFS[id].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {rowSummary(id, row, grades)}
                  </span>
                </button>
                {toggle(id, row)}
              </div>
              {expanded && (
                <div id={`plan-row-${id}`} className="space-y-3 border-t border-border p-4">
                  {row.enabled && gradesControl(id, row)}
                  {packagingControl(id, row)}
                  {notes(id, row).map((n) => (
                    <p key={n} className="text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Round carousel times are on the{" "}
        <Link href="/admin/social/cards#round-schedules" className="underline underline-offset-2">
          Cards tab
        </Link>
        . Approval and auto-posting stay as set there for now.
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={() => update.mutate({ data: { postingPlan: form } })}
        onReset={() => {
          setForm(saved);
          setError(null);
        }}
      />
    </div>
  );
}
