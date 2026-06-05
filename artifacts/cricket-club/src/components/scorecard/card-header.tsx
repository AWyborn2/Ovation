import type { ScorecardTeam } from "@workspace/scorecard";
import { TeamLogo } from "./team-logo";

/** Branded header strip shared by the batting and bowling cards. */
export function CardHeader({
  team,
  inningsLabel,
}: {
  team: ScorecardTeam;
  inningsLabel: string;
}) {
  const c = team.colors;
  const [labelTop, ...labelRest] = inningsLabel.split(" ");
  return (
    <div className="flex items-stretch" style={{ background: c.primary, borderBottom: `3px solid ${c.secondary}` }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 72,
          minWidth: 72,
          background: `linear-gradient(135deg, ${c.primary} 0%, rgba(0,0,0,0.35) 100%)`,
          borderRight: `1px solid ${c.borderColor}`,
          padding: "10px 8px",
        }}
      >
        <TeamLogo
          logoUrl={team.logoUrl}
          teamName={team.name}
          primaryColor={c.primary}
          secondaryColor={c.secondary}
          size={52}
        />
      </div>

      <div className="flex flex-1 items-center justify-center py-3 px-4">
        <div className="text-center">
          <span
            className="tracking-widest uppercase block"
            style={{ color: c.text, fontSize: "clamp(18px, 3.5vw, 28px)", fontWeight: 800, letterSpacing: "0.14em" }}
          >
            {team.name}
          </span>
          {team.shortName && (
            <span className="block" style={{ color: c.text, fontSize: 10, opacity: 0.5, letterSpacing: "0.1em" }}>
              {team.shortName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center px-3 py-2" style={{ background: c.secondary, minWidth: 80 }}>
        <div className="text-center" style={{ color: c.accentText }}>
          <div style={{ fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.1 }}>
            {labelTop}
          </div>
          <div style={{ fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.1 }}>
            {labelRest.join(" ")}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render the extras summary, e.g. "EXTRAS 14 (3W 1NB 10 b/lb)". */
export function extrasParts(extras: { wides: number; noBalls: number; other: number }): string[] {
  const parts: string[] = [];
  if (extras.wides) parts.push(`${extras.wides}W`);
  if (extras.noBalls) parts.push(`${extras.noBalls}NB`);
  if (extras.other) parts.push(`${extras.other} b/lb`);
  return parts;
}
