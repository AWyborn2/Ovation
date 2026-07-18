import { StarRow } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 320,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: "20px 24px",
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
  display: "grid",
  gap: 16,
};

const caption: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.6)",
  textAlign: "center",
  marginBottom: 4,
};

/** 1-5 star ratings on the card's dark surface — filled vs outlined stars. */
export function RatingScale() {
  return (
    <div style={panel}>
      <div>
        <div style={caption}>Club legend — 5 stars</div>
        <StarRow rating={5} />
      </div>
      <div>
        <div style={caption}>First-team regular — 4 stars</div>
        <StarRow rating={4} />
      </div>
      <div>
        <div style={caption}>Rising junior — 2 stars</div>
        <StarRow rating={2} />
      </div>
    </div>
  );
}
