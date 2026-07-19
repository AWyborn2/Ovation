import { Avatar, AvatarFallback, AvatarImage } from "@workspace/cricket-club";

const CARTER_IMG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMWUzYTJmIi8+PHRleHQgeD0iNDAiIHk9IjUzIiBmb250LXNpemU9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIj5KQzwvdGV4dD48L3N2Zz4=";

export function WithImage() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar>
        <AvatarImage src={CARTER_IMG} alt="J. Carter" />
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>J. Carter</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>First Grade · Captain</div>
      </div>
    </div>
  );
}

export function FallbackInitials() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Avatar>
        <AvatarImage src="/players/missing-photo.jpg" alt="T. Marsh" />
        <AvatarFallback>TM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RH</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>SD</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar className="h-6 w-6 text-[10px]">
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <Avatar className="h-14 w-14 text-lg">
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
    </div>
  );
}
