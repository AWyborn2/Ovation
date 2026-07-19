import { StatTile } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 348,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: 18,
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

/** Default-size tiles in the card front's 2-up grid. */
export function FrontStatGrid() {
  return (
    <div style={panel}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatTile label="Matches" value={142} />
        <StatTile label="Runs" value={4182} />
        <StatTile label="Wickets" value={87} />
        <StatTile label="High Score" value="124*" />
        <div style={{ gridColumn: "1 / -1" }}>
          <StatTile label="Best Bowling" value="5/23" />
        </div>
      </div>
    </div>
  );
}

/** Big variant used in the animation's phase frames. */
export function BigPhaseTiles() {
  return (
    <div style={panel}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatTile label="Runs" value={4182} big />
        <StatTile label="Bat Avg" value={34.6} big />
        <StatTile label="Wickets" value={87} big />
        <StatTile label="Bowl Avg" value={21.4} big />
      </div>
    </div>
  );
}
