import { PerfBar } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 348,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: "20px 22px",
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

/** Career performance bars at low, mid and near-full fill. */
export function CareerFormBars() {
  return (
    <div style={panel}>
      <PerfBar label="Centuries" value={3} max={5} />
      <PerfBar label="Half-Centuries" value={24} max={28} />
      <PerfBar label="Wickets" value={87} max={100} />
      <PerfBar label="5-Wicket Hauls" value={1} max={5} />
    </div>
  );
}
