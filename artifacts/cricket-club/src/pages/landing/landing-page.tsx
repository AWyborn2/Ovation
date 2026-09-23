import { Link } from "wouter";
import { Trophy, History, Palette, Smartphone, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/broadcast";
import { apexDomain } from "@/lib/apex-domain";
import { PlatformFooter, PlatformHeader, PlatformSectionHeading } from "./platform-chrome";

/**
 * Ovation marketing / landing page. Rendered on the apex host (platform mode),
 * where `GET /tenant-brand` returns `{ platform: true }` and no tenant resolves.
 * Standalone chrome (no club Layout) so it isn't themed with a tenant's colours.
 */

const FEATURES = [
  {
    icon: History,
    title: "Your whole history, instantly",
    body: "Every match, every innings, every record — drawn from the shared association database and kept current automatically. No spreadsheets to maintain.",
  },
  {
    icon: Trophy,
    title: "Honour boards & milestones",
    body: "Premierships, life members, club records and career milestones, presented on a site your members will actually want to browse.",
  },
  {
    icon: Palette,
    title: "Branded as your own",
    body: "Your club's name, logo and colours throughout — on your own subdomain. It looks like your site, because it is.",
  },
  {
    icon: Smartphone,
    title: "Web, mobile & clubroom TV",
    body: "The same stats on the web, a mobile app, and a rotating clubroom-TV display for match days.",
  },
];

function PricingLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" />
      <span>{children}</span>
    </div>
  );
}

/** Halls Head's live site, on this same apex, for the social-proof link. */
function hallsHeadUrl(): string {
  return `https://hallshead.${apexDomain()}`;
}

const SECTION = "mx-auto max-w-[1280px] px-[var(--pad)] py-[clamp(48px,7vw,88px)]";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PlatformHeader />

      <main>
        <PageHero
          variant="home"
          contentClassName="pt-[clamp(72px,11vw,140px)] pb-[clamp(40px,6vw,72px)]"
        >
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--primary))]">
              White-label cricket stats
            </div>
            <h1 className="mt-3 text-[clamp(44px,6.4vw,88px)] leading-[0.95]">
              Your cricket club's stats and history — beautifully, automatically.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/75">
              Ovation gives any club its full record — stats, premierships, honour boards and
              milestones — on a branded site that stays current on its own. Pick your club and it's
              populated in seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link href="/signup">
                  Find your club <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/directory">Browse clubs</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-white/60">
              Free during the pilot — Peel Cricket Association clubs available now.
            </p>
          </div>
        </PageHero>

        <section className={SECTION}>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 rounded-lg border bg-card p-[clamp(16px,2vw,24px)]"
                data-testid="landing-feature"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary-text">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-[22px] leading-none">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className={SECTION}>
            <PlatformSectionHeading eyebrow="Pricing" title="Pricing">
              Free during the pilot. Every plan gets your full history and branding.
            </PlatformSectionHeading>
            <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-6">
                <h3 className="text-[28px] leading-none">Free</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <PricingLine>Full club history, stats and records</PricingLine>
                  <PricingLine>Your own logo, colours and favicon</PricingLine>
                  <PricingLine>A club.ovation.app address</PricingLine>
                </div>
              </div>
              <div className="rounded-lg border border-primary/50 bg-card p-6 shadow-[var(--shadow-pop)]">
                <h3 className="text-[28px] leading-none">Pro</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <PricingLine>Everything in Free</PricingLine>
                  <PricingLine>Your own domain (e.g. yourclub.com.au)</PricingLine>
                  <p className="pt-2 text-muted-foreground">
                    <a href="mailto:hello@ovation.app" className="underline underline-offset-2">
                      Contact us
                    </a>{" "}
                    to upgrade.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className={`${SECTION} text-center`}>
            <PlatformSectionHeading eyebrow="Live now" title="See it in action">
              Halls Head Cricket Club runs its full site on Ovation — stats, honour boards and
              history, kept current automatically.
            </PlatformSectionHeading>
            <div className="mt-6">
              <Button asChild variant="outline" className="gap-2">
                <a href={hallsHeadUrl()} target="_blank" rel="noopener noreferrer">
                  Visit Halls Head's site <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className={SECTION}>
            <PlatformSectionHeading title="Why Ovation over a Facebook page or a spreadsheet?">
              Your history stays current automatically, drawn from the shared association database —
              no one has to keep re-entering scores or chasing down old spreadsheets.
            </PlatformSectionHeading>
          </div>
        </section>

        <section className="border-t">
          <div className={`${SECTION} text-center`}>
            <PlatformSectionHeading title="Ready to see your club's history?" />
            <div className="mt-8">
              <Button asChild size="lg" className="gap-2">
                <Link href="/signup">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
