import { PhaseTitle } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 348,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: "22px 22px 10px",
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

/** Centred gold-tabbed phase headings from the card animation. */
export function PhaseHeadings() {
  return (
    <div style={panel}>
      <PhaseTitle>Career Statistics</PhaseTitle>
      <PhaseTitle>Batting</PhaseTitle>
      <PhaseTitle>Awards</PhaseTitle>
    </div>
  );
}
