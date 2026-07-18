import { ScrollArea } from "@workspace/cricket-club";

const dismissals = [
  "R1 · c Hooper b Nguyen · 12",
  "R1 · b Carter · 45",
  "R2 · lbw b Nguyen · 8",
  "R2 · run out (Rimmer) · 33",
  "R3 · c & b Della Bosca · 21",
  "R3 · st Hooper b Rimmer · 4",
  "R4 · c Carter b Nguyen · 67",
  "R4 · b Della Bosca · 15",
  "R5 · c Rimmer b Carter · 29",
  "R5 · lbw b Nguyen · 0",
  "R6 · c Hooper b Rimmer · 52",
  "R6 · b Nguyen · 18",
  "R7 · run out (Hooper) · 41",
  "R7 · c Della Bosca b Carter · 7",
  "R8 · st Hooper b Rimmer · 23",
];

export function WicketLog() {
  return (
    <ScrollArea
      type="always"
      style={{
        height: 200,
        width: 300,
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
      }}
    >
      <div style={{ padding: 16 }}>
        <h4
          style={{
            margin: 0,
            marginBottom: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Season wicket log
        </h4>
        {dismissals.map((line) => (
          <div
            key={line}
            style={{
              fontSize: 13,
              padding: "6px 0",
              borderBottom: "1px solid hsl(var(--border))",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
