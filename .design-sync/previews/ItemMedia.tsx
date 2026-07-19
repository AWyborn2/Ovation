import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
} from "@workspace/cricket-club";

function TrophyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

const AVATAR_SVG =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#1e3a5f"/><circle cx="40" cy="30" r="14" fill="#9fb8d1"/><ellipse cx="40" cy="68" rx="24" ry="18" fill="#9fb8d1"/></svg>',
  );

export function MediaVariantsList() {
  return (
    <div style={{ maxWidth: 480 }}>
      <ItemGroup className="rounded-md border">
        <Item>
          <ItemMedia>
            <div className="flex size-10 items-center justify-center rounded-sm bg-primary/10 text-sm font-semibold text-primary">
              JC
            </div>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Jasper Carter</ItemTitle>
            <ItemDescription>Default media — initials block</ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemMedia variant="icon">
            <TrophyIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>2024/25 A-Grade premiers</ItemTitle>
            <ItemDescription>Icon media — honour board entry</ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemMedia variant="image">
            <img src={AVATAR_SVG} alt="" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Theo Vanderberg</ItemTitle>
            <ItemDescription>Image media — player photo</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
