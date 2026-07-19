import { Separator } from "@workspace/cricket-club";

export function SectionBreak() {
  return (
    <div style={{ maxWidth: 360 }}>
      <div>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Batting &mdash; 2025/26
        </h4>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>
          486 runs at 44.2, best 112* vs Pinjarra
        </p>
      </div>
      <Separator style={{ margin: "16px 0" }} />
      <div>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Bowling &mdash; 2025/26
        </h4>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>
          21 wickets at 18.6, best 5/24
        </p>
      </div>
    </div>
  );
}

export function InlineStats() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 24,
        fontSize: 14,
      }}
    >
      <span>First Grade</span>
      <Separator orientation="vertical" />
      <span>Round 14</span>
      <Separator orientation="vertical" />
      <span>2025/26</span>
    </div>
  );
}
