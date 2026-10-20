import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmailListsQueryKey,
  getListEmailSendsQueryKey,
  useCreateEmailList,
  useDeleteEmailList,
  useListEmailLists,
  useListEmailSends,
  useListGrades,
  useResendEmailSend,
  useUpdateEmailList,
  type EmailList,
  type EmailListInput,
} from "@workspace/api-client-react";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { Mail, Plus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EditDrawer, SettingsCard } from "@/components/admin-ui";
import { EmptyState, ListSkeleton, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  DAY_NAMES,
  KIND_LABELS,
  SEND_MODE_LABELS,
  SEND_STATUS_LABELS,
  SOCIAL_TOGGLES,
  draftFrom,
  draftProblem,
  emptyDraft,
  listSummary,
  toInput,
  type EmailListDraft,
} from "@/lib/email-lists";
import { cn } from "@/lib/utils";

/**
 * Email lists (email-distribution-lists): a team-sheet list names the team
 * contacts a senior grade's team sheet is emailed to, and when — on finalise,
 * weekly at a set time, only by hand, or never. A social list gets Social
 * Studio's cards: each card as it's ready (image attached), and batches of
 * cards to review and milestone cards. The send log below shows every email
 * and lets an admin send one again. Addresses stay in this admin page.
 */
export default function AdminEmailLists() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const listsQ = useListEmailLists();
  const sendsQ = useListEmailSends(undefined, {
    query: { queryKey: getListEmailSendsQueryKey(), refetchInterval: 15_000 },
  });
  const gradesQ = useListGrades();
  const createM = useCreateEmailList();
  const updateM = useUpdateEmailList();
  const deleteM = useDeleteEmailList();
  const resendM = useResendEmailSend();
  const [draft, setDraft] = useState<EmailListDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = createM.isPending || updateM.isPending || deleteM.isPending;

  const grades = useMemo(() => {
    const names = (gradesQ.data ?? [])
      .map((g) => g.grade)
      .filter((g) => g !== "CLUB TOTAL" && !isJuniorGradeLabel(g));
    for (const g of draft?.gradeKeys ?? []) if (!names.includes(g)) names.push(g);
    return sortGradesBySeniority(new Set(names));
  }, [gradesQ.data, draft?.gradeKeys]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: getListEmailListsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListEmailSendsQueryKey() }),
    ]);

  const open = (d: EmailListDraft) => {
    setError(null);
    setDraft(d);
  };

  const save = async () => {
    if (!draft) return;
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const data: EmailListInput = toInput(draft);
    try {
      if (draft.id == null) await createM.mutateAsync({ data });
      else await updateM.mutateAsync({ id: draft.id, data });
      await refresh();
      setDraft(null);
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Could not save the list. Please try again.");
    }
  };

  const remove = async () => {
    if (draft?.id == null) return;
    const ok = await confirm({
      title: `Delete ${draft.name || "this list"}?`,
      description: "Its contacts and send history are removed. Team sheets stop going to them.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteM.mutateAsync({ id: draft.id });
      await refresh();
      setDraft(null);
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Could not delete the list.");
    }
  };

  const resend = async (id: number) => {
    try {
      await resendM.mutateAsync({ id });
      await refresh();
    } catch (e) {
      handleAdminMutationError(e);
    }
  };

  const setMember = (i: number, patch: Partial<{ name: string; email: string }>) =>
    setDraft((d) =>
      d ? { ...d, members: d.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) } : d,
    );

  const toggleGrade = (g: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            gradeKeys: d.gradeKeys.includes(g)
              ? d.gradeKeys.filter((x) => x !== g)
              : [...d.gradeKeys, g],
          }
        : d,
    );

  const lists = (listsQ.data ?? []) as EmailList[];
  const sends = sendsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Email lists</h2>
          <p className="text-sm text-muted-foreground">
            Team contacts who get each grade's printable team sheet, and the people who post the
            club's social media cards, by email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => open(emptyDraft("team_sheet"))}>
            <Plus className="mr-1 h-4 w-4" /> Team-sheet list
          </Button>
          <Button variant="outline" onClick={() => open(emptyDraft("social"))}>
            <Plus className="mr-1 h-4 w-4" /> Social list
          </Button>
        </div>
      </div>

      <SettingsCard title="Lists">
        {listsQ.isLoading ? (
          <ListSkeleton />
        ) : listsQ.isError ? (
          <QueryError onRetry={() => listsQ.refetch()} />
        ) : lists.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-6 w-6" aria-hidden />}
            title="No email lists yet"
            message="Create a team-sheet list for a grade's contacts, or a social list for the people who post the club's cards."
          />
        ) : (
          <ul className="divide-y divide-border">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => open(draftFrom(l))}
                  className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:bg-muted/40"
                >
                  <span>
                    <span className="font-medium">{l.name}</span>
                    {!l.active && (
                      <span className="ml-2 text-xs text-muted-foreground">(paused)</span>
                    )}
                    <span className="block text-sm text-muted-foreground">
                      {KIND_LABELS[l.kind]} ·{" "}
                      {l.kind === "team_sheet"
                        ? `${l.gradeKeys.length > 0 ? l.gradeKeys.join(", ") : "No grades yet"} · `
                        : ""}
                      {l.members.length} {l.members.length === 1 ? "contact" : "contacts"}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">{listSummary(l)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Send log"
        description="Every list email, newest first. A failed send is retried hourly, up to three tries."
      >
        {sendsQ.isLoading ? (
          <ListSkeleton />
        ) : sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{s.listName}</span>{" "}
                  <span className="text-muted-foreground">
                    · {new Date(s.sentAt ?? s.queuedAt).toLocaleString()}
                    {s.status === "sent" ? ` · ${s.recipientCount} recipients` : ""}
                  </span>
                  {s.lastError && (
                    <span className="block text-xs text-muted-foreground">{s.lastError}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      s.status === "sent" && "bg-emerald-100 text-emerald-800",
                      s.status === "failed" && "bg-red-100 text-red-800",
                      s.status !== "sent" && s.status !== "failed" && "bg-muted text-foreground",
                    )}
                  >
                    {SEND_STATUS_LABELS[s.status]}
                  </span>
                  {(s.status === "failed" || s.status === "sent" || s.status === "skipped") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resendM.isPending}
                      onClick={() => resend(s.id)}
                      aria-label={`Send ${s.listName} again`}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <EditDrawer
        open={draft != null}
        onOpenChange={(o) => !o && setDraft(null)}
        title={
          draft?.id == null
            ? `New ${draft?.kind === "social" ? "social" : "team-sheet"} list`
            : "Edit email list"
        }
        onSave={save}
        onDelete={draft?.id != null ? remove : undefined}
        saving={saving}
        wide
      >
        {draft && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email-list-name">Name</Label>
              <Input
                id="email-list-name"
                value={draft.name}
                maxLength={80}
                placeholder={draft.kind === "social" ? "Social media" : "A Grade contacts"}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            {draft.kind === "team_sheet" ? (
              <>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">When to email the team sheet</legend>
                  {(Object.keys(SEND_MODE_LABELS) as EmailListDraft["sendMode"][]).map((mode) => (
                    <label key={mode} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="email-list-mode"
                        checked={draft.sendMode === mode}
                        onChange={() => setDraft({ ...draft, sendMode: mode })}
                      />
                      {SEND_MODE_LABELS[mode]}
                    </label>
                  ))}
                </fieldset>

                {draft.sendMode === "scheduled" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email-list-dow">Send each week on</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        id="email-list-dow"
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={draft.scheduleDow}
                        onChange={(e) =>
                          setDraft({ ...draft, scheduleDow: Number(e.target.value) })
                        }
                      >
                        {DAY_NAMES.map((day, i) => (
                          <option key={day} value={i}>
                            {day}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Time"
                        type="time"
                        className="w-32"
                        value={draft.scheduleTime}
                        onChange={(e) => setDraft({ ...draft, scheduleTime: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">Perth time</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sends the coming round's finalised side for each grade, within the hour.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    id="email-list-resend"
                    checked={draft.resendOnChange}
                    onCheckedChange={(v) => setDraft({ ...draft, resendOnChange: v })}
                  />
                  <Label htmlFor="email-list-resend">
                    Email the side again (marked UPDATED) when it's re-finalised
                  </Label>
                </div>
              </>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Emails this list gets</legend>
                {SOCIAL_TOGGLES.map((t) => (
                  <div key={t.key} className="flex items-start gap-2">
                    <Switch
                      id={`email-list-${t.key}`}
                      checked={draft[t.key]}
                      onCheckedChange={(v) => setDraft({ ...draft, [t.key]: v })}
                    />
                    <Label htmlFor={`email-list-${t.key}`} className="leading-tight">
                      {t.label}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t.hint}
                      </span>
                    </Label>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Junior cards are never emailed.</p>
              </fieldset>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="email-list-active"
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
              />
              <Label htmlFor="email-list-active">List is active</Label>
            </div>

            {draft.kind === "team_sheet" && (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Grades</legend>
                <div className="flex flex-wrap gap-2">
                  {grades.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={draft.gradeKeys.includes(g)}
                      onClick={() => toggleGrade(g)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm",
                        draft.gradeKeys.includes(g)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Contacts</legend>
              {draft.members.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label={`Contact ${i + 1} name`}
                    placeholder="Name"
                    value={m.name}
                    maxLength={80}
                    onChange={(e) => setMember(i, { name: e.target.value })}
                  />
                  <Input
                    aria-label={`Contact ${i + 1} email`}
                    placeholder="email@example.com"
                    type="email"
                    value={m.email}
                    maxLength={254}
                    onChange={(e) => setMember(i, { email: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove contact ${i + 1}`}
                    onClick={() =>
                      setDraft({ ...draft, members: draft.members.filter((_, j) => j !== i) })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft({ ...draft, members: [...draft.members, { name: "", email: "" }] })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add contact
              </Button>
            </fieldset>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </EditDrawer>
    </div>
  );
}
