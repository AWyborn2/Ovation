import { Avatar, AvatarFallback, AvatarImage } from "@workspace/cricket-club";

const CARTER_IMG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMWUzYTJmIi8+PHRleHQgeD0iNDAiIHk9IjUzIiBmb250LXNpemU9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIj5KQzwvdGV4dD48L3N2Zz4=";

const MARSH_IMG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjM2IzZjY2Ii8+PHRleHQgeD0iNDAiIHk9IjUzIiBmb250LXNpemU9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIj5UTTwvdGV4dD48L3N2Zz4=";

export function PlayerPhoto() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar>
        <AvatarImage src={CARTER_IMG} alt="J. Carter" />
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>J. Carter</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>512 runs this season</div>
      </div>
    </div>
  );
}

export function TeamRow() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Avatar style={{ marginRight: -8, zIndex: 3 }} className="ring-2 ring-background">
        <AvatarImage src={CARTER_IMG} alt="J. Carter" />
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>
      <Avatar style={{ marginRight: -8, zIndex: 2 }} className="ring-2 ring-background">
        <AvatarImage src={MARSH_IMG} alt="T. Marsh" />
        <AvatarFallback>TM</AvatarFallback>
      </Avatar>
      <Avatar style={{ zIndex: 1 }} className="ring-2 ring-background">
        <AvatarFallback>+9</AvatarFallback>
      </Avatar>
      <span style={{ fontSize: 13, marginLeft: 12, opacity: 0.8 }}>
        First Grade squad · Round 8
      </span>
    </div>
  );
}
