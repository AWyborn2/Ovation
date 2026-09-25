import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCardPhotoRules,
  getListCardPhotoRulesQueryKey,
  useSaveCardPhotoRules,
  useDeleteCardPhotoRule,
  useListGrades,
  type CardPhotoRule,
  type CardPhotoRuleMode,
  type ClubPhoto,
  type ClubPhotoType,
} from "@workspace/api-client-react";
import { isJuniorGradeLabel, PHOTO_TYPES, PHOTO_TYPE_LABELS } from "@workspace/scorecard";
import { Check, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditDrawer, SettingsCard } from "@/components/admin-ui";
import { QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { kindLabel } from "@/lib/social-studio";
import { cn } from "@/lib/utils";

/** How a rule picks the photo, in the admin's words. */
export const MODE_OPTIONS: { value: CardPhotoRuleMode; label: string; helper: string }[] = [
  {
    value: "player",
    label: "Featured player",
    helper:
      "A photo of the card's player, then their headshot. Match results feature the top run-scorer.",
  },
  {
    value: "random",
    label: "Random grade photo",
    helper: "Any photo of the grade. Each card keeps the photo it was given.",
  },
  { value: "fixed", label: "One photo", helper: "The same library photo on every card." },
];

const modeLabel = (m: string) => MODE_OPTIONS.find((o) => o.value === m)?.label ?? m;

/** Rules that share a grade, mode, photo and photo type read as one row. */
type RuleGroup = {
  key: string;
  grade: string;
  mode: CardPhotoRuleMode;
  photoId: number | null;
  photoThumbUrl: string | null;
  photoType: ClubPhotoType | null;
  rules: CardPhotoRule[];
};

const KIND_ORDER = new Map(CARD_KIND_OPTIONS.map((o, i) => [o.value as string, i]));

function groupRules(rules: CardPhotoRule[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const r of rules) {
    const key = `${r.grade}|${r.mode}|${r.photoId ?? ""}|${r.photoType ?? ""}`;
    const g = groups.get(key) ?? {
      key,
      grade: r.grade,
      mode: r.mode,
      photoId: r.photoId ?? null,
      photoThumbUrl: r.photoThumbUrl ?? null,
      photoType: r.photoType ?? null,
      rules: [],
    };
    g.rules.push(r);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.rules.sort((a, b) => (KIND_ORDER.get(a.cardKind) ?? 99) - (KIND_ORDER.get(b.cardKind) ?? 99));
  }
  const order = sortGradesBySeniority(new Set(rules.map((r) => r.grade)));
  return [...groups.values()].sort(
    (a, b) => order.indexOf(a.grade) - order.indexOf(b.grade) || a.key.localeCompare(b.key),
  );
}

type Draft = {
  grade: string;
  kinds: string[];
  mode: CardPhotoRuleMode;
  photoId: number | null;
  /** Random and player rules: only photos with this type tag. */
  photoType: ClubPhotoType | null;
  /** The rules this edit replaces (editing an existing row). */
  replacing: CardPhotoRule[];
};

/**
 * "Card photos" (Social Studio card photo rules): per grade and card type, the
 * admin chooses how drafts get their photo — the featured player, a random
 * photo of the grade, or one fixed library photo. Grades and card types with
 * no rule keep the automatic order. Junior cards never get a photo, and
 * junior-graded library photos are never offered.
 *
 * `useFor` opens the editor with that library photo chosen as a fixed photo
 * (the photo grid's "Use for…" action); `nonce` makes repeat clicks reopen it.
 */
export function CardPhotoRules({
  photos,
  useFor,
}: {
  photos: ClubPhoto[];
  useFor?: { photoId: number; nonce: number } | null;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const rulesQ = useListCardPhotoRules({
    query: { queryKey: getListCardPhotoRulesQueryKey() },
  });
  const gradesQ = useListGrades();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveM = useSaveCardPhotoRules();
  const deleteM = useDeleteCardPhotoRule();
  const saving = saveM.isPending || deleteM.isPending;

  const refresh = () => qc.invalidateQueries({ queryKey: getListCardPhotoRulesQueryKey() });
  const groups = useMemo(() => groupRules((rulesQ.data ?? []) as CardPhotoRule[]), [rulesQ.data]);
  const seniorPhotos = useMemo(() => photos.filter((p) => !isJuniorGradeLabel(p.grade)), [photos]);
  const grades = useMemo(() => {
    const names = (gradesQ.data ?? [])
      .map((g) => g.grade)
      .filter((g) => g !== "CLUB TOTAL" && !isJuniorGradeLabel(g));
    if (draft?.grade && !names.includes(draft.grade)) names.push(draft.grade);
    return sortGradesBySeniority(new Set(names));
  }, [gradesQ.data, draft?.grade]);

  useEffect(() => {
    if (!useFor) return;
    setError(null);
    setDraft({
      grade: "",
      kinds: [],
      mode: "fixed",
      photoId: useFor.photoId,
      photoType: null,
      replacing: [],
    });
  }, [useFor]);

  const open = (next: Draft) => {
    setError(null);
    setDraft(next);
  };
  const edit = (g: RuleGroup) =>
    open({
      grade: g.grade,
      kinds: g.rules.map((r) => r.cardKind),
      mode: g.mode,
      photoId: g.photoId,
      photoType: g.photoType,
      replacing: g.rules,
    });

  const removeRules = async (rules: CardPhotoRule[]) => {
    for (const r of rules) await deleteM.mutateAsync({ id: r.id });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.grade) return setError("Choose a grade.");
    if (draft.kinds.length === 0) return setError("Choose at least one card type.");
    if (draft.mode === "fixed" && draft.photoId == null) return setError("Choose a photo.");
    try {
      await saveM.mutateAsync({
        data: {
          grade: draft.grade,
          cardKinds: draft.kinds,
          mode: draft.mode,
          ...(draft.mode === "fixed" ? { photoId: draft.photoId } : {}),
          ...(draft.mode !== "fixed" && draft.photoType ? { photoType: draft.photoType } : {}),
        },
      });
      // Card types dropped from the row (or a changed grade) lose their rule.
      await removeRules(
        draft.replacing.filter((r) => r.grade !== draft.grade || !draft.kinds.includes(r.cardKind)),
      );
      setDraft(null);
    } catch {
      setError("The rule couldn't be saved. Check the photo is still in the library.");
    } finally {
      refresh();
    }
  };

  const remove = async (g: RuleGroup) => {
    const ok = await confirm({
      title: `Remove the ${g.grade} photo rule?`,
      description: "These cards go back to picking their photo automatically.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    await removeRules(g.rules).finally(refresh);
  };

  const toggleKind = (kind: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            kinds: d.kinds.includes(kind) ? d.kinds.filter((k) => k !== kind) : [...d.kinds, kind],
          }
        : d,
    );

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2 py-0.5 text-xs transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-transparent text-muted-foreground hover:border-primary/50",
    );

  return (
    <SettingsCard
      title="Card photos"
      description="Choose how cards of a grade get their photo. Without a rule, a card uses its player's photo, then a photo of the grade. Junior cards never get a photo."
    >
      {rulesQ.isError ? (
        <div className="px-5 py-4">
          <QueryError
            message="We couldn’t load the card photo rules."
            onRetry={() => rulesQ.refetch()}
          />
        </div>
      ) : groups.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {rulesQ.isLoading
            ? "Loading…"
            : "No rules yet. Every card picks its photo automatically."}
        </p>
      ) : (
        <ul aria-label="Card photo rules" className="divide-y divide-border">
          {groups.map((g) => (
            <li key={g.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              {g.mode === "fixed" &&
                (g.photoThumbUrl ? (
                  <img
                    src={g.photoThumbUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                    title="This photo was removed from the library"
                  >
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </span>
                ))}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{g.grade}</p>
                <p className="text-xs text-muted-foreground">
                  {g.rules.map((r) => kindLabel(r.cardKind)).join(", ")}
                </p>
              </div>
              <span className="text-sm text-foreground">
                {g.mode === "fixed" && g.photoId == null ? "Photo removed" : modeLabel(g.mode)}
                {g.mode !== "fixed" && g.photoType && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {PHOTO_TYPE_LABELS[g.photoType]}
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => edit(g)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => void remove(g)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-5 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            open({
              grade: "",
              kinds: [],
              mode: "player",
              photoId: null,
              photoType: null,
              replacing: [],
            })
          }
        >
          Add a rule
        </Button>
      </div>

      <EditDrawer
        open={draft != null}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.replacing.length ? "Edit card photo rule" : "New card photo rule"}
        description="Open drafts of this grade and card type re-pick their photo, unless you chose or removed it yourself."
        onSave={() => void save()}
        saving={saving}
        saveLabel="Save rule"
        wide
      >
        {draft && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="rule-grade" className="text-sm font-medium text-foreground">
                Grade
              </label>
              <select
                id="rule-grade"
                value={draft.grade}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
                className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a grade</option>
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Card types</legend>
              <div className="flex flex-wrap gap-1.5">
                {CARD_KIND_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={draft.kinds.includes(o.value)}
                    className={chip(draft.kinds.includes(o.value))}
                    onClick={() => toggleKind(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Photo</legend>
              {MODE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="rule-mode"
                    className="mt-1"
                    checked={draft.mode === o.value}
                    onChange={() => setDraft({ ...draft, mode: o.value })}
                  />
                  <span>
                    <span className="font-medium text-foreground">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.helper}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {draft.mode !== "fixed" && (
              <div className="space-y-2">
                <label htmlFor="rule-photo-type" className="text-sm font-medium text-foreground">
                  Photo type
                </label>
                <select
                  id="rule-photo-type"
                  value={draft.photoType ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      photoType: (e.target.value || null) as ClubPhotoType | null,
                    })
                  }
                  className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Any type</option>
                  {PHOTO_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PHOTO_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {draft.mode === "random"
                    ? "Pick only from grade photos tagged with this type. Any grade photo if none are."
                    : "When the player has no photo, pick a grade photo tagged with this type."}
                </p>
              </div>
            )}

            {draft.mode === "fixed" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Library photo</p>
                {seniorPhotos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Upload a photo to the library first.
                  </p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Choose a photo">
                    {seniorPhotos.map((p) => {
                      const on = draft.photoId === p.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`Use photo ${p.id}${p.grade ? `, ${p.grade}` : ""}`}
                            onClick={() => setDraft({ ...draft, photoId: p.id })}
                            className={cn(
                              "relative block w-full overflow-hidden rounded-md border-2",
                              on ? "border-primary" : "border-transparent",
                            )}
                          >
                            <img
                              src={p.thumbUrl}
                              alt=""
                              className="aspect-square w-full object-cover"
                            />
                            {on && (
                              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" aria-hidden />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </EditDrawer>
    </SettingsCard>
  );
}
