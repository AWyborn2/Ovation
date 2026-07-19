import { QuickLink } from "@workspace/cricket-club";
import { Trophy, BarChart3, Users } from "lucide-react";

export function LinkRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
        gap: 12,
        maxWidth: 640,
      }}
    >
      <QuickLink
        href="/honour-boards"
        icon={Trophy}
        title="Honour boards"
        desc="Career runs, wickets and games milestones."
      />
      <QuickLink
        href="/records"
        icon={BarChart3}
        title="Club records"
        desc="Best figures, highest scores and partnerships."
      />
      <QuickLink
        href="/players"
        icon={Users}
        title="Players"
        desc="Every player to pull on the Seacrest CC cap."
      />
    </div>
  );
}
