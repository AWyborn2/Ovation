import { Link } from "wouter";
import { Trophy, History, Palette, Smartphone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">Ovation</span>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Your cricket club's stats and history — beautifully, automatically.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Ovation gives any club its full record — stats, premierships, honour
            boards and milestones — on a branded site that stays current on its
            own. Pick your club and it's populated in seconds.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Find your club <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Free during the pilot — Peel Cricket Association clubs available now.
          </p>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready to see your club's history?
          </h2>
          <div className="mt-8">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Ovation. A white-label cricket stats
          platform.
        </div>
      </footer>
    </div>
  );
}
