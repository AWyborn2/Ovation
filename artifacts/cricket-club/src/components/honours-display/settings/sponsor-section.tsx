import { Link } from "wouter";
import { Megaphone, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdEditor } from "../editors";
import type { HonoursDisplayForm, SponsorSlideStyle } from "../use-honours-display-settings";

/** Sponsor strip / slides, kiosk sponsor selection and uploaded ad creatives. */
export function SponsorSection({ form }: { form: HonoursDisplayForm }) {
  const {
    sponsorStrip,
    setSponsorStrip,
    sponsorSlides,
    setSponsorSlides,
    sponsorSlideEvery,
    setSponsorSlideEvery,
    sponsorSlideStyle,
    setSponsorSlideStyle,
    sponsorIds,
    toggleSponsorId,
    sponsorsLoading,
    sponsors,
    activeSponsors,
    kioskAds,
    addAd,
    patchAd,
    removeAd,
  } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Sponsor advertising
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Show your club sponsors as in-built advertising on the clubroom TV. Logos come from the
          club sponsor library — manage them under{" "}
          <Link
            href="/admin/social/cards"
            className="font-medium text-primary underline underline-offset-2"
          >
            Social Media Studio → Cards
          </Link>
          .
        </p>

        <div className="space-y-4 max-w-2xl">
          <label className="flex items-start gap-3">
            <Switch
              checked={sponsorStrip}
              onCheckedChange={setSponsorStrip}
              data-testid="switch-sponsor-strip"
            />
            <span>
              <span className="text-sm font-medium">Sponsor strip</span>
              <span className="block text-xs text-muted-foreground">
                A permanent “Proudly supported by” logo bar pinned to the bottom of every board
                screen.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <Switch
              checked={sponsorSlides}
              onCheckedChange={setSponsorSlides}
              data-testid="switch-sponsor-slides"
            />
            <span>
              <span className="text-sm font-medium">Sponsor slides</span>
              <span className="block text-xs text-muted-foreground">
                Full-screen sponsor slides rotated in between honour boards.
              </span>
            </span>
          </label>

          {sponsorSlides && (
            <div className="pl-12 space-y-2">
              <label className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Show a sponsor slide after every
                </span>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={sponsorSlideEvery}
                  onChange={(e) => setSponsorSlideEvery(e.target.value)}
                  data-testid="input-sponsor-every"
                />
                <span className="text-xs text-muted-foreground">board(s)</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Slide style</span>
                <select
                  className="px-2 py-1 rounded border bg-background text-sm"
                  value={sponsorSlideStyle}
                  onChange={(e) => setSponsorSlideStyle(e.target.value as SponsorSlideStyle)}
                  data-testid="select-sponsor-slide-style"
                >
                  <option value="grid">One grid of all sponsors</option>
                  <option value="single">One sponsor per slide (rotating)</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Sponsors shown on the kiosk{" "}
            {activeSponsors.length > 0 && (
              <span className="text-muted-foreground/70">({activeSponsors.length} active)</span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Click a sponsor to include/exclude it from the kiosk. None selected = show all active
            sponsors.
          </p>
          {sponsorsLoading ? (
            <p className="text-xs text-muted-foreground">Loading sponsors…</p>
          ) : activeSponsors.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {sponsors.length === 0
                ? "No sponsors yet — add logos in the sponsor library and they'll appear here and on the kiosk."
                : "No sponsors are currently within their active date window, so none will show on the kiosk."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {activeSponsors.map((s) => {
                const on = sponsorIds.length === 0 || sponsorIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSponsorId(s.id)}
                    className={`flex items-center justify-center bg-white rounded border p-2 h-14 w-28 transition ${
                      on ? "ring-2 ring-primary" : "opacity-40 hover:opacity-70"
                    }`}
                    title={`${s.name}${on ? " (showing)" : " (hidden)"}`}
                    data-testid={`kiosk-sponsor-${s.id}`}
                  >
                    <img
                      src={s.logoUrl}
                      alt={s.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Ad creatives
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Upload your own full-screen ad images (designed promos, not just logos). Add them to the
            rotation in the kiosk sequence above.
          </p>
          <div className="space-y-3 max-w-2xl">
            {kioskAds.map((ad) => (
              <AdEditor
                key={ad.id}
                ad={ad}
                onPatch={(patch) => patchAd(ad.id, patch)}
                onRemove={() => removeAd(ad.id)}
              />
            ))}
            {kioskAds.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No ad creatives yet.</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => addAd({ id: `ad:${crypto.randomUUID()}`, name: "", imageUrl: "" })}
            data-testid="button-add-ad"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add ad creative
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
