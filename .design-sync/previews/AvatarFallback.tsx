import { Avatar, AvatarFallback, AvatarImage } from "@workspace/cricket-club";

export function Initials() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Avatar>
        <AvatarImage src="/players/broken-link.jpg" alt="J. Carter" />
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>TM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RH</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function InPlayerList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300 }}>
      {[
        { initials: "JC", name: "J. Carter", detail: "86 (54) vs Mandurah" },
        { initials: "TM", name: "T. Marsh", detail: "4/23 off 8 overs" },
        { initials: "SD", name: "S. Dawson", detail: "2 catches, 1 run out" },
      ].map((p) => (
        <div key={p.initials} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Avatar className="h-8 w-8 text-xs">
            <AvatarFallback>{p.initials}</AvatarFallback>
          </Avatar>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{p.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
