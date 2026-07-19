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

function Initials({ text }: { text: string }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-sm bg-primary/10 text-sm font-semibold text-primary">
      {text}
    </div>
  );
}

export function PlayerListRows() {
  return (
    <div style={{ maxWidth: 480 }}>
      <ItemGroup className="rounded-md border">
        <Item>
          <ItemMedia>
            <Initials text="JC" />
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
          <ItemMedia>
            <Initials text="MO" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Miles Okafor</ItemTitle>
            <ItemDescription>Leg-spin · 87 matches</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="outline">
              View
            </Button>
          </ItemActions>
        </Item>
        <ItemSeparator />
        <Item>
          <ItemMedia>
            <Initials text="TV" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Theo Vanderberg</ItemTitle>
            <ItemDescription>Wicket-keeper · 205 matches</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="outline">
              View
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </div>
  );
}

export function ItemVariants() {
  return (
    <div style={{ maxWidth: 480 }} className="flex flex-col gap-3">
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Outline variant</ItemTitle>
          <ItemDescription>Seacrest CC · A-Grade</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted" size="sm">
        <ItemContent>
          <ItemTitle>Muted, small</ItemTitle>
          <ItemDescription>Dunes CC · B-Grade</ItemDescription>
        </ItemContent>
      </Item>
    </div>
  );
}
