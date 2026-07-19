import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@workspace/cricket-club";

export function AdminMenubar() {
  return (
    <div style={{ minHeight: 360, padding: 24 }}>
      <Menubar value="season">
        <MenubarMenu value="season">
          <MenubarTrigger>Season</MenubarTrigger>
          <MenubarContent>
            <MenubarLabel>2025/26 season</MenubarLabel>
            <MenubarSeparator />
            <MenubarItem>
              Edit season
              <MenubarShortcut>⌘E</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Export CSV
              <MenubarShortcut>⌘⇧E</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarCheckboxItem checked>Include finals</MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem className="text-destructive">Delete import</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="teams">
          <MenubarTrigger>Teams</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>1st Grade</MenubarItem>
            <MenubarItem>2nd Grade</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu value="reports">
          <MenubarTrigger>Reports</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Batting</MenubarItem>
            <MenubarItem>Bowling</MenubarItem>
            <MenubarItem>Records</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}
