import { CardSurface, ScaledCard } from "@workspace/cricket-club";

/** The bare 384x800 card shell — brand gradient, gold border, rounded corners.
 *  Scaled 0.75 so the full 800px surface fits the capture cell. */
export function EmptySurface() {
  return (
    <div style={{ padding: 8 }}>
      <ScaledCard scale={0.75}>
      <CardSurface>
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.5 }}>
            Seacrest CC
          </div>
          <div style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.35)" }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Official Player Card
          </div>
        </div>
      </CardSurface>
      </ScaledCard>
    </div>
  );
}
