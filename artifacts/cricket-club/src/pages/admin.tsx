import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TILES = [
  { href: "/admin/users", title: "Admin users", body: "Add, rename, reset passwords, remove admins." },
  { href: "/admin/stats", title: "Stats", body: "Search, edit and delete per-grade stat rows." },
  { href: "/admin/players", title: "Players", body: "Rename, mark deceased, merge duplicates, delete." },
  { href: "/admin/premierships", title: "Premierships", body: "Add and edit premiership records and squads." },
  { href: "/admin/honour-boards", title: "Honour boards", body: "Edit board titles and pin/hide overrides." },
  { href: "/admin/milestone-board", title: "Milestone board", body: "Show recent / approaching milestones and set thresholds." },
  { href: "/admin/import", title: "Import CSV", body: "Upload a PlayCricket combined CSV for a season." },
  { href: "/admin/caps", title: "Cap register", body: "A Grade cap numbers and links." },
  { href: "/admin/life-members", title: "Life members", body: "Honour-board life members." },
  { href: "/admin/awards", title: "Awards", body: "Create club awards and record past winners." },
  { href: "/admin/social", title: "Social cards", body: "Share-card factory: sizes, sponsors, captions." },
  { href: "/admin/social/queue", title: "Social queue", body: "Auto-detected milestones, round-ups, tracked links." },
];

export default function AdminHub() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Admin</h1>
        <p className="text-muted-foreground mt-1">Manage club data and the public honour boards.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="hover:border-primary cursor-pointer transition-colors">
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{t.body}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
