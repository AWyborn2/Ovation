import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSocialSettings,
  useListCardTemplates,
  useDeleteCardTemplate,
  getListCardTemplatesQueryKey,
  type CardTemplate,
  type SocialSettingsBundle,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListClubPhotos,
  getListClubPhotosQueryKey,
  type CardTheme as ApiCardTheme,
  type ClubPhoto,
} from "@workspace/api-client-react";
import { packPreviewPhoto } from "@/lib/gallery-photo";
import { useHeroImage } from "@/lib/use-hero-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { usePackSelection } from "@/lib/use-pack-selection";
import { usePackColourModes } from "@/lib/use-pack-colour-modes";
import { DesignPacksSection } from "@/components/social-studio/design-packs-section";
import { CardNamesSection } from "@/components/social-studio/card-names-section";
import { CardContentSection } from "@/components/social-studio/card-content-section";
import { MatchSummarySettings } from "@/components/social-studio/match-summary-settings";
import { THUMB_SIZE, kindLabel, type CardKind } from "@/lib/social-studio";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { SIZES, type ShareCardInput } from "@/lib/share-card";
import {
  buildPackData,
  tenantHashtag,
  kindSponsors,
  presentingSponsorName,
  shortClubName,
} from "@/lib/pack-card-data";
import { type PackCardData } from "@/lib/pack-render";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState, QueryError } from "@/components/data-states";
import { WeekendCarousel } from "@/components/weekend-carousel";

