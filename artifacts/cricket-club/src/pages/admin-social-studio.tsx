import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeekendCarousel } from "@/components/weekend-carousel";

/**
 * The Studio tab. Design packs moved to Templates → Looks and the post
 * settings to the Settings tab; what's left points there and launches the
 * on-demand carousel sets.
 */
export default function AdminSocialStudio() {
  return (
    <div className="space-y-8">
      {/* Each card kind's design: the club's default templates, in the template library (ADR-011) */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">Card designs</h2>
            <p className="text-sm text-muted-foreground">
              Every card is drawn with your club&rsquo;s template for its kind. Pick, edit and
              manage them in the template library, and choose design packs and club colours under
              Looks.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/admin/social/template-library">Open the template library</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Card names, card content, match summary settings and the old
          upload-based backgrounds live on the Settings tab. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">Post settings</h2>
            <p className="text-sm text-muted-foreground">
              Card names, card content and match summary carousels are on the Settings tab.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/social/settings">Open settings</Link>
          </Button>
        </CardContent>
      </Card>

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
    </div>
  );
}
