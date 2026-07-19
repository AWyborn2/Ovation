import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  Button,
} from "@workspace/cricket-club";

export function ContentBetweenMediaAndActions() {
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
          <ItemActions>
            <Button size="sm" variant="outline">
              View
            </Button>
          </ItemActions>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>Miles Okafor</ItemTitle>
            <ItemDescription>
              ItemContent fills the row — title and description stack inside it
              even without media or actions.
            </ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemContent>
            <ItemTitle>Theo Vanderberg</ItemTitle>
            <ItemDescription>Wicket-keeper · 205 matches</ItemDescription>
          </ItemContent>
          <ItemContent className="items-end">
            <ItemTitle>4,821 runs</ItemTitle>
            <ItemDescription>Career</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
}
