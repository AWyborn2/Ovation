import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { navIcon } from "@/lib/nav-icons";

const TILES_FALLBACK: ResolvedNavItem[] = [
  { label: "Admin users", target: "/admin/users", isExternal: false, iconKey: "userCog", description: "Add, rename, reset passwords, remove admins." },
  { label: "Stats", target: "/admin/stats", isExternal: false, iconKey: "barChart3", description: "Search, edit and delete per-grade stat rows." },
  { label: "Players", target: "/admin/players", isExternal: false, iconKey: "users", description: "Rename, mark deceased, merge duplicates, delete." },
  { label: "Premierships", target: "/admin/premierships", isExternal: false, iconKey: "crown", description: "Add and edit premiership records and squads." },
  { label: "Honour boards", target: "/admin/honour-boards", isExternal: false, iconKey: "scrollText", description: "Edit board titles and pin/hide overrides." },
  { label: "Milestone board", target: "/admin/milestone-board", isExternal: false, iconKey: "medal", description: "Show recent / approaching milestones and set thresholds." },
  { label: "Matches page display", target: "/admin/match-display", isExternal: false, iconKey: "clipboardList", description: "Default grade/season, grade menu order, round order." },
  { label: "Import CSV", target: "/admin/import", isExternal: false, iconKey: "upload", description: "Upload a PlayCricket combined CSV for a season." },
  { label: "Cap register", target: "/admin/caps", isExternal: false, iconKey: "ticket", description: "A Grade cap numbers and links." },
  { label: "Life members", target: "/admin/life-members", isExternal: false, iconKey: "star", description: "Honour-board life members." },
  { label: "Awards", target: "/admin/awards", isExternal: false, iconKey: "award", description: "Create club awards and record past winners." },
  { label: "Team of the Decade", target: "/admin/team-of-decade", isExternal: false, iconKey: "trophy", description: "Curate best-XI honour boards with draft/publish." },
  { label: "Junior office bearers", target: "/admin/junior-committee", isExternal: false, iconKey: "baby", description: "Season-by-season junior committee (separate from seniors)." },
  { label: "Social cards", target: "/admin/social", isExternal: false, iconKey: "image", description: "Share-card factory: sizes, sponsors, captions." },
  { label: "Create a card", target: "/admin/social/create", isExternal: false, iconKey: "image", description: "Build a Match Summary card from a match or by hand." },
  { label: "Social queue", target: "/admin/social/queue", isExternal: false, iconKey: "listChecks", description: "Auto-detected milestones, round-ups, tracked links." },
  { label: "Navigation & menus", target: "/admin/nav", isExternal: false, iconKey: "layoutGrid", description: "Configure menus and quick-link cards across the site." },
];

export default function AdminHub() {
  const tiles = useNavSurface("admin_tiles", TILES_FALLBACK);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Admin</h1>
        <p className="text-muted-foreground mt-1">Manage club data and the public honour boards.</p>
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
