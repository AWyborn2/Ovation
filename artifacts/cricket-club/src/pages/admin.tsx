import { Link } from "wouter";
import { HelpCircle, Palette } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center justify-between gap-4 flex-wrap py-4">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Finish setting up your club</p>
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
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      <FinishSetupBanner />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold">Admin</h1>
          <p className="text-muted-foreground mt-1">
            Manage club data and the public honour boards.
          </p>
        </div>
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
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, idx) => {
          const Icon = navIcon(t.iconKey);
          const card = (
            <Card className="hover:border-primary cursor-pointer transition-colors h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {Icon && <Icon className="h-5 w-5 text-primary" />}
                  {t.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{t.description}</CardContent>
            </Card>
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
    </div>
  );
}
