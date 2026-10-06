import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAvailabilitySettings,
  useUpdateAvailabilitySettings,
  getGetAvailabilitySettingsQueryKey,
  useGetCurrentAvailabilityRound,
  getGetCurrentAvailabilityRoundQueryKey,
  useRunAvailabilityStep,
  useListSquadMembers,
  getListSquadMembersQueryKey,
  useImportSquad,
  useGetSquadMember,
  getGetSquadMemberQueryKey,
  useUpdateSquadMember,
  useRemoveSquadMember,
} from "@workspace/api-client-react";
import type {
  AvailabilitySelectionRule,
  AvailabilitySettingsInput,
  AvailabilityRoundStatus,
  AvailabilityStepResult,
  SquadContactPresence,
  SquadContactUpdate,
  SquadImportResult,
  SquadMember,
  SquadMemberDetail,
  SquadSection,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Admin → Availability (plan 2026-10-06-002 U10; R1–R4, R6, R8, R14, KTD9, KTD11): the
 * club's weekly availability schedule, the squad register imported from PlayHQ, and the
 * current round's progress with "Run now" steps. The squad list carries contact
 * *presence* only; contact values are fetched and shown inside the edit drawer alone.
 */

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const RULES: { value: AvailabilitySelectionRule; label: string; description: string }[] = [
  {
    value: "captains_own_grade",
    label: "Captains edit their own grade",
    description:
      "Each captain picks the side for the grade they captain. Admins can edit any side.",
  },
  {
    value: "captains_all_grades",
    label: "Captains edit any grade",
    description: "Any captain can move players between every grade's side. Admins too.",
  },
  {
    value: "admins_only",
    label: "Only admins edit",
    description: "Captains can see the sides but only club admins can change them.",
  },
];

const SKIP_REASONS: Record<string, string> = {
  missing_profile_id: "No PlayHQ profile ID",
  missing_name: "No name",
  not_a_player: "Not registered as a player",
  inactive_status: "Registration not active",
  other_season: "Registered for a different season",
  other_organisation: "Registered with a different club",
  duplicate_profile: "Listed more than once in the file",
};

const skipReason = (reason: string) => SKIP_REASONS[reason] ?? reason;

/**
 * The server's own message for a failed request (the API returns `{ error }`), falling
 * back to the generic admin handling (session expiry, network failure).
 */
function errorMessage(e: unknown): string | null {
  const status = (e as { status?: number } | null)?.status;
  const data = (e as { data?: unknown } | null)?.data;
  if (status !== 401 && data && typeof data === "object") {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return handleAdminMutationError(e);
}

function formatPerth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Perth",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function memberName(m: Pick<SquadMember, "firstName" | "lastName" | "preferredName">): string {
  return `${m.preferredName?.trim() || m.firstName} ${m.lastName}`.trim();
}

function ErrorBox({ message, testId }: { message: string | null; testId?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      data-testid={testId}
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

export default function AdminAvailability() {
  return (
    <div className="space-y-6">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Ask your players each week whether they can play, then pick sides in the Selection Hub. Set
        the weekly schedule, keep the squad list up to date from PlayHQ, and check how this
        week&rsquo;s round is going.
      </p>
      <SettingsCard />
      <RoundCard />
      <SquadCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function DayTimePicker({
  id,
  label,
  hint,
  dow,
  time,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  dow: number;
  time: string;
  onChange: (dow: number, time: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-day`}>{label}</Label>
      <div className="flex gap-2">
        <select
          id={`${id}-day`}
          aria-label={`${label} day`}
          className={selectClass}
          value={dow}
          onChange={(e) => onChange(Number(e.target.value), time)}
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <Input
          type="time"
          aria-label={`${label} time`}
          className="w-32 shrink-0"
          value={time}
          onChange={(e) => onChange(dow, e.target.value)}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettingsCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetAvailabilitySettings();
  const save = useUpdateAvailabilitySettings();
  const [form, setForm] = useState<AvailabilitySettingsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      smsEnabled: data.smsEnabled,
      sendDow: data.sendDow,
      sendTime: data.sendTime,
      reminderDow: data.reminderDow,
      reminderTime: data.reminderTime,
      cutoffDow: data.cutoffDow,
      cutoffTime: data.cutoffTime,
      finaliseDow: data.finaliseDow,
      finaliseTime: data.finaliseTime,
      selectionRule: data.selectionRule,
    });
  }, [data]);

  const update = (patch: Partial<AvailabilitySettingsInput>) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  const onSave = () => {
    if (!form) return;
    setError(null);
    setSaved(false);
    save.mutate(
      { data: form },
      {
        onSuccess: () => {
          setSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetAvailabilitySettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCurrentAvailabilityRoundQueryKey() });
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading || !form ? (
          <ListSkeleton />
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="availability-enabled">Send weekly availability requests</Label>
                  <p className="text-xs text-muted-foreground">
                    Off by default. While it&rsquo;s off nothing is sent to anyone.
                  </p>
                </div>
                <Switch
                  id="availability-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => update({ enabled: v })}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="availability-sms">Also send a text message</Label>
                  <p className="text-xs text-muted-foreground">
                    Every request always goes by email. Text messages also need SMS to be set up for
                    the platform; turn this off to run email only.
                  </p>
                </div>
                <Switch
                  id="availability-sms"
                  checked={form.smsEnabled}
                  onCheckedChange={(v) => update({ smsEnabled: v })}
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs text-muted-foreground">All times are Perth time.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <DayTimePicker
                  id="send"
                  label="Send requests"
                  dow={form.sendDow}
                  time={form.sendTime}
                  onChange={(d, t) => update({ sendDow: d, sendTime: t })}
                />
                <DayTimePicker
                  id="reminder"
                  label="Remind anyone who hasn't answered"
                  dow={form.reminderDow}
                  time={form.reminderTime}
                  onChange={(d, t) => update({ reminderDow: d, reminderTime: t })}
                />
                <DayTimePicker
                  id="cutoff"
                  label="Cut-off"
                  hint="Draft sides are built from the answers at this time."
                  dow={form.cutoffDow}
                  time={form.cutoffTime}
                  onChange={(d, t) => update({ cutoffDow: d, cutoffTime: t })}
                />
                <DayTimePicker
                  id="finalise"
                  label="Sides finalised by"
                  hint="Shown to captains as the deadline for picking sides."
                  dow={form.finaliseDow}
                  time={form.finaliseTime}
                  onChange={(d, t) => update({ finaliseDow: d, finaliseTime: t })}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Who can pick sides</legend>
              {RULES.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                >
                  <input
                    type="radio"
                    name="selection-rule"
                    className="mt-1"
                    value={r.value}
                    checked={form.selectionRule === r.value}
                    onChange={() => update({ selectionRule: r.value })}
                  />
                  <span className="text-sm font-medium">
                    {r.label}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {r.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <ErrorBox message={error} testId="settings-error" />
            <div className="flex items-center gap-3">
              <Button onClick={onSave} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save schedule"}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// This round
// ---------------------------------------------------------------------------

type StepKey = "send" | "remind" | "cutoff";

const STEPS: {
  key: StepKey;
  label: string;
  at: (r: AvailabilityRoundStatus) => string;
  started: (r: AvailabilityRoundStatus) => string | null;
  completed: (r: AvailabilityRoundStatus) => string | null;
  confirm: string;
}[] = [
  {
    key: "send",
    label: "Send requests",
    at: (r) => r.sendAt,
    started: (r) => r.sendStartedAt,
    completed: (r) => r.sendCompletedAt,
    confirm: "Every active player (or a junior's parents) will be asked about this weekend now.",
  },
  {
    key: "remind",
    label: "Reminder",
    at: (r) => r.reminderAt,
    started: (r) => r.reminderStartedAt,
    completed: (r) => r.reminderCompletedAt,
    confirm:
      "Everyone who hasn't answered yet will get a reminder now. Anyone reminded by hand in the last 12 hours is skipped.",
  },
  {
    key: "cutoff",
    label: "Cut-off",
    at: (r) => r.cutoffAt,
    started: (r) => r.cutoffStartedAt,
    completed: (r) => r.cutoffCompletedAt,
    confirm:
      "Draft sides will be built from the answers so far and captains told they're ready. Later answers are still accepted and shown as late.",
  },
];

function stepState(r: AvailabilityRoundStatus, s: (typeof STEPS)[number]): string {
  const completed = s.completed(r);
  if (completed) return `Done ${formatPerth(completed)}`;
  const started = s.started(r);
  if (started) return `Started ${formatPerth(started)}`;
  return `Due ${formatPerth(s.at(r))}`;
}

function describeResult(r: AvailabilityStepResult): string {
  const parts = [`${r.messaged} messaged`];
  if (r.away) parts.push(`${r.away} away`);
  if (r.noFixture) parts.push(`${r.noFixture} with no game this round`);
  if (r.throttled) parts.push(`${r.throttled} reminded recently, skipped`);
  if (r.step === "cutoff") parts.push(`${r.drafts} draft side${r.drafts === 1 ? "" : "s"} built`);
  return parts.join(" · ");
}

function RoundCard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useGetCurrentAvailabilityRound();
  const run = useRunAvailabilityStep();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const onRun = async (s: (typeof STEPS)[number]) => {
    const ok = await confirm({
      title: `Run "${s.label}" now?`,
      description: s.confirm,
      confirmText: "Run now",
    });
    if (!ok) return;
    setError(null);
    setResult(null);
    run.mutate(
      { step: s.key },
      {
        onSuccess: (res) => {
          setResult(`${s.label}: ${describeResult(res)}`);
          queryClient.invalidateQueries({ queryKey: getGetCurrentAvailabilityRoundQueryKey() });
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>This round</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <ListSkeleton />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Weekend of{" "}
              {new Date(`${data.weekendDate}T00:00:00`).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              · sides to be finalised by {formatPerth(data.finaliseAt)}
            </p>
            {!data.enabled && (
              <div
                className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
                data-testid="round-disabled"
              >
                Weekly availability requests are off for the club, so nothing will be sent. Turn on
                &ldquo;Send weekly availability requests&rdquo; above to run these steps.
              </div>
            )}
            <ul className="divide-y rounded-md border">
              {STEPS.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{stepState(data, s)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data.enabled || run.isPending}
                    onClick={() => onRun(s)}
                    aria-label={`Run ${s.label} now`}
                  >
                    Run now
                  </Button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              {(
                [
                  ["Yes", data.counts.yes],
                  ["Maybe", data.counts.maybe],
                  ["No", data.counts.no],
                  ["No reply", data.counts.none],
                  ["Late", data.counts.late],
                  ["Asked", data.counts.total],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-md border p-2">
                  <div className="text-lg font-semibold tabular-nums">{n}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <ErrorBox message={error} testId="round-error" />
            {result && <p className="text-sm text-muted-foreground">{result}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Squad
// ---------------------------------------------------------------------------

function ImportSummary({ result }: { result: SquadImportResult }) {
  const counts: [string, number][] = [
    ["Added", result.created],
    ["Updated", result.updated],
    ["Stood down", result.deactivated],
    ["Linked to a club player", result.linked],
    ["Skipped", result.skipped.length],
  ];
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="import-summary">
      <p className="text-sm font-medium">
        Import finished{result.season ? ` for season ${result.season}` : ""}.
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map(([label, n]) => (
          <div key={label} className="rounded-md bg-muted/40 p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      {result.skippedByReason.length > 0 && (
        <div>
          <p className="text-sm font-medium">Why rows were skipped</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {result.skippedByReason.map((r) => (
              <li key={r.reason}>
                {skipReason(r.reason)}: {r.count}
              </li>
            ))}
          </ul>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Show skipped rows</summary>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.map((s) => (
                <li key={`${s.line}-${s.reason}`}>
                  Line {s.line}: {s.name || "(no name)"} — {skipReason(s.reason)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

function ContactBadges({ label, c }: { label: string; c: SquadContactPresence }) {
  if (!c.hasName && !c.hasMobile && !c.hasEmail) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Badge variant={c.hasMobile ? "secondary" : "outline"}>
        {c.hasMobile ? "Mobile" : "No mobile"}
      </Badge>
      <Badge variant={c.hasEmail ? "secondary" : "outline"}>
        {c.hasEmail ? "Email" : "No email"}
      </Badge>
      {c.smsOptedOut && <Badge variant="destructive">SMS opted out</Badge>}
    </div>
  );
}

function SquadCard() {
  const queryClient = useQueryClient();
  const { data: members, isLoading, isError, refetch } = useListSquadMembers();
  const importSquad = useImportSquad();
  const updateMember = useUpdateSquadMember();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<SquadImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<"all" | SquadSection>("all");
  const [show, setShow] = useState<"active" | "inactive" | "all">("active");
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSquadMembersQueryKey() });

  const onImport = () => {
    if (!file) return;
    setError(null);
    setSummary(null);
    importSquad.mutate(
      { data: { file } },
      {
        onSuccess: (res) => {
          setSummary(res);
          setFile(null);
          if (fileRef.current) fileRef.current.value = "";
          invalidate();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  const onToggleActive = (m: SquadMember, active: boolean) => {
    setError(null);
    updateMember.mutate(
      { id: m.id, data: { active } },
      { onSuccess: invalidate, onError: (e) => setError(errorMessage(e)) },
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (members ?? [])
      .filter((m) => section === "all" || m.section === section)
      .filter((m) => show === "all" || (show === "active" ? m.active : !m.active))
      .filter((m) => {
        if (!q) return true;
        return [memberName(m), m.firstName, m.gradeHint ?? "", m.teamName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      );
  }, [members, search, section, show]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Squad</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="squad-file">Upload the PlayHQ participant export (CSV)</Label>
          <p className="text-xs text-muted-foreground">
            Only each person&rsquo;s name, date of birth, registration, grade and contact details
            are kept. Every other column in the file is discarded and never stored. Uploading again
            updates existing players rather than adding them twice.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="squad-file"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="max-w-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={onImport} disabled={!file || importSquad.isPending}>
              {importSquad.isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
        {summary && <ImportSummary result={summary} />}
        <ErrorBox message={error} testId="squad-error" />

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by name or grade"
            aria-label="Search squad"
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Section"
            className={`${selectClass} w-auto`}
            value={section}
            onChange={(e) => setSection(e.target.value as "all" | SquadSection)}
          >
            <option value="all">Seniors and juniors</option>
            <option value="senior">Seniors</option>
            <option value="junior">Juniors</option>
          </select>
          <select
            aria-label="Show"
            className={`${selectClass} w-auto`}
            value={show}
            onChange={(e) => setShow(e.target.value as "active" | "inactive" | "all")}
          >
            <option value="active">Active</option>
            <option value="inactive">Not active</option>
            <option value="all">Everyone</option>
          </select>
        </div>

        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <ListSkeleton />
        ) : (members ?? []).length === 0 ? (
          <EmptyState
            title="No squad yet"
            message="Upload the PlayHQ participant export to add your players."
          />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one matches those filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="squad-table">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Section</th>
                  <th className="p-2">Grade</th>
                  <th className="p-2">Active</th>
                  <th className="p-2">Contact details</th>
                  <th className="p-2">Club player</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => (
                  <tr key={m.id} data-testid={`squad-row-${m.id}`}>
                    <td className="p-2 font-medium">{memberName(m)}</td>
                    <td className="p-2">
                      {m.section === "junior" ? "Junior" : "Senior"}
                      {m.under18 && (
                        <span className="ml-1 text-xs text-muted-foreground">· under 18</span>
                      )}
                    </td>
                    <td className="p-2">{m.gradeHint ?? "—"}</td>
                    <td className="p-2">
                      <Switch
                        checked={m.active}
                        aria-label={`${memberName(m)} active`}
                        disabled={updateMember.isPending}
                        onCheckedChange={(v) => onToggleActive(m, v)}
                      />
                    </td>
                    <td className="space-y-1 p-2">
                      <ContactBadges label="Player" c={m.account} />
                      <ContactBadges label="Parent 1" c={m.guardian1} />
                      <ContactBadges label="Parent 2" c={m.guardian2} />
                      {m.contactChangeFlag && (
                        <Badge className="bg-amber-500/20 text-foreground">Contact changed</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {m.linkedPlayerId != null ? `#${m.linkedPlayerId}` : "Not linked"}
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(m.id)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {editingId != null && (
        <MemberDrawer
          id={editingId}
          onClose={() => {
            // Drop the cached contact values as soon as the drawer closes.
            queryClient.removeQueries({ queryKey: getGetSquadMemberQueryKey(editingId) });
            setEditingId(null);
          }}
          onChanged={invalidate}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit drawer — the only place contact values are fetched or shown
// ---------------------------------------------------------------------------

type ContactSlot = "account" | "guardian1" | "guardian2";
type ContactForm = { name: string; mobile: string; email: string };
type DrawerForm = {
  section: SquadSection;
  gradeHint: string;
  linkedPlayerId: string;
  clearContactFlag: boolean;
} & Record<ContactSlot, ContactForm>;

const SLOTS: { key: ContactSlot; label: string }[] = [
  { key: "account", label: "Player (account holder)" },
  { key: "guardian1", label: "Parent or guardian 1" },
  { key: "guardian2", label: "Parent or guardian 2" },
];

function toForm(d: SquadMemberDetail): DrawerForm {
  const slot = (key: ContactSlot): ContactForm => ({
    name: d[key].name ?? "",
    mobile: d[key].mobile ?? "",
    email: d[key].email ?? "",
  });
  return {
    section: d.section,
    gradeHint: d.gradeHint ?? "",
    linkedPlayerId: d.linkedPlayerId != null ? String(d.linkedPlayerId) : "",
    clearContactFlag: false,
    account: slot("account"),
    guardian1: slot("guardian1"),
    guardian2: slot("guardian2"),
  };
}

function MemberDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useGetSquadMember(id, {
    query: { queryKey: getGetSquadMemberQueryKey(id), gcTime: 0 },
  });
  const update = useUpdateSquadMember();
  const remove = useRemoveSquadMember();
  const [form, setForm] = useState<DrawerForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const setContact = (key: ContactSlot, patch: Partial<ContactForm>) =>
    setForm((f) => (f ? { ...f, [key]: { ...f[key], ...patch } } : f));

  const onSave = () => {
    if (!form) return;
    const linked = form.linkedPlayerId.trim();
    const linkedId = linked === "" ? null : Number(linked);
    if (linkedId !== null && (!Number.isInteger(linkedId) || linkedId <= 0)) {
      setError("The club player number must be a whole number.");
      return;
    }
    setError(null);
    // Only the contact fields that were edited go up; the rest are left alone.
    const original = data ? toForm(data) : null;
    const contact = (key: ContactSlot) => {
      const out: SquadContactUpdate = {};
      for (const f of ["name", "mobile", "email"] as const) {
        const value = form[key][f].trim();
        if (value !== original?.[key][f].trim()) out[f] = value || null;
      }
      return Object.keys(out).length ? out : undefined;
    };
    update.mutate(
      {
        id,
        data: {
          section: form.section,
          gradeHint: form.gradeHint.trim() || null,
          linkedPlayerId: linkedId,
          account: contact("account"),
          guardian1: contact("guardian1"),
          guardian2: contact("guardian2"),
          ...(form.clearContactFlag ? { contactChangeFlag: false } : {}),
        },
      },
      {
        onSuccess: () => {
          onChanged();
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  const onRemove = async () => {
    const ok = await confirm({
      title: "Remove this member's details?",
      description:
        "Their date of birth and every contact detail are deleted, and they stop getting availability requests. Their name stays on past team lists. This can't be undone.",
      confirmText: "Remove details",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          onChanged();
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{data ? memberName(data) : "Squad member"}</SheetTitle>
          <SheetDescription>
            Contact details are only visible to club admins and are never shown on the public site.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : isLoading || !form || !data ? (
            <ListSkeleton />
          ) : (
            <>
              {data.contactChangeFlag && (
                <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <p>
                    A contact detail was changed from the player&rsquo;s link
                    {data.contactChangedAt ? ` on ${formatPerth(data.contactChangedAt)}` : ""}.
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.clearContactFlag}
                      onChange={(e) => setForm({ ...form, clearContactFlag: e.target.checked })}
                    />
                    Mark as checked
                  </label>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="member-section">Section</Label>
                  <select
                    id="member-section"
                    className={selectClass}
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value as SquadSection })}
                  >
                    <option value="senior">Senior</option>
                    <option value="junior">Junior</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-grade">Grade</Label>
                  <Input
                    id="member-grade"
                    value={form.gradeHint}
                    onChange={(e) => setForm({ ...form, gradeHint: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="member-linked">Club player number</Label>
                  <Input
                    id="member-linked"
                    inputMode="numeric"
                    placeholder="Not linked"
                    value={form.linkedPlayerId}
                    onChange={(e) => setForm({ ...form, linkedPlayerId: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Links this person to their record on the club&rsquo;s stats pages so their past
                    games line up. Leave blank if they don&rsquo;t have one.
                  </p>
                </div>
              </div>
              {data.under18 && (
                <p className="text-xs text-muted-foreground">
                  Under 18: requests go to their parents or guardians.
                </p>
              )}
              {SLOTS.map((s) => (
                <fieldset key={s.key} className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">{s.label}</legend>
                  {data[s.key].smsOptedOut && (
                    <p className="text-xs text-destructive">
                      Opted out of text messages; they still get emails. Changing the mobile number
                      turns texts back on.
                    </p>
                  )}
                  <Input
                    aria-label={`${s.label} name`}
                    placeholder="Name"
                    value={form[s.key].name}
                    onChange={(e) => setContact(s.key, { name: e.target.value })}
                  />
                  <Input
                    aria-label={`${s.label} mobile`}
                    placeholder="Mobile"
                    type="tel"
                    value={form[s.key].mobile}
                    onChange={(e) => setContact(s.key, { mobile: e.target.value })}
                  />
                  <Input
                    aria-label={`${s.label} email`}
                    placeholder="Email"
                    type="email"
                    value={form[s.key].email}
                    onChange={(e) => setContact(s.key, { email: e.target.value })}
                  />
                </fieldset>
              ))}
              <ErrorBox message={error} testId="member-error" />
            </>
          )}
        </div>
        <SheetFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="destructive"
            onClick={onRemove}
            disabled={!data || remove.isPending || update.isPending}
          >
            Remove member&rsquo;s details
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={!form || update.isPending || remove.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
