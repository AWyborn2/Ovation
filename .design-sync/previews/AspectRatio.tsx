import { AspectRatio } from "@workspace/cricket-club";

export function MatchPhotoSlot() {
  return (
    <div style={{ maxWidth: 400 }}>
      <AspectRatio ratio={16 / 9}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 8,
            background:
              "linear-gradient(135deg, hsl(215 25% 27%), hsl(215 20% 45%))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            color: "white",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            Premiership team photo
          </span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            First Grade &middot; 2025/26 &middot; 16:9
          </span>
        </div>
      </AspectRatio>
    </div>
  );
}

export function SquareBadgeSlot() {
  return (
    <div style={{ maxWidth: 180 }}>
      <AspectRatio ratio={1}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 8,
            border: "1px dashed hsl(215 15% 60%)",
            background: "hsl(215 20% 96%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "hsl(215 15% 40%)",
            fontSize: 13,
            textAlign: "center",
            padding: 12,
          }}
        >
          Club crest 1:1
        </div>
      </AspectRatio>
    </div>
  );
}
