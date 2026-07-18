import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemSeparator,
  Button,
} from "@workspace/cricket-club";

export function RowWithFooter() {
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
            <ItemDescription>Right-hand bat · 142 matches</ItemDescription>
          </ItemContent>
          <ItemFooter>
            <span className="text-xs text-muted-foreground">
              Last innings: 74 (58) vs Dunes CC
            </span>
            <Button size="sm" variant="ghost">
              Full history
            </Button>
          </ItemFooter>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>Miles Okafor</ItemTitle>
            <ItemDescription>Leg-spin · 87 matches</ItemDescription>
          </ItemContent>
          <ItemFooter>
            <span className="text-xs text-muted-foreground">
              Last spell: 3/24 (8) vs Mandurah
            </span>
            <Button size="sm" variant="ghost">
              Full history
            </Button>
          </ItemFooter>
        </Item>
      </ItemGroup>
    </div>
  );
}
