import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemGroup,
  ItemSeparator,
  Badge,
} from "@workspace/cricket-club";

export function RowWithHeader() {
  return (
    <div style={{ maxWidth: 480 }}>
      <ItemGroup className="rounded-md border">
        <Item>
          <ItemHeader>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Round 12 · Bortolo Reserve
            </span>
            <Badge variant="secondary">Completed</Badge>
          </ItemHeader>
          <ItemMedia>
            <div className="flex size-10 items-center justify-center rounded-sm bg-primary/10 text-sm font-semibold text-primary">
              SC
            </div>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Seacrest CC vs Dunes CC</ItemTitle>
            <ItemDescription>
              Seacrest 8/214 def. Dunes 187 · A-Grade
            </ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemHeader>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Round 13 · Peelhurst Oval
            </span>
            <Badge variant="outline">Upcoming</Badge>
          </ItemHeader>
          <ItemContent>
            <ItemTitle>Seacrest CC vs Mandurah</ItemTitle>
            <ItemDescription>Saturday 1:00 pm · A-Grade</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
