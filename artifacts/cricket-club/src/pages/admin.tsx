import { Link } from "wouter";
import { HelpCircle, Palette } from "lucide-react";
import { PageHeader, PageStack } from "@/components/broadcast";
import { Button } from "@/components/ui/button";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import {
  useGetTourContent,
  useGetTenantBrand,
  type TenantBrand,
  type PlatformBrand,
} from "@workspace/api-client-react";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { navIcon } from "@/lib/nav-icons";
import { launchAdminTour } from "@/lib/tour";
import { NeedsAttention } from "@/components/admin-hub/needs-attention";

/**
 * Whether the tenant's resolved brand is still the neutral default -- computed
 * from the resolved brand (which already accounts for the clubs-register
 * fallback), not raw tenant-row columns, so a club whose branding actually
 * comes from its central club record never sees a false "finish setting up"
 * prompt.
 */
export function isUnbranded(brand: TenantBrand | PlatformBrand | undefined): boolean {
  if (!brand || "platform" in brand) return false;
  return (
    (brand.logoUrl ?? null) === (DEFAULT_BRAND.logoUrl ?? null) &&
    (brand.backgroundColour ?? null) === (DEFAULT_BRAND.backgroundColour ?? null) &&
    (brand.primaryColour ?? null) === (DEFAULT_BRAND.primaryColour ?? null) &&
    (brand.juniorsColour ?? null) === (DEFAULT_BRAND.juniorsColour ?? null)
  );
}

function FinishSetupBanner() {
  const brandQ = useGetTenantBrand();
  if (!isUnbranded(brandQ.data)) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary-text">
          <Palette className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold">Finish setting up your club</p>
          <p className="text-sm text-muted-foreground">
            Add your logo and brand colours so your site looks like your own club.
          </p>
        </div>
      </div>
      <Link href="/admin/settings/branding">
        <Button size="sm" data-testid="button-finish-branding">
          Set up branding
        </Button>
      </Link>
    </section>
  );
}

const TILES_FALLBACK: ResolvedNavItem[] = [
  {
    label: "Social Media Studio",
    target: "/admin/social",
    isExternal: false,
    iconKey: "image",
    description:
      "Share-card factory, card builders, trading cards, junior cards and the review queue.",
  },
  {
    label: "Display & Settings",
    target: "/admin/settings",
    isExternal: false,
    iconKey: "settings",
    description:
      "Defaults for Matches, Records, honour & milestone boards, junior matches and site navigation.",
  },
  {
    label: "People",
    target: "/admin/people",
    isExternal: false,
    iconKey: "users",
    description:
      "Players, stats, committee, captains, junior office bearers and non-player officials.",
  },
  {
    label: "Honours & Records",
    target: "/admin/honours",
    isExternal: false,
    iconKey: "trophy",
    description:
      "Premierships, awards, Team of the Decade, cap register, life members and junior premierships.",
  },
  {
    label: "Import CSV",
    target: "/admin/import",
    isExternal: false,
    iconKey: "upload",
    description: "Upload a PlayCricket combined CSV or a single match scorecard.",
  },
  {
    label: "Admin users",
    target: "/admin/users",
    isExternal: false,
    iconKey: "userCog",
    description: "Add, rename, reset passwords, remove admins.",
  },
];

export default function AdminHub() {
  const tiles = useNavSurface("admin_tiles", TILES_FALLBACK);
  const tourContentQ = useGetTourContent();
  return (
    <PageStack>
      <FinishSetupBanner />
      <PageHeader
        eyebrow="Back office"
        title="Admin"
        subtitle="Manage club data and the public honour boards."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => launchAdminTour(tourContentQ.data)}
            data-testid="admin-tour-start"
            className="gap-1.5"
          >
            <HelpCircle className="h-4 w-4" />
            Take the admin tour
          </Button>
        }
      />
      <NeedsAttention />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, idx) => {
          const Icon = navIcon(t.iconKey);
          const card = (
            <div
              className="bc-lift flex h-full flex-col gap-3 rounded-lg border bg-card p-5 text-card-foreground"
              data-testid="admin-hub-tile"
            >
              {Icon && (
                <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary-text">
                  <Icon className="h-5 w-5" />
                </span>
              )}
              <h2 className="text-[22px] leading-none">{t.label}</h2>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>
          );
          return t.isExternal ? (
            <a key={`${t.target}-${idx}`} href={t.target} target="_blank" rel="noopener noreferrer">
              {card}
            </a>
          ) : (
            <Link key={`${t.target}-${idx}`} href={t.target}>
              {card}
            </Link>
          );
        })}
      </div>
    </PageStack>
  );
}
