import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarClock, Inbox, LayoutTemplate, Settings } from "lucide-react";
import { useLibraryPreviewData } from "@/components/template-library/previews";
import { HomeHero } from "@/components/studio-home/home-hero";
import { CreateRow } from "@/components/studio-home/create-row";
import { CreatePicker } from "@/components/studio-home/create-picker";
import { ContinueDesigning, YourDesigns } from "@/components/studio-home/recent-designs";
import { TemplatesStrip } from "@/components/studio-home/templates-strip";
import type { CardKind } from "@/lib/social-studio";

const QUICK_LINKS = [
  { href: "/admin/social/queue", label: "Queue", icon: Inbox },
  { href: "/admin/social/plan", label: "Posting plan", icon: CalendarClock },
  { href: "/admin/social/template-library", label: "Templates", icon: LayoutTemplate },
  { href: "/admin/social/settings", label: "Settings", icon: Settings },
];

/**
 * Social Media Studio home, laid out like Canva's: search, create something
 * new, pick up recent work, templates for the club, and quick links. Design
 * packs live in Templates → Looks and post settings on the Settings tab.
 * `/admin/social/designs` shows every design ("See all").
 */
export default function AdminSocialStudio() {
  const [location] = useLocation();
  const preview = useLibraryPreviewData();
  const [target, setTarget] = useState<{ kind: string } | { blank: true } | null>(null);
  const pickKind = (kind: CardKind) => setTarget({ kind });

  if (location === "/admin/social/designs") return <YourDesigns preview={preview} />;

  return (
    <div className="space-y-8">
      <HomeHero preview={preview} onPickKind={pickKind} />
      <CreateRow onPickKind={pickKind} onBlank={() => setTarget({ blank: true })} />
      <ContinueDesigning preview={preview} />
      <TemplatesStrip preview={preview} />
      <nav aria-label="Studio shortcuts" className="flex flex-wrap gap-2">
        {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bc-lift inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
          >
            <Icon className="h-4 w-4 text-primary-text" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <CreatePicker target={target} preview={preview} onClose={() => setTarget(null)} />
    </div>
  );
}
