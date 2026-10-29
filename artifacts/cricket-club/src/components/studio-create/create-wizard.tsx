/**
 * New Studio → Create (studio-create-consolidation S2). One flow for every
 * card: what, one or many, fill from, look and size. It ends by making a draft
 * (awaiting review, never auto-posted) and opening it straight in the editor,
 * with no form-and-preview page in between. The editor is the existing one.
 */
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  type CreateSocialDraftRequest,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrefillPanel, buildCardInput, type CardFormState } from "@/components/card-forms";
import { seedState } from "@/components/card-forms/seed";
import {
  BLANK_DESIGN_KIND,
  CREATE_SIZES,
  TemplateStep,
  blankDesign,
  useStartDesign,
} from "@/components/studio-home/create-picker";
import { useLibraryPreviewData } from "@/components/template-library/previews";
import { useBrand } from "@/lib/brand-context";
import { useEntitlements } from "@/lib/entitlements";
import { FromJuniorMatch, JuniorMilestones } from "@/components/junior-social/pickers";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { kindLabel } from "@/lib/social-studio";
import { splitPostedKinds } from "@/lib/studio-home";
import { SIZES, type CardKind, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import {
  CAROUSEL_SET_OF,
  SENIOR_KINDS,
  STEP_LABELS,
  carouselOnly,
  kindsFor,
  createSearch,
  nextStep,
  parseCreateState,
  prevStep,
  stepsFor,
  type CreateState,
  type CreateTeam,
} from "./model";
import { CarouselFlow } from "./carousel-flow";
import { JuniorTeamPicker } from "./junior-team-picker";
import { TeamPicker } from "./team-picker";

const CREATE_PATH = "/admin/social/create";

/** The card being made: its filled-in state and the player it is about. */
type Filled = { kind: CardKind; state: CardFormState; playerId: number | null; filled: boolean };

/** A kind's state as the server built it: sample keys it lacks are cleared. */
function fromServer(kind: CardKind, seed: CardFormState, input: Record<string, unknown>) {
  const { kind: _kind, ...card } = input;
  const listed = !Array.isArray(card.players) || card.players.length > 0;
  // No saved list yet: keep the sample players, so the card still has names to edit.
  if (!listed) delete card.players;
  const cleared = Object.fromEntries(
    Object.keys(seed)
      .filter((k) => !(k in card) && (listed || k !== "players"))
      .map((k) => [k, undefined]),
  );
  return { ...seed, ...cleared, ...card } as CardFormState;
}

export function CreateWizard() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const brand = useBrand();
  const preview = useLibraryPreviewData();
  const juniorsOn = useEntitlements().juniors;
  const s = parseCreateState(search, juniorsOn);
  const junior = s.team === "junior";
  const go = (patch: Partial<CreateState>) => {
    const qs = createSearch({ ...s, ...patch });
    navigate(qs ? `${CREATE_PATH}?${qs}` : CREATE_PATH);
  };

  const [filled, setFilled] = useState<Filled | null>(null);
  const [size, setSize] = useState<CardSize>("square");
  const design = useStartDesign();

  const kind = s.kind && s.kind !== "blank" ? s.kind : null;
  // A refresh mid-way loses the filled card: start again from the kind's sample.
  const card = useMemo<Filled | null>(
    () =>
      kind
        ? filled?.kind === kind
          ? filled
          : { kind, state: seedState(kind, brand), playerId: null, filled: false }
        : null,
    [kind, filled, brand],
  );
  const input = useMemo<ShareCardInput | null>(
    () => (card ? buildCardInput(card.kind, card.state, junior) : null),
    [card, junior],
  );

  const fill = (state: CardFormState, playerId: number | null = card?.playerId ?? null) => {
    if (!kind) return;
    setFilled({ kind, state, playerId, filled: true });
    go({ step: nextStep(s) });
  };

  const startBlank = (sz: CardSize) =>
    design.start(
      {
        cardInput: buildCardInput(
          BLANK_DESIGN_KIND as CardKind,
          seedState(BLANK_DESIGN_KIND as CardKind, brand),
          false,
        ) as unknown as Record<string, unknown>,
        packId: BLANK_PACK_ID,
        adjustments: blankDesign(
          BLANK_DESIGN_KIND,
        ) as unknown as CreateSocialDraftRequest["adjustments"],
      },
      sz,
    );

  const steps = stepsFor(s.kind, s.team);
  const carousel = s.mode === "many" && kind !== null && (s.step === 3 || s.step === 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Create</h2>
        {s.step !== 1 && (
          <Button variant="outline" size="sm" onClick={() => navigate(CREATE_PATH)}>
            Start over
          </Button>
        )}
      </div>

      <ol aria-label="Steps" className="flex flex-wrap gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as CreateState["step"];
          const skipped = s.kind !== null && !steps.includes(n);
          const on = s.step === n;
          const done = !skipped && n < s.step;
          return (
            <li
              key={label}
              aria-current={on ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm",
                on && "bg-primary/15 font-semibold text-primary-text",
                !on && (done ? "text-foreground" : "text-muted-foreground"),
                skipped && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "inline-grid h-6 w-6 place-items-center rounded-full text-xs font-bold",
                  on || done ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {s.step === 1 && (
        <KindStep
          team={s.team}
          juniorsOn={juniorsOn}
          onTeam={(team) => {
            setFilled(null);
            go({ team, kind: null, mode: "one", step: 1 });
          }}
          picked={s.kind}
          onPick={(k) => {
            setFilled(null);
            const mode = carouselOnly(s.team, k) ? ("many" as const) : ("one" as const);
            go({ kind: k, mode, step: nextStep({ ...s, kind: k, mode }) });
          }}
        />
      )}

      {s.step === 2 && kind && (
        <ModeStep
          kind={kind}
          mode={s.mode}
          onPick={(mode) => {
            setFilled(null);
            go({ mode, step: 3 });
          }}
        />
      )}

      {carousel && (
        <CarouselFlow
          key={`${s.team}-${kind}`}
          setType={CAROUSEL_SET_OF[kind]!}
          audience={junior ? "junior" : "senior"}
          step={s.step as 3 | 4}
          onNext={() => go({ step: 4 })}
        />
      )}

      {!carousel && s.step === 3 && kind && card && (
        <section aria-labelledby="fill-heading" className="space-y-4">
          <h3 id="fill-heading" className="text-lg font-semibold">
            {kind === "teamList" ? "Which team?" : "Fill it from"}
          </h3>
          {junior ? (
            <JuniorSource kind={kind} onFill={(i) => fill(fromServer(kind, card.state, i))} />
          ) : kind === "teamList" ? (
            <TeamPicker onPick={(i) => fill(fromServer(kind, seedState(kind, brand), i))} />
          ) : (
            <PrefillPanel
              kind={kind}
              onApply={(patch) => fill({ ...card.state, ...patch })}
              onPlayer={(p) => setFilled({ ...card, playerId: p.id })}
            />
          )}
          <Button variant="outline" onClick={() => fill(card.state)}>
            {kind === "teamList" ? "Start blank: type the team in the editor" : "Start blank"}
          </Button>
        </section>
      )}

      {!carousel && s.step === 4 && (
        <section aria-labelledby="look-heading" className="space-y-4">
          <h3 id="look-heading" className="text-lg font-semibold">
            {s.kind === "blank" ? "Pick a size" : "Pick a look and size"}
          </h3>
          <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-2">
            {CREATE_SIZES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={size === o.value}
                disabled={design.busy}
                onClick={() => (s.kind === "blank" ? startBlank(o.value) : setSize(o.value))}
                className={cn(
                  "flex w-24 flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium",
                  size === o.value && s.kind !== "blank"
                    ? "border-primary ring-1 ring-primary"
                    : "border-border",
                )}
              >
                <span
                  aria-hidden
                  className="block w-10 rounded-sm bg-primary/20"
                  style={{ aspectRatio: `${SIZES[o.value].w} / ${SIZES[o.value].h}` }}
                />
                {o.label}
              </button>
            ))}
          </div>
          {kind && card && input && (
            <>
              {!card.filled && (
                <p className="text-sm text-muted-foreground">
                  Filled with sample text: change it in the editor.
                </p>
              )}
              <TemplateStep
                kind={kind}
                size={size}
                preview={preview}
                input={input}
                busy={design.busy}
                start={(body) =>
                  design.start(
                    card.playerId != null ? { ...body, subjectPlayerId: card.playerId } : body,
                    size,
                  )
                }
              />
            </>
          )}
          {design.error && (
            <p role="alert" className="text-sm text-destructive">
              {design.error}
            </p>
          )}
        </section>
      )}

      {s.step !== 1 && (
        <div className="flex justify-between border-t border-border pt-4">
          <Button variant="outline" onClick={() => go({ step: prevStep(s) })}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Step 3 for a junior card: the junior picker for its kind. Junior data only, from
 * the `/juniors` routes.
 */
function JuniorSource({
  kind,
  onFill,
}: {
  kind: CardKind;
  onFill: (input: Record<string, unknown>) => void;
}) {
  const asInput = (i: ShareCardInput) => i as unknown as Record<string, unknown>;
  if (kind === "teamList") return <JuniorTeamPicker onPick={onFill} />;
  if (kind === "matchSummary")
    return <FromJuniorMatch actionLabel="Use this match" onOpen={(i) => onFill(asInput(i))} />;
  return <JuniorMilestones onOpen={(i) => onFill(asInput(i))} />;
}

/** Step 2: one card or a carousel (for a Team List, one team or the whole round). */
function ModeStep({
  kind,
  mode,
  onPick,
}: {
  kind: CardKind;
  mode: CreateState["mode"];
  onPick: (mode: CreateState["mode"]) => void;
}) {
  const team = kind === "teamList";
  const options = [
    {
      mode: "one" as const,
      label: team ? "One team" : "Single card",
      hint: team ? "One team's list, from its fixture" : "One card at your chosen size",
    },
    {
      mode: "many" as const,
      label: team ? "Whole round (carousel)" : "Carousel set",
      hint: team
        ? "Every team playing, a slide each, with a cover and your sponsors"
        : "A cover, a slide for each game, then your sponsors",
    },
  ];
  return (
    <section aria-labelledby="mode-heading" className="space-y-4">
      <h3 id="mode-heading" className="text-lg font-semibold">
        {kindLabel(kind)}: one card or a carousel?
      </h3>
      <ul className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.mode}>
            <button
              type="button"
              aria-pressed={mode === o.mode}
              onClick={() => onPick(o.mode)}
              className={cn(
                "flex h-full w-full flex-col items-start gap-1 rounded-xl border bg-card p-5 text-left hover:border-primary",
                mode === o.mode ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <span className="text-base font-semibold">{o.label}</span>
              <span className="text-sm text-muted-foreground">{o.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const JUNIOR_LABELS: Partial<Record<CardKind, string>> = {
  matchDay: "Junior Match Day",
  teamList: "Junior Team List",
  matchSummary: "Junior Match Summary",
  milestone: "Junior Milestone",
};

/**
 * Step 1: Seniors or Juniors, then the kinds. Seniors see the kinds the club posts
 * first, the rest under More, then Blank design; Juniors see the junior kinds.
 */
function KindStep({
  team,
  juniorsOn,
  onTeam,
  picked,
  onPick,
}: {
  team: CreateTeam;
  juniorsOn: boolean;
  onTeam: (team: CreateTeam) => void;
  picked: CreateState["kind"];
  onPick: (kind: CardKind | "blank") => void;
}) {
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const { posted } = splitPostedKinds(
    bundle?.settings.postingPlan,
    !!bundle?.settings.postingPlanSaved,
  );
  const junior = team === "junior";
  const first = junior ? kindsFor("junior") : posted.filter((k) => SENIOR_KINDS.includes(k));
  const rest = junior ? [] : SENIOR_KINDS.filter((k) => !first.includes(k));
  const [more, setMore] = useState(rest.includes(picked as CardKind));

  const tile = (k: CardKind | "blank") => (
    <li key={k}>
      <button
        type="button"
        aria-pressed={picked === k}
        onClick={() => onPick(k)}
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-xl border bg-card p-4 text-left font-semibold hover:border-primary",
          picked === k ? "border-primary ring-1 ring-primary" : "border-border",
        )}
      >
        {k === "blank" && <Plus className="h-4 w-4 text-primary-text" aria-hidden />}
        {k === "blank"
          ? "Blank design"
          : junior
            ? (JUNIOR_LABELS[k] ?? kindLabel(k))
            : kindLabel(k)}
      </button>
    </li>
  );

  return (
    <section aria-labelledby="what-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="what-heading" className="text-lg font-semibold">
          What are you making?
        </h3>
        {juniorsOn && (
          <div
            role="group"
            aria-label="Teams"
            className="flex rounded-full border border-border bg-card p-1"
          >
            {(["senior", "junior"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={team === t}
                onClick={() => onTeam(t)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold",
                  team === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t === "senior" ? "Seniors" : "Juniors"}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {first.map(tile)}
        {!junior && tile("blank")}
      </ul>
      <p className="text-sm text-muted-foreground">
        {junior
          ? "Junior cards use junior data only, and never show a child's photo without consent."
          : juniorsOn
            ? "Switch to Juniors for junior team lists, matches and milestones."
            : null}
      </p>
      {rest.length > 0 && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? "Fewer card types" : "More card types"}
          </Button>
          {more && (
            <ul
              aria-label="More card types"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {rest.map(tile)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
