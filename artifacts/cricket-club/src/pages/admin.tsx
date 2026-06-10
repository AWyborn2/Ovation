import { Link } from "wouter";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { useGetTourContent } from "@workspace/api-client-react";
import { navIcon } from "@/lib/nav-icons";
import { launchAdminTour } from "@/lib/tour";

const TILES_FALLBACK: ResolvedNavItem[] = [
  { label: "Social Media", target: "/admin/social", isExternal: false, iconKey: "image", description: "Share-card factory, card builders, junior cards and the review queue." },
  { label: "Display & Settings", target: "/admin/settings", isExternal: false, iconKey: "settings", description: "Defaults for Matches, Records, trading cards, honour & milestone boards, junior matches and site navigation." },
  { label: "People", target: "/admin/people", isExternal: false, iconKey: "users", description: "Players, stats, committee, captains, junior office bearers and non-player officials." },
  { label: "Honours & Records", target: "/admin/honours", isExternal: false, iconKey: "trophy", description: "Premierships, awards, Team of the Decade, cap register, life members and junior premierships." },
  { label: "Import CSV", target: "/admin/import", isExternal: false, iconKey: "upload", description: "Upload a PlayCricket combined CSV or a single match scorecard." },
  { label: "Admin users", target: "/admin/users", isExternal: false, iconKey: "userCog", description: "Add, rename, reset passwords, remove admins." },
];

export default function AdminHub() {
  const tiles = useNavSurface("admin_tiles", TILES_FALLBACK);
  const tourContentQ = useGetTourContent();
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold">Admin</h1>
          <p className="text-muted-foreground mt-1">Manage club data and the public honour boards.</p>
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
            <a key={`${t.target}-${idx}`} href={t.target} target="_blank" rel="noopener noreferrer">{card}</a>
          ) : (
            <Link key={`${t.target}-${idx}`} href={t.target}>{card}</Link>
          );
        })}
      </div>
    </div>
  );
}