export default function AdminSocialStudio() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const templatesQ = useListCardTemplates();

  const [error, setError] = useState<string | null>(null);

  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];

  // Everything about the tenant's design-pack choice — what each kind resolves
  // to, what it could resolve to, and the two write paths that change it.
  const packs = usePackSelection({ templates, confirm });
  // Per-pack "Club colours / Pack's own look" (writes the settings bundle).
  const colourModes = usePackColourModes(bundle);
  // Which of the TENANT'S OWN templates (if any) is the default for each card
  // kind. Pack rows share the `defaultForKinds` column but are deliberately
  // excluded: a pack claim is reported by the pack selector below, and only
  // there — one surface per decision.

  // --- Tenant branding for the card-type gallery -----------------------------
  // The gallery answers "what does a Match Result card look like FOR US", so
  // thumbnails render the tenant's own logo, name, hashtag, sponsors and
  // colours. Only the card *content* stays sample data (`sampleCardInput`) — a
  // thumbnail is a style preview, not a real card.
  //
  // Without this the thumbnails fall through to the Broadcast-Dark sample
  // literals, so every tenant browsed a gallery branded "HALLS HEAD".
  const themesQ = useListCardThemes({
    query: { queryKey: getListCardThemesQueryKey() },
  });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const galleryTheme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;

  // Sample CONTENT speaks as the tenant too: "Mandurah won by 5 wickets", the
  // ladder's highlighted row is Mandurah's — not a generic "Sample Club". The
  // thumbnails then read as "our cards", not a stranger's.
  const galleryClubName = shortClubName(bundle?.brand?.name ?? "") || undefined;

  // One sample input per card kind, memoised for the same reason as the payload
  // below: `sampleCardInput` deep-clones whenever a club name is supplied, so
  // calling it inline in JSX handed <PackCard> a fresh `input` identity on every
  // render. `input` is one of that component's html-memo keys, so all 23 mounts
  // re-ran the expensive renderPackCard on any unrelated state change.
  const galleryInputByKind = useMemo(() => {
    const out = new Map<CardKind, ShareCardInput>();
    for (const o of CARD_KIND_OPTIONS) {
      out.set(o.value, sampleCardInput(o.value, galleryClubName));
    }
    return out;
  }, [galleryClubName]);

  // Previews show a photo in each pack's photo slot so a design is seen as it
  // will post: the club's home hero image, else (no hero set) its newest team
  // shot or library photo.
  const heroImage = useHeroImage("home");
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey(), enabled: !heroImage },
  });
  const galleryPhoto = packPreviewPhoto(heroImage, photosQ.data as ClubPhoto[] | undefined);

  // One payload per card kind, memoised so <PackCard>'s html memo (keyed on
  // `data` identity) is not defeated on every parent re-render.
  const galleryDataByKind = useMemo(() => {
    const sponsorsOn = !!bundle?.settings.sponsorsEnabled;
    const out = new Map<string, PackCardData>();
    for (const o of CARD_KIND_OPTIONS) {
      out.set(
        o.value,
        buildPackData({
          brand: bundle?.brand,
          hashtag: tenantHashtag(bundle),
          sponsors: kindSponsors(bundle, o.value, sponsorsOn),
          presentingSponsorName: presentingSponsorName(bundle, sponsorsOn),
          photoUrl: galleryPhoto,
          packColourModes: bundle?.settings.packColourModes,
          names: bundle?.cardNames,
        }),
      );
    }
    return out;
  }, [bundle, galleryPhoto]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() });
  };
  const onError = (e: unknown) => setError(handleAdminMutationError(e));

  const deleteMut = useDeleteCardTemplate({
    mutation: { onSuccess: invalidate, onError },
  });

  // --- Design pack selection -------------------------------------------------
  // One write path for both switcher surfaces, and ONE PATCH per action, to one
  // canonical row per pack. The server's `clearDefaultKinds` strips the claimed
  // kinds from every other row in the tenant, so a second write would undo the
  // first — three sequential writes across a pack's square/portrait/story rows
  // would leave only the last one claiming anything.

  const handleDelete = async (t: CardTemplate) => {
    if (
      !(await confirm({
        title: "Delete template",
        description: `Delete "${t.name}"? Any card types it was the default for will fall back to the built-in design.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    deleteMut.mutate({ id: t.id });
  };

  if (settingsQ.isError || templatesQ.isError) {
    return (
      <QueryError
        onRetry={() => {
          settingsQ.refetch();
          templatesQ.refetch();
        }}
      />
    );
  }
  if (settingsQ.isLoading || templatesQ.isLoading) {
    return <LoadingState label="Loading studio…" />;
  }

  // Uploaded backgrounds only. Pack rows are code-rendered designs, not
  // uploads: they carry no background image, can't be opened in the Cards tab,
  // and Delete on one isn't durable (the server re-creates it on next start).
  const bgTemplates = templates.filter((t) => t.source === "background");

  return (
    <div className="space-y-8">
      {/* Two independent error sources, one banner. `packs.error` was
          unreachable for a release: the #110 split gave the pack hook its own
          mutation and its own error state, and nothing was ever wired to read
          it. There is no toast and no MutationCache handler, so a failing pack
          write showed as a spinner that changed nothing — which is exactly how
          a 100%-reproducible 500 from `clearDefaultKinds` stayed invisible.
          The selector is controlled off server state and always snaps back on
          the render `setPendingKind` forces, so without this banner a failure
          is indistinguishable from success. */}
      {(error || packs.error || colourModes.error) && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? packs.error ?? colourModes.error}
        </p>
      )}

      {/* Design packs — the bulk path, met before the per-kind selectors */}
      <DesignPacksSection
        selection={packs}
        previewInput={
          galleryInputByKind.get("matchSummary") ?? sampleCardInput("matchSummary", galleryClubName)
        }
        previewData={galleryDataByKind.get("matchSummary") ?? null}
        theme={galleryTheme}
        colourModes={colourModes}
      />

      {/* Each card kind's design: the club's default templates, in the template library (ADR-011) */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">Card designs</h2>
            <p className="text-sm text-muted-foreground">
              Every card is drawn with your club&rsquo;s template for its kind. Pick, edit and
              manage them in the template library.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/admin/social/template-library">Open the template library</Link>
          </Button>
        </CardContent>
      </Card>

      {/* The names every card prints for each club and grade (ADR-010 P1). */}
      <CardNamesSection />

      {/* How much each match day card says: presets and per-field switches (ADR-010 P2). */}
      <CardContentSection />

      {/* Templates: new designs are made in the Studio editor (U18). Layer
          templates from the retired layout editor still render and can be
          deleted, but no longer edited. */}
      <section className="space-y-3">
        {bgTemplates.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">
              Background templates (upload-based — edit in the Cards tab)
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {bgTemplates.map((t) => (
                <Card key={t.id} className="overflow-hidden">
                  <div
                    className="flex items-center justify-center overflow-hidden rounded bg-muted"
                    style={{
                      aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}`,
                    }}
                  >
                    {t.backgroundImageUrl ? (
                      <img
                        src={t.backgroundImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No background</span>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {(t.cardKinds?.length ?? 0) === 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          All cards
                        </Badge>
                      ) : (
                        t.cardKinds.map((k) => (
                          <Badge
                            key={k}
                            variant={t.defaultForKinds?.includes(k) ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {kindLabel(k)}
                            {t.defaultForKinds?.includes(k) ? " ★" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-full text-xs text-destructive"
                      onClick={() => handleDelete(t)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Weekend match-day carousel entry */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">On-demand carousel sets</h2>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Build a branded set with a cover, one slide per team or match and a sponsors close.
              Send it to review, then export the saved set as one ZIP.
            </p>
            <div className="flex flex-wrap gap-2">
              <WeekendCarousel />
              <WeekendCarousel initialType="teamList" />
              <WeekendCarousel initialType="results" />
              <WeekendCarousel initialType="matchSummary" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Match summary auto-draft settings */}
      {bundle && (
        <MatchSummarySettings
          settings={bundle.settings}
          onSaved={() =>
            qc.invalidateQueries({
              queryKey: getGetSocialSettingsQueryKey(),
            })
          }
        />
      )}
    </div>
  );
}
