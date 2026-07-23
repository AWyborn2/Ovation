import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Image as ImageIcon } from "lucide-react";
import { ShareCardModal } from "@/components/share-card-modal";
import { PackCard } from "@/components/pack-card";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import {
  CardFormRouter,
  PrefillPanel,
  buildCardInput,
  initialCardState,
  JUNIOR_CAPABLE,
  type CardFormState,
} from "@/components/card-forms";
import { useBrand } from "@/lib/brand-context";
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import type { CardKind, CardSize, MatchSummaryTeam } from "@/lib/share-card";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const SIZE_OPTIONS: { value: CardSize; label: string }[] = [
  { value: "square", label: "Feed square" },
  { value: "portrait", label: "Feed portrait" },
  { value: "story", label: "Story / TikTok" },
];

/** A short club label without a trailing "Cricket Club" suffix. */
const shortClubName = (name: string): string =>
  name.replace(/\s+Cricket Club$/i, "").trim() || name;

/** The current tenant's brand as the Match Summary club-team default. */
function teamFromBrand(brand: ClubBrand): MatchSummaryTeam {
  const accent = brand.primaryColour ?? DEFAULT_BRAND.primaryColour ?? "#94A3B8";
  return {
    name: shortClubName(brand.name ?? DEFAULT_BRAND.name),
    shortName: brand.shortName ?? null,
    primaryColor: brand.backgroundColour ?? DEFAULT_BRAND.backgroundColour ?? "#334155",
    secondaryColor: accent,
    textColor: accent,
    logoUrl: brand.logoUrl ?? null,
  };
}

/** Seed a kind's editable state, tailoring Match Summary to the tenant brand. */
function seedState(kind: CardKind, brand: ClubBrand): CardFormState {
  const state = initialCardState(kind);
  if (kind === "matchSummary") state.club = teamFromBrand(brand);
  return state;
}

export default function AdminSocialCreate() {
  const brand = useBrand();
  const [kind, setKind] = useState<CardKind>("matchSummary");
  const [state, setState] = useState<CardFormState>(() => seedState("matchSummary", brand));
  const [junior, setJunior] = useState(false);
  const [size, setSize] = useState<CardSize>("portrait");
  const [sponsorsOn, setSponsorsOn] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const juniorCapable = JUNIOR_CAPABLE.has(kind);

  const changeKind = (next: CardKind) => {
    setKind(next);
    setState(seedState(next, brand));
    setJunior(false);
  };

  const patchState = (patch: CardFormState) => setState((s) => ({ ...s, ...patch }));

  const input = useMemo(
    () => buildCardInput(kind, state, junior && juniorCapable),
    [kind, state, junior, juniorCapable],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Pick a card type, prefill it from your data where available, edit any
          field, and preview live before exporting.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-1">
            <Label>Card type</Label>
            <select
              className={selectClass}
              value={kind}
              onChange={(e) => changeKind(e.target.value as CardKind)}
            >
              {CARD_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {juniorCapable && (
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={junior} onCheckedChange={setJunior} />
              <Label className="text-sm">Junior (brown palette)</Label>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Editor + prefill */}
        <div className="space-y-6">
          <PrefillPanel kind={kind} onApply={patchState} />
          <Card>
            <CardHeader>
              <CardTitle>Card details</CardTitle>
            </CardHeader>
            <CardContent>
              <CardFormRouter kind={kind} state={state} setState={patchState} />
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Size</Label>
                  <select
                    className={selectClass + " w-44"}
                    value={size}
                    onChange={(e) => setSize(e.target.value as CardSize)}
                  >
                    {SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={sponsorsOn} onCheckedChange={setSponsorsOn} />
                  <Label className="text-xs">Sponsors</Label>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[380px] rounded-lg overflow-hidden border">
                <PackCard
                  input={input}
                  size={size}
                  sponsorsOn={sponsorsOn}
                  junior={junior && juniorCapable}
                  theme={null}
                />
              </div>

              <Button className="w-full" onClick={() => setModalOpen(true)}>
                <ImageIcon className="h-4 w-4 mr-2" />
                Preview &amp; export card
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ShareCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        input={input}
        engine="ondemand"
        playerId={null}
      />
    </div>
  );
}
