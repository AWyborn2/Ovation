import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  Badge,
} from "@workspace/cricket-club";

export function TitledRows() {
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
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>
              Miles Okafor
              <Badge variant="secondary">Captain</Badge>
            </ItemTitle>
            <ItemDescription>
              ItemTitle lays out inline extras (badges) beside the name.
            </ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
