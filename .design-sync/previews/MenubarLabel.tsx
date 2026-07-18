import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@workspace/cricket-club";

export function ReportsMenuWithLabel() {
  return (
    <div style={{ minHeight: 340, padding: 24 }}>
      <Menubar value="reports">
        <MenubarMenu value="season">
          <MenubarTrigger>Season</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Edit season</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="reports">
          <MenubarTrigger>Reports</MenubarTrigger>
          <MenubarContent>
            <MenubarLabel>Leaderboards</MenubarLabel>
            <MenubarSeparator />
            <MenubarItem>
              Batting
              <MenubarShortcut>⌘1</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Bowling
              <MenubarShortcut>⌘2</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarLabel>Honour boards</MenubarLabel>
            <MenubarSeparator />
            <MenubarItem>Premierships</MenubarItem>
            <MenubarItem>Club records</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}
