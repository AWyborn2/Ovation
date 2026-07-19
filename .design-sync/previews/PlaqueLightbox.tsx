import { PlaqueLightbox } from "@workspace/cricket-club";

type PlaqueData = {
  season: string;
  grade: string;
  captain: string;
  players: string[];
};

const PLAQUES: PlaqueData[] = [
  {
    season: "2018/19",
    grade: "B GRADE",
    captain: "M. Okafor",
    players: ["M. Okafor (c)", "T. Reeves", "S. Naidoo", "J. Carter", "L. Whitfield"],
  },
  {
    season: "2023/24",
    grade: "A GRADE",
    captain: "J. Carter",
    players: ["J. Carter (c)", "D. Mercer", "A. Rennick", "P. Sandoval", "H. Okafor"],
  },
  {
    season: "2024/25",
    grade: "T20",
    captain: "D. Mercer",
    players: ["D. Mercer (c)", "R. Alvey", "K. Tran", "B. Osei", "N. Fairbrother"],
  },
];

// Honest stand-in for the premiership plaque render prop: a 151x259 metallic
// plaque face (the lightbox scales it up itself).
function Plaque({ item }: { item: PlaqueData }) {
  return (
    <div
      style={{
        width: 151,
        height: 259,
        boxSizing: "border-box",
        background: "linear-gradient(160deg, #2b2118 0%, #171310 60%, #241c14 100%)",
        border: "3px solid #b98a2e",
        borderRadius: 6,
        color: "#e9d8a6",
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        fontFamily: "serif",
      }}
    >
      <div style={{ fontSize: 8, letterSpacing: 2 }}>SEACREST CC</div>
      <div
        style={{
          margin: "8px 0 2px",
          fontSize: 15,
          fontWeight: 700,
          color: "#f3e3ae",
        }}
      >
        {item.season}
      </div>
      <div style={{ fontSize: 9, letterSpacing: 1.5 }}>{item.grade}</div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>PREMIERS</div>
      <div
        style={{
          width: 40,
          borderTop: "1px solid #b98a2e",
          marginBottom: 6,
        }}
      />
      <div style={{ fontSize: 7.5, lineHeight: 1.7 }}>
        {item.players.map((p) => (
          <div key={p}>{p}</div>
        ))}
      </div>
      <div style={{ marginTop: "auto", fontSize: 6.5, opacity: 0.7 }}>
        Captain — {item.captain}
      </div>
    </div>
  );
}

// Full-screen premiership plaque gallery: middle item so both nav arrows are
// enabled, with the Save / Share export action visible.
export function PremiershipPlaqueLightbox() {
  return (
    <div style={{ minHeight: 460 }}>
      <PlaqueLightbox
        items={PLAQUES}
        index={1}
        renderItem={(item: PlaqueData) => <Plaque item={item} />}
        onIndexChange={() => {}}
        onClose={() => {}}
        exportFileName={(item: PlaqueData) =>
          `seacrest-premiers-${item.season.replace("/", "-")}`
        }
      />
    </div>
  );
}
