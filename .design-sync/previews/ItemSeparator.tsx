import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
} from "@workspace/cricket-club";

export function SeparatedRows() {
  return (
    <div style={{ maxWidth: 480 }}>
      <ItemGroup className="rounded-md border">
        <Item>
          <ItemContent>
            <ItemTitle>Jasper Carter</ItemTitle>
            <ItemDescription>Right-hand bat · 142 matches</ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>Miles Okafor</ItemTitle>
            <ItemDescription>Leg-spin · 87 matches</ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>Theo Vanderberg</ItemTitle>
            <ItemDescription>Wicket-keeper · 205 matches</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
